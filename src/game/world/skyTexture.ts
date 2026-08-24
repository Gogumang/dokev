/**
 * 하늘 텍스처 — 절차적 구름.
 *
 * `textures.ts`가 800줄 상한을 넘어 떼어 냈다. 상한이 「이 묶음은 다른
 * 책임인가」를 묻게 했고 답은 그렇다였다: 나머지는 **물체에 붙는** 타일인데,
 * 이것은 **배경 한 장**이고 쓰는 곳도 `SkyDome` 하나뿐이다.
 *
 * 캔버스 헬퍼(`createCanvas`)는 `textures.ts`에서 가져온다. 반대로 `textures.ts`는
 * 여기서 `disposeSkyTextures`만 가져간다 — 서로 부르지만 **둘 다 함수 안에서만**
 * 쓰므로 모듈 평가 시점에는 아무것도 읽지 않는다. 이 파일 최상단에서
 * `textures.ts`의 값을 읽는 코드를 추가하지 마라(`zones.ts` 주석의 그 사고다).
 */

import * as THREE from "three";

import { mixHex } from "@/game/core/color";
import { createSeededRandom } from "@/game/core/mathx";
import { createCanvas } from "@/game/world/textures";

/** 텍스처 난수 씨앗. `textures.ts`와 같은 값을 쓰면 구름이 노면 얼룩을 따라간다 */
const TEXTURE_SEED = 20260817;

/* ------------------------------------------------------------------ *
 * 하늘 돔
 * ------------------------------------------------------------------ */

/**
 * 하늘 텍스처 크기.
 *
 * 가로는 한 바퀴, 세로는 천정에서 지평선 아래까지다. 구름 가장자리가 부드러워
 * 낮은 해상도로도 뭉개지지 않는다 — 1024면 화면에서 한 픽셀이 대략 두 픽셀로
 * 늘어나는 정도다.
 */
const SKY_WIDTH = 1024;
const SKY_HEIGHT = 512;

/**
 * 구름이 뜨는 높이 구간(v 좌표. 0=천정, 0.5=지평선).
 *
 * 처음에는 0.1~0.44(지평선 위 11°~72°)에 뿌렸다. 캔버스로 열어 보면 멀쩡한데
 * **화면에는 한 조각도 안 나왔다** — 3인칭 카메라는 피치가 묶여 있어 실제로
 * 보이는 하늘은 지평선 위 30° 남짓뿐이다. 하늘 텍스처는 "하늘 전체"가 아니라
 * **보이는 띠**를 채워야 한다.
 */
const CLOUD_BAND = { top: 0.24, bottom: 0.475 } as const;

/** 한 화면에 뜨는 구름 덩어리 수(구름 양 1.0 기준) */
const CLOUD_CLUSTERS = 26;

/**
 * 뭉게구름 하나를 그린다.
 *
 * 원을 여러 개 겹쳐 실루엣을 만든다. 아래쪽을 살짝 눌러(평평하게) 그려야
 * 「떠 있는 구름」이 되고, 그냥 원 무더기면 솜뭉치가 된다.
 */
