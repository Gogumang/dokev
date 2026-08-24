import { describe, expect, it } from "vitest";

import { CITY } from "@/game/world/cityLayout";
import {
  buildSignalPosts,
  buildTraffic,
  canProceed,
  coordinateFromU,
  roadCenters,
  sampleSignal,
  SIGNAL,
  TRAFFIC,
} from "@/game/world/trafficLayout";

const HALF_EXTENT = (CITY.gridSize * (CITY.blockSize + CITY.roadWidth)) / 2;

describe("sampleSignal", () => {
  it("두 축이 동시에 통행 가능해지지 않는다", () => {
    // Arrange
    const cycle = (SIGNAL.greenSeconds + SIGNAL.yellowSeconds + SIGNAL.allRedSeconds) * 2;

    // Act & Assert
    for (let step = 0; step < 400; step += 1) {
      const time = (cycle * step) / 400;
      const state = sampleSignal(time);
      const bothGo = canProceed(state, "z") && canProceed(state, "x");
      expect(bothGo, `t=${time.toFixed(2)}에서 ${state.alongZ}/${state.alongX}`).toBe(false);
    }
  });

  it("주기 하나만큼 지나면 같은 상태로 돌아온다", () => {
    // Arrange
    const cycle = (SIGNAL.greenSeconds + SIGNAL.yellowSeconds + SIGNAL.allRedSeconds) * 2;

    // Act
    const now = sampleSignal(3.7);
    const later = sampleSignal(3.7 + cycle * 5);

    // Assert
    expect(later).toEqual(now);
  });

  it("황색에는 통행을 허용한다 (교차로 한복판에 갇히지 않게)", () => {
    // Act
    const state = sampleSignal(SIGNAL.greenSeconds + SIGNAL.yellowSeconds / 2);

    // Assert
    expect(state.alongZ).toBe("yellow");
    expect(canProceed(state, "z")).toBe(true);
  });
});

describe("coordinateFromU", () => {
  it("방향과 무관하게 u가 커질수록 진행 방향으로 나아간다", () => {
    // Arrange
    const halfSpan = HALF_EXTENT + TRAFFIC.wrapMargin;

    // Act
    const forwardStart = coordinateFromU(0, 1, halfSpan);
    const forwardLater = coordinateFromU(10, 1, halfSpan);
    const backwardStart = coordinateFromU(0, -1, halfSpan);
    const backwardLater = coordinateFromU(10, -1, halfSpan);

    // Assert
    expect(forwardLater - forwardStart).toBeCloseTo(10, 6);
    expect(backwardLater - backwardStart).toBeCloseTo(-10, 6);
  });

  it("순환 지점이 월드 경계 밖에 있다 (순간이동이 보이면 안 된다)", () => {
    // Arrange
    const halfSpan = HALF_EXTENT + TRAFFIC.wrapMargin;

    // Assert
    expect(Math.abs(coordinateFromU(0, 1, halfSpan))).toBeGreaterThan(HALF_EXTENT);
  });
});

describe("buildTraffic", () => {
  it("예산과 상한을 모두 지킨다", () => {
    // Act
    const small = buildTraffic(HALF_EXTENT, 7);
    const huge = buildTraffic(HALF_EXTENT, 10_000);

    // Assert
    expect(small.cars).toHaveLength(7);
    expect(huge.cars.length).toBeLessThanOrEqual(TRAFFIC.maxCars);
  });

  it("모든 차량이 차선 목록에 정확히 한 번씩 들어간다", () => {
    // Act
    const plan = buildTraffic(HALF_EXTENT, 36);
    const listed = plan.lanes.flat();

    // Assert
    expect(new Set(listed).size).toBe(plan.cars.length);
    expect(listed).toHaveLength(plan.cars.length);
  });

  it("같은 차선 차량은 u가 오름차순이다 (앞차 판정이 배열 순서에 기댄다)", () => {
    // Act
    const plan = buildTraffic(HALF_EXTENT, 36);

    // Assert
    for (const lane of plan.lanes) {
      for (let k = 1; k < lane.length; k += 1) {
        expect(plan.cars[lane[k]].startU).toBeGreaterThan(plan.cars[lane[k - 1]].startU);
      }
    }
  });

  it("마주 오는 차선이 서로 다른 쪽에 놓인다", () => {
    // Act
    const plan = buildTraffic(HALF_EXTENT, 36);
    const centers = roadCenters();

    // Assert
    for (const car of plan.cars) {
      const center = centers.find((value) => Math.abs(value - car.lanePosition) < 3);
      expect(center, `차선 ${car.lanePosition}에 대응하는 도로가 없다`).toBeDefined();
      expect(Math.abs(car.lanePosition - (center ?? 0))).toBeCloseTo(TRAFFIC.laneOffset, 6);
    }
  });

  it("정지선이 교차로마다 하나씩 있다", () => {
    // Act
    const plan = buildTraffic(HALF_EXTENT, 36);

    // Assert
    for (const car of plan.cars) {
      expect(car.stopLineUs).toHaveLength(roadCenters().length);
    }
  });
});

describe("buildSignalPosts", () => {
  it("교차로마다 두 축을 통제하는 기둥이 하나씩 선다", () => {
    // Act
    const posts = buildSignalPosts();
    const intersections = roadCenters().length ** 2;

    // Assert
    expect(posts).toHaveLength(intersections * 2);
    expect(posts.filter((post) => post.axis === "z")).toHaveLength(intersections);
    expect(posts.filter((post) => post.axis === "x")).toHaveLength(intersections);
  });

  it("기둥이 인도 모서리 안쪽에 선다 (도로 위에 서면 차가 통과한다)", () => {
    // Arrange — 인도 끝은 구역 중심에서 blockSize/2 + 2, 교차로 중심에서 보면 아래 값이다
    const sidewalkCorner = CITY.roadWidth / 2 - 2;

    // Assert
    expect(SIGNAL.cornerOffset).toBeLessThan(sidewalkCorner);
  });
});
