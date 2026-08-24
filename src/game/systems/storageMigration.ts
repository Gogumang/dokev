/**
 * 이름이 바뀐 저장 키를 옮긴다.
 *
 * 프로젝트 이름이 바뀌면 저장 키도 따라 바뀌는데, 키가 바뀌면 브라우저에 남아
 * 있던 **진행·설정·만난 도깨비가 통째로 사라진다.** 사용자에게는 「업데이트했더니
 * 처음부터」로 보이고, 이 저장소가 가장 조심해 온 사고다.
 *
 * 그래서 새 키를 읽기 전에 한 번 옮긴다. 규칙은 셋뿐이다:
 *
 * 1. **새 키가 이미 있으면 아무것도 안 한다.** 옛 키로 덮어쓰면 새로 쌓은
 *    진행이 사라진다 — 이사는 한 번만 뜻이 있다.
 * 2. **옛 키가 없으면 아무것도 안 한다.** 처음 켠 사람에게는 옮길 것이 없다.
 * 3. **옮긴 뒤 옛 키를 지운다.** 남겨 두면 다음 이사 때 어느 쪽이 최신인지
 *    알 수 없다. 지우기가 실패해도 새 키는 이미 살아 있으므로 넘어간다.
 *
 * 담긴 값은 **파싱하지 않고 문자열째 옮긴다.** 형식 검증은 읽는 쪽이 이미
 * 하고 있고, 여기서 한 번 더 하면 규칙이 두 곳에 생긴다.
 *
 * 저장 실패로 게임이 멈추면 안 되므로 전부 삼킨다(사생활 보호 모드에서는
 * `localStorage` 접근 자체가 던진다). 다만 **옮겼는지 여부는 돌려준다** —
 * 부르는 쪽이 알고 싶을 수 있고, 검사가 그것으로 확인한다.
 */

/**
 * @param fromKey 옛 키
 * @param toKey 새 키
 * @returns 이번 호출에서 실제로 옮겼으면 true
 */
export function migrateStorageKey(fromKey: string, toKey: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const storage = window.localStorage;
    // 새 키가 이미 있으면 그것이 최신이다
    if (storage.getItem(toKey) !== null) return false;

    const carried = storage.getItem(fromKey);
    if (carried === null) return false;

    storage.setItem(toKey, carried);
    try {
      storage.removeItem(fromKey);
    } catch {
      // 지우기만 실패한 경우 — 새 키는 이미 살아 있으니 그대로 둔다
    }
    return true;
  } catch {
    return false;
  }
}
