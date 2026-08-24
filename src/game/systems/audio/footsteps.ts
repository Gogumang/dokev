/**
 * 발소리·착지 판정.
 *
 * 소리를 내는 일(오실레이터·게인)은 `voices.ts`가 하고, **언제 낼지**를 여기서
 * 정한다. 판정이 오디오 루프 안에 있을 때는 값으로 잴 데가 없었다 — 걸음 리듬
 * 이월을 버려도, 보드를 타면서 발소리가 나게 해도, 점프 소리를 아예 꺼도
 * 아무 검사가 몰랐다.
 *
 * 소리는 사람 몫 확인 목록에 있는 항목이고(전투 네 신호 구분, 노이즈 「틱」),
 * 그 판단은 **판정이 맞다는 전제 위에서만** 뜻이 있다. 여기가 흔들리면
 * 사람이 들은 것이 무엇 때문인지 알 수 없다.
 */

import { GRAVITY } from "@/game/config/tuning";

/** 걷기와 달리기 중 무엇으로 소리를 낼지 */
export type StepGait = "walk" | "run";

/**
 * 한 걸음이 나가는 거리(m).
 *
 * 발소리 주기를 시간이 아니라 이동 거리로 잡는 이유: 가속·감속 중에도 발이 땅에
 * 닿는 시점과 소리가 어긋나지 않는다. 달리기 보폭이 걷기의 두 배쯤이다.
 */
export const STRIDE_METERS: Record<StepGait, number> = { walk: 0.78, run: 1.5 };

/** 이 속도 미만은 제자리 미끄러짐으로 보고 발소리를 내지 않는다 */
export const FOOTSTEP_MIN_SPEED = 0.5;

/** 이 낙하 속도 미만의 착지는 소리를 내지 않는다 (작은 턱까지 울리면 피로하다) */
export const LANDING_MIN_IMPACT = 2.5;

/** 착지 소리가 최대가 되는 낙하 속도 */
export const LANDING_MAX_IMPACT = 18;

/**
 * 체공 시간 → 착지 속도 환산 계수.
 *
 * RuntimeStats에는 수직 속도가 없고 grounded 플래그만 있다. 다행히 이 월드의
 * 지면은 평평해서 체공은 전부 점프다. 대칭 포물선에서 착지 속도는
 * GRAVITY * 체공시간 / 2와 정확히 같다. 나중에 높이 차가 있는 지형이 생기면
 * 낙하만 하는 경우를 과소평가하게 된다.
 *
 * 밖으로 내보내지 않는다 — 쓰는 쪽이 알아야 할 것은 `landingImpact`뿐이다.
 */
const AIRTIME_TO_IMPACT = GRAVITY * 0.5;

/** 지금 발소리를 낼 상황인가 */
export function walksOnFoot(isBoard: boolean, grounded: boolean, speed: number): boolean {
  // 보드는 구름 소리가 대신한다 — 둘이 겹치면 무엇을 타고 있는지 안 들린다
  if (isBoard) return false;
  // 공중에서는 발이 땅에 없다
  if (!grounded) return false;
  return speed > FOOTSTEP_MIN_SPEED;
}

export interface StrideStep {
  /** 다음 프레임으로 넘길 누적 거리(m) */
  distance: number;
  /** 이번 프레임에 발이 땅에 닿았는가 */
  stepped: boolean;
}

/**
 * 이동 거리를 누적해 한 걸음마다 신호를 낸다.
 *
 * **남은 거리를 버리지 않고 이월한다.** 0으로 밀면 속도가 바뀔 때마다 리듬이
 * 한 박씩 어긋나고, 특히 걷기↔달리기를 오갈 때 발소리가 발과 따로 논다.
 */
export function advanceStride(distance: number, moved: number, stride: number): StrideStep {
  const total = distance + moved;
  if (total < stride) return { distance: total, stepped: false };
  return { distance: total % stride, stepped: true };
}

/** 체공 시간으로 유추한 착지 속도 */
export function landingImpact(airtimeSeconds: number): number {
  return airtimeSeconds * AIRTIME_TO_IMPACT;
}

/** 소리를 낼 착지인가 — 작은 턱까지 울리면 피로하다 */
export function landingSounds(airtimeSeconds: number): boolean {
  return landingImpact(airtimeSeconds) >= LANDING_MIN_IMPACT;
}
