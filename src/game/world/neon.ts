/**
 * 번화가의 네온 — 건물 모서리를 타고 오르는 관.
 *
 * 여덟 구역 중 **도시가 가장 화려해야** 나머지 일곱의 조용함이 산다. 그런데
 * 번화가와 주택가의 차이가 「건물이 높다」뿐이었다 — 간판은 도시 전체가
 * 나눠 쓰고 있어서, 밤에도 번화가가 특별히 밝지 않았다.
 *
 * 간판을 더 붙이지 않는다. 간판은 벽에 붙는 것이라 **정면에서만** 보이고,
 * 스카이라인에는 아무 일도 일어나지 않는다. 대신 건물의 **세로 모서리**를
 * 네온 관이 타고 오르게 한다 — 멀리서 보면 건물의 윤곽 자체가 빛나고,
 * 그게 「번화가에 왔다」를 한 화면에 말한다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다
 * (`zones.ts` 주석). 건물은 인자로 받고 타입만 가져온다.
 */

import type { BoxInstance } from "@/game/world/cityLayout";

/**
 * 네온을 두르는 최소 건물 높이(m).
 *
 * 낮은 건물까지 두르면 번화가가 아니라 **크리스마스 장식**이 된다. 18m는
 * 번화가 높이 범위(16~34m)의 아래쪽이라 대부분이 두르되, 가장 낮은 몇 채는
 * 빠져 리듬이 생긴다.
 */
const MIN_HEIGHT = 18;

/**
 * 관의 굵기(m).
 *
 * 0.3m는 멀리서 **한 픽셀보다 굵게** 남는 최소치다. 더 얇으면 안개 낀 밤에
 * 사라지고, 더 굵으면 관이 아니라 기둥이 되어 건물이 통째로 빛나 보인다.
 */
const TUBE = 0.3;

/**
 * 1층 상가 띠 위에서 시작한다(m).
 *
 * 바닥부터 올리면 상가 유리·차양과 겹쳐 지저분해진다. 상가 위에서 시작해야
 * 「간판 위로 올라가는 선」으로 읽힌다.
 */
const BASE = 4.2;

/** 꼭대기 띠가 옥상에서 내려온 거리(m) */
const CROWN_DROP = 1.1;

/** 꼭대기 띠 두께(m). 세로 관보다 조금 굵어야 관을 묶는 테로 보인다 */
const CROWN_THICKNESS = 0.42;

/**
 * 네온 색 수. `cityPalettes`의 `NEON_PALETTE` 길이와 같아야 한다.
 *
 * 건물마다 색을 돌려 쓴다 — 한 색이면 도시가 통째로 한 간판이고, 색을
 * 무작위로 뽑으면 옆 건물과 같은 색이 자주 붙어 규칙이 없어 보인다.
 */
const NEON_TONES = 5;

/**
 * 번화가 건물에 네온 관과 띠를 두른다.
 *
 * 건물 하나에 세로 넷 + 가로 하나. 세로를 둘만 두면 정면에서는 멀쩡한데
 * **모퉁이를 돌면 한쪽이 비어** 건물이 반만 칠해진 것으로 보인다.
 */
export function buildNeon(buildings: readonly BoxInstance[]): BoxInstance[] {
  const neon: BoxInstance[] = [];

  buildings.forEach((building, index) => {
    if (building.height < MIN_HEIGHT) return;

    const height = building.height - BASE - CROWN_DROP;
    if (height <= 0) return;

    /*
     * 색은 **건물 순서**로 돌린다. 난수를 쓰면 옆 건물과 같은 색이 자주
     * 붙는다 — 무작위는 고르게 흩어지지 않는다.
     */
    const tone = index % NEON_TONES;
    const halfWidth = building.width / 2;
    const halfDepth = building.depth / 2;

    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        neon.push({
          // 모서리에 걸치게 반 두께만큼 안으로 넣는다 — 밖으로 나가면 공중에 뜬다
          x: building.x + dx * (halfWidth - TUBE / 2),
          y: BASE + height / 2,
          z: building.z + dz * (halfDepth - TUBE / 2),
          width: TUBE,
          height,
          depth: TUBE,
          tone,
          blockIndex: building.blockIndex,
        });
      }
    }

    /*
     * 꼭대기를 한 바퀴 두르는 띠.
     *
     * 세로 관만 있으면 네 줄이 위에서 **끊긴 채** 끝난다. 띠가 그것을 묶어
     * 건물의 윤곽이 닫힌다 — 스카이라인이 살아나는 것은 이 한 줄 때문이다.
     */
    neon.push({
      x: building.x,
      y: building.height - CROWN_DROP,
      z: building.z,
      // 벽보다 조금 넓게 내밀어야 옆에서 봐도 띠가 보인다
      width: building.width + TUBE,
      height: CROWN_THICKNESS,
      depth: building.depth + TUBE,
      tone,
      blockIndex: building.blockIndex,
    });
  });

  return neon;
}
