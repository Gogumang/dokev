import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { buildCityLayout } from "@/game/world/cityLayout";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";
import {
  isWaterVehicle,
  LOCOMOTION,
  VEHICLE_KINDS,
  WATER_VEHICLES,
} from "@/game/config/tuning";
import {
  isOverWater,
  rideLimit,
  rideSurfaceHeight,
  WATER_RIDE,
  waterSurfaceY,
} from "@/game/world/waterRide";

/*
 * 물 위로 나가기.
 *
 * 바다를 만들어 놓고 **못 들어갔다** — 월드에서 가장 큰 면적이 배경 그림이었다
 * (RALPH_BACKLOG 「12. 물 위로 나간다」).
 *
 * 백로그가 못 박은 검사는 **양방향**이다. 나가기만 되고 돌아오기가 안 되면
 * 물에 갇힌다.
 */
const layout = buildCityLayout();
const HALF = layout.halfExtent;

describe("어디가 물인가", () => {
  it("도시 안은 물이 아니다", () => {
    expect(isOverWater(0, 0, HALF), "광장이 물이 됐다").toBe(false);
  });

  it("가장자리 바깥이 물이다", () => {
    expect(isOverWater(HALF + 5, 0, HALF)).toBe(true);
    expect(isOverWater(0, -(HALF + 5), HALF), "남쪽 바다를 못 알아본다").toBe(true);
  });

  it("경계 안팎이 실제로 갈린다", () => {
    expect([isOverWater(HALF - 1, 0, HALF), isOverWater(HALF + 1, 0, HALF)]).toEqual([false, true]);
  });
});

describe("딛는 높이", () => {
  const landSpot = { x: 0, z: 0 };
  const seaSpot = { x: HALF + 20, z: 0 };

  it("타고 물 위에 있으면 수면에 얹힌다", () => {
    const y = rideSurfaceHeight(terrainHeight(seaSpot.x, seaSpot.z), seaSpot.x, seaSpot.z, HALF, "jetski");
    expect(y, `${y} vs 수면 ${SEA_LEVEL}`).toBe(waterSurfaceY());
  });

  it("수면에 딱 붙지 않는다 — 붙으면 물결과 z-파이팅이 난다", () => {
    expect(waterSurfaceY(), `${waterSurfaceY()}`).toBeGreaterThan(SEA_LEVEL);
    expect(waterSurfaceY() - SEA_LEVEL, "너무 띄우면 떠서 가는 것으로 보인다").toBeLessThan(0.5);
  });

  it("뭍에서는 땅 높이 그대로다 — 타고 있어도", () => {
    const land = terrainHeight(landSpot.x, landSpot.z);
    expect(rideSurfaceHeight(land, landSpot.x, landSpot.z, HALF, "jetski"), "육지가 수면이 됐다").toBe(
      land,
    );
  });

  it("두 발로는 물 위에 얹히지 않는다 — 걸어 들어가면 수영이고, 그건 다른 게임이다", () => {
    const land = terrainHeight(seaSpot.x, seaSpot.z);
    expect(rideSurfaceHeight(land, seaSpot.x, seaSpot.z, HALF, null)).toBe(land);
  });

  it("나갔다 돌아오는 것이 **양방향**이다", () => {
    /*
     * 이 항목에서 가장 중요한 줄이다. 한쪽만 되면 물에 갇히고, 그때 할 수 있는
     * 일은 새로고침뿐이다.
     */
    const land = terrainHeight(0, 0);
    const out = rideSurfaceHeight(land, HALF + 20, 0, HALF, "jetski");
    const back = rideSurfaceHeight(land, 0, 0, HALF, "jetski");
    expect(out, "못 나간다").toBe(waterSurfaceY());
    expect(back, "못 돌아온다").toBe(land);
  });
});

describe("얼마나 멀리 나가는가", () => {
  it("두 발이면 도시에서 멈춘다", () => {
    expect(rideLimit(HALF, null), "걸어서 바다로 나간다").toBe(HALF);
  });

  it("타면 더 나간다", () => {
    expect(rideLimit(HALF, "jetski"), "타도 못 나간다").toBeGreaterThan(HALF);
  });

  it("상한이 있다 — 없으면 수평선을 향해 영영 나간다", () => {
    const limit = rideLimit(HALF, "jetski");
    expect(limit, `한계 ${limit}`).toBeLessThan(HALF + 200);
    expect(WATER_RIDE.reach, `${WATER_RIDE.reach}m`).toBeGreaterThan(20);
  });
});

describe("화면이 이 규칙을 쓰는가", () => {
  it("리그가 딛는 면과 한계를 여기서 구한다", () => {
    // 규칙만 있고 배선이 없으면 바다는 그대로 배경 그림이다
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    expect(rig, "딛는 면이 물을 모른다").toMatch(/rideSurfaceHeight\(/);
    expect(rig, "가장자리에서 여전히 막힌다").toMatch(/rideLimit\(/);
  });
});

describe("무엇을 타야 물에 나가는가", () => {
  it("뭍 탈것은 물가에서 멈춘다", () => {
    /*
     * 「타고 있는가」만 보던 시절에는 **아무거나 타면 바다로 나갈 수 있었다** —
     * 조랑말이 수면 위를 걷고 자전거가 파도를 탔다. 바다에 나가는 길을 내면서
     * 탈것을 한 덩어리로 본 결과다.
     */
    for (const kind of ["kickboard", "bike", "skateboard", "toycar", "pony"] as const) {
      expect(rideLimit(HALF, kind), `${kind}가 바다로 나간다`).toBe(HALF);
      expect(
        rideSurfaceHeight(-999, HALF + 20, 0, HALF, kind),
        `${kind}가 수면 위를 달린다`,
      ).toBe(-999);
    }
  });

  it("물 탈것은 나간다", () => {
    for (const kind of WATER_VEHICLES) {
      expect(rideLimit(HALF, kind), `${kind}가 못 나간다`).toBeGreaterThan(HALF);
    }
  });

  it("물 탈것이 하나는 있다 — 바다가 다시 배경 그림이 되지 않게", () => {
    expect(WATER_VEHICLES.length).toBeGreaterThan(0);
  });

  it("물 탈것이 제일 빠르다 — 넓은 데로 나가는 값이 있어야 한다", () => {
    const fastestLand = Math.max(
      ...VEHICLE_KINDS.filter((kind) => !isWaterVehicle(kind)).map(
        (kind) => LOCOMOTION[kind].maxSpeed,
      ),
    );
    for (const kind of WATER_VEHICLES) {
      expect(LOCOMOTION[kind].maxSpeed, `${kind}가 뭍 탈것보다 느리다`).toBeGreaterThan(
        fastestLand,
      );
    }
  });

  it("물 탈것은 제일 안 선다 — 물에는 붙잡을 것이 없다", () => {
    const landDecel = VEHICLE_KINDS.filter((kind) => !isWaterVehicle(kind)).map(
      (kind) => LOCOMOTION[kind].decel,
    );
    for (const kind of WATER_VEHICLES) {
      expect(LOCOMOTION[kind].decel, `${kind} 감속 ${LOCOMOTION[kind].decel}`).toBeLessThan(
        Math.min(...landDecel),
      );
    }
  });
});
