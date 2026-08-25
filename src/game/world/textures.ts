"use client";

/**
 * 절차적 타일 텍스처 생성.
 *
 * 이미지 파일을 내려받지 않고 캔버스에 직접 그린다. 초기 다운로드 예산
 * (PROJECT_PLAN 「성능 예산」)을 한 바이트도 쓰지 않으면서 건물이 "색칠한 상자"에서
 * 벗어나게 하는 가장 싼 방법이다.
 *
 * 생성 비용은 캔버스 몇 장의 드로잉이라 무시할 수 있고, 한 번 만들어 모듈
 * 캐시에 재사용한다 (patterns 규칙: 정적 데이터는 1회 로드).
 *
 * 여기에는 **반복(RepeatWrapping) 타일**만 둔다. 셀 단위로 잘라 쓰는 아틀라스
 * (간판·현수막·소품 패널)는 atlasTextures.ts에 있다.
 */

import * as THREE from "three";
import { buildGrain } from "@/game/world/grain";

import { createSeededRandom } from "@/game/core/mathx";
import { disposeSkyTextures } from "@/game/world/skyTexture";

/** 창문 한 칸이 실제로 차지하는 크기(m). 이 값으로 텍스처 반복 횟수를 정한다. */
export const FACADE_CELL_WIDTH = 3.0;
export const FACADE_CELL_HEIGHT = 3.2;

/**
 * 노면·보도 타일 한 변이 덮는 실제 거리(m).
 *
 * 렌더 쪽에서 `면 크기 / 이 값`으로 repeat 횟수를 구한다. 상수를 텍스처와 같은
 * 파일에 두어야 타일 무늬를 바꿀 때 배율을 함께 고치는 것을 잊지 않는다.
 */
export const ASPHALT_TILE_METERS = 8;
/**
 * 자연 지면 타일 한 변(m).
 *
 * 아스팔트(8m)보다 촘촘하다. 풀은 결이 잘아야 풀로 읽히고, 8m로 늘리면
 * 잔디밭이 아니라 **초록 카펫**이 된다. 너무 잘게 하면 멀리서 모아레가 진다.
 */
export const GRASS_TILE_METERS = 5;
/**
 * 물결 타일 한 변(m).
 *
 * 크게 잡는다. 바다는 도시 밖으로 240m 뻗어 있어 잘게 반복하면 **멀리서
 * 모아레가 끓는다** — 물결이 아니라 지직거림으로 보인다. 가까운 물결은
 * UV를 흘려서(스크롤) 만든다.
 */
export const WATER_TILE_METERS = 22;
export const PAVING_TILE_METERS = 4.8;

/*
 * 차양 줄무늬 간격의 정본은 cityContent다(배치와 드로잉이 함께 써야 하는 값이라
 * three에 의존하지 않는 곳에 둔다). 다른 타일 간격과 나란히 쓰이는 값이라
 * 여기서도 집어 쓸 수 있게 다시 내보낸다.
 */
export { AWNING_STRIPE_METERS } from "@/game/world/cityContent";

/** 절차적 노이즈 시드. 텍스처가 새로고침마다 달라지면 화면 비교가 불가능하다. */
const TEXTURE_SEED = 48211;

export interface FacadeTone {
  /** 외벽 색 */
  wall: string;
  /** 창유리 색 */
  glass: string;
  /** 창틀 색 */
  frame: string;
}

/*
 * 건물 톤 — 카툰 렌더링(DokeV) 팔레트.
 *
 * 예전 값은 실제 서울 상가의 회벽·베이지를 그대로 옮긴 것이었다. 사진으로는
 * 맞지만 셀 셰이딩과는 상극이다: 셰이딩이 두세 단으로 뭉개지는 순간, 채도가
 * 낮은 벽은 **단마다 회색 계단**만 남고 색이 사라진다. 카툰 룩은 조명이
 * 아니라 색 자체가 화면을 지탱해야 한다.
 *
 * 그래서 명도는 올리고 채도는 유지하되, 창유리만은 벽보다 확실히 어둡고
 * 푸르게 둔다 — 벽까지 밝으면 낮에 창이 사라져 건물이 색종이 상자가 된다.
 */
