"use client";

/**
 * 늘 곁에 있는 패널을 **잇는** 자리 — 현재 목표와 체력.
 *
 * 이 파일에는 모양이 없다. 공유 가변 객체에서 표본을 떠서(`useSampled…`)
 * 화면이 쓸 값으로 옮기고(`hudViews`), 그리는 일은 `views/`에 넘긴다.
 *
 * 나누기 전에는 셋 다 한 함수 안에서 타이머를 걸고, 규칙을 판단하고, JSX까지
 * 만들었다. 그래서 「체력을 언제 보여 주는가」·「완주 기록을 언제 굳히는가」
 * 같은 것이 **브라우저를 띄우지 않고는 확인할 수 없는 자리**에 있었다. 지금은
 * 규칙이 전부 순수 함수라 값으로 잰다.
 */

import { HealthPanel as HealthPanelView } from "@/components/hud/views/HealthPanel";
import { QuestPanel as QuestPanelView } from "@/components/hud/views/QuestPanel";
import { shallowEqual } from "@/components/hud/useSampled";
import { useSampledSince } from "@/components/hud/useSampledSince";
import { PLAYER_COMBAT } from "@/game/combat/playerCombat";
import { healthPanelView, questPanelView } from "@/game/systems/hudViews";
import type { QuestView } from "@/game/quest/questRunner";

/** 표본 주기(ms). 목표 문구는 몇 분에 한 번, 체력은 맞는 순간에 바뀐다 */
const QUEST_MS = 200;
const HEALTH_MS = 120;

export function QuestPanel({ questView }: { questView: QuestView }) {
  const view = useSampledSince(
    () => questView.title,
    (seconds) => questPanelView(questView, seconds),
    QUEST_MS,
    shallowEqual,
  );

  return <QuestPanelView view={view} />;
}

export function HealthPanel({
  combat,
  boss,
}: {
  combat: { playerHp: number; playerDowned: boolean };
  /** 대장과 교전 중인지. 맞기 전에 미리 띄워 둔다 */
  boss: { engaged: boolean };
}) {
  const view = useSampledSince(
    // 체력이 바뀐 순간부터 센다 — 다 회복한 뒤 잠시 남기는 규칙이 이 시간을 쓴다
    () => String(combat.playerHp),
    (seconds) =>
      healthPanelView(
        combat.playerHp,
        PLAYER_COMBAT.maxHp,
        combat.playerDowned,
        boss.engaged,
        seconds,
      ),
    HEALTH_MS,
    shallowEqual,
  );

  return <HealthPanelView view={view} />;
}
