"use client";

/**
 * 「지금 여기서」 안내를 **잇는** 자리.
 *
 * 넷 다 공유 가변 객체를 자기 주기로 들여다본다. 표본을 뜨는 일은
 * `useSampled`가, 그리는 일은 `views/Prompts`가 한다.
 */

import { useCallback } from "react";

import {
  ShrineNotice as ShrineNoticeView,
  ShrinePrompt as ShrinePromptView,
  VendingPrompt as VendingPromptView,
} from "@/components/hud/views/Prompts";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import { useHeld } from "@/components/hud/useHeld";
import { pendingDiscoveries, type DokebiId } from "@/game/dokebi/roster";
import type { DiscoveryView } from "@/game/dokebi/roster";
import { vendingView } from "@/game/systems/hudViews";
import type { QuestView } from "@/game/quest/questRunner";

const PROMPT_MS = 150;
const PROGRESS_MS = 400;

/** 「찾아갈 자리가 생겼다」가 머무는 시간(초) */
const SHRINE_NOTICE_SECONDS = 4;

export function VendingPrompt({
  vending,
}: {
  vending: { machineInReach: boolean; boostRemaining: number };
}) {
  const view = useSampled(() => vendingView(vending), PROMPT_MS, shallowEqual);
  return <VendingPromptView view={view} />;
}

export function ShrinePrompt({
  discovery,
  talkKey,
}: {
  discovery: DiscoveryView;
  talkKey: string;
}) {
  const visible = useSampled(() => discovery.nearby !== null, PROMPT_MS);
  return <ShrinePromptView visible={visible} talkKey={talkKey} />;
}

/**
 * 자리가 드러난 것을 알린다.
 *
 * 첫 표본은 조용히 삼킨다 — 이어서 하는 판이면 이미 드러나 있던 자리까지
 * 「방금 생겼다」고 말하게 된다.
 */
export function ShrineNotice({
  summary,
  questView,
  met,
}: {
  summary: { defeated: number; bossDefeated: boolean };
  questView: QuestView;
  met: readonly DokebiId[];
}) {
  const sample = useCallback(() => {
    const waiting = pendingDiscoveries(
      {
        defeatedTotal: summary.defeated,
        questCompleted: questView.firstQuestDone,
        bossDefeated: summary.bossDefeated,
      },
      met,
    ).map((spirit) => spirit.id);

    return { key: waiting.join(","), value: true };
  }, [summary, questView, met]);

  const shown = useHeld(sample, SHRINE_NOTICE_SECONDS, PROGRESS_MS, true);
  return <ShrineNoticeView visible={shown === true} />;
}
