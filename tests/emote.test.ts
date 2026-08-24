import { describe, expect, it } from "vitest";

import { LINES } from "@/game/quest/dialogue";

import {
  createEmoteState,
  currentEmote,
  EMOTES,
  emoteCue,
  emotePose,
  isEmoting,
  stepEmote,
} from "@/game/player/emote";

const STILL = { requested: false, speed: 0, grounded: true };
const START = { requested: true, speed: 0, grounded: true };

describe("stepEmote", () => {
  it("멈춰 있을 때만 시작한다", () => {
    // 뛰면서 시작할 수는 없다. 멈춰야 표현이다.
    expect(isEmoting(stepEmote(createEmoteState(), 0.1, START))).toBe(true);
    expect(
      isEmoting(stepEmote(createEmoteState(), 0.1, { requested: true, speed: 5, grounded: true })),
    ).toBe(false);
  });

  it("공중에서는 시작하지 않는다", () => {
    const state = stepEmote(createEmoteState(), 0.1, {
      requested: true,
      speed: 0,
      grounded: false,
    });
    expect(isEmoting(state)).toBe(false);
  });

  it("움직이면 즉시 끊긴다", () => {
    /*
     * 조작을 막지 않는 것이 감정 표현보다 우선이다. 끝날 때까지 못 움직이면
     * 그건 연출이 아니라 고장이다.
     */
    let state = stepEmote(createEmoteState(), 0.1, START);
    state = stepEmote(state, 0.1, { requested: false, speed: 4, grounded: true });
    expect(isEmoting(state)).toBe(false);
  });

  it("하는 중에 다시 누르면 다음 동작으로 넘어간다", () => {
    let state = stepEmote(createEmoteState(), 0.1, START);
    const first = state.index;
    state = stepEmote(state, 0.1, START);

    expect(state.index, `first=${first}, next=${state.index}`).not.toBe(first);
    expect(state.elapsed, "새 동작은 처음부터 시작해야 한다").toBe(0);
  });

  it("끝나면 다음 동작을 예약한다", () => {
    // 같은 것만 반복하면 셋을 만든 의미가 없다
    let state = stepEmote(createEmoteState(), 0.1, START);
    const first = state.index;
    state = stepEmote(state, EMOTES[first].seconds + 0.1, STILL);

    expect(state.elapsed).toBeNull();
    expect(state.index).not.toBe(first);
  });

  it("한 바퀴 돌면 처음으로 돌아온다", () => {
    let state = createEmoteState();
    for (let i = 0; i < EMOTES.length; i += 1) {
      state = stepEmote(state, 0.01, START);
      state = stepEmote(state, EMOTES[state.index].seconds + 0.1, STILL);
    }
    expect(state.index).toBe(0);
  });

  it("요청이 없으면 아무 일도 없다", () => {
    const fresh = createEmoteState();
    expect(stepEmote(fresh, 0.1, STILL)).toBe(fresh);
  });
});

describe("EMOTES", () => {
  it("셋 이상이고 이름이 모두 다르다", () => {
    expect(EMOTES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(EMOTES.map((emote) => emote.id)).size).toBe(EMOTES.length);
    expect(new Set(EMOTES.map((emote) => emote.name)).size).toBe(EMOTES.length);
  });

  it("길이가 적당하다", () => {
    // 너무 짧으면 못 보고, 길면 조작이 멈춘 것처럼 느껴진다
    for (const emote of EMOTES) {
      expect(emote.seconds, `${emote.id}=${emote.seconds}s`).toBeGreaterThan(1);
      expect(emote.seconds, `${emote.id}=${emote.seconds}s`).toBeLessThan(6);
    }
  });

  it("모든 동작에서 팔이 몸통을 통과하지 않는다", () => {
    for (const emote of EMOTES) {
      for (let t = 0; t <= emote.seconds; t += 0.1) {
        const pose = emote.poseAt(t);
        expect(Math.abs(pose.leftArmX), `${emote.id} t=${t.toFixed(1)}`).toBeLessThan(Math.PI);
        expect(Math.abs(pose.rightArmX), `${emote.id} t=${t.toFixed(1)}`).toBeLessThan(Math.PI);
        expect(Math.abs(pose.lean), `${emote.id} lean t=${t.toFixed(1)}`).toBeLessThan(1);
      }
    }
  });

  it("모든 동작에서 팔이 몸통에 붙지 않는다", () => {
    // 붙어 있으면 실루엣이 통나무가 된다
    for (const emote of EMOTES) {
      for (let t = 0; t <= emote.seconds; t += 0.2) {
        const pose = emote.poseAt(t);
        expect(Math.abs(pose.leftArmZ), `${emote.id} t=${t.toFixed(1)}`).toBeGreaterThan(0.05);
      }
    }
  });

  it("춤은 자세가 계속 변하고 앉기는 자리를 잡는다", () => {
    const dance = EMOTES.find((emote) => emote.id === "dance");
    const sit = EMOTES.find((emote) => emote.id === "sit");
    expect(dance && sit).toBeTruthy();
    if (!dance || !sit) return;

    // 춤은 고정되면 포즈가 되고
    expect(dance.poseAt(0).leftArmX).not.toBeCloseTo(dance.poseAt(0.6).leftArmX, 3);
    // 앉기는 자리를 잡고 나면 흔들리지 않는다
    expect(sit.poseAt(1.5).leftLegX).toBeCloseTo(sit.poseAt(2.5).leftLegX, 5);
  });

  it("앉기는 두 다리를 같이 접는다", () => {
    const sit = EMOTES.find((emote) => emote.id === "sit");
    if (!sit) return;
    const pose = sit.poseAt(1);
    // 번갈아 접으면 앉는 게 아니라 걷는 동작이다
    expect(pose.leftLegX * pose.rightLegX, `left=${pose.leftLegX}`).toBeGreaterThan(0);
  });
});

