/**
 * 캐릭터 자세 계산 — 순수 함수.
 *
 * 애니메이션 클립(GLB) 없이 코드로 자세를 만든다. 그래서 "어떤 상태에서 어떤
 * 자세를 취하는가"가 곧 캐릭터의 성격이 되고, 이 파일이 그 규칙 전부다.
 *
 * three.js와 React에 의존하지 않는다 — 렌더러 없이 테스트할 수 있어야 한다.
 */

import { LOCOMOTION } from "@/game/config/tuning";
import { clamp, damp } from "@/game/core/mathx";

export type CharacterAnimation = "idle" | "walk" | "run" | "board" | "air" | "glide";

export const POSE_TUNING = {
  /** 걸음 한 주기가 도는 데 필요한 이동 거리(m). 이 값으로 발 미끄러짐이 결정된다 */
  strideLength: 1.9,
  /** 이 속도 미만은 정지로 본다 */
  idleSpeed: 0.35,
  /** 이 속도 이상이면 달리기 자세 */
  runSpeed: 4.2,
  /** 팔다리 최대 스윙 각(rad) */
  maxSwing: 0.95,
  /** 달릴 때 상체가 앞으로 기우는 최대 각(rad) */
  maxLean: 0.3,
  /** 보드 탑승 시 상체 기울기 */
  boardLean: 0.42,
  /** 걸음마다 몸이 오르내리는 최대 높이(m) */
  maxBobHeight: 0.075,
  /** 착지 스쿼시가 최대가 되는 충돌 속도(m/s) */
  landReferenceSpeed: 16,
  /** 최대 스쿼시 비율. 0.28이면 키가 28%까지 줄어든다 */
  maxSquash: 0.28,
  /** 스쿼시가 풀리는 속도 */
  squashRecoverLambda: 9,
  /** 정지 중 숨쉬기 주기(초) */
  breathPeriod: 3.6,
  breathAmplitude: 0.018,
  /** 자세가 바뀔 때 부드럽게 넘어가는 속도 */
  blendLambda: 11,
} as const;

export interface PoseState {
  /** 걸음 위상(rad). 시간이 아니라 이동 거리에 비례해 진행한다 */
  phase: number;
  animation: CharacterAnimation;
  /** 0~1. 1이면 최대로 웅크린 상태 */
  squash: number;
  /** 상체 기울기(rad). 목표값으로 부드럽게 수렴한다 */
  lean: number;
  /** 팔다리 스윙 진폭(0~1). 걷다 멈출 때 뚝 끊기지 않게 보간한다 */
  swingAmount: number;
  /** 숨쉬기 위상 */
  breathPhase: number;
}

export interface PoseInput {
  /** 수평 속도(m/s) */
  speed: number;
  grounded: boolean;
  onBoard: boolean;
  /** 활강 중인지. 공중 자세보다 우선한다 */
  gliding: boolean;
  /** 이번 프레임 착지 충돌 속도(m/s). 착지하지 않았으면 0 */
  landingImpact: number;
}

export function createPoseState(): PoseState {
  return {
    phase: 0,
    animation: "idle",
    squash: 0,
    lean: 0,
    swingAmount: 0,
    breathPhase: 0,
  };
}

/**
 * 현재 상태에 맞는 애니메이션을 고른다.
 *
 * 순서가 중요하다 — 공중에 떠 있으면 속도와 무관하게 공중 자세여야 하고,
 * 보드는 지상에서만 의미가 있다.
 */
export function resolveAnimation(input: PoseInput): CharacterAnimation {
  // 활강이 일반 공중 자세보다 앞선다 — 팔을 벌린 자세라야 떠 있는 이유가 읽힌다.
  if (!input.grounded && input.gliding) return "glide";
  if (!input.grounded) return "air";
  if (input.onBoard) return "board";
  if (input.speed >= POSE_TUNING.runSpeed) return "run";
  if (input.speed > POSE_TUNING.idleSpeed) return "walk";
  return "idle";
}

/** 애니메이션별 목표 상체 기울기. */
function targetLean(animation: CharacterAnimation, speed: number): number {
  if (animation === "board") return POSE_TUNING.boardLean;
  if (animation === "glide") return 0.34;
  if (animation === "air") return 0.1;
  // 달리기 최고 속도에 가까울수록 더 기운다.
  const ratio = clamp(speed / LOCOMOTION.run.maxSpeed, 0, 1);
  return POSE_TUNING.maxLean * ratio;
}

