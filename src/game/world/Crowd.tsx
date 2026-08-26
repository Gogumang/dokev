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
import { emoteCue, isEmoting, type EmoteState } from "@/game/player/emote";
import { combatPressure } from "@/game/combat/combatLink";
import { barPhase, beatPhase } from "@/game/systems/audio/music";
import { terrainHeight } from "@/game/world/terrain";
import type { TimeOfDayId } from "@/game/world/timeOfDay";
import {
  buildPedestrians,
  buildPlaygroundKids,
  PLAYGROUND,
  CROWD,
  crowdCountFor,
  crowdReaction,
  fleeDirection,
  joinsDance,
  PANTS_PALETTE,
  PED_BODY,
  samplePerimeter,
  SHIRT_PALETTE,
  SKIN_PALETTE,
  trackPerimeter,
  type CrowdReaction,
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
  /**
   * 지금 플레이어의 춤에 합류한 상태인지.
   *
   * 판정 자체는 순수 함수가 매 프레임 다시 한다(`joinsDance`). 여기 들고 있는
   * 것은 **다음 프레임의 「나아갈까」가 읽기 위해서**다 — 자리를 구하기 전에
   * 필요한 값이라 이번 프레임의 답을 남겨 둔다.
   */
  dancing: boolean;
  /**
   * 지난 프레임에 무엇에 반응하고 있었는지, 그리고 물러설 쪽.
   *
   * 자리를 구하기 전에 「나아갈까」를 정해야 해서 이번 프레임의 답을 남긴다 —
   * `dancing`과 같은 이유다.
   */
  reaction: CrowdReaction;
  fleeSign: 1 | -1;
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

/*
 * 춤은 **곡의 박**으로 흔든다.
 *
 * 여기서 Hz를 따로 정하고 있었다. 그러면 시민이 흔드는 박과 BGM이 각자 돌아
 * 「같이 추는 것」으로 보이지 않는다 — 원작 연출이 곡 위에 놓여 있다는 관찰
 * (DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접 확인한 것 (2026-08-24)」)의 요지가
 * 그것이다. 정본은 `systems/audio/music.ts`의 빠르기다.
 */

/** 마디 첫 박에서 몸을 얼마나 더 쓰는지(비율) */
const DANCE_BAR_ACCENT = 0.6;

export interface CrowdProps {
  quality: QualityPreset;
  reducedMotion: boolean;
  talk: CrowdTalkLink;
  /**
   * 지금 시간대. **밤에는 거리가 빈다.**
   *
   * 배치를 다시 만들지 않고 목록 앞에서부터 세어 나머지를 숨긴다 — 시간대가
   * 바뀔 때마다 새로 뽑으면 같은 사람이 다른 자리에서 다시 나타난다.
   */
  timeOfDay: TimeOfDayId;
  /**
   * 놀이터 한복판 좌표(`layout.playSpots`). 여기 둘러서서 논다.
   *
   * 좌표를 여기서 계산하지 않는다 — 놀이기구를 놓은 쪽(`park`)이 정한 것을
   * 그대로 받는다. 두 곳에서 각자 구하면 아이들이 미끄럼틀 옆 잔디에서 논다.
   */
  playSpots: readonly { x: number; z: number }[];
  /**
   * 플레이어의 감정 표현. **객체를 그대로 받는다** — 매 프레임 바뀌는 값이라
   * 복사하면 한 프레임 늦게 반응하고, 프롭으로 값을 내리면 초당 60회 리렌더가 난다.
   */
  emote: EmoteState;
  /**
   * 지도에 찍히는 적 좌표. **말 걸기 계약에 얹지 않는다** — 저쪽은 「누구에게
   * 말을 걸까」이고 이쪽은 「어디가 위험한가」다. 한 객체에 섞으면 다음 사람이
   * 군중이 무엇을 아는지 읽을 수 없다.
   */
  combat: { enemyBlips: Float32Array; enemyBlipCount: number };
}

export function Crowd({
  quality,
  reducedMotion,
  talk,
  timeOfDay,
  emote,
  combat,
  playSpots,
}: CrowdProps) {
  const { camera } = useThree();

  const specs = useMemo(() => {
    const budget = PEDESTRIAN_BUDGET[quality.level];
    /*
     * 놀이터 아이들을 **앞에** 둔다. 시간대별 인원(`crowdCountFor`)이 목록
     * 앞에서부터 세므로, 뒤에 두면 밤에 제일 먼저 사라진다 — 놀이터가 밤에
     * 비는 것은 맞지만, 낮에도 저사양 기기에서 통째로 사라지는 것은 다르다.
     */
    const kids = buildPlaygroundKids(playSpots, Math.round(budget * 0.2));
    return [...kids, ...buildPedestrians(budget - kids.length)];
  }, [quality.level, playSpots]);

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
          dancing: false,
          reaction: "none",
          fleeSign: 1,
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
      torsoScale: new THREE.Vector3(PED_BODY.torsoWidth, PED_BODY.torsoHeight, PED_BODY.torsoDepth),
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

  useFrame(({ clock }, rawDelta) => {
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

    /*
     * 플레이어가 **춤을** 추는 중인가. 손 흔들기·앉기에는 아무도 따라 하지
     * 않는다 — 따라 하면 그건 춤이 아니라 고장으로 보인다.
     */
    const playerDancing = isEmoting(emote) && emoteCue(emote.index) === "dance";
    const danceSwing = Math.sin(beatPhase(clock.elapsedTime) * TAU);
    /*
     * 마디 첫 박을 더 크게 흔든다. 매 박이 똑같으면 기계처럼 보인다 — 사람은
     * 마디의 머리에서 몸을 더 쓴다.
     */
    const danceAccent = 1 + DANCE_BAR_ACCENT * (1 - barPhase(clock.elapsedTime));

    /*
     * 전투가 얼마나 가까운가. **플레이어 자리에서** 잰다 — 싸움은 그 근처에서
     * 벌어지고, 보행자 각자가 얼마나 가까운지는 아래에서 따로 본다.
     */
    const pressure = combatPressure(
      combat.enemyBlips,
      combat.enemyBlipCount,
      playerX,
      playerZ,
      false,
      CROWD.fleeRadius,
    );

    const present = crowdCountFor(specs.length, timeOfDay);

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const state = runtime[index];

      /*
       * 시간대가 정한 인원 밖은 **거리에 없는 사람**이다. 컬링과 같은 길로
       * 숨긴다 — 안 그러면 밤에 사람이 남아 있는 자리에 그림자만 선다.
       */
      const offDuty = index >= present;

      // 스칼라 진행은 거리와 무관하게 항상 돈다. 멀다고 멈추면 다시 보일 때
      // 도시 전체의 보행자가 뒤처져 있어 오히려 눈에 띈다.
      /*
       * **걷는 사람만 나아간다.** 앉아 있거나 이야기 중인 사람이 트랙을 따라
       * 미끄러지면 앉은 채로 이동하는 그림이 된다.
       */
      const fleeing = state.reaction === "flee";
      /*
       * 노는 사람은 나아가지 않고 **위상만 돈다.** 걷기와 같은 위상을 쓰므로
       * 팔다리가 그대로 흔들리고, 아래에서 그 흔들림을 높이로 바꿔 폴짝이게
       * 한다 — 새 애니메이션 경로를 만들지 않는다.
       */
      const playing = spec.activity === "play" && !fleeing && !state.dancing;
      if (playing) state.phase += PLAYGROUND.hopRate * dt;

      if (fleeing || (spec.activity === "walk" && !state.dancing)) {
        /*
         * 물러설 때는 **앉아 있던 사람도 일어나 걷는다.** 로봇이 코앞인데
         * 벤치에 앉아 있으면 그건 반응이 아니라 배경이다.
         */
        const perimeter = trackPerimeter(spec.trackRadius);
        const heading = fleeing ? state.fleeSign : spec.direction;
        const pace = fleeing ? spec.speed * CROWD.fleeSpeedScale : spec.speed;
        state.u = (state.u + pace * heading * dt) % perimeter;
        state.phase += (pace / CROWD.strideLength) * dt * TAU;
      }

      // 거리는 구역 중심으로 잰다. 같은 구역 보행자는 최대 25m 안에 있으므로
      // 개별 좌표로 재 봐야 판정이 달라지지 않는다.
      const dx = spec.cx - camera.position.x;
      const dz = spec.cz - camera.position.z;
      const distanceSq = dx * dx + dz * dz;

      if (offDuty || distanceSq > cullSq) {
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
      const facingPlayer = state.dancing || state.reaction === "glance";
      const heading = state.reaction === "flee" ? state.fleeSign : spec.direction;
      const targetYaw = facingPlayer
        ? // 춤도 쳐다봄도 **사람 쪽**을 본다. 그래야 인과가 보인다
          Math.atan2(playerX - (spec.cx + sample.x), playerZ - (spec.cz + sample.z))
        : (heading > 0 ? sample.yaw : sample.yaw + Math.PI) +
          (state.reaction === "flee" ? 0 : spec.yawOffset);
      // 모서리에서 90도가 한 프레임에 바뀌면 튄다. 최단 방향으로 감쇠시킨다.
      state.yaw +=
        shortestAngleDelta(state.yaw, targetYaw) * (1 - Math.exp(-CROWD.turnLambda * dt));
      scratch.yawQuat.setFromAxisAngle(scratch.up, state.yaw);

      // 서 있는 사람의 팔다리는 멎어 있어야 한다 — 제자리 걸음은 더 이상하다
      const swing = state.dancing
        ? danceSwing
        : spec.activity === "walk" || spec.activity === "play" || state.reaction === "flee"
          ? Math.sin(state.phase)
          : 0;
      /*
       * 폴짝임은 걷기 흔들림을 키운 것이다. 뛰는 높이를 따로 계산하지 않는
       * 이유: 팔다리 흔들림과 같은 위상에서 나와야 **발이 땅을 밀고 오르는**
       * 것으로 보인다. 따로 굴리면 몸이 뜰 때 다리가 멈춰 있다.
       */
      const bob =
        Math.abs(swing) *
        bobHeight *
        (state.dancing ? danceAccent : playing ? PLAYGROUND.hopScale : 1);
      const x = spec.cx + sample.x;
      const z = spec.cz + sample.z;

      /*
       * 컬링을 통과한 사람만 후보로 본다. 안 보이는 사람에게 말을 걸면
       * 허공에서 목소리가 난다.
       */
      /*
       * 합류 판정은 **자리를 구한 뒤**에 한다. 구역 중심으로 재면 25m짜리
       * 구역 안 어디에 있든 같은 답이 나와, 길 건너 사람까지 함께 흔들린다.
       *
       * 다음 프레임의 「나아갈까」가 이 값을 읽는다 — 이번 프레임은 이미
       * 나아간 뒤라 한 걸음이 남지만, 그 한 걸음은 눈에 띄지 않는다.
       */
      state.dancing = joinsDance(x, z, playerX, playerZ, playerDancing, CROWD.danceRadius);
      state.reaction = crowdReaction(x, z, playerX, playerZ, pressure);
      if (state.reaction === "flee") {
        state.fleeSign = fleeDirection(x, z, playerX, playerZ, sample.yaw);
      }

      const toPlayerX = x - playerX;
      const toPlayerZ = z - playerZ;
      const playerDistSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;
      if (playerDistSq < nearestSq) {
        nearestSq = playerDistSq;
        nearestIndex = index;
      }
      // 앉으면 골반이 내려간다. 다리 각도까지 접지 않아도 이 거리에서는 앉은 것으로 읽힌다
      const hipY = CROWD.groundY + PED_BODY.hipHeight * (spec.activity === "sit" ? 0.55 : 1) + bob;

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

        scratch.offset.set(lateral * PED_BODY.legSpread, 0, 0).applyQuaternion(scratch.yawQuat);

        scratch.pitchQuat.setFromAxisAngle(scratch.right, legPitch);
        scratch.limbQuat.multiplyQuaternions(scratch.yawQuat, scratch.pitchQuat);
        scratch.limbOffset.set(0, -PED_BODY.legLength / 2, 0).applyQuaternion(scratch.limbQuat);
        scratch.position.set(
          x + scratch.offset.x + scratch.limbOffset.x,
          ground + hipY + scratch.limbOffset.y,
          z + scratch.offset.z + scratch.limbOffset.z,
        );
        scratch.matrix.compose(scratch.position, scratch.limbQuat, scratch.legScale);
        legs.setMatrixAt(index * 2 + side, scratch.matrix);

        scratch.offset.set(lateral * PED_BODY.armSpread, 0, 0).applyQuaternion(scratch.yawQuat);

        scratch.pitchQuat.setFromAxisAngle(scratch.right, armPitch);
        scratch.limbQuat.multiplyQuaternions(scratch.yawQuat, scratch.pitchQuat);
        scratch.limbOffset.set(0, -PED_BODY.armLength / 2, 0).applyQuaternion(scratch.limbQuat);
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
