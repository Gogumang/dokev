import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CITY } from "@/game/world/cityLayout";
import { ZONES } from "@/game/world/zones";
import {
  ASPHALT_TILE_METERS,
  FACADE_CELL_HEIGHT,
  FACADE_CELL_WIDTH,
  FACADE_TONES,
  PAVING_TILE_METERS,
} from "@/game/world/textures";

/*
 * 텍스처 상수와 도시 치수의 관계.
 *
 * 텍스처를 그리는 코드는 캔버스가 필요해 여기서 돌릴 수 없다. 하지만 **상수들
 * 사이의 관계**는 잴 수 있고, 창문이 늘어나 보이는지는 거기서 정해진다.
 */

describe("파사드 타일", () => {
  it("가장 작은 건물도 창문 한 칸보다 크다", () => {
    /*
     * 반복 횟수는 `max(1, round(폭 / 칸))`이다. 건물이 한 칸보다 작으면
     * 1이 되어 창문 하나가 벽 전체로 늘어난다.
     */
    // 필지 분할 최소치: 구역을 3x3으로 나눈 한 칸에서 여백을 뺀 정도
    const smallest = CITY.blockSize / 3 - 4;
    expect(smallest, `smallest building ${smallest}m vs cell ${FACADE_CELL_WIDTH}m`).toBeGreaterThan(
      FACADE_CELL_WIDTH,
    );
  });

  it("가장 낮은 건물도 층 한 칸보다 높다", () => {
    /*
     * 도시 전체에 하나였던 높이 상수가 사라지고 구역 규칙에서 거꾸로 재는
     * 값(`BUILDING_HEIGHT_RANGE`)이 정본이 됐다. 여기서 옛 상수를 계속 봤다면
     * 숲의 3.4m 원두막이 이 검사를 **비켜 갔을** 것이다 — 층 배율이 1로 잘려
     * 창문 한 줄이 벽 전체로 늘어나는 자리가 그쪽이다.
     */
    const lowest = Math.min(...Object.values(ZONES).map((zone) => zone.build.minHeight));
    expect(lowest, `가장 낮은 건물 ${lowest}m vs 층 ${FACADE_CELL_HEIGHT}m`).toBeGreaterThan(
      FACADE_CELL_HEIGHT,
    );
  });

  it("층 높이가 사람 키에 비해 그럴듯하다", () => {
    // 2m면 지나다니는 사람보다 낮은 층이 되고, 5m면 창고처럼 보인다
    expect(FACADE_CELL_HEIGHT).toBeGreaterThan(2.4);
    expect(FACADE_CELL_HEIGHT).toBeLessThan(4.5);
  });

  it("가장 높은 건물이 여러 층으로 나뉜다", () => {
    const tallest = Math.max(...Object.values(ZONES).map((zone) => zone.build.maxHeight));
    const floors = tallest / FACADE_CELL_HEIGHT;
    expect(floors, `${floors.toFixed(1)} floors`).toBeGreaterThan(4);
  });

  it("톤이 여러 개다", () => {
    // 하나뿐이면 도시가 한 색으로 보인다
    expect(FACADE_TONES.length).toBeGreaterThan(2);
  });

  it("톤마다 벽·유리·창틀 색이 다르다", () => {
    for (const tone of FACADE_TONES) {
      expect(tone.wall).not.toBe(tone.glass);
      expect(tone.wall).not.toBe(tone.frame);
    }
  });
});

describe("바닥 타일", () => {
  it("도로 타일이 도로 폭보다 작다", () => {
    // 타일 하나가 도로보다 크면 반복이 안 보여 단색 면이 된다
    expect(ASPHALT_TILE_METERS).toBeLessThan(CITY.roadWidth);
  });

  it("보도블록이 도로 타일보다 잘다", () => {
    // 블록 하나하나가 보여야 인도로 읽힌다
    expect(PAVING_TILE_METERS).toBeLessThan(ASPHALT_TILE_METERS);
  });

  it("타일 크기가 양수다", () => {
    expect(ASPHALT_TILE_METERS).toBeGreaterThan(0);
    expect(PAVING_TILE_METERS).toBeGreaterThan(0);
  });
});

/*
 * 아틀라스는 **가장자리를 물려 둔다(ClampToEdge).**
 *
 * 아틀라스는 한 장에 여러 칸을 담고 UV로 잘라 쓴다. 반복(Repeat)으로 두면 칸
 * 경계에서 **반대쪽 칸이 새어 들어와** 간판 가장자리에 엉뚱한 색 줄이 생긴다.
 * 파일 주석이 「반드시 ClampToEdge여야 한다」고 적어 두었는데, Repeat으로 바꿔도
 * 아무 검사가 몰랐다.
 *
 * 두 파일이 정반대 규칙을 쓰므로 **둘 다** 본다: 타일은 반복해야 이어지고
 * (`textures.ts`), 아틀라스는 반복하면 샌다(`atlasTextures.ts`). 한쪽만 보면
 * 규칙을 헷갈려 반대로 고쳐도 통과한다.
 */
describe("텍스처 감싸기 방식", () => {
  it("아틀라스에는 반복이 없다 — 칸 경계에서 반대쪽이 샌다", () => {
    const atlas = readFileSync("src/game/world/atlasTextures.ts", "utf8");
    expect(atlas, "아틀라스에 RepeatWrapping이 들어갔다").not.toContain("RepeatWrapping");
    // 두 축을 다 물려야 한다 — 한쪽만 물리면 그 축에서만 샌다
    expect(atlas).toContain("wrapS = THREE.ClampToEdgeWrapping");
    expect(atlas).toContain("wrapT = THREE.ClampToEdgeWrapping");
  });

  it("반복 타일에는 반복이 있다 — 안 이어지면 바닥에 이음매가 보인다", () => {
    const tiles = readFileSync("src/game/world/textures.ts", "utf8");
    expect(tiles).toContain("wrapS = THREE.RepeatWrapping");
    expect(tiles).toContain("wrapT = THREE.RepeatWrapping");
  });
});
