/**
 * 도시 디테일 레이어 — 절차적 생성.
 *
 * 「한국 도시」라는 인상은 건물 형태가 아니라 **소품 밀도**에서 나온다.
 * 글자가 적힌 간판, 차양, 1층 유리, 옥상 물탱크와 실외기, 전깃줄, 갓길 주차.
 * 이것들이 없으면 아무리 건물을 잘 만들어도 어느 나라인지 알 수 없는 상자 도시다.
 *
 * 전부 인스턴싱 가능한 박스로 만들어 드로우콜을 레이어 수만큼만 쓴다.
 * GLB를 한 개도 내려받지 않으면서 밀도를 만드는 것이 이 모듈의 목적이다.
 *
 * 이 파일은 **건물에 붙는 것**을 담당한다. 인도 위에 서는 소품(자판기, 정류장,
 * 포장마차 등)은 streetProps.ts에 있다.
 */

import { createSeededRandom } from "@/game/core/mathx";
import { AWNING_STRIPE_METERS, PROP_CELL_INDEX, SHOP_BRANDS } from "@/game/world/cityContent";
import { blockCenter, CITY, type BoxInstance, type CityLayout } from "@/game/world/cityLayout";
import { addBanner, addSigns } from "@/game/world/facadeSigns";
import { addPowerLines } from "@/game/world/powerLines";
import { addStreetExtras } from "@/game/world/streetExtras";
import { buildDrainCovers, buildRoadLanes } from "@/game/world/streetGround";
import { addStreetProps } from "@/game/world/streetProps";
import { buildVehicleStands, type VehicleStand } from "@/game/world/vehicleStands";
import { blockIndexFromPosition } from "@/game/world/streaming";
import { addStreetTrees, addZoneTrees, createTreePlanter } from "@/game/world/trees";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";

export const CAR_PALETTE = [
  "#e8e6e1",
  "#2c2f38",
  "#8f9499",
  "#3a5a8c",
  "#8c3a3a",
  "#4a6b4a",
] as const;

/**
 * 텍스처 아틀라스와 기울기를 쓰는 인스턴스.
 *
 * BoxInstance는 y축 회전만 표현한다. 차양처럼 벽에서 꺾여 내려오는 것과
 * 에어간판처럼 휘는 것은 한 축이 더 필요해서 여기서 확장한다.
 * 세 값 모두 선택이라 BoxInstance를 그대로 넣어도 된다.
 */
export interface DetailInstance extends BoxInstance {
  /** 로컬 x축 기울기(rad). rotationY보다 **먼저** 적용된다 (YXZ 순서) */
  tiltX?: number;
  /** 로컬 z축 기울기(rad) */
  tiltZ?: number;
  /** 아틀라스 셀 인덱스. 없으면 0번 셀 */
  cell?: number;
  /** UV 가로 반복 횟수. 줄무늬 차양처럼 폭에 따라 무늬 수가 달라져야 할 때 쓴다 */
  uvRepeatX?: number;
}

/**
 * streetFixtures 팔레트 인덱스.
 *
 * 색 값 자체는 렌더 쪽(City.tsx의 FIXTURE_PALETTE)이 갖는다 — 배치 데이터에 색을
 * 박으면 노을 톤을 조정할 때 배치 코드를 고쳐야 한다. 순서가 팔레트 배열 순서와
 * 반드시 일치해야 한다.
 */
export const FIXTURE_TONE = {
  darkMetal: 0,
  lightMetal: 1,
  plasticGreen: 2,
  cone: 3,
  wood: 4,
  /*
   * `tentOrange`(5)가 여기 있었다. 팔레트에 색까지 있었지만 **아무도 쓰지
   * 않았다** — 도시를 한 판 만들어 1035개 소품의 tone을 세어 보니 5만 빠져
   * 있었다. 포장마차 천막은 이 팔레트가 아니라 차양 팔레트를 쓴다.
   *
   * 지우면서 뒤 항목을 당겼다. 숫자를 직접 쓰는 곳은 없고(전부
   * `FIXTURE_TONE.이름`), 두 파일의 순서 일치는 `constantPairs`가 지킨다.
   */
  airDancerWarm: 5,
  airDancerCool: 6,
  concrete: 7,
  foliage: 8,
} as const;

