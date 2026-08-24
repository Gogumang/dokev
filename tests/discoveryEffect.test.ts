import { describe, expect, it } from "vitest";

import {
  dissolveState,
  DISSOLVE_SECONDS,
  fovPulse,
  FOV_PULSE_SECONDS,
  MOTE_COUNT,
  motePosition,
  BEAM_BASE_OPACITY,
  BEAM_BREATH_AMPLITUDE,
  beamOpacity,
} from "@/game/dokebi/discoveryEffect";

describe("dissolveState", () => {
  it("시작 순간에는 평소와 같다", () => {
    // 첫 프레임에 튀면 만남이 아니라 오류처럼 보인다
    const state = dissolveState(0);
    expect(state.orbScale).toBe(1);
    expect(state.orbLift).toBe(0);
    expect(state.beamFade).toBe(1);
    expect(state.done).toBe(false);
  });

  it("끝나면 아무것도 남지 않는다", () => {
    const state = dissolveState(DISSOLVE_SECONDS);
    expect(state.orbScale, `orbScale=${state.orbScale}`).toBeCloseTo(0, 5);
    expect(state.beamFade).toBe(0);
    expect(state.baseFade).toBe(0);
    expect(state.done).toBe(true);
  });

  it("구슬이 떠오른다", () => {
    // 제자리에서 사라지면 "꺼졌다"로 보인다. 떠올라야 "따라왔다"가 된다.
    const early = dissolveState(DISSOLVE_SECONDS * 0.3).orbLift;
    const late = dissolveState(DISSOLVE_SECONDS * 0.9).orbLift;
    expect(late, `early=${early}, late=${late}`).toBeGreaterThan(early);
  });

  it("빛기둥이 돌무더기보다 먼저 꺼진다", () => {
    /*
     * 셋이 동시에 사라지면 "꺼졌다"로 읽힌다. 무엇이 마지막에 남느냐가
     * 인상을 정한다.
     */
    const mid = dissolveState(DISSOLVE_SECONDS * 0.7);
    expect(mid.beamFade, `beam=${mid.beamFade}, base=${mid.baseFade}`).toBeLessThan(mid.baseFade);
  });

  it("구슬이 부풀었다 사라진다", () => {
    const swell = dissolveState(DISSOLVE_SECONDS * 0.6).orbScale;
    const end = dissolveState(DISSOLVE_SECONDS * 0.95).orbScale;
    expect(swell, `swell=${swell}`).toBeGreaterThan(1);
    expect(end, `end=${end}`).toBeLessThan(swell);
  });

  it("시간이 지나쳐도 값이 뒤집히지 않는다", () => {
    // 프레임이 밀려 한 번에 큰 dt가 들어와도 마지막 상태로 고정되어야 한다
    const over = dissolveState(DISSOLVE_SECONDS * 5);
    expect(over.orbScale).toBeGreaterThanOrEqual(0);
    expect(over.beamFade).toBe(0);
    expect(over.done).toBe(true);
  });

  it("음수 시간도 안전하다", () => {
    const before = dissolveState(-2);
    expect(before.orbScale).toBe(1);
    expect(before.done).toBe(false);
  });
});

describe("motePosition", () => {
  it("시작 순간에는 한 점에 모여 있다", () => {
    // 처음부터 퍼져 있으면 터진 것이 아니라 원래 그랬던 것처럼 보인다
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      const mote = motePosition(i, 0);
      expect(Math.hypot(mote.x, mote.z), `mote ${i}`).toBeCloseTo(0, 6);
    }
  });

  it("시간이 지나면 사방으로 퍼진다", () => {
    const spread = Array.from({ length: MOTE_COUNT }, (_, i) =>
      motePosition(i, DISSOLVE_SECONDS * 0.6),
    );
    // 한쪽으로 쏠리면 흩어진 것이 아니라 날아간 것으로 보인다
    const sumX = spread.reduce((sum, mote) => sum + mote.x, 0);
    const sumZ = spread.reduce((sum, mote) => sum + mote.z, 0);
    const radius = spread.reduce((max, mote) => Math.max(max, Math.hypot(mote.x, mote.z)), 0);

    expect(radius, `radius=${radius}`).toBeGreaterThan(0.5);
    expect(Math.abs(sumX) / MOTE_COUNT, `mean x=${sumX / MOTE_COUNT}`).toBeLessThan(radius * 0.35);
    expect(Math.abs(sumZ) / MOTE_COUNT, `mean z=${sumZ / MOTE_COUNT}`).toBeLessThan(radius * 0.35);
  });

  it("같은 높이에 몰리지 않는다", () => {
    // 전부 같은 높이면 고리 하나가 떠오르는 것처럼 보인다
    const heights = new Set(
      Array.from({ length: MOTE_COUNT }, (_, i) =>
        motePosition(i, DISSOLVE_SECONDS * 0.5).y.toFixed(2),
      ),
    );
    expect(heights.size, `distinct heights: ${heights.size}`).toBeGreaterThan(3);
  });

  it("위로 올라간다", () => {
    const early = motePosition(0, DISSOLVE_SECONDS * 0.2).y;
    const late = motePosition(0, DISSOLVE_SECONDS * 0.9).y;
    expect(late, `early=${early}, late=${late}`).toBeGreaterThan(early);
  });

  it("끝나면 사라진다", () => {
    for (let i = 0; i < MOTE_COUNT; i += 1) {
      expect(motePosition(i, DISSOLVE_SECONDS).scale, `mote ${i}`).toBe(0);
    }
  });

  it("같은 입력이면 같은 자리다", () => {
    // 난수를 쓰지 않는다 — 그래야 연출을 눈으로 검토할 수 있다
    const a = motePosition(7, 0.5);
    const b = motePosition(7, 0.5);
    expect(a).toEqual(b);
  });
});

