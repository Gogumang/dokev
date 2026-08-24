import { describe, expect, it } from "vitest";

import { ROAD_MARK_TONE, type CityDetails } from "@/game/world/cityDetails";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { addPowerLines, sagShape } from "@/game/world/powerLines";
import { CURB_EDGE } from "@/game/world/sidewalks";
import { buildDrainCovers, buildTactileGuideways } from "@/game/world/streetGround";
import { terrainHeight } from "@/game/world/terrain";
import { isUrbanBlock } from "@/game/world/zones";

/*
 * 발밑 — 점자블록, 빗물받이, 맨홀, 그리고 머리 위 전깃줄.
 *
 * 전부 **좌표가 조금만 틀려도 화면에서만 드러나는** 것들이다. 점자블록이
 * 90cm만 밖으로 나가면 허공에 뜬 노란 띠가 되고, 30cm만 안으로 들어가면
 * 건물 벽에 먹혀 사라진다. 예외도 경고도 나지 않는다.
 */

const BLOCKS = CITY.gridSize * CITY.gridSize;
const guideways = buildTactileGuideways(ROAD_MARK_TONE.yellow);
const drains = buildDrainCovers(ROAD_MARK_TONE.darkMetal);

/** 구역 중심 기준 좌표로 옮긴다 — 어느 구역이든 같은 모양이어야 한다 */
function local(plate: { x: number; z: number; blockIndex: number }): { x: number; z: number } {
  const { cx, cz } = blockCenter(plate.blockIndex);
  return { x: plate.x - cx, z: plate.z - cz };
}

/** 두 판이 바닥에서 겹치는가 */
function overlaps(
  a: { x: number; z: number; width: number; depth: number },
  b: { x: number; z: number; width: number; depth: number },
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  // 맞닿는 것은 겹침이 아니다 — 부동소수 오차만큼 여유를 둔다
  return dx < (a.width + b.width) / 2 - 1e-6 && dz < (a.depth + b.depth) / 2 - 1e-6;
}