/** 바닥에 눕는 평판의 색. 중앙선은 `yellow`, 차선은 `white`, 배수구·맨홀은 `darkMetal` */
export const ROAD_MARK_TONE = {
  white: 0,
  yellow: 1,
  darkMetal: 2,
  /** 자전거도로 포장 — 한국 갓길의 붉은 띠 */
  bikeRed: 3,
  /** 버스전용차로 경계선 */
  busBlue: 4,
} as const;

/** 건물 차양이 고를 수 있는 색 개수. City.tsx의 AWNING_PALETTE 길이와 맞춘다 */
const BUILDING_AWNING_TONES = 5;

export interface CityDetails {
  /** 1층 상가 — 건물 아랫부분을 감싸는 밝은 띠 */
  shopfronts: BoxInstance[];
  /** 옥상 물탱크·실외기·난간 */
  rooftops: BoxInstance[];
  /** 차선·중앙선·정지선 */
  roadMarks: DetailInstance[];
  /** 갓길 주차 차량 — 본체와 캐빈을 따로 둔다 */
  carBodies: BoxInstance[];
  carCabins: BoxInstance[];
  /** 가로수 */
  treeTrunks: BoxInstance[];
  /** 둥근 수관 — 활엽수 덩어리와 야자 잎이 함께 들어간다 (같은 도형이라 한 묶음) */
  treeCrowns: BoxInstance[];
  /**
   * 원뿔 수관 — 침엽수.
   *
   * `treeCrowns`와 나누는 이유는 색이 아니라 **도형**이다. 인스턴스 하나의
   * 모양은 묶음마다 하나뿐이라, 원뿔을 섞으려면 묶음을 갈라야 한다.
   * 드로우콜이 하나 늘고, 숲의 실루엣을 얻는다.
   */
  treeCones: BoxInstance[];
  /** 전깃줄 정점. LineSegments에 그대로 넘긴다 */
  wireVertices: number[];
  /**
   * 인도·갓길에 눕는 평판 — 점자블록, 빗물받이, 맨홀 뚜껑.
   *
   * `roadMarks`와 색 팔레트는 같지만 **따로 둔다.** 저쪽은 도로 축을 따라 나
   * 있어 구역으로 나눌 수 없어 항상 전부 그리는데, 이것은 구역마다 깔려 있어
   * 가까운 것만 그리면 된다.
   */
  groundPlates: DetailInstance[];
  /** 벽면 가로 간판 + 인도 입간판 (같은 아틀라스라 한 묶음) */
  signsHorizontal: DetailInstance[];
  /** 벽에서 직각으로 튀어나온 세로 간판 */
  signsVertical: DetailInstance[];
  /** 현수막 */
  banners: DetailInstance[];
  /** 차양(어닝) + 포장마차 천막 */
  awnings: DetailInstance[];
  /** 1층 상가 유리 */
  shopGlass: DetailInstance[];
  /**
   * 자판기 위치. 상호작용(음료 뽑기)이 읽는다.
   *
   * 렌더용 상자와 따로 두지 않고 **같은 코드에서 함께 채운다** — 위치를
   * 두 번 계산하면 어긋난다 (도로 좌표가 그렇게 어긋난 적이 있다).
   */
  vendingMachines: { x: number; z: number }[];
  /**
   * 거리에 세워진 공유 탈것. 화면에 그리는 것과 **탈 수 있는지 재는 것**이
   * 같은 목록을 본다 — 따로 두면 보이는 자리와 타지는 자리가 어긋난다.
   */
  vehicleStands: VehicleStand[];
  /** 아틀라스 패널 — 자판기 앞면, 실외기 그릴, 노선도, 셔터 */
  propPanels: DetailInstance[];
  /** 거리 소품 몸통 — 쓰레기통, 화분, 콘, 정류장 기둥, 에어간판 */
  streetFixtures: DetailInstance[];
}

const DETAIL_SEED = 71023;
const blockPitch = CITY.blockSize + CITY.roadWidth;