export const FACADE_TONES: readonly FacadeTone[] = [
  { wall: "#f7ead1", glass: "#3f93b8", frame: "#dcb886" }, // 크림
  { wall: "#bfe6d2", glass: "#3a8fa8", frame: "#86c4a8" }, // 민트
  { wall: "#f4ab98", glass: "#456f9e", frame: "#d1806c" }, // 코랄
  { wall: "#cfc2ef", glass: "#4b60ad", frame: "#a396d2" }, // 라벤더
  { wall: "#ffdc9b", glass: "#3f95b0", frame: "#deb15f" }, // 버터
  { wall: "#a8d5f2", glass: "#3a74a4", frame: "#7cb0d6" }, // 스카이
];

const CANVAS_SIZE = 128;

/*
 * 창문 한 칸의 자리. **낮 텍스처와 밤 발광 텍스처가 이 값을 함께 쓴다.**
 *
 * 예전에는 두 함수가 같은 식을 각각 적어 두고 주석에만 「같은 상수를 쓴다」고
 * 적혀 있었다 — 실제로는 복제였다. 한쪽만 만지면 밤에 **창틀 밖으로 빛이
 * 새어 나온 것처럼** 보이는데, 그건 화면을 봐야만 알 수 있는 종류의 어긋남이다.
 *
 * 여기 한 곳에서 만들면 갈라질 수가 없다.
 */
const WINDOW_BOX = {
  inset: CANVAS_SIZE * 0.16,
  width: CANVAS_SIZE - CANVAS_SIZE * 0.16 * 2,
  height: CANVAS_SIZE * 0.5,
  top: CANVAS_SIZE * 0.2,
} as const;

function lighten(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.lerp(new THREE.Color("#ffffff"), amount);
  return `#${color.getHexString()}`;
}

/** 캔버스와 2D 컨텍스트를 한 번에 만든다. 컨텍스트 획득 실패는 호출부가 다룬다. */
/**
 * 캔버스와 2D 컨텍스트를 만든다.
 *
 * `skyTexture`도 쓴다 — 그쪽이 이 파일을 부르는 방향이라 순환이 아니다.
 * 컨텍스트가 null일 수 있는 처리를 두 곳에서 따로 쓰면 한쪽만 빠뜨린다.
 */
export function createCanvas(
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
 * 반복 타일용 텍스처 공통 설정.
 *
 * anisotropy를 주지 않으면 노면처럼 시선과 거의 평행한 면에서 무늬가 뭉개진다.
 */
function toTilingTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * 창문 한 칸짜리 타일을 그린다.
 *
 * 한 칸만 그리는 이유: 반복 횟수를 정수로 맞추면 건물 크기가 달라도 창문이
 * 잘리지 않는다. 건물마다 창 개수는 달라지되 창 크기는 일정하게 유지된다.
 */
function drawFacadeTile(tone: FacadeTone): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  if (!ctx) return canvas;

  ctx.fillStyle = tone.wall;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // 벽의 결. 규칙과 검사는 world/grain.ts에 있다 — 단색 면이면 캐릭터가 안 떠오른다
  for (const mark of buildGrain(CANVAS_SIZE, tone.frame.charCodeAt(1) + tone.wall.charCodeAt(3))) {
    ctx.fillStyle = `rgba(${mark.dark ? "0, 0, 0" : "255, 255, 255"}, ${mark.alpha})`;
    ctx.fillRect(mark.x, mark.y, mark.width, mark.height);
  }

  // 층 사이 띠 — 이것만 있어도 건물에 스케일 감각이 생긴다.
  ctx.fillStyle = tone.frame;
  ctx.fillRect(0, CANVAS_SIZE - 10, CANVAS_SIZE, 4);

  const { inset, width, height, top } = WINDOW_BOX;

  ctx.fillStyle = tone.frame;
  ctx.fillRect(inset - 3, top - 3, width + 6, height + 6);

  // 유리에 위에서 아래로 밝기 변화를 준다 (하늘 반사 흉내)
  const gradient = ctx.createLinearGradient(0, top, 0, top + height);
  gradient.addColorStop(0, lighten(tone.glass, 0.25));
  gradient.addColorStop(1, tone.glass);
  ctx.fillStyle = gradient;
  ctx.fillRect(inset, top, width, height);

  // 창틀 세로 분할
  ctx.fillStyle = tone.frame;
  ctx.fillRect(CANVAS_SIZE / 2 - 1.5, top, 3, height);

  // 실외기 자리 — 한국 건물 외벽에서 창 아래 난간에 매달린 회색 상자가 리듬을 만든다.
  ctx.fillStyle = "rgba(60, 58, 70, 0.45)";
  ctx.fillRect(CANVAS_SIZE * 0.62, top + height + 4, CANVAS_SIZE * 0.22, 10);

  return canvas;
}

