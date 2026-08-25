import { describe, expect, it } from "vitest";

import { bothWays, describeSplit, splits } from "./support/bothWays";

import { LOCOMOTION } from "@/game/config/tuning";
import {
  advanceStride,
  FOOTSTEP_MIN_SPEED,
  LANDING_MAX_IMPACT,
  LANDING_MIN_IMPACT,
  landingImpact,
  landingSounds,
  STRIDE_METERS,
  walksOnFoot,
} from "@/game/systems/audio/footsteps";

/*
 * 발소리·착지 판정.
 *
 * 오디오 루프 안에 있을 때는 **값으로 잴 데가 없었다.** 걸음 리듬 이월을 버려도,
 * 보드를 타면서 발소리가 나게 해도, 점프 소리를 아예 꺼도 전부 통과했다.
 * 소리를 내는 일과 **언제 낼지**를 갈라, 후자를 여기서 잰다.
 *
 * 소리는 사람이 귀로 확인해 줘야 하는 항목이다. 그 판단은 판정이 맞다는 전제
 * 위에서만 뜻이 있다 — 여기가 흔들리면 사람이 들은 것이 무엇 때문인지 알 수 없다.
 */

describe("언제 발소리를 내는가", () => {
  it("걸으면 낸다", () => {
    expect(walksOnFoot(false, true, 3)).toBe(true);
  });

  it("보드를 타면 안 낸다 — 구름 소리와 겹치면 무엇을 타고 있는지 안 들린다", () => {
    expect(walksOnFoot(true, true, 3)).toBe(false);
  });

  it("공중에서는 안 낸다 — 발이 땅에 없다", () => {
    expect(walksOnFoot(false, false, 3)).toBe(false);
  });

  it("제자리 미끄러짐에는 안 낸다", () => {
    expect(walksOnFoot(false, true, FOOTSTEP_MIN_SPEED)).toBe(false);
    expect(walksOnFoot(false, true, 0)).toBe(false);
  });

  it("문턱이 걷기 속도보다 한참 낮다 — 아니면 걸어도 소리가 안 난다", () => {
    expect(
      FOOTSTEP_MIN_SPEED,
      `문턱 ${FOOTSTEP_MIN_SPEED} vs 걷기 ${LOCOMOTION.walk.maxSpeed}`,
    ).toBeLessThan(LOCOMOTION.walk.maxSpeed * 0.5);
  });
});

describe("걸음 리듬", () => {
  it("보폭을 채우기 전에는 안 울린다", () => {
    const result = advanceStride(0, 0.3, STRIDE_METERS.walk);
    expect(result.stepped).toBe(false);
    expect(result.distance, "누적이 사라졌다").toBeCloseTo(0.3, 6);
  });

  it("보폭을 채우면 울린다", () => {
    const result = advanceStride(0.5, 0.4, STRIDE_METERS.walk);
    expect(result.stepped).toBe(true);
  });

  it("남은 거리를 이월한다 — 버리면 속도가 바뀔 때마다 발과 소리가 따로 논다", () => {
    // 보폭 0.78을 0.1 넘겨 밟았다 → 다음 걸음은 0.1을 안고 시작해야 한다
    const result = advanceStride(0.7, 0.18, STRIDE_METERS.walk);
    expect(result.stepped).toBe(true);
    expect(result.distance, `이월 ${result.distance}`).toBeCloseTo(0.1, 6);
  });

  it("일정 속도로 달리면 보폭마다 정확히 한 번씩 울린다", () => {
    /*
     * 이월이 없으면 여기서 **걸음 수가 줄어든다** — 매번 남은 거리를 버리므로
     * 실제 이동보다 적게 밟는다. 「울리기는 하는가」만 보면 안 잡힌다.
     */
    const FRAME = 1 / 60;
    const speed = LOCOMOTION.run.maxSpeed;
    const seconds = 10;
    let distance = 0;
    let steps = 0;
    for (let i = 0; i < seconds * 60; i += 1) {
      const result = advanceStride(distance, speed * FRAME, STRIDE_METERS.run);
      distance = result.distance;
      if (result.stepped) steps += 1;
    }
    const expected = (speed * seconds) / STRIDE_METERS.run;
    expect(steps, `${seconds}초에 ${steps}걸음 (기대 ${expected.toFixed(1)})`).toBeGreaterThan(
      expected - 1.5,
    );
    expect(steps, `${seconds}초에 ${steps}걸음 (기대 ${expected.toFixed(1)})`).toBeLessThan(
      expected + 1.5,
    );
  });

  it("달리기 보폭이 걷기보다 넓다 — 같으면 달릴 때 소리가 급해진다", () => {
    expect(STRIDE_METERS.run, `달리기 ${STRIDE_METERS.run}`).toBeGreaterThan(STRIDE_METERS.walk);
  });
});

