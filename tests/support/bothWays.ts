/**
 * 「절반만 재기」를 막는다.
 *
 * 이 세션에 같은 실수를 여러 번 했다 — 불리언을 참으로만 재고, 미끄러짐을 한
 * 축만 재고, 소비 함수를 한 번만 부르고, 대사를 사라지는 쪽만 쟀다. 그때마다
 * **그 절반은 늘 통과**하므로 결함이 그대로 남았다.
 *
 * 「반대쪽도 재라」를 README에 적어 두고도 다시 어겼다. `staleCopy`와 같은
 * 방식으로 **기억이 아니라 도구로** 옮긴다: 입력 묶음을 주면 결과가 실제로
 * 갈리는지 알려 준다.
 */

/** 결과가 두 갈래 이상 나왔는가 — 한 갈래뿐이면 그 검사는 절반만 보고 있다 */
export function splits<T>(results: readonly T[]): boolean {
  return new Set(results).size > 1;
}

/**
 * 술어를 입력들에 돌려 **양쪽이 다 나오는지** 확인한다.
 *
 * @returns 참·거짓이 모두 나온 경우에만 true
 */
export function bothWays<T>(inputs: readonly T[], predicate: (input: T) => boolean): boolean {
  let sawTrue = false;
  let sawFalse = false;
  for (const input of inputs) {
    if (predicate(input)) sawTrue = true;
    else sawFalse = true;
    if (sawTrue && sawFalse) return true;
  }
  return false;
}

/**
 * 어느 입력이 어느 쪽으로 갔는지 — 실패 메시지에 넣으라고 만든 것.
 *
 * 「양쪽이 안 나온다」만 말하면 어느 쪽이 비었는지 몰라 고치기 어렵다.
 */
export function describeSplit<T>(inputs: readonly T[], predicate: (input: T) => boolean): string {
  const yes = inputs.filter((input) => predicate(input));
  const no = inputs.filter((input) => !predicate(input));
  return `참: ${JSON.stringify(yes)} / 거짓: ${JSON.stringify(no)}`;
}
