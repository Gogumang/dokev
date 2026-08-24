/**
 * 그래플 줄의 모양 — 순수 함수.
 *
 * 직선으로 그리면 팽팽한 케이블처럼 보인다. 실제 줄은 아래로 처지고, 당겨질수록
 * 펴진다. 그 변화가 "지금 끌려가는 중"이라는 신호가 된다.
 *
 * 현수선(catenary)을 정확히 풀지 않는다. 사인 곡선 하나면 이 거리에서
 * 눈으로 구분되지 않고, 계산은 훨씬 싸다.
 */

import type { Vec3 } from "@/game/player/locomotion";

export const ROPE = {
  /** 줄을 몇 조각으로 나눌지. 많을수록 부드럽지만 정점이 늘어난다 */
  segments: 12,
  /** 길이 대비 최대 처짐 비율. 0.12면 10m 줄이 약 1.2m 내려앉는다 */
  sagRatio: 0.12,
  /** 이 길이 이하에서는 처짐을 없앤다 — 짧은 줄이 축 늘어지면 이상하다 */
  minSagLength: 3,
} as const;

/**
 * 처짐 크기(m)를 구한다.
 *
 * 긴 줄일수록 많이 처지고, 당기는 힘(tension 0~1)이 셀수록 펴진다.
 * tension 1이면 완전히 직선이다.
 */
export function sagAmount(length: number, tension: number): number {
  if (length <= ROPE.minSagLength) return 0;
  const clampedTension = Math.max(0, Math.min(1, tension));
  return (length - ROPE.minSagLength) * ROPE.sagRatio * (1 - clampedTension);
}

/**
 * 줄을 이루는 점들을 구한다.
 *
 * 양 끝점은 정확히 from/to여야 한다 — 손이나 기둥에서 줄이 떨어져 보이면
 * 걸려 있다는 인상이 깨진다.
 */
export function ropePoints(from: Vec3, to: Vec3, tension: number): Vec3[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const sag = sagAmount(length, tension);
  const points: Vec3[] = [];

  for (let i = 0; i <= ROPE.segments; i += 1) {
    const t = i / ROPE.segments;
    // 사인은 양 끝에서 0이므로 끝점이 그대로 유지된다.
    const drop = Math.sin(t * Math.PI) * sag;
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - drop,
      z: from.z + (to.z - from.z) * t,
    });
  }
  return points;
}

/**
 * lineSegments가 먹는 형태로 펼친다.
 *
 * 선분 하나에 정점 두 개가 필요하므로 이웃한 점을 짝지어 반복한다.
 * 이렇게 하면 지오메트리 하나로 줄 전체를 그릴 수 있다.
 */
export function toSegmentPositions(points: readonly Vec3[], out: Float32Array): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const base = i * 6;
    out[base] = points[i].x;
    out[base + 1] = points[i].y;
    out[base + 2] = points[i].z;
    out[base + 3] = points[i + 1].x;
    out[base + 4] = points[i + 1].y;
    out[base + 5] = points[i + 1].z;
  }
}

/** 선분 배열에 필요한 Float32Array 길이 */
export const SEGMENT_FLOAT_COUNT = ROPE.segments * 6;
