/**
 * 너른 공원 — 연못, 놀이터, 산책로.
 *
 * 「잔디밭과 놀이터」라는 부제를 붙여 놓고 실제로는 **나무를 촘촘히 심은 빈
 * 벌판**이었다. 필지를 82% 비운 결과라 「건물이 거의 없는 동네」이지 공원이
 * 아니었다.
 *
 * 공원을 공원으로 만드는 것은 **사람이 놓은 것**이다. 잔디와 나무는 숲에도
 * 있다. 미끄럼틀·그네·연못·산책로처럼 「누가 여기 와서 논다」를 말하는 물건이
 * 있어야 숲과 갈린다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다
 * (`zones.ts` 주석). 치수는 인자로 받고 타입만 가져온다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { DetailInstance } from "@/game/world/cityDetails";
import type { BoxInstance } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

export interface ParkBlock {
  blockIndex: number;
  cx: number;
  cz: number;
}

/** 나무를 심으면 안 되는 자리. 배치가 렌더가 아니라 **다른 배치**에게 하는 말이다 */
export interface TreeExclusion {
  x: number;
  z: number;
  radius: number;
}

export interface ParkParts {
  /**
   * 연못 수면.
   *
   * 돌 테두리와 **나눠 둔다.** 색이 아니라 재질이 다르다 — 수면은 물결 무늬가
   * 흐르는 텍스처를 쓰고 테두리는 단색이다. 한 묶음에 두면 렌더가 색 번호로
   * 다시 갈라야 하고, 그러면 `TONE` 상수가 렌더까지 새어 나간다.
   */
  pondWater: BoxInstance[];
  /** 연못 돌 테두리 */
  pondRim: BoxInstance[];
  /**
   * 미끄럼틀·그네·시소·모래밭.
   *
   * `BoxInstance`가 아니라 `DetailInstance`다 — 미끄럼틀과 시소는 **기울어야**
   * 놀이기구로 읽히고, 기울기(`tiltZ`)를 가진 쪽은 이 타입뿐이다. 상자 타입에
   * 캐스팅으로 얹으면 읽는 쪽에서 그 필드가 없는 것으로 보인다(검사가 잡았다).
   */
  playground: DetailInstance[];
  /** 산책로 포석 */
  paths: BoxInstance[];
  colliders: Aabb[];
  /** 연못과 놀이터 자리 — 여기에 나무가 심기면 물 위에 나무가 선다 */
  treeExclusions: TreeExclusion[];
}

/**
 * 연못 수치.
 *
 * 파묻는 깊이가 중요하다. 수면은 **한 장짜리 평면**인데 공원 땅은 기울어 있어서,
 * 파묻지 않으면 낮은 쪽 모서리가 뜨고 그 밑으로 잔디가 비친다. 9m 폭에 경사
 * 20%면 최대 1.8m가 벌어지므로 그만큼 아래로 늘려 둔다.
 */
const POND = {
  size: 9.4,
  /** 수면이 지면에서 올라온 높이(m). 0이면 잔디와 z-파이팅이 난다 */
  lift: 0.06,
  sink: 1.9,
  /** 돌 테두리 폭(m) */
  rimWidth: 0.9,
  rimHeight: 0.42,
} as const;

/**
 * 놀이터 수치.
 *
 * 미끄럼틀 높이 2.6m는 **어린이 주인공의 두 배**다. 더 낮으면 놀이기구로
 * 안 보이고, 더 높으면 이 월드에서 유일하게 사다리로만 오르는 물건이 된다.
 */
const PLAY = {
  sandSize: 11,
  sandHeight: 0.14,
  slideTop: 2.6,
  slideRun: 3.4,
  postWidth: 0.16,
  swingHeight: 2.5,
  swingSpan: 3.2,
  seatHeight: 0.55,
} as const;

/** 산책로 포석 */
const PATH = {
  /** 구역 중심에서 산책로까지(m). 담·건물과 겹치지 않는 안쪽 고리 */
  radius: 13.2,
  tile: 2.1,
  thickness: 0.1,
  /** 포석 사이 간격(m). 딱 붙이면 길이 아니라 판이 된다 */
  step: 2.6,
} as const;

