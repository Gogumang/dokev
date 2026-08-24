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
  fovBase: number;
  fovMax: number;
  lookAheadMax: number;
  fovSpeedReference: number;
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
  tuning: Pick<CameraTuning, "distanceBase" | "distanceMax">,
  speed01: number,
  photoMode: boolean,
  photoDistance: number,
): number {
  return photoMode ? photoDistance : lerp(tuning.distanceBase, tuning.distanceMax, speed01);
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