/** 도로 중심선 쪽 인도 바깥 경계까지의 거리 */
export const SIDEWALK_EDGE = CITY.blockSize / 2 + 1.0;

/* ------------------------------------------------------------------ *
 * 1층 높이 배치
 *
 * 아래 상수들이 서로 겹치면 z-fighting과 "간판이 차양을 뚫는" 그림이 나온다.
 * 유리(0.85~2.85) → 차양(3.15) → 가로 간판(3.55~5.05) → 현수막(5.6~6.5) →
 * 세로 간판(5.4~) 순서로 쌓이도록 한 곳에 모아 둔다.
 * ------------------------------------------------------------------ */
const SHOPFRONT_HEIGHT = 3.4;
const GLASS_BOTTOM = 0.85;
const GLASS_HEIGHT = 2.0;
const AWNING_Y = 3.15;
const AWNING_DEPTH = 1.5;
/** 차양이 처지는 각도. 수평이면 널빤지처럼 보인다 */
const AWNING_TILT = 0.24;


/** 벽면에서 살짝 띄우는 값. 정확히 붙이면 z-fighting이 난다 */
const WALL_CLEARANCE = 0.08;
/** 1층 상가 띠가 건물보다 튀어나온 정도의 절반 */
const SHOPFRONT_OVERHANG = 0.25;


/** 면 인덱스를 바깥 방향 각도로. 0=+Z, 1=+X, 2=-Z, 3=-X */
function sideAngle(side: number): number {
  return (side * Math.PI) / 2;
}

/** 그 면이 벽에서 바깥으로 나가야 하는 거리(건물 반쪽) */
function sideHalfDepth(building: BoxInstance, side: number): number {
  return (side % 2 === 0 ? building.depth : building.width) / 2;
}

/** 그 면의 가로 폭 */
function sideWidth(building: BoxInstance, side: number): number {
  return side % 2 === 0 ? building.width : building.depth;
}

/**
 * 길을 향한 면을 고른다.
 *
 * 예전에는 간판 면을 무작위로 골랐다. 그러면 절반은 건물 사이 틈으로 향해
 * 영영 보이지 않는다. 구역 중심에서 바깥쪽으로 향한 면을 고르면 같은 인스턴스
 * 수로 화면에 보이는 간판이 두 배가 된다.
 */
function streetFacingSides(building: BoxInstance): number[] {
  const { cx, cz } = blockCenter(building.blockIndex);
  const dx = building.x - cx;
  const dz = building.z - cz;

  const sideX = dx >= 0 ? 1 : 3;
  const sideZ = dz >= 0 ? 0 : 2;

  // 구역 정중앙 건물은 어느 쪽도 길에 붙지 않는다 — 한 면만 쓴다.
  if (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5) return [sideZ];

  const primary = Math.abs(dx) > Math.abs(dz) ? sideX : sideZ;
  const secondary = primary === sideX ? sideZ : sideX;

  // 모서리 필지만 두 면을 쓴다. 안쪽 필지까지 두 면을 주면 인스턴스만 늘고 안 보인다.
  const useSecondary = Math.min(Math.abs(dx), Math.abs(dz)) > CITY.blockSize * 0.12;
  return useSecondary ? [primary, secondary] : [primary];
}

/** 벽면에 붙는 요소의 월드 좌표. reach만큼 더 띄운다. */
function wallPoint(
  building: BoxInstance,
  side: number,
  reach: number,
): { x: number; z: number; angle: number } {
  const angle = sideAngle(side);
  const offset = sideHalfDepth(building, side) + reach;
  return {
    x: building.x + Math.sin(angle) * offset,
    z: building.z + Math.cos(angle) * offset,
    angle,
  };
}

/**
 * 1층 상가.
 *
 * 건물보다 살짝 튀어나오게 만든다. 한국 상가 건물의 1층은 대개 유리와 간판으로
 * 위층과 완전히 다른 표정을 갖는데, 이 띠 하나로 그 인상이 생긴다.
 */
