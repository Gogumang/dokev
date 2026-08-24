import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { chordRootForBar } from "@/game/systems/audio/music";

describe("chordRootForBar", () => {
  it("8마디마다 처음으로 돌아온다", () => {
    // 4마디로 돌면 30초도 안 되어 같은 자리가 되돌아온다
    for (let bar = 0; bar < 8; bar += 1) {
      expect(chordRootForBar(bar + 8), `bar ${bar}`).toBe(chordRootForBar(bar));
    }
  });

  it("한 바퀴 안에서 같은 값만 반복하지 않는다", () => {
    const roots = Array.from({ length: 8 }, (_, bar) => chordRootForBar(bar));
    expect(new Set(roots).size, `roots were: ${roots.join(",")}`).toBeGreaterThan(2);
  });

  it("앞 4마디와 뒤 4마디가 다르다", () => {
    // 같으면 8마디로 늘린 의미가 없다
    const front = [0, 1, 2, 3].map((bar) => chordRootForBar(bar)).join(",");
    const back = [4, 5, 6, 7].map((bar) => chordRootForBar(bar)).join(",");
    expect(back, `front=${front}, back=${back}`).not.toBe(front);
  });

  it("음수 마디에서도 유효한 값을 돌려준다", () => {
    // 시계가 튀거나 계산이 어긋나도 undefined가 나오면 무음이 된다
    for (const bar of [-1, -7, -8, -13]) {
      const root = chordRootForBar(bar);
      expect(Number.isFinite(root), `bar ${bar} gave ${root}`).toBe(true);
    }
  });

  it("항상 진행 안의 값만 돌려준다", () => {
    const allowed = new Set([0, 3, 5, 7, 8]);
    for (let bar = -20; bar < 40; bar += 1) {
      expect(allowed.has(chordRootForBar(bar)), `bar ${bar} gave ${chordRootForBar(bar)}`).toBe(
        true,
      );
    }
  });
});

describe("구역별 화음", () => {
  it("구역이 다르면 진행도 다르다", () => {
    const plaza = [0, 1, 2, 3, 4, 5, 6, 7].map((bar) => chordRootForBar(bar, "plaza")).join(",");
    const outer = [0, 1, 2, 3, 4, 5, 6, 7].map((bar) => chordRootForBar(bar, "residential")).join(",");
    expect(outer, `plaza=${plaza}, residential=${outer}`).not.toBe(plaza);
  });

  it("모든 구역이 8마디 진행을 가진다", () => {
    for (const id of ["plaza", "downtown", "residential"] as const) {
      const roots = Array.from({ length: 8 }, (_, bar) => chordRootForBar(bar, id));
      // undefined가 하나라도 섞이면 그 마디는 무음이 된다
      expect(roots.every(Number.isFinite), `${id}: ${roots.join(",")}`).toBe(true);
      expect(chordRootForBar(8, id), `${id} wrap`).toBe(roots[0]);
    }
  });

  it("구역을 안 주면 광장 진행을 쓴다", () => {
    // 기존 호출부가 그대로 동작해야 한다
    expect(chordRootForBar(3)).toBe(chordRootForBar(3, "plaza"));
  });
});

describe("음악이 들리기는 하는가", () => {
  /*
   * 진행(어떤 화음이 언제 오는가)은 잘 보고 있었는데, **소리가 나는지**는
   * 아무도 안 봤다. 세기를 0으로 두면 배선이 다 있는데 조용하고, 이건 가장
   * 알아채기 어려운 고장이다 — 주변 소리에서 같은 구멍을 막았다.
   *
   * 값만 읽는다. `AudioContext`가 없는 환경에서도 돌아야 한다.
   */
  const source = readCode("src/game/systems/audio/music.ts");

  function value(name: string): number {
    const match = new RegExp(`const ${name} = ([\\d.]+)`).exec(source);
    expect(match, `${name}을 못 찾았다`).not.toBeNull();
    return Number(match?.[1]);
  }

  it("음량이 0이 아니다", () => {
    const gain = value("MUSIC_GAIN");
    expect(gain, `음량 ${gain}`).toBeGreaterThan(0.01);
    // 1을 넘으면 다른 소리를 다 덮고 찌그러진다
    expect(gain, `음량 ${gain}`).toBeLessThan(0.5);
  });

  it("빠르기가 사람이 걷는 속도 언저리다", () => {
    /*
     * 이 게임은 노을 진 동네를 걷고 달리는 것이다. 40 아래면 멈춰 있는
     * 느낌이고 180을 넘으면 쫓기는 느낌이 된다.
     */
    const bpm = value("BPM");
    expect(bpm, `${bpm}BPM`).toBeGreaterThan(40);
    expect(bpm, `${bpm}BPM`).toBeLessThan(180);
  });

  it("근음이 들을 수 있는 높이다", () => {
    // 20Hz 아래는 소리가 아니라 진동이다
    expect(value("ROOT_HZ"), "근음").toBeGreaterThan(20);
  });

  it("음계가 겹치지 않고 올라간다", () => {
    /*
     * 같은 음을 두 번 넣으면 화음이 얇아지고, 순서가 뒤집히면 음계가 아니라
     * 나열이 된다.
     */
    const raw = /const SCALE_SEMITONES = \[([\d,\s]+)\]/.exec(source)?.[1] ?? "";
    const steps = raw.split(",").map((part) => Number(part.trim()));
    expect(steps.length, `음계 ${steps.length}음`).toBeGreaterThan(2);
    expect(new Set(steps).size, `${steps.join(", ")}`).toBe(steps.length);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `${steps.join(", ")}`).toBeGreaterThan(steps[i - 1]);
    }
  });

  it("한 마디가 실제로 시간이 흐른다", () => {
    // 0이면 마디가 넘어가지 않아 같은 화음에 머문다
    const beats = value("BEATS_PER_BAR");
    expect(beats, `한 마디 ${beats}박`).toBeGreaterThan(1);
  });
});
