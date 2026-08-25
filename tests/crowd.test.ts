import { describe, expect, it } from "vitest";

import {
  CROWD,
  PED_BODY,
  buildPedestrians,
  crowdCountFor,
  samplePerimeter,
  trackPerimeter,
  type TrackSample,
} from "@/game/world/crowdLayout";

function sample(radius: number, u: number): TrackSample {
  return samplePerimeter(radius, u, { x: 0, z: 0, yaw: 0 });
}

describe("samplePerimeter", () => {
  it("한 바퀴를 돌면 출발점으로 돌아온다", () => {
    // Arrange
    const radius = 17.9;

    // Act
    const start = sample(radius, 0);
    const lap = sample(radius, trackPerimeter(radius));

    // Assert
    expect(lap.x).toBeCloseTo(start.x, 6);
    expect(lap.z).toBeCloseTo(start.z, 6);
  });

  it("트랙 위의 모든 점이 반경 정사각형 경계에 놓인다", () => {
    // Arrange
    const radius = 17.1;
    const perimeter = trackPerimeter(radius);

    // Act & Assert — 모서리를 포함해 촘촘히 훑는다
    for (let step = 0; step < 64; step += 1) {
      const point = sample(radius, (perimeter * step) / 64);
      const onEdge =
        Math.abs(Math.abs(point.x) - radius) < 1e-6 || Math.abs(Math.abs(point.z) - radius) < 1e-6;
      expect(onEdge, `u=${step} 지점이 경계를 벗어났다: (${point.x}, ${point.z})`).toBe(true);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(radius + 1e-6);
      expect(Math.abs(point.z)).toBeLessThanOrEqual(radius + 1e-6);
    }
  });

  it("진행 방향과 yaw가 일치한다 (발이 옆으로 미끄러지지 않는다)", () => {
    // Arrange
    const radius = 17.9;
    const delta = 0.01;

    // Act & Assert — 각 변의 중간 지점에서 검사한다 (모서리는 방향이 바뀌는 지점이다)
    for (let segment = 0; segment < 4; segment += 1) {
      const u = radius * 2 * (segment + 0.5);
      const here = sample(radius, u);
      const next = sample(radius, u + delta);

      const movedYaw = Math.atan2(next.x - here.x, next.z - here.z);
      expect(Math.cos(movedYaw - here.yaw), `segment ${segment}`).toBeCloseTo(1, 6);
    }
  });

  it("음수 u도 감싸서 처리한다 (역방향 보행자가 u를 줄여 나간다)", () => {
    // Arrange
    const radius = 17.1;
    const perimeter = trackPerimeter(radius);

    // Act
    const negative = sample(radius, -3);
    const positive = sample(radius, perimeter - 3);

    // Assert
    expect(negative.x).toBeCloseTo(positive.x, 6);
    expect(negative.z).toBeCloseTo(positive.z, 6);
  });
});

describe("buildPedestrians", () => {
  it("예산을 넘기지 않고 상한도 넘기지 않는다", () => {
    // Act
    const small = buildPedestrians(10);
    const huge = buildPedestrians(10_000);

    // Assert
    expect(small).toHaveLength(10);
    expect(huge.length).toBeLessThanOrEqual(CROWD.maxPedestrians);
  });

  it("같은 시드에서 같은 배치를 만든다 (성능 비교의 전제)", () => {
    // Act
    const first = buildPedestrians(24);
    const second = buildPedestrians(24);

    // Assert
    expect(second).toEqual(first);
  });

  it("트랙 반경이 건물과 가로수 사이에 놓인다", () => {
    // Act
    const specs = buildPedestrians(48);

    // Assert — 건물 바깥면 최대 16.5, 가로수 기둥 18.4
    for (const spec of specs) {
      expect(spec.trackRadius).toBeGreaterThan(16.6);
      expect(spec.trackRadius).toBeLessThan(18.2);
    }
  });
});

