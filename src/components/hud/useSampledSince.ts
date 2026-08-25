"use client";

/**
 * 「바뀐 뒤 몇 초 지났나」로 모습이 정해지는 것들.
 *
 * 목표 패널이 접히는 때, 체력이 다 찬 뒤 남아 있는 동안, 무기 이름이 사라지는
 * 때 — 셋 다 같은 모양이라 한 곳에 둔다.
 */

import { useEffect, useRef, useState } from "react";

import { createSince, secondsSince, stepSince } from "@/game/systems/hudHold";
import type { Equal } from "@/components/hud/useSampled";

/**
 * 열쇠가 바뀐 때를 기억하면서 표본을 뜬다.
 *
 * `read`는 **바뀐 뒤 흐른 초**를 받아 화면이 쓸 값을 만든다. 목표 패널이
 * 접히는 때, 체력이 다 찬 뒤 남아 있는 동안처럼 모습이 시간으로 정해지는
 * 것들이 쓴다.
 *
 * 흐른 초를 그대로 돌려주지 않는 이유: 그 값은 매 주기 커지므로 화면이 초당
 * 여덟 번 다시 그려진다. **결정된 모습**만 돌려주고 그것이 달라졌을 때만
 * 리렌더한다 — 「9초가 지났는가」는 9초에 딱 한 번 바뀐다.
 */
export function useSampledSince<T>(
  key: () => string,
  read: (secondsSinceChange: number) => T,
  everyMs: number,
  equal: Equal<T> = Object.is,
): T {
  const since = useRef(createSince());
  const latest = useRef({ key, read, equal });
  const [value, setValue] = useState(() => read(Number.POSITIVE_INFINITY));

  useEffect(() => {
    latest.current = { key, read, equal };
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      since.current = stepSince(since.current, latest.current.key(), now);
      const next = latest.current.read(secondsSince(since.current, now));
      setValue((current) => (latest.current.equal(current, next) ? current : next));
    }, everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);

  return value;
}
