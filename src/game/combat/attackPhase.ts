/**
 * 공격 3단계 — 순수 상태 진행.
 *
 * 플레이어와 적이 같은 구조(준비→판정→후딜)를 쓰지만 길이가 다르고, 플레이어
 * 쪽만 "이번 휘두르기에서 맞은 적 목록"을 함께 든다. 단계 진행만 여기 떼어
 * 두면 한쪽 길이를 바꿀 때 다른 쪽이 조용히 남는 일이 없다.
 *
 * `combatSim`에서 분리한 이유는 하나 더 있다 — 그 파일이 800줄 상한에 닿았다.
 */

/** 공격 단계. 판정은 `active`에서만 살아 있다 */
export type AttackPhase = "ready" | "windup" | "active" | "recovery";

/** 공격 3단계의 길이. 플레이어와 적이 서로 다른 값을 쓴다 */
export interface AttackTiming {
  windupSeconds: number;
  activeSeconds: number;
  recoverySeconds: number;
}

/**
 * 공격 단계를 한 프레임 진행한다 — 누가 휘두르는지는 모른다.
 *
 * 플레이어와 적이 같은 3단계(준비→판정→후딜)를 쓰지만 길이가 다르고,
 * 플레이어 쪽만 "이번 휘두르기에서 맞은 적 목록"을 함께 든다. 그래서 단계
 * 진행만 여기로 떼어 둔다 — 적 쪽에 같은 식을 복제하면 한쪽 길이를 바꿀 때
 * 다른 쪽이 조용히 남는다.
 */
export function advanceAttackPhase(
  phase: AttackPhase,
  timer: number,
  requested: boolean,
  dt: number,
  timing: AttackTiming,
): { phase: AttackPhase; timer: number } {
  if (phase === "ready") {
    if (!requested) return { phase, timer: 0 };
    return { phase: "windup", timer: timing.windupSeconds };
  }

  const remaining = timer - dt;
  if (remaining > 0) return { phase, timer: remaining };

  // 남은 시간이 음수면 그만큼 다음 단계에서 차감해 프레임률에 흔들리지 않게 한다.
  const overflow = -remaining;
  if (phase === "windup") return { phase: "active", timer: timing.activeSeconds - overflow };
  if (phase === "active") return { phase: "recovery", timer: timing.recoverySeconds - overflow };
  return { phase: "ready", timer: 0 };
}

