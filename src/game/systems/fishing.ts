/**
 * 낚시 — 순수 상태 기계.
 *
 * 펄어비스 보도자료가 「fishing activities」를 직접 적는다. 우리 놀이는 자판기
 * 하나뿐이었다 — 도시가 전투용 맵이 아니라 놀이 공간이라는 말이 화면에서는
 * 자판기 한 대로만 지켜지고 있었다.
 *
 * 규칙은 **기다림과 한 번의 타이밍**이다. 던지면 얼마나 기다릴지 그때 정해지고,
 * 찌가 잠기는 짧은 창 안에 다시 눌러야 잡힌다. 놓치면 그냥 다시 던진다 — 벌은
 * 없다. 이 게임에서 실패가 무거웠던 적은 없다.
 *
 * 난수는 **시드로 고정**한다. 판마다 다른 것보다 **같은 판에서 재현되는** 것이
 * 중요하다 — 재현되지 않으면 검사가 타이밍을 잴 수 없다.
 *
 * three.js도 React도 모른다.
 */

import { createSeededRandom } from "@/game/core/mathx";

export const FISHING = {
  /**
   * 찌가 잠기기까지 기다리는 시간(초)의 범위.
   *
   * 짧으면 던지자마자 눌러야 해서 「기다림」이 없고, 길면 손을 놓게 된다.
   * 상한이 반드시 있어야 한다 — 없으면 안 오는 판이 생기고, 그건 고장으로 보인다.
   */
  minWaitSeconds: 1.8,
  maxWaitSeconds: 5.5,
  /**
   * 잠긴 뒤 잡을 수 있는 창(초).
   *
   * 사람 반응 시간(0.2~0.3초)의 세 배쯤이다. 좁히면 운이 되고, 넓히면 아무 때나
   * 눌러도 잡혀 타이밍이 아니게 된다.
   */
  biteWindowSeconds: 0.9,
  /** 잡거나 놓친 결과를 보여 주는 시간(초) */
  resultSeconds: 1.6,
} as const;

/**
 * 잡히는 것들.
 *
 * 모델을 만들지 않는다 — 이름으로 족하다(웹 다운로드 예산). 이 동네 바다에서
 * 나올 법한 것들로 고르고, 하나는 물고기가 아니다. 늘 성공만 하면 놀이가 아니다.
 */
export const FISH_NAMES: readonly string[] = ["감성돔", "우럭", "노래미", "학꽁치", "장화 한 짝"];

export type FishingPhase = "idle" | "waiting" | "bite" | "caught" | "missed";

export interface FishingState {
  phase: FishingPhase;
  /** 지금 단계가 끝나기까지 남은 시간(초) */
  timer: number;
  /** 방금 잡은 것. 없으면 null */
  catchName: string | null;
  /** 지금까지 잡은 수 */
  caught: number;
  /** 다음 대기 시간과 어종을 정하는 난수. 시드로 고정된다 */
  random: () => number;
}

export function createFishing(seed = 0x1f15): FishingState {
  return {
    phase: "idle",
    timer: 0,
    catchName: null,
    caught: 0,
    random: createSeededRandom(seed),
  };
}

/**
 * 줄을 던진다. 이미 물에 들어가 있으면 아무 일도 없다.
 *
 * 결과를 보고 있는 중(`caught`·`missed`)에는 다시 던질 수 있다 — 결과 화면이
 * 끝나기를 기다리게 하면 놀이가 아니라 절차가 된다.
 */
export function castLine(state: FishingState): FishingState {
  if (state.phase === "waiting" || state.phase === "bite") return state;

  const span = FISHING.maxWaitSeconds - FISHING.minWaitSeconds;
  return {
    ...state,
    phase: "waiting",
    timer: FISHING.minWaitSeconds + state.random() * span,
    catchName: null,
  };
}

/**
 * 한 프레임 진행한다.
 *
 * `waiting`이 끝나면 찌가 잠기고(`bite`), 그 창을 흘려보내면 놓친 것이다.
 * 놓쳐도 줄은 걷힌다 — 물속에서 영영 기다리는 상태를 만들지 않는다.
 */
export function stepFishing(state: FishingState, dt: number): FishingState {
  if (state.phase === "idle") return state;

  const timer = state.timer - dt;
  if (timer > 0) return { ...state, timer };

  if (state.phase === "waiting") {
    return { ...state, phase: "bite", timer: FISHING.biteWindowSeconds };
  }
  if (state.phase === "bite") {
    return { ...state, phase: "missed", timer: FISHING.resultSeconds };
  }

  // caught·missed — 결과를 다 보여 줬으면 손을 턴다
  return { ...state, phase: "idle", timer: 0, catchName: null };
}

/**
 * 줄을 당긴다.
 *
 * 찌가 잠긴 창 안이면 잡히고, 그 밖이면 놓친다. **창 밖 입력을 그냥 무시하지
 * 않는다** — 아무 때나 눌러도 손해가 없으면 연타가 최선의 전략이 되고, 그러면
 * 타이밍을 맞히는 놀이가 아니다.
 */
export function pullLine(state: FishingState): FishingState {
  if (state.phase === "bite") {
    const index = Math.floor(state.random() * FISH_NAMES.length) % FISH_NAMES.length;
    return {
      ...state,
      phase: "caught",
      timer: FISHING.resultSeconds,
      catchName: FISH_NAMES[index],
      caught: state.caught + 1,
    };
  }

  if (state.phase === "waiting") {
    return { ...state, phase: "missed", timer: FISHING.resultSeconds, catchName: null };
  }

  return state;
}
