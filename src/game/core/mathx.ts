/**
 * 프레임 독립적인 보간·각도 유틸.
 *
 * three.js에 의존하지 않는 순수 함수만 둔다. 이동·카메라 계산을 렌더러 없이
 * 테스트할 수 있어야 하기 때문이다 (testing 규칙: 순수 계산 로직은 목 없이 검증).
 */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0..1로 정규화하고 범위 밖은 잘라낸다. from === to면 0을 돌려준다. */
export function inverseLerpClamped(from: number, to: number, value: number): number {
  if (from === to) return 0;
  return clamp((value - from) / (to - from), 0, 1);
}

/**
 * 프레임률에 독립적인 지수 감쇠 보간.
 *
 * lerp(a, b, 0.1)을 매 프레임 부르면 120fps에서 60fps보다 두 배 빨리 붙는다.
 * 카메라 추적처럼 "따라붙는" 동작에는 반드시 이 함수를 쓴다.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** 두 각도의 최단 차이를 -PI..PI 범위로 돌려준다. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** from에서 to를 향해 최대 maxDelta 라디안만큼만 회전한다. */
export function rotateToward(from: number, to: number, maxDelta: number): number {
  const delta = shortestAngleDelta(from, to);
  if (Math.abs(delta) <= maxDelta) return to;
  return from + Math.sign(delta) * maxDelta;
}

/** 각도를 -PI..PI로 정규화한다. */
export function normalizeAngle(angle: number): number {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** 결정적 난수. 도시 배치가 새로고침마다 바뀌면 성능 비교가 불가능하다. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