/** 팔레트 인덱스 — 렌더의 `PARK_PALETTE` 순서와 반드시 같아야 한다 */
const TONE = {
  water: 0,
  rim: 1,
  path: 2,
  frame: 3,
  slide: 4,
  wood: 5,
} as const;

/** 공원 구역에 연못·놀이터·산책로를 놓는다. */
export function buildPark(blocks: readonly ParkBlock[]): ParkParts {
  const pondWater: BoxInstance[] = [];
  const pondRim: BoxInstance[] = [];
  const playground: DetailInstance[] = [];
  const paths: BoxInstance[] = [];
  const colliders: Aabb[] = [];
  const treeExclusions: TreeExclusion[] = [];

  for (const block of blocks) {
    /*
     * 연못과 놀이터를 대각으로 갈라 놓는다.
     *
     * 한쪽에 몰면 반대편 절반이 빈 잔디가 되고, 가운데 겹쳐 놓으면 산책로가
     * 지나갈 자리가 없다.
     */
    addPond(pondWater, pondRim, treeExclusions, block, block.cx - 6.5, block.cz - 6.5);
    addPlayground(playground, colliders, treeExclusions, block, block.cx + 6.8, block.cz + 6.8);
    addPathLoop(paths, block);
  }

  return { pondWater, pondRim, playground, paths, colliders, treeExclusions };
}

function addPond(
  water: BoxInstance[],
  rim: BoxInstance[],
  exclusions: TreeExclusion[],
  block: ParkBlock,
  x: number,
  z: number,
): void {
  water.push({
    x,
    y: POND.lift,
    z,
    width: POND.size,
    height: POND.lift * 2,
    depth: POND.size,
    tone: TONE.water,
    blockIndex: block.blockIndex,
    sink: POND.sink,
  });

  /*
   * 돌 테두리 — 네 변.
   *
   * 없으면 수면이 잔디에 **잘라 붙인 파란 사각형**으로 보인다. 테두리가
   * 있으면 「파 놓은 자리」가 되어 연못으로 읽힌다.
   */
  const reach = POND.size / 2 + POND.rimWidth / 2;
  const long = POND.size + POND.rimWidth * 2;

  for (const side of [-1, 1]) {
    rim.push({
      x: x + side * reach,
      y: POND.rimHeight / 2,
      z,
      width: POND.rimWidth,
      height: POND.rimHeight,
      depth: long,
      tone: TONE.rim,
      blockIndex: block.blockIndex,
      sink: 1.2,
    });
    rim.push({
      x,
      y: POND.rimHeight / 2,
      z: z + side * reach,
      width: long,
      height: POND.rimHeight,
      depth: POND.rimWidth,
      tone: TONE.rim,
      blockIndex: block.blockIndex,
      sink: 1.2,
    });
  }

  // 테두리에는 충돌체를 두지 않는다 — 42cm 턱마다 걸리면 뛰어다니기 답답하다
  exclusions.push({ x, z, radius: POND.size / 2 + 2.4 });
}