/** 애니메이션별 목표 스윙 진폭. */
function targetSwing(animation: CharacterAnimation, speed: number): number {
  if (animation === "idle") return 0;
  if (animation === "board") return 0.18;
  if (animation === "air" || animation === "glide") return 0;
  // 걷기와 달리기가 같은 폭으로 흔들리면 속도 차이가 몸으로 읽히지 않는다.
  return clamp(speed / LOCOMOTION.run.maxSpeed, 0.25, 1);
}

/**
 * 한 프레임의 자세를 갱신한다.
 *
 * 입력 상태를 바꾸지 않고 새 상태를 돌려준다 (coding-style: 불변성).
 */
export function stepPose(state: PoseState, input: PoseInput, dt: number): PoseState {
  const animation = resolveAnimation(input);

  // 위상은 이동 거리에 비례해 진행한다. 시간에 비례시키면 느리게 걸을 때
  // 발이 지면 위를 미끄러진다.
  const phase = state.phase + (input.speed / POSE_TUNING.strideLength) * dt * Math.PI * 2;

  // 착지 충격은 즉시 반영하고 천천히 푼다. 반대로 하면 착지가 물렁해 보인다.
  const impact = clamp(input.landingImpact / POSE_TUNING.landReferenceSpeed, 0, 1);
  const squashFromImpact = impact * POSE_TUNING.maxSquash;
  const decayed = damp(state.squash, 0, POSE_TUNING.squashRecoverLambda, dt);
  const squash = Math.max(decayed, squashFromImpact);

  return {
    phase,
    animation,
    squash,
    lean: damp(state.lean, targetLean(animation, input.speed), POSE_TUNING.blendLambda, dt),
    swingAmount: damp(
      state.swingAmount,
      targetSwing(animation, input.speed),
      POSE_TUNING.blendLambda,
      dt,
    ),
    breathPhase: state.breathPhase + (dt / POSE_TUNING.breathPeriod) * Math.PI * 2,
  };
}

export interface LimbPose {
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

/**
 * 팔다리 회전각을 구한다.
 *
 * 팔과 다리는 서로 반대로 흔들리고, 왼쪽과 오른쪽도 반대다. 이 교차가
 * 사람 걸음의 핵심이라 여기서 위상을 어긋나게 둔다.
 */
export function limbPose(state: PoseState): LimbPose {
  if (state.animation === "glide") {
    // 활강 — 팔을 옆으로 크게 벌리고 다리를 모은다. 실루엣이 넓어야 떠 보인다.
    return { leftArm: -2.5, rightArm: -2.5, leftLeg: 0.12, rightLeg: -0.12 };
  }

  if (state.animation === "air") {
    // 공중에서는 팔을 들고 다리를 접는다. 위상과 무관한 고정 자세다.
    return { leftArm: -1.5, rightArm: -1.2, leftLeg: 0.5, rightLeg: -0.3 };
  }

  if (state.animation === "board") {
    // 보드 위에서는 다리를 벌려 고정하고 팔로만 균형을 잡는다.
    const sway = Math.sin(state.phase) * state.swingAmount;
    return { leftArm: sway, rightArm: -sway, leftLeg: -0.15, rightLeg: 0.2 };
  }

  const swing = Math.sin(state.phase) * state.swingAmount * POSE_TUNING.maxSwing;
  return {
    leftArm: swing,
    rightArm: -swing,
    // 다리는 팔과 반대 위상 — 왼팔이 앞이면 왼다리는 뒤다.
    leftLeg: -swing,
    rightLeg: swing,
  };
}

/**
 * 몸통의 수직 오프셋(m).
 *
 * 걸을 때는 걸음마다 오르내리고, 멈춰 있을 때는 숨쉬기로 아주 조금 움직인다.
 * 완전히 정지한 캐릭터는 마네킹처럼 보인다.
 */
export function bodyBob(state: PoseState): number {
  if (state.animation === "idle") {
    return Math.sin(state.breathPhase) * POSE_TUNING.breathAmplitude;
  }
  return Math.abs(Math.sin(state.phase)) * state.swingAmount * POSE_TUNING.maxBobHeight;
}

/**
 * 스쿼시에 따른 스케일.
 *
 * 부피를 대략 유지해야 찌그러진 느낌이 산다 — 세로로 줄면 가로로 늘어난다.
 */
export function squashScale(state: PoseState): { x: number; y: number; z: number } {
  const y = 1 - state.squash;
  const lateral = 1 + state.squash * 0.5;
  return { x: lateral, y, z: lateral };
}
