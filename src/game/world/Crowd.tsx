"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * GameScene.tsx와 같은 이유다. 아래에서 바뀌는 값(보행자 진행 상태, InstancedMesh
 * 행렬)은 전부 렌더 밖의 useFrame 콜백에서만 변경된다. 이를 setState로 올리면
 * 초당 60회 × 인원 수만큼 리렌더가 발생해 성능 예산을 지킬 수 없다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 보행자 렌더링.
 *
 * 몸통·머리·다리·팔을 각각 하나의 InstancedMesh로 묶는다. 인원이 몇 명이든
 * 드로우콜은 네 개다. 매 프레임 바뀌는 것은 행렬뿐이고 색은 시작할 때 한 번만 쓴다.
 *
 * 그림자를 끈 것은 의도다. 그림자 맵은 매 프레임 다시 그려지므로 캐스터를 수십 개
 * 늘리면 그림자 패스가 그만큼 무거워진다. 배경 인물이 낼 값이 아니다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { shortestAngleDelta, TAU } from "@/game/core/mathx";
import type { QualityLevel, QualityPreset } from "@/game/systems/quality";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { terrainHeight } from "@/game/world/terrain";
import {
  buildPedestrians,
  CROWD,
  PANTS_PALETTE,
  PED_BODY,
  SHIRT_PALETTE,
  SKIN_PALETTE,
  samplePerimeter,
  trackPerimeter,
} from "@/game/world/crowdLayout";

/** 품질 등급별 인원. 저사양에서 먼저 줄이는 것이 인스턴스 수다 */
const PEDESTRIAN_BUDGET: Record<QualityLevel, number> = {
  low: 16,
  medium: 36,
  high: 56,
};

/** 팔다리 흔들림의 최대 진폭(rad) */
const SWING_AMPLITUDE = 0.72;
/** 저감 모션에서 쓰는 진폭. 완전히 끄면 미끄러지듯 이동해 더 어색하다 */
const SWING_AMPLITUDE_REDUCED = 0.34;
/** 걸음마다 몸이 오르내리는 폭(m) */
const BOB_HEIGHT = 0.035;

interface PedestrianRuntime {
  /** 트랙 진행 거리 */
  u: number;
  phase: number;
  yaw: number;
  /** 컬링 상태. 접힌 인스턴스를 매 프레임 다시 쓰지 않으려고 들고 있다 */
  visible: boolean;
}

/**
 * 말 걸기에 필요한 것.
 *
 * 군중은 매 프레임 좌표를 계산하고 있으므로 가장 가까운 사람을 찾는 데
 * 추가 비용이 거의 없다. 플레이어 위치는 도시 스트리밍이 이미 쓰는 것과
 * 같은 객체를 받는다 — 좌표를 두 번 들고 다니지 않는다.
 */
export interface CrowdTalkLink {
  /** 플레이어 위치. City의 viewer와 같은 객체다 */
  viewer: { position: { x: number; z: number } };
  /**
   * 가장 가까운 주민을 여기 올려 둔다.
   *
   * **소비하지 않는다.** 간판 살펴보기와 같은 키를 쓰므로, 누가 반응할지는
   * 둘을 모두 아는 한 곳(PlayerRig)이 정해야 한다. 두 컴포넌트가 각자
   * 소비하면 같은 프레임에 서로의 줄을 덮어써 화면이 깜빡인다.
   */
  candidate: { index: number; distanceSquared: number };
}

export interface CrowdProps {
  quality: QualityPreset;
  reducedMotion: boolean;
  talk: CrowdTalkLink;
}

