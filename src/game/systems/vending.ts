/**
 * 자판기 — 도시의 놀이 활동 하나.
 *
 * TRAILER_FEATURE_ANALYSIS 「6.1 MVP 필수 후보」가 "도시 놀이 활동 한 가지"를
 * 요구한다. 그동안 이 칸만 비어 있었다 — 그래플과 활강은 이동이지 놀이가 아니다.
 *
 * 새 오브젝트를 만들지 않고 **이미 서 있는 자판기**를 쓴다. 도시에 있는 것을
 * 만질 수 있게 되는 편이, 상호작용을 위해 새 물체를 세우는 것보다 낫다.
 *
 * three.js에 의존하지 않는다.
 */

export const VENDING = {
  /** 이 거리 안에서 뽑을 수 있다(m) */
  reachMeters: 2.6,
  /** 음료 효과가 이어지는 시간(초) */
  boostSeconds: 8,
  /**
   * 효과 중 이동 속도 배율.
   *
   * 1.25는 달리기(7.4)를 9.25로 올린다 — 눈에 띄되 보드(15.5)를 위협하지
   * 않는 폭이다. 이동 수단의 서열이 뒤집히면 보드를 탈 이유가 사라진다.
   */
  boostScale: 1.25,
  /** 같은 자판기를 다시 쓰기까지(초). 연타로 효과를 무한히 잇지 못하게 한다 */
  cooldownSeconds: 20,
} as const;

export interface VendingState {
  /** 남은 효과 시간(초) */
  boostRemaining: number;
  /** 자판기별 남은 대기 시간(초). 인덱스가 곧 자판기 번호다 */
  cooldowns: Map<number, number>;
  /** 지금까지 뽑은 수 */
  drinks: number;
}

export function createVendingState(): VendingState {
  return { boostRemaining: 0, cooldowns: new Map(), drinks: 0 };
}

export interface Machine {
  x: number;
  z: number;
}

/**
 * 지금 손이 닿는 자판기의 번호. 없으면 -1.
 *
 * 가장 가까운 하나만 돌려준다 — 두 대가 나란히 서 있어도 어느 것을 뽑는지
 * 모호하면 안 된다.
 */
export function machineInReach(
  machines: readonly Machine[],
  x: number,
  z: number,
  state: VendingState,
): number {
  let best = -1;
  let bestDistance: number = VENDING.reachMeters;

  for (let i = 0; i < machines.length; i += 1) {
    // 대기 중인 자판기는 없는 것처럼 다룬다. 안내가 떴는데 안 되면 고장으로 보인다.
    if ((state.cooldowns.get(i) ?? 0) > 0) continue;
    const distance = Math.hypot(machines[i].x - x, machines[i].z - z);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** 시간을 흘려보낸다. 효과와 대기가 함께 줄어든다 */
export function stepVending(state: VendingState, dt: number): VendingState {
  const cooldowns = new Map<number, number>();
  for (const [index, remaining] of state.cooldowns) {
    const next = remaining - dt;
    if (next > 0) cooldowns.set(index, next);
  }
  return {
    boostRemaining: Math.max(0, state.boostRemaining - dt),
    cooldowns,
    drinks: state.drinks,
  };
}

/**
 * 음료를 뽑는다. 손이 닿지 않으면 상태가 그대로다.
 *
 * 효과 시간을 더하지 않고 **덮어쓴다** — 자판기를 여러 대 돌며 효과를 쌓으면
 * 도시 절반을 부스트로 가로지르게 된다.
 */
export function drink(state: VendingState, machineIndex: number): VendingState {
  if (machineIndex < 0) return state;

  const cooldowns = new Map(state.cooldowns);
  cooldowns.set(machineIndex, VENDING.cooldownSeconds);
  return {
    boostRemaining: VENDING.boostSeconds,
    cooldowns,
    drinks: state.drinks + 1,
  };
}

/** 지금 적용할 이동 속도 배율 */
export function speedScale(state: VendingState): number {
  return state.boostRemaining > 0 ? VENDING.boostScale : 1;
}
