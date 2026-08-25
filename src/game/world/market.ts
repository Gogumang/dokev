/**
 * 노을 시장 — 아케이드 천막과 좌판.
 *
 * 「천막 아래로 골목이 이어진다」는 부제를 붙여 놓고 실제로는 **작은 상자가
 * 촘촘히 선 동네**였다. 필지를 넷·다섯으로 잘게 쪼갠 것만으로는 「건물이
 * 작은 상가」이지 시장이 아니다.
 *
 * 시장을 시장으로 만드는 것은 **머리 위**다. 한국 재래시장의 첫인상은 골목을
 * 통째로 덮은 천막이고, 그 아래로 들어서는 순간 하늘이 가려지면서 다른
 * 공간이 된다. 그래서 이 파일의 절반이 도로를 가로지르는 천막이다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다
 * (`zones.ts` 주석). 치수는 인자로 받고 타입만 가져온다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { BoxInstance } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

export interface MarketBlock {
  blockIndex: number;
  cx: number;
  cz: number;
  /** 동쪽 이웃도 시장인가. 천막은 **시장과 시장 사이 도로**만 덮는다 */
  hasEastNeighbour: boolean;
  /** 그 구역의 건물. 좌판이 벽을 파고들지 않게 확인한다 */
  buildings: readonly BoxInstance[];
}

export interface MarketParts {
  /** 도로를 가로지르는 천막 — 시장의 첫인상 */
  canopies: BoxInstance[];
  /** 좌판 상판·기둥·차양 */
  stalls: BoxInstance[];
  colliders: Aabb[];
}

/**
 * 천막 수치.
 *
 * 높이가 전부다. 6.4m는 **가로등(5.6m)과 전깃줄 위**다 — 그보다 낮으면 천막이
 * 가로등을 뚫고, 그보다 높으면 하늘을 가리지 못해 그냥 공중에 뜬 판이 된다.
 */
const CANOPY = {
  height: 6.4,
  thickness: 0.22,
  /** 한 폭의 깊이(m). 좁으면 발이고 넓으면 지붕이다 — 그 사이 */
  depth: 3.1,
  /** 폭 사이 간격(m). 천막과 하늘이 번갈아 보여야 「덮였다」가 읽힌다 */
  step: 4.6,
  /** 도로 폭 밖으로 더 내미는 길이(m). 인도까지 덮어야 골목이 이어져 보인다 */
  overhang: 3.4,
  /**
   * 구역 안쪽 천막이 그 구역 **가장 높은 건물** 위로 뜨는 높이(m).
   *
   * 고정 높이로 두면 안 된다. 시장 건물은 4~8m로 제각각이라, 6m에 걸면
   * 8m짜리가 천막을 뚫고 나온다 — 천막이 잘린 것처럼 보이는데 원인이
   * 높이 하나라고는 화면에서 안 보인다. 그 구역에서 제일 높은 지붕을
   * 재서 그 위에 얹는다.
   */
  roofClear: 0.9,
} as const;

/**
 * 좌판 수치.
 *
 * 상판 0.85m는 **서서 물건을 고르는 높이**다. 더 낮으면 평상이고 더 높으면
 * 계산대가 된다.
 */
const STALL = {
  tableHeight: 0.85,
  tableWidth: 2.1,
  tableDepth: 1.15,
  /** 차양 높이(m). 어린이 주인공이 그 아래로 지나갈 수 있어야 한다 */
  awningHeight: 2.35,
  awningThickness: 0.12,
  postWidth: 0.11,
  /** 좌판 사이 간격(m) */
  step: 4.4,
  /** 구역 중심에서 좌판까지(m). 건물 벽과 인도 사이 */
  inset: 15.6,
  /** 벽에서 띄우는 여백(m) */
  wallMargin: 1.5,
} as const;

/** 팔레트 인덱스 — 렌더의 `MARKET_PALETTE` 순서와 반드시 같아야 한다 */
const TONE = {
  canopyWarm: 0,
  canopyCool: 1,
  wood: 2,
  metal: 3,
  goods: 4,
} as const;

