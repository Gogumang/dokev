import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { blockCenter, CITY, ROAD_CENTERS } from "@/game/world/cityLayout";
import { buildSidewalkSurface, SIDEWALK_SLAB_SIZE, surfaceHeight } from "@/game/world/sidewalks";
import { terrainHeight } from "@/game/world/terrain";
import { CROWD } from "@/game/world/crowdLayout";
import { isUrbanBlock } from "@/game/world/zones";

/*
 * 인도 면.
 *
 * `worldConsistency`가 1200줄 상한을 넘어 떼어 냈다. 상한이 「이 묶음은 다른
 * 책임인가」를 묻게 했고 답은 그렇다였다 — 나머지는 **배치 데이터끼리의**
 * 정합성인데, 이것은 인도라는 한 면이 지형과 맞는가를 본다.
 */

const HALF_PITCH = (CITY.blockSize + CITY.roadWidth) / 2;

/** 그 좌표가 도로와 도로의 정확한 한가운데인가. 구역 중심에만 쓸 수 있다 */
function betweenRoads(value: number): boolean {
  const left = ROAD_CENTERS.some((road) => Math.abs(road - (value - HALF_PITCH)) < 1e-6);
  const right = ROAD_CENTERS.some((road) => Math.abs(road - (value + HALF_PITCH)) < 1e-6);
  return left && right;
}

describe("인도가 깔린 자리", () => {
  it("보도블록이 도시 구역에만, 도로 사이 한가운데 깔린다", () => {
    /*
     * 화면 안(useMemo)에 있을 때는 좌표가 틀려도 값으로 잴 데가 없었다 —
     * 정본을 검사로 묶어 두어도 화면 쪽에서 딴 값을 쓰면 통과했다. 밖으로 빼서
     * 여기서 잰다. 어긋나면 보도블록이 도로 위에 깔리고 구역 사이가 빈다.
     *
     * 인도가 구역마다 상자 하나에서 **면 하나**로 바뀌었다. 「구역마다 하나씩」을
     * 셀 수 없게 되었으므로, 대신 **정점이 어느 구역 위에 있는지**로 잰다.
     */
    const surface = buildSidewalkSurface(SIDEWALK_SLAB_SIZE, 1);
    expect(surface.positions.length, "인도 면이 비었다").toBeGreaterThan(0);

    /*
     * 숲·공원·해안·옛 마을에는 보도블록을 깔지 않는다 — 깔면 풀밭 위에 회색
     * 판이 떠서, 나무를 아무리 심어도 「나무를 심은 도로」로 보인다.
     */
    const covered = new Set<number>();
    for (let i = 0; i < surface.positions.length; i += 3) {
      const x = surface.positions[i];
      const z = surface.positions[i + 2];
      /*
       * 판이 구역보다 조금 커서 가장자리 정점은 도로 위로 나간다(도로와
       * 맞물리라고 그렇게 만들었다). 한가운데인지 재는 것은 **안쪽** 정점만이다.
       */
      const col = Math.round(x / (CITY.blockSize + CITY.roadWidth) + (CITY.gridSize - 1) / 2);
      const row = Math.round(z / (CITY.blockSize + CITY.roadWidth) + (CITY.gridSize - 1) / 2);
      const index = row * CITY.gridSize + col;
      expect(
        isUrbanBlock(index),
        `(${x.toFixed(1)}, ${z.toFixed(1)})의 인도가 자연 구역에 있다`,
      ).toBe(true);
      covered.add(index);
    }

    /*
     * `betweenRoads`는 「도로와 도로의 **정확한** 한가운데인가」를 묻는다 —
     * 임의의 점이 아니라 구역 중심에만 쓸 수 있다. 정점마다 들이댔다가
     * 인도 가장자리에서 걸렸다.
     */
    for (const index of covered) {
      const { cx, cz } = blockCenter(index);
      expect(betweenRoads(cx), `인도가 깔린 구역 ${index} x=${cx}`).toBe(true);
      expect(betweenRoads(cz), `인도가 깔린 구역 ${index} z=${cz}`).toBe(true);
    }

    const urban = Array.from({ length: CITY.gridSize * CITY.gridSize }, (_, i) => i).filter(
      isUrbanBlock,
    );
    expect(covered.size, `인도가 깔린 구역 ${covered.size} / 도시 구역 ${urban.length}`).toBe(
      urban.length,
    );
  });

  it("인도가 지형을 따라간다 — 공중에 뜨지 않는다", () => {
    /*
     * **이 검사가 실제 결함에서 나왔다.**
     *
     * 인도는 구역마다 38m짜리 상자 하나였다. 상자에는 그 중심의 지형 높이가
     * **한 번만** 더해지므로 판이 완전히 평평했는데, 그 아래 지형은 한 구역
     * 안에서 ±2m씩 오르내린다. 화면에서는 구역 가장자리에서 인도가 **2.76m
     * 공중에 떠서** 회색 벽처럼 걸렸고, 플레이어는 지형 위를 걸으므로 그
     * 자리에서 인도 **아래**를 걸었다.
     *
     * 「인도 두께만큼만 떠 있다」를 못 박아 둔다. 다시 평평한 판으로 돌아가면
     * 여기서 걸린다.
     */
    const surface = buildSidewalkSurface(SIDEWALK_SLAB_SIZE, 1);
    let worst = 0;
    let worstAt = "";
    for (let i = 0; i < surface.positions.length; i += 3) {
      const [x, y, z] = [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]];
      const above = y - terrainHeight(x, z);
      if (above < 0) continue; // 치마 정점 — 일부러 땅에 파묻는다
      if (Math.abs(above - CITY.sidewalkHeight) > worst) {
        worst = Math.abs(above - CITY.sidewalkHeight);
        worstAt = `(${x.toFixed(1)}, ${z.toFixed(1)})`;
      }
    }
    expect(worst, `${worstAt}에서 ${worst.toFixed(2)}m 어긋난다`).toBeLessThan(0.01);
  });
});

