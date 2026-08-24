/**
 * 「검사가 그 함수의 **모든 칸**을 보고 있는가」를 센다.
 *
 * 비교 방향 훑기에서 나온 결함 셋이 전부 같은 모양이었다 — **값은 재고 있었는데
 * 그 옆 칸을 안 봤다**: 체력은 봤지만 쓰러짐은, 휘청은 봤지만 몇 대 만인지는,
 * 이동은 봤지만 바라보는 방향은. 한 칸만 읽는 검사는 나머지 칸이 무엇으로
 * 바뀌든 통과한다.
 *
 * `bothWays`(한쪽만 재기)와 `staleCopy`(초기값이 기대값과 같기)로는 안 잡힌다.
 * 그래서 **실행 중에** 읽힌 칸을 센다 — 프록시로 감싸 `get`을 기록한다.
 *
 * 소스를 읽어 `result.<칸>` 참조를 세는 길은 버렸다. 이 세션에 소스 모양 검사가
 * 이사 때문에 다섯 번 깨졌고, 검사 파일이라고 다를 이유가 없다.
 *
 * **쓰기는 안 센다.** 채우는 함수가 프록시에 값을 써도 「읽었다」로 잡히지 않아,
 * `project…` 계열을 그대로 감싸도 거짓 양성이 안 난다.
 *
 * 한계: `toEqual(객체 전부)`로 비교하면 모든 칸이 읽힌 것으로 잡힌다. 그건
 * **맞는 셈이다**(정말로 전부 비교하니까) — 이 도구는 칸을 하나씩 보는 검사에만
 * 뜻이 있다.
 */

export interface ReadWatch<T extends object> {
  /** 검사에 넘길 대역 — 읽으면 기록된다 */
  watched: T;
  /** 지금까지 읽힌 칸 이름들 */
  readFields(): string[];
  /** 아직 아무도 안 읽은 칸 이름들 */
  unreadFields(): string[];
}

/**
 * 객체를 감싸 읽힌 칸을 기록한다.
 *
 * @param target 감쌀 객체. 원본은 그대로 두고 대역을 통해서만 기록한다.
 */
export function watchReads<T extends object>(target: T): ReadWatch<T> {
  const seen = new Set<string>();
  const watched = new Proxy(target, {
    get(object, key, receiver) {
      // 심볼은 세지 않는다 — 검사 도구가 내부적으로 들여다보는 것들이다
      if (typeof key === "string") seen.add(key);
      return Reflect.get(object, key, receiver);
    },
  });

  return {
    watched,
    readFields: () => [...seen],
    unreadFields: () => Object.keys(target).filter((key) => !seen.has(key)),
  };
}