/**
 * 시장 구역에 천막과 좌판을 놓는다.
 *
 * @param blockSize 구역 한 변(m)
 * @param roadWidth 도로 폭(m)
 */
export function buildMarket(
  blocks: readonly MarketBlock[],
  blockSize: number,
  roadWidth: number,
  random: () => number,
): MarketParts {
  const canopies: BoxInstance[] = [];
  const stalls: BoxInstance[] = [];
  const colliders: Aabb[] = [];

  for (const block of blocks) {
    if (block.hasEastNeighbour) {
      addCanopy(canopies, block, blockSize, roadWidth);
    }
    addAlleyCanopy(canopies, block, blockSize);
    addStalls(stalls, colliders, block, blockSize, random);
  }

  return { canopies, stalls, colliders };
}

/**
 * 두 시장 구역 사이 도로를 가로질러 천막을 건다.
 *
 * 이웃이 시장일 때만 건다. 시장과 번화가 사이에 걸면 천막이 **어디서 끝나는지
 * 알 수 없는 채로** 큰길 위에 떠 있게 된다.
 */
function addCanopy(
  canopies: BoxInstance[],
  block: MarketBlock,
  blockSize: number,
  roadWidth: number,
): void {
  // 도로 중심은 구역 경계에서 도로 반 폭만큼 더 간 자리다
  const roadX = block.cx + blockSize / 2 + roadWidth / 2;
  const span = roadWidth + CANOPY.overhang * 2;
  const half = blockSize / 2;

  let index = 0;
  for (let z = -half + CANOPY.step / 2; z < half; z += CANOPY.step) {
    canopies.push({
      x: roadX,
      y: CANOPY.height,
      z: block.cz + z,
      width: span,
      height: CANOPY.thickness,
      depth: CANOPY.depth,
      // 두 색을 번갈아 — 한 색이면 천막이 아니라 콘크리트 슬래브로 보인다
      tone: index % 2 === 0 ? TONE.canopyWarm : TONE.canopyCool,
      blockIndex: block.blockIndex,
    });
    index += 1;
  }
  // 충돌체를 만들지 않는다 — 머리 위 6.4m라 닿지 않고, 막으면 도로가 끊긴다
}

/**
 * 구역 **안쪽** 골목을 덮는 천막.
 *
 * 도로 위 천막(`addCanopy`)만으로는 큰길만 덮인다. 골목으로 한 발 들어서면
 * 하늘이 열려 있어서 「천막 아래로 골목이 이어진다」는 부제가 거짓이 된다.
 *
 * 지붕 위로 얹는다. 필지 사이 골목은 1~2m라 그 틈에 맞춰 걸 수가 없고,
 * 맞춰 걸어도 건물이 4~8m로 제각각이라 낮은 쪽에서는 천막이 지붕에 파묻힌다.
 * 제일 높은 지붕 위에 슬래트처럼 걸면, 골목에서 올려다볼 때 그 사이로 하늘이
 * 줄무늬로 보인다 — 재래시장 아케이드가 실제로 그렇다.
 */
function addAlleyCanopy(canopies: BoxInstance[], block: MarketBlock, blockSize: number): void {
  const tallest = block.buildings.reduce((high, building) => Math.max(high, building.height), 0);
  if (tallest <= 0) return;

  const y = tallest + CANOPY.roofClear;
  const half = blockSize / 2;
  // 구역 밖으로 조금 내밀어야 가장자리 골목도 덮인다
  const span = blockSize + 2;

  let index = 0;
  for (let z = -half + CANOPY.step / 2; z < half; z += CANOPY.step) {
    canopies.push({
      x: block.cx,
      y,
      z: block.cz + z,
      width: span,
      height: CANOPY.thickness,
      depth: CANOPY.depth,
      // 도로 천막과 같은 두 색을 번갈아 — 같은 시장의 같은 천막이다
      tone: index % 2 === 0 ? TONE.canopyWarm : TONE.canopyCool,
      blockIndex: block.blockIndex,
    });
    index += 1;
  }
}