export function Crowd({ quality, reducedMotion, talk }: CrowdProps) {
  const { camera } = useThree();

  const specs = useMemo(
    () => buildPedestrians(PEDESTRIAN_BUDGET[quality.level]),
    [quality.level],
  );

  const runtime = useMemo<PedestrianRuntime[]>(
    () =>
      specs.map((spec) => {
        // 시작 방향을 트랙에 맞춰 둔다. 0으로 두면 첫 프레임에 전원이 제자리에서 돈다.
        const sample = samplePerimeter(spec.trackRadius, spec.startU, { x: 0, z: 0, yaw: 0 });
        return {
          u: spec.startU,
          phase: spec.startPhase,
          yaw: spec.direction > 0 ? sample.yaw : sample.yaw + Math.PI,
          visible: true,
        };
      }),
    [specs],
  );

  const torsoRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const legRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const frameIndex = useRef(0);

  const scratch = useMemo(
    () => ({
      // TrackSample과 모양이 같다. 캐스트를 두면 필드가 늘어나도 통과해 버린다.
      sample: { x: 0, z: 0, yaw: 0 },
      matrix: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      position: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      limbOffset: new THREE.Vector3(),
      yawQuat: new THREE.Quaternion(),
      limbQuat: new THREE.Quaternion(),
      pitchQuat: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
      torsoScale: new THREE.Vector3(
        PED_BODY.torsoWidth,
        PED_BODY.torsoHeight,
        PED_BODY.torsoDepth,
      ),
      headScale: new THREE.Vector3(PED_BODY.headSize, PED_BODY.headSize, PED_BODY.headSize),
      legScale: new THREE.Vector3(PED_BODY.legWidth, PED_BODY.legLength, PED_BODY.legDepth),
      armScale: new THREE.Vector3(PED_BODY.armWidth, PED_BODY.armLength, PED_BODY.armDepth),
    }),
    [],
  );

  // 색은 바뀌지 않으므로 한 번만 쓴다. 매 프레임 갱신하는 것은 행렬뿐이다.
  useLayoutEffect(() => {
    const torso = torsoRef.current;
    const head = headRef.current;
    const legs = legRef.current;
    const arms = armRef.current;
    if (!torso || !head || !legs || !arms) return;

    const color = new THREE.Color();

    specs.forEach((spec, index) => {
      color.set(SHIRT_PALETTE[spec.shirtTone % SHIRT_PALETTE.length]);
      torso.setColorAt(index, color);
      arms.setColorAt(index * 2, color);
      arms.setColorAt(index * 2 + 1, color);

      color.set(SKIN_PALETTE[spec.skinTone % SKIN_PALETTE.length]);
      head.setColorAt(index, color);

      color.set(PANTS_PALETTE[spec.pantsTone % PANTS_PALETTE.length]);
      legs.setColorAt(index * 2, color);
      legs.setColorAt(index * 2 + 1, color);
    });

    for (const mesh of [torso, head, legs, arms]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [specs]);

  useFrame((_, rawDelta) => {
    const torso = torsoRef.current;
    const head = headRef.current;
    const legs = legRef.current;
    const arms = armRef.current;
    if (!torso || !head || !legs || !arms) return;

    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    frameIndex.current += 1;
    const parity = frameIndex.current & 1;

    const cullSq = CROWD.cullDistance * CROWD.cullDistance;
    const halfRateSq = CROWD.halfRateDistance * CROWD.halfRateDistance;
    const amplitude = reducedMotion ? SWING_AMPLITUDE_REDUCED : SWING_AMPLITUDE;
    const bobHeight = reducedMotion ? 0 : BOB_HEIGHT;

    let dirty = false;
    // 말 걸 수 있는 가장 가까운 사람. 매 프레임 다시 찾는다 — 사람도 나도 움직인다
    let nearestSq = Number.POSITIVE_INFINITY;
    let nearestIndex = -1;
    const playerX = talk.viewer.position.x;
    const playerZ = talk.viewer.position.z;

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const state = runtime[index];

      // 스칼라 진행은 거리와 무관하게 항상 돈다. 멀다고 멈추면 다시 보일 때
      // 도시 전체의 보행자가 뒤처져 있어 오히려 눈에 띈다.
      const perimeter = trackPerimeter(spec.trackRadius);
      state.u = (state.u + spec.speed * spec.direction * dt) % perimeter;
      state.phase += (spec.speed / CROWD.strideLength) * dt * TAU;

      // 거리는 구역 중심으로 잰다. 같은 구역 보행자는 최대 25m 안에 있으므로
      // 개별 좌표로 재 봐야 판정이 달라지지 않는다.
      const dx = spec.cx - camera.position.x;
      const dz = spec.cz - camera.position.z;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq > cullSq) {
        if (state.visible) {
          state.visible = false;
          torso.setMatrixAt(index, scratch.hidden);
          head.setMatrixAt(index, scratch.hidden);
          legs.setMatrixAt(index * 2, scratch.hidden);
          legs.setMatrixAt(index * 2 + 1, scratch.hidden);
          arms.setMatrixAt(index * 2, scratch.hidden);
          arms.setMatrixAt(index * 2 + 1, scratch.hidden);
          dirty = true;
        }
        continue;
      }

      // 먼 보행자는 두 프레임에 한 번만 그린다 — 30Hz로 움직여도 구분되지 않는다.
      if (state.visible && distanceSq > halfRateSq && (index & 1) === parity) continue;
      state.visible = true;

      const sample = samplePerimeter(spec.trackRadius, state.u, scratch.sample);
      const targetYaw = spec.direction > 0 ? sample.yaw : sample.yaw + Math.PI;
      // 모서리에서 90도가 한 프레임에 바뀌면 튄다. 최단 방향으로 감쇠시킨다.
      state.yaw +=
        shortestAngleDelta(state.yaw, targetYaw) * (1 - Math.exp(-CROWD.turnLambda * dt));
      scratch.yawQuat.setFromAxisAngle(scratch.up, state.yaw);

      const swing = Math.sin(state.phase);
      const bob = Math.abs(swing) * bobHeight;
      const x = spec.cx + sample.x;
      const z = spec.cz + sample.z;

      /*
       * 컬링을 통과한 사람만 후보로 본다. 안 보이는 사람에게 말을 걸면
       * 허공에서 목소리가 난다.
       */
      const toPlayerX = x - playerX;
      const toPlayerZ = z - playerZ;
      const playerDistSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;
      if (playerDistSq < nearestSq) {
        nearestSq = playerDistSq;
        nearestIndex = index;
      }
      const hipY = CROWD.groundY + PED_BODY.hipHeight + bob;

      /*
       * 발밑 지면 높이를 더한다.
       *
       * 안 더하면 언덕 구간에서 시민이 **허리까지 땅에 묻히거나 공중을 걷는다.**
       * 걷는 위상·속도는 평지 기준 그대로 두어도 된다 — 경사에 따라 보폭까지
       * 맞추는 것은 이 거리에서 보이지 않는다.
       */
      const ground = terrainHeight(x, z);
      scratch.position.set(x, ground + hipY + PED_BODY.torsoOffsetY, z);
      scratch.matrix.compose(scratch.position, scratch.yawQuat, scratch.torsoScale);
      torso.setMatrixAt(index, scratch.matrix);

      scratch.position.set(x, ground + hipY + PED_BODY.headOffsetY, z);
      scratch.matrix.compose(scratch.position, scratch.yawQuat, scratch.headScale);
      head.setMatrixAt(index, scratch.matrix);

      for (let side = 0; side < 2; side += 1) {
        // side 0 = 왼쪽. 같은 쪽 팔과 다리는 서로 반대로 흔들린다.
        const lateral = side === 0 ? -1 : 1;
        const legPitch = (side === 0 ? -swing : swing) * amplitude;
        const armPitch = -legPitch * 1.1;

        scratch.offset
          .set(lateral * PED_BODY.legSpread, 0, 0)
          .applyQuaternion(scratch.yawQuat);

        scratch.pitchQuat.setFromAxisAngle(scratch.right, legPitch);
        scratch.limbQuat.multiplyQuaternions(scratch.yawQuat, scratch.pitchQuat);
        scratch.limbOffset
          .set(0, -PED_BODY.legLength / 2, 0)
          .applyQuaternion(scratch.limbQuat);
        scratch.position.set(
          x + scratch.offset.x + scratch.limbOffset.x,
          ground + hipY + scratch.limbOffset.y,
          z + scratch.offset.z + scratch.limbOffset.z,
        );
        scratch.matrix.compose(scratch.position, scratch.limbQuat, scratch.legScale);
        legs.setMatrixAt(index * 2 + side, scratch.matrix);

        scratch.offset
          .set(lateral * PED_BODY.armSpread, 0, 0)
          .applyQuaternion(scratch.yawQuat);

        scratch.pitchQuat.setFromAxisAngle(scratch.right, armPitch);
        scratch.limbQuat.multiplyQuaternions(scratch.yawQuat, scratch.pitchQuat);
        scratch.limbOffset
          .set(0, -PED_BODY.armLength / 2, 0)
          .applyQuaternion(scratch.limbQuat);
        scratch.position.set(
          x + scratch.offset.x + scratch.limbOffset.x,
          ground + hipY + PED_BODY.armOffsetY + scratch.limbOffset.y,
          z + scratch.offset.z + scratch.limbOffset.z,
        );
        scratch.matrix.compose(scratch.position, scratch.limbQuat, scratch.armScale);
        arms.setMatrixAt(index * 2 + side, scratch.matrix);
      }

      dirty = true;
    }

    /*
     * 가장 가까운 주민을 알린다. 고르고 소비하는 것은 PlayerRig의 몫이다 —
     * 간판과 같은 키를 쓰므로 둘을 아는 한 곳이 정해야 한다.
     *
     * 아무도 없으면 무한대를 올린다. 예전 값을 남기면 사람이 사라진 뒤에도
     * 말을 걸 수 있다.
     */
    talk.candidate.index = nearestIndex;
    talk.candidate.distanceSquared = nearestIndex >= 0 ? nearestSq : Number.POSITIVE_INFINITY;

    if (!dirty) return;
    torso.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  });

  if (specs.length === 0) return null;

  return (
    <group>
      {/*
        frustumCulled를 끈다. InstancedMesh의 경계구는 한 번 계산된 뒤 캐시되는데
        인스턴스가 매 프레임 움직이므로 캐시가 곧 틀린 값이 된다. 매 프레임 다시
        계산하는 비용이 드로우콜 네 개를 아끼는 이득보다 크다.
      */}
      <instancedMesh
        ref={torsoRef}
        args={[undefined, undefined, specs.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial />
      </instancedMesh>

      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, specs.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial />
      </instancedMesh>

      <instancedMesh
        ref={legRef}
        args={[undefined, undefined, specs.length * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial />
      </instancedMesh>

      <instancedMesh
        ref={armRef}
        args={[undefined, undefined, specs.length * 2]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial />
      </instancedMesh>
    </group>
  );
}
