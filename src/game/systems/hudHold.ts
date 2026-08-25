/**
 * 「언제 바뀌었나」를 다루는 순수 상태 — HUD 알림의 기능 쪽.
 *
 * 화면 컴포넌트마다 같은 것을 손으로 다시 짜고 있었다. 해금 알림·구역 배너·
 * 무기 알림이 각자 `useRef`로 이전 값을 들고, 각자 `performance.now()`에
 * 밀리초를 더해 감출 시각을 잡고, 각자 `setInterval` 안에서 그 셋을 비교했다 —
 * **같은 규칙 셋인데 고칠 곳이 셋**이었고, 그중 하나(첫 표본을 알릴지)는 실제로
 * 서로 달랐다.
 *
 * 시계를 읽지 않는다. `now`를 받는다 — 그래야 시간이 걸린 규칙을 검사가 잴 수
 * 있다. 지금까지 이 규칙들은 브라우저를 띄우지 않고는 확인할 방법이 없었다.
 */

/**
 * 값이 바뀐 순간을 붙잡아 정해진 시간 동안 들고 있는 상태.
 *
 * 「무엇이 바뀌었는가」는 열쇠(`key`) 문자열로 판단한다. 값 자체를 비교하면
 * 도깨비 객체처럼 참조가 매번 바뀌는 것을 못 다룬다.
 */
export interface HoldState<T> {
  /** 지금 보여 줄 것. 없으면 null */
  readonly shown: T | null;
  /** 마지막으로 본 열쇠. 아직 한 번도 안 봤으면 null */
  readonly seen: string | null;
  /** 이 시각(ms)이 지나면 감춘다. 0이면 들고 있는 것이 없다 */
  readonly until: number;
  /**
   * 첫 표본을 알림 없이 받아들일지.
   *
   * 해금 알림은 **이미 갖고 있던 도깨비**까지 「새로 만났다」고 하면 안 되므로
   * 첫 표본을 조용히 삼킨다. 반대로 구역 배너는 처음 들어선 구역의 이름을
   * 반드시 띄워야 한다 — 지금까지 이 차이가 두 파일에 각자 적혀 있었다.
   */
  readonly quietFirst: boolean;
}

export function createHold<T>(quietFirst: boolean): HoldState<T> {
  return { shown: null, seen: null, until: 0, quietFirst };
}

/**
 * 표본 하나를 먹인다.
 *
 * 열쇠가 그대로면 시간만 본다. 바뀌었으면 새 값을 들고 시각을 다시 잡는다 —
 * 구역을 빠르게 오갈 때 배너가 겹치던 것을 이 규칙 하나가 막는다.
 */
export function stepHold<T>(
  state: HoldState<T>,
  key: string,
  value: T,
  now: number,
  holdMs: number,
): HoldState<T> {
  if (key === state.seen) {
    if (state.until !== 0 && now > state.until) {
      return { ...state, shown: null, until: 0 };
    }
    return state;
  }

  if (state.quietFirst && state.seen === null) {
    return { ...state, seen: key, quietFirst: false };
  }

  return { shown: value, seen: key, until: now + holdMs, quietFirst: false };
}

/**
 * 마지막으로 바뀐 시각만 들고 있는 상태.
 *
 * 「바뀐 뒤 몇 초 지났나」로 모습을 정하는 것들이 쓴다 — 목표 패널이 접히는
 * 때, 체력이 다 찬 뒤 남아 있는 동안. 무엇을 보여 줄지는 `hudFocus`가 정하고,
 * 여기서는 **시간만** 잰다.
 */
export interface SinceState {
  readonly seen: string | null;
  readonly at: number;
}

export function createSince(): SinceState {
  return { seen: null, at: 0 };
}

export function stepSince(state: SinceState, key: string, now: number): SinceState {
  return key === state.seen ? state : { seen: key, at: now };
}

/**
 * 바뀐 뒤 흐른 시간(초).
 *
 * 한 번도 안 바뀌었으면 무한대다. 0을 돌려주면 시작하자마자 「방금 바뀌었다」가
 * 되어, 무기 알림이 아무도 누르지 않았는데 뜬다.
 */
export function secondsSince(state: SinceState, now: number): number {
  return state.seen === null ? Number.POSITIVE_INFINITY : (now - state.at) / 1000;
}
