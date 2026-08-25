"use client";

/**
 * 공유 가변 객체를 화면으로 옮기는 **유일한** 자리.
 *
 * 이 프로젝트의 씬은 매 프레임 같은 객체를 제자리에서 고친다. 새 객체를 만들면
 * HUD가 들고 있던 참조와 갈라지기 때문인데, 그 대가로 **React가 바뀐 줄 모른다.**
 * 그래서 화면 쪽이 자기 주기로 들여다본다.
 *
 * 그 「들여다보기」를 컴포넌트마다 손으로 짜고 있었다 — `setInterval` 스물여섯
 * 개. 하나하나는 열 줄이지만 셋을 매번 다시 정해야 했다: 주기, 같은 값일 때
 * 리렌더를 막는 비교, 정리. 그중 비교를 빠뜨린 곳이 있었고 아무 일도 없는 동안
 * 초당 여덟 번씩 HUD 전체가 다시 그려졌다.
 *
 * 여기 모으면 화면 컴포넌트는 **값만 받는다.** 시간도, 공유 객체도, 효과도
 * 모르는 순수한 함수가 된다.
 */

import { useEffect, useRef, useState } from "react";

/** 같은 값인지. 기본은 참조 비교라, 객체를 돌려주는 곳은 직접 넘겨야 한다 */
export type Equal<T> = (a: T, b: T) => boolean;

/**
 * 얕은 비교.
 *
 * 표본은 대개 납작한 객체(`{ hp, downed }`)다. 참조만 보면 매 주기 새 객체라
 * 늘 다르고, 깊은 비교는 이 주기에 과하다.
 */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * 공유 객체를 주기적으로 읽어 값으로 돌려준다.
 *
 * `read`는 렌더마다 새 함수여도 된다 — 참조로 들고 있다가 부른다. 주기를
 * 바꾸지 않는 한 타이머를 다시 걸지 않는다.
 */
export function useSampled<T>(read: () => T, everyMs: number, equal: Equal<T> = Object.is): T {
  const [value, setValue] = useState(read);
  const latest = useRef({ read, equal });

  useEffect(() => {
    latest.current = { read, equal };
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      setValue((current) => {
        const next = latest.current.read();
        return latest.current.equal(current, next) ? current : next;
      });
    }, everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);

  return value;
}
