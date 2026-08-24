import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "@/game/config/tuning";
import { blockCenter, buildCityLayout, CITY, type BoxInstance } from "@/game/world/cityLayout";
import { HILLSIDE_PALETTE } from "@/game/world/cityPalettes";
import { terrainHeight } from "@/game/world/terrain";
import { zoneForBlock } from "@/game/world/zones";

/*
 * 언덕 주택가의 골목 계단.
 *
 * 여덟 구역 중 이 동네만 전용 작업을 못 받아서, 이름과 부제만 「언덕 주택가 —
 * 좁은 골목」이고 화면은 번화가를 낮게 줄인 것이었다.
 *
 * 여기 검사는 **숫자를 베끼지 않는다.** 배치 데이터에서 관계를 되짚어 잰다 —
 * 수치를 적어 두면 계단을 옮길 때 검사가 옛 자리를 재면서 조용히 통과한다
 * (옛 마을 담에서 겪었다).
 */

const layout = buildCityLayout();
const steps = layout.alleySteps;
const rails = layout.alleyRails;

/** 그 상자의 윗면 절대 높이(m). 배치의 y는 평지 기준이라 지형을 더해야 한다 */
function topOf(item: BoxInstance): number {
  return item.y + terrainHeight(item.x, item.z) + item.height / 2;
}

const residentialBlocks = Array.from(
  { length: CITY.gridSize * CITY.gridSize },
  (_, index) => index,
).filter((index) => zoneForBlock(index).id === "residential");

describe("골목 계단이 놓인 자리", () => {
  it("계단과 난간이 실제로 만들어졌다", () => {
    expect(steps.length, `디딤판 ${steps.length}장`).toBeGreaterThan(40);
    expect(rails.length, `난간 ${rails.length}조각`).toBeGreaterThan(40);
  });

  it("언덕 주택가에만 깔린다", () => {
    // 다른 동네에 새면 그 동네의 성격을 흐린다 — 계단은 이 동네의 표시다
    const strays = [...steps, ...rails].filter(
      (item) => zoneForBlock(item.blockIndex).id !== "residential",
    );
    expect(strays.length, `주택가 밖에 놓인 ${strays.length}개`).toBe(0);
  });

  it("주택가 구역이 하나도 빠지지 않는다", () => {
    /*
     * 「몇 개 이상」만 재면 **일부 구역이 통째로 비어도 통과한다.** 실제로
     * 그랬다 — 골목 방향을 축의 눈으로 읽지 않아 다섯 구역 중 둘이 구역
     * 밖을 훑고 있었고, 총량 검사로는 아무 일도 없었다.
     */
    const covered = new Set(steps.map((step) => step.blockIndex));
    const missing = residentialBlocks.filter((index) => !covered.has(index));
    expect(missing, `계단이 없는 주택가 구역 ${missing.join(", ")}`).toEqual([]);
  });

  it("집과 집 사이에 있다 — 집을 뚫지 않는다", () => {
    for (const step of steps) {
      const house = layout.buildings.find(
        (building) =>
          building.blockIndex === step.blockIndex &&
          Math.abs(building.x - step.x) < (building.width + step.width) / 2 &&
          Math.abs(building.z - step.z) < (building.depth + step.depth) / 2,
      );
      expect(
        house,
        `(${step.x.toFixed(1)}, ${step.z.toFixed(1)})의 디딤판이 집과 겹친다`,
      ).toBeUndefined();
    }
  });
});

