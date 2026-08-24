/**
 * 「낡은 화면」 만들기.
 *
 * 화면 칸을 채우는 함수를 검사할 때 **초기값이 기대값과 같으면 안 채워도
 * 통과한다.** 이 세션에 세 번 걸렸다 — `counter`·`completed`(빈 문자열과
 * false가 기대값과 같았다), `bossDefeated`(참으로만 재서 절반이 늘 통과).
 *
 * 「초기값을 다르게 두라」를 README에 적어 두고도 다시 어겼다. 그래서 규칙을
 * **기억이 아니라 도구로** 옮긴다: 원본을 주면 **모든 칸이 다른** 객체를 만든다.
 *
 * 불리언은 뒤집고, 숫자는 부호를 바꿔 1을 빼고, 문자열은 표식을 붙인다.
 * 참조로 다루는 것(버퍼·중첩 객체)은 그대로 둔다 — 그건 「같은 객체를 쓰는가」로
 * 따로 재야 하고, 여기서 바꾸면 그 검사가 못 쓰게 된다.
 */

/** 원본과 모든 원시 칸이 다른 복사본 */
export function staleCopy<T extends object>(source: T): T {
  const copy = { ...source } as Record<string, unknown>;
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "boolean") copy[key] = !value;
    else if (typeof value === "number") copy[key] = -value - 1;
    else if (typeof value === "string") copy[key] = `낡음:${value}`;
    // 그 밖(객체·배열·null)은 그대로 — 참조 동일성 검사를 망치지 않는다
  }
  return copy as T;
}

/**
 * 모든 칸이 실제로 달라졌는지 확인한다.
 *
 * `staleCopy`가 다루지 못하는 타입이 늘면 **조용히 같은 값이 섞인다** — 그러면
 * 검사가 다시 눈이 먼다. 쓰는 쪽에서 이걸 한 번 부르면 그 순간 드러난다.
 *
 * @returns 원본과 값이 같은 칸의 이름들. 비어 있어야 정상이다.
 */
export function sameFields<T extends object>(stale: T, source: T): string[] {
  const same: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
      continue;
    }
    if ((stale as Record<string, unknown>)[key] === value) same.push(key);
  }
  return same;
}
