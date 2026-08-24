/**
 * 동료가 언제 나타나는가 — 순수 규칙.
 *
 * **평소에는 없다. 전투에만 나온다.**
 *
 * 전에는 `summoned: true`로 못 박아 두어 동료가 도시를 내내 따라다녔다. 원작
 * 공개분의 프레임을 보면 그렇지 않다 — 탐험 컷(해안 채집, 골목 광장)에는 아이
 * 혼자이거나 사람들만 있고, 동료는 **전투 장면에서만** 함께 서 있다
 * (`docs/frame-notes/` notes-a 024, notes-b 027·030·033·034).
 *
 * 여기서는 「나올까 말까」만 정한다. 나타나고 사라지는 **모양**은
 * `companionMotion`의 presence 페이드가 이미 갖고 있다 — 두 곳에서 각자
 * 판단하면 어긋난다.
 *
 * three.js도 React도 모른다.
 */

export const SUMMON = {
  /**
   * 이 압력 위로 오르면 나온다.
   *
   * `combatPressure`는 가장 가까운 적까지의 거리를 0~1로 편 값이다(반경 14m).
   * 0.25면 대략 **10m 안**에 적이 들어왔을 때다 — 눈에 보이기 시작하는 거리이고,
   * 더 낮추면 길 건너 로봇 때문에 동료가 나온다.
   */
  appearAt: 0.25,

  /**
   * 이 아래로 **떨어져야** 사라진다.
   *
   * 나오는 문턱과 사라지는 문턱을 다르게 둔다(히스테리시스). 하나로 두면 적이
   * 경계에서 한 걸음 들락날락할 때마다 동료가 깜빡인다 — 전투 중에 가장 눈에
   * 거슬리는 종류의 결함이다.
   */
  stayUntil: 0.08,

  /**
   * 압력이 사라진 뒤에도 남아 있는 시간(초).
   *
   * 마지막 로봇이 쓰러지는 **그 순간** 동료가 사라지면 이긴 장면이 아니라
   * 버그로 보인다. 1.6초면 색종이가 흩어지는 동안 함께 서 있다가 물러난다.
   */
  lingerSeconds: 1.6,
} as const;

/**
 * 지금 전투가 동료를 부를 만한가.
 *
 * 이전 상태를 함께 받는 이유가 히스테리시스다 — 같은 압력이라도 **나오던 중인지
 * 없던 중인지**에 따라 답이 다르다.
 */
export function wantsSummon(pressure: number, wasSummoned: boolean): boolean {
  return wasSummoned ? pressure > SUMMON.stayUntil : pressure >= SUMMON.appearAt;
}

/**
 * 남은 여운(초).
 *
 * 부를 만한 동안에는 가득 채워 두고, 그렇지 않으면 줄인다. 값을 돌려주므로
 * 부르는 쪽이 들고 있는다 — 이 파일은 상태를 갖지 않는다.
 */
export function stepLinger(remaining: number, wanted: boolean, dt: number): number {
  if (wanted) return SUMMON.lingerSeconds;
  return Math.max(0, remaining - dt);
}

/**
 * 이번 프레임에 동료가 화면에 있어야 하는가.
 *
 * 여운이 남아 있으면 압력이 0이어도 있는다.
 */
export function isSummoned(wanted: boolean, linger: number): boolean {
  return wanted || linger > 0;
}
