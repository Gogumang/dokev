import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "@/game/config/tuning";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { ZONE_MAP, zoneForBlock } from "@/game/world/zones";

/*
 * 노을 시장.
 *
 * 필지를 넷·다섯으로 잘게 쪼갠 것만으로는 「건물이 작은 상가」이지 시장이
 * 아니었다. 시장을 시장으로 만드는 것은 **머리 위**다 — 골목을 통째로 덮은
 * 천막 아래로 들어서는 순간 하늘이 가려지면서 다른 공간이 된다.
 */

const layout = buildCityLayout();
const marketBlocks = ZONE_MAP.map((id, index) => ({ id, index })).filter((b) => b.id === "market");

/*
 * 천막은 두 종류다.
 *
 * **도로 천막**은 두 구역 사이 도로를 가로지르고, **골목 천막**은 구역 안쪽
 * 지붕 위에 슬래트처럼 얹힌다. 지켜야 할 것이 서로 다르다 — 도로 천막은
 * 가로등 위에 있어야 하고, 골목 천막은 그 구역 지붕 위에 있어야 한다.
 * 한 덩어리로 재면 둘 중 하나는 엉뚱한 자를 대는 셈이 된다.
 *
 * 도로 천막은 구역 밖(도로 위)에 있고 골목 천막은 안쪽에 있으므로, 구역
 * 중심에서의 거리로 가른다.
 */
const half = CITY.blockSize / 2;
const isRoadCanopy = (piece: { x: number; z: number; blockIndex: number }) => {
  const { cx, cz } = blockCenter(piece.blockIndex);
  return Math.abs(piece.x - cx) > half || Math.abs(piece.z - cz) > half;
};
const roadCanopies = layout.marketCanopies.filter(isRoadCanopy);
const alleyCanopies = layout.marketCanopies.filter((piece) => !isRoadCanopy(piece));

describe("아케이드 천막", () => {
  it("시장에 천막이 걸린다", () => {
    expect(marketBlocks.length, "시장 구역이 없다").toBeGreaterThan(1);
    expect(layout.marketCanopies.length, "천막이 하나도 없다").toBeGreaterThan(10);
  });

  it("다른 구역에는 걸리지 않는다", () => {
    /*
     * 「있다」만 재면 도시 전체를 덮어도 통과한다. 그러면 시장이 특별하지
     * 않고, 무엇보다 번화가 큰길 위에 천막이 뜬다.
     */
    const strays = layout.marketCanopies.filter(
      (piece) => zoneForBlock(piece.blockIndex).id !== "market",
    );
    expect(strays.length, `시장 밖 천막 ${strays.length}개`).toBe(0);
  });

  it("도로 천막이 가로등과 전깃줄 위에 있다", () => {
    /*
     * 천막이 낮으면 가로등을 뚫는다. 가로등 기둥은 5.4m, 갓까지 5.6m다.
     * 화면에서는 천막이 잘린 것처럼 보이는데, 원인은 높이 하나다.
     */
    expect(roadCanopies.length, "도로 천막이 없다").toBeGreaterThan(0);
    const tallestLamp = Math.max(...layout.streetLamps.map((lamp) => lamp.y + lamp.height / 2));
    for (const piece of roadCanopies) {
      expect(piece.y, `천막 ${piece.y}m vs 가로등 꼭대기 ${tallestLamp.toFixed(1)}m`).toBeGreaterThan(
        tallestLamp,
      );
    }
  });

  it("도로를 완전히 가로지른다", () => {
    // 도로보다 좁으면 양옆에 틈이 남아 「덮였다」가 아니라 「걸쳐졌다」가 된다
    for (const piece of roadCanopies) {
      expect(piece.width, `천막 폭 ${piece.width}m vs 도로 ${CITY.roadWidth}m`).toBeGreaterThan(
        CITY.roadWidth,
      );
    }
  });

  it("천막과 하늘이 번갈아 보인다", () => {
    /*
     * 빈틈없이 이으면 통짜 지붕이라 실내가 된다. 사이가 벌어져야 빛이
     * 줄무늬로 떨어지고, 그게 재래시장의 그림이다.
     */
    for (const piece of layout.marketCanopies) {
      expect(piece.depth, `한 폭 깊이 ${piece.depth}m`).toBeLessThan(4.6);
    }
  });

  it("골목에도 천막이 걸린다", () => {
    /*
     * 도로 위만 덮으면 큰길만 천막 아래다. 골목으로 한 발 들어서면 하늘이
     * 열려 있어서 「천막 아래로 골목이 이어진다」는 부제가 거짓이 된다.
     */
    expect(alleyCanopies.length, "골목 천막이 없다").toBeGreaterThan(10);

    const covered = new Set(alleyCanopies.map((piece) => piece.blockIndex));
    for (const block of marketBlocks) {
      expect(covered.has(block.index), `구역 ${block.index}의 골목이 열려 있다`).toBe(true);
    }
  });

  it("골목 천막이 그 구역 지붕을 뚫지 않는다", () => {
    /*
     * 고정 높이로 두면 안 된다. 시장 건물은 4~8m로 제각각이라 6m에 걸면
     * 8m짜리가 천막을 뚫고 나온다 — 천막이 잘린 것처럼 보이는데 원인이
     * 높이 하나라고는 화면에서 안 보인다.
     */
    for (const piece of alleyCanopies) {
      const tallest = layout.buildings
        .filter((building) => building.blockIndex === piece.blockIndex)
        .reduce((high, building) => Math.max(high, building.height), 0);

      expect(
        piece.y,
        `구역 ${piece.blockIndex}: 천막 ${piece.y.toFixed(1)}m vs 지붕 ${tallest.toFixed(1)}m`,
      ).toBeGreaterThan(tallest);
    }
  });

  it("골목 천막 사이로도 하늘이 보인다", () => {
    // 빈틈없이 이으면 통짜 지붕이라 실내가 된다 (도로 천막과 같은 이유)
    for (const piece of alleyCanopies) {
      expect(piece.depth, `한 폭 깊이 ${piece.depth}m`).toBeLessThan(CANOPY_STEP_LIMIT);
    }
  });

  it("월드를 가로질러 걸리지 않는다", () => {
    /*
     * 동쪽 이웃을 `index + 1`로 찾으면 **한 줄의 오른쪽 끝에서 다음 줄로
     * 넘어간다.** 그러면 도로가 아니라 월드를 가로질러 천막이 걸린다.
     * 천막이 자기 구역에서 도로 한 칸 안에 머무는지로 확인한다.
     */
    const reach = CITY.blockSize / 2 + CITY.roadWidth;
    for (const piece of layout.marketCanopies) {
      const { cx, cz } = blockCenter(piece.blockIndex);
      expect(Math.abs(piece.x - cx), `x가 ${Math.abs(piece.x - cx).toFixed(1)}m 떨어졌다`).toBeLessThan(
        reach,
      );
      expect(Math.abs(piece.z - cz), `z가 ${Math.abs(piece.z - cz).toFixed(1)}m 떨어졌다`).toBeLessThan(
        reach,
      );
    }
  });
});

