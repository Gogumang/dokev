/**
 * 동료 도깨비 몸 치수.
 *
 * `Companion.tsx`에 숫자로 박혀 있던 것을 옮긴다 — 플레이어(`PLAYER_BODY`)와
 * 보행자(`PED_BODY`)에서 같은 구멍을 이미 두 번 만났다. 이름이 없으면
 * **검사할 대상 자체가 없어서**, 값이 조용히 망가져도 화면을 봐야만 안다.
 *
 * 값은 옮기기만 했다.
 */

export const COMPANION_BODY = {
  /** 몸통 구 반지름 */
  bodyRadius: 0.34,
  /** 둘레를 도는 고리. 몸 밖에 있어야 고리로 보인다 */
  ringRadius: 0.52,
  ringThickness: 0.045,
  eyeRadius: 0.062,
  /** 머리 위 불꽃 */
  flameRadius: 0.14,
  flameHeight: 0.42,
  /** 불꽃 아래 받침 */
  capTopRadius: 0.1,
  capBottomRadius: 0.16,
  capHeight: 0.14,
} as const;