describe("점자블록", () => {
  /*
   * 「모든 구역」에서 「도시 구역」으로 바뀌었다.
   *
   * 점자블록은 인도 위에 깔린다. 숲·공원·해안·옛 마을에는 인도가 없으므로
   * 깔 자리도 없다 — 그대로 두면 풀밭 위에 노란 띠만 떠 있다.
   */
  const URBAN_BLOCKS = Array.from({ length: BLOCKS }, (_, i) => i).filter(isUrbanBlock);

  /** 그 도막이 구역의 어느 변에 있는가. 없으면 null */
  function sideOf(plate: { x: number; z: number; blockIndex: number }): string | null {
    const { x, z } = local(plate);
    const reach = Math.max(Math.abs(x), Math.abs(z));
    if (Math.abs(Math.abs(x) - reach) < 1e-6 && Math.abs(x) > Math.abs(z)) return x > 0 ? "동" : "서";
    if (Math.abs(Math.abs(z) - reach) < 1e-6 && Math.abs(z) > Math.abs(x)) return z > 0 ? "남" : "북";
    return null;
  }

  it("도시 구역마다 네 변에 다 깔린다", () => {
    /*
     * 예전에는 「구역마다 네 조각」이었다. 띠를 **잘게 쪼개면서**(지형을
     * 따라가게 하려고) 조각 수가 변마다 여럿이 되었으므로, 수를 세는 대신
     * **네 변이 다 덮이는가**를 잰다 — 원래 그 검사가 지키려던 것이 그것이다.
     */
    for (const index of URBAN_BLOCKS) {
      const sides = new Set(
        guideways.filter((plate) => plate.blockIndex === index).map(sideOf).filter(Boolean),
      );
      expect(sides.size, `구역 ${index}의 변 ${[...sides].join(",")}`).toBe(4);
    }
  });

  it("모든 도시 구역에 빠짐없이 깔린다", () => {
    const covered = new Set(guideways.map((plate) => plate.blockIndex));
    expect(covered.size, `깔린 구역 ${covered.size}개`).toBe(URBAN_BLOCKS.length);
  });

  it("자연 구역에는 한 조각도 없다", () => {
    const strays = guideways.filter((plate) => !isUrbanBlock(plate.blockIndex));
    expect(strays.length, `자연 구역의 점자블록 ${strays.length}개`).toBe(0);
  });

  it("인도 위에 얹힌다 — 도로 높이에 두면 턱 밑에 묻힌다", () => {
    for (const plate of guideways) {
      expect(plate.y, `y=${plate.y}, 인도 ${CITY.sidewalkHeight}`).toBeGreaterThan(
        CITY.sidewalkHeight,
      );
      expect(plate.y, `y=${plate.y} — 공중에 떴다`).toBeLessThan(CITY.sidewalkHeight + 0.1);
    }
  });

  it("연석 안쪽에 온전히 들어간다 — 반쯤 걸치면 차도로 흘러내린 것처럼 보인다", () => {
    for (const plate of guideways) {
      const { x, z } = local(plate);
      const outer = Math.max(Math.abs(x) + plate.width / 2, Math.abs(z) + plate.depth / 2);
      expect(outer, `바깥 끝 ${outer} / 연석 ${CURB_EDGE}`).toBeLessThanOrEqual(CURB_EDGE);
    }
  });

  it("네 조각이 서로 겹치지 않는다 — 같은 높이로 겹치면 걸을 때 깜빡인다", () => {
    const first = guideways.filter((plate) => plate.blockIndex === 0);
    const clashes: string[] = [];
    for (let i = 0; i < first.length; i += 1) {
      for (let j = i + 1; j < first.length; j += 1) {
        if (overlaps(first[i], first[j])) clashes.push(`${i}-${j}`);
      }
    }
    expect(clashes, `겹친 짝: ${clashes.join(", ")}`).toEqual([]);
  });

  it("테두리가 닫힌다 — 모서리가 벌어지면 길잡이가 끊긴다", () => {
    /*
     * 남북 두 줄은 끝까지 뻗고 동서 두 줄이 그 사이를 메운다. 동서 줄의 끝이
     * 남북 줄에 **닿아야** 한 바퀴가 이어진다.
     *
     * 도막으로 쪼갠 뒤로는 「줄 하나」를 집을 수 없다. 같은 변의 도막을 모아
     * **뻗은 끝**을 재고, 그 값이 다른 변 띠의 안쪽 모서리에 닿는지 본다.
     */
    // 0번 구역은 이제 숲이라 한 조각도 없다. 도시 구역 하나를 골라 잰다.
    const ring = guideways.filter((plate) => plate.blockIndex === URBAN_BLOCKS[0]);
    const west = ring.filter((plate) => sideOf(plate) === "서");
    const north = ring.filter((plate) => sideOf(plate) === "북");
    expect(west.length, "서쪽 변이 비었다").toBeGreaterThan(0);
    expect(north.length, "북쪽 변이 비었다").toBeGreaterThan(0);

    // 세로 줄이 z로 얼마나 멀리까지 뻗는가
    const reach = Math.max(...west.map((plate) => Math.abs(local(plate).z) + plate.depth / 2));
    // 가로 줄 띠의 안쪽 모서리
    const bandInner = Math.abs(local(north[0]).z) - north[0].depth / 2;
    expect(reach, `세로 줄 끝 ${reach.toFixed(2)} / 가로 줄 안쪽 ${bandInner.toFixed(2)}`).toBeGreaterThanOrEqual(
      bandInner - 1e-6,
    );
  });

  it("건물에 먹히지 않는다 — 벽 안쪽에 깔리면 아예 안 보인다", () => {
    const layout = buildCityLayout();
    const swallowed = layout.buildings.filter((building) =>
      guideways.some(
        (plate) => plate.blockIndex === building.blockIndex && overlaps(plate, building),
      ),
    );
    expect(swallowed.length, `건물 ${swallowed.length}채가 점자블록을 덮는다`).toBe(0);
  });

  it("넘긴 색을 그대로 쓴다 — 숫자를 스스로 정하면 팔레트가 밀릴 때 어긋난다", () => {
    const other = buildTactileGuideways(ROAD_MARK_TONE.white);
    expect(new Set(guideways.map((plate) => plate.tone))).toEqual(new Set([ROAD_MARK_TONE.yellow]));
    expect(new Set(other.map((plate) => plate.tone))).toEqual(new Set([ROAD_MARK_TONE.white]));
  });
});

