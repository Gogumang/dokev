/**
 * 구역 스트리밍 — 순수 함수.
 *
 * PROJECT_PLAN 「구조 원칙」: "월드는 구역 단위로 로딩·해제할 수 있어야 한다."
 * 도시를 넓히면서 프레임을 지키려면 멀리 있는 구역을 아예 그리지 않아야 한다.
 *
 * **위치에서 구역을 역산한다.** 배치 데이터의 blockIndex 필드를 쓰지 않는 이유:
 * 레이어마다 그 필드의 의미가 다르다. 건물과 인도 소품은 실제 구역 번호를 담지만,
 * 가로등과 도로 표시는 축 번호(0..gridSize-1)를 담는다. 필드를 믿고 거르면
 * 엉뚱한 것이 사라진다. 좌표는 거짓말하지 않는다.
 */

import { CITY } from "@/game/world/cityLayout";

/** 구역 중심 간 거리 */
const BLOCK_PITCH = CITY.blockSize + CITY.roadWidth;
const GRID_OFFSET = (CITY.gridSize - 1) / 2;

export const STREAMING = {
  /**
   * 플레이어 구역에서 몇 칸까지 그릴지.
   *
   * 2면 5x5 = 25구역, 중심에서 약 117m다. 안개 끝(high 품질 220m)보다는 짧지만
   * 그보다 좁히면 경계에서 건물이 눈앞에 나타나는 것이 보인다. 성능과 시야의
   * 절충점이며, 프레임이 남으면 늘리고 모자라면 줄이는 첫 번째 손잡이다.
   */
  radiusBlocks: 2,
} as const;

/** 총 구역 수 */
export const BLOCK_COUNT = CITY.gridSize * CITY.gridSize;

/** 좌표가 속한 구역의 열·행. 도로 위 좌표도 가장 가까운 구역으로 접는다. */
function blockColRow(x: number, z: number): { col: number; row: number } {
  const clampIndex = (value: number) => Math.max(0, Math.min(CITY.gridSize - 1, value));
  return {
    col: clampIndex(Math.round(x / BLOCK_PITCH + GRID_OFFSET)),
    row: clampIndex(Math.round(z / BLOCK_PITCH + GRID_OFFSET)),
  };
}

/** 좌표가 속한 구역 번호. cityLayout의 인덱싱(row * gridSize + col)과 같다. */
export function blockIndexFromPosition(x: number, z: number): number {
  const { col, row } = blockColRow(x, z);
  return row * CITY.gridSize + col;
}

/**
 * 지금 그려야 할 구역 번호들.
 *
 * 체비쇼프 거리(정사각형 이웃)를 쓴다. 유클리드 거리로 원을 만들면 모서리
 * 방향으로 달릴 때 시야 끝이 더 짧아져 건물이 눈앞에서 나타난다.
 */
export function visibleBlocks(
  x: number,
  z: number,
  radius: number = STREAMING.radiusBlocks,
): number[] {
  const { col, row } = blockColRow(x, z);
  const result: number[] = [];

  for (let r = row - radius; r <= row + radius; r += 1) {
    if (r < 0 || r >= CITY.gridSize) continue;
    for (let c = col - radius; c <= col + radius; c += 1) {
      if (c < 0 || c >= CITY.gridSize) continue;
      result.push(r * CITY.gridSize + c);
    }
  }
  return result;
}

/**
 * 보이는 구역 집합의 안정적인 키.
 *
 * 렌더 쪽이 이 키가 바뀔 때만 인스턴스 배열을 다시 만든다. 매 프레임 다시
 * 만들면 스트리밍이 오히려 더 비싸진다 — 구역을 넘을 때만 바뀌어야 한다.
 */
export function visibleKey(x: number, z: number, radius?: number): string {
  const { col, row } = blockColRow(x, z);
  return `${col}:${row}:${radius ?? STREAMING.radiusBlocks}`;
}

/** 위치를 가진 무엇이든 구역별로 나눈다. */
export function partitionByBlock<T extends { x: number; z: number }>(
  items: readonly T[],
): Map<number, T[]> {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    const index = blockIndexFromPosition(item.x, item.z);
    const bucket = buckets.get(index);
    if (bucket) bucket.push(item);
    else buckets.set(index, [item]);
  }
  return buckets;
}

/** 보이는 구역의 항목만 모은다. */
export function collectVisible<T extends { x: number; z: number }>(
  buckets: Map<number, T[]>,
  blocks: readonly number[],
): T[] {
  const result: T[] = [];
  for (const index of blocks) {
    const bucket = buckets.get(index);
    if (bucket) result.push(...bucket);
  }
  return result;
}
