/**
 * 제트스키 — 물 위에서만 값을 하는 탈것.
 *
 * 바다는 월드에서 가장 큰 면적인데, 「타고 있으면 나갈 수 있다」는 규칙
 * 하나로 열어 두었더니 **조랑말이 수면 위를 걷고 자전거가 파도를 탔다.**
 * 탈것을 한 덩어리로 본 결과다. 물에서만 값을 하는 것을 하나 두고 나머지는
 * 물가에서 멈춘다 — 그래야 「부두까지 자전거로 달려와 갈아탄다」가 생긴다.
 */

import { describe, expect, it } from "vitest";

import { isWaterVehicle, LOCOMOTION, SHORE_VEHICLES, VEHICLE_KINDS } from "@/game/config/tuning";
import { buildCityLayout } from "@/game/world/cityLayout";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";
import { buildVehicleStands } from "@/game/world/vehicleStands";
import { isOverWater, shoreFacing, shoreLanding, waterSurfaceY } from "@/game/world/waterRide";

const layout = buildCityLayout();
const HALF = layout.halfExtent;

describe("물가 자리 찾기", () => {
  const landing = shoreLanding(HALF);

  it("경계 위에 있다", () => {
    // 도시 한복판에 대어 두면 아무 뜻이 없다
    const edge = Math.max(Math.abs(landing.x), Math.abs(landing.z));
    expect(edge, `가장자리에서 ${(HALF - edge).toFixed(1)}m 안쪽`).toBeGreaterThan(HALF - 8);
  });

  it("도시 안쪽이다 — 경계 밖에 두면 걸어가서 탈 수 없다", () => {
    expect(isOverWater(landing.x, landing.z, HALF)).toBe(false);
  });

  it("수면 위다 — 물에 잠긴 자리에 대어 두지 않는다", () => {
    expect(
      landing.height,
      `지형 ${landing.height.toFixed(2)}m, 수면 ${SEA_LEVEL}m`,
    ).toBeGreaterThan(SEA_LEVEL);
  });

  it("벼랑이 아니다 — 절벽 위에 「물가에 대어 둔 제트스키」는 거짓말이다", () => {
    /*
     * 부두 옆에 두려다 그만둔 이유가 이것이다. 하필 그 자리 지형이 +5m라
     * 수면까지 13m 벼랑이었다.
     */
    const drop = landing.height - waterSurfaceY();
    expect(drop, `수면까지 ${drop.toFixed(1)}m`).toBeLessThan(6);
  });

  it("실제로 제일 낮은 자리를 골랐다", () => {
    // 같은 링에서 더 낮은 곳이 있으면 찾기가 헛돈 것이다
    const edge = HALF - 4;
    let lowest = Infinity;
    for (let t = -edge + 10; t <= edge - 10; t += 2) {
      for (const [x, z] of [
        [t, edge],
        [edge, t],
        [t, -edge],
        [-edge, t],
      ] as const) {
        lowest = Math.min(lowest, terrainHeight(x, z));
      }
    }
    expect(landing.height).toBeCloseTo(lowest, 6);
  });

  it("뱃머리가 바다를 본다", () => {
    /*
     * 방향은 「어느 변에 있는가」가 정한다. 반대로 두면 타자마자 도시
     * 안쪽으로 향하고, 물에 나가려면 먼저 돌아야 한다.
     */
    const facing = shoreFacing(landing.x, landing.z);
    const outward = { x: Math.sin(facing), z: Math.cos(facing) };
    const ahead = { x: landing.x + outward.x * 20, z: landing.z + outward.z * 20 };
    expect(isOverWater(ahead.x, ahead.z, HALF), `${facing.toFixed(2)}rad로 서 있다`).toBe(true);
  });
});

describe("물가에 실제로 세워져 있는가", () => {
  const stands = buildVehicleStands(HALF);
  const cell = VEHICLE_KINDS.indexOf("jetski");
  const parked = stands.filter((stand) => stand.cell === cell);

  it("한 대 이상 있다 — 정의만 있고 세워 두지 않으면 탈 방법이 없다", () => {
    expect(parked.length, `제트스키 ${parked.length}대`).toBeGreaterThan(0);
  });

  it("전부 물가에 있다 — 인도에 제트스키가 서 있으면 안 된다", () => {
    for (const stand of parked) {
      const edge = Math.max(Math.abs(stand.x), Math.abs(stand.z));
      expect(edge, `(${stand.x.toFixed(0)}, ${stand.z.toFixed(0)})`).toBeGreaterThan(HALF - 12);
    }
  });

  it("물가를 따라 벌려 선다 — 바다 쪽으로 벌리면 하나가 잠긴다", () => {
    for (const stand of parked) {
      expect(isOverWater(stand.x, stand.z, HALF), `(${stand.x}, ${stand.z})가 물 위다`).toBe(false);
    }
  });

  it("서로 겹치지 않는다", () => {
    for (let i = 0; i < parked.length; i += 1) {
      for (let j = i + 1; j < parked.length; j += 1) {
        const gap = Math.hypot(parked[i].x - parked[j].x, parked[i].z - parked[j].z);
        expect(gap, `${gap.toFixed(1)}m 떨어져 있다`).toBeGreaterThan(2);
      }
    }
  });

  it("세워 둔 모습이 정의되어 있다 — 없으면 탈 수는 있는데 안 보인다", async () => {
    const { buildStandBoxes } = await import("@/game/world/vehicleStands");
    const boxes = buildStandBoxes(parked, 0, 1, 2);
    expect(boxes.length, `상자 ${boxes.length}개`).toBeGreaterThan(0);
  });
});

describe("물 탈것의 성격", () => {
  it("물가에 세우는 것과 물에서 달리는 것이 같은 목록이다", () => {
    /*
     * 갈라지면 물가에 세워 두었는데 물에서는 안 뜨는 것이 생긴다 — 화면에서는
     * 「탔더니 바다에 빠졌다」로 보이고, 왜인지는 코드를 봐야만 안다.
     */
    for (const kind of SHORE_VEHICLES) {
      expect(isWaterVehicle(kind), `${kind}가 물가에 있는데 물에서 안 뜬다`).toBe(true);
    }
  });

  it("두 발은 물 탈것이 아니다", () => {
    expect(isWaterVehicle(null)).toBe(false);
    expect(isWaterVehicle("walk")).toBe(false);
    expect(isWaterVehicle("run")).toBe(false);
  });

  it("이동 수치가 정의되어 있다", () => {
    for (const kind of SHORE_VEHICLES) {
      expect(LOCOMOTION[kind], `${kind} 수치가 없다`).toBeDefined();
    }
  });
});
