import { describe, expect, it } from "vitest";

import { buildCityDetails } from "@/game/world/cityDetails";
import { buildCityLayout } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";
import { zoneForBlock } from "@/game/world/zones";

/*
 * 건물 실루엣.
 *
 * 필지마다 직육면체 하나였다 — 색과 간판은 화려한데 하늘을 배경으로 한
 * 윤곽은 톱니 없는 상자 밭이었다. 실제 한국 도심도 일정 높이 위는 사선
 * 제한으로 뒤로 물러나고 옥탑방·계단실이 한 단 올라앉는다. 그 한 단이
 * 실루엣을 만든다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);

describe("계단식 후퇴", () => {
  it("일부 건물 위에 실제로 올라간다", () => {
    expect(layout.setbacks.length, "옥탑이 하나도 없다").toBeGreaterThan(5);
  });

  it("전부에 올리지는 않는다", () => {
    // 모든 건물이 같은 리듬이면 규칙이 보여 오히려 인공적이다
    expect(layout.setbacks.length).toBeLessThan(layout.buildings.length);
  });

  it("아래층보다 좁다", () => {
    /*
     * 같거나 넓으면 「한 단 올렸다」가 아니라 건물이 그냥 길어진 것이다.
     * 위가 넓으면 아래층 밖으로 튀어나와 공중에 떠 보인다.
     */
    for (const tower of layout.setbacks) {
      const base = layout.buildings.find(
        (building) =>
          Math.abs(building.x - tower.x) < building.width &&
          Math.abs(building.z - tower.z) < building.depth &&
          Math.abs(building.height - (tower.y - tower.height / 2)) < 0.001,
      );
      expect(
        base,
        `옥탑 (${tower.x.toFixed(1)}, ${tower.z.toFixed(1)})의 아래층을 못 찾았다`,
      ).toBeDefined();
      if (!base) continue;

      expect(tower.width, `폭 ${tower.width} vs ${base.width}`).toBeLessThan(base.width);
      expect(tower.depth, `깊이 ${tower.depth} vs ${base.depth}`).toBeLessThan(base.depth);
    }
  });

  it("아래층 발자국 안에 들어온다", () => {
    // 밖으로 나가면 허공에 걸린 상자가 된다
    for (const tower of layout.setbacks) {
      const base = layout.buildings.find(
        (building) =>
          Math.abs(building.height - (tower.y - tower.height / 2)) < 0.001 &&
          Math.abs(building.x - tower.x) < building.width &&
          Math.abs(building.z - tower.z) < building.depth,
      );
      if (!base) continue;

      const overhangX = Math.abs(tower.x - base.x) + tower.width / 2 - base.width / 2;
      const overhangZ = Math.abs(tower.z - base.z) + tower.depth / 2 - base.depth / 2;
      expect(overhangX, `x로 ${overhangX.toFixed(2)}m 튀어나왔다`).toBeLessThanOrEqual(0.001);
      expect(overhangZ, `z로 ${overhangZ.toFixed(2)}m 튀어나왔다`).toBeLessThanOrEqual(0.001);
    }
  });

  it("아래층 꼭대기에 정확히 얹힌다", () => {
    // 사이가 뜨면 공중에 뜨고, 파고들면 두 겹으로 보인다
    for (const tower of layout.setbacks) {
      const bottom = tower.y - tower.height / 2;
      const base = layout.buildings.find(
        (building) =>
          Math.abs(building.x - tower.x) < building.width &&
          Math.abs(building.z - tower.z) < building.depth &&
          Math.abs(building.height - bottom) < 0.001,
      );
      expect(base, `바닥 ${bottom.toFixed(2)}에 맞는 아래층이 없다`).toBeDefined();
    }
  });

  it("낮은 건물에는 올리지 않는다", () => {
    // 3층짜리 위에 옥탑을 얹으면 건물이 아니라 상자 두 개로 보인다
    for (const tower of layout.setbacks) {
      const bottom = tower.y - tower.height / 2;
      expect(bottom, `${bottom.toFixed(1)}m 건물 위에 올렸다`).toBeGreaterThan(14);
    }
  });

  it("옥탑에는 1층 상가가 붙지 않는다", () => {
    /*
     * 옥탑을 건물 목록에 섞으면 `cityDetails`가 지면에 상가 띠를 하나 더
     * 만들고 공중에 간판을 단다. 그래서 배치에서 나눠 두었다 — 이 검사가
     * 그 이유를 지킨다.
     *
     * 「건물 수와 같다」에서 「**상가가 붙는** 건물 수와 같다」로 바뀌었다.
     * 옛 마을에는 상가를 붙이지 않는다 — 담과 홍살문을 세워 놓고 그 벽에
     * 줄무늬 차양과 쇼윈도가 붙어 있으면 「기와지붕을 얹은 상가」로 보인다.
     * 전체 수로 재면 옥탑이 섞여 든 것과 옛 마을이 빠진 것이 **상쇄되어**
     * 통과할 수 있으므로, 세는 대상을 정확히 맞춘다.
     */
    const shopBuildings = layout.buildings.filter(
      (building) => zoneForBlock(building.blockIndex).id !== "shrine",
    );
    expect(details.shopfronts.length).toBe(shopBuildings.length);
  });

  it("옛 마을 건물에는 상가가 붙지 않는다", () => {
    const strays = details.shopfronts.filter(
      (front) => zoneForBlock(front.blockIndex).id === "shrine",
    );
    expect(strays.length, `옛 마을의 1층 상가 ${strays.length}개`).toBe(0);
  });

  it("옥탑에 올라설 수 있다", () => {
    // 충돌체가 없으면 옥상에서 옥탑을 통과해 걸어 들어간다
    for (const tower of layout.setbacks) {
      const top = tower.y + tower.height / 2;
      const collider = layout.colliders.find(
        (box) =>
          Math.abs((box.minX + box.maxX) / 2 - tower.x) < 0.001 &&
          Math.abs((box.minZ + box.maxZ) / 2 - tower.z) < 0.001,
      );
      expect(
        collider,
        `옥탑 (${tower.x.toFixed(1)}, ${tower.z.toFixed(1)})에 충돌체가 없다`,
      ).toBeDefined();
      // 충돌체는 그 자리의 지면 높이 위다 — 배치 데이터의 y는 평지 기준이다
      if (collider) expect(collider.top).toBeCloseTo(terrainHeight(tower.x, tower.z) + top);
    }
  });
});