function addShopfront(details: CityDetails, building: BoxInstance): void {
  details.shopfronts.push({
    x: building.x,
    y: SHOPFRONT_HEIGHT / 2,
    z: building.z,
    width: building.width + SHOPFRONT_OVERHANG * 2,
    height: SHOPFRONT_HEIGHT,
    depth: building.depth + SHOPFRONT_OVERHANG * 2,
    tone: 0,
    blockIndex: building.blockIndex,
  });
}

/**
 * 1층 유리와 출입문.
 *
 * 노을을 반사하는 밝은 면 하나가 "상가"와 "콘크리트 상자"를 가른다.
 * 일부는 셔터를 내린다 — 골목의 점포가 전부 영업 중이면 오히려 거짓말이 된다.
 */
function addShopGlass(
  details: CityDetails,
  building: BoxInstance,
  sides: readonly number[],
  random: () => number,
): void {
  const reach = SHOPFRONT_OVERHANG + WALL_CLEARANCE;

  for (const side of sides) {
    const { x, z, angle } = wallPoint(building, side, reach);
    const width = sideWidth(building, side) * 0.78;
    if (width < 1.2) continue;

    const isShuttered = random() < 0.18;
    const target = isShuttered ? details.propPanels : details.shopGlass;
    target.push({
      x,
      y: GLASS_BOTTOM + GLASS_HEIGHT / 2,
      z,
      width,
      height: GLASS_HEIGHT,
      depth: 0.12,
      tone: Math.floor(random() * 3),
      blockIndex: building.blockIndex,
      rotationY: angle,
      cell: isShuttered ? PROP_CELL_INDEX.shutter : undefined,
      uvRepeatX: isShuttered ? undefined : Math.max(1, Math.round(width / 1.6)),
    });
  }

  // 출입문은 대표 면 하나에만 둔다. 면마다 문을 달면 상가가 아니라 미로가 된다.
  const front = sides[0];
  const door = wallPoint(building, front, reach + 0.02);
  details.propPanels.push({
    x: door.x,
    y: 1.1,
    z: door.z,
    width: 1.15,
    height: 2.2,
    depth: 0.1,
    tone: 0,
    blockIndex: building.blockIndex,
    rotationY: door.angle,
    cell: PROP_CELL_INDEX.storeDoor,
  });
}

/**
 * 차양(어닝).
 *
 * 1층 유리 위에 줄무늬 천을 비스듬히 건다. 줄무늬 수를 폭에 비례시켜야
 * 좁은 가게와 넓은 가게의 줄 굵기가 같아진다 — uvRepeatX가 그 역할이다.
 */
function addAwning(
  details: CityDetails,
  building: BoxInstance,
  sides: readonly number[],
  random: () => number,
): void {
  for (const side of sides) {
    if (random() < 0.35) continue;

    const width = sideWidth(building, side) * 0.8;
    if (width < 1.6) continue;

    const reach = SHOPFRONT_OVERHANG + (AWNING_DEPTH / 2) * Math.cos(AWNING_TILT);
    const { x, z, angle } = wallPoint(building, side, reach);

    details.awnings.push({
      x,
      y: AWNING_Y,
      z,
      width,
      height: 0.12,
      depth: AWNING_DEPTH,
      tone: Math.floor(random() * BUILDING_AWNING_TONES),
      blockIndex: building.blockIndex,
      rotationY: angle,
      tiltX: AWNING_TILT,
      uvRepeatX: Math.max(2, Math.round(width / AWNING_STRIPE_METERS)),
    });
  }
}

/** 벽에 붙은 실외기 — 한국 건물 외벽의 회색 상자. 높이를 흩어야 자연스럽다. */
function addWallAcUnits(
  details: CityDetails,
  building: BoxInstance,
  sides: readonly number[],
  random: () => number,
): void {
  const count = 1 + Math.floor(random() * 3);
  const topLimit = building.height - 1.2;
  if (topLimit < SHOPFRONT_HEIGHT + 1) return;

  for (let i = 0; i < count; i += 1) {
    const side = sides[Math.floor(random() * sides.length)];
    const faceWidth = sideWidth(building, side);
    const angle = sideAngle(side);
    const offset = sideHalfDepth(building, side) + 0.24;
    // 면을 따라 좌우로 흩는다. 정중앙에만 붙이면 격자처럼 보인다.
    const lateral = (random() - 0.5) * Math.max(0, faceWidth - 1.4);

    details.propPanels.push({
      x: building.x + Math.sin(angle) * offset + Math.cos(angle) * lateral,
      y: SHOPFRONT_HEIGHT + 1 + random() * (topLimit - SHOPFRONT_HEIGHT - 1),
      z: building.z + Math.cos(angle) * offset - Math.sin(angle) * lateral,
      width: 0.95,
      height: 0.7,
      depth: 0.44,
      tone: 0,
      blockIndex: building.blockIndex,
      rotationY: angle,
      cell: PROP_CELL_INDEX.acGrill,
    });
  }
}

