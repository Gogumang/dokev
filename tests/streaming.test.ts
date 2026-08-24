import { describe, expect, it } from "vitest";

import { buildCityLayout, CITY } from "@/game/world/cityLayout";
import {
  BLOCK_COUNT,
  blockIndexFromPosition,
  collectVisible,
  partitionByBlock,
  STREAMING,
  visibleBlocks,
  visibleKey,
} from "@/game/world/streaming";

const PITCH = CITY.blockSize + CITY.roadWidth;
const OFFSET = (CITY.gridSize - 1) / 2;

/**
 * 격자 안쪽 구역 하나.
 *
 * `BLOCK_COUNT / 2`는 안쪽이 아니다 — 6x6에서 18번은 열 0의 가장자리라
 * 이웃이 잘린다. 잘리지 않는 구역을 골라야 (2r+1)^2를 검증할 수 있다.
 */
const INTERIOR_INDEX =
  Math.floor(CITY.gridSize / 2) * CITY.gridSize + Math.floor(CITY.gridSize / 2);

/** 구역 번호 → 중심 좌표 */
function centerOf(index: number): { x: number; z: number } {
  return {
    x: ((index % CITY.gridSize) - OFFSET) * PITCH,
    z: (Math.floor(index / CITY.gridSize) - OFFSET) * PITCH,
  };
}

describe("blockIndexFromPosition", () => {
  it("구역 중심은 그 구역으로 매핑된다", () => {
    for (let index = 0; index < BLOCK_COUNT; index += 1) {
      const { x, z } = centerOf(index);
      expect(blockIndexFromPosition(x, z), `block ${index} center (${x}, ${z})`).toBe(index);
    }
  });

  it("월드 밖 좌표도 범위 안 구역으로 접힌다", () => {
    // 경계를 넘어가도 존재하지 않는 버킷을 가리키면 안 된다
    const index = blockIndexFromPosition(99999, -99999);
    expect(index, `index was: ${index}`).toBeGreaterThanOrEqual(0);
    expect(index, `index was: ${index}`).toBeLessThan(BLOCK_COUNT);
  });

  it("도로 위 좌표는 가장 가까운 구역으로 접힌다", () => {
    // Arrange — 두 구역 사이 도로 근처
    const a = centerOf(0);
    const roadX = a.x + PITCH / 2 - 1;

    // Act
    const index = blockIndexFromPosition(roadX, a.z);

    // Assert — 어느 쪽이든 유효한 구역이어야 한다
    expect(index, `index was: ${index}`).toBeGreaterThanOrEqual(0);
    expect(index, `index was: ${index}`).toBeLessThan(BLOCK_COUNT);
  });
});

describe("visibleBlocks", () => {
  it("중앙에서는 (2r+1)^2 구역이 보인다", () => {
    // Arrange — 격자 한가운데
    const middle = centerOf(INTERIOR_INDEX);
    const radius = 1;

    // Act
    const blocks = visibleBlocks(middle.x, middle.z, radius);

    // Assert
    expect(blocks.length, `blocks were: ${blocks.join(",")}`).toBe((radius * 2 + 1) ** 2);
  });

  it("모서리에서는 잘려서 더 적게 보인다", () => {
    const corner = centerOf(0);
    const blocks = visibleBlocks(corner.x, corner.z, 1);
    expect(blocks.length, `blocks were: ${blocks.join(",")}`).toBe(4);
  });

  it("항상 자기 구역을 포함한다", () => {
    // 자기 구역이 빠지면 발밑 건물이 사라진다
    for (let index = 0; index < BLOCK_COUNT; index += 1) {
      const { x, z } = centerOf(index);
      expect(visibleBlocks(x, z), `block ${index}`).toContain(index);
    }
  });

  it("반경을 키우면 보이는 구역이 줄지 않는다", () => {
    const middle = centerOf(INTERIOR_INDEX);
    const small = visibleBlocks(middle.x, middle.z, 1).length;
    const large = visibleBlocks(middle.x, middle.z, 2).length;
    expect(large, `small=${small}, large=${large}`).toBeGreaterThanOrEqual(small);
  });

  it("범위 밖 구역 번호를 만들지 않는다", () => {
    const corner = centerOf(BLOCK_COUNT - 1);
    for (const index of visibleBlocks(corner.x, corner.z, 3)) {
      expect(index, `index was: ${index}`).toBeGreaterThanOrEqual(0);
      expect(index, `index was: ${index}`).toBeLessThan(BLOCK_COUNT);
    }
  });
});

describe("visibleKey", () => {
  it("같은 구역 안에서는 키가 바뀌지 않는다", () => {
    // 키가 매 프레임 바뀌면 스트리밍이 오히려 더 비싸진다
    const center = centerOf(0);
    const a = visibleKey(center.x, center.z);
    const b = visibleKey(center.x + 3, center.z - 3);
    expect(b, `a=${a}, b=${b}`).toBe(a);
  });

  it("구역을 넘으면 키가 바뀐다", () => {
    const a = visibleKey(centerOf(0).x, centerOf(0).z);
    const b = visibleKey(centerOf(1).x, centerOf(1).z);
    expect(b, `a=${a}, b=${b}`).not.toBe(a);
  });
});

describe("partitionByBlock / collectVisible", () => {
  it("모든 항목이 정확히 한 구역에 들어간다", () => {
    // Arrange
    const layout = buildCityLayout();

    // Act
    const buckets = partitionByBlock(layout.buildings);
    let total = 0;
    for (const bucket of buckets.values()) total += bucket.length;

    // Assert — 누락도 중복도 없어야 한다
    expect(total, `total=${total}, buildings=${layout.buildings.length}`).toBe(
      layout.buildings.length,
    );
  });

  it("전체 구역을 요청하면 원본과 같은 수가 나온다", () => {
    const layout = buildCityLayout();
    const buckets = partitionByBlock(layout.buildings);
    const all = collectVisible(
      buckets,
      Array.from({ length: BLOCK_COUNT }, (_, index) => index),
    );
    expect(all.length, `collected=${all.length}`).toBe(layout.buildings.length);
  });

  it("일부 구역만 요청하면 실제로 줄어든다", () => {
    // 스트리밍이 아무것도 걸러내지 못하면 도시를 넓힌 의미가 없다
    const layout = buildCityLayout();
    const buckets = partitionByBlock(layout.buildings);
    const spawnBlocks = visibleBlocks(layout.spawn.x, layout.spawn.z, STREAMING.radiusBlocks);
    const near = collectVisible(buckets, spawnBlocks);

    expect(near.length, `near=${near.length}, all=${layout.buildings.length}`).toBeLessThan(
      layout.buildings.length,
    );
    expect(near.length, `near=${near.length}`).toBeGreaterThan(0);
  });

  it("빈 구역을 요청해도 터지지 않는다", () => {
    const buckets = partitionByBlock<{ x: number; z: number }>([]);
    expect(collectVisible(buckets, [0, 1, 2])).toEqual([]);
  });
});
