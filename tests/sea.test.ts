import { describe, expect, it } from "vitest";

import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";
import { ZONE_MAP } from "@/game/world/zones";

/*
 * 바다.
 *
 * 물을 도시 **밖**에 두는 선택이 이 파일이 지키는 것이다. 안으로 들이려면
 * 지형을 바다까지 끌어내려야 하는데, 이 월드의 경사 한계는 20%라 동쪽 두
 * 구역이 통째로 비탈이 된다. 대신 수면을 지형 최저점 바로 아래에 두어,
 * 경계에서 땅이 낮은 자리는 물이 발치까지 오고 마루인 자리는 벼랑이 되게 했다.
 *
 * 그 「바로 아래」가 이 설계의 전부다. 조금만 올리면 도시 안쪽 골짜기가
 * 잠기고, 많이 내리면 물이 멀어져 해안이 사라진다.
 */

const layout = buildCityLayout();

describe("수면 높이", () => {
  it("도시 안쪽이 잠기지 않는다", () => {
    /*
     * 수면을 지형 최저점 위로 올리면 골짜기에 물이 고인다. 바다 지오메트리는
     * 도시 밖만 남기므로 화면에는 안 보이지만, **다음 사람이 수면을 도시
     * 안까지 넓히는 순간** 광장 옆에 호수가 생긴다. 관계를 여기서 못 박는다.
     */
    let lowest = Number.POSITIVE_INFINITY;
    let at = "";
    const reach = layout.halfExtent;

    for (let x = -reach; x <= reach; x += 3) {
      for (let z = -reach; z <= reach; z += 3) {
        const height = terrainHeight(x, z);
        if (height < lowest) {
          lowest = height;
          at = `(${x}, ${z})`;
        }
      }
    }

    expect(lowest, `가장 낮은 땅 ${at} ${lowest.toFixed(2)}m / 수면 ${SEA_LEVEL}m`).toBeGreaterThan(
      SEA_LEVEL,
    );
  });

  it("그렇다고 너무 멀지도 않다", () => {
    /*
     * 「잠기지 않는다」만 지키면 수면을 -100m로 내려도 통과한다. 그러면 어디서나
     * 아득한 벼랑이라 물이 화면에서 사라진다 — 해안 구역의 부제가
     * 「모래밭 너머로 물이 반짝인다」인데 반짝일 물이 안 보인다.
     */
    let lowest = Number.POSITIVE_INFINITY;
    const reach = layout.halfExtent;
    for (let x = -reach; x <= reach; x += 3) {
      for (let z = -reach; z <= reach; z += 3) {
        lowest = Math.min(lowest, terrainHeight(x, z));
      }
    }

    const gap = lowest - SEA_LEVEL;
    expect(gap, `가장 낮은 땅과 수면 사이 ${gap.toFixed(2)}m`).toBeLessThan(3);
  });
});

describe("벼랑이 물을 가리는가", () => {
  it("경계의 모든 지점이 수면보다 높다", () => {
    /*
     * 경계 지형이 수면보다 낮은 자리가 있으면 그 자리에서 **땅이 물속에서
     * 끊긴다** — 벼랑 띠가 위로 뒤집혀 물 위에 벽이 서는 것처럼 보인다.
     */
    const edge = layout.halfExtent;
    const failures: string[] = [];

    for (let t = -edge; t <= edge; t += 2) {
      for (const [x, z] of [
        [t, -edge],
        [t, edge],
        [-edge, t],
        [edge, t],
      ]) {
        const height = terrainHeight(x, z);
        if (height <= SEA_LEVEL) failures.push(`(${x}, ${z}) ${height.toFixed(2)}m`);
      }
    }

    expect(failures.slice(0, 5), `수면 아래 경계 ${failures.length}곳`).toEqual([]);
  });
});

describe("해안 구역이 실제로 물가에 있는가", () => {
  it("해안 구역이 월드 가장자리에 붙어 있다", () => {
    /*
     * 물은 도시 **밖**에 있다. 그러니 「윤슬 해안」이 안쪽 구역이면 그 동네에서는
     * 물이 영영 안 보인다 — 모래만 깔린 동네가 된다. 지도를 고치다 해안을
     * 안쪽으로 옮기면 여기서 걸린다.
     */
    const size = CITY.gridSize;
    const last = size - 1;
    const strays: string[] = [];

    ZONE_MAP.forEach((id, index) => {
      if (id !== "coast") return;
      const col = index % size;
      const row = Math.floor(index / size);
      const onEdge = col === 0 || col === last || row === 0 || row === last;
      if (!onEdge) strays.push(`구역 ${index} (col ${col}, row ${row})`);
    });

    expect(strays, `가장자리에 없는 해안 구역:\n${strays.join("\n")}`).toEqual([]);
  });

  it("해안 구역 한가운데에서 물까지가 한 구역 안이다", () => {
    // 가장자리에 붙어 있어도 반대쪽 변에 붙어 있으면 물이 멀다
    const size = CITY.gridSize;
    const last = size - 1;
    const pitch = CITY.blockSize + CITY.roadWidth;

    ZONE_MAP.forEach((id, index) => {
      if (id !== "coast") return;
      const { cx, cz } = blockCenter(index);
      const col = index % size;
      const row = Math.floor(index / size);

      const distances: number[] = [];
      if (col === 0) distances.push(Math.abs(cx + layout.halfExtent));
      if (col === last) distances.push(Math.abs(layout.halfExtent - cx));
      if (row === 0) distances.push(Math.abs(cz + layout.halfExtent));
      if (row === last) distances.push(Math.abs(layout.halfExtent - cz));

      const nearest = Math.min(...distances);
      expect(nearest, `구역 ${index} 중심에서 물까지 ${nearest.toFixed(0)}m`).toBeLessThan(pitch);
    });
  });
});
