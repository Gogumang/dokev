/**
 * 휘두른 자국 — 순수 계산.
 *
 * 트레일러 프레임에서 참격은 **불꽃이 아니라 넓적한 붓자국**이다. 우리 타격은
 * 색종이가 튀는 것뿐이라 맞은 자리는 보이는데 **무엇이 지나갔는지**가 화면에
 * 남지 않았다 — 휘두르는 동작(`attackPose`)은 팔만 움직이고, 그 팔이 그린 길은
 * 어디에도 그려지지 않았다.
 *
 * 자국은 **판정과 같은 규칙**을 쓴다. 눈에 보이는 궤적이 실제 부채꼴보다 넓으면
 * 「분명 닿았는데 안 맞았다」가 생긴다. 그래서 폭도 각도도 무기의 부채꼴
 * (`weapon.halfAngle`) 안에서만 정한다.
 *
 * three.js를 모른다 — 각도와 진하기만 돌려주고, 그리는 일은 렌더가 맡는다.
 */

import { swingSeconds, type Weapon } from "@/game/combat/weapons";

/**
 * 자국의 각 폭이 부채꼴에서 차지하는 비율.
 *
 * 0.35다. 더 넓으면 자국이 부채꼴을 거의 다 덮어 **쓸고 지나간 것이 아니라
 * 켜졌다 꺼지는 판**으로 보이고, 더 좁으면 실 한 가닥이 되어 「붓자국」이라는
 * 인상이 사라진다.
 */
const WIDTH_RATIO = 0.35;

/**
 * 이 무기가 남기는 자국의 각 반폭(rad).
 *
 * 링 지오메트리를 만드는 쪽(렌더)과 매 프레임 각도를 정하는 쪽(아래)이 **같은
 * 값을 봐야 한다.** 두 곳에서 각자 곱하면 그리는 폭과 도는 범위가 어긋나 자국
 * 끝이 부채꼴 밖으로 나간다.
 */
export function trailHalfWidth(weapon: Weapon): number {
  return weapon.halfAngle * WIDTH_RATIO;
}

export interface SwingTrailView {
  /** 0이면 그리지 않는다 */
  opacity: number;
  /** 자국 한가운데의 각도(rad). 정면이 0이고, 휘두르는 동안 음수에서 양수로 간다 */
  centerAngle: number;
  /** 자국의 각 반폭(rad) */
  halfWidth: number;
}

/** 아무것도 그리지 않는 상태 */
const IDLE: SwingTrailView = { opacity: 0, centerAngle: 0, halfWidth: 0 };

/**
 * 지금 자국을 어디에 얼마나 진하게 그릴지.
 *
 * 단계별로 하는 일이 다르다:
 *
 * - **준비** — 아직 없다. 들어 올리는 중에 자국이 남으면 휘두르기 전에 이미
 *   지나간 것처럼 보인다.
 * - **판정** — 한쪽 끝에서 반대쪽 끝으로 **쓸어 간다.** 이 구간이 가장 진하다.
 * - **후딜** — 마지막 자리에 남은 채 잦아든다. 즉시 지우면 타격이 끊겨 보인다.
 *
 * 원거리 무기는 자국이 없다. 탄이 이미 눈에 보이고, 거기에 부채꼴까지 그리면
 * **쏘지도 않은 근접 판정이 있는 것처럼** 읽힌다.
 */
export function swingTrail(elapsedSeconds: number | null, weapon: Weapon): SwingTrailView {
  if (elapsedSeconds === null || weapon.bolt !== null) return { ...IDLE };

  const { windupSeconds, activeSeconds, recoverySeconds } = weapon.timing;
  const total = swingSeconds(weapon);
  if (elapsedSeconds < windupSeconds || elapsedSeconds > total) return { ...IDLE };

  const halfWidth = trailHalfWidth(weapon);
  // 자국의 바깥 끝이 부채꼴을 넘지 않도록 한가운데가 갈 수 있는 범위를 좁힌다
  const limit = weapon.halfAngle - halfWidth;

  const activeEnd = windupSeconds + activeSeconds;
  if (elapsedSeconds <= activeEnd) {
    const progress = activeSeconds <= 0 ? 1 : (elapsedSeconds - windupSeconds) / activeSeconds;
    return { opacity: 1, centerAngle: -limit + progress * 2 * limit, halfWidth };
  }

  const fading = recoverySeconds <= 0 ? 1 : (elapsedSeconds - activeEnd) / recoverySeconds;
  return { opacity: Math.max(0, 1 - fading), centerAngle: limit, halfWidth };
}
