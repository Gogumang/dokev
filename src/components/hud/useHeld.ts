"use client";

/**
 * 표본을 **접는** 자리.
 *
 * `useSampled`는 읽은 것을 그대로 돌려준다. 여기 셋은 이전 상태와 합쳐야 하는
 * 것들이다 — 완주 기록처럼 「한 번 굳으면 다시 담지 않는다」, 알림처럼 「바뀐
 * 순간을 붙잡아 잠시 들고 있는다」.
 *
 * 합치는 규칙은 전부 `@/game/systems/hudHold`가 정본이다. 여기서는 시계를 읽어
 * 먹이기만 한다.
 */

import { useEffect, useRef, useState } from "react";

import { createHold, stepHold, type HoldState } from "@/game/systems/hudHold";

/**
 * 표본을 상태에 **접는다**.
 *
 * 읽어서 그대로 보여 주는 것이 아니라 이전 상태와 합쳐야 하는 것들이 쓴다 —
 * 완주 기록처럼 「한 번 굳으면 다시 담지 않는다」가 규칙인 경우다. 합치는
 * 규칙은 `src/game` 쪽 순수 함수가 정본이고, 여기서는 주기만 준다.
 *
 * 사람이 누른 것도 같은 상태를 지나가야 한다 — 돌려받은 `update`로 넘긴다.
 * 따로 `useState`를 하나 더 두면 「닫았는가」와 「굳었는가」가 갈라지고, 그
 * 갈라짐이 실제로 결함이었다(닫아 둔 뒤 다음 완주가 영영 안 뜨던 것).
 */
export function useStepped<S>(
  initial: () => S,
  step: (state: S) => S,
  everyMs: number,
): [S, (next: (state: S) => S) => void] {
  const [state, setState] = useState(initial);
  const latest = useRef(step);

  useEffect(() => {
    latest.current = step;
  });

  useEffect(() => {
    const id = window.setInterval(() => setState((current) => latest.current(current)), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);

  return [state, setState];
}

/**
 * 열쇠가 바뀐 순간을 붙잡아 잠시 들고 있는다.
 *
 * 규칙은 `hudHold`가 정본이다. 여기서는 시계를 읽어 먹이기만 한다.
 *
 * @param sample 직전에 본 열쇠를 받아, 이번 열쇠와 보여 줄 값을 돌려준다.
 *   직전 열쇠를 넘기는 이유: 해금 알림은 **새로 열린 것만** 띄워야 하는데,
 *   그러려면 「무엇이 달라졌는가」를 알아야 한다. 걸쇠가 이미 들고 있는 것을
 *   컴포넌트가 `useRef`로 한 번 더 들고 있을 이유가 없다.
 */
export function useHeld<T>(
  sample: (seenKey: string | null) => { key: string; value: T } | null,
  holdSeconds: number,
  everyMs: number,
  quietFirst: boolean,
): T | null {
  const [state, setState] = useState<HoldState<T>>(() => createHold<T>(quietFirst));
  const latest = useRef(sample);

  useEffect(() => {
    latest.current = sample;
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        const taken = latest.current(current.seen);
        if (!taken) return current;
        return stepHold(current, taken.key, taken.value, performance.now(), holdSeconds * 1000);
      });
    }, everyMs);
    return () => window.clearInterval(id);
  }, [everyMs, holdSeconds]);

  return state.shown;
}
