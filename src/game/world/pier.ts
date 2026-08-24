/**
 * 해안의 나무 부두 — 순수 배치.
 *
 * 낚시를 하려면 **물가에 설 자리**가 먼저 있어야 한다(`systems/fishing.ts`).
 * 모래밭 끝에서 바다 쪽으로 널판을 깔고, 그 끝이 낚시하는 자리다.
 *
 * 모델을 만들지 않는다 — 널판과 기둥은 상자 몇 개다. 이 저장소의 다른 소품과
 * 같은 방식이고, 다운로드 예산에 아무것도 더하지 않는다.
 *
 * three.js를 모른다. 상자 목록과 끝 좌표만 돌려준다.
 */

import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";

export const PIER = {
  /** 널판 한 장의 크기(m) */
  plankLength: 2.4,
  plankWidth: 3.2,
  plankThickness: 0.18,
  /** 몇 장을 이어 까는지. 길이 = plankLength × plankCount */
  plankCount: 9,
  /** 기둥 굵기(m) */
  postSide: 0.26,
  /** 널판 몇 장마다 기둥을 세우는지 */
  postEvery: 3,
  /**
   * 데크가 **땅보다** 얼마나 높은지(m).
   *
   * 처음에는 수면 기준으로 잡았다가 검사에 걸렸다 — 이 해안은 모래밭이 아니라
   * **절벽**이다. 지형은 어디서나 수면(-8.6m)보다 위고, 물은 도시 가장자리
   * 바깥에서 시작한다. 수면 위 1m에 데크를 놓으면 육지에서는 **땅속에 묻힌다.**
   *
   * 그래서 시작점의 땅 높이에 얹고, 기둥이 물까지 내려간다.
   */
  deckAboveGround: 0.45,
  /** 찌 반지름(m). 물 위에서 눈에 걸릴 만큼은 커야 한다 */
  bobberRadius: 0.16,
} as const;

/** 부두 상자 하나 — 렌더가 그대로 그린다 */
export interface PierBox {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * 부두가 뻗어 나가는 자리.
 *
 * 해안은 지도의 **동쪽 끝 열**이다(`zones.ts`의 6×6 지도). 그래서 부두도
 * 동쪽(+x)으로 뻗는다 — 도시 안쪽으로 뻗으면 육지 위의 다리가 된다.
 */
export function pierStartX(halfExtent: number): number {
  // 도시 가장자리에서 살짝 안쪽. 모래밭 위에서 시작해야 「걸어 들어가는」 것이 된다
  return halfExtent - PIER.plankLength;
}

/** 낚시하는 자리 — 부두 끝 */
export function pierTip(halfExtent: number, z = 0): { x: number; z: number } {
  return { x: pierStartX(halfExtent) + PIER.plankLength * PIER.plankCount, z };
}

/**
 * 데크 높이(m). 널판은 **수평**이다 — 기울어진 부두는 없다.
 *
 * 시작점(모래·바위 끝)의 땅 높이에 얹는다. 그 한 점으로 전체 높이가 정해지므로
 * 부두 어디를 밟아도 발이 같은 높이에 있다.
 */
export function pierDeckY(halfExtent: number, z = 0): number {
  return terrainHeight(pierStartX(halfExtent), z) + PIER.deckAboveGround;
}

/**
 * 널판과 기둥을 편다.
 *
 * 기둥은 **데크 아래 물속까지** 내려간다. 데크만 있으면 널판이 공중에 뜬 것으로
 * 보인다 — 무엇이 받치고 있는지가 화면에 있어야 부두로 읽힌다.
 */
export function buildPier(halfExtent: number, z = 0): PierBox[] {
  const boxes: PierBox[] = [];
  const deckY = pierDeckY(halfExtent, z);
  const startX = pierStartX(halfExtent);

  for (let index = 0; index < PIER.plankCount; index += 1) {
    const x = startX + PIER.plankLength * (index + 0.5);
    boxes.push({
      x,
      y: deckY,
      z,
      width: PIER.plankLength,
      height: PIER.plankThickness,
      depth: PIER.plankWidth,
    });

    if (index % PIER.postEvery !== 0) continue;

    /*
     * 기둥은 데크에서 **수면 아래까지** 내려간다. 절벽 해안이라 데크와 물
     * 사이가 멀다 — 짧게 두면 널판이 허공에 뜬 것으로 보인다.
     */
    const postHeight = deckY - SEA_LEVEL + 1;
    for (const side of [-1, 1]) {
      boxes.push({
        x,
        y: deckY - postHeight / 2,
        z: z + side * (PIER.plankWidth / 2 - PIER.postSide),
        width: PIER.postSide,
        height: postHeight,
        depth: PIER.postSide,
      });
    }
  }

  return boxes;
}
