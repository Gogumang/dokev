/**
 * 미니맵 좌표 변환 — 순수 함수.
 *
 * 282m짜리 도시에서 방향을 잡을 수단이 없었다. 격자 도시라 길만 그려도
 * "지금 어느 골목인가"가 읽힌다.
 *
 * **진행 방향이 위로 오게 회전한다**(heading-up). 북쪽 고정이 격자에는 더
 * 읽기 쉽지만, 3인칭 시점에서는 화면의 위와 지도의 위가 어긋나 매번 머릿속에서
 * 돌려야 한다.
 *
 * three.js와 캔버스에 의존하지 않는다 — 변환만 들고 있고 그리는 일은 밖이다.
 */

import { CITY, ROAD_CENTERS as LAYOUT_ROAD_CENTERS } from "@/game/world/cityLayout";

export const MINIMAP = {
  /** 지름(px). 화면 구석을 너무 먹지 않으면서 골목이 구분되는 크기 */
  sizePx: 148,
  /** 지도 반지름이 담는 실제 거리(m) */
  rangeMeters: 80,
  /** 가장자리에 붙는 표식의 여유(px). 0이면 반쯤 잘린다 */
  edgeInsetPx: 9,
} as const;

/** 지도 좌표(m). 오른쪽이 +u, 위쪽이 +v다 */
export interface MapPoint {
  u: number;
  v: number;
}

/**
 * 월드 좌표를 지도 좌표로 옮긴다.
 *
 * yaw는 플레이어가 보는 방향이고, 그 방향이 항상 위(+v)로 온다.
 *
 * 미니맵을 걷어낸 뒤로 이것을 쓰는 곳은 **대장 화살표**(`bossPointer`)
 * 하나다. 화살표도 「내가 보는 쪽이 위」를 전제하므로 같은 변환이 맞다.
 */
export function toMapPoint(
  worldX: number,
  worldZ: number,
  centerX: number,
  centerZ: number,
  yaw: number,
): MapPoint {
  const dx = worldX - centerX;
  const dz = worldZ - centerZ;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    u: dx * cos - dz * sin,
    v: dx * sin + dz * cos,
  };
}

/** 구역 중심 간 거리 */
const BLOCK_PITCH = CITY.blockSize + CITY.roadWidth;

/**
 * 도로 중심선의 월드 좌표.
 *
 * cityLayout이 정본이다. 여기서 다시 계산하면 반 칸이 어긋나 지도가 건물
 * 한가운데로 도로를 그린다 — 실제로 그렇게 틀렸다.
 */
export const ROAD_CENTERS = LAYOUT_ROAD_CENTERS;

/**
 * 지도에 찍을 표식 수. 이보다 많으면 점이 뭉쳐 아무 정보도 안 된다.
 */
export const MAX_BLIPS = 24;

/** 표식 버퍼 길이(x, z 한 쌍씩) */
export const BLIP_FLOAT_COUNT = MAX_BLIPS * 2;

export interface BlipSource {
  x: number;
  z: number;
}

/**
 * 지도에 들어올 것들만 골라 버퍼에 담는다.
 *
 * 반경 판정을 **회전 전에** 한다 — 회전은 거리를 바꾸지 않으므로 월드 좌표에서
 * 재는 편이 싸고, 화면 밖 표식까지 변환할 이유가 없다.
 *
 * 배열을 새로 만들지 않고 미리 잡아 둔 버퍼를 채운다. 매 프레임 새 배열을
 * 만들면 GC가 프레임을 먹는다.
 *
 * @returns 실제로 담은 표식 수
 */
export function collectBlips(
  sources: readonly BlipSource[],
  centerX: number,
  centerZ: number,
  out: Float32Array,
  rangeMeters: number = MINIMAP.rangeMeters,
): number {
  // 회전하면 모서리 방향이 더 멀리 보인다 (roadsInRange와 같은 이유).
  const reach = rangeMeters * Math.SQRT2;
  const reachSq = reach * reach;
  let count = 0;

  for (const source of sources) {
    if (count >= MAX_BLIPS) break;
    const dx = source.x - centerX;
    const dz = source.z - centerZ;
    if (dx * dx + dz * dz > reachSq) continue;
    out[count * 2] = source.x;
    out[count * 2 + 1] = source.z;
    count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * 전체 지도
 *
 * 미니맵과 달리 북쪽 고정이다. 도시 전체를 볼 때는 회전이 오히려 방해가 된다 —
 * 격자가 매번 다른 각도로 서면 "어느 쪽이 위였더라"를 다시 맞춰야 한다.
 * ------------------------------------------------------------------ */

/** 도시 한 변의 길이(m). 격자 크기에서 유도한다 */
export const WORLD_SPAN_METERS = CITY.gridSize * BLOCK_PITCH;

/** 지도 가장자리 여백 비율. 0이면 모서리 구역이 테두리에 붙어 잘려 보인다 */
const FULL_MAP_MARGIN = 1.08;

export interface BlockCell {
  index: number;
  /** 구역 중심의 월드 좌표 */
  x: number;
  z: number;
}

/**
 * 모든 구역의 중심 좌표.
 *
 * cityLayout의 인덱싱(row * gridSize + col)과 같은 순서여야 구역 성격
 * (districts.ts)과 짝이 맞는다.
 */
export function blockCells(): BlockCell[] {
  const offset = (CITY.gridSize - 1) / 2;
  const cells: BlockCell[] = [];
  for (let row = 0; row < CITY.gridSize; row += 1) {
    for (let col = 0; col < CITY.gridSize; col += 1) {
      cells.push({
        index: row * CITY.gridSize + col,
        x: (col - offset) * BLOCK_PITCH,
        z: (row - offset) * BLOCK_PITCH,
      });
    }
  }
  return cells;
}

/** 구역 한 칸이 지도에서 차지하는 크기(m) — 도로를 포함한 격자 간격이다 */
export const BLOCK_CELL_METERS = BLOCK_PITCH;

/** 전체 지도의 배율(px/m). */
export function fullMapScale(sizePx: number, spanMeters: number = WORLD_SPAN_METERS): number {
  return sizePx / (spanMeters * FULL_MAP_MARGIN);
}

/**
 * 월드 좌표를 전체 지도 픽셀로.
 *
 * 북쪽 고정이라 회전이 없다. +z가 위로 오도록 y 부호만 뒤집는다.
 */
export function toFullMapPixel(
  worldX: number,
  worldZ: number,
  sizePx: number,
  spanMeters: number = WORLD_SPAN_METERS,
): { x: number; y: number } {
  const scale = fullMapScale(sizePx, spanMeters);
  const half = sizePx / 2;
  return { x: half + worldX * scale, y: half - worldZ * scale };
}

/** 지도 표식이 흘러가는 곳 */
export interface BlipLink {
  enemyBlips: Float32Array;
  enemyBlipCount: number;
}

/**
 * 살아 있는 적을 지도 표식으로 옮긴다.
 *
 * 개수를 안 넘기면 **지도에 적이 하나도 안 뜬다.** 좌표는 버퍼에 들어가 있는데
 * 몇 개를 그릴지 모르니 0개를 그린다 — 값은 맞는데 화면이 비는, 이 저장소에서
 * 가장 자주 나온 모양이다.
 *
 * 버퍼는 **같은 것을 계속 쓴다.** 매 프레임 새로 만들면 초당 60번 쓰레기가 된다.
 */
export function projectEnemyBlips(
  link: BlipLink,
  sources: readonly BlipSource[],
  centerX: number,
  centerZ: number,
): void {
  link.enemyBlipCount = collectBlips(sources, centerX, centerZ, link.enemyBlips);
}
