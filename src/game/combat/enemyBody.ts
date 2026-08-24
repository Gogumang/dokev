/**
 * 고물 로봇 몸 치수.
 *
 * `Enemies.tsx`에 숫자로 박혀 있던 것을 옮긴다 — 플레이어·보행자·동료에서
 * 같은 구멍을 세 번 만났다. 이름이 없으면 검사할 대상 자체가 없어서, 값이
 * 조용히 망가져도 화면을 봐야만 안다.
 *
 * 값은 옮기기만 했다.
 */

export const ENEMY_BODY = {
  /** 몸통 상자 (가로·높이·앞뒤) */
  bodyWidth: 0.62,
  bodyHeight: 0.7,
  bodyDepth: 0.5,
  headWidth: 0.44,
  headHeight: 0.38,
  headDepth: 0.42,
  armWidth: 0.16,
  armHeight: 0.5,
  armDepth: 0.16,
  /** 쓰러질 때 흩어지는 색종이 한 조각 */
  confettiSize: 0.12,
  /**
   * 사수가 쏘는 탄.
   *
   * 8면체를 쓴다 — 구보다 훨씬 싸고 이 크기에서는 구분되지 않는다.
   */
  boltRadius: 0.22,
  /**
   * 가슴에 박힌 점.
   *
   * 이 로봇이 **왜 있는지**를 말하는 유일한 조형이다 — 안에 무언가 갇혀 있고,
   * 쓰러지면 그것이 빠져나간다(`emberRelease.ts`). 작아야 한다: 크면 로봇이
   * 아니라 등불로 보인다.
   */
  coreRadius: 0.11,
} as const;
