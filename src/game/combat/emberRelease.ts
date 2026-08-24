/**
 * 로봇에서 빠져나가는 빛 — 순수 시뮬레이션.
 *
 * 우리 로봇은 **이유 없이 서 있었다.** 도깨비도 있고 로봇도 있는데 둘을 잇는
 * 문장이 하나도 없었다 — 참고한 세계관에서 그 둘은 같은 이야기의 앞뒤다.
 *
 * 새 시스템을 만들지 않는다. 로봇 가슴에 **살아 있는 색의 점** 하나를 두고,
 * 쓰러질 때 그 점이 위로 떠올라 사라지게 한다. 그 한 장면이 「저 안에 무언가
 * 갇혀 있었다」를 말한다.
 *
 * 색종이(`Enemies.tsx`의 파티클)와 **움직임이 달라야 한다.** 색종이는 중력을
 * 받아 흩어지고, 이 빛은 곧게 떠오른다 — 둘이 같이 흩어지면 그냥 잔해가 된다.
 *
 * three.js를 모른다.
 */

export const EMBER = {
  /**
   * 동시에 떠오를 수 있는 수.
   *
   * 로봇 스물넷이 한꺼번에 눕는 일은 없다. 여덟이면 연속 처치에도 잘리지 않고,
   * 넘치면 가장 오래된 것부터 자리를 내준다.
   */
  poolSize: 8,
  /** 떠오르는 속도(m/s). 걸음보다 느려야 「빠져나간다」로 보인다 */
  riseSpeed: 1.6,
  /** 수명(초) */
  lifeSeconds: 1.4,
  /** 로봇 가슴 높이에서 나온다(m) */
  spawnHeight: 0.95,
} as const;

export interface Ember {
  x: number;
  y: number;
  z: number;
  /** 남은 수명(초). 0 이하면 꺼진 것이다 */
  life: number;
}

/** 꺼진 상태로 채운 풀. 매 처치마다 새로 만들지 않는다 */
export function createEmbers(): Ember[] {
  return Array.from({ length: EMBER.poolSize }, () => ({ x: 0, y: 0, z: 0, life: 0 }));
}

/** 이 빛이 아직 보이는가 */
export function emberAlive(ember: Ember): boolean {
  return ember.life > 0;
}

/**
 * 그 자리에서 빛 하나를 놓아 준다.
 *
 * **제자리에서 고친다.** 새 배열을 돌려주면 매 처치마다 배열이 하나 생기고,
 * 이 함수는 전투 한복판에서 불린다.
 *
 * 빈자리가 없으면 **가장 오래된 것**(수명이 가장 적게 남은 것)을 밀어낸다 —
 * 방금 눕힌 로봇의 빛이 안 나오는 편이 더 이상하다.
 */
export function releaseEmber(pool: Ember[], x: number, z: number): void {
  let target = pool[0];
  for (const ember of pool) {
    if (!emberAlive(ember)) {
      target = ember;
      break;
    }
    if (ember.life < target.life) target = ember;
  }

  target.x = x;
  target.y = EMBER.spawnHeight;
  target.z = z;
  target.life = EMBER.lifeSeconds;
}

/**
 * 한 프레임 진행한다.
 *
 * 곧게 위로만 간다. 흩어짐도 중력도 없다 — 색종이와 구분되는 유일한 신호가
 * 그 움직임이다.
 */
export function stepEmbers(pool: Ember[], dt: number): void {
  for (const ember of pool) {
    if (!emberAlive(ember)) continue;
    ember.life -= dt;
    ember.y += EMBER.riseSpeed * dt;
  }
}

/**
 * 남은 수명을 0~1로 편 값. 렌더가 밝기와 크기에 쓴다.
 *
 * 꺼진 빛은 0이라 그리는 쪽이 따로 판정할 필요가 없다.
 */
export function emberFade(ember: Ember): number {
  if (!emberAlive(ember)) return 0;
  return Math.min(1, ember.life / EMBER.lifeSeconds);
}
