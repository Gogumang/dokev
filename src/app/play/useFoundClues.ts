"use client";

/**
 * 찾은 흔적을 화면 쪽으로 옮겨 담는다.
 *
 * 씬은 리렌더를 일으키지 않아야 하므로 공유 배열에 제자리로 밀어 넣는다.
 * 지도는 **남은 자리만** 그려야 하니 개수가 아니라 목록이 필요하고, 목록은
 * 리렌더가 있어야 화면에 닿는다.
 *
 * 도깨비 만남을 옮겨 담는 방식과 같다 — 주기적으로 보고, 달라졌을 때만 담는다.
 */

import { useEffect, useRef, useState } from "react";

/** 확인 주기(ms). 사람이 흔적을 조사한 직후에 지도를 열어도 맞으면 충분하다 */
const POLL_MS = 300;

/**
 * 화면이 들 흔적 목록 — 바뀐 게 없으면 **같은 배열을 그대로** 돌려준다.
 *
 * 이 판단이 훅 안에 있을 때는 지워도 아무도 몰랐다. 매번 새 배열을 만들면
 * React가 「바뀌었다」로 읽어 **아무 일도 없는데 화면이 계속 다시 그려진다** —
 * 초당 세 번 도는 주기라 그만큼 낭비다.
 *
 * 길이만 비교한다 — 흔적은 늘기만 하고 줄지 않는다.
 *
 * 이름을 `next…`로 지었다가 **검사에 걸렸다.** 그 이름은 버튼으로 돌리는 것들의
 * 가족이고(도깨비·시간대·필터·자세), 이건 그게 아니다. 「바뀐 게 없으면 같은
 * 것을 준다」가 요점이라 `stable…`로 바꿨다.
 */
export function stableClueList(current: readonly string[], found: readonly string[]): string[] {
  if (current.length === found.length) return current as string[];
  return [...found];
}

/**
 * 아직 알리지 않은 흔적만 알리고, 새 「알린 개수」를 돌려준다.
 *
 * 훅에서 떼어 냈다 — 여기가 이 파일의 유일한 규칙인데 `setInterval` 안에
 * 묻혀 있어 검사할 수가 없었다. **이어받은 것은 알리지 않는다**가 핵심이다:
 * 예전에 찾은 것을 「지금 찾았다」로 세면 새로고침할 때마다 수가 부풀어 오른다.
 *
 * 두 번째 인자가 「어디까지 알렸는가」이고, 이어하는 판은 이어받은 개수에서
 * 시작한다.
 */
export function reportNewClues(
  found: readonly string[],
  reported: number,
  notify?: (id: string, total: number) => void,
): number {
  let seen = reported;
  while (seen < found.length) {
    const id = found[seen];
    seen += 1;
    notify?.(id, seen);
  }
  return seen;
}

export function useFoundClues(
  resumed: readonly string[] = [],
  /**
   * 흔적 하나를 새로 조사했을 때.
   *
   * 이어받은 것은 부르지 않는다 — 예전에 찾은 것을 「지금 찾았다」로 세면
   * 새로고침할 때마다 수가 부풀어 오른다.
   */
  onFound?: (id: string, total: number) => void,
): {
  clueView: { found: string[] };
  foundClues: string[];
} {
  /*
   * 이어받은 것으로 시작한다. 빈 목록으로 시작하면 지도에 이미 조사한 자리가
   * 다시 뜨고, 그 자리에 가도 아무 일이 없다.
   */
  const [clueView] = useState<{ found: string[] }>(() => ({ found: [...resumed] }));
  const [foundClues, setFoundClues] = useState<string[]>(() => [...resumed]);

  /*
   * 알림은 갱신 함수 밖에서 한다. 갱신 함수는 React가 렌더 도중에 실행하므로
   * 순수해야 한다 — 도깨비 만남에서 같은 실수를 이미 겪었다.
   */
  const reported = useRef(resumed.length);

  useEffect(() => {
    const id = window.setInterval(() => {
      reported.current = reportNewClues(clueView.found, reported.current, onFound);

      setFoundClues((current) => stableClueList(current, clueView.found));
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [clueView, onFound]);

  return { clueView, foundClues };
}
