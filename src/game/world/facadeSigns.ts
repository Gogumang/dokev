/**
 * 건물 정면에 붙는 글자판 — 가로·세로 간판과 현수막.
 *
 * 「한국 거리처럼 보이는가」의 가장 큰 몫이 여기 있다. 도시를 한 판 만들어 세어
 * 보니 간판이 건물당 1.31개였는데, 실제 한국 상가 거리는 **한 정면에 네댓 개가
 * 세로로 쌓여 있다** — 층마다 다른 가게가 들어차 있기 때문이다.
 *
 * `cityDetails.ts`가 800줄 상한에 닿아 따로 뺐다. 상한이 또 한 번 쪼갤 자리를
 * 먼저 알려 준 셈이다.
 */

import { BANNER_TEXTS, SHOP_BRANDS } from "@/game/world/cityContent";

import type { CityDetails } from "@/game/world/cityDetails";
import type { BoxInstance } from "@/game/world/cityLayout";

/**
 * 한 층의 높이(m).
 *
 * 파사드 텍스처가 그리는 층 띠와 **같은 값이어야** 간판이 층 사이에 정확히
 * 앉는다. 다르면 창을 반쯤 가린 채 걸린다.
 */
const FLOOR_HEIGHT = 3.2;
/** 위층에 간판이 붙을 확률. 낮게 둬야 벽이 남는다 */
const UPPER_SIGN_CHANCE = 0.22;
/** 한 건물에 붙는 위층 간판의 최대 수 */
const MAX_UPPER_SIGNS = 1;
/** 세로 간판이 붙을 확률 */
const VERTICAL_SIGN_CHANCE = 0.34;

const HORIZONTAL_SIGN_Y = 4.3;
const HORIZONTAL_SIGN_HEIGHT = 1.5;
/** 2층 이상 간판의 높이(m). 1층 것보다 작다 — 실제로도 그렇다 */
const UPPER_SIGN_HEIGHT = 1.05;
/** 꼭대기에서 이만큼은 비운다. 옥상 난간을 뚫고 올라가면 안 된다 */
const SIGN_TOP_MARGIN = 1.6;
const BANNER_Y = 6.05;
const VERTICAL_SIGN_BOTTOM = 5.4;
const VERTICAL_SIGN_MAX_HEIGHT = 8;
/** 세로 간판이 벽에서 튀어나오는 길이 */
const VERTICAL_SIGN_REACH = 1.2;
/** 벽면에서 살짝 띄우는 값. 정확히 붙이면 z-fighting이 난다 */
const WALL_CLEARANCE = 0.08;

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
 * 간판.
 *
 * 세로 간판이 한국 거리 풍경의 가장 강한 신호다. 벽에서 직각으로 튀어나와
 * 골목을 지날 때 옆으로 빠르게 흘러가면서 속도감까지 만들어 준다. 그래서
 * 글자가 보이는 넓은 면이 벽과 **수직**이어야 한다 — 폭을 얇게, 깊이를 길게 준다.
 */