/** 천막 한 폭이 이보다 두꺼우면 사이가 안 벌어져 통짜 지붕이 된다 */
const CANOPY_STEP_LIMIT = 4.6;

describe("좌판", () => {
  it("시장에만 늘어선다", () => {
    expect(layout.marketStalls.length, "좌판이 하나도 없다").toBeGreaterThan(40);
    const strays = layout.marketStalls.filter(
      (piece) => zoneForBlock(piece.blockIndex).id !== "market",
    );
    expect(strays.length, `시장 밖 좌판 ${strays.length}개`).toBe(0);
  });

  it("건물을 파고들지 않는다", () => {
    /*
     * 벽에 박힌 좌판은 건물 안에서 튀어나온 것처럼 보인다. 가로수에서 같은
     * 결함을 두 번 겪었다(고정 여백이 배율을 못 따라간 것).
     */
    const stuck: string[] = [];
    for (const piece of layout.marketStalls) {
      const hit = layout.buildings.find(
        (building) =>
          building.blockIndex === piece.blockIndex &&
          Math.abs(piece.x - building.x) < (piece.width + building.width) / 2 - 0.05 &&
          Math.abs(piece.z - building.z) < (piece.depth + building.depth) / 2 - 0.05,
      );
      if (hit) stuck.push(`(${piece.x.toFixed(1)}, ${piece.z.toFixed(1)})`);
    }
    expect(stuck.slice(0, 5), `건물에 박힌 좌판 ${stuck.length}개`).toEqual([]);
  });

  it("차양 아래로 지나갈 수 있다", () => {
    /*
     * 좌판 차양이 머리보다 낮으면 시장 골목이 통과 불가가 된다. 어린이
     * 주인공이라 해도 2m는 넘어야 화면이 막히지 않는다.
     */
    const awnings = layout.marketStalls.filter((piece) => piece.height < 0.2 && piece.width > 1);
    expect(awnings.length, "좌판 차양을 못 찾았다").toBeGreaterThan(10);
    for (const awning of awnings) {
      expect(awning.y, `차양 높이 ${awning.y}m`).toBeGreaterThan(2);
    }
  });

  it("좌판이 구역 안에 머문다", () => {
    // 도로로 삐져나오면 차가 좌판을 통과한다
    const half = CITY.blockSize / 2;
    for (const piece of layout.marketStalls) {
      const { cx, cz } = blockCenter(piece.blockIndex);
      expect(Math.abs(piece.x - cx), `x ${piece.x}`).toBeLessThan(half);
      expect(Math.abs(piece.z - cz), `z ${piece.z}`).toBeLessThan(half);
    }
  });

  it("좌판 상판을 통과하지 못한다", () => {
    /*
     * 상판에 충돌체가 없으면 시장을 **가로질러 달릴 수 있다.** 그러면 좌판이
     * 장식이지 물건이 아니다.
     */
    const tables = layout.marketStalls.filter(
      (piece) => piece.height > 0.8 && piece.height < 0.9,
    );
    expect(tables.length, "좌판 상판을 못 찾았다").toBeGreaterThan(10);

    for (const table of tables.slice(0, 20)) {
      const collider = layout.colliders.find(
        (box) =>
          Math.abs((box.minX + box.maxX) / 2 - table.x) < 0.01 &&
          Math.abs((box.minZ + box.maxZ) / 2 - table.z) < 0.01,
      );
      expect(collider, `좌판 (${table.x.toFixed(1)}, ${table.z.toFixed(1)})에 충돌체가 없다`).toBeDefined();
    }
  });

  it("좌판 사이로 사람이 지나간다", () => {
    /*
     * 빈틈없이 늘어서면 시장이 아니라 울타리다. 같은 변의 이웃한 두 좌판
     * 사이가 사람 지름보다 넓은지로 본다.
     */
    const tables = layout.marketStalls
      .filter((piece) => piece.height > 0.8 && piece.height < 0.9)
      .slice()
      .sort((a, b) => a.x - b.x || a.z - b.z);

    for (let i = 1; i < tables.length; i += 1) {
      const gap = Math.hypot(tables[i].x - tables[i - 1].x, tables[i].z - tables[i - 1].z);
      if (gap > 6) continue; // 다른 변·다른 구역이다
      expect(gap, `좌판 사이 ${gap.toFixed(2)}m`).toBeGreaterThan(PLAYER_RADIUS * 2);
    }
  });
});