/** 모래밭 위의 미끄럼틀·그네·시소. */
function addPlayground(
  playground: DetailInstance[],
  colliders: Aabb[],
  exclusions: TreeExclusion[],
  block: ParkBlock,
  x: number,
  z: number,
): void {
  const at = block.blockIndex;

  playground.push({
    x,
    y: PLAY.sandHeight / 2,
    z,
    width: PLAY.sandSize,
    height: PLAY.sandHeight,
    depth: PLAY.sandSize,
    tone: TONE.path,
    blockIndex: at,
    sink: 1.6,
  });

  /* --- 미끄럼틀 --- */
  const slideX = x - 3;
  // 오르는 쪽 기둥 둘
  for (const side of [-1, 1]) {
    pushPost(playground, colliders, at, slideX, z + side * 0.7, PLAY.slideTop);
  }
  // 꼭대기 발판
  playground.push({
    x: slideX,
    y: PLAY.slideTop,
    z,
    width: 1.5,
    height: 0.16,
    depth: 1.8,
    tone: TONE.frame,
    blockIndex: at,
  });
  /*
   * 미끄러지는 판.
   *
   * `tiltZ`로 기울인다 — 기울기 없이 눕히면 발판에서 바닥까지 **계단 없는
   * 절벽**이 되어 놀이기구로 안 읽힌다. 각도는 높이와 길이에서 나온다.
   */
  const slope = Math.atan2(PLAY.slideTop, PLAY.slideRun);
  playground.push({
    x: slideX + PLAY.slideRun / 2,
    y: PLAY.slideTop / 2 + 0.1,
    z,
    width: Math.hypot(PLAY.slideTop, PLAY.slideRun),
    height: 0.14,
    depth: 1.1,
    tone: TONE.slide,
    blockIndex: at,
    tiltZ: -slope,
  });

  /* --- 그네 --- */
  const swingZ = z + 3.4;
  for (const side of [-1, 1]) {
    pushPost(playground, colliders, at, x + (side * PLAY.swingSpan) / 2, swingZ, PLAY.swingHeight);
  }
  playground.push({
    x,
    y: PLAY.swingHeight,
    z: swingZ,
    width: PLAY.swingSpan + PLAY.postWidth * 2,
    height: 0.16,
    depth: PLAY.postWidth * 1.3,
    tone: TONE.frame,
    blockIndex: at,
  });
  // 좌판 둘 — 줄은 그리지 않는다. 얇은 선은 이 거리에서 픽셀 하나라 안 보인다
  for (const offset of [-0.9, 0.9]) {
    playground.push({
      x: x + offset,
      y: PLAY.seatHeight,
      z: swingZ,
      width: 0.62,
      height: 0.1,
      depth: 0.36,
      tone: TONE.wood,
      blockIndex: at,
    });
  }

  /* --- 시소 --- */
  const seesawZ = z - 3.6;
  playground.push({
    x,
    y: 0.42,
    z: seesawZ,
    width: 0.4,
    height: 0.84,
    depth: 0.4,
    tone: TONE.frame,
    blockIndex: at,
  });
  playground.push({
    x,
    y: 0.86,
    z: seesawZ,
    width: 4.2,
    height: 0.14,
    depth: 0.4,
    tone: TONE.wood,
    blockIndex: at,
    tiltZ: 0.16,
  });

  exclusions.push({ x, z, radius: PLAY.sandSize / 2 + 2.2 });
}

function pushPost(
  playground: DetailInstance[],
  colliders: Aabb[],
  blockIndex: number,
  x: number,
  z: number,
  height: number,
): void {
  playground.push({
    x,
    y: height / 2,
    z,
    width: PLAY.postWidth,
    height,
    depth: PLAY.postWidth,
    tone: TONE.frame,
    blockIndex,
    sink: 0.4,
  });

  colliders.push({
    minX: x - PLAY.postWidth / 2,
    maxX: x + PLAY.postWidth / 2,
    minZ: z - PLAY.postWidth / 2,
    maxZ: z + PLAY.postWidth / 2,
    top: terrainHeight(x, z) + height,
  });
}

/**
 * 구역을 한 바퀴 도는 산책로.
 *
 * 포석을 **띄엄띄엄** 놓는다. 딱 붙이면 길이 아니라 회색 판 하나가 되고,
 * 사이가 벌어져야 잔디가 비쳐 「깔아 놓은 길」로 읽힌다.
 */
function addPathLoop(paths: BoxInstance[], block: ParkBlock): void {
  const reach = PATH.radius;

  for (const side of [-1, 1]) {
    for (let along = -reach; along <= reach; along += PATH.step) {
      pushTile(paths, block, block.cx + along, block.cz + side * reach);
      // 모서리는 위 줄이 이미 놓았다 — 다시 놓으면 두 겹으로 짙어진다
      if (Math.abs(along) >= reach - 0.001) continue;
      pushTile(paths, block, block.cx + side * reach, block.cz + along);
    }
  }
}

function pushTile(paths: BoxInstance[], block: ParkBlock, x: number, z: number): void {
  paths.push({
    x,
    y: PATH.thickness / 2,
    z,
    width: PATH.tile,
    height: PATH.thickness,
    depth: PATH.tile,
    tone: TONE.path,
    blockIndex: block.blockIndex,
    // 비탈에서 모서리가 뜨지 않게 파묻는다
    sink: 0.7,
  });
}