/**
 * 창문 발광 마스크.
 *
 * 밤이 되면 조명만 어두워지고 창문은 낮과 같은 밝기로 남는다 — 불 꺼진 도시가
 * 된다. 창문 자리만 밝게 칠한 흑백 타일을 emissiveMap으로 얹어 스스로 빛나게
 * 한다.
 *
 * **본 텍스처와 좌표를 정확히 맞춰야 한다.** 창틀 위치가 1px만 어긋나도 빛이
 * 벽으로 새어 나온 것처럼 보인다. 그래서 `WINDOW_BOX` 한 곳에서 좌표를 가져온다.
 */
function drawFacadeEmissiveTile(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  if (!ctx) return canvas;

  // 벽은 빛나지 않는다. 검은색이 곧 "발광 없음"이다.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const { inset, width, height, top } = WINDOW_BOX;
  const half = width / 2;

  /*
   * 좌우 창을 다른 밝기로 칠한다.
   *
   * 타일이 벽 전체에 반복되므로 균일하게 칠하면 모든 창문이 똑같이 켜져
   * 사무실 건물 한 채처럼 보인다. 좌우 밝기를 갈라 두면 반복되면서
   * 밝은 칸과 어두운 칸이 번갈아 나타난다.
   */
  ctx.fillStyle = "#fff2d6";
  ctx.fillRect(inset, top, half - 2, height);
  ctx.fillStyle = "#6a5433";
  ctx.fillRect(inset + half + 1, top, half - 1, height);

  // 창틀은 빛나지 않는다 — 유리만 켜져야 창으로 읽힌다.
  ctx.fillStyle = "#000000";
  ctx.fillRect(CANVAS_SIZE / 2 - 1.5, top, 3, height);

  return canvas;
}

const facadeCache = new Map<number, THREE.CanvasTexture>();
let facadeEmissiveCache: THREE.CanvasTexture | null = null;

/**
 * 창문 발광 마스크 텍스처. 톤과 무관하게 하나만 쓴다 —
 * 창 위치가 톤마다 같으므로 나눌 이유가 없다.
 */
export function getFacadeEmissiveTexture(): THREE.CanvasTexture {
  if (!facadeEmissiveCache) {
    facadeEmissiveCache = toTilingTexture(drawFacadeEmissiveTile());
  }
  return facadeEmissiveCache;
}

/** 톤 인덱스에 해당하는 파사드 텍스처를 돌려준다. 같은 톤은 한 번만 만든다. */
export function getFacadeTexture(toneIndex: number): THREE.CanvasTexture {
  const key = toneIndex % FACADE_TONES.length;
  const cached = facadeCache.get(key);
  if (cached) return cached;

  // 멀리 있는 건물에서 창문이 지글거리는 것을 막는다 (anisotropy + 밉맵).
  const texture = toTilingTexture(drawFacadeTile(FACADE_TONES[key]));
  facadeCache.set(key, texture);
  return texture;
}

const LAMP_GLOW_SIZE = 128;

let lampGlowCache: THREE.CanvasTexture | null = null;

/**
 * 가로등이 바닥에 만드는 빛 웅덩이.
 *
 * 갓만 밝히면 등이 공중에 떠 있는 점으로 보인다. 아래에 원형 그라데이션을
 * 깔아야 "저 등이 여기를 비추고 있다"가 된다. 실제 광원(pointLight)을 수백 개
 * 두는 것과 결과는 비슷한데 비용은 비교가 안 되게 싸다.
 *
 * 가장자리를 완전한 투명으로 끝내야 한다 — 조금이라도 남으면 가산 합성에서
 * 사각형 경계가 드러난다.
 */
function drawLampGlow(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(LAMP_GLOW_SIZE, LAMP_GLOW_SIZE);
  if (!ctx) return canvas;

  const half = LAMP_GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255, 226, 170, 0.95)");
  gradient.addColorStop(0.35, "rgba(255, 205, 140, 0.42)");
  gradient.addColorStop(1, "rgba(255, 190, 120, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LAMP_GLOW_SIZE, LAMP_GLOW_SIZE);
  return canvas;
}