describe("사람이 딛는 면", () => {
  /*
   * 플레이어만 지형 높이를 딛고 있었다. 보행자는 `crowdLayout.groundY`로 판
   * 위에 서는데, 같은 보도에서 **지나가는 사람보다 16cm 낮게** 걷고 신발이
   * 포장에 파묻혔다. 도시 구역 전체에 늘 깔려 있는 어긋남이라, 한 번 보면
   * 어디서나 보인다.
   */
  const urban = Array.from({ length: CITY.gridSize * CITY.gridSize }, (_, i) => i).filter(
    isUrbanBlock,
  );
  const natural = Array.from({ length: CITY.gridSize * CITY.gridSize }, (_, i) => i).filter(
    (i) => !isUrbanBlock(i),
  );

  it("도시 구역에서는 인도 위다", () => {
    for (const index of urban) {
      const { cx, cz } = blockCenter(index);
      expect(
        surfaceHeight(cx, cz) - terrainHeight(cx, cz),
        `구역 ${index}에서 딛는 높이`,
      ).toBeCloseTo(CITY.sidewalkHeight, 6);
    }
  });

  it("자연 구역에서는 지형 그대로다", () => {
    // 숲과 공원에는 인도가 없다. 거기서 16cm 뜨면 풀 위를 떠서 걷는다
    for (const index of natural) {
      const { cx, cz } = blockCenter(index);
      expect(surfaceHeight(cx, cz), `구역 ${index}`).toBeCloseTo(terrainHeight(cx, cz), 6);
    }
  });

  it("판 바깥(차도)에서는 내려온다", () => {
    /*
     * 연석에서 턱이 진다. 판 밖까지 올라와 있으면 도로 한복판을 인도 높이로
     * 걷게 되어, 차선 위를 떠서 지나간다.
     */
    const { cx, cz } = blockCenter(urban[0]);
    const outside = SIDEWALK_SLAB_SIZE / 2 + 0.5;
    expect(surfaceHeight(cx + outside, cz), "도로 위인데 인도 높이다").toBeCloseTo(
      terrainHeight(cx + outside, cz),
      6,
    );
  });

  it("보행자와 같은 높이를 딛는다", () => {
    /*
     * 보행자는 `CROWD.groundY`(= `CITY.sidewalkHeight`)로 판 위에 선다.
     * 두 값이 갈라지면 같은 보도에서 키가 다른 두 종류가 걷는다.
     */
    const { cx, cz } = blockCenter(urban[0]);
    expect(surfaceHeight(cx, cz) - terrainHeight(cx, cz)).toBeCloseTo(CROWD.groundY, 6);
  });

  it("이동 코드가 실제로 이 함수를 쓴다", () => {
    /*
     * 함수만 만들고 걸지 않으면 검사는 전부 통과하는데 화면에서는 그대로
     * 파묻힌 채다 — 이 저장소에서 가장 흔했던 결함 모양이다.
     */
    const source = readFileSync("src/game/scene/PlayerRig.tsx", "utf8");
    expect(source, "PlayerRig가 딛는 면을 읽지 않는다").toContain("surfaceHeight(");
    expect(source, "발 높이를 아직 지형에서 읽는다").not.toMatch(
      /groundHeight\s*=\s*terrainHeight\(/,
    );
  });
});
