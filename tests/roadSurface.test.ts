import { describe, expect, it } from "vitest";

import { blockCenter, CITY } from "@/game/world/cityLayout";
import { ROAD_SURFACE_COLOR } from "@/game/world/cityPalettes";
import { isRoadSurface } from "@/game/world/streetGround";
import { ZONES, isUrbanBlock } from "@/game/world/zones";

/*
 * 차도 바닥.
 *
 * 지면을 `zoneAt`으로만 갈랐더니 **도로가 아예 없었다** — 그 함수는 도로
 * 좌표를 가장 가까운 구역으로 접으므로, 옛 마을 옆 도로는 흙, 숲 옆 도로는
 * 잔디가 되었다. 화면에는 차선만 흙바닥 위에 떠 있었다.
 *
 * 사람이 화면을 보고 「도로 자체도 제대로 되지 않았다」고 했고, 그게 맞았다.
 */

const PITCH = CITY.blockSize + CITY.roadWidth;
const BLOCKS = CITY.gridSize * CITY.gridSize;

const urban = Array.from({ length: BLOCKS }, (_, i) => i).filter(isUrbanBlock);
const natural = Array.from({ length: BLOCKS }, (_, i) => i).filter((i) => !isUrbanBlock(i));

/** 그 구역의 이웃 구역 번호. 격자 밖이면 -1 */
function neighbour(index: number, dx: number, dz: number): number {
  const col = (index % CITY.gridSize) + dx;
  const row = Math.floor(index / CITY.gridSize) + dz;
  if (col < 0 || col >= CITY.gridSize || row < 0 || row >= CITY.gridSize) return -1;
  return row * CITY.gridSize + col;
}

describe("차도가 어디인가", () => {
  it("구역 안쪽은 차도가 아니다", () => {
    // 구역 안은 건물과 인도다. 여기가 아스팔트가 되면 인도 밑이 도로가 된다
    for (const index of urban) {
      const { cx, cz } = blockCenter(index);
      expect(isRoadSurface(cx, cz), `구역 ${index} 한가운데가 차도로 잡힌다`).toBe(false);
      const edge = CITY.blockSize / 2 - 0.5;
      expect(isRoadSurface(cx + edge, cz), `구역 ${index} 안쪽 끝`).toBe(false);
      expect(isRoadSurface(cx, cz + edge), `구역 ${index} 안쪽 끝`).toBe(false);
    }
  });

  it("도시 구역 사이 도로는 차도다", () => {
    let found = 0;
    for (const index of urban) {
      const { cx, cz } = blockCenter(index);
      // 구역 밖으로 한 뼘만 나가면 바로 도로여야 한다
      const outside = CITY.blockSize / 2 + 1;
      expect(isRoadSurface(cx + outside, cz), `구역 ${index} 동쪽 도로`).toBe(true);
      expect(isRoadSurface(cx, cz + outside), `구역 ${index} 남쪽 도로`).toBe(true);
      found += 1;
    }
    // 「하나도 못 찾았다」로 조용히 통과하지 않게 한다
    expect(found, "잰 도시 구역이 없다").toBeGreaterThan(5);
  });

  it("자연 구역끼리 맞닿은 도로에는 아스팔트를 깔지 않는다", () => {
    /*
     * 숲을 가로지르는 아스팔트 띠는 이 저장소가 `isUrban`으로 이미 한 번
     * 걷어낸 모양이다(가로등·연석·차선). 바닥에서 그것을 되살리면 안 된다.
     */
    let checked = 0;
    for (const index of natural) {
      for (const side of [
        { dx: 1, dz: 0 },
        { dx: 0, dz: 1 },
      ]) {
        const next = neighbour(index, side.dx, side.dz);
        if (next < 0 || isUrbanBlock(next)) continue;

        const { cx, cz } = blockCenter(index);
        const between = { x: cx + (side.dx * PITCH) / 2, z: cz + (side.dz * PITCH) / 2 };
        expect(
          isRoadSurface(between.x, between.z),
          `자연 구역 ${index}-${next} 사이에 아스팔트가 깔렸다`,
        ).toBe(false);
        checked += 1;
      }
    }
    expect(checked, "자연 구역이 맞닿은 자리를 하나도 못 찾았다").toBeGreaterThan(3);
  });

  it("도로 폭이 격자 치수와 맞는다", () => {
    /*
     * 전환이 구역 경계에서 정확히 일어나야 인도 판(구역보다 조금 크다)과
     * 맞물린다. 어긋나면 아스팔트가 인도 위로 올라오거나 사이가 벌어진다.
     */
    const { cx, cz } = blockCenter(urban[0]);
    const half = CITY.blockSize / 2;
    expect(isRoadSurface(cx + half - 0.01, cz), "경계 안쪽이 벌써 도로다").toBe(false);
    expect(isRoadSurface(cx + half + 0.01, cz), "경계 밖인데 도로가 아니다").toBe(true);
  });
});

describe("차도 색", () => {
  /** 사람 눈이 느끼는 밝기(0~1) */
  function luminance(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    return (
      (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255
    );
  }

  it("텍스처를 두 번 어둡게 하지 않는다", () => {
    /*
     * **이 검사가 실제 결함에서 나왔다.**
     *
     * 이 색은 아스팔트 타일 텍스처에 **곱해지는** 값이고, 그 텍스처는 이미
     * 어둡다(바탕 #6f6e73에 더 어두운 보수 자국이 얹혀 있다). 처음에
     * `#55545a`(밝기 0.33)로 뒀더니 곱한 결과가 0.15까지 내려가, 툰 셰이딩과
     * 나무 그림자가 덮인 자리에서 도로가 **거의 검게** 나왔다.
     *
     * 「도로는 어두워야 한다」는 직관이 여기서 함정이다 — 어둡게 만드는 일은
     * 텍스처가 이미 하고 있다.
     */
    expect(
      luminance(ROAD_SURFACE_COLOR),
      `차도 색 밝기 ${luminance(ROAD_SURFACE_COLOR).toFixed(2)} — 텍스처가 이미 어둡다`,
    ).toBeGreaterThan(0.7);
  });

  it("그래도 인도보다는 어둡게 읽힌다", () => {
    /*
     * 밝기는 텍스처가 맡지만, 결과가 뒤집히면 안 된다. 아스팔트 바탕(#6f6e73,
     * 0.43)에 이 색을 곱한 값이 도시 구역 지면 색보다 어두워야 도로가 도로로
     * 읽힌다.
     */
    const asphaltBase = luminance("#6f6e73");
    const road = asphaltBase * luminance(ROAD_SURFACE_COLOR);
    for (const id of ["plaza", "market"] as const) {
      expect(
        road,
        `도로 ${road.toFixed(2)} vs ${id} ${luminance(ZONES[id].groundColor).toFixed(2)}`,
      ).toBeLessThan(luminance(ZONES[id].groundColor));
    }
  });
});