/** 빛 웅덩이 텍스처. 반복하지 않으므로 wrap은 기본값(ClampToEdge)을 쓴다 */
export function getLampGlowTexture(): THREE.CanvasTexture {
  if (!lampGlowCache) {
    const texture = new THREE.CanvasTexture(drawLampGlow());
    texture.colorSpace = THREE.SRGBColorSpace;
    lampGlowCache = texture;
  }
  return lampGlowCache;
}

const FILTER_SIZE = 256;

const filterCache = new Map<string, THREE.CanvasTexture>();

/**
 * 포토 필터용 원형 그라데이션.
 *
 * 색을 텍스처에 구워 넣는다. 재질 색 하나로는 "가운데는 따뜻하게, 가장자리는
 * 어둡게"를 동시에 만들 수 없기 때문이다 — 같은 색을 알파만 바꿔 칠하면
 * 가장자리도 밝아져 비네트가 아니라 후광이 된다.
 */
export function getFilterTexture(key: string, center: string, edge: string): THREE.CanvasTexture {
  const cached = filterCache.get(key);
  if (cached) return cached;

  const { canvas, ctx } = createCanvas(FILTER_SIZE, FILTER_SIZE);
  if (ctx) {
    const half = FILTER_SIZE / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, center);
    // 중간 지점을 넣어 가운데 색이 화면 대부분을 덮게 한다. 두 점만 두면
    // 비네트가 화면 절반까지 올라와 사진이 답답해진다.
    gradient.addColorStop(0.62, center);
    gradient.addColorStop(1, edge);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FILTER_SIZE, FILTER_SIZE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  filterCache.set(key, texture);
  return texture;
}

const ASPHALT_SIZE = 256;

/**
 * 아스팔트.
 *
 * 단색 평면이 도로처럼 보이지 않는 이유는 색이 아니라 **입자**가 없어서다.
 * 자잘한 점 수천 개 + 보수 자국 몇 개 + 균열 몇 줄이면 충분히 노면으로 읽힌다.
 * 차선은 텍스처에 그리지 않는다 — 교차로에서 끊어야 하므로 지오메트리가 맞다.
 */
function drawAsphalt(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(ASPHALT_SIZE, ASPHALT_SIZE);
  if (!ctx) return canvas;

  const random = createSeededRandom(TEXTURE_SEED);

  /*
   * 노면 밝기.
   *
   * 예전 값(#413d4b)은 밤 사진에서 가져온 아스팔트였다. 한낮 기준으로 바꾸고
   * 톤매핑을 끄자 **화면 아래 절반이 검은 판**이 됐다 — 3인칭이라 바닥이 늘
   * 화면의 절반이고, 그 절반이 죽으면 위에 올린 색이 무슨 소용이 없다.
   * 인도(#8e8898)보다는 확실히 어둡게 두어 둘이 구분되게 한다.
   */
  ctx.fillStyle = "#6f6e73";
  ctx.fillRect(0, 0, ASPHALT_SIZE, ASPHALT_SIZE);

  // 골재 입자
  for (let i = 0; i < 5200; i += 1) {
    const shade = Math.floor(120 + random() * 90);
    ctx.fillStyle = `rgba(${shade}, ${shade - 3}, ${shade - 6}, ${0.05 + random() * 0.12})`;
    const size = random() < 0.85 ? 1 : 2;
    ctx.fillRect(random() * ASPHALT_SIZE, random() * ASPHALT_SIZE, size, size);
  }

  // 보수 자국 — 도로를 파고 다시 덮은 색 다른 사각형. 한국 도로에 항상 있다.
  for (let i = 0; i < 5; i += 1) {
    const w = 40 + random() * 70;
    const h = 24 + random() * 50;
    ctx.fillStyle = `rgba(30, 28, 38, ${0.12 + random() * 0.14})`;
    ctx.fillRect(random() * ASPHALT_SIZE, random() * ASPHALT_SIZE, w, h);
  }

  // 균열
  ctx.strokeStyle = "rgba(24, 22, 30, 0.4)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    let x = random() * ASPHALT_SIZE;
    let y = random() * ASPHALT_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 46;
      y += (random() - 0.5) * 46;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return canvas;
}

const PAVING_BLOCKS_PER_TILE = 8;

/**
 * 보도블록.
 *
 * 블록 하나하나의 색을 아주 조금씩 흔든다. 완전히 균일하면 타일 반복이 눈에
 * 띄고, 너무 흔들면 자갈밭이 된다.
 */
