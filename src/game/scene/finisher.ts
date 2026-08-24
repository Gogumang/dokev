/**
 * 마무리 연출 — 대장을 눕히는 순간의 슬로우 모션과 얼굴 클로즈업.
 *
 * 지금까지 대장이 쓰러지는 것과 지나가던 로봇이 쓰러지는 것이 화면에서
 * 똑같았다. 체력 막대가 사라지고 잔해가 튀고 끝이다 — 30분을 들여 온 싸움의
 * 마지막 한 방과 골목에서 스친 로봇 한 기가 같은 무게로 보인다.
 *
 * 원작 트레일러가 이 자리에서 하는 두 가지를 가져온다: **시간을 늦추고,
 * 카메라를 아이 얼굴로 붙인다.** 둘 다 「무엇을 보여 줄지」가 아니라
 * 「무엇을 못 보게 할지」의 문제다 — 느려지면 눈이 한 곳에 머물고, 붙으면
 * 배경이 사라진다.
 *
 * three.js도 React도 모른다. 시간 배율과 카메라 좌표를 숫자로만 답한다.
 */

import { clamp, lerp } from "@/game/core/mathx";

export const FINISHER = {
  /**
   * 절정에서의 시간 배율.
   *
   * 0.22면 대략 1/4.5배다. 더 내리면(0.1) 멈춘 것처럼 보여 **끝난 줄 알고
   * 조작을 놓는다.** 더 올리면(0.5) 그냥 좀 굼뜬 화면이라 연출로 안 읽힌다.
   */
  slowScale: 0.22,
  /**
   * 느려지는 데 걸리는 시간(초, 실시간).
   *
   * 짧아야 한다 — 마지막 타격의 **그 순간**에 걸려야 인과가 보인다. 길면
   * 이미 쓰러진 뒤에 느려져 「왜 이제 와서」가 된다.
   */
  easeInSeconds: 0.1,
  /** 느려진 채로 얼굴을 보는 시간(초, 실시간) */
  holdSeconds: 1.2,
  /**
   * 돌아오는 시간(초, 실시간).
   *
   * 들어갈 때보다 길다. 갑자기 정상 속도로 튀어나오면 조작이 손보다 앞서
   * 나가 그대로 벽에 박는다.
   */
  easeOutSeconds: 0.65,
  /** 아이 얼굴 높이(m). 발밑 기준 */
  faceHeight: 1.34,
  /** 얼굴에서 카메라까지(m). 어깨가 화면 아래에 걸리는 거리다 */
  faceDistance: 1.5,
  /**
   * 정면에서 비낀 각(rad).
   *
   * 정면 정중앙은 증명사진이 된다. 조금 비껴야 코와 뺨에 면이 생기고
   * 얼굴로 읽힌다.
   */
  faceSideAngle: 0.62,
  /** 얼굴을 보는 눈높이 보정(m). 살짝 아래에서 올려다본다 */
  faceEyeDrop: 0.12,
  /**
   * 클로즈업 화각(도).
   *
   * 좁을수록 원근이 눌려 인물이 배경에서 떨어져 나온다. 달릴 때의 화각
   * (최대 86도)과 극단으로 갈리는 것이 이 연출의 절반이다.
   */
  fovNarrow: 32,
} as const;

/** 마무리 연출의 총 길이(초, 실시간) */
export const FINISHER_SECONDS =
  FINISHER.easeInSeconds + FINISHER.holdSeconds + FINISHER.easeOutSeconds;

export interface FinisherState {
  /**
   * 남은 시간(초, **실시간**). 0이면 꺼져 있다.
   *
   * 실시간으로 세는 것이 핵심이다. 느려진 시간으로 세면 자기가 늦춘 시간에
   * 자기가 갇혀 연출이 4.5배 길어진다.
   */
  remainingSeconds: number;
  /** 마지막으로 본 대장 처치 수. 늘어난 만큼만 발동한다 */
  seenBossDowns: number;
}

export function createFinisher(bossDowns = 0): FinisherState {
  return { remainingSeconds: 0, seenBossDowns: bossDowns };
}

/**
 * 연출을 한 프레임 진행한다.
 *
 * 발동 조건을 「지금 눕었는가」가 아니라 **누적 수의 증가**로 받는다. 순간
 * 신호는 프레임을 놓치면 사라지고, 놓쳤다는 사실조차 알 수 없다 — 이
 * 저장소에서 전투 신호를 누적 수로 바꾼 것과 같은 이유다.
 *
 * `reducedMotion`이면 아예 발동하지 않는다. 화면이 느려졌다 빨라지는 것은
 * 저감 모션 설정이 가장 먼저 끄고 싶어 하는 종류다.
 */
export function stepFinisher(
  state: FinisherState,
  bossDowns: number,
  dt: number,
  reducedMotion: boolean,
): FinisherState {
  const triggered = bossDowns > state.seenBossDowns;

  if (triggered && !reducedMotion) {
    return { remainingSeconds: FINISHER_SECONDS, seenBossDowns: bossDowns };
  }

  return {
    // 발동하지 않아도 본 것으로 친다 — 저감 모션을 껐을 때 밀린 연출이 터지면 안 된다
    seenBossDowns: bossDowns,
    remainingSeconds: Math.max(0, state.remainingSeconds - dt),
  };
}

/**
 * 지금 연출이 얼마나 걸려 있는가 (0~1).
 *
 * 빠르게 들어가 머물다 천천히 빠진다. 이 하나로 시간 배율·화각·카메라
 * 위치가 전부 정해진다 — 각자 다른 곡선을 쓰면 화면이 느려지는 시점과
 * 카메라가 붙는 시점이 어긋난다.
 */
export function finisherIntensity(state: FinisherState): number {
  if (state.remainingSeconds <= 0) return 0;

  const elapsed = FINISHER_SECONDS - state.remainingSeconds;
  if (elapsed < FINISHER.easeInSeconds) return clamp(elapsed / FINISHER.easeInSeconds, 0, 1);

  const heldFor = elapsed - FINISHER.easeInSeconds;
  if (heldFor < FINISHER.holdSeconds) return 1;

  return clamp(1 - (heldFor - FINISHER.holdSeconds) / FINISHER.easeOutSeconds, 0, 1);
}

/** 시뮬레이션에 곱할 시간 배율. 연출이 없으면 1 */
export function finisherTimeScale(state: FinisherState): number {
  return lerp(1, FINISHER.slowScale, finisherIntensity(state));
}

export interface FaceShot {
  /** 카메라가 설 자리 */
  x: number;
  y: number;
  z: number;
  /** 카메라가 볼 자리 — 얼굴 */
  lookX: number;
  lookY: number;
  lookZ: number;
}

/**
 * 얼굴을 보는 카메라 한 컷.
 *
 * 캐릭터 **앞쪽**에 선다. 뒤에서 당기면 여전히 뒤통수라, 「얼굴이 보인다」는
 * 요구가 뒤통수 확대로 끝난다.
 */
export function faceShot(
  playerX: number,
  playerY: number,
  playerZ: number,
  /** 캐릭터가 바라보는 방향(rad) */
  facing: number,
): FaceShot {
  const angle = facing + FINISHER.faceSideAngle;
  const eyeY = playerY + FINISHER.faceHeight;

  return {
    x: playerX + Math.sin(angle) * FINISHER.faceDistance,
    y: eyeY - FINISHER.faceEyeDrop,
    z: playerZ + Math.cos(angle) * FINISHER.faceDistance,
    lookX: playerX,
    lookY: eyeY,
    lookZ: playerZ,
  };
}