export function addSigns(
  details: CityDetails,
  building: BoxInstance,
  sides: readonly number[],
  random: () => number,
): void {
  const front = sides[0];
  const brand = Math.floor(random() * SHOP_BRANDS.length);

  /*
   * 가로 간판 — 차양 위, 벽에 밀착. **층마다 하나씩 쌓는다.**
   *
   * 오래 한 높이(4.3m)에 하나뿐이었다. 도시를 한 판 만들어 세어 보니 건물당
   * 1.31개였는데, 실제 한국 상가 거리는 **한 건물 정면에 네댓 개가 세로로
   * 쌓여 있다** — 층마다 다른 가게가 들어차 있기 때문이다. 이 밀도 차이가
   * 「한국 거리처럼 안 보인다」의 가장 큰 몫이었다.
   *
   * 층은 텍스처가 그리는 층과 같은 높이를 쓴다. 다른 값을 쓰면 간판이 창을
   * 반쯤 가린 채 층 사이에 걸린다.
   */
  const faceWidth = sideWidth(building, front);
  const horizontal = wallPoint(building, front, WALL_CLEARANCE + 0.16);
  const topLimit = building.height - SIGN_TOP_MARGIN;

  /*
   * 층마다 간판을 달지 않는다.
   *
   * 예전에는 1층부터 꼭대기까지 전부 달았다. 잡거빌딩의 모습이라 근거는
   * 있었지만, 20m 건물에 다섯 장이 세로로 쌓이면서 **벽이 통째로 간판이
   * 됐다** — 건물이 이상해 보이는 큰 몫이 이것이었다. 참고하는 트레일러의
   * 건물은 벽이 깨끗하고 간판은 1층 언저리에 하나씩이다.
   *
   * 1층 간판은 늘 달고, 위층은 가끔만 — 그것도 한 장까지만 붙인다.
   */
  let upperSigns = 0;

  for (let y = HORIZONTAL_SIGN_Y; y <= topLimit; y += FLOOR_HEIGHT) {
    const isUpper = y > HORIZONTAL_SIGN_Y;
    if (isUpper) {
      if (upperSigns >= MAX_UPPER_SIGNS) break;
      if (random() > UPPER_SIGN_CHANCE) continue;
      upperSigns += 1;
    }

    details.signsHorizontal.push({
      x: horizontal.x,
      y,
      z: horizontal.z,
      // 위층으로 갈수록 살짝 좁아진다 — 다 같은 폭이면 줄무늬처럼 보인다
      width: faceWidth * (y > HORIZONTAL_SIGN_Y ? 0.7 : 0.84),
      height: y > HORIZONTAL_SIGN_Y ? UPPER_SIGN_HEIGHT : HORIZONTAL_SIGN_HEIGHT,
      depth: 0.32,
      tone: 0,
      blockIndex: building.blockIndex,
      rotationY: horizontal.angle,
      // 층마다 다른 업종 — 같은 간판이 세로로 반복되면 무늬가 된다
      cell: y > HORIZONTAL_SIGN_Y ? Math.floor(random() * SHOP_BRANDS.length) : brand,
    });
  }

  // 세로 간판 — 건물이 충분히 높고, 그중 일부에만
  const available = building.height - VERTICAL_SIGN_BOTTOM - 0.6;
  if (available < 3) return;
  if (random() > VERTICAL_SIGN_CHANCE) return;

  const height = Math.min(available, VERTICAL_SIGN_MAX_HEIGHT);
  const verticalSide = sides[sides.length - 1];
  const vertical = wallPoint(building, verticalSide, VERTICAL_SIGN_REACH / 2 + WALL_CLEARANCE);

  details.signsVertical.push({
    x: vertical.x,
    y: VERTICAL_SIGN_BOTTOM + height / 2,
    z: vertical.z,
    width: 0.3,
    height,
    depth: VERTICAL_SIGN_REACH,
    tone: 0,
    blockIndex: building.blockIndex,
    rotationY: vertical.angle,
    // 세로 간판은 다른 업종으로 — 한 건물에 여러 가게가 들어찬 잡거빌딩이 정상이다.
    cell: Math.floor(random() * SHOP_BRANDS.length),
  });
}

/** 현수막 — 개업·모집 문구. 전부 걸면 시끄러워서 일부 건물에만 건다. */
export function addBanner(
  details: CityDetails,
  building: BoxInstance,
  sides: readonly number[],
  random: () => number,
): void {
  if (random() > 0.28) return;
  if (building.height < BANNER_Y + 1.4) return;

  const side = sides[0];
  const width = sideWidth(building, side) * 0.9;
  if (width < 2.4) return;

  const { x, z, angle } = wallPoint(building, side, WALL_CLEARANCE + 0.24);
  details.banners.push({
    x,
    y: BANNER_Y,
    z,
    width,
    height: 0.9,
    depth: 0.06,
    tone: 0,
    blockIndex: building.blockIndex,
    rotationY: angle,
    cell: Math.floor(random() * BANNER_TEXTS.length),
  });
}
