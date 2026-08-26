/**
 * 동료가 때린다 — 순수 규칙.
 *
 * **동료는 지금까지 한 번도 안 때렸다.** 전투가 붙으면 나와서 곁을 돌고
 * 빛을 내고 능력을 걸었지만, 능력이 전부 빛·인지 반경·회복이라 **로봇의
 * 체력은 주인공만 깎았다.** 화면에서는 넷이 함께 싸우는 것처럼 보이는데
 * 실제로는 구경하고 있었다.
 *
 * 세계관과 어긋나지도 않는다 — 「물리치고 나면 친구가 된다」는 **함께 맞선다**는
 * 뜻이고, 원작 프레임에도 도깨비가 팔을 뻗어 내리치는 장면이 있다
 * (frame-notes 054 「항아리 도깨비가 흰 막대를 뻗어 내리치는 순간」).
 *
 * **주인공이 주인공이어야 한다.** 넷이 붙으면 로봇이 저절로 눕는 판이 되고,
 * 그러면 무기를 고르는 일도 예고를 피하는 일도 뜻이 없어진다. 그래서 셋을
 * 묶어 둔다: 피해는 절반(1, 로봇 체력은 2), 주기는 주인공의 두 배 가까이,
 * 사거리는 동료가 **곁에 두는 거리**만큼이다.
 *
 * three.js도 React도 모른다.
 */

export const COMPANION_STRIKE = {
  /**
   * 한 동료가 때리는 주기(초).
   *
   * 활이 0.86초에 한 발이다. 넷이 1.6초마다 치면 초당 2.5회로 주인공보다
   * 잦아진다 — 그래서 **1.6이 아니라 2.4**다. 넷이 다 있어도 초당 1.7회로,
   * 주인공(1.16회)보다 조금 많은 선에서 멈춘다.
   */
  intervalSeconds: 2.4,

  /**
   * 동료에게서 이 안에 있는 적을 친다(m).
   *
   * 동료는 주인공 곁을 도므로(`companionMotion`) 이 값이 곧 **주인공 둘레
   * 몇 미터까지 거드는가**다. 5m면 붙은 적을 떼는 데는 값을 하고, 멀리
   * 도망가는 것은 여전히 주인공 몫이다.
   */
  reachMeters: 5,

  /**
   * 한 대에 깎는 체력.
   *
   * 로봇 체력이 2다. 1이면 **혼자서는 못 눕힌다** — 둘이 붙거나 주인공이
   * 한 대를 보태야 눕는다. 2로 올리면 동료 하나가 로봇을 한 방에 정리해
   * 주인공이 구경하게 된다.
   */
  damage: 1,

  /**
   * 밀어내는 세기 배율. 주인공의 활(0.35)보다 약하다.
   *
   * 세게 두면 넷이 각자 다른 방향으로 밀어 **로봇이 주인공에게 안 온다** —
   * 싸움이 아니라 청소가 된다.
   */
  knockbackScale: 0.2,
} as const;

/**
 * 다음 타격까지 남은 시간을 한 프레임 줄인다.
 *
 * 동료가 사라져 있으면 **줄지 않는다.** 안 그러면 도시를 걷는 내내 시계가
 * 돌아, 전투가 붙는 순간 넷이 한꺼번에 때린다.
 */
export function stepStrikeCooldown(remaining: number, dt: number, present: boolean): number {
  if (!present) return COMPANION_STRIKE.intervalSeconds;
  return Math.max(0, remaining - dt);
}

/** 지금 칠 수 있는가 */
export function canStrike(remaining: number): boolean {
  return remaining <= 0;
}

/**
 * 동료 하나가 처음 부를 때 기다리는 시간(초).
 *
 * 자리 번호로 어긋나게 둔다. 0으로 두면 넷이 **같은 프레임에** 치고, 그
 * 뒤로도 계속 같은 박자로만 친다 — 넷이 아니라 하나가 네 배 세게 치는
 * 것으로 보인다. 보스전 소환이 같은 이유로 같은 일을 한다(`summonSim`).
 */
export function firstStrikeDelay(slot: number, party: number): number {
  const count = Math.max(1, party);
  return (COMPANION_STRIKE.intervalSeconds * ((slot % count) + 1)) / count;
}
