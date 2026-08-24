/**
 * 3인칭 카메라 계산 — 순수 함수.
 *
 * 씬 파일이 1,000줄을 넘어 규칙(800줄)을 어겼다. 그냥 잘라 옮기는 대신
 * **검증할 수 있는 형태로** 떼어 낸다 — 카메라는 지금까지 한 번도 테스트된
 * 적이 없고, 화면을 못 보는 상태에서 가장 확인하기 어려운 부분이었다.
 *
 * three.js에 의존하지 않는다. 벡터 연산은 씬이 하고 여기서는 수치만 정한다.
 */

import { inverseLerpClamped, lerp } from "@/game/core/mathx";
import type { Aabb, Vec3 } from "@/game/player/locomotion";

export interface CameraTuning {
  distanceBase: number;
  distanceMax: number;
  heightIdle: number;
  heightRun: number;
  combatLift: number;
  combatPullback: number;
  vistaBaseY: number;
  vistaSpan: number;
  vistaLift: number;
  vistaPullback: number;
  rideDrop: number;
  ridePull: number;
  fovBase: number;
  fovMax: number;
  lookAheadMax: number;
  fovSpeedReference: number;
}

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

/** 속도를 0~1로 편 값. 거리·시야각·시선 선행이 모두 이 하나를 쓴다 */
export function speedRatio(speed: number, reference: number): number {
  return inverseLerpClamped(0, reference, speed);
}

/**
 * 카메라가 플레이어에게서 떨어질 거리(m).
 *
 * 포토 모드에서는 휠로 정한 값을 그대로 쓴다 — 속도에 따라 움직이면 구도를
 * 잡을 수 없다.
 */
export function followDistance(
  tuning: Pick<
    CameraTuning,
    | "distanceBase"
    | "distanceMax"
    | "combatPullback"
    | "vistaBaseY"
    | "vistaSpan"
    | "vistaPullback"
    | "ridePull"
  >,
  speed01: number,
  photoMode: boolean,
  photoDistance: number,
  /**
   * 전투 압력 0~1. 로봇이 붙을수록 1에 가깝다.
   *
   * 안 넘기면 **전투에서 카메라가 그대로 붙어 있어** 무엇이 다가오는지 보이지
   * 않는다. `tests/silentDefaults.test.ts`가 제품 호출을 본다.
   */
  combat01: number,
  /** 플레이어의 월드 높이(m). 언덕 마루에서는 더 물러나 도시가 보인다 */
  playerY: number,
  /** 무언가를 타고 있는지. 타면 조금 붙어 차체가 커 보인다 */
  riding: boolean,
): number {
  if (photoMode) return photoDistance;
  return (
    lerp(tuning.distanceBase, tuning.distanceMax, speed01) +
    tuning.combatPullback * combat01 +
    tuning.vistaPullback * vistaOpenness(playerY, tuning) -
    (riding ? tuning.ridePull : 0)
  );
}

/**
 * 지금 얼마나 트인 곳에 서 있는가 (0~1).
 *
 * 높이 하나로 잰다. 「전망대」를 따로 배치하지 않는 이유는 **이 도시의 언덕이
 * 이미 그 자리**이기 때문이다 — 배치를 새로 두면 지형과 어긋날 자리가 하나 더
 * 생기고, 어긋나면 아무것도 없는 허공에서 카메라만 물러난다.
 */
export function vistaOpenness(
  playerY: number,
  tuning: Pick<CameraTuning, "vistaBaseY" | "vistaSpan">,
): number {
  if (tuning.vistaSpan <= 0) return 0;
  return inverseLerpClamped(tuning.vistaBaseY, tuning.vistaBaseY + tuning.vistaSpan, playerY);
}

/**
 * 카메라가 플레이어 발밑에서 얼마나 위에 있을지(m).
 *
 * 멈추면 낮아 아이와 눈높이가 가깝고, 달리면 올라가 앞이 보이고, 전투에서는
 * 더 올라가 전장이 보인다. 포토 모드는 자유 카메라라 이 값을 쓰지 않는다.
 */