/**
 * 자연 지면 — 풀·흙·모래가 함께 쓰는 결.
 *
 * 한동안 자연 구역도 아스팔트 텍스처를 초록으로 물들여 썼다. 색은 맞는데
 * **아스팔트의 균열과 보수 자국이 그대로 남아** 잔디밭에 검은 금이 그어졌다 —
 * 숲에 서면 그게 제일 먼저 보였다.
 *
 * 색을 여기서 정하지 않는다. 구역 색(`zones.groundColor`)이 정점 색으로 곱해지므로
 * 이 텍스처는 **밝기와 결만** 만든다 — 그래서 잔디·모래·흙이 같은 그림 하나를
 * 나눠 쓴다. 회색으로 그리는 이유가 이것이다.
 */
function drawGrass(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(ASPHALT_SIZE, ASPHALT_SIZE);
  if (!ctx) return canvas;

  const random = createSeededRandom(TEXTURE_SEED + 41);

  // 바탕은 중간 밝기. 구역 색이 곱해지므로 흰색에 가까우면 색이 날아간다
  ctx.fillStyle = "#b6b4ae";
  ctx.fillRect(0, 0, ASPHALT_SIZE, ASPHALT_SIZE);

  /*
   * 넓은 얼룩 — 풀이 짙고 옅은 자리.
   *
   * 이것이 없으면 균일한 판이라 달릴 때 속도가 느껴지지 않는다. 균열(아스팔트)과
   * 달리 **가장자리가 부드러워야** 자연물로 읽힌다.
   */
  for (let i = 0; i < 90; i += 1) {
    const radius = 10 + random() * 34;
    const x = random() * ASPHALT_SIZE;
    const y = random() * ASPHALT_SIZE;
    const shade = Math.floor(150 + random() * 60);
    const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
    blob.addColorStop(0, `rgba(${shade}, ${shade}, ${shade - 4}, 0.30)`);
    blob.addColorStop(1, `rgba(${shade}, ${shade}, ${shade - 4}, 0)`);
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 풀잎 결 — 짧은 선을 흩어 놓는다. 점만 찍으면 모래로 보인다
  for (let i = 0; i < 2600; i += 1) {
    const x = random() * ASPHALT_SIZE;
    const y = random() * ASPHALT_SIZE;
    const length = 1.5 + random() * 3;
    const shade = Math.floor(120 + random() * 110);
    ctx.strokeStyle = `rgba(${shade}, ${shade + 4}, ${shade - 6}, ${0.16 + random() * 0.22})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 1.6, y - length);
    ctx.stroke();
  }

  return canvas;
}

/**
 * 바다 표면.
 *
 * 셰이더를 쓰지 않는다. 물결은 **UV를 흘려서** 만들고(`Sea.tsx`), 이 그림은
 * 그 흐름에 실릴 결만 만든다 — 결이 없으면 아무리 흘려도 단색 판이 미끄러질
 * 뿐이라 물로 보이지 않는다.
 *
 * 색은 재질이 정한다(지면과 같은 방식). 여기서는 밝기만 그린다.
 */
function drawWater(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(ASPHALT_SIZE, ASPHALT_SIZE);
  if (!ctx) return canvas;

  const random = createSeededRandom(TEXTURE_SEED + 73);

  ctx.fillStyle = "#9aa6b4";
  ctx.fillRect(0, 0, ASPHALT_SIZE, ASPHALT_SIZE);

  /*
   * 긴 가로 띠 — 잔물결의 큰 결.
   *
   * 세로로도 넣으면 격자로 보인다. 실제 바다의 결은 바람 방향으로 길게
   * 늘어나므로 한 방향만 쓴다.
   */
  for (let i = 0; i < 46; i += 1) {
    const y = random() * ASPHALT_SIZE;
    const thickness = 2 + random() * 9;
    const shade = Math.floor(150 + random() * 80);
    ctx.fillStyle = `rgba(${shade}, ${shade + 6}, ${shade + 14}, ${0.1 + random() * 0.16})`;
    ctx.fillRect(0, y, ASPHALT_SIZE, thickness);
  }

  /*
   * 윤슬 — 물에 부서지는 빛점.
   *
   * 구역 이름이 「윤슬 해안」이다. 이것이 없으면 그냥 파란 판이고, 있으면
   * 물이 움직이는 것처럼 보인다(UV가 흐르면서 반짝이 자리가 계속 바뀐다).
   */
  for (let i = 0; i < 420; i += 1) {
    const x = random() * ASPHALT_SIZE;
    const y = random() * ASPHALT_SIZE;
    const length = 2 + random() * 7;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + random() * 0.3})`;
    ctx.fillRect(x, y, length, 1);
  }

  return canvas;
}

function drawPaving(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(ASPHALT_SIZE, ASPHALT_SIZE);
  if (!ctx) return canvas;

  const random = createSeededRandom(TEXTURE_SEED + 17);
  const block = ASPHALT_SIZE / PAVING_BLOCKS_PER_TILE;

  // 줄눈. 블록보다 어두워야 한 장 한 장이 보인다
  ctx.fillStyle = "#82817f";
  ctx.fillRect(0, 0, ASPHALT_SIZE, ASPHALT_SIZE);

  for (let row = 0; row < PAVING_BLOCKS_PER_TILE; row += 1) {
    for (let col = 0; col < PAVING_BLOCKS_PER_TILE; col += 1) {
      // 한 줄씩 반 칸 어긋나게 쌓아 벽돌 결합을 만든다.
      const shift = row % 2 === 0 ? 0 : block / 2;
      /*
       * 보도블록 색.
       *
       * 파란 쪽으로 6~12 기울여 두었는데, 하늘빛 반사광(hemisphereGround)을
       * 푸르게 올린 뒤로는 **화면 아래 절반이 보랏빛 판**이 됐다. 두 번 파랗게
       * 만든 셈이다. 여기서는 중립에 가깝게 두고 색은 빛이 얹게 한다.
       */
      const shade = Math.floor(168 + random() * 28);
      ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade - 7})`;
      ctx.fillRect(col * block + shift + 1, row * block + 1, block - 2, block - 2);
    }
  }

  // 줄눈 그림자 — 위쪽·왼쪽에만 넣어 블록이 살짝 튀어나와 보이게 한다.
  ctx.fillStyle = "rgba(30, 27, 38, 0.35)";
  for (let row = 0; row < PAVING_BLOCKS_PER_TILE; row += 1) {
    ctx.fillRect(0, row * block, ASPHALT_SIZE, 1);
  }

  return canvas;
}

const GLASS_WIDTH = 64;
const GLASS_HEIGHT = 128;

/**
 * 1층 상가 유리.
 *
 * 조명을 받지 않는 면이라 그라디언트가 곧 반사다. 위쪽에 노을을, 아래쪽에
 * 어두운 실내를 넣으면 "노을을 비추는 유리"로 읽힌다.
 */
function drawShopGlass(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(GLASS_WIDTH, GLASS_HEIGHT);
  if (!ctx) return canvas;

  const gradient = ctx.createLinearGradient(0, 0, GLASS_WIDTH * 0.5, GLASS_HEIGHT);
  gradient.addColorStop(0, "#ffd9a0");
  gradient.addColorStop(0.35, "#e59a6d");
  gradient.addColorStop(0.62, "#7a5f7a");
  gradient.addColorStop(1, "#33293f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLASS_WIDTH, GLASS_HEIGHT);

  // 비스듬한 하이라이트 — 유리라는 신호를 가장 확실하게 주는 요소다.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#fff4dd";
  ctx.beginPath();
  ctx.moveTo(GLASS_WIDTH * 0.1, GLASS_HEIGHT);
  ctx.lineTo(GLASS_WIDTH * 0.42, 0);
  ctx.lineTo(GLASS_WIDTH * 0.6, 0);
  ctx.lineTo(GLASS_WIDTH * 0.28, GLASS_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 새시 — 가로 중간틀과 좌우 프레임
  ctx.fillStyle = "#2b2733";
  ctx.fillRect(0, GLASS_HEIGHT * 0.58, GLASS_WIDTH, 3);
  ctx.fillRect(0, 0, 3, GLASS_HEIGHT);
  ctx.fillRect(GLASS_WIDTH - 3, 0, 3, GLASS_HEIGHT);

  return canvas;
}

const STRIPE_SIZE = 64;

/**
 * 차양 줄무늬.
 *
 * 밝은 줄을 흰색(1.0), 어두운 줄을 중간 회색으로 그린다. 렌더 쪽에서 인스턴스
 * 색을 곱하므로 텍스처 한 장으로 빨강·초록·파랑 차양을 전부 만들 수 있다.
 * 색마다 텍스처를 만들면 드로우콜이 색 수만큼 늘어난다.
 *
 * 타일 한 장이 밝은 줄 + 어두운 줄 한 쌍이다. 이 한 쌍이 실제로 몇 미터를
 * 덮는지는 cityContent의 AWNING_STRIPE_METERS가 정한다 — 배치 쪽에서 폭을
 * 그 값으로 나눠 반복 횟수를 만든다.
 */
function drawAwningStripe(): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(STRIPE_SIZE, STRIPE_SIZE);
  if (!ctx) return canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, STRIPE_SIZE, STRIPE_SIZE);
  ctx.fillStyle = "#6f6f74";
  ctx.fillRect(STRIPE_SIZE / 2, 0, STRIPE_SIZE / 2, STRIPE_SIZE);

  // 천이 처지는 느낌 — 줄 경계에 아주 옅은 그림자를 넣는다.
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fillRect(STRIPE_SIZE / 2 - 2, 0, 2, STRIPE_SIZE);

  return canvas;
}

type TileKind = "asphalt" | "paving" | "grass" | "water" | "shopGlass" | "awningStripe";

const TILE_PAINTERS: Record<TileKind, () => HTMLCanvasElement> = {
  asphalt: drawAsphalt,
  paving: drawPaving,
  grass: drawGrass,
  water: drawWater,
  shopGlass: drawShopGlass,
  awningStripe: drawAwningStripe,
};

const tileCache = new Map<TileKind, THREE.CanvasTexture>();

/** 타일 텍스처를 돌려준다. 종류당 한 번만 그린다. */
export function getTileTexture(kind: TileKind): THREE.CanvasTexture {
  const cached = tileCache.get(kind);
  if (cached) return cached;

  const texture = toTilingTexture(TILE_PAINTERS[kind]());
  tileCache.set(kind, texture);
  return texture;
}

/* ------------------------------------------------------------------ *
 * 물가 거품
 * ------------------------------------------------------------------ */

/**
 * 거품 띠 크기.
 *
 * 가로는 물가를 따라 반복되고, 세로는 **물가에서 바다 쪽으로** 한 번만 쓴다.
 * 세로가 짧아도 되는 이유는 그 방향이 그라데이션 하나뿐이기 때문이다.
 */
const FOAM_WIDTH = 256;
const FOAM_HEIGHT = 64;

let foamCache: THREE.CanvasTexture | null = null;

/**
 * 물과 땅이 만나는 선의 거품.
 *
 * 이것이 없으면 물이 **잘라 붙인 파란 종이**처럼 땅에 딱 맞닿는다. 실제
 * 물가에서 눈이 먼저 잡는 것은 물색이 아니라 **하얗게 부서지는 선**이고,
 * 그 선이 없으면 물이 아니라 바닥에 칠한 색으로 보인다.
 *
 * 알파를 쓴다 — 이 저장소에서 투명을 쓰는 거의 유일한 자리다. 불투명한 흰
 * 띠로는 「칠한 선」이 되고, 바깥으로 흐려져야 「부서져 흩어지는 것」이 된다.
 */
export function getFoamTexture(): THREE.CanvasTexture {
  if (foamCache) return foamCache;

  const { canvas, ctx } = createCanvas(FOAM_WIDTH, FOAM_HEIGHT);
  if (!ctx) {
    foamCache = new THREE.CanvasTexture(canvas);
    return foamCache;
  }

  const random = createSeededRandom(TEXTURE_SEED + 91);

  /*
   * 뭍 쪽(v=0)이 짙고 바다 쪽(v=1)이 사라진다.
   *
   * 가장자리를 딱 끊지 않는다 — 끊으면 거품 띠의 바깥 선이 또 하나의 딱딱한
   * 경계가 되어, 고치려던 것을 그대로 한 칸 옮겨 놓는 꼴이 된다.
   */
  const fade = ctx.createLinearGradient(0, 0, 0, FOAM_HEIGHT);
  fade.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  fade.addColorStop(0.35, "rgba(255, 255, 255, 0.45)");
  fade.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, FOAM_WIDTH, FOAM_HEIGHT);

  /*
   * 물가를 따라 들쭉날쭉하게 판다.
   *
   * 고른 띠는 물가가 아니라 **자로 그은 선**이다. 위쪽(뭍 쪽)을 무작위로
   * 깎아 내면 파도가 밀려든 자리가 제각각인 것처럼 보인다.
   */
  ctx.globalCompositeOperation = "destination-out";
  for (let x = 0; x < FOAM_WIDTH; x += 4) {
    const bite = random() * FOAM_HEIGHT * 0.42;
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
    ctx.fillRect(x, 0, 5, bite);
  }
  ctx.globalCompositeOperation = "source-over";

  // 흩어진 거품 방울 — 띠 바깥에도 몇 개 있어야 흩어지는 것으로 보인다
  for (let i = 0; i < 260; i += 1) {
    const y = random() * FOAM_HEIGHT;
    const alpha = 0.5 * (1 - y / FOAM_HEIGHT) + 0.1;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * random()})`;
    ctx.fillRect(random() * FOAM_WIDTH, y, 1 + random() * 2, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  // 물가를 따라서만 반복한다. 세로로 반복하면 바다 한가운데 거품 줄이 생긴다
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  foamCache = texture;
  return texture;
}

/* ------------------------------------------------------------------ *
 * 셀 셰이딩 그라데이션 맵
 * ------------------------------------------------------------------ */

/**
 * 밝기 단계 수.
 *
 * 둘이면 만화보다 스텐실에 가깝고, 여섯을 넘으면 부드러워져 그냥 Lambert처럼
 * 보인다 — 넷이 "계단이 보이되 형태는 읽히는" 자리다.
 */
export const TOON_BANDS = 4;

/**
 * 각 단의 밝기.
 *
 * 첫 단을 0에 가깝게 두면 안 된다. 이 도시는 건물이 서로를 가려 **그늘 면이
 * 화면의 절반**인데, 그 절반이 검게 눌리면 위에서 올린 채도가 통째로 사라진다.
 * 바닥을 0.42로 들어 두면 그늘에서도 벽 색이 남는다.
 *
 * 마지막은 반드시 1이다 — 최고 단이 1보다 작으면 도시 전체가 한 겹 어두워진다.
 */
const TOON_BAND_LEVELS = [0.42, 0.64, 0.84, 1] as const;

let toonGradientCache: THREE.DataTexture | null = null;

/**
 * 셀 셰이딩용 그라데이션 맵.
 *
 * MeshToonMaterial은 이 1차원 텍스처의 R 채널로 조도를 계단화한다. 보간이
 * 켜져 있으면 계단이 다시 뭉개지므로 확대/축소 모두 Nearest여야 하고,
 * 밉맵도 꺼야 한다(4픽셀짜리 밉맵은 평균값 한 개로 수렴한다).
 */
export function getToonGradientTexture(): THREE.DataTexture {
  if (toonGradientCache) return toonGradientCache;

  const data = new Uint8Array(TOON_BANDS);
  TOON_BAND_LEVELS.forEach((level, index) => {
    data[index] = Math.round(level * 255);
  });

  const texture = new THREE.DataTexture(data, TOON_BANDS, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // 한 행이 4바이트뿐이라 기본 정렬(4)에 걸리지 않지만, 단 수를 바꾸는 순간
  // 행이 어긋나 그라데이션이 뒤섞인다. 1로 못박아 둔다.
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  toonGradientCache = texture;
  return texture;
}

/** 씬 해제 시 호출한다 (구역 스트리밍 도입 시 필요). */
export function disposeFacadeTextures(): void {
  for (const texture of facadeCache.values()) texture.dispose();
  facadeCache.clear();
  for (const texture of tileCache.values()) texture.dispose();
  tileCache.clear();

  for (const texture of filterCache.values()) texture.dispose();
  filterCache.clear();

  /*
   * 변수 하나로 든 캐시들.
   *
   * 위의 루프는 Map만 돈다. 그래서 이 둘은 「파사드 텍스처를 해제한다」는
   * 이름을 단 함수를 그대로 지나쳤다 — /play를 드나들 때마다 GPU에 하나씩
   * 쌓인다. 화면은 멀쩡해서 눈으로는 영영 모른다.
   */
  facadeEmissiveCache?.dispose();
  facadeEmissiveCache = null;
  lampGlowCache?.dispose();
  lampGlowCache = null;
  toonGradientCache?.dispose();
  toonGradientCache = null;
  foamCache?.dispose();
  foamCache = null;
  disposeSkyTextures();
}