/** 구역 네 변을 따라 좌판을 늘어놓는다. */
function addStalls(
  stalls: BoxInstance[],
  colliders: Aabb[],
  block: MarketBlock,
  blockSize: number,
  random: () => number,
): void {
  const half = blockSize / 2;

  for (const side of [-1, 1]) {
    for (let along = -half + STALL.step; along < half - STALL.step; along += STALL.step) {
      // 네 변 — 남북 변은 x를 따라, 동서 변은 z를 따라 늘어선다
      pushStall(
        stalls,
        colliders,
        block,
        block.cx + along,
        block.cz + side * STALL.inset,
        false,
        random,
      );
      pushStall(
        stalls,
        colliders,
        block,
        block.cx + side * STALL.inset,
        block.cz + along,
        true,
        random,
      );
    }
  }
}

/**
 * 좌판 하나 — 상판, 기둥 둘, 차양, 그리고 쌓인 물건.
 *
 * 물건이 없으면 빈 탁자다. 상판 위에 작은 상자 하나만 얹어도 **팔 것이 있는
 * 좌판**으로 읽힌다.
 */
function pushStall(
  stalls: BoxInstance[],
  colliders: Aabb[],
  block: MarketBlock,
  x: number,
  z: number,
  turned: boolean,
  random: () => number,
): void {
  const width = turned ? STALL.tableDepth : STALL.tableWidth;
  const depth = turned ? STALL.tableWidth : STALL.tableDepth;

  /*
   * 벽을 파고들면 좌판이 건물 안에서 튀어나온 것처럼 보인다. 그 구역 건물만
   * 본다 — 건물은 자기 구역을 벗어나지 않는다.
   */
  const clash = block.buildings.some(
    (building) =>
      Math.abs(x - building.x) < building.width / 2 + width / 2 + STALL.wallMargin &&
      Math.abs(z - building.z) < building.depth / 2 + depth / 2 + STALL.wallMargin,
  );
  if (clash) return;

  // 자리를 조금 비워 둔다. 빈틈없이 늘어서면 시장이 아니라 울타리가 된다
  if (random() < 0.22) return;

  stalls.push({
    x,
    y: STALL.tableHeight / 2,
    z,
    width,
    height: STALL.tableHeight,
    depth,
    tone: TONE.wood,
    blockIndex: block.blockIndex,
    sink: 0.35,
  });

  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    top: terrainHeight(x, z) + STALL.tableHeight,
  });

  // 상판 위 물건 — 작게 두 무더기
  for (const offset of [-0.3, 0.32]) {
    const size = 0.34 + random() * 0.22;
    stalls.push({
      x: x + (turned ? 0 : offset),
      y: STALL.tableHeight + size / 2,
      z: z + (turned ? offset : 0),
      width: size,
      height: size,
      depth: size,
      tone: TONE.goods,
      blockIndex: block.blockIndex,
    });
  }

  // 차양을 받치는 기둥 둘 — 좌판 양 끝
  for (const end of [-1, 1]) {
    stalls.push({
      x: x + (turned ? 0 : (end * STALL.tableWidth) / 2),
      y: STALL.awningHeight / 2,
      z: z + (turned ? (end * STALL.tableWidth) / 2 : 0),
      width: STALL.postWidth,
      height: STALL.awningHeight,
      depth: STALL.postWidth,
      tone: TONE.metal,
      blockIndex: block.blockIndex,
    });
  }

  stalls.push({
    x,
    y: STALL.awningHeight,
    z,
    width: width + 0.5,
    height: STALL.awningThickness,
    depth: depth + 0.5,
    tone: random() < 0.5 ? TONE.canopyWarm : TONE.canopyCool,
    blockIndex: block.blockIndex,
  });
}
