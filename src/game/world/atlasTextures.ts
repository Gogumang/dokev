"use client";

/**
 * 한글 텍스트 아틀라스 — 간판·현수막·소품 패널.
 *
 * 「한국 도시」라는 인상을 만드는 것은 결국 **간판에 적힌 글자**다. 단색 박스
 * 간판과 "김밥천국"이라고 적힌 간판은 같은 폴리곤 수에서 완전히 다른 화면이 된다.
 *
 * 종류마다 텍스처를 따로 만들면 인스턴싱이 깨진다(인스턴스마다 다른 텍스처를
 * 줄 수 없다). 그래서 여러 간판을 **한 장의 아틀라스**에 격자로 그리고, 셀
 * 위치를 인스턴스 속성(UV offset/scale)으로 넘긴다. 간판이 몇 종류든 드로우콜은
 * 아틀라스 수만큼만 늘어난다.
 *
 * 웹폰트를 받지 않는다 — 시스템 한글 폰트만 쓴다. 다운로드 예산도 이유지만,
 * 웹폰트를 쓰면 폰트 로드 전에 캔버스를 그려 글자가 통째로 깨질 수 있다.
 */

import * as THREE from "three";

import {
  BANNER_SCHEMES,
  BANNER_TEXTS,
  PROP_CELL_COUNT,
  PROP_CELL_INDEX,
  SHOP_BRANDS,
  SIGN_SCHEMES,
  type ShopBrand,
  type SignScheme,
} from "@/game/world/cityContent";

/*
 * 셀 인덱스의 정본은 cityContent다. 이 셀을 실제로 그리는 곳이 여기라
 * 아틀라스 쪽에서도 바로 집어 쓸 수 있게 다시 내보낸다.
 */
export { PROP_CELL_INDEX };

const KOREAN_FONT_STACK =
  "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Nanum Gothic', system-ui, sans-serif";

export interface TextureAtlas {
  texture: THREE.CanvasTexture;
  columns: number;
  rows: number;
  /** 실제로 그린 셀 수. 배치 코드가 이 값으로 나머지 연산을 한다 */
  cellCount: number;
}

/** 셀 안쪽 여백(px). 밉맵이 이웃 셀을 물고 들어오는 것을 막는다. */
const CELL_PADDING = 4;

export interface AtlasCellUv {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

/**
 * 셀 인덱스를 UV 변환으로 바꾼다.
 *
 * 캔버스는 위에서 아래로, 텍스처 v는 아래에서 위로 증가한다(flipY 기본값).
 * 그래서 행 번호를 그대로 쓰면 세로가 뒤집힌다 — offsetY를 아래에서부터 센다.
 */
export function atlasCellUv(atlas: TextureAtlas, cell: number): AtlasCellUv {
  const index = ((cell % atlas.cellCount) + atlas.cellCount) % atlas.cellCount;
  const col = index % atlas.columns;
  const row = Math.floor(index / atlas.columns);

  const cellW = atlas.texture.image.width / atlas.columns;
  const cellH = atlas.texture.image.height / atlas.rows;
  const padU = CELL_PADDING / atlas.texture.image.width;
  const padV = CELL_PADDING / atlas.texture.image.height;

  return {
    offsetX: (col * cellW) / atlas.texture.image.width + padU,
    offsetY: 1 - ((row + 1) * cellH) / atlas.texture.image.height + padV,
    scaleX: 1 / atlas.columns - padU * 2,
    scaleY: 1 / atlas.rows - padV * 2,
  };
}

function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") };
}

/**
 * 주어진 상자 안에 들어가는 최대 글자 크기를 찾아 한 줄로 그린다.
 *
 * 이분 탐색 대신 한 번 재고 비율로 줄인다 — 폭은 글자 크기에 거의 선형이라
 * 한 번의 보정으로 충분하고, 캔버스 measureText는 생각보다 비싸다.
 */
function drawFittedLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number,
  color: string,
): void {
  let size = maxHeight;
  ctx.font = `800 ${size}px ${KOREAN_FONT_STACK}`;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth) size = Math.max(6, (size * maxWidth) / measured);

  ctx.font = `800 ${size}px ${KOREAN_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, centerX, centerY);
}

const SIGN_H_COLUMNS = 4;
const SIGN_H_ROWS = 4;
const SIGN_H_CELL_W = 256;
const SIGN_H_CELL_H = 64;

/** 가로 간판 한 칸 — 바탕 + 위아래 띠 + 업종명. */
function drawHorizontalSignCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brand: ShopBrand,
): void {
  const scheme = SIGN_SCHEMES[brand.scheme % SIGN_SCHEMES.length];

  ctx.fillStyle = scheme.bg;
  ctx.fillRect(x, y, SIGN_H_CELL_W, SIGN_H_CELL_H);

  ctx.fillStyle = scheme.trim;
  ctx.fillRect(x, y, SIGN_H_CELL_W, 5);
  ctx.fillRect(x, y + SIGN_H_CELL_H - 5, SIGN_H_CELL_W, 5);
  // 왼쪽 색 블록 — 실제 간판의 로고 자리. 글자만 있는 것보다 훨씬 간판 같다.
  ctx.fillRect(x + 10, y + 14, 12, SIGN_H_CELL_H - 28);

  drawFittedLine(
    ctx,
    brand.long,
    x + SIGN_H_CELL_W / 2 + 8,
    y + SIGN_H_CELL_H / 2,
    SIGN_H_CELL_W - 48,
    SIGN_H_CELL_H - 22,
    scheme.text,
  );
}

const SIGN_V_COLUMNS = 4;
const SIGN_V_ROWS = 4;
const SIGN_V_CELL_W = 64;
const SIGN_V_CELL_H = 256;

/** 세로 간판 한 칸 — 글자를 한 자씩 아래로 쌓는다. */
function drawVerticalSignCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brand: ShopBrand,
): void {
  const scheme = SIGN_SCHEMES[brand.scheme % SIGN_SCHEMES.length];

  ctx.fillStyle = scheme.bg;
  ctx.fillRect(x, y, SIGN_V_CELL_W, SIGN_V_CELL_H);

  ctx.fillStyle = scheme.trim;
  ctx.fillRect(x, y, 4, SIGN_V_CELL_H);
  ctx.fillRect(x + SIGN_V_CELL_W - 4, y, 4, SIGN_V_CELL_H);

  const characters = [...brand.short];
  const top = y + 12;
  const usable = SIGN_V_CELL_H - 24;
  const band = usable / characters.length;

  characters.forEach((character, index) => {
    drawFittedLine(
      ctx,
      character,
      x + SIGN_V_CELL_W / 2,
      top + band * (index + 0.5),
      SIGN_V_CELL_W - 16,
      Math.min(band * 0.88, SIGN_V_CELL_W - 10),
      scheme.text,
    );
  });
}

const BANNER_COLUMNS = 2;
const BANNER_ROWS = 4;
const BANNER_CELL_W = 256;
const BANNER_CELL_H = 64;

/** 현수막 한 칸 — 천 느낌을 주려고 가장자리에 구멍(하도롱) 자국을 찍는다. */
function drawBannerCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  scheme: SignScheme,
): void {
  ctx.fillStyle = scheme.bg;
  ctx.fillRect(x, y, BANNER_CELL_W, BANNER_CELL_H);

  ctx.fillStyle = scheme.trim;
  ctx.fillRect(x, y + 4, BANNER_CELL_W, 3);
  ctx.fillRect(x, y + BANNER_CELL_H - 7, BANNER_CELL_W, 3);

  drawFittedLine(
    ctx,
    text,
    x + BANNER_CELL_W / 2,
    y + BANNER_CELL_H / 2,
    BANNER_CELL_W - 36,
    BANNER_CELL_H - 26,
    scheme.text,
  );

  ctx.fillStyle = "rgba(40, 38, 46, 0.5)";
  for (const cx of [x + 8, x + BANNER_CELL_W - 8]) {
    ctx.beginPath();
    ctx.arc(cx, y + BANNER_CELL_H / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

const PROP_COLUMNS = 4;
const PROP_ROWS = 2;
const PROP_CELL = 128;

/** 자판기 앞면 — 상단 로고 띠 + 진열창 + 배출구. */
function drawVendorCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  body: string,
  label: string,
  itemColors: readonly string[],
): void {
  ctx.fillStyle = body;
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fillRect(x + 6, y + 6, PROP_CELL - 12, 20);
  drawFittedLine(ctx, label, x + PROP_CELL / 2, y + 16, PROP_CELL - 20, 15, "#2a2030");

  // 진열창
  ctx.fillStyle = "#141a24";
  ctx.fillRect(x + 8, y + 32, PROP_CELL - 16, 58);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      ctx.fillStyle = itemColors[(row * 5 + col) % itemColors.length];
      ctx.fillRect(x + 12 + col * 21, y + 36 + row * 19, 15, 15);
    }
  }

  // 배출구와 버튼
  ctx.fillStyle = "#221e2a";
  ctx.fillRect(x + 10, y + 98, PROP_CELL - 44, 22);
  ctx.fillStyle = "#8f95a0";
  ctx.fillRect(x + PROP_CELL - 30, y + 98, 20, 22);
}

/** 실외기 그릴 — 가로 루버와 팬 원. 벽에 붙는 회색 상자의 정체를 만든다. */
function drawAcGrillCell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#a3a3ac";
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);

  ctx.fillStyle = "#8a8a94";
  ctx.fillRect(x + 6, y + 6, PROP_CELL - 12, PROP_CELL - 12);

  ctx.strokeStyle = "#6d6d78";
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i += 1) {
    const ly = y + 16 + i * 12;
    ctx.beginPath();
    ctx.moveTo(x + 12, ly);
    ctx.lineTo(x + PROP_CELL - 12, ly);
    ctx.stroke();
  }

  ctx.strokeStyle = "#5c5c66";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + PROP_CELL / 2, y + PROP_CELL / 2, PROP_CELL * 0.3, 0, Math.PI * 2);
  ctx.stroke();
}

/** 버스 노선도 — 파란 머리띠 + 정류장 점선. 정류장이 정류장으로 읽히는 최소 정보. */
function drawBusRouteCell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#f4f2ea";
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);

  ctx.fillStyle = "#1b4fa0";
  ctx.fillRect(x, y, PROP_CELL, 26);
  drawFittedLine(ctx, "버스정류장", x + PROP_CELL / 2, y + 13, PROP_CELL - 12, 18, "#ffffff");

  const lineColors = ["#0f7a4a", "#1b4fa0", "#d62828"];
  for (let i = 0; i < 3; i += 1) {
    const ly = y + 46 + i * 26;
    ctx.strokeStyle = lineColors[i];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 12, ly);
    ctx.lineTo(x + PROP_CELL - 12, ly);
    ctx.stroke();

    ctx.fillStyle = "#2a2530";
    for (let s = 0; s < 5; s += 1) {
      ctx.beginPath();
      ctx.arc(x + 14 + s * 25, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 편의점 유리문 — 밝은 유리에 스티커. 1층이 "영업 중"으로 보이게 하는 요소. */
function drawStoreDoorCell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const gradient = ctx.createLinearGradient(x, y, x, y + PROP_CELL);
  gradient.addColorStop(0, "#fff0cf");
  gradient.addColorStop(0.55, "#ffd08a");
  gradient.addColorStop(1, "#6b5570");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);

  ctx.fillStyle = "#2f2a38";
  ctx.fillRect(x + PROP_CELL / 2 - 3, y, 6, PROP_CELL);
  ctx.fillRect(x, y, PROP_CELL, 5);
  ctx.fillRect(x, y + PROP_CELL - 5, PROP_CELL, 5);

  ctx.fillStyle = "#d62828";
  ctx.fillRect(x + 10, y + 20, PROP_CELL / 2 - 18, 22);
  drawFittedLine(ctx, "24시", x + PROP_CELL / 4 + 1, y + 31, PROP_CELL / 2 - 24, 17, "#ffffff");
}

/** 셔터 내린 상가 — 골목의 빈 점포. 전부 영업 중이면 오히려 거짓말처럼 보인다. */
function drawShutterCell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#79737f";
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);

  ctx.strokeStyle = "#5f5a68";
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i += 1) {
    const ly = y + 4 + i * 8;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + PROP_CELL, ly);
    ctx.stroke();
  }

  ctx.fillStyle = "#f4f2ea";
  ctx.fillRect(x + 30, y + 44, 68, 30);
  drawFittedLine(ctx, "임대", x + 64, y + 59, 60, 24, "#c62828");
}

/** 동네 게시판 — 반상회·청소 공지. 사람이 사는 동네라는 신호. */
function drawNoticeBoardCell(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#2f5d3f";
  ctx.fillRect(x, y, PROP_CELL, PROP_CELL);
  ctx.fillStyle = "#3c7350";
  ctx.fillRect(x + 6, y + 6, PROP_CELL - 12, PROP_CELL - 12);

  const notes = [
    { x: 12, y: 14, w: 48, h: 40, text: "반상회" },
    { x: 66, y: 20, w: 50, h: 34, text: "청소" },
    { x: 20, y: 66, w: 88, h: 44, text: "재활용 안내" },
  ];
  for (const note of notes) {
    ctx.fillStyle = "#f6f3e6";
    ctx.fillRect(x + note.x, y + note.y, note.w, note.h);
    drawFittedLine(
      ctx,
      note.text,
      x + note.x + note.w / 2,
      y + note.y + note.h / 2,
      note.w - 8,
      Math.min(note.h - 10, 16),
      "#3a3240",
    );
  }
}

type AtlasKind = "shopHorizontal" | "shopVertical" | "banner" | "prop";

function paintShopHorizontal(): TextureAtlas {
  const { canvas, ctx } = createCanvas(SIGN_H_CELL_W * SIGN_H_COLUMNS, SIGN_H_CELL_H * SIGN_H_ROWS);
  const atlas = {
    columns: SIGN_H_COLUMNS,
    rows: SIGN_H_ROWS,
    cellCount: SHOP_BRANDS.length,
  };
  if (!ctx) return { ...atlas, texture: toAtlasTexture(canvas) };

  SHOP_BRANDS.forEach((brand, index) => {
    const col = index % SIGN_H_COLUMNS;
    const row = Math.floor(index / SIGN_H_COLUMNS);
    drawHorizontalSignCell(ctx, col * SIGN_H_CELL_W, row * SIGN_H_CELL_H, brand);
  });

  return { ...atlas, texture: toAtlasTexture(canvas) };
}

function paintShopVertical(): TextureAtlas {
  const { canvas, ctx } = createCanvas(SIGN_V_CELL_W * SIGN_V_COLUMNS, SIGN_V_CELL_H * SIGN_V_ROWS);
  const atlas = {
    columns: SIGN_V_COLUMNS,
    rows: SIGN_V_ROWS,
    cellCount: SHOP_BRANDS.length,
  };
  if (!ctx) return { ...atlas, texture: toAtlasTexture(canvas) };

  SHOP_BRANDS.forEach((brand, index) => {
    const col = index % SIGN_V_COLUMNS;
    const row = Math.floor(index / SIGN_V_COLUMNS);
    drawVerticalSignCell(ctx, col * SIGN_V_CELL_W, row * SIGN_V_CELL_H, brand);
  });

  return { ...atlas, texture: toAtlasTexture(canvas) };
}

function paintBanner(): TextureAtlas {
  const { canvas, ctx } = createCanvas(BANNER_CELL_W * BANNER_COLUMNS, BANNER_CELL_H * BANNER_ROWS);
  const atlas = {
    columns: BANNER_COLUMNS,
    rows: BANNER_ROWS,
    cellCount: BANNER_TEXTS.length,
  };
  if (!ctx) return { ...atlas, texture: toAtlasTexture(canvas) };

  BANNER_TEXTS.forEach((text, index) => {
    const col = index % BANNER_COLUMNS;
    const row = Math.floor(index / BANNER_COLUMNS);
    drawBannerCell(
      ctx,
      col * BANNER_CELL_W,
      row * BANNER_CELL_H,
      text,
      BANNER_SCHEMES[index % BANNER_SCHEMES.length],
    );
  });

  return { ...atlas, texture: toAtlasTexture(canvas) };
}

function paintProp(): TextureAtlas {
  const { canvas, ctx } = createCanvas(PROP_CELL * PROP_COLUMNS, PROP_CELL * PROP_ROWS);
  const atlas = { columns: PROP_COLUMNS, rows: PROP_ROWS, cellCount: PROP_CELL_COUNT };
  if (!ctx) return { ...atlas, texture: toAtlasTexture(canvas) };

  const at = (index: number): { x: number; y: number } => ({
    x: (index % PROP_COLUMNS) * PROP_CELL,
    y: Math.floor(index / PROP_COLUMNS) * PROP_CELL,
  });

  const drink = at(PROP_CELL_INDEX.drinkVendor);
  drawVendorCell(ctx, drink.x, drink.y, "#c62828", "음료", [
    "#3fa9f5",
    "#f7b500",
    "#0f7a4a",
    "#ff5fa2",
    "#f4f1e8",
  ]);

  const coffee = at(PROP_CELL_INDEX.coffeeVendor);
  drawVendorCell(ctx, coffee.x, coffee.y, "#5d4037", "커피", [
    "#d7a86e",
    "#3e2b22",
    "#f4f1e8",
    "#a1663c",
  ]);

  const snack = at(PROP_CELL_INDEX.snackVendor);
  drawVendorCell(ctx, snack.x, snack.y, "#f7b500", "과자", [
    "#d62828",
    "#1b4fa0",
    "#0f7a4a",
    "#f4f1e8",
    "#ff8a3d",
  ]);

  const grill = at(PROP_CELL_INDEX.acGrill);
  drawAcGrillCell(ctx, grill.x, grill.y);

  const route = at(PROP_CELL_INDEX.busRouteMap);
  drawBusRouteCell(ctx, route.x, route.y);

  const door = at(PROP_CELL_INDEX.storeDoor);
  drawStoreDoorCell(ctx, door.x, door.y);

  const shutter = at(PROP_CELL_INDEX.shutter);
  drawShutterCell(ctx, shutter.x, shutter.y);

  const notice = at(PROP_CELL_INDEX.noticeBoard);
  drawNoticeBoardCell(ctx, notice.x, notice.y);

  return { ...atlas, texture: toAtlasTexture(canvas) };
}

/**
 * 아틀라스 텍스처 설정.
 *
 * 반드시 ClampToEdge여야 한다 — Repeat이면 셀 경계에서 반대쪽 셀이 새어 들어와
 * 간판 가장자리에 엉뚱한 색 줄이 생긴다.
 */
function toAtlasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

const ATLAS_PAINTERS: Record<AtlasKind, () => TextureAtlas> = {
  shopHorizontal: paintShopHorizontal,
  shopVertical: paintShopVertical,
  banner: paintBanner,
  prop: paintProp,
};

const atlasCache = new Map<AtlasKind, TextureAtlas>();

/** 아틀라스를 돌려준다. 종류당 한 번만 그린다. */
export function getAtlas(kind: AtlasKind): TextureAtlas {
  const cached = atlasCache.get(kind);
  if (cached) return cached;

  const atlas = ATLAS_PAINTERS[kind]();
  atlasCache.set(kind, atlas);
  return atlas;
}

/** 씬 해제 시 호출한다. */
export function disposeAtlasTextures(): void {
  for (const atlas of atlasCache.values()) atlas.texture.dispose();
  atlasCache.clear();
}
