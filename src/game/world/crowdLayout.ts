/**
 * 보행자 배치·경로 — 순수 데이터 생성.
 *
 * cityLayout.ts와 같은 원칙이다. 이 모듈은 three.js를 모르고, Crowd.tsx가 결과를
 * 인스턴싱한다.
 *
 * 경로는 "구역 둘레를 한 바퀴 도는 직사각형 트랙" 하나뿐이다. 인도가 구역 둘레에만
 * 있으므로 경로 탐색을 만들 이유가 없고, 트랙 좌표를 닫힌 식으로 계산할 수 있어
 * 웨이포인트 배열조차 들고 있을 필요가 없다.
 */

import { createSeededRandom, TAU } from "@/game/core/mathx";
import { CITY } from "@/game/world/cityLayout";

/** 구역 중심 간 거리 — cityLayout과 같은 정의 */
const blockPitch = CITY.blockSize + CITY.roadWidth;

export const CROWD = {
  seed: 20260817,
  /** 인스턴스 상한. 품질 등급이 아무리 높아도 이 수를 넘기지 않는다 */
  maxPedestrians: 64,
  perBlock: 4,
  /**
   * 트랙 반경(구역 중심 기준). 구역 경계선에서 바깥으로 얼마나 나가는지로 정의한다.
   *
   * 건물 바깥면은 경계선 안쪽(최대 16.5), 가로수 기둥은 18.4, 인도 상판 끝은 19에
   * 있다. 두 트랙 모두 그 사이에 있어야 보행자가 벽이나 나무를 통과하지 않는다.
   */
  innerTrackRadius: CITY.blockSize / 2 + 0.1,
  outerTrackRadius: CITY.blockSize / 2 + 0.9,
  /** 인도 상판 윗면 높이. 정본은 CITY.sidewalkHeight다 — 다르면 발이 뜨거나 잠긴다 */
  groundY: CITY.sidewalkHeight,
  minSpeed: 0.95,
  maxSpeed: 1.75,
  /** 걸음 한 주기가 도는 데 필요한 이동 거리(m). 속도로 나누면 주기가 나온다 */
  strideLength: 1.35,
  /** 이 거리 밖의 보행자는 인스턴스를 접고 행렬 갱신을 건너뛴다 */
  cullDistance: 120,
  /** 이 거리 밖에서는 행렬을 두 프레임에 한 번만 쓴다 — 멀면 30Hz로 움직여도 티가 안 난다 */
  halfRateDistance: 45,
  /** 모서리에서 방향이 튀지 않게 감쇠하는 계수 */
  turnLambda: 9,
} as const;

/**
 * 보행자 비율.
 *
 * 골반(hip)을 기준점으로 잡는다. 다리 회전 원점이 골반이라 여기서 재는 편이
 * 값을 고칠 때 어긋날 여지가 적다. 전체 키는 약 1.5m로 플레이어와 같은 눈높이다.
 */
export const PED_BODY = {
  hipHeight: 0.5,
  legLength: 0.5,
  legWidth: 0.16,
  legDepth: 0.18,
  legSpread: 0.11,
  torsoWidth: 0.42,
  torsoHeight: 0.52,
  torsoDepth: 0.26,
  /** 골반에서 몸통 중심까지. 다리 윗면(골반)과 몸통 아랫면이 붙어야 틈이 안 보인다 */
  torsoOffsetY: 0.26,
  headSize: 0.29,
  headOffsetY: 0.66,
  armLength: 0.42,
  armWidth: 0.13,
  armDepth: 0.14,
  armOffsetY: 0.48,
  armSpread: 0.27,
} as const;

/** 옷 색. 시드 난수로 고르며, 노을빛 아래에서 구분되는 채도로 맞춘다 */
export const SHIRT_PALETTE = [
  "#e0563f",
  "#3f6ea8",
  "#d9a441",
  "#5f8f6a",
  "#8c5aa8",
  "#d5d0c4",
  "#2f3448",
  "#c96f9b",
] as const;