describe("fovPulse", () => {
  it("시작과 끝에서는 0이다", () => {
    // 끝나고도 남아 있으면 시야각이 영영 넓어진 채로 굳는다
    expect(fovPulse(0)).toBe(0);
    expect(fovPulse(FOV_PULSE_SECONDS)).toBe(0);
  });

  it("빠르게 열리고 천천히 닫힌다", () => {
    /*
     * 반대로 하면 "놀랐다"가 아니라 "줌 아웃"이 된다. 여는 데 걸리는 시간이
     * 닫는 시간보다 짧은지 본다.
     */
    const peak = fovPulse(FOV_PULSE_SECONDS * 0.2);
    const openingHalf = fovPulse(FOV_PULSE_SECONDS * 0.1);
    const closingHalf = fovPulse(FOV_PULSE_SECONDS * 0.6);

    expect(openingHalf, `opening half=${openingHalf}, peak=${peak}`).toBeCloseTo(peak / 2, 5);
    expect(closingHalf, `closing half=${closingHalf}, peak=${peak}`).toBeCloseTo(peak / 2, 5);
  });

  it("최대치가 과하지 않다", () => {
    // 시야각이 크게 흔들리면 멀미가 난다
    const peak = fovPulse(FOV_PULSE_SECONDS * 0.2);
    expect(peak, `peak=${peak}`).toBeGreaterThan(2);
    expect(peak, `peak=${peak}`).toBeLessThan(10);
  });

  it("범위 밖에서는 0이다", () => {
    expect(fovPulse(-1)).toBe(0);
    expect(fovPulse(FOV_PULSE_SECONDS * 3)).toBe(0);
  });

  it("소멸 연출보다 먼저 끝난다", () => {
    // 카메라가 먼저 가라앉아야 구슬이 떠오르는 여운이 남는다
    expect(FOV_PULSE_SECONDS, `pulse=${FOV_PULSE_SECONDS}`).toBeLessThan(DISSOLVE_SECONDS);
  });
});

describe("빛기둥 밝기", () => {
  /*
   * 0.11 ± 0.04였다. 브라우저에서 22m 앞에 서서 노을·밤 양쪽으로 봤지만
   * **아무것도 보이지 않았다.** 가산 합성이라 밝은 거리 위에 더해지는 양이
   * 거의 없었다 — 임시로 0.6까지 올려 보고서야 기둥이 거기 있는 것을 확인했다.
   *
   * 「골목에서 보이는지」가 이 연출의 존재 이유이므로 밑바닥을 못 박아 둔다.
   */
  it("밝은 거리 위에서도 보일 만큼 밑바닥이 있다", () => {
    const samples = Array.from({ length: 40 }, (_, i) => beamOpacity(i * 0.25, false));
    const lowest = Math.min(...samples);
    expect(lowest, `가장 어두울 때 ${lowest.toFixed(3)}`).toBeGreaterThan(0.2);
  });

  it("숨쉬는 폭이 밑바닥의 4분의 1을 넘지 않는다", () => {
    // 폭이 크면 신호가 아니라 경고등처럼 보인다
    expect(BEAM_BREATH_AMPLITUDE).toBeLessThanOrEqual(BEAM_BASE_OPACITY / 4);
  });

  it("불투명하지 않다 — 뒤가 비쳐야 기둥으로 읽힌다", () => {
    const highest = Math.max(...Array.from({ length: 40 }, (_, i) => beamOpacity(i * 0.25, false)));
    expect(highest, `가장 밝을 때 ${highest.toFixed(3)}`).toBeLessThan(0.5);
  });

  it("저감 모션에서는 숨쉬지 않되 같은 대역에 있다", () => {
    const still = beamOpacity(0, true);
    const other = beamOpacity(123.4, true);
    expect(still, "저감 모션인데 값이 흔들린다").toBe(other);
    expect(still).toBeGreaterThan(0.2);
    expect(still).toBeLessThan(0.5);
  });
});
