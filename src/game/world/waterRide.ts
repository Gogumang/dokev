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

import { SEA_LEVEL } from "@/game/world/terrain";

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
 * 물 위이고 타고 있으면 수면, 아니면 뭍의 높이 그대로다. **양방향이어야 한다** —
 * 나가기만 되고 돌아오기가 안 되면 물에 갇힌다.
 */
export function rideSurfaceHeight(
  landHeight: number,
  x: number,
  z: number,
  halfExtent: number,
  riding: boolean,
): number {
  if (riding && isOverWater(x, z, halfExtent)) return waterSurfaceY();
  return landHeight;
}

/**
 * 지금 나갈 수 있는 한계(m).
 *
 * 두 발이면 도시 가장자리에서 멈춘다 — 걸어서 바다로 들어가면 수영이 되고,
 * 그건 이 게임이 하는 일이 아니다.
 */
export function rideLimit(halfExtent: number, riding: boolean): number {
  return riding ? halfExtent + WATER_RIDE.reach : halfExtent;
}
