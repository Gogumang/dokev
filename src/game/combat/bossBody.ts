/**
 * 고물 대장 몸 치수.
 *
 * `Boss.tsx`에 숫자로 박혀 있던 것을 옮긴다 — 플레이어·보행자·동료·적에서
 * 같은 구멍을 네 번 만났다. 이름이 없으면 검사할 대상 자체가 없다.
 *
 * 예고 링은 여기 두지 않는다. 그 크기는 **충격이 닿는 반경**(`BOSS.slamRadius`)
 * 이어야 하고, 그림과 판정이 갈라지면 「링 밖인데 맞았다」가 된다.
 *
 * 값은 옮기기만 했다.
 */

export const BOSS_BODY = {
  bodyWidth: 1.7,
  bodyHeight: 1.9,
  bodyDepth: 1.4,
  headWidth: 1.1,
  headHeight: 0.9,
  headDepth: 1.0,
  armWidth: 0.42,
  armHeight: 1.5,
  armDepth: 0.42,
} as const;
