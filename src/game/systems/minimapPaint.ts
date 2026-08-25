/**
 * 미니맵을 실제로 칠하는 곳.
 *
 * 컴포넌트에서 떼어 냈다. 캔버스에 긋는 일은 React와 아무 상관이 없고, 여기
 * 있는 규칙 — 적은 테두리에 안 붙인다, 목표와 자리는 붙인다, 누워 있는 대장은
 * 지운다 — 은 **화면을 띄우지 않고도 읽을 수 있어야** 한다.
 *
 * `ctx`를 받는다. `document`를 만지지 않으므로 서버에서 불러도 터지지 않는다.
 */

import type { BossView } from "@/game/combat/bossSim";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import {
  clampToRing,
  isOnMap,
  MINIMAP,
  roadsInRange,
  toCanvasPixel,
  toMapPoint,
} from "@/game/systems/minimap";

const COLOR = {
  ground: "rgba(24, 20, 32, 0.72)",
  road: "rgba(226, 224, 235, 0.34)",
  ring: "rgba(255, 255, 255, 0.28)",
  player: "#ffd23f",
  target: "#2fd4c4",
  enemy: "#ff5d6c",
  companion: "#9ff5ff",
  /** 미니 보스. 일반 적과 같은 계열이되 더 진하다 */
  boss: "#ff2d55",
} as const;

export interface MinimapScene {
  readonly stats: { x: number; z: number; viewYaw: number };
  readonly questView: { targetX?: number; targetZ?: number };
  readonly combat: {
    enemyBlips: Float32Array;
    enemyBlipCount: number;
    companionX: number;
    companionZ: number;
    companionVisible: boolean;
  };
  readonly boss: BossView;
  readonly discoveries: readonly DokebiSpirit[];
}

