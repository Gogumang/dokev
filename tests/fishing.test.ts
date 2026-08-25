import { describe, expect, it } from "vitest";

import {
  castLine,
  createFishing,
  FISH_NAMES,
  FISHING,
  pullLine,
  stepFishing,
  type FishingState,
} from "@/game/systems/fishing";

/*
 * 낚시.
 *
 * 놀이가 자판기 하나뿐이었다 — 「도시는 전투용 맵이 아니라 놀이 공간」이라는
 * 말이 화면에서는 자판기 한 대로만 지켜지고 있었다(RALPH_BACKLOG 「8. 해안에
 * 부두를 놓고 낚시를 만든다」).
 *
 * 백로그가 요구한 검사가 셋이다: **창 밖 입력이 실패로 처리되는가**, **시드
 * 고정으로 재현되는가**, **대기 시간에 상한이 있는가**.
 */
function advance(state: FishingState, seconds: number): FishingState {
  let next = state;
  for (let t = 0; t < seconds; t += 1 / 60) next = stepFishing(next, 1 / 60);
  return next;
}

describe("던지고 기다린다", () => {
  it("처음에는 아무것도 안 하고 있다", () => {
    expect(createFishing().phase).toBe("idle");
  });

  it("던지면 기다린다", () => {
    expect(castLine(createFishing()).phase).toBe("waiting");
  });

  it("대기 시간에 상한이 있다 — 없으면 안 오는 판이 생기고 그건 고장으로 보인다", () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const cast = castLine(createFishing(seed));
      expect(cast.timer, `시드 ${seed}: ${cast.timer}초`).toBeGreaterThanOrEqual(
        FISHING.minWaitSeconds,
      );
      expect(cast.timer, `시드 ${seed}: ${cast.timer}초`).toBeLessThanOrEqual(
        FISHING.maxWaitSeconds,
      );
    }
  });

  it("기다림이 끝나면 찌가 잠긴다", () => {
    const cast = castLine(createFishing());
    expect(advance(cast, FISHING.maxWaitSeconds + 0.1).phase).toBe("bite");
  });

  it("이미 던져 놓았으면 다시 던져도 시간이 초기화되지 않는다", () => {
    // 연타로 대기 시간을 다시 굴릴 수 있으면 기다림이 없어진다
    const cast = castLine(createFishing());
    expect(castLine(cast), "다시 던져졌다").toBe(cast);
  });
});

describe("타이밍", () => {
  it("잠긴 창 안에 당기면 잡힌다", () => {
    const bite = advance(castLine(createFishing()), FISHING.maxWaitSeconds + 0.1);
    const pulled = pullLine(bite);

    expect(pulled.phase, "창 안인데 놓쳤다").toBe("caught");
    expect(pulled.catchName, "잡았는데 이름이 없다").not.toBeNull();
    expect(FISH_NAMES, "목록에 없는 것이 잡혔다").toContain(pulled.catchName);
    expect(pulled.caught, "센 수가 안 늘었다").toBe(1);
  });

  it("기다리는 중에 당기면 놓친다 — 아무 때나 눌러도 되면 타이밍이 아니다", () => {
    const waiting = castLine(createFishing());
    expect(pullLine(waiting).phase, "연타가 최선의 전략이 된다").toBe("missed");
  });

  it("창을 흘려보내면 놓친다", () => {
    const bite = advance(castLine(createFishing()), FISHING.maxWaitSeconds + 0.1);
    expect(advance(bite, FISHING.biteWindowSeconds + 0.1).phase).toBe("missed");
  });

  it("창이 사람이 반응할 만큼은 열려 있다", () => {
    // 반응 시간(0.2~0.3초)보다 짧으면 실력이 아니라 운이다
    expect(FISHING.biteWindowSeconds, `${FISHING.biteWindowSeconds}초`).toBeGreaterThan(0.5);
  });

  it("놓쳐도 줄은 걷힌다 — 물속에서 영영 기다리는 상태를 만들지 않는다", () => {
    const missed = pullLine(castLine(createFishing()));
    expect(advance(missed, FISHING.resultSeconds + 0.1).phase).toBe("idle");
  });

  it("결과를 보는 중에는 다시 던질 수 있다", () => {
    // 결과 화면이 끝나기를 기다리게 하면 놀이가 아니라 절차가 된다
    const missed = pullLine(castLine(createFishing()));
    expect(castLine(missed).phase).toBe("waiting");
  });
});

describe("재현되는가", () => {
  it("같은 시드는 같은 대기 시간을 준다", () => {
    const a = castLine(createFishing(7));
    const b = castLine(createFishing(7));
    expect(a.timer, `${a.timer} vs ${b.timer}`).toBe(b.timer);
  });

  it("다른 시드는 다른 판이다 — 늘 같으면 시드가 일을 안 하는 것이다", () => {
    const timers = [1, 2, 3, 4, 5].map((seed) => castLine(createFishing(seed)).timer);
    expect(new Set(timers).size, `대기 시간 ${timers.join(", ")}`).toBeGreaterThan(1);
  });

  it("이어서 던져도 같은 값이 반복되지 않는다", () => {
    /*
     * 난수를 매번 새로 만들면 한 판 안에서 **같은 대기 시간이 계속 나온다** —
     * 시드 고정과 「늘 같은 값」은 다르다.
     */
    let state = createFishing(3);
    const timers: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = castLine(state);
      timers.push(state.timer);
      state = advance(state, FISHING.maxWaitSeconds + FISHING.biteWindowSeconds + 0.2);
      state = advance(state, FISHING.resultSeconds + 0.1);
    }
    expect(
      new Set(timers).size,
      `대기 시간들 ${timers.map((t) => t.toFixed(2)).join(", ")}`,
    ).toBeGreaterThan(1);
  });
});
