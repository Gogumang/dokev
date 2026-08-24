import { describe, expect, it } from "vitest";

import {
  createGrappleView,
  projectGrappleView,
  type GrappleView,
} from "@/game/player/GrappleVisuals";

import {
  ROPE,
  ropePoints,
  sagAmount,
  SEGMENT_FLOAT_COUNT,
  toSegmentPositions,
} from "@/game/player/grappleRope";

const FROM = { x: 0, y: 2, z: 0 };
const TO = { x: 0, y: 8, z: 20 };

describe("sagAmount", () => {
  it("짧은 줄은 처지지 않는다", () => {
    // 축 늘어진 짧은 줄은 이상해 보인다
    expect(sagAmount(ROPE.minSagLength, 0)).toBe(0);
    expect(sagAmount(1, 0)).toBe(0);
  });

  it("길수록 많이 처진다", () => {
    const short = sagAmount(8, 0);
    const long = sagAmount(20, 0);
    expect(long, `short=${short}, long=${long}`).toBeGreaterThan(short);
  });

  it("당길수록 펴진다", () => {
    const loose = sagAmount(20, 0);
    const taut = sagAmount(20, 0.8);
    expect(taut, `loose=${loose}, taut=${taut}`).toBeLessThan(loose);
  });

  it("완전히 당기면 직선이 된다", () => {
    expect(sagAmount(20, 1)).toBe(0);
  });

  it("장력이 범위를 벗어나도 음수 처짐을 만들지 않는다", () => {
    // 음수면 줄이 위로 솟는다
    expect(sagAmount(20, 5), "over").toBe(0);
    expect(sagAmount(20, -3), "under").toBeGreaterThan(0);
  });
});

describe("ropePoints", () => {
  it("양 끝점이 정확히 유지된다", () => {
    // 손이나 기둥에서 줄이 떨어져 보이면 걸려 있다는 인상이 깨진다
    const points = ropePoints(FROM, TO, 0);
    expect(points[0], `first was: ${JSON.stringify(points[0])}`).toEqual(FROM);
    expect(points[points.length - 1], `last was: ${JSON.stringify(points.at(-1))}`).toEqual(TO);
  });

  it("분할 수 + 1개의 점을 만든다", () => {
    expect(ropePoints(FROM, TO, 0).length).toBe(ROPE.segments + 1);
  });

  it("가운데가 직선보다 아래로 내려간다", () => {
    // Arrange
    const points = ropePoints(FROM, TO, 0);
    const middle = points[Math.floor(points.length / 2)];
    const straightY = (FROM.y + TO.y) / 2;

    // Assert
    expect(middle.y, `middle.y=${middle.y}, straight=${straightY}`).toBeLessThan(straightY);
  });

  it("완전히 당기면 직선이 된다", () => {
    const points = ropePoints(FROM, TO, 1);
    const middle = points[Math.floor(points.length / 2)];
    expect(middle.y, `middle.y was: ${middle.y}`).toBeCloseTo((FROM.y + TO.y) / 2, 6);
  });

  it("수평 좌표는 처짐과 무관하게 균등하다", () => {
    // 처짐은 y에만 적용되어야 한다 — x/z가 휘면 줄이 옆으로 샌다
    const points = ropePoints(FROM, TO, 0);
    for (let i = 0; i < points.length; i += 1) {
      const t = i / ROPE.segments;
      expect(points[i].z, `z at ${i}`).toBeCloseTo(FROM.z + (TO.z - FROM.z) * t, 6);
    }
  });
});

