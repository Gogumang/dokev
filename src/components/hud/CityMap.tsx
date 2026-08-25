"use client";

/**
 * 전체 지도의 **틀**.
 *
 * 미니맵은 반경 80m만 보여 준다. 282m 도시에서 「지금 어느 구역이고 목표가 어느
 * 방향인가」를 한눈에 보려면 도시 전체를 담은 화면이 따로 필요하다.
 *
 * 시뮬레이션을 멈추지 않는다(도감과 같은 판단). 지도를 여는 것만으로 달리던
 * 흐름이 끊기면 열어 보기가 싫어진다.
 *
 * 칠하는 일은 `CityMapCanvas`가, 범례는 `CityMapLegend`가, 실제 그림은
 * `cityMapPaint`가 한다. 여기 남은 것은 대화창과 문장뿐이다.
 */

import { HudButton } from "@/components/hud/HudButton";
import { useDialogFocus } from "@/components/hud/useDialogFocus";
import { useSampled } from "@/components/hud/useSampled";
import { CityMapCanvas } from "@/components/hud/CityMapCanvas";
import { CityMapLegend } from "@/components/hud/CityMapLegend";
import type { CombatView } from "@/components/hud/WorldHud";
import type { BossView } from "@/game/combat/bossSim";
import { describeMap } from "@/game/systems/mapSummary";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import type { RuntimeStats } from "@/game/scene/GameScene";
import type { QuestView } from "@/game/quest/questRunner";

/**
 * 문장을 다시 만드는 주기(ms).
 *
 * 캔버스보다 느리게 둔다. 그림은 다시 칠해도 공짜에 가깝지만 문장은 리렌더를
 * 부르고, 낭독기는 초당 여덟 번 바뀌는 글을 따라올 수 없다.
 */
const SUMMARY_MS = 600;

export function CityMap({
  stats,
  questView,
  combat,
  boss,
  discoveries,
  clues,
  onClose,
}: {
  stats: RuntimeStats;
  questView: QuestView;
  combat: CombatView;
  /** 대장의 지금 자리. 미니맵과 같은 값을 쓴다 — 지도 둘이 다른 곳을 가리키면 안 된다 */
  boss: BossView;
  /** 찾아가야 할 도깨비들. 만나면 목록에서 빠진다 */
  discoveries: readonly DokebiSpirit[];
  /** 아직 찾지 않은 흔적. 찾으면 목록에서 빠진다 */
  clues: readonly { x: number; z: number }[];
  onClose: () => void;
}) {
  const panelRef = useDialogFocus();
  const scene = { stats, questView, combat, boss, discoveries, clues };

  /*
   * `stats`·`combat`은 매 프레임 제자리에서 바뀌는 공유 객체다 — 리렌더가
   * 일어나지 않으므로 문장을 그냥 쓰면 **연 순간의 값에 굳는다.** 캔버스는
   * 자기 주기로 다시 칠하니 눈에 안 띄고, 글만 조용히 낡는다.
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
        enemyCount: combat.enemyBlipCount,
        // 지도에 찍는 것과 같은 목록이다 — 그림에 있는 것은 글에도 있어야 한다
        clues: clues.map((clue) => ({ x: clue.x, z: clue.z })),
        shrines: discoveries.flatMap((spirit) =>
          spirit.home ? [{ name: spirit.name, x: spirit.home.x, z: spirit.home.z }] : [],
        ),
      }),
    SUMMARY_MS,
  );

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

      {/* 캔버스는 낭독기에 아무것도 아니다 — 지금 어디고 목표가 어느 쪽인지는 글로 옮겨야 닿는다 */}
      <p className="m-0 mt-[var(--space-2)] text-xs text-[var(--color-text-secondary)]">
        {summary}
      </p>

      <CityMapCanvas scene={scene} />

      <CityMapLegend />

      <div className="mt-[var(--space-3)] flex justify-end">
        <HudButton onClick={onClose} label="지도 닫기">
          닫기
        </HudButton>
      </div>
    </div>
  );
}
