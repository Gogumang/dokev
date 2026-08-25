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

import { useEffect, useRef } from "react";

import type { CombatView } from "@/components/hud/WorldHud";
import { useSampled } from "@/components/hud/useSampled";
import type { BossView } from "@/game/combat/bossSim";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import type { RuntimeStats } from "@/game/scene/GameScene";
import { MINIMAP } from "@/game/systems/minimap";
import { paintMinimap } from "@/game/systems/minimapPaint";
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

export function Minimap({
  stats,
  questView,
  combat,
  boss,
  discoveries,
}: {
  stats: RuntimeStats;
  questView: QuestView;
  combat: CombatView;
  /**
   * 대장의 **지금 자리**.
   *
   * `BOSS_HOME`(세워 둔 자리)을 그리고 있었다 — 대장은 인지 반경 22m 안에서
   * 쫓아오므로, 표식만 제자리에 남아 지도를 보고 찾아간 사람이 빈 교차로에
   * 섰다. 좌표를 두 번 적지 않으려고 상수를 쓴 것이 오히려 어긋난 자리다.
   */
  boss: BossView;
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
  const summary = useSampled(
    () =>
      describeMap({
        x: stats.x,
        z: stats.z,
        targetX: questView.targetX,
        targetZ: questView.targetZ,
        bossX: boss.x,
        bossZ: boss.z,
        bossDown: boss.phase === "down",
        enemyCount: combat.enemyBlipCount,
        shrines: discoveries.flatMap((spirit) =>
          spirit.home ? [{ name: spirit.name, x: spirit.home.x, z: spirit.home.z }] : [],
        ),
      }),
    SUMMARY_MS,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 고해상도 화면에서 선이 뭉개지지 않게 배율을 곱해 둔다.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = MINIMAP.sizePx * dpr;
    canvas.height = MINIMAP.sizePx * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => paintMinimap(ctx, { stats, questView, combat, boss, discoveries });
    draw();
    const id = window.setInterval(draw, REDRAW_MS);
    return () => window.clearInterval(id);
  }, [stats, questView, combat, boss, discoveries]);

  return (
    <div className="pointer-events-none" role="img" aria-label={`주변 지도. ${summary}`}>
      <canvas
        ref={canvasRef}
        style={{ width: `${MINIMAP.sizePx}px`, height: `${MINIMAP.sizePx}px` }}
      />
    </div>
  );
}