export const PANTS_PALETTE = ["#3b4a6b", "#4a4451", "#7a6a58", "#2b2f3a"] as const;

export const SKIN_PALETTE = ["#f0c9a8", "#d8a67c", "#a97b55"] as const;

export interface PedestrianSpec {
  /** 순회하는 구역의 중심 */
  cx: number;
  cz: number;
  trackRadius: number;
  /** +1이면 트랙 진행 방향, -1이면 역방향 */
  direction: 1 | -1;
  speed: number;
  startU: number;
  shirtTone: number;
  pantsTone: number;
  skinTone: number;
  /** 시작 걸음 위상. 전원이 같은 발을 내딛으면 군무처럼 보인다 */
  startPhase: number;
}

export interface TrackSample {
  x: number;
  z: number;
  /** +z를 정면으로 보는 좌표계 기준 y축 회전 */
  yaw: number;
}

/** 트랙 한 바퀴 길이 */
export function trackPerimeter(radius: number): number {
  return radius * 8;
}

/**
 * 직사각형 트랙 위의 한 점을 구한다.
 *
 * 매 프레임 보행자 수만큼 불리므로 객체를 새로 만들지 않고 `out`에 채운다.
 * 반환 좌표는 구역 중심 기준 상대값이다.
 */
export function samplePerimeter(radius: number, u: number, out: TrackSample): TrackSample {
  const side = radius * 2;
  const perimeter = side * 4;
  let t = u % perimeter;
  if (t < 0) t += perimeter;

  const segment = Math.floor(t / side);
  const local = t - segment * side;

  if (segment === 0) {
    out.x = -radius + local;
    out.z = -radius;
    out.yaw = Math.PI / 2;
  } else if (segment === 1) {
    out.x = radius;
    out.z = -radius + local;
    out.yaw = 0;
  } else if (segment === 2) {
    out.x = radius - local;
    out.z = radius;
    out.yaw = -Math.PI / 2;
  } else {
    out.x = -radius;
    out.z = radius - local;
    out.yaw = Math.PI;
  }

  return out;
}

/**
 * 보행자를 배치한다.
 *
 * 구역마다 같은 수를 깔되 `budget`에 도달하면 멈춘다. 품질 등급이 낮은 기기에서
 * 인원을 줄여도 도시 한쪽만 비지 않도록, 구역을 돌면서 한 명씩 채우지 않고
 * 앞 구역부터 채우는 대신 방향·트랙을 섞어 밀도가 균일해 보이게 한다.
 */
export function buildPedestrians(budget: number): PedestrianSpec[] {
  const random = createSeededRandom(CROWD.seed);
  const specs: PedestrianSpec[] = [];
  const limit = Math.min(budget, CROWD.maxPedestrians);
  const totalBlocks = CITY.gridSize * CITY.gridSize;
  const offset = (CITY.gridSize - 1) / 2;

  for (let round = 0; round < CROWD.perBlock && specs.length < limit; round += 1) {
    for (let blockIndex = 0; blockIndex < totalBlocks && specs.length < limit; blockIndex += 1) {
      const cx = ((blockIndex % CITY.gridSize) - offset) * blockPitch;
      const cz = (Math.floor(blockIndex / CITY.gridSize) - offset) * blockPitch;

      // 진행 방향마다 트랙을 나눈다. 같은 선 위에서 마주 오면 서로를 통과해 지나간다.
      const direction: 1 | -1 = random() < 0.5 ? 1 : -1;
      const trackRadius = direction > 0 ? CROWD.outerTrackRadius : CROWD.innerTrackRadius;

      specs.push({
        cx,
        cz,
        trackRadius,
        direction,
        speed: CROWD.minSpeed + random() * (CROWD.maxSpeed - CROWD.minSpeed),
        startU: random() * trackPerimeter(trackRadius),
        shirtTone: Math.floor(random() * SHIRT_PALETTE.length),
        pantsTone: Math.floor(random() * PANTS_PALETTE.length),
        skinTone: Math.floor(random() * SKIN_PALETTE.length),
        startPhase: random() * TAU,
      });
    }
  }

  return specs;
}
