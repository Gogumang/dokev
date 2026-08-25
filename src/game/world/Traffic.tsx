"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * GameScene.tsx와 같은 이유다. 차량 진행 상태와 InstancedMesh 행렬은 렌더 밖의
 * useFrame 콜백에서만 바뀐다. 이를 setState로 올리면 초당 60회 리렌더가 되어
 * 성능 예산을 지킬 수 없다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 주행 차량과 신호등 렌더링.
 *
 * 여기가 맡는 것은 **주행**이다 — 앞차와의 간격, 신호 앞 감속, 순환, 시야 밖
 * 접기. 결과는 자세 배열 하나에 담기고, 그것을 읽어 차를 그리는 일은 차종마다
 * `VehicleInstances`가 한다.
 *
 * 나눈 계기는 차가 상자에서 GLB 세 종이 된 것이다. 주행은 여전히 한 배열로
 * 돌아야 하는데(같은 차선의 앞차를 찾아야 한다) 그리기는 차종별로 갈라진다 —
 * 한 반복문에 두면 차종을 하나 들일 때마다 주행 코드를 건드리게 된다.
 *
 * 신호등은 기둥·헤드·램프 세 겹으로 여기 남는다. 움직이지 않아서 자세 배열에
 * 낄 것이 없다.
 *
 * 차간 거리 유지는 "같은 차선의 다음 차와의 간격" 하나로 끝난다. 배치가 등간격
 * 순환이라 추월이 일어나지 않고, 따라서 초기 순서가 영원히 유지되기 때문이다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { damp } from "@/game/core/mathx";
import type { QualityLevel, QualityPreset } from "@/game/systems/quality";
import { CROWD } from "@/game/world/crowdLayout";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { terrainHeight } from "@/game/world/terrain";
import { createPoses, partitionFleet, VEHICLE_MODELS } from "@/game/world/trafficFleet";
import { VehicleInstances } from "@/game/world/VehicleInstances";
import {
  buildSignalPosts,
  buildTraffic,
  canProceed,
  coordinateFromU,
  sampleSignal,
  SIGNAL,
  TRAFFIC,
  type SignalColor,
  type SignalState,
} from "@/game/world/trafficLayout";

/** 품질 등급별 차량 수 */
const CAR_BUDGET: Record<QualityLevel, number> = {
  low: 12,
  medium: 24,
  high: 36,
};

/** 점등 색 — 적/황/녹 순서. 인덱스가 곧 램프의 위에서부터의 순서다 */
const LAMP_LIT = ["#ff4438", "#ffc634", "#3fd46a"] as const;
/** 소등 색. 검게 두면 밤에 구멍처럼 보여 어두운 동색으로 낮춘다 */
const LAMP_OFF = ["#43201d", "#413822", "#1f4029"] as const;
const POLE_COLOR = "#2e2a3a";

function lampIndexOf(color: SignalColor): number {
  if (color === "red") return 0;
  if (color === "yellow") return 1;
  return 2;
}

/** 순환 구간에서 a가 b보다 얼마나 앞서 있는지 (항상 0 이상) */
function forwardDistance(delta: number, loopLength: number): number {
  const wrapped = delta % loopLength;
  return wrapped < 0 ? wrapped + loopLength : wrapped;
}

interface CarRuntime {
  u: number;
  speed: number;
  /** 진행 축과 방향으로 정해지는 고정 회전 */
  yaw: number;
  visible: boolean;
}

export interface TrafficProps {
  quality: QualityPreset;
  reducedMotion: boolean;
  /** 월드 정사각형의 절반 크기 — 순환 구간 길이를 정한다 */
  halfExtent: number;
  /** 밤 조명 세기(0~1). 전조등 밝기에 쓴다 */
  glow: number;
}

