/**
 * 프레임 계측 — fps·프레임 시간·드로우콜·힙, 그리고 자동 강등 판정.
 *
 * 매 프레임 재면 숫자가 요동쳐 읽을 수 없고, 무엇보다 **강등이 한 프레임의
 * 딸꾹질에 반응한다.** 그래서 표본 구간을 모아 한 번에 낸다.
 *
 * 씬의 프레임 루프에 있을 때는 누적기 셋(프레임 수·경과·저fps 지속)이
 * ref로 흩어져 있었다. 셋이 **함께 비워져야 맞는** 값이라 한 곳에 모은다 —
 * 하나만 안 비우면 fps가 영원히 첫 표본에 머문다.
 */

import { stepDowngradeWatch, type QualityLevel } from "@/game/systems/quality";
import type { RuntimeStats } from "@/game/scene/sceneTypes";

export interface FrameMetricsState {
  /** 이번 표본 구간에 지나간 프레임 수 */
  frames: number;
  /** 이번 표본 구간의 실제 경과 시간(초) */
  elapsedSeconds: number;
  /** 문턱 아래 fps가 이어진 시간(초). 강등 판정이 읽는다 */
  lowFpsSeconds: number;
}

export function createFrameMetrics(): FrameMetricsState {
  return { frames: 0, elapsedSeconds: 0, lowFpsSeconds: 0 };
}

export interface FrameMetricsInput {
  /** **실시간** 프레임 간격. 슬로우 모션으로 줄인 값을 주면 fps가 거짓이 된다 */
  rawDelta: number;
  /** 표본 구간 길이(초) */
  sampleSeconds: number;
  /** three의 렌더 통계 */
  render: { calls: number; triangles: number };
  quality: QualityLevel;
  fpsThreshold: number;
  downgradeAfterSeconds: number;
}

/**
 * 한 프레임을 계측에 더하고, 표본이 찼으면 `stats`에 적는다.
 *
 * 강등이 필요하면 그 등급을 돌려준다(없으면 null). 여기서 직접 부르지
 * 않는 이유: 강등은 React 상태를 바꾸는 일이라 순수 계산과 섞이면
 * 테스트가 렌더러를 필요로 하게 된다.
 */
export function recordFrameMetrics(
  state: FrameMetricsState,
  stats: RuntimeStats,
  input: FrameMetricsInput,
): QualityLevel | null {
  state.frames += 1;
  state.elapsedSeconds += input.rawDelta;

  if (state.elapsedSeconds < input.sampleSeconds) return null;

  const fps = state.frames / state.elapsedSeconds;
  stats.fps = fps;
  stats.frameMs = (state.elapsedSeconds * 1000) / state.frames;

  // 후처리가 켜져 있으면 그쪽이 채운다 (RuntimeStats.renderStatsOwned 주석)
  if (!stats.renderStatsOwned) {
    stats.drawCalls = input.render.calls;
    stats.triangles = input.render.triangles;
  }

  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  stats.heapMb = memory ? memory.usedJSHeapSize / 1048576 : 0;

  const watch = stepDowngradeWatch(
    state.lowFpsSeconds,
    fps,
    state.elapsedSeconds,
    input.quality,
    input.fpsThreshold,
    input.downgradeAfterSeconds,
  );
  state.lowFpsSeconds = watch.lowSeconds;

  // 셋을 함께 비운다 — 하나만 남기면 fps가 영원히 첫 표본에 머문다
  state.frames = 0;
  state.elapsedSeconds = 0;

  return watch.next;
}