export function followHeight(
  tuning: Pick<
    CameraTuning,
    | "heightIdle"
    | "heightRun"
    | "combatLift"
    | "vistaBaseY"
    | "vistaSpan"
    | "vistaLift"
    | "rideDrop"
  >,
  speed01: number,
  combat01: number,
  /** 플레이어의 월드 높이(m). 트인 곳에서는 시야가 열려야 한다 */
  playerY: number,
  /** 무언가를 타고 있는지. 타면 낮아져 차체가 화면 아래에 들어온다 */
  riding: boolean,
): number {
  return (
    lerp(tuning.heightIdle, tuning.heightRun, speed01) +
    tuning.combatLift * combat01 +
    tuning.vistaLift * vistaOpenness(playerY, tuning) -
    (riding ? tuning.rideDrop : 0)
  );
}

/**
 * 카메라가 바라보는 방향의 단위 벡터.
 *
 * yaw는 수평, pitch는 위아래다. 카메라는 이 방향의 **반대쪽**으로 물러난다.
 */
export function orbitDirection(yaw: number, pitch: number): { x: number; y: number; z: number } {
  const cosPitch = Math.cos(pitch);
  return { x: Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: Math.cos(yaw) * cosPitch };
}

/**
 * 시야각(도).
 *
 * 빨라질수록 넓어져 속도감을 만든다. 포토 모드에서는 기본값으로 고정한다 —
 * 사진마다 화각이 다르면 같은 장소를 찍어도 다른 곳처럼 보인다.
 */
export function followFov(
  tuning: Pick<CameraTuning, "fovBase" | "fovMax">,
  speed01: number,
  photoMode: boolean,
  extra = 0,
): number {
  return (photoMode ? tuning.fovBase : lerp(tuning.fovBase, tuning.fovMax, speed01)) + extra;
}

/**
 * 시선 선행 거리(m).
 *
 * 빠를수록 진행 방향을 더 멀리 본다. 멈춰 있으면 0이어야 화면이 흔들리지 않는다.
 */
export function lookAheadDistance(
  tuning: Pick<CameraTuning, "lookAheadMax">,
  speed01: number,
  photoMode: boolean,
): number {
  return photoMode ? 0 : tuning.lookAheadMax * speed01;
}

/**
 * 카메라가 건물을 뚫지 않도록 플레이어~카메라 구간을 훑어 막힌 거리를 찾는다.
 *
 * 정밀한 스윕 대신 구간 샘플링을 쓴다. 블록아웃의 상자 크기에 비해 샘플 간격이
 * 충분히 촘촘해 놓치는 경우가 없고, 콜라이더 수백 개에 대해서도 프레임당
 * 0.1ms 수준으로 끝난다.
 */
export function findCameraDistance(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  boxes: readonly Aabb[],
): number {
  const samples = 10;
  const margin = 0.5;

  for (let i = 1; i <= samples; i += 1) {
    const distance = (maxDistance * i) / samples;
    const x = origin.x + direction.x * distance;
    const y = origin.y + direction.y * distance;
    const z = origin.z + direction.z * distance;

    for (const box of boxes) {
      if (y >= box.top) continue;
      if (
        x > box.minX - margin &&
        x < box.maxX + margin &&
        z > box.minZ - margin &&
        z < box.maxZ + margin
      ) {
        // 막힌 지점 직전까지만 물러난다.
        return Math.max(1.4, (maxDistance * (i - 1)) / samples);
      }
    }
  }

  return maxDistance;
}

/**
 * 카메라가 가까울 때 캐릭터를 얼마나 진하게 그릴지(0~1).
 *
 * 벽에서 밀려난 카메라는 플레이어 쪽으로 당겨져 화면이 **뒤통수로 가득 찬다.**
 * 카메라를 억지로 물리려다 한 번 실패했다(위로 올렸더니 벽면을 정면으로 보게
 * 됐다) — 위치를 옮기는 대신 **가리는 것을 지운다.**
 *
 * 한 지점에서 켜고 끄지 않는다. 벽을 스칠 때마다 캐릭터가 깜빡인다.
 */
export function characterAlpha(
  distance: number,
  range: { start: number; end: number },
): number {
  return inverseLerpClamped(range.end, range.start, distance);
}