export function Traffic({ quality, reducedMotion, halfExtent, glow }: TrafficProps) {
  const { camera } = useThree();

  const plan = useMemo(
    () => buildTraffic(halfExtent, CAR_BUDGET[quality.level]),
    [halfExtent, quality.level],
  );
  const posts = useMemo(() => buildSignalPosts(), []);
  const halfSpan = halfExtent + TRAFFIC.wrapMargin;

  const runtime = useMemo<CarRuntime[]>(
    () =>
      plan.cars.map((spec) => ({
        u: spec.startU,
        speed: spec.cruiseSpeed,
        yaw:
          spec.axis === "z"
            ? spec.direction > 0
              ? 0
              : Math.PI
            : spec.direction > 0
              ? Math.PI / 2
              : -Math.PI / 2,
        visible: true,
      })),
    [plan],
  );

  const lampRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const elapsed = useRef(0);
  // 마지막으로 램프에 반영한 신호. 색이 바뀐 프레임에만 색 버퍼를 다시 올린다.
  const shownSignal = useRef<SignalState | null>(null);

  /*
   * 그리는 쪽이 읽는 공유 배열. 매 프레임 고쳐 쓴다 — setState로 올리면 초당
   * 60회 리렌더가 되어 성능 예산을 지킬 수 없다.
   */
  const poses = useMemo(() => createPoses(plan.cars.length), [plan]);
  const tones = useMemo(() => plan.cars.map((spec) => spec.tone), [plan]);
  const fleet = useMemo(() => partitionFleet(tones), [tones]);

  // 신호등은 움직이지 않는다 — 행렬을 한 번만 쓰고 이후에는 색만 바꾼다.
  useLayoutEffect(() => {
    const pole = poleRef.current;
    const head = headRef.current;
    const lamp = lampRef.current;
    if (!pole || !head || !lamp) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color(LAMP_OFF[0]);

    const headCenterY = CROWD.groundY + SIGNAL.poleHeight - SIGNAL.headHeight / 2;

    posts.forEach((post, index) => {
      const postGround = terrainHeight(post.x, post.z);
      position.set(post.x, postGround + CROWD.groundY + SIGNAL.poleHeight / 2, post.z);
      scale.set(SIGNAL.poleWidth, SIGNAL.poleHeight, SIGNAL.poleWidth);
      matrix.compose(position, identity, scale);
      pole.setMatrixAt(index, matrix);

      position.set(post.x, postGround + headCenterY, post.z);
      // 헤드와 램프는 통제하는 축을 향해 길게 눕힌다. 양쪽 진행 방향에서 모두 보인다.
      if (post.axis === "z") {
        scale.set(SIGNAL.headWidth, SIGNAL.headHeight, SIGNAL.headDepth);
      } else {
        scale.set(SIGNAL.headDepth, SIGNAL.headHeight, SIGNAL.headWidth);
      }
      matrix.compose(position, identity, scale);
      head.setMatrixAt(index, matrix);

      for (let slot = 0; slot < 3; slot += 1) {
        position.set(post.x, postGround + headCenterY + SIGNAL.lampGap * (1 - slot), post.z);
        if (post.axis === "z") {
          scale.set(SIGNAL.lampSize, SIGNAL.lampSize, SIGNAL.headDepth + 0.08);
        } else {
          scale.set(SIGNAL.headDepth + 0.08, SIGNAL.lampSize, SIGNAL.lampSize);
        }
        matrix.compose(position, identity, scale);
        lamp.setMatrixAt(index * 3 + slot, matrix);
        color.set(LAMP_OFF[slot]);
        lamp.setColorAt(index * 3 + slot, color);
      }
    });

    pole.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    lamp.instanceMatrix.needsUpdate = true;
    if (lamp.instanceColor) lamp.instanceColor.needsUpdate = true;
    // 정적이므로 경계구가 낡을 일이 없다 — 시야 밖 교차로는 컬링에 맡긴다.
    pole.computeBoundingSphere();
    head.computeBoundingSphere();
    lamp.computeBoundingSphere();
    shownSignal.current = null;
  }, [posts]);

  // 저감 모션에서도 차는 달린다. 화면 대부분을 차지하지 않는 배경 요소이고,
  // 멈춰 선 도시는 "정지"라는 다른 인상을 준다. 대신 최고 속도만 낮춘다.
  const speedScale = reducedMotion ? 0.7 : 1;

  useFrame((_, rawDelta) => {
    const lamp = lampRef.current;

    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    elapsed.current += dt;

    const signal = sampleSignal(elapsed.current);
    const { loopLength } = plan;

    /* ---------------- 주행 ---------------- */
    for (const lane of plan.lanes) {
      for (let k = 0; k < lane.length; k += 1) {
        const self = lane[k];
        const ahead = lane[(k + 1) % lane.length];
        const spec = plan.cars[self];
        const state = runtime[self];

        const cruise = spec.cruiseSpeed * speedScale;
        let target = cruise;

        if (ahead !== self) {
          const gap = forwardDistance(runtime[ahead].u - state.u, loopLength);
          if (gap < TRAFFIC.followGap) {
            target = 0;
          } else if (gap < TRAFFIC.followGap * 2) {
            target *= (gap - TRAFFIC.followGap) / TRAFFIC.followGap;
          }
        }

        if (!canProceed(signal, spec.axis)) {
          let nearest = Number.POSITIVE_INFINITY;
          for (const stopLineU of spec.stopLineUs) {
            const distance = forwardDistance(stopLineU - state.u, loopLength);
            if (distance < nearest) nearest = distance;
          }
          if (nearest < TRAFFIC.stopLookahead) {
            const ratio =
              (nearest - TRAFFIC.stopMargin) / (TRAFFIC.stopLookahead - TRAFFIC.stopMargin);
            target = Math.min(target, cruise * Math.max(0, ratio));
          }
        }

        state.speed = damp(state.speed, target, TRAFFIC.speedLambda, dt);
        /*
         * 감쇠는 0에 닿지 않는다. 기어가듯 정지선을 넘어가면 남은 거리가 순환
         * 구간을 한 바퀴 돌아 "아주 멀다"로 뒤집히고, 그 순간 적신호에 가속한다.
         * 느려진 차는 확실히 세워야 한다.
         */
        if (target < 0.05 && state.speed < 0.3) state.speed = 0;

        state.u = (state.u + state.speed * dt) % loopLength;
      }
    }

    /* ---------------- 자세 ---------------- */
    const cullSq = TRAFFIC.cullDistance * TRAFFIC.cullDistance;

    for (let index = 0; index < plan.cars.length; index += 1) {
      const spec = plan.cars[index];
      const state = runtime[index];
      const pose = poses[index];

      const coordinate = coordinateFromU(state.u, spec.direction, halfSpan);
      const x = spec.axis === "z" ? spec.lanePosition : coordinate;
      const z = spec.axis === "z" ? coordinate : spec.lanePosition;

      const dx = x - camera.position.x;
      const dz = z - camera.position.z;
      if (dx * dx + dz * dz > cullSq) {
        state.visible = false;
        pose.visible = false;
        continue;
      }

      state.visible = true;
      pose.visible = true;
      pose.x = x;
      /* 차도 위를 달린다 — 언덕에서는 차도 함께 오르내려야 한다 */
      pose.y = terrainHeight(x, z);
      pose.z = z;
      pose.yaw = state.yaw;
    }

    /* ---------------- 신호 색 ---------------- */
    const shown = shownSignal.current;
    if (lamp && (!shown || shown.alongZ !== signal.alongZ || shown.alongX !== signal.alongX)) {
      const color = new THREE.Color();
      const litZ = lampIndexOf(signal.alongZ);
      const litX = lampIndexOf(signal.alongX);

      posts.forEach((post, index) => {
        const lit = post.axis === "z" ? litZ : litX;
        for (let slot = 0; slot < 3; slot += 1) {
          color.set(slot === lit ? LAMP_LIT[slot] : LAMP_OFF[slot]);
          lamp.setColorAt(index * 3 + slot, color);
        }
      });

      if (lamp.instanceColor) lamp.instanceColor.needsUpdate = true;
      shownSignal.current = signal;
    }
  });

  return (
    <group>
      {VEHICLE_MODELS.map((model, index) => (
        <VehicleInstances
          key={model.url}
          model={model}
          slots={fleet[index]}
          poses={poses}
          tones={tones}
          glow={glow}
        />
      ))}

      <instancedMesh ref={poleRef} args={[undefined, undefined, posts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial color={POLE_COLOR} />
      </instancedMesh>

      <instancedMesh ref={headRef} args={[undefined, undefined, posts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <ToonMaterial color={POLE_COLOR} />
      </instancedMesh>

      {/* 램프는 조명을 받지 않는다 — 역광에서도 신호 색이 살아 있어야 한다 */}
      <instancedMesh ref={lampRef} args={[undefined, undefined, posts.length * 3]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