describe("toSegmentPositions", () => {
  it("이웃한 점을 짝지어 선분을 만든다", () => {
    // Arrange
    const points = ropePoints(FROM, TO, 1);
    const buffer = new Float32Array(SEGMENT_FLOAT_COUNT);

    // Act
    toSegmentPositions(points, buffer);

    // Assert — 첫 선분은 점0 → 점1이어야 한다
    expect(buffer[0]).toBeCloseTo(points[0].x, 5);
    expect(buffer[1]).toBeCloseTo(points[0].y, 5);
    expect(buffer[3]).toBeCloseTo(points[1].x, 5);
    expect(buffer[4]).toBeCloseTo(points[1].y, 5);
  });

  it("버퍼 크기가 선분 수와 맞는다", () => {
    // 어긋나면 줄 끝이 원점까지 뻗는다
    expect(SEGMENT_FLOAT_COUNT).toBe(ROPE.segments * 6);
  });

  it("마지막 선분이 끝점에서 끝난다", () => {
    const points = ropePoints(FROM, TO, 1);
    const buffer = new Float32Array(SEGMENT_FLOAT_COUNT);
    toSegmentPositions(points, buffer);

    const last = SEGMENT_FLOAT_COUNT - 3;
    expect(buffer[last], `x was: ${buffer[last]}`).toBeCloseTo(TO.x, 5);
    expect(buffer[last + 1], `y was: ${buffer[last + 1]}`).toBeCloseTo(TO.y, 5);
    expect(buffer[last + 2], `z was: ${buffer[last + 2]}`).toBeCloseTo(TO.z, 5);
  });
});

describe("갈고리 상태가 화면으로 나가는가", () => {
  /*
   * `hasTarget`을 지워도 아무도 몰랐다 — 그러면 걸 수 있는 자리에 서 있어도
   * **표시가 안 떠서 걸 수 있다는 것을 모른다.** 활강과 함께 이 도시를 도는
   * 방식 자체가 사라지는데 화면은 멀쩡하다.
   *
   * 초기값을 기대값과 다르게 둔다 — false·0으로 시작하면 안 채운 칸이 채운
   * 것처럼 보인다.
   */
  function stale(): GrappleView {
    return {
      ...createGrappleView(),
      attached: true,
      hasTarget: true,
      tension: -1,
      fromX: -999,
      toX: -999,
      targetX: -999,
    };
  }

  const HERE = { x: 0, y: 0, z: 0 };
  const ANCHOR = { x: 3, y: 6, z: 0 };

  it("걸려 있으면 줄의 양 끝이 나간다", () => {
    const view = stale();
    projectGrappleView(view, ANCHOR, HERE, 1.2, null, 12);

    expect(view.attached, "걸려 있는데 줄이 안 그려진다").toBe(true);
    expect(view.fromY, "손 높이가 아니라 발밑에서 줄이 뻗는다").toBeCloseTo(1.2, 6);
    expect(view.toX, "걸린 지점이 안 나갔다").toBeCloseTo(ANCHOR.x, 6);
    expect(view.toY, "걸린 지점이 안 나갔다").toBeCloseTo(ANCHOR.y, 6);
  });

  it("걸려 있는 동안에는 대상 표시를 숨긴다 — 줄과 겹쳐 지저분해진다", () => {
    const view = stale();
    projectGrappleView(view, ANCHOR, HERE, 1.2, { x: 9, y: 9, z: 9 }, 12);
    expect(view.hasTarget, "줄과 표시가 같이 떴다").toBe(false);
  });

  it("걸 수 있는 대상이 있으면 표시가 켜진다 — 없으면 걸 수 있다는 걸 모른다", () => {
    const view = stale();
    projectGrappleView(view, null, HERE, 1.2, ANCHOR, 12);

    expect(view.attached).toBe(false);
    expect(view.hasTarget, "대상이 있는데 표시가 안 뜬다").toBe(true);
    expect(view.targetX, "표시 자리가 안 나갔다").toBeCloseTo(ANCHOR.x, 6);
  });

  it("대상이 없으면 표시가 꺼진다 — 켜진 채면 없는 자리를 가리킨다", () => {
    const view = stale();
    projectGrappleView(view, null, HERE, 1.2, null, 12);
    expect(view.hasTarget).toBe(false);
  });

  it("가까워질수록 줄이 팽팽해진다 — 늘 같으면 끌려가는 느낌이 없다", () => {
    const far = stale();
    projectGrappleView(far, { x: 12, y: 0, z: 0 }, HERE, 1.2, null, 12);
    const near = stale();
    projectGrappleView(near, { x: 2, y: 0, z: 0 }, HERE, 1.2, null, 12);

    expect(near.tension, `가까울 때 ${near.tension}, 멀 때 ${far.tension}`).toBeGreaterThan(
      far.tension,
    );
    expect(near.tension).toBeLessThanOrEqual(1);
    expect(far.tension).toBeGreaterThanOrEqual(0);
  });
});
