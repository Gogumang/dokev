"use client";

/**
 * 전체 지도.
 *
 * 미니맵은 반경 80m만 보여 준다. 282m 도시에서 "지금 어느 구역이고 목표가
 * 어느 방향인가"를 한눈에 보려면 도시 전체를 담은 화면이 따로 필요하다.
 *
 * **북쪽 고정**이다. 전체를 볼 때 회전은 방해가 된다 — 격자가 매번 다른 각도로
 * 서면 "어느 쪽이 위였더라"를 다시 맞춰야 한다. 대신 플레이어 화살표가 돈다.
 *
 * 시뮬레이션을 멈추지 않는다(도감과 같은 판단). 지도를 여는 것만으로 달리던
 * 흐름이 끊기면 열어 보기가 싫어진다.
 */

import { useEffect, useRef, useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import { useDialogFocus } from "@/components/hud/useDialogFocus";
import type { CombatView } from "@/components/hud/WorldHud";
import { BOSS_HOME } from "@/game/combat/bossSim";
import { describeMap } from "@/game/systems/mapSummary";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import type { RuntimeStats } from "@/game/scene/GameScene";
import {
  BLOCK_CELL_METERS,
  blockCells,
  fullMapScale,
  toFullMapPixel,
  WORLD_SPAN_METERS,
} from "@/game/systems/minimap";
import type { QuestView } from "@/game/quest/questRunner";
import { districtForBlock, DISTRICTS, type DistrictId } from "@/game/world/districts";
import { ZONES } from "@/game/world/zones";

/** 캔버스 한 변(px). 실제 표시 크기는 CSS가 화면에 맞춘다 */
const MAP_SIZE = 420;
const REDRAW_MS = 120;
/**
 * 문장을 다시 만드는 주기(ms).
 *
 * 캔버스보다 느리게 둔다. 그림은 다시 칠해도 공짜에 가깝지만 문장은 리렌더를
 * 부르고, 낭독기는 초당 여덟 번 바뀌는 글을 따라올 수 없다.
 */
const SUMMARY_MS = 600;

/**
 * 지도의 바탕색.
 *
 * `clearRect`로 지우면 캔버스가 **투명하게** 남아 뒤의 3D 월드가 그대로
 * 비친다 — 실제로 지도 위로 캐릭터와 간판이 보여 읽을 수가 없었다.
 *
 * 구역 색은 알파 0.14~0.30이다. 어두운 바탕을 전제로 고른 값이므로 바탕이
 * 없으면 색 구분 자체가 성립하지 않는다.
 */
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
const MARKS = {
  target: { color: "#2fd4c4", shape: "circle", label: "목표" },
  enemy: { color: "#ff5d6c", shape: "circle", label: "고물 로봇" },
  boss: { color: "#ff5d6c", shape: "triangle", label: "고물 대장" },
  clue: { color: "#ffe27a", shape: "diamond", label: "흔적" },
  player: { color: "#ffd23f", shape: "arrow", label: "나" },
} as const;

/** 범례 조각을 캔버스와 같은 모양으로 자른다. 원은 자르지 않고 둥근 테두리로 만든다 */
const SHAPE_CLIP: Record<(typeof MARKS)[keyof typeof MARKS]["shape"], string | undefined> = {
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
const DISTRICT_COLOR: Record<DistrictId, string> = Object.fromEntries(
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

export function CityMap({
  stats,
  questView,
  combat,
  discoveries,
  clues,
  onClose,
}: {
  stats: RuntimeStats;
  questView: QuestView;
  combat: CombatView;
  /** 찾아가야 할 도깨비들. 만나면 목록에서 빠진다 */
  discoveries: readonly DokebiSpirit[];
  /** 아직 찾지 않은 흔적. 찾으면 목록에서 빠진다 */
  clues: readonly { x: number; z: number }[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useDialogFocus();

  /*
   * `stats`·`combat`은 매 프레임 제자리에서 바뀌는 공유 객체다 — 리렌더가
   * 일어나지 않으므로 문장을 그냥 쓰면 **연 순간의 값에 굳는다.** 캔버스는
   * 자기 주기로 다시 칠하니 눈에 안 띄고, 글만 조용히 낡는다.
   */
  const [summary, setSummary] = useState("");

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
        // 지도에 찍는 것과 같은 목록이다 — 그림에 있는 것은 글에도 있어야 한다
        // 지도에 찍는 것과 같은 목록이다 — 그림에 있는 것은 글에도 있어야 한다
        clues: clues.map((clue) => ({ x: clue.x, z: clue.z })),
        shrines: discoveries.flatMap((spirit) =>
          spirit.home ? [{ name: spirit.name, x: spirit.home.x, z: spirit.home.z }] : [],
        ),
      });
      // 같은 문장이면 두지 않는다 — 리렌더도, 낭독기가 다시 읽을 이유도 없다
      setSummary((current) => (current === next ? current : next));
    };

    update();
    const id = window.setInterval(update, SUMMARY_MS);
    return () => window.clearInterval(id);
  }, [stats, questView, combat, discoveries, clues]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const scale = fullMapScale(MAP_SIZE);
    const cellPx = BLOCK_CELL_METERS * scale;
    const cells = blockCells();

    const draw = () => {
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
        const point = toFullMapPixel(BOSS_HOME.x, BOSS_HOME.z, MAP_SIZE);
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
    };

    draw();
    const id = window.setInterval(draw, REDRAW_MS);
    return () => window.clearInterval(id);
  }, [stats, questView, combat, discoveries, clues]);

  return (
    <div
      className="hud-scrim absolute rounded-[var(--radius-lg)] p-[var(--space-4)]"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: "min(92vw, 520px)",
      }}
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="도시 전체 지도"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">도시 지도</h2>
        <p className="m-0 text-xs text-[var(--color-text-secondary)]">위쪽이 북쪽</p>
      </div>

      {/*
        캔버스는 낭독기에 아무것도 아니다. 그림 설명만으로는 「지도가 있다」까지만
        알 뿐 **아무 정보 없이 닫게 된다** — 지금 어디고 목표가 어느 쪽인지는
        글로 옮겨야 닿는다. 눈으로 보는 사람에게도 「북동쪽 84m」는 색보다 정확하다.
      */}
      <p className="m-0 mt-[var(--space-2)] text-xs text-[var(--color-text-secondary)]">
        {summary}
      </p>

      <canvas
        ref={canvasRef}
        role="img"
        aria-label="도시 전체 지도. 구역 색과 목표 위치를 표시한다"
        className="mt-[var(--space-3)] block"
        style={{ width: "min(70vw, 60vh, 420px)", height: "min(70vw, 60vh, 420px)" }}
      />

      <ul className="m-0 mt-[var(--space-3)] flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
        {(Object.keys(DISTRICT_COLOR) as DistrictId[]).map((id) => (
          <li key={id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: DISTRICT_COLOR[id] }}
            />
            {DISTRICTS[id].name}
          </li>
        ))}
        {Object.entries(MARKS).map(([key, mark]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3"
              style={{ background: mark.color, clipPath: SHAPE_CLIP[mark.shape] }}
            />
            {mark.label}
          </li>
        ))}
      </ul>

      <div className="mt-[var(--space-3)] flex justify-end">
        <HudButton onClick={onClose} label="지도 닫기">
          닫기
        </HudButton>
      </div>
    </div>
  );
}