describe("보행자가 사람 모양인가", () => {
  /*
   * 다리 폭을 0.16m에서 **5m**로 바꿔도 모든 검사가 통과했다 — 화면에는
   * 사람 대신 덩어리가 서 있는데 아무도 모른다. 도시를 채우는 것이 이
   * 보행자들이므로 형태가 무너지면 「도시가 살아 있다」가 「뭔가 이상하다」가
   * 된다.
   *
   * 절대 크기가 아니라 **비례**로 본다. 사람을 크게 만들 수는 있지만
   * 다리가 몸통보다 넓을 수는 없다.
   */
  it("굵기가 길이를 넘지 않는다", () => {
    expect(
      PED_BODY.legWidth,
      `다리 폭 ${PED_BODY.legWidth} vs 길이 ${PED_BODY.legLength}`,
    ).toBeLessThan(PED_BODY.legLength);
    expect(
      PED_BODY.armWidth,
      `팔 폭 ${PED_BODY.armWidth} vs 길이 ${PED_BODY.armLength}`,
    ).toBeLessThan(PED_BODY.armLength);
  });

  it("다리가 몸통보다 가늘다", () => {
    // 넓으면 몸통이 다리 사이에 끼인 것처럼 보인다
    expect(PED_BODY.legWidth).toBeLessThan(PED_BODY.torsoWidth);
    expect(PED_BODY.armWidth).toBeLessThan(PED_BODY.torsoWidth);
  });

  it("머리가 몸통보다 작다", () => {
    expect(
      PED_BODY.headSize,
      `머리 ${PED_BODY.headSize} vs 몸통 ${PED_BODY.torsoHeight}`,
    ).toBeLessThan(PED_BODY.torsoHeight);
  });

  it("두 다리가 서로 겹치지 않는다", () => {
    /*
     * 벌린 간격이 다리 폭보다 좁으면 두 다리가 한 덩어리로 붙어 걷는 것이
     * 보이지 않는다.
     */
    expect(
      PED_BODY.legSpread * 2,
      `간격 ${(PED_BODY.legSpread * 2).toFixed(2)} vs 폭 ${PED_BODY.legWidth}`,
    ).toBeGreaterThan(PED_BODY.legWidth);
  });

  it("팔이 몸통 밖에 붙어 있다", () => {
    // 안쪽에 있으면 몸통에 파묻혀 흔들려도 안 보인다
    expect(PED_BODY.armSpread, `팔 간격 ${PED_BODY.armSpread}`).toBeGreaterThan(
      PED_BODY.torsoWidth / 2,
    );
  });

  it("머리가 몸통 위에 있다", () => {
    expect(PED_BODY.headOffsetY).toBeGreaterThan(PED_BODY.torsoOffsetY);
  });

  it("사람 크기를 벗어나지 않는다", () => {
    /*
     * 비례만 보면 전부 열 배로 키운 거인도 통과한다. 도시(블록 34m)에 서 있을
     * 크기인지도 함께 본다.
     */
    const height = PED_BODY.hipHeight + PED_BODY.torsoHeight + PED_BODY.headSize;
    expect(height, `키 ${height.toFixed(2)}m`).toBeGreaterThan(1);
    expect(height, `키 ${height.toFixed(2)}m`).toBeLessThan(2.5);
  });
});

/*
 * 서 있는 자리에서 사람이 보이는가.
 *
 * A-3의 완료 조건은 「낮 광장에 앉아 있는 사람과 마주 보고 선 둘이 **보인다**」다.
 * 그런데 지금까지의 검사는 **몇 명을 만드는가**와 **행동이 여러 갈래인가**만 봤다.
 * 둘 다 통과하면서도 그 사람들이 전부 도시 반대편에 있으면 화면은 텅 빈다 —
 * 이 저장소에서 가장 흔했던 「값은 맞는데 화면은 그대로」다.
 *
 * 실제로 브라우저에서 광장을 봤을 때 보행자가 한 명도 안 보였고, 그래서 배치를
 * 의심했다. 재 보니 **가장 가까운 사람이 16m**였다 — 배치는 멀쩡했고 카메라가
 * 한 방향만 보고 있었을 뿐이다. 의심이 틀렸다는 것을 확인하는 데 쓴 자를 여기
 * 남긴다. 다음에 블록 배치나 인원 예산을 손보다 사람들이 멀어지면, 광장이 비는
 * 것을 눈으로 발견하기 전에 여기서 걸린다.
 *
 * 보행자는 블록 둘레를 도므로 **시작 위치**로 잰다. 트랙 위를 도는 동안 거리는
 * 트랙 지름만큼 오갈 뿐, 「가까운 블록이 있는가」라는 질문의 답은 바뀌지 않는다.
 */
describe("가까이에 사람이 있다", () => {
  /** 도시 한가운데(시작 자리)에서 각 보행자의 시작 위치까지 거리 */
  function distancesFromCenter(budget: number): number[] {
    const specs = buildPedestrians(budget);
    const present = crowdCountFor(specs.length, "noon");
    const out: TrackSample = { x: 0, z: 0, yaw: 0 };

    const distances: number[] = [];
    for (let index = 0; index < present; index += 1) {
      const spec = specs[index];
      samplePerimeter(spec.trackRadius, spec.startU, out);
      distances.push(Math.hypot(spec.cx + out.x, spec.cz + out.z));
    }

    return distances.sort((a, b) => a - b);
  }

  /*
   * 품질 세 단계 전부 본다. 낮은 품질에서 인원을 줄일 때 **가까운 사람부터**
   * 지우면 광장이 비는데, 높은 품질만 재면 그것을 놓친다.
   */
  for (const budget of [16, 36, 56]) {
    it(`예산 ${budget}에서도 시작 자리 근처에 사람이 있다`, () => {
      const distances = distancesFromCenter(budget);

      /*
       * 30m는 눈에 사람으로 보이는 거리다. 컬링 한계(120m)로 재면 도시 반대편도
       * 통과하므로 자가 되지 못한다.
       */
      expect(distances[0], `가장 가까운 보행자가 ${distances[0]?.toFixed(1)}m에 있다`).toBeLessThan(
        30,
      );

      // 한 명만 가까우면 「거리」가 아니라 「지나가는 사람」이다
      const near = distances.filter((distance) => distance <= 60).length;
      expect(near, `60m 안에 ${near}명`).toBeGreaterThanOrEqual(2);
    });
  }

  it("밤에는 같은 자리가 낮보다 비어 있다", () => {
    const specs = buildPedestrians(36);

    const noon = crowdCountFor(specs.length, "noon");
    const night = crowdCountFor(specs.length, "night");

    expect(night, `낮 ${noon}명 / 밤 ${night}명`).toBeLessThan(noon);
  });
});
