/**
 * 물 위로 나가기 — 순수 규칙.
 *
 * 바다를 만들어 놓고 **못 들어갔다.** 월드에서 가장 큰 면적이 배경 그림이었고,
 * 도시 가장자리에서 보이지 않는 벽에 막혔다(`clampToBounds`).
 *
 * 타고 있을 때만 나갈 수 있다. 두 발로 물에 들어가면 수영이 되고, 수영은 이
 * 게임이 하는 일이 아니다 — 여기의 물은 **달리는 바닥**이다.
 *
 * three.js를 모른다. 딛는 높이와 나갈 수 있는 한계만 답한다.
 */

import { isWaterVehicle, type LocomotionMode, type VehicleKind } from "@/game/config/tuning";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";

export const WATER_RIDE = {
  /**
   * 수면 위로 얹히는 높이(m).
   *
   * 0이면 발이 수면과 같은 평면에 있어 물결 텍스처와 z-파이팅이 난다. 조금만
   * 띄운다 — 많이 띄우면 물 위를 **떠서** 가는 것으로 보인다.
   */
  deckAboveSea: 0.12,
  /**
   * 도시 가장자리에서 더 나갈 수 있는 거리(m).
   *
   * 상한이 반드시 있어야 한다. 없으면 수평선을 향해 영영 나가고, 돌아오는
   * 길에는 아무 표식도 없다 — 그건 탐험이 아니라 미아다.
   */
  reach: 60,
} as const;

/** 여기가 물 위인가. 물은 도시 가장자리 **바깥**에 깔린 수면이다(`Sea.tsx`의 고리) */
export function isOverWater(x: number, z: number, halfExtent: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) > halfExtent;
}

/** 물 위에서 딛는 높이(m) */
export function waterSurfaceY(): number {
  return SEA_LEVEL + WATER_RIDE.deckAboveSea;
}

/**
 * 지금 딛는 면의 높이.
 *
 * 물 위이고 **물 탈것**이면 수면, 아니면 뭍의 높이 그대로다.
 * **양방향이어야 한다** — 나가기만 되고 돌아오기가 안 되면 물에 갇힌다.
 *
 * 「타고 있는가」가 아니라 「무엇을 타고 있는가」를 본다. 불리언이었을 때는
 * 조랑말이 수면 위를 걷고 자전거가 파도를 탔다 — 바다에 나가는 길을 내면서
 * 탈것을 한 덩어리로 본 결과다.
 */
export function rideSurfaceHeight(
  landHeight: number,
  x: number,
  z: number,
  halfExtent: number,
  /** 타고 있는 것. 두 발이면 null */
  vehicle: VehicleKind | LocomotionMode | null,
): number {
  if (isWaterVehicle(vehicle) && isOverWater(x, z, halfExtent)) return waterSurfaceY();
  return landHeight;
}

/**
 * 지금 나갈 수 있는 한계(m).
 *
 * 물 탈것만 도시 가장자리 밖으로 나간다. 두 발이나 뭍 탈것은 물가에서
 * 멈춘다 — 걸어서 바다로 들어가면 수영이 되고, 그건 이 게임이 하는 일이
 * 아니다. 자전거로는 파도를 탈 수 없다.
 */
export function rideLimit(
  halfExtent: number,
  vehicle: VehicleKind | LocomotionMode | null,
): number {
  return isWaterVehicle(vehicle) ? halfExtent + WATER_RIDE.reach : halfExtent;
}

/**
 * 물에 대어 둘 자리 — 경계에서 **지형이 가장 낮은 곳**.
 *
 * 부두 옆에 두려다 그만뒀다. 부두는 눈에 띄는 표식이지만 하필 그 자리
 * 지형이 +5m라, 수면(-8.6m)까지 13m 벼랑이다 — 「물가에 대어 둔 제트스키」가
 * 절벽 위에 놓인다. 지형 주석이 말하는 바로 그 관계다: "땅이 낮은 자리는
 * 물이 발치까지 차오르고(모래밭) 마루인 자리는 벼랑이 된다."
 *
 * 좌표를 손으로 적지 않고 **찾는다.** 적어 두면 언덕 수치를 만질 때마다
 * 제트스키가 절벽이나 바닷속으로 간다 — 이 저장소가 배치와 지형을 한 식으로
 * 묶어 온 이유와 같다(`terrain.ts`).
 */
export function shoreLanding(
  halfExtent: number,
  /** 경계에서 안쪽으로 들인 거리(m). 경계에 딱 붙이면 탄 순간 물 밖으로 튄다 */
  inset = 4,
): { x: number; z: number; height: number } {
  const edge = halfExtent - inset;
  // 2m 간격이면 도시 한 변에 140개 남짓 — 언덕 파장(17m)의 최저점을 놓치지 않는다
  const step = 2;
  // 모서리는 뺀다. 두 변이 만나는 자리는 지나갈 길이 좁다
  const margin = 10;

  let best = { x: edge, z: 0, height: Infinity };

  for (let t = -edge + margin; t <= edge - margin; t += step) {
    const candidates = [
      { x: t, z: edge },
      { x: edge, z: t },
      { x: t, z: -edge },
      { x: -edge, z: t },
    ];
    for (const spot of candidates) {
      const height = terrainHeight(spot.x, spot.z);
      if (height < best.height) best = { ...spot, height };
    }
  }

  return best;
}

/** 물가에서 바다 쪽을 보는 방향(rad). 뱃머리가 이쪽을 향한다 */
export function shoreFacing(x: number, z: number): number {
  // 어느 변에 있는지는 절댓값이 큰 축이 정한다
  return Math.abs(x) > Math.abs(z)
    ? x > 0
      ? Math.PI / 2
      : -Math.PI / 2
    : x === 0 && z > 0
      ? 0
      : z > 0
        ? 0
        : Math.PI;
}
