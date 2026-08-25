import { describe, expect, it } from "vitest";

import { buildCityDetails } from "@/game/world/cityDetails";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";
import { ZONE_MAP, zoneForBlock } from "@/game/world/zones";

/*
 * 너른 공원.
 *
 * 「잔디밭과 놀이터」라는 부제를 붙여 놓고 실제로는 나무를 촘촘히 심은 빈
 * 벌판이었다. 잔디와 나무는 숲에도 있다 — **사람이 놓은 것**이 있어야 숲과
 * 갈린다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);
const parkBlocks = ZONE_MAP.map((id, index) => ({ id, index })).filter((b) => b.id === "park");

describe("연못", () => {
  it("공원 구역마다 하나씩 있다", () => {
    expect(parkBlocks.length, "공원 구역이 없다").toBeGreaterThan(0);

    for (const block of parkBlocks) {
      const water = layout.pondWater.filter((piece) => piece.blockIndex === block.index);
      const rim = layout.pondRim.filter((piece) => piece.blockIndex === block.index);
      expect(water.length, `구역 ${block.index}의 수면 ${water.length}개`).toBe(1);
      expect(rim.length, `구역 ${block.index}의 테두리 ${rim.length}개`).toBe(4);
    }
  });

  it("공원 밖에는 없다", () => {
    const strays = [...layout.pondWater, ...layout.pondRim].filter(
      (p) => zoneForBlock(p.blockIndex).id !== "park",
    );
    expect(strays.length, `공원 밖 연못 ${strays.length}개`).toBe(0);
  });

  it("수면이 비탈에서도 뜨지 않게 파묻힌다", () => {
    /*
     * 수면은 한 장짜리 평면인데 공원 땅은 기울어 있다. 파묻지 않으면 낮은 쪽
     * 모서리가 뜨고 그 밑으로 잔디가 비친다 — 물이 공중에 얹힌 것으로 보인다.
     *
     * 연못 폭에 걸친 실제 높이차보다 파묻는 깊이가 커야 한다.
     */
    /*
     * 예전에는 `pondParts`에서 색 번호로 수면을 골랐다. 배치가 수면과 테두리를
     * 나눠 내놓으면서 그 추측이 필요 없어졌다 — 색으로 무엇인지 알아내는 것은
     * 그래플 앵커에서 이미 한 번 데인 방식이다.
     */
    const surfaces = layout.pondWater;
    expect(surfaces.length, "수면을 못 찾았다").toBeGreaterThan(0);

    for (const pond of surfaces) {
      const half = pond.width / 2;
      let lowest = Number.POSITIVE_INFINITY;
      let highest = Number.NEGATIVE_INFINITY;
      for (const dx of [-half, 0, half]) {
        for (const dz of [-half, 0, half]) {
          const height = terrainHeight(pond.x + dx, pond.z + dz);
          lowest = Math.min(lowest, height);
          highest = Math.max(highest, height);
        }
      }

      const drop = highest - lowest;
      expect(
        pond.sink ?? 0,
        `연못 자리 높이차 ${drop.toFixed(2)}m, 파묻기 ${pond.sink}m`,
      ).toBeGreaterThan(drop);
    }
  });
});