describe("계단이 계단으로 보이는가", () => {
  it("한 구역 안에서 높이가 여러 단으로 갈린다", () => {
    /*
     * 등고선을 따라 놓으면 단이 **한 개도** 안 생겨 그냥 포장된 골목이 된다.
     * 그래서 골목 방향을 비탈이 정하게 했는데, 그 판단이 살아 있는지를
     * 여기서 잰다 — 값이 아니라 결과로.
     */
    for (const index of residentialBlocks) {
      const levels = new Set(
        steps.filter((step) => step.blockIndex === index).map((step) => topOf(step).toFixed(3)),
      );
      expect(levels.size, `구역 ${index}의 단 높이가 ${levels.size}종뿐이다`).toBeGreaterThan(2);
    }
  });

  it("단 높이가 일정한 간격으로 끊긴다", () => {
    // 지형을 그대로 따라가면 계단이 아니라 비탈이다. 끊겨 있어야 단이 보인다
    const rises = [...new Set(steps.map((step) => +riseOf(step).toFixed(6)))];
    const riser = smallestGap(rises);
    expect(riser, `가장 작은 단 차이 ${riser.toFixed(3)}m`).toBeGreaterThan(0.1);

    /*
     * 가장 낮은 단을 0으로 놓고 잰다. 판에 얹느라 전체를 조금 띄워 두었으므로
     * (`STAIR.baseLift`) 절대값은 단 높이의 배수가 아니다 — 배수여야 하는 것은
     * **단 사이의 차이**다.
     */
    const floor = Math.min(...rises);
    const offGrid = rises.filter(
      (rise) => Math.abs((rise - floor) / riser - Math.round((rise - floor) / riser)) > 1e-6,
    );
    expect(offGrid.length, `격자에서 벗어난 단 ${offGrid.length}개`).toBe(0);
  });

  it("인도 상판 위에 앉는다 — 묻히지도, 뜨지도 않는다", () => {
    /*
     * **이 검사가 이번 반복의 핵심이다.**
     *
     * 처음에는 계단을 지형에 맞춰 놓고 「지면에서 한 단의 절반 넘게 뜨지
     * 않는다」를 쟀다. 전부 통과했는데 **화면에는 한 장도 안 나왔다** —
     * 도시 구역에는 평평한 인도 상판이 한 장 깔려 있어서(`sidewalks.ts`),
     * 구역 안에서 보이는 바닥은 지형이 아니라 그 판이었다. 계단은 판 밑에
     * 통째로 묻혀 있었다.
     *
     * 그래서 기준을 지형이 아니라 **판**으로 바꾼다. 판보다 위에 있어야
     * 보이고, 아래가 판에 닿아야 공중에 뜬 널빤지가 되지 않는다.
     */
    for (const step of steps) {
      const rise = riseOf(step);
      expect(rise, `(${step.x.toFixed(1)}, ${step.z.toFixed(1)})의 디딤판이 판보다 ${rise.toFixed(2)}m 위`).toBeGreaterThan(0);

      // 아랫면 = 윗면 - (보이는 높이 + 파묻은 깊이)
      const bottom = rise - step.height - (step.sink ?? 0);
      expect(
        bottom,
        `(${step.x.toFixed(1)}, ${step.z.toFixed(1)})의 디딤판 아랫면이 판보다 ${bottom.toFixed(2)}m 위 — 떠 있다`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it("걸어 들어가도 무릎 아래다", () => {
    /*
     * 디딤판에는 충돌체가 없다 — 주면 폭 1.8m짜리 골목이 통째로 막힌다
     * (`골목이 막히지 않는가` 참조). 대신 플레이어가 계단을 뚫고 걷는다.
     * 그 어긋남이 눈에 안 띄려면 낮아야 한다. 여기 걸리면 「보이게 하려고
     * 높였다」는 뜻이고, 그 대가는 화면이 아니라 **몸이 계단에 잠기는 것**이다.
     */
    const highest = Math.max(...steps.map(riseOf));
    expect(highest, `가장 높은 단이 판보다 ${highest.toFixed(2)}m 위`).toBeLessThanOrEqual(0.8);
  });

  it("난간이 계단을 따라 내려온다", () => {
    /*
     * 단이 20cm뿐이라 바닥만으로는 멀리서 안 읽힌다. 눈에 먼저 들어오는 것은
     * 난간의 실루엣이므로, 난간 높이도 계단과 같이 갈려 있어야 한다.
     */
    for (const index of residentialBlocks) {
      const levels = new Set(
        rails.filter((rail) => rail.blockIndex === index).map((rail) => topOf(rail).toFixed(3)),
      );
      expect(levels.size, `구역 ${index}의 난간 높이가 ${levels.size}종뿐이다`).toBeGreaterThan(2);
    }
  });
});

describe("골목이 막히지 않는가", () => {
  it("디딤판 자리에 충돌체가 없다", () => {
    /*
     * `resolveHorizontalCollisions`에는 **계단 오르기가 없다.** 플레이어의 y가
     * 상자 top보다 낮으면 그냥 벽이다. 디딤판에 충돌체를 주면 20cm짜리 단이
     * 넘을 수 없는 벽이 되어 골목이 통째로 막힌다.
     */
    for (const step of steps) {
      const blocking = layout.colliders.find(
        (box) =>
          step.x > box.minX && step.x < box.maxX && step.z > box.minZ && step.z < box.maxZ,
      );
      expect(
        blocking,
        `(${step.x.toFixed(1)}, ${step.z.toFixed(1)})의 디딤판이 충돌체 안이다`,
      ).toBeUndefined();
    }
  });

  it("난간은 집이 이미 막아 둔 띠 안에 선다", () => {
    /*
     * 난간에도 충돌체를 주지 않는다 — 폭이 1.8m 남짓인 골목에 하나 더 놓으면
     * 지나갈 수 없게 되기 십상이다. 대신 **플레이어가 닿을 수 없는 자리**에
     * 세운다: 집 충돌체에서 플레이어 반지름 안쪽이면 그 앞에서 이미 밀린다.
     *
     * 이 관계가 깨지면 난간이 허공에 뜬 철봉이 되고 통과된다.
     */
    for (const rail of rails) {
      const reach = Math.min(
        ...layout.colliders.map((box) => {
          const dx = Math.max(box.minX - rail.x, 0, rail.x - box.maxX);
          const dz = Math.max(box.minZ - rail.z, 0, rail.z - box.maxZ);
          return Math.hypot(dx, dz);
        }),
      );
      expect(
        reach,
        `(${rail.x.toFixed(1)}, ${rail.z.toFixed(1)})의 난간이 가장 가까운 벽에서 ${reach.toFixed(2)}m 떨어져 있다`,
      ).toBeLessThan(PLAYER_RADIUS);
    }
  });

  it("계단이 구역 안에 머문다 — 도로로 나가지 않는다", () => {
    for (const step of steps) {
      const { cx, cz } = blockCenter(step.blockIndex);
      const half = CITY.blockSize / 2;
      expect(Math.abs(step.x - cx) + step.width / 2, `x로 구역을 넘었다`).toBeLessThanOrEqual(half);
      expect(Math.abs(step.z - cz) + step.depth / 2, `z로 구역을 넘었다`).toBeLessThanOrEqual(half);
    }
  });
});

describe("색과 배선", () => {
  it("팔레트가 톤 수와 맞는다", () => {
    // 어긋나면 난간이 돌색이 되는데 배치 값은 멀쩡해서 코드로는 안 보인다
    const source = readFileSync("src/game/world/hillside.ts", "utf8");
    const block = /const TONE = \{([\s\S]*?)\} as const;/.exec(source);
    expect(block, "hillside.ts의 TONE을 못 읽었다 — 검사가 아무것도 안 보고 있다").not.toBeNull();
    if (!block) return;

    const tones = block[1].match(/\w+:\s*\d/g) ?? [];
    expect(HILLSIDE_PALETTE.length, `색 ${HILLSIDE_PALETTE.length}개 / 톤 ${tones.length}개`).toBe(
      tones.length,
    );
  });

  it("계단 돌이 그 동네 노면보다 밝다", () => {
    /*
     * 단이 20cm뿐이라 그림자로는 거의 안 읽힌다. 골목이 골목으로 보이는 것은
     * 바닥과 갈리는 밝기 차이다 — 어두우면 아스팔트에 그린 얼룩이 된다.
     */
    const ground = luminance(zoneForBlock(residentialBlocks[0]).groundColor);
    for (const color of HILLSIDE_PALETTE.slice(0, 2)) {
      expect(luminance(color), `${color} vs 노면`).toBeGreaterThan(ground);
    }
  });

  it("City가 실제로 두 레이어를 건다", () => {
    // 배치만 만들고 걸지 않으면 검사는 전부 통과하는데 화면에는 아무것도 없다
    const source = readFileSync("src/game/world/City.tsx", "utf8");
    for (const layer of ["alleySteps", "alleyRails"]) {
      expect(source, `${layer}를 스트리밍하지 않는다`).toContain(`useStreamed(layout.${layer}`);
      expect(source, `${layer}를 그리지 않는다`).toContain(`items={${layer}}`);
    }
    expect(source).toContain("HILLSIDE_PALETTE");
  });
});

/**
 * 그 디딤판이 **그 구역의 인도 상판보다** 얼마나 위에 있는가(m).
 *
 * 판은 구역마다 상자 하나라 평평하다 — 상자 하나에는 지형이 한 번만
 * 더해지므로 판 윗면은 구역 안 어디서나 `지형(구역중심) + sidewalkHeight`다.
 */
function riseOf(step: BoxInstance): number {
  const { cx, cz } = blockCenter(step.blockIndex);
  return topOf(step) - (terrainHeight(cx, cz) + CITY.sidewalkHeight);
}

/** 정렬한 값들 사이의 가장 작은 간격 */
function smallestGap(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < sorted.length; i += 1) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
  return gap;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255;
}