/** 옥상 — 난간, 물탱크, 실외기. 위에서 내려다보는 각도가 생기면 바로 티가 난다. */
function addRooftop(details: CityDetails, building: BoxInstance, random: () => number): void {
  const top = building.height;

  details.rooftops.push({
    x: building.x,
    y: top + 0.45,
    z: building.z,
    width: building.width + 0.3,
    height: 0.9,
    depth: building.depth + 0.3,
    tone: 2,
    blockIndex: building.blockIndex,
  });

  if (random() < 0.55) {
    const size = 1.6 + random() * 0.8;
    details.rooftops.push({
      x: building.x + (random() - 0.5) * Math.max(0, building.width - size - 1),
      y: top + size / 2 + 0.2,
      z: building.z + (random() - 0.5) * Math.max(0, building.depth - size - 1),
      width: size,
      height: size,
      depth: size,
      tone: 0,
      blockIndex: building.blockIndex,
    });
  }

  const unitCount = Math.floor(random() * 3);
  for (let i = 0; i < unitCount; i += 1) {
    details.rooftops.push({
      x: building.x + (random() - 0.5) * Math.max(0, building.width - 2),
      y: top + 0.55,
      z: building.z + (random() - 0.5) * Math.max(0, building.depth - 2),
      width: 0.9,
      height: 0.7,
      depth: 0.6,
      tone: 1,
      blockIndex: building.blockIndex,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 노면 표시
 * ------------------------------------------------------------------ */

const MARK_Y = 0.025;
const MARK_THICKNESS = 0.04;
/** 중앙 황색 실선 두 줄 사이 간격의 절반 */
const CENTER_LINE_GAP = 0.18;
const CENTER_LINE_WIDTH = 0.16;
const LANE_LINE_WIDTH = 0.14;
/** 차선(점선)이 중앙선에서 떨어진 거리 */
const LANE_LINE_OFFSET = 3.4;
const DASH_LENGTH = 2.4;
const DASH_GAP = 3.2;

/** 도로 축(중심선) 좌표들. 세로·가로 도로 모두 같은 값을 쓴다. */
function roadAxes(halfExtent: number): number[] {
  const offset = (CITY.gridSize - 1) / 2;
  const roadCenterFromBlock = CITY.blockSize / 2 + CITY.roadWidth / 2;
  const axes: number[] = [];

  for (let g = 0; g < CITY.gridSize; g += 1) {
    const axis = (g - offset) * blockPitch + roadCenterFromBlock;
    if (Math.abs(axis) <= halfExtent) axes.push(axis);
  }
  return axes;
}

/**
 * 교차로 안쪽인지 판정한다.
 *
 * 교차로를 가로질러 중앙선을 그으면 좌회전 차선이 벽에 막힌 것처럼 보인다.
 * 실제 도로도 교차로에서는 표시가 끊긴다.
 */
function isInsideIntersection(position: number, axes: readonly number[]): boolean {
  const half = CITY.roadWidth / 2 + 1.2;
  return axes.some((axis) => Math.abs(position - axis) < half);
}

function pushMark(
  details: CityDetails,
  x: number,
  z: number,
  width: number,
  depth: number,
  tone: number,
  blockIndex: number,
): void {
  /*
   * 자연 구역에는 긋지 않는다.
   *
   * 숲·해안의 도로는 지면이 잔디·모래로 덮여 **차도가 보이지 않는다**(구역별
   * 지면 분할). 그 위에 중앙선과 정지선만 남으면 풀밭에 형광 띠가 떠 있는
   * 꼴이 된다 — 선돌을 세우고 가로등·소품을 걷어낸 뒤 마지막까지 남은 도시
   * 흔적이 이것이었다.
   *
   * 갈림길을 한 곳에 모은다. 중앙선·차선·정지선이 각각 거르면 하나를 더할 때
   * 조용히 빠진다.
   */
  if (!isUrbanBlock(blockIndexFromPosition(x, z))) return;

  details.roadMarks.push({
    x,
    y: MARK_Y,
    z,
    width,
    height: MARK_THICKNESS,
    depth,
    tone,
    blockIndex,
  });
}

/**
 * 차선·중앙선.
 *
 * 황색 복선(중앙) + 백색 점선(차로 경계)의 조합이 한국 도로의 기본형이다.
 * 중앙선은 짧은 조각을 이어 붙여 교차로에서만 끊는다.
 */
function addRoadMarkings(details: CityDetails, halfExtent: number): void {
  const axes = roadAxes(halfExtent);
  const segment = 4.0;

  axes.forEach((axis, index) => {
    for (let t = -halfExtent; t < halfExtent; t += segment) {
      const center = t + segment / 2;
      if (isInsideIntersection(center, axes)) continue;

      // 중앙 황색 복선
      for (const gap of [-CENTER_LINE_GAP, CENTER_LINE_GAP]) {
        pushMark(details, axis + gap, center, CENTER_LINE_WIDTH, segment, ROAD_MARK_TONE.yellow, index);
        pushMark(details, center, axis + gap, segment, CENTER_LINE_WIDTH, ROAD_MARK_TONE.yellow, index);
      }
    }

    // 백색 점선 — 중앙선 양쪽. 빠르게 지나갈 때 속도를 읽는 눈금이 된다.
    for (let t = -halfExtent; t < halfExtent; t += DASH_LENGTH + DASH_GAP) {
      const center = t + DASH_LENGTH / 2;
      if (isInsideIntersection(center, axes)) continue;

      for (const lane of [-LANE_LINE_OFFSET, LANE_LINE_OFFSET]) {
        pushMark(details, axis + lane, center, LANE_LINE_WIDTH, DASH_LENGTH, ROAD_MARK_TONE.white, index);
        pushMark(details, center, axis + lane, DASH_LENGTH, LANE_LINE_WIDTH, ROAD_MARK_TONE.white, index);
      }
    }
  });
}

/** 정지선 — 교차로 진입부에 굵은 흰 줄. 교차로가 교차로로 읽히게 하는 요소. */
function addStopLines(details: CityDetails, halfExtent: number): void {
  const axes = roadAxes(halfExtent);
  const setback = CITY.roadWidth / 2 + 2.6;
  const lineWidth = 0.45;
  const halfRoad = CITY.roadWidth / 2 - 0.4;

  axes.forEach((axis, index) => {
    for (const cross of axes) {
      for (const direction of [-1, 1]) {
        const along = cross + direction * setback;
        if (Math.abs(along) > halfExtent) continue;

        // 진행 방향 차로(중앙선 한쪽)만 막는다.
        const lateral = (direction > 0 ? 1 : -1) * (halfRoad / 2);
        pushMark(details, axis + lateral, along, halfRoad, lineWidth, ROAD_MARK_TONE.white, index);
        pushMark(details, along, axis - lateral, lineWidth, halfRoad, ROAD_MARK_TONE.white, index);
      }
    }
  });
}

/* ------------------------------------------------------------------ *
 * 갓길 주차 · 가로수 · 전깃줄
 * ------------------------------------------------------------------ */

function pushCar(
  details: CityDetails,
  x: number,
  z: number,
  rotationY: number,
  tone: number,
  blockIndex: number,
): void {
  details.carBodies.push({
    x,
    y: 0.55,
    z,
    width: 1.75,
    height: 0.9,
    depth: 4.2,
    tone,
    blockIndex,
    rotationY,
  });
  details.carCabins.push({
    x,
    y: 1.28,
    z,
    width: 1.6,
    height: 0.62,
    depth: 2.2,
    tone,
    blockIndex,
    rotationY,
  });
}

/** 갓길 주차 — 도시에 생활감을 주는 가장 싼 방법. */
function addParkedCars(details: CityDetails, halfExtent: number, random: () => number): void {
  const offset = (CITY.gridSize - 1) / 2;
  const spacing = 9.5;

  for (let g = 0; g < CITY.gridSize; g += 1) {
    const axis = (g - offset) * blockPitch;

    for (let t = -halfExtent + 8; t < halfExtent - 8; t += spacing) {
      if (random() < 0.45) continue;

      const tone = Math.floor(random() * CAR_PALETTE.length);
      const lane = random() < 0.5 ? 1 : -1;

      pushCar(details, axis + lane * (SIDEWALK_EDGE + 1.6), t, 0, tone, g);
      if (random() < 0.5) {
        pushCar(details, t, axis + lane * (SIDEWALK_EDGE + 1.6), Math.PI / 2, tone, g);
      }
    }
  }
}

export function buildCityDetails(layout: CityLayout): CityDetails {
  const random = createSeededRandom(DETAIL_SEED);

  const details: CityDetails = {
    shopfronts: [],
    rooftops: [],
    roadMarks: [],
    groundPlates: [],
    carBodies: [],
    carCabins: [],
    treeTrunks: [],
    treeCrowns: [],
    treeCones: [],
    wireVertices: [],
    signsHorizontal: [],
    signsVertical: [],
    banners: [],
    awnings: [],
    shopGlass: [],
    propPanels: [],
    streetFixtures: [],
    vendingMachines: [],
    vehicleStands: buildVehicleStands(layout.halfExtent),
  };

  for (const building of layout.buildings) {
    const sides = streetFacingSides(building);

    /*
     * 옛 마을에는 상가를 붙이지 않는다.
     *
     * 1층 유리·차양·간판·현수막·벽걸이 실외기는 전부 **장사하는 거리**의 것이다.
     * 담과 홍살문을 세우고 기와를 얹어 놓고도 그 벽에 줄무늬 차양과 보라색
     * 쇼윈도가 붙어 있으면, 화면은 「기와지붕을 얹은 상가」로 보인다 —
     * 실제로 처음 가 보고 그렇게 보였다.
     *
     * 옥상 물탱크도 뺀다. 기와지붕 위에 물탱크는 얹힐 자리가 없다.
     */
    if (zoneForBlock(building.blockIndex).id === "shrine") continue;

    addShopfront(details, building);
    addShopGlass(details, building, sides, random);
    addAwning(details, building, sides, random);
    addSigns(details, building, sides, random);
    addBanner(details, building, sides, random);
    addWallAcUnits(details, building, sides, random);
    addRooftop(details, building, random);
  }

  addRoadMarkings(details, layout.halfExtent);
  addStopLines(details, layout.halfExtent);
  addParkedCars(details, layout.halfExtent, random);
  /*
   * 가로수와 구역 나무가 **같은 planter를 나눠 쓴다.** 따로 두면 도로변에서
   * 두 갈래가 서로를 모른 채 같은 자리에 심는다.
   */
  const planter = createTreePlanter();
  addStreetTrees(details, layout, SIDEWALK_EDGE, planter, random);
  addZoneTrees(details, layout, planter, random);
  addStreetProps(details, layout.halfExtent, random, SHOP_BRANDS.length);
  addStreetExtras(details, layout.halfExtent, random);
  addPowerLines(details, layout);

  /*
   * `roadMarks`에 이어 붙이지 않는다. 차선은 도로 축을 따라 나 있어 구역으로
   * 나눌 수 없고 그래서 **항상 전부 그린다** — 여기 것을 섞으면 인도 평판
   * 900여 개가 도시 반대편에 서 있을 때도 매 프레임 올라간다.
   *
   * 색 인덱스는 여기서 넘긴다. `streetGround`가 숫자를 직접 알면 팔레트가
   * 밀릴 때 조용히 어긋난다.
   */
  details.groundPlates = [
    ...buildDrainCovers(ROAD_MARK_TONE.darkMetal),
    ...buildRoadLanes(layout.halfExtent, ROAD_MARK_TONE.white),
  ];

  return details;
}