describe("놀이터", () => {
  it("미끄럼틀이 기울어 있다", () => {
    /*
     * 기울기 없이 눕히면 발판에서 바닥까지 **계단 없는 절벽**이 되어
     * 놀이기구로 안 읽힌다. 값이 0이면 화면은 판때기 하나다.
     */
    const tilted = layout.playground.filter((piece) => Math.abs(piece.tiltZ ?? 0) > 0.01);
    expect(tilted.length, "기울어진 조각이 하나도 없다").toBeGreaterThanOrEqual(parkBlocks.length);
  });

  it("그네와 미끄럼틀 기둥에 충돌체가 있다", () => {
    /*
     * 기둥을 통과하면 놀이기구가 장식이지 물건이 아니다. 그네 기둥 둘 +
     * 미끄럼틀 기둥 둘 = 구역당 넷.
     */
    for (const block of parkBlocks) {
      const posts = layout.playground.filter(
        (piece) => piece.blockIndex === block.index && piece.width < 0.2 && piece.height > 2,
      );
      expect(posts.length, `구역 ${block.index}의 기둥 ${posts.length}개`).toBe(4);

      for (const post of posts) {
        const collider = layout.colliders.find(
          (box) =>
            Math.abs((box.minX + box.maxX) / 2 - post.x) < 0.01 &&
            Math.abs((box.minZ + box.maxZ) / 2 - post.z) < 0.01,
        );
        expect(
          collider,
          `기둥 (${post.x.toFixed(1)}, ${post.z.toFixed(1)})에 충돌체가 없다`,
        ).toBeDefined();
      }
    }
  });

  it("놀이기구가 구역 안에 머문다", () => {
    const half = CITY.blockSize / 2;
    for (const piece of [
      ...layout.playground,
      ...layout.pondWater,
      ...layout.pondRim,
      ...layout.parkPaths,
    ]) {
      const { cx, cz } = blockCenter(piece.blockIndex);
      expect(Math.abs(piece.x - cx), `x ${piece.x}`).toBeLessThan(half);
      expect(Math.abs(piece.z - cz), `z ${piece.z}`).toBeLessThan(half);
    }
  });
});

describe("산책로", () => {
  it("구역을 한 바퀴 돈다", () => {
    // 한 변만 깔리면 길이 아니라 띠다
    for (const block of parkBlocks) {
      const tiles = layout.parkPaths.filter((piece) => piece.blockIndex === block.index);
      const { cx, cz } = blockCenter(block.index);

      const north = tiles.some((t) => t.z < cz - 10);
      const south = tiles.some((t) => t.z > cz + 10);
      const west = tiles.some((t) => t.x < cx - 10);
      const east = tiles.some((t) => t.x > cx + 10);

      expect([north, south, west, east], `구역 ${block.index}의 산책로가 한 바퀴 안 돈다`).toEqual([
        true,
        true,
        true,
        true,
      ]);
    }
  });

  it("포석이 겹쳐 놓이지 않는다", () => {
    /*
     * 네 변을 각각 도는데 **모서리에서 두 줄이 같은 점**을 가리킨다. 겹치면
     * 그 자리만 짙어지고 인스턴스만 낭비된다 — 가로등에서 이미 겪은 모양이다.
     */
    const seen = new Set<string>();
    const doubled: string[] = [];
    for (const tile of layout.parkPaths) {
      const key = `${tile.x.toFixed(2)},${tile.z.toFixed(2)}`;
      if (seen.has(key)) doubled.push(key);
      seen.add(key);
    }
    expect(doubled.slice(0, 5), `겹친 포석 ${doubled.length}개`).toEqual([]);
  });
});

describe("나무가 연못과 놀이터를 피하는가", () => {
  it("물 위에도 미끄럼틀에도 나무가 서지 않는다", () => {
    /*
     * 공원은 나무 밀도가 높아(1000㎡당 12그루) 비워 두지 않으면 **반드시**
     * 걸린다. `layout.treeExclusions`가 배치끼리 주고받는 유일한 통로다.
     */
    expect(layout.treeExclusions.length, "비워 달라는 자리가 하나도 없다").toBeGreaterThan(0);

    const stuck: string[] = [];
    for (const trunk of details.treeTrunks) {
      const hit = layout.treeExclusions.find(
        (spot) => Math.hypot(spot.x - trunk.x, spot.z - trunk.z) < spot.radius,
      );
      if (hit) stuck.push(`(${trunk.x.toFixed(1)}, ${trunk.z.toFixed(1)})`);
    }
    expect(stuck.slice(0, 5), `비워 둔 자리에 선 나무 ${stuck.length}그루`).toEqual([]);
  });

  it("그렇다고 공원에서 나무가 사라지지도 않았다", () => {
    /*
     * 「없다」만 재면 공원 나무를 통째로 지워도 통과한다. 이 저장소에서
     * 폴백이 조용히 정상 경로를 삼킨 적이 있어 반대쪽도 함께 잰다.
     */
    const parkTrees = details.treeTrunks.filter(
      (trunk) => zoneForBlock(trunk.blockIndex).id === "park",
    );
    expect(parkTrees.length, `공원 나무 ${parkTrees.length}그루`).toBeGreaterThan(10);
  });
});
