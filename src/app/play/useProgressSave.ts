"use client";

/**
 * 진행 저장 배선.
 *
 * 저장이 **여정 진행 한 곳에서만** 일어났다. 그런데 고물 대장은 25초마다 다시
 * 서고 여정과 무관하게 잡을 수 있어서, 여정을 건드리지 않고 대장만 잡은
 * 사람은 저장이 아예 일어나지 않았다 — 「자정」을 열어 놓고 새로고침 한 번에
 * 잃었다. 도감이 조용히 3칸으로 돌아간다.
 *
 * 저장 지점이 둘이 되면 한쪽이 필드를 빠뜨리는 순간 다른 쪽이 쌓아 둔 것을
 * 덮는다. 그래서 나가는 길을 하나로 두고, 마지막으로 쓴 값을 여기서만 갱신한다.
 */

import { useCallback, useEffect, useRef } from "react";

import { loadProgress, saveProgress, type SavedProgress } from "@/game/systems/saveGame";
import { mergeSandboxProgress } from "@/game/systems/resumeProgress";

type Progress = Omit<SavedProgress, "version">;

/**
 * 지금 저장할 것이 있는가.
 *
 * 이 판단이 훅 안에 있을 때는 **지워도 아무도 몰랐다.** 지우면 조건과 무관하게
 * 매 주기 저장이 나가 **localStorage에 초당 몇 번씩 쓴다** — 값은 같은데 쓰기만
 * 쌓이고, 저장이 느린 브라우저에서는 그 사이 프레임이 튄다.
 *
 * 흔적은 **늘기만 하므로 개수만** 비교한다. 대장 기록은 **꺼진 적이 없으므로**
 * 「지금 켜졌는데 저장에는 없다」만 본다 — 반대 방향(저장에는 있는데 지금 꺼짐)은
 * 저장을 되돌리는 것이라 일부러 안 쓴다.
 */
export function progressChanged(
  foundCount: number,
  savedCount: number,
  bossNow: boolean,
  bossSaved: boolean,
): boolean {
  if (foundCount !== savedCount) return true;
  return bossNow && !bossSaved;
}

export interface ProgressSaveInput {
  resumeFrom?: {
    questStepIndex?: number;
    questCompleted?: boolean;
    defeatedTotal?: number;
    questId?: string;
    bossDefeated?: boolean;
    foundClues?: string[];
  } | null;
  /** 매 프레임 제자리에서 바뀌는 공유 객체 — 리렌더가 없으므로 들여다봐야 한다 */
  summaryView: { bossDefeated: boolean };
  /** 씬이 제자리에서 밀어 넣는 흔적 목록. 같은 이유로 들여다본다 */
  clueView: { found: string[] };
  onQuestStep: (index: number, defeatedTotal: number) => void;
  onQuestComplete: (defeatedTotal: number) => void;
  /**
   * 진행을 한 번도 저장하지 못했을 때 알린다.
   *
   * 시작 화면이 「이 브라우저에 저장된다」고 약속하므로, 지켜지지 않으면
   * **말해 줘야 한다.** 프라이빗 모드에서 한참 놀다 새로고침하고 알게 되는
   * 것이 가장 나쁘다.
   */
  onSaveFailed?: () => void;
  /**
   * 확인 지점으로 들어왔는가.
   *
   * 그렇다면 저장은 **늘어나는 것만** 받는다. 확인 지점은 여정을 처음으로
   * 되돌린 상태이므로 그대로 쓰면 사람의 진행을 지운다.
   */
  sandboxed: boolean;
}

/** 대장 처치를 확인하는 주기(ms). 사람이 알아채기 전에 저장되면 충분하다 */
const BOSS_WATCH_MS = 500;

export function useProgressSave({
  resumeFrom,
  summaryView,
  clueView,
  onQuestStep,
  onQuestComplete,
  sandboxed,
  onSaveFailed,
}: ProgressSaveInput) {
  // 한 번만 알린다 — 저장할 때마다 뜨면 알림이 화면을 덮는다
  const warned = useRef(false);
  const saved = useRef<Progress>({
    questStepIndex: resumeFrom?.questStepIndex ?? 0,
    questCompleted: resumeFrom?.questCompleted ?? false,
    defeatedTotal: resumeFrom?.defeatedTotal ?? 0,
    questId: resumeFrom?.questId,
    bossDefeated: resumeFrom?.bossDefeated === true,
    foundClues: [...(resumeFrom?.foundClues ?? [])],
  });

  const persist = useCallback(
    (patch: Partial<Progress>) => {
      const next = { ...saved.current, ...patch };
      saved.current = next;
      // 확인 지점에서는 저장된 것 위에 늘어난 것만 얹는다 (`mergeSandboxProgress` 참고)
      const wrote = saveProgress(sandboxed ? mergeSandboxProgress(loadProgress(), next) : next);
      if (!wrote && !warned.current) {
        warned.current = true;
        onSaveFailed?.();
      }
    },
    [sandboxed, onSaveFailed],
  );

  const handleQuestAdvance = useCallback(
    (questStepIndex: number, questCompleted: boolean, defeatedTotal: number, questId: string) => {
      persist({
        questStepIndex,
        questCompleted,
        defeatedTotal,
        questId,
        // 이미 눕힌 대장이 여정 저장에 덮여 사라지지 않도록 함께 올린다
        bossDefeated: saved.current.bossDefeated === true || summaryView.bossDefeated,
      });
      onQuestStep(questStepIndex, defeatedTotal);
      if (questCompleted) onQuestComplete(defeatedTotal);
    },
    [onQuestComplete, onQuestStep, persist, summaryView],
  );

  /*
   * 대장을 눕힌 순간을 저장한다. 한 번 켜지면 다시 볼 것이 없으므로 저장한
   * 뒤로는 아무 일도 하지 않는다 — 도깨비를 만났을 때와 같은 방식이다.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      /*
       * 흔적과 보스 기록을 같은 주기에서 본다. 흔적은 늘기만 하므로 개수만
       * 비교하면 된다.
       */
      const changed = progressChanged(
        clueView.found.length,
        saved.current.foundClues?.length ?? 0,
        summaryView.bossDefeated,
        saved.current.bossDefeated === true,
      );
      if (!changed) return;
      persist({
        bossDefeated: saved.current.bossDefeated === true || summaryView.bossDefeated,
        foundClues: [...clueView.found],
      });
    }, BOSS_WATCH_MS);
    return () => window.clearInterval(id);
  }, [clueView, persist, summaryView]);

  return handleQuestAdvance;
}