describe("착지 소리", () => {
  it("작은 턱은 안 울린다 — 다 울리면 피로하다", () => {
    expect(landingSounds(0.05)).toBe(false);
  });

  it("제대로 뛰어내리면 울린다", () => {
    expect(landingSounds(1)).toBe(true);
  });

  it("체공이 길수록 세게 친다", () => {
    expect(landingImpact(1), "1초 체공").toBeGreaterThan(landingImpact(0.5));
  });

  it("문턱과 최대치 사이가 벌어져 있다 — 붙으면 세기 차이가 안 들린다", () => {
    expect(
      LANDING_MAX_IMPACT,
      `최대 ${LANDING_MAX_IMPACT} vs 문턱 ${LANDING_MIN_IMPACT}`,
    ).toBeGreaterThan(LANDING_MIN_IMPACT * 2);
  });
});

describe("술어가 실제로 갈리는가", () => {
  /*
   * 위 검사들은 갈래를 하나씩 본다. 그것만으로는 **입력 묶음이 한쪽으로 쏠려도**
   * 안 드러난다 — 늘 참을 돌려주는 함수도 참만 재면 통과한다.
   *
   * 그래서 「양쪽이 다 나오는가」를 따로 묻는다. 이 세션에 「절반만 재기」를
   * 여러 번 해서, 규칙을 기억이 아니라 도구(`tests/support/bothWays.ts`)로 옮겼다.
   */
  it("도구 자체가 갈림을 제대로 본다", () => {
    /*
     * `bothWays`가 늘 참을 돌려주면 **위 검사들이 통째로 눈이 먼다.** 도구를
     * 만들었으면 도구를 지키는 검사도 있어야 한다 — `staleCopy`에서 배운 것이다.
     */
    expect(
      bothWays([1, 2, 3], (n) => n > 2),
      "갈리는데 안 갈린다고 한다",
    ).toBe(true);
    expect(
      bothWays([3, 4, 5], (n) => n > 2),
      "늘 참인데 갈린다고 한다",
    ).toBe(false);
    expect(
      bothWays([1, 2], (n) => n > 2),
      "늘 거짓인데 갈린다고 한다",
    ).toBe(false);
    expect(
      bothWays([], () => true),
      "빈 묶음이 갈린다고 한다",
    ).toBe(false);

    expect(splits([true, false]), "갈리는데 안 갈린다고 한다").toBe(true);
    expect(splits([true, true]), "한 갈래인데 갈린다고 한다").toBe(false);
    expect(splits(["a", "b", "a"]), "불리언이 아니어도 갈림을 본다").toBe(true);
  });

  it("발소리 판정이 상황에 따라 갈린다", () => {
    const cases = [
      { vehicle: null, grounded: true, speed: 3 },
      { vehicle: "skateboard" as const, grounded: true, speed: 3 },
      { vehicle: null, grounded: false, speed: 3 },
      { vehicle: null, grounded: true, speed: 0 },
    ];
    const test = (c: (typeof cases)[number]) =>
      walksOnFoot(c.vehicle !== null, c.grounded, c.speed);

    expect(bothWays(cases, test), describeSplit(cases, test)).toBe(true);
  });

  it("착지 소리 판정이 체공에 따라 갈린다", () => {
    const airtimes = [0.02, 0.05, 0.2, 0.6, 1.2];
    expect(bothWays(airtimes, landingSounds), describeSplit(airtimes, landingSounds)).toBe(true);
  });

  it("걸음 신호가 프레임마다 갈린다 — 매 프레임 울리면 소리가 뭉갠다", () => {
    const frames = Array.from({ length: 30 }, (_, i) => i);
    let distance = 0;
    const stepped = frames.map(() => {
      const result = advanceStride(distance, (LOCOMOTION.run.maxSpeed * 1) / 60, STRIDE_METERS.run);
      distance = result.distance;
      return result.stepped;
    });

    expect(splits(stepped), `울린 프레임 ${stepped.filter(Boolean).length}/30`).toBe(true);
  });
});