describe("emotePose / currentEmote", () => {
  it("아무 동작도 안 하면 null이다", () => {
    expect(emotePose(createEmoteState())).toBeNull();
    expect(currentEmote(createEmoteState())).toBeNull();
  });

  it("하는 중에는 그 동작의 자세를 준다", () => {
    const state = stepEmote(createEmoteState(), 0.1, START);
    expect(currentEmote(state)?.id).toBe(EMOTES[state.index].id);
    expect(emotePose(state)).not.toBeNull();
  });
});

describe("감정 표현마다 다른 말을 하는가", () => {
  /*
   * 셋 다 「dance」 대사를 쓰고 있었다 — 앉았는데 동료가 「박자 맞네」라고
   * 하면, 그건 이쪽을 보고 있지 않다는 뜻이다. 같이 하는 동작인데 혼자
   * 딴 이야기를 한다.
   */
  it("동작마다 상황이 다르다", () => {
    const cues = EMOTES.map((_, index) => emoteCue(index));
    expect(new Set(cues).size, `상황 ${cues.join(", ")}`).toBe(EMOTES.length);
  });

  it("각 동작의 이름과 맞는다", () => {
    for (const [index, emote] of EMOTES.entries()) {
      expect(emoteCue(index), `${emote.id}의 상황`).toBe(emote.id);
    }
  });

  it("모르는 동작이면 말을 잃지 않는다", () => {
    // 새 동작을 추가하고 대사를 잊어도 침묵하지는 않아야 한다
    expect(emoteCue(999)).toBe("dance");
  });

  it("각 상황에 실제 대사가 있다", () => {
    for (const [index] of EMOTES.entries()) {
      const cue = emoteCue(index);
      expect(LINES[cue]?.length ?? 0, `${cue}에 대사가 없다`).toBeGreaterThan(1);
    }
  });
});

describe("모든 감정 표현에 닿을 수 있는가", () => {
  /*
   * 누를 때마다 다음 것으로 넘어간다. 그중 하나라도 나오지 않으면 만들어
   * 두고 아무도 못 보는 동작이 된다 — 이 저장소에서 「만들어 두고 연결하지
   * 않으면 없는 것과 같다」를 여러 번 만났다.
   *
   * 조건식을 읽지 않고 실제로 눌러 본다.
   */
  it("눌러 나가면 전부 나온다", () => {
    const seen = new Set<number>();
    let state = createEmoteState();
    const still = { speed: 0, grounded: true };

    for (let press = 0; press < EMOTES.length * 3; press += 1) {
      state = stepEmote(state, 1 / 60, { ...still, requested: true });
      seen.add(state.index);
      // 다음 요청이 같은 표현으로 묶이지 않도록 충분히 흘려보낸다
      for (let i = 0; i < 60 * 6; i += 1) {
        state = stepEmote(state, 1 / 60, { ...still, requested: false });
      }
    }

    expect(seen.size, `나온 표현 ${seen.size}종 / 전체 ${EMOTES.length}종`).toBe(EMOTES.length);
  });

  it("표현마다 이름과 길이가 있다", () => {
    // 이름이 없으면 대사·자막과 이을 수 없고, 길이가 0이면 눈에 안 보인다
    for (const emote of EMOTES) {
      expect(emote.id.length, `${emote.id}`).toBeGreaterThan(0);
      expect(emote.seconds, `${emote.id}의 길이 ${emote.seconds}`).toBeGreaterThan(0.3);
    }
  });
});