function drawCloud(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number,
  random: () => number,
): void {
  const lobes = 5 + Math.floor(random() * 4);

  for (let i = 0; i < lobes; i += 1) {
    const spread = (i / (lobes - 1) - 0.5) * 2;
    const radius = scale * (0.45 + random() * 0.55) * (1 - Math.abs(spread) * 0.35);
    const x = centerX + spread * scale * 1.35;
    // 가운데 덩어리가 가장 높다 — 좌우로 갈수록 내려앉아야 구름 모양이 된다
    const y = centerY - (1 - Math.abs(spread)) * scale * 0.35 + random() * scale * 0.12;

    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 하늘 돔 텍스처를 그린다.
 *
 * 위에서 아래로 색이 바뀌는 그라데이션 + 구름. 이미지 파일을 받을 수 없으므로
 * (PROJECT_PLAN 「지키고 있는 제약」) 캔버스에 직접 그린다.
 *
 * **지평선 색은 안개 색과 같아야 한다.** 다르면 먼 건물이 하늘과 다른 색의
 * 띠에 잘려 도시가 유리판 위에 놓인 것처럼 보인다.
 */
function drawSky(topColor: string, horizonColor: string, cloudiness: number): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(SKY_WIDTH, SKY_HEIGHT);
  if (!ctx) return canvas;

  /*
   * 색 변화를 지평선 쪽에 몰아 준다.
   *
   * 0~0.5를 고르게 나누면 실제로 보이는 아래쪽 띠가 전부 지평선 색 한 가지가
   * 되어 단색 배경과 구분되지 않는다. 보이는 구간에서 색이 움직여야 한다.
   */
  const gradient = ctx.createLinearGradient(0, 0, 0, SKY_HEIGHT * 0.5);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(0.7, mixHex(topColor, horizonColor, 0.3));
  gradient.addColorStop(0.94, mixHex(topColor, horizonColor, 0.82));
  gradient.addColorStop(1, horizonColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SKY_WIDTH, SKY_HEIGHT * 0.5);

  // 지평선 아래는 한 색으로 채운다. 땅에 가려 보이지 않지만 비워 두면 검게 남는다
  ctx.fillStyle = horizonColor;
  ctx.fillRect(0, SKY_HEIGHT * 0.5, SKY_WIDTH, SKY_HEIGHT * 0.5);

  if (cloudiness <= 0) return canvas;

  const random = createSeededRandom(TEXTURE_SEED + 907);
  const count = Math.round(CLOUD_CLUSTERS * cloudiness);

  for (let i = 0; i < count; i += 1) {
    const x = random() * SKY_WIDTH;
    const t = random();
    const y = (CLOUD_BAND.top + t * (CLOUD_BAND.bottom - CLOUD_BAND.top)) * SKY_HEIGHT;
    // 지평선에 가까울수록 작게 — 멀리 있는 구름이라는 원근이 생긴다
    const scale = SKY_HEIGHT * (0.075 - t * 0.045) * (0.7 + random() * 0.7);

    /*
     * 구름 색은 흰색이 아니라 하늘색을 섞은 흰색이다.
     *
     * 순백을 쓰면 하늘에서 도려낸 구멍처럼 보인다. 아래쪽 그늘도 회색이
     * 아니라 하늘색이어야 한다 — 실제로 구름 아랫면은 하늘을 반사한다.
     */
    ctx.fillStyle = mixHex("#ffffff", topColor, 0.06 + t * 0.1);
    ctx.globalAlpha = 0.72 + random() * 0.24;
    drawCloud(ctx, x, y, scale, random);

    // 가로로 이어 붙는 자리 — 한 바퀴 도는 텍스처라 가장자리를 넘는 구름을 반대편에도 그린다
    if (x < scale * 4) drawCloud(ctx, x + SKY_WIDTH, y, scale, createSeededRandom(TEXTURE_SEED + i));
    if (x > SKY_WIDTH - scale * 4) {
      drawCloud(ctx, x - SKY_WIDTH, y, scale, createSeededRandom(TEXTURE_SEED + i));
    }
  }
  ctx.globalAlpha = 1;

  return canvas;
}

const skyCache = new Map<string, THREE.CanvasTexture>();

/**
 * 시간대별 하늘 텍스처. 같은 시간대는 한 번만 그린다.
 *
 * 키를 시간대 id가 아니라 색 조합으로 잡는다 — id로 잡으면 프리셋 값을 바꿔도
 * 캐시가 옛 그림을 계속 돌려준다.
 */
export function getSkyTexture(
  topColor: string,
  horizonColor: string,
  cloudiness: number,
): THREE.CanvasTexture {
  const key = `${topColor}|${horizonColor}|${cloudiness}`;
  const cached = skyCache.get(key);
  if (cached) return cached;

  const texture = new THREE.CanvasTexture(drawSky(topColor, horizonColor, cloudiness));
  // 가로로만 이어 붙는다. 세로로 반복시키면 천정 위에 지평선이 다시 나온다.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;

  skyCache.set(key, texture);
  return texture;
}

/** 캐시한 하늘 텍스처를 전부 놓아 준다. `textures.disposeFacadeTextures`가 부른다 */
export function disposeSkyTextures(): void {
  for (const texture of skyCache.values()) texture.dispose();
  skyCache.clear();
}
