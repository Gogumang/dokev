/**
 * 도시 전체 지도를 칠하는 곳.
 *
 * 컴포넌트에서 떼어 냈다 — 캔버스에 긋는 일은 React와 상관이 없고, 여기 담긴
 * 규칙(구역 색, 표식 모양, 범례와 같은 상수를 쓰는가)은 화면을 띄우지 않고도
 * 읽을 수 있어야 한다.
 */

import type { BossView } from "@/game/combat/bossSim";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import {
  BLOCK_CELL_METERS,
  blockCells,
  fullMapScale,
  toFullMapPixel,
  WORLD_SPAN_METERS,
} from "@/game/systems/minimap";
import { districtForBlock, type DistrictId } from "@/game/world/districts";
import { ZONES } from "@/game/world/zones";

const MAP_BACKGROUND = "#14101c";

/**
 * 지도에 찍는 표식.
 *
 * 색과 모양을 여기 한 곳에 둔다. 캔버스에 색을 직접 쓰고 범례를 따로 적었더니
 * **범례가 거짓말을 했다** — 적과 고물 대장이 같은 빨강인데(구분은 원/삼각형)
 * 범례에는 네모 하나만 「고물 대장」이라 붙어 있어, 지도에 흩어진 빨간 점을
 * 전부 대장으로 읽게 됐다. 목표와 내 위치는 범례에 아예 없었다.
 *
 * `shape`는 캔버스와 범례가 같은 모양을 쓰도록 강제하려고 둔다. 색만으로
 * 구분하지 않는다는 원칙과도 맞는다 — 적과 대장은 색이 같다.
 */
export const MARKS = {
  target: { color: "#2fd4c4", shape: "circle", label: "목표" },
  enemy: { color: "#ff5d6c", shape: "circle", label: "고물 로봇" },
  boss: { color: "#ff5d6c", shape: "triangle", label: "고물 대장" },
  clue: { color: "#ffe27a", shape: "diamond", label: "흔적" },
  player: { color: "#ffd23f", shape: "arrow", label: "나" },
} as const;

/** 범례 조각을 캔버스와 같은 모양으로 자른다. 원은 자르지 않고 둥근 테두리로 만든다 */
export const SHAPE_CLIP: Record<(typeof MARKS)[keyof typeof MARKS]["shape"], string | undefined> = {
  circle: "circle(50%)",
  triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  // 캔버스의 화살표와 같은 네 점이다 — 꼬리가 파인 형태라야 방향을 읽는다
  arrow: "polygon(50% 0%, 100% 100%, 50% 76%, 0% 100%)",
};

/**
 * 구역 성격별 색.
 *
 * 지도를 열어 보고 알았다 — **변두리가 바탕과 거의 구분되지 않았다.** 재 보니
 * 바탕과 색거리 34, 번화가와 35로 둘 다 「눈에 띄게 다르다」의 기준(40)
 * 아래였다. 지도의 목적이 「지금 어느 구역인가를 한눈에」인데 셋 중 하나가
 * 안 보이면 그 목적이 절반만 선다.
 *
 * 알파를 올려 셋이 서로도, 바탕과도 42 이상 떨어지게 했다. 반투명이므로
 * **바탕 위에 얹은 결과**로 재야 한다 — 원색끼리 비교하면 실제로 보이는 것과
 * 다른 답이 나온다.
 */
/**
 * 구역 칠의 불투명도.
 *
 * 0.34였다. 구역이 셋일 때는 옅게 얹어도 서로 갈렸지만, 여덟이 되면 합성
 * 후의 색 차이가 원색 차이의 1/3로 줄어 이웃 색조끼리 붙는다. 진하게 얹고
 * 표식(MARKS)을 그 위에 그리는 쪽이 「어느 구역인가」에 훨씬 잘 답한다.
 */
const DISTRICT_FILL_ALPHA = 0.8;

/**
 * 구역 색은 `ZONES.mapColor`가 정본이다.
 *
 * 예전에는 여기에 rgba 세 줄을 손으로 적었다. 구역이 여덟으로 늘면서 그 방식은
 * 못 쓴다 — 지도의 색과 월드의 성격을 **다른 파일에서 따로** 관리하면 구역을
 * 하나 더할 때 한쪽만 고쳐 놓고 지나간다. 실제로 이 저장소에서 「값은 맞는데
 * 화면에 안 나온다」가 가장 흔한 결함 모양이었다.
 *
 * 알파는 여기서 준다. 바탕이 어두워 원색 그대로 얹으면 서로 구분은 되지만
 * 지도 위의 목표 표식(MARKS)을 덮는다.
 */
export const DISTRICT_COLOR: Record<DistrictId, string> = Object.fromEntries(
  Object.values(ZONES).map((zone) => [zone.id, hexToRgba(zone.mapColor, DISTRICT_FILL_ALPHA)]),
) as Record<DistrictId, string>;

/** `#rrggbb` → `rgba(...)`. 캔버스와 인라인 스타일 양쪽이 같은 문자열을 쓴다. */
function hexToRgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 캔버스 한 변(px). 실제 표시 크기는 CSS가 화면에 맞춘다 */
export const MAP_SIZE = 420;