describe("빗물받이와 맨홀", () => {
  it("도로 높이에 눕는다 — 인도 위에 올리면 턱 위에 떠 보인다", () => {
    for (const plate of drains) {
      expect(plate.y, `y=${plate.y} / 인도 ${CITY.sidewalkHeight}`).toBeLessThan(
        CITY.sidewalkHeight,
      );
      expect(plate.y, `y=${plate.y} — 바닥 아래로 꺼졌다`).toBeGreaterThan(0);
    }
  });

  it("전부 연석 바깥, 도로 안이다 — 넘어가면 반대편 구역 인도를 밟는다", () => {
    const roadFar = CURB_EDGE + CITY.roadWidth;
    for (const plate of drains) {
      const { x, z } = local(plate);
      const reach = Math.max(Math.abs(x), Math.abs(z));
      expect(reach, `${reach} — 연석 ${CURB_EDGE} 안쪽이다`).toBeGreaterThan(CURB_EDGE);
      expect(reach, `${reach} — 도로 끝 ${roadFar}을 넘었다`).toBeLessThan(roadFar);
    }
  });

  it("연석을 따라가는 것과 흩어진 것이 함께 있다", () => {
    /*
     * 규칙적인 것만 있으면 도면 같고, 흩어진 것만 있으면 아무 데나 뚫린 것처럼
     * 보인다. **둘 다** 있어야 사람이 놓은 것처럼 보인다.
     */
    // 0번 구역은 이제 숲이라 빗물받이가 없다 — 도시 구역 하나를 골라 잰다
    const sample = Array.from({ length: CITY.gridSize * CITY.gridSize }, (_, i) => i).find(
      isUrbanBlock,
    ) as number;
    const first = drains.filter((plate) => plate.blockIndex === sample);
    const square = first.filter((plate) => plate.width === plate.depth);
    const oblong = first.filter((plate) => plate.width !== plate.depth);
    expect(oblong.length, `길쭉한 것 ${oblong.length}개 (빗물받이)`).toBe(4);
    expect(square.length, `네모난 것 ${square.length}개 (맨홀)`).toBeGreaterThan(0);
  });

  it("두 번 만들어도 같다 — 난수를 쓰지만 씨앗이 고정이다", () => {
    const again = buildDrainCovers(ROAD_MARK_TONE.darkMetal);
    expect(again.map((plate) => `${plate.x.toFixed(3)},${plate.z.toFixed(3)}`)).toEqual(
      drains.map((plate) => `${plate.x.toFixed(3)},${plate.z.toFixed(3)}`),
    );
  });
});

describe("전깃줄 처짐", () => {
  it("양 끝은 0, 가운데가 가장 깊다", () => {
    expect(sagShape(0)).toBe(0);
    expect(sagShape(1)).toBe(0);
    expect(sagShape(0.5)).toBe(1);
  });

  it("좌우 대칭이다 — 한쪽만 처지면 끊어진 것처럼 보인다", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(sagShape(t), `t=${t}`).toBeCloseTo(sagShape(1 - t), 10);
    }
  });

  it("0과 1 사이를 벗어나지 않는다 — 넘으면 줄이 땅을 뚫는다", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(sagShape(t), `t=${t} → ${sagShape(t)}`).toBeGreaterThanOrEqual(0);
      expect(sagShape(t), `t=${t} → ${sagShape(t)}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("전깃줄", () => {
  const details = { wireVertices: [] as number[] } as CityDetails;
  addPowerLines(details, buildCityLayout());
  /*
   * **지면 위 높이**로 잰다.
   *
   * 지형 고저차가 생기면서 전선의 절대 y는 언덕에서 오르고 골에서 내려간다 —
   * 절대값으로 재면 "골짜기 구간은 -2.9m"가 되어 검사가 깨지지만, 그건 줄이
   * 처진 게 아니라 땅이 내려간 것이다. 여기서 지켜야 하는 것은 **줄 밑으로
   * 지나갈 수 있는가**이고, 그건 지면 기준 높이다.
   */
  const heights: number[] = [];
  for (let i = 0; i < details.wireVertices.length; i += 3) {
    const x = details.wireVertices[i];
    const y = details.wireVertices[i + 1];
    const z = details.wireVertices[i + 2];
    heights.push(y - terrainHeight(x, z));
  }

  it("선분 단위로 딱 떨어진다 — 어긋나면 마지막 줄이 원점으로 뻗는다", () => {
    expect(details.wireVertices.length % 6, `정점 ${details.wireVertices.length}개`).toBe(0);
  });

  it("실제로 걸린 줄이 있다", () => {
    expect(details.wireVertices.length, "한 줄도 안 걸렸다").toBeGreaterThan(0);
  });

  it("높이가 여러 가지다 — 한 값뿐이면 곧은 선 한 가닥이다", () => {
    /*
     * 오래 곧은 선 두 가닥이었다. 「줄이 있다」만 재면 그때도 통과한다 —
     * **처지는지**를 재야 뜻이 있다.
     */
    const distinct = new Set(heights.map((y) => y.toFixed(2)));
    expect(distinct.size, `높이 종류 ${distinct.size}가지`).toBeGreaterThan(6);
  });

  it("가운데가 끝보다 낮다 — 처짐이 없으면 도면처럼 보인다", () => {
    /*
     * 기준이 0.9였다. 가닥을 넷에서 둘로 줄이면서(하늘이 그물에 덮여 보였다)
     * 가닥 사이의 높이 차가 함께 줄어 전체 폭도 작아졌다 — 처짐이 사라져서가
     * 아니다. 재는 대상이 「가닥 뭉치의 두께 + 처짐」이라 그렇다.
     */
    const top = Math.max(...heights);
    const bottom = Math.min(...heights);
    expect(top - bottom, `가장 높은 곳 ${top}, 가장 낮은 곳 ${bottom}`).toBeGreaterThan(0.6);
  });

  it("땅에 닿거나 사람 키 아래로 내려오지 않는다", () => {
    expect(Math.min(...heights), `가장 낮은 줄 ${Math.min(...heights)}m`).toBeGreaterThan(2.5);
  });
});
