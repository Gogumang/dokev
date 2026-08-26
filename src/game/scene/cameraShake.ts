/**
 * 착지 흔들림 — 순수 규칙.
 *
 * `cameraRig`에서 뗐다. 저 파일이 상한(300줄)에 닿았고, 무엇보다 이 둘은
 * **한 쌍**이다 — 폭을 세는 쪽(`stepLandingShake`)과 그 폭을 화면 오프셋으로
 * 바꾸는 쪽(`shakeOffset`)이 갈라져 있으면, 한쪽만 고쳐 놓고 반대쪽이 옛
 * 단위를 쓰는 일이 생긴다. 실제로 오프셋 쪽이 ms 기준 벽시계를 보고 있었다.
 *
 * three.js를 모른다.
 */

import { inverseLerpClamped } from "@/game/core/mathx";

/**
 * 착지 흔들림을 한 프레임 진행한다.
 *
 * `PlayerRig`의 프레임 루프 안에 손으로 적혀 있던 계산이다. 카메라를 흔드는
 * 일이므로 여기가 제 자리이고, 무엇보다 **저기 있을 때는 잴 수가 없었다** —
 * 「세게 떨어질수록 크게 흔들린다」와 「가만히 두면 멎는다」가 화면을 봐야만
 * 확인되는 규칙이었다.
 *
 * 저감 모션이면 새 흔들림을 받지 않는다. 다만 **이미 흔들리던 것은 감쇠시킨다** —
 * 도중에 설정을 켜면 흔들린 채로 굳는다.
 */
export function stepLandingShake(
  current: number,
  /** 이번 프레임의 착지 충돌 속도(m/s). 착지하지 않았으면 0 */
  impact: number,
  dt: number,
  reducedMotion: boolean,
  tuning: {
    minImpactSpeed: number;
    maxImpactSpeed: number;
    maxAmplitude: number;
    decayPerSecond: number;
  },
): number {
  let next = current;

  if (impact > tuning.minImpactSpeed && !reducedMotion) {
    const strength = inverseLerpClamped(tuning.minImpactSpeed, tuning.maxImpactSpeed, impact);
    next = Math.max(next, strength * tuning.maxAmplitude);
  }

  // 비율 감쇠라 0에 점근한다. 음수로 내려가지 않게 바닥을 둔다
  return Math.max(0, next - tuning.decayPerSecond * next * dt);
}

/**
 * 착지 흔들림의 이번 프레임 오프셋(m).
 *
 * 흐른 시간을 **넘겨받는다.** 예전에는 `performance.now()`를 직접 봐서, 화면은
 * 똑같아 보여도 같은 판을 두 번 돌리면 흔들림이 달랐다 — 시연 영상을 프레임
 * 단위로 뽑을 때 그 한 줄이 재생을 결정적이지 않게 만든다.
 *
 * 아주 작으면 0이다. 잔값이 남으면 멎은 뒤에도 1픽셀씩 떤다.
 */
export function shakeOffset(elapsed: number, amplitude: number): number {
  if (amplitude <= 0.0005) return 0;
  // 60rad/s — 예전 `performance.now() * 0.06`(ms 기준)을 초로 옮긴 값이다
  return Math.sin(elapsed * 60) * amplitude;
}
