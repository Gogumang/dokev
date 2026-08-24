"use client";

/**
 * 미니맵.
 *
 * 캔버스 2D로 그린다. DOM 요소 수십 개로 길을 그리면 레이아웃 계산이 매번
 * 돌아 오히려 비싸다.
 *
 * rAF가 아니라 타이머로 다시 그린다 — 지도는 초당 12번이면 충분하고, 렌더
 * 루프와 같은 프레임에 끼어들 이유가 없다.
 */

import { useEffect, useRef, useState } from "react";

import type { CombatView } from "@/components/hud/WorldHud";
import { BOSS_HOME } from "@/game/combat/bossSim";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import type { RuntimeStats } from "@/game/scene/GameScene";
import {
  clampToRing,
  isOnMap,
  MINIMAP,
  roadsInRange,
  toCanvasPixel,
  toMapPoint,
} from "@/game/systems/minimap";
import { describeMap } from "@/game/systems/mapSummary";
import type { QuestView } from "@/game/quest/questRunner";

/** 다시 그리는 주기(ms) */
const REDRAW_MS = 80;

/**
 * 글로 다시 쓰는 주기(ms).
 *
 * 그림보다 훨씬 뜸해도 된다 — 낭독기는 초점이 닿을 때 읽고, 자주 바꿔 봐야
 * 리렌더만 는다.
 */
const SUMMARY_MS = 600;

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

export function Minimap({
  stats,
  questView,
  combat,
  discoveries,
}: {
  stats: RuntimeStats;
  questView: QuestView;
  combat: CombatView;
  /** 찾아가야 할 도깨비들 */
  discoveries: readonly DokebiSpirit[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * 미니맵이 무엇을 보여 주는지 말한다.
   *
   * `aria-label="주변 지도"` 한 줄뿐이었다 — 이름은 있는데 **내용이 없는**
   * 그림이라, 눈으로 못 보는 사람에게는 로봇이 몇 기인지도 목표가 어느
   * 쪽인지도 없는 셈이었다. 큰 지도는 같은 이유로 이미 고쳤는데, 정작
   * **늘 보이는 쪽**이 남아 있었다.
   *
   * 흔적은 넘기지 않는다. 미니맵은 흔적을 그리지 않으므로 말하면 화면에
   * 없는 것을 안내하게 된다 — 「그림에 있는 것은 글에도 있어야 한다」의
   * 반대쪽도 지킨다.
   */
  const [summary, setSummary] = useState("주변 지도");

  useEffect(() => {
    const update = () => {
      const next = describeMap({
        x: stats.x,
        z: stats.z,
        targetX: questView.targetX,
        targetZ: questView.targetZ,
        bossX: BOSS_HOME.x,
        bossZ: BOSS_HOME.z,
        enemyCount: combat.enemyBlipCount,
        shrines: discoveries.flatMap((spirit) =>
          spirit.home ? [{ name: spirit.name, x: spirit.home.x, z: spirit.home.z }] : [],
        ),
      });
      // 같은 문장이면 두지 않는다 — 리렌더할 이유가 없다
      setSummary((current) => (current === next ? current : next));
    };

    update();
    const id = window.setInterval(update, SUMMARY_MS);
    return () => window.clearInterval(id);
  }, [stats, questView, combat, discoveries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 고해상도 화면에서 선이 뭉개지지 않게 배율을 곱해 둔다.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = MINIMAP.sizePx;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const half = size / 2;
    const scale = half / MINIMAP.rangeMeters;

    const draw = () => {
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

      const yaw = stats.facing;
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
      {
        const raw = toMapPoint(BOSS_HOME.x, BOSS_HOME.z, stats.x, stats.z, yaw);
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
    };

    draw();
    const id = window.setInterval(draw, REDRAW_MS);
    return () => window.clearInterval(id);
  }, [stats, questView, combat, discoveries]);

  return (
    <div
      className="pointer-events-none"
      role="img"
      aria-label={`주변 지도. ${summary}`}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${MINIMAP.sizePx}px`, height: `${MINIMAP.sizePx}px` }}
      />
    </div>
  );
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