export interface CityMapScene {
  readonly stats: { x: number; z: number; facing: number };
  readonly questView: { targetX?: number; targetZ?: number };
  readonly combat: { enemyBlips: Float32Array; enemyBlipCount: number };
  readonly boss: BossView;
  readonly discoveries: readonly DokebiSpirit[];
  readonly clues: readonly { x: number; z: number }[];
}

/** 한 프레임을 칠한다. 한 변은 `MAP_SIZE`가 정본이고 범례가 같은 상수를 쓴다 */
export function paintCityMap(ctx: CanvasRenderingContext2D, scene: CityMapScene): void {
  const { stats, questView, combat, boss, discoveries, clues } = scene;
  const scale = fullMapScale(MAP_SIZE);
  const cellPx = BLOCK_CELL_METERS * scale;
  const cells = blockCells();

  // 투명하게 지우지 않는다 — 뒤의 월드가 비쳐 지도를 읽을 수 없다
  ctx.fillStyle = MAP_BACKGROUND;
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  /* ---------------- 구역 ---------------- */
  for (const cell of cells) {
    const center = toFullMapPixel(cell.x, cell.z, MAP_SIZE);
    ctx.fillStyle = DISTRICT_COLOR[districtForBlock(cell.index).id];
    // 칸을 격자 간격만큼 채운다 — 사이가 비면 도로가 두 배로 넓어 보인다.
    ctx.fillRect(center.x - cellPx / 2, center.y - cellPx / 2, cellPx, cellPx);
  }

  /* ---------------- 월드 경계 ---------------- */
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  const edge = toFullMapPixel(-WORLD_SPAN_METERS / 2, WORLD_SPAN_METERS / 2, MAP_SIZE);
  ctx.strokeRect(edge.x, edge.y, WORLD_SPAN_METERS * scale, WORLD_SPAN_METERS * scale);

  /* ---------------- 목표 ---------------- */
  if (questView.targetX !== undefined && questView.targetZ !== undefined) {
    const point = toFullMapPixel(questView.targetX, questView.targetZ, MAP_SIZE);
    ctx.fillStyle = MARKS.target.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // 목표는 화면 전체에서 하나뿐이라 테두리를 둘러 눈에 먼저 들어오게 한다.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ---------------- 적 ---------------- */
  ctx.fillStyle = MARKS.enemy.color;
  for (let i = 0; i < combat.enemyBlipCount; i += 1) {
    const point = toFullMapPixel(combat.enemyBlips[i * 2], combat.enemyBlips[i * 2 + 1], MAP_SIZE);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  /*
   * 흔적.
   *
   * 알려 주지 않으면 282m 도시에서 셋을 찾을 방법이 없다 — 「어딘가에
   * 있다」는 목표는 목표가 아니라 벽이다. 찾은 것은 목록에서 빠진다.
   */
  for (const clue of clues) {
    const point = toFullMapPixel(clue.x, clue.z, MAP_SIZE);
    ctx.fillStyle = MARKS.clue.color;
    ctx.beginPath();
    // 마름모 — 원·삼각형과 겹치지 않는 네 번째 모양이다
    ctx.moveTo(point.x, point.y - 6);
    ctx.lineTo(point.x + 6, point.y);
    ctx.lineTo(point.x, point.y + 6);
    ctx.lineTo(point.x - 6, point.y);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 도깨비 자리 ---------------- */
  for (const spirit of discoveries) {
    if (!spirit.home) continue;
    const point = toFullMapPixel(spirit.home.x, spirit.home.z, MAP_SIZE);
    // 몸 색으로 찍는다 — 도감에서 본 실루엣과 같은 색이라야 누구인지 안다.
    ctx.fillStyle = spirit.bodyColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = spirit.accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /*
   * 미니 보스 자리.
   *
   * 만들어 두고 알려 주지 않으면 없는 것과 같다 — 도깨비 자리를 지도에
   * 찍은 것과 같은 이유다. 쓰러뜨린 뒤에도 표식은 남긴다: 25초 뒤 다시
   * 서므로 "여기 있었다"가 아니라 "여기 있다"가 맞다.
   */
  {
    const point = toFullMapPixel(boss.x, boss.z, MAP_SIZE);
    ctx.fillStyle = MARKS.boss.color;
    ctx.beginPath();
    // 삼각형으로 찍는다 — 원은 적 표식과 겹쳐 구분되지 않는다.
    ctx.moveTo(point.x, point.y - 7);
    ctx.lineTo(point.x + 6, point.y + 5);
    ctx.lineTo(point.x - 6, point.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /* ---------------- 플레이어 ---------------- */
  const me = toFullMapPixel(stats.x, stats.z, MAP_SIZE);
  ctx.save();
  ctx.translate(me.x, me.y);
  /*
   * 캔버스 회전은 시계 방향이 양수다. 월드 yaw 0은 +z(지도 위쪽)를 보므로
   * 회전이 없고, yaw가 커지면 +x(오른쪽)로 도는데 그게 곧 시계 방향이다.
   */
  ctx.rotate(stats.facing);
  ctx.fillStyle = MARKS.player.color;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