/** 한 프레임을 칠한다. 크기는 `MINIMAP.sizePx`가 정본이다 */
export function paintMinimap(ctx: CanvasRenderingContext2D, scene: MinimapScene): void {
  const { stats, questView, combat, boss, discoveries } = scene;
  const size = MINIMAP.sizePx;
  const half = size / 2;
  const scale = half / MINIMAP.rangeMeters;

  ctx.clearRect(0, 0, size, size);

  // 원형 바깥으로 새는 것을 막는다. 사각형이면 모서리에 도로가 잘려 남는다.
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(0, 0, size, size);

  /* ---------------- 도로 ---------------- */
  ctx.strokeStyle = COLOR.road;
  ctx.lineWidth = 3;
  ctx.lineCap = "butt";

  /*
   * **눈이 보는 쪽**으로 돈다. `facing`(몸이 향한 쪽)으로 돌던 동안, 가만히
   * 서서 시점만 돌리면 지도가 꿈쩍도 안 했다 — 정면에 보이는 대장을 「뒤에
   * 있다」고 찍었다. 이 파일의 머리 주석이 적어 둔 의도가 「화면의 위와 지도의
   * 위가 맞는다」이므로 기준은 몸이 아니라 눈이다.
   */
  const yaw = stats.viewYaw;
  const reach = MINIMAP.rangeMeters * Math.SQRT2;

  // 세로 도로(x가 고정) — 지도 위에서는 회전한 선분이 된다.
  for (const x of roadsInRange(stats.x, MINIMAP.rangeMeters)) {
    drawWorldLine(ctx, x, stats.z - reach, x, stats.z + reach, stats, yaw, scale, half);
  }
  // 가로 도로(z가 고정)
  for (const z of roadsInRange(stats.z, MINIMAP.rangeMeters)) {
    drawWorldLine(ctx, stats.x - reach, z, stats.x + reach, z, stats, yaw, scale, half);
  }

  /* ---------------- 적과 동료 ---------------- */
  ctx.fillStyle = COLOR.enemy;
  for (let i = 0; i < combat.enemyBlipCount; i += 1) {
    const point = toMapPoint(
      combat.enemyBlips[i * 2],
      combat.enemyBlips[i * 2 + 1],
      stats.x,
      stats.z,
      yaw,
    );
    // 적은 테두리에 붙이지 않는다 — 없는 위협이 가장자리에 늘어서면 지도가 거짓말을 한다.
    if (!isOnMap(point, MINIMAP.rangeMeters)) continue;
    const pixel = toCanvasPixel(point, size, MINIMAP.rangeMeters);
    ctx.beginPath();
    ctx.arc(pixel.x, pixel.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (combat.companionVisible) {
    const point = toMapPoint(combat.companionX, combat.companionZ, stats.x, stats.z, yaw);
    if (isOnMap(point, MINIMAP.rangeMeters)) {
      const pixel = toCanvasPixel(point, size, MINIMAP.rangeMeters);
      ctx.fillStyle = COLOR.companion;
      ctx.beginPath();
      ctx.arc(pixel.x, pixel.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------- 도깨비 자리 ---------------- */
  for (const spirit of discoveries) {
    if (!spirit.home) continue;
    const raw = toMapPoint(spirit.home.x, spirit.home.z, stats.x, stats.z, yaw);
    // 목표와 같이 테두리에 붙인다 — 어느 쪽인지가 곧 정보다.
    const point = clampToRing(raw, MINIMAP.rangeMeters - MINIMAP.edgeInsetPx / scale);
    const pixel = toCanvasPixel(point, size, MINIMAP.rangeMeters);
    ctx.fillStyle = spirit.bodyColor;
    ctx.beginPath();
    ctx.arc(pixel.x, pixel.y, isOnMap(raw, MINIMAP.rangeMeters) ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- 미니 보스 ---------------- */
  /*
   * 누워 있는 동안에는 지운다.
   *
   * 넘어뜨린 뒤에도 삼각형이 그대로 남아 「아직 저기 서 있다」고 말하고
   * 있었다 — 25초 뒤 일어나면 다시 그린다. 자판기·도깨비 자리와 같은
   * 규칙이다: 지금 없는 것을 지도가 말하지 않는다.
   */
  if (boss.phase !== "down") {
    const raw = toMapPoint(boss.x, boss.z, stats.x, stats.z, yaw);
    // 목표와 같이 테두리에 붙인다 — 어느 쪽인지가 곧 정보다.
    const point = clampToRing(raw, MINIMAP.rangeMeters - MINIMAP.edgeInsetPx / scale);
    const pixel = toCanvasPixel(point, size, MINIMAP.rangeMeters);
    ctx.fillStyle = COLOR.boss;
    ctx.beginPath();
    ctx.moveTo(pixel.x, pixel.y - 5);
    ctx.lineTo(pixel.x + 4, pixel.y + 3.5);
    ctx.lineTo(pixel.x - 4, pixel.y + 3.5);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 목표 ---------------- */
  if (questView.targetX !== undefined && questView.targetZ !== undefined) {
    const raw = toMapPoint(questView.targetX, questView.targetZ, stats.x, stats.z, yaw);
    // 지도 밖이면 테두리에 붙인다 — 잘라 버리면 "목표가 없다"로 보인다.
    const point = clampToRing(raw, MINIMAP.rangeMeters - MINIMAP.edgeInsetPx / scale);
    const pixel = toCanvasPixel(point, size, MINIMAP.rangeMeters);

    ctx.fillStyle = COLOR.target;
    ctx.beginPath();
    ctx.arc(pixel.x, pixel.y, isOnMap(raw, MINIMAP.rangeMeters) ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  /* ---------------- 테두리와 플레이어 ---------------- */
  ctx.strokeStyle = COLOR.ring;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(half, half, half - 1, 0, Math.PI * 2);
  ctx.stroke();

  // 플레이어는 항상 한가운데에서 위를 본다 — 지도가 대신 돈다.
  ctx.fillStyle = COLOR.player;
  ctx.beginPath();
  ctx.moveTo(half, half - 6);
  ctx.lineTo(half + 4.5, half + 5);
  ctx.lineTo(half, half + 2.5);
  ctx.lineTo(half - 4.5, half + 5);
  ctx.closePath();
  ctx.fill();
}

/** 월드 선분 하나를 지도에 그린다. */
function drawWorldLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  center: { x: number; z: number },
  yaw: number,
  scale: number,
  half: number,
): void {
  const a = toMapPoint(x1, z1, center.x, center.z, yaw);
  const b = toMapPoint(x2, z2, center.x, center.z, yaw);
  ctx.beginPath();
  ctx.moveTo(half + a.u * scale, half - a.v * scale);
  ctx.lineTo(half + b.u * scale, half - b.v * scale);
  ctx.stroke();
}
