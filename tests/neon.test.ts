import { describe, expect, it } from "vitest";

import { NEON_PALETTE } from "@/game/world/cityPalettes";
import { buildCityLayout } from "@/game/world/cityLayout";
import { zoneForBlock } from "@/game/world/zones";

/*
 * 번화가 네온.
 *
 * 여덟 구역 중 **도시가 가장 화려해야** 나머지 일곱의 조용함이 산다. 그런데
 * 번화가와 주택가의 차이가 「건물이 높다」뿐이었다 — 간판은 도시 전체가
 * 나눠 쓰고 있어서 밤에도 번화가가 특별히 밝지 않았다.
 */

const layout = buildCityLayout();
const downtown = layout.buildings.filter((b) => zoneForBlock(b.blockIndex).id === "downtown");

describe("어디에 두르는가", () => {
  it("번화가에만 있다", () => {
    expect(layout.neon.length, "네온이 하나도 없다").toBeGreaterThan(50);

    const strays = layout.neon.filter((piece) => zoneForBlock(piece.blockIndex).id !== "downtown");
    expect(strays.length, `번화가 밖 네온 ${strays.length}개`).toBe(0);
  });

  it("낮은 건물은 두르지 않는다", () => {
    /*
     * 낮은 건물까지 두르면 번화가가 아니라 크리스마스 장식이 된다. 두른
     * 건물이 번화가 건물 **전부는 아니어야** 리듬이 생긴다.
     */
    const wrapped = new Set(
      layout.neon.map((piece) => `${piece.x.toFixed(1)},${piece.z.toFixed(1)}`),
    );
    expect(wrapped.size, "네온 자리가 없다").toBeGreaterThan(0);
    expect(layout.neon.length / 5, `두른 건물 수`).toBeLessThan(downtown.length);
  });

  it("건물 하나에 세로 넷과 가로 하나", () => {
    /*
     * 세로를 둘만 두면 정면에서는 멀쩡한데 **모퉁이를 돌면 한쪽이 비어**
     * 건물이 반만 칠해진 것으로 보인다. 다섯 조각이 한 벌이다.
     */
    expect(layout.neon.length % 5, `네온 ${layout.neon.length}개`).toBe(0);

    const crowns = layout.neon.filter((piece) => piece.height < 1);
    const tubes = layout.neon.filter((piece) => piece.height >= 1);
    expect(tubes.length, `세로 관 ${tubes.length} vs 띠 ${crowns.length}`).toBe(crowns.length * 4);
  });
});

describe("자리가 맞는가", () => {
  it("관이 건물 모서리 안에 걸친다", () => {
    /*
     * 밖으로 나가면 공중에 뜬 막대가 되고, 너무 안이면 벽에 묻혀 안 보인다.
     * 관 중심이 벽면에서 반 두께 안쪽이어야 한다.
     */
    const tubes = layout.neon.filter((piece) => piece.height >= 1);
    for (const tube of tubes) {
      const host = layout.buildings.find(
        (b) =>
          b.blockIndex === tube.blockIndex &&
          Math.abs(tube.x - b.x) <= b.width / 2 + 0.01 &&
          Math.abs(tube.z - b.z) <= b.depth / 2 + 0.01,
      );
      expect(host, `(${tube.x.toFixed(1)}, ${tube.z.toFixed(1)}) 관에 짝이 되는 건물이 없다`).toBeDefined();
    }
  });

  it("1층 상가 위에서 시작한다", () => {
    /*
     * 바닥부터 올리면 상가 유리·차양과 겹쳐 지저분해진다. 상가 위에서
     * 시작해야 「간판 위로 올라가는 선」으로 읽힌다.
     */
    const tubes = layout.neon.filter((piece) => piece.height >= 1);
    for (const tube of tubes) {
      const bottom = tube.y - tube.height / 2;
      expect(bottom, `관이 ${bottom.toFixed(2)}m에서 시작한다`).toBeGreaterThan(3.5);
    }
  });

  it("옥상 위로 솟지 않는다", () => {
    // 건물 밖으로 나가면 하늘에 떠 있는 막대가 된다
    for (const piece of layout.neon) {
      const top = piece.y + piece.height / 2;
      const host = layout.buildings.find(
        (b) =>
          b.blockIndex === piece.blockIndex &&
          Math.abs(piece.x - b.x) <= b.width / 2 + 0.5 &&
          Math.abs(piece.z - b.z) <= b.depth / 2 + 0.5,
      );
      if (!host) continue;
      expect(top, `${top.toFixed(2)}m vs 옥상 ${host.height.toFixed(2)}m`).toBeLessThanOrEqual(
        host.height + 0.01,
      );
    }
  });
});

describe("색", () => {
  it("건물마다 색을 돌려 쓴다", () => {
    /*
     * 한 색이면 도시가 통째로 한 간판이다. 다섯 색이 전부 쓰여야 한다 —
     * 팔레트를 늘려 놓고 배치가 안 따라가면 늘린 색은 영영 안 보인다.
     */
    const used = new Set(layout.neon.map((piece) => piece.tone));
    expect(used.size, `쓰인 색 ${used.size}가지`).toBe(NEON_PALETTE.length);
  });

  it("톤이 팔레트 범위를 넘지 않는다", () => {
    // 넘으면 `projectInstances`가 나머지 연산으로 접어 엉뚱한 색이 나온다
    for (const piece of layout.neon) {
      expect(piece.tone, `tone ${piece.tone}`).toBeLessThan(NEON_PALETTE.length);
      expect(piece.tone, `tone ${piece.tone}`).toBeGreaterThanOrEqual(0);
    }
  });
});
