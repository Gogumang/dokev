/**
 * 3인칭 카메라 계산 — 순수 함수.
 *
 * 씬 파일이 1,000줄을 넘어 규칙(800줄)을 어겼다. 그냥 잘라 옮기는 대신
 * **검증할 수 있는 형태로** 떼어 낸다 — 카메라는 지금까지 한 번도 테스트된
 * 적이 없고, 화면을 못 보는 상태에서 가장 확인하기 어려운 부분이었다.
 *
 * three.js에 의존하지 않는다. 벡터 연산은 씬이 하고 여기서는 수치만 정한다.
 */

import { inverseLerpClamped, lerp, rotateToward } from "@/game/core/mathx";
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
  /**
   * 카메라가 목표 위치를 따라잡는 속도.
   *
   * 이 칸이 타입에 없어서 `CameraTuning`을 받는 쪽이 `CAMERA`를 다시 읽어야
   * 했다 — 저감 모션 설정이 이 값을 12로 덮어쓰는데(`CAMERA_REDUCED`), 그
   * 덮어쓴 값이 조립부에 닿지 않으면 저감 모션에서만 카메라가 늦게 따라온다.
   */
  followLambda: number;
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

/** 카메라가 이보다 가까이는 안 붙는다(m). 더 붙으면 머리 안이다 */
const MIN_CAMERA_DISTANCE = 1.4;
/** 콜라이더에 두는 여유(m). 벽면에 딱 붙으면 면이 깜빡인다 */
const WALL_MARGIN = 0.5;

/** 구간 위 한 점이 상자 안(여유 포함)인가 */
function blockedAt(o: Vec3, d: Vec3, at: number, boxes: readonly Aabb[]): boolean {
  const [x, y, z] = [o.x + d.x * at, o.y + d.y * at, o.z + d.z * at];
  return boxes.some(
    (box) =>
      y < box.top &&
      x > box.minX - WALL_MARGIN &&
      x < box.maxX + WALL_MARGIN &&
      z > box.minZ - WALL_MARGIN &&
      z < box.maxZ + WALL_MARGIN,
  );
}

/**
 * 카메라가 건물을 뚫지 않도록 플레이어~카메라 구간을 훑어 막힌 거리를 찾는다.
 *
 * **성긴 스캔으로 막힌 구간을 찾고, 그 안을 이분 탐색으로 좁힌다.**
 * 예전에는 「막힌 표본 하나 앞」을 돌려줘 답이 0.7m 단위로만 나왔다 —
 * 비스듬히 붙으면 그만큼 통째로 양보해 뒤통수가 화면을 덮었고, 시점을 돌리면
 * 그 간격만큼 **툭툭 끊어졌다.** 이분 탐색 다섯 번이면 0.02m까지 좁혀진다.
 */
export function findCameraDistance(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  boxes: readonly Aabb[],
): number {
  const step = maxDistance / 10;
  for (let i = 1; i <= 10; i += 1) {
    if (!blockedAt(origin, direction, step * i, boxes)) continue;
    // `clear`는 뚫린 것이 확인된 마지막 거리, `blocked`는 막힌 첫 거리다.
    let clear = step * (i - 1);
    let blocked = step * i;
    for (let refine = 0; refine < 5; refine += 1) {
      const middle = (clear + blocked) / 2;
      if (blockedAt(origin, direction, middle, boxes)) blocked = middle;
      else clear = middle;
    }
    return Math.max(MIN_CAMERA_DISTANCE, clear);
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
export function characterAlpha(distance: number, range: { start: number; end: number }): number {
  return inverseLerpClamped(range.end, range.start, distance);
}

/**
 * 카메라 yaw를 한 프레임 진행한다 — 달리면 진행 방향 뒤로 돌아온다.
 *
 * 이것이 없으면 앞으로 달려도 **시점이 그대로**라, 캐릭터가 화면 옆으로
 * 빠져나가고 진행 방향이 화면 밖이 된다. 3인칭 액션 게임이 예외 없이 갖고
 * 있는 되돌림이다.
 *
 * 「빠를수록 세게」로만 두지 않는다. 방금 손으로 돌려 둔 시점을 곧바로
 * 되돌리면 카메라와 손이 싸운다 — 마우스에서 손을 떼는 순간 화면이 홱
 * 돌아간다. 그래서 **유예 시간 안에는 아무것도 하지 않는다.**
 */
export function stepFollowYaw(
  yaw: number,
  /** 몸이 가고 있는 방향(rad) */
  heading: number,
  /** 속도 0~1. `speedRatio`가 준 값 */
  speed01: number,
  /** 마지막 수동 시점 조작 뒤 경과 시간(초) */
  sinceLookSeconds: number,
  dt: number,
  tuning: { alignSpeedFloor: number; alignRate: number; lookGraceSeconds: number },
): number {
  if (sinceLookSeconds < tuning.lookGraceSeconds) return yaw;

  // 걷는 속도에서는 0이 되어 자유롭게 둘러볼 수 있다.
  const strength = inverseLerpClamped(tuning.alignSpeedFloor, 1, speed01);
  if (strength <= 0) return yaw;

  // 각속도 제한이라 목표를 넘어가지 않는다 — 큰 dt에서도 진동하지 않는다.
  return rotateToward(yaw, heading, tuning.alignRate * strength * dt);
}
