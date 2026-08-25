import { describe, expect, it } from "vitest";

import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

/*
 * 지형 고저차.
 *
 * 도시가 y=0 평면 한 장이었다. 색과 간판이 아무리 촘촘해도 **길이 평평하면
 * 지도처럼 보인다** — 마루 너머가 안 보이다가 한 번에 펼쳐지는 시야 변화가
 * 없으면 깊이가 생기지 않는다.
 *
 * 높이를 넣는 순간 위험해지는 것은 **한 곳만 빠뜨리는 것**이다. 건물은 언덕을
 * 따라가는데 도로 표시만 평지에 남으면, 도시를 한 바퀴 돌아야 발견된다.
 */

describe("높이 함수", () => {
  it("어디서든 유한한 값을 준다", () => {
    for (let x = -200; x <= 200; x += 17) {
      for (let z = -200; z <= 200; z += 23) {
        const height = terrainHeight(x, z);
        expect(Number.isFinite(height), `(${x}, ${z}) → ${height}`).toBe(true);
      }
    }
  });

  it("같은 자리는 늘 같은 높이다", () => {
    // 배치·물리·렌더가 각자 부르므로 조금이라도 흔들리면 서로 어긋난다
    for (const [x, z] of [
      [0, 0],
      [61.5, -18.25],
      [-140, 97],
    ]) {
      expect(terrainHeight(x, z)).toBe(terrainHeight(x, z));
    }
  });

  it("실제로 오르내린다", () => {
    // 상수 함수면 넣은 의미가 없다
    const samples: number[] = [];
    for (let x = -140; x <= 140; x += 7) samples.push(terrainHeight(x, 60));

    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread, `높이 폭 ${spread.toFixed(1)}m`).toBeGreaterThan(4);
  });

  it("걸어 다닐 만한 경사다", () => {
    /*
     * 축 정렬 상자인 건물이 비탈에 서므로, 경사가 세지면 한쪽 모서리가 뜨거나
     * 파묻힌다. 그리고 20%를 넘는 길은 도시가 아니라 산이다.
     */
    let steepest = 0;
    let at = "";
    for (let x = -160; x <= 160; x += 3) {
      for (let z = -160; z <= 160; z += 3) {
        const slope = Math.max(
          Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) / 2,
          Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2,
        );
        if (slope > steepest) {
          steepest = slope;
          at = `(${x}, ${z})`;
        }
      }
    }
    expect(steepest, `가장 가파른 곳 ${at} 경사 ${(steepest * 100).toFixed(0)}%`).toBeLessThan(0.2);
  });

  it("이웃한 지점 사이에 턱이 없다", () => {
    // 불연속이 있으면 그 자리를 걸을 때 캐릭터가 튄다
    let biggest = 0;
    for (let x = -160; x <= 160; x += 1.5) {
      const step = Math.abs(terrainHeight(x, 40) - terrainHeight(x + 0.1, 40));
      biggest = Math.max(biggest, step);
    }
    expect(biggest, `0.1m 사이 최대 낙차 ${biggest.toFixed(3)}m`).toBeLessThan(0.05);
  });
});

describe("시작 지점에서도 언덕이 보이는가", () => {
  const plaza = blockCenter(CITY.plazaBlockIndex);

  /*
   * 한동안 광장 둘레를 눌러 평지로 만들었다. 그 이음매가 완만하려면 반경이
   * 넓어야 해서, 결국 **시작 지점 반경 57m가 통째로 평지**가 됐다. 안개가
   * 60m부터 시작하니 처음 보이는 범위가 전부 평지였고 — 언덕을 넣고도 첫
   * 화면은 예전 그대로였다. "하나도 안 고쳐졌다"는 말이 정확했다.
   *
   * 그래서 지금 지키는 것은 「광장이 평평한가」가 아니라 **「시작하자마자
   * 오르내림이 보이는가」** 다.
   */
  it("광장 안에서도 높이가 변한다", () => {
    const samples: number[] = [];
    for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
      samples.push(terrainHeight(plaza.cx + Math.cos(angle) * 15, plaza.cz + Math.sin(angle) * 15));
    }

    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread, `광장 15m 안에서 높이 폭 ${spread.toFixed(2)}m`).toBeGreaterThan(0.6);
  });

  it("안개가 덮기 전 거리에서 확실히 오르내린다", () => {
    /*
     * 안개는 60m부터 시작한다. 그 안쪽에서 높이차가 눈에 띄지 않으면 화면에서는
     * 여전히 평지다.
     */
    const samples: number[] = [];
    for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
      samples.push(terrainHeight(plaza.cx + Math.cos(angle) * 55, plaza.cz + Math.sin(angle) * 55));
    }

    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread, `55m 반경 높이 폭 ${spread.toFixed(1)}m`).toBeGreaterThan(5);
  });

  it("한 블록 안에서도 평평하지 않다", () => {
    // 큰 언덕만 있으면 골목을 걷는 동안은 여전히 평지다
    let biggest = 0;
    for (let i = 0; i < 40; i += 1) {
      const x = plaza.cx + i * 3;
      const local: number[] = [];
      for (let d = 0; d <= CITY.blockSize; d += 4) local.push(terrainHeight(x, plaza.cz + d));
      biggest = Math.max(biggest, Math.max(...local) - Math.min(...local));
    }
    expect(biggest, `블록 한 변 안 높이 폭 ${biggest.toFixed(2)}m`).toBeGreaterThan(1);
  });
});

describe("건물이 땅에 붙는가", () => {
  const layout = buildCityLayout();

  it("비탈에 선 건물은 더 깊이 파묻는다", () => {
    /*
     * 축 정렬 상자라 기울어진 땅에서는 낮은 쪽 모서리가 뜬다. 그 틈으로
     * 도시 반대편이 보인다 — 배치에서 `sink`로 아래로만 늘려 막는다.
     */
    let checked = 0;
    for (const building of layout.buildings) {
      const center = terrainHeight(building.x, building.z);
      let lowest = center;
      for (const dx of [-building.width / 2, building.width / 2]) {
        for (const dz of [-building.depth / 2, building.depth / 2]) {
          lowest = Math.min(lowest, terrainHeight(building.x + dx, building.z + dz));
        }
      }

      const drop = center - lowest;
      if (drop < 0.2) continue;
      checked += 1;

      expect(
        building.sink ?? 0,
        `(${building.x.toFixed(0)}, ${building.z.toFixed(0)}) 모서리가 ${drop.toFixed(2)}m 낮은데 파묻은 깊이가 부족하다`,
      ).toBeGreaterThanOrEqual(drop);
    }

    expect(checked, `비탈에 선 건물 ${checked}채`).toBeGreaterThan(10);
  });

  it("옥상 높이가 지면을 따라간다", () => {
    // 평지 기준으로 두면 언덕 위 건물의 옥상이 땅속으로 들어간다
    for (const building of layout.buildings.slice(0, 40)) {
      const collider = layout.colliders.find(
        (box) =>
          Math.abs((box.minX + box.maxX) / 2 - building.x) < 0.001 &&
          Math.abs((box.minZ + box.maxZ) / 2 - building.z) < 0.001,
      );
      expect(
        collider,
        `(${building.x.toFixed(0)}, ${building.z.toFixed(0)})에 충돌체가 없다`,
      ).toBeDefined();
      if (!collider) continue;

      expect(collider.top).toBeCloseTo(terrainHeight(building.x, building.z) + building.height);
    }
  });
});
