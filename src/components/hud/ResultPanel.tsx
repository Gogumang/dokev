"use client";

/**
 * 완주 화면을 **잇는** 자리.
 *
 * 다른 패널과 성격이 다르다: 매 순간의 값을 보여 주는 것이 아니라 **완주한
 * 순간의 값을 굳혀** 들고 있는다. 그 규칙(언제 담고 언제 되돌리는가)은
 * `hudViews`의 걸쇠가 정본이고, 두 결함이 거기 붙어 있었다 — 기록이 시계가
 * 되던 것, 한 번 닫으면 다음 완주가 영영 안 뜨던 것.
 */

import { useCallback } from "react";

import { ResultPanel as ResultPanelView } from "@/components/hud/views/ResultPanel";
import { useStepped } from "@/components/hud/useHeld";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import { DOKEBI, FINDABLE_DOKEBI, type DokebiId } from "@/game/dokebi/roster";
import {
  createResultLatch,
  dismissResult,
  resultVisible,
  stepResultLatch,
} from "@/game/systems/hudViews";
import type { QuestView } from "@/game/quest/questRunner";

const RESULT_MS = 300;

export function ResultPanel({
  questView,
  summary,
  met,
  nickname,
  onPhoto,
  onRestart,
}: {
  questView: QuestView;
  summary: { elapsedSeconds: number; maxSpeed: number; defeated: number };
  /** 지금까지 만난 도깨비 */
  met: readonly DokebiId[];
  nickname: string;
  onPhoto: () => void;
  onRestart: () => void;
}) {
  const [latch, update] = useStepped(
    createResultLatch,
    (state) => stepResultLatch(state, questView.completed, summary),
    RESULT_MS,
  );

  const onContinue = useCallback(() => update(dismissResult), [update]);

  /*
   * 문구는 완주한 **지금**의 것을 쓴다. 숫자만 굳히면 되는데 제목까지 굳히면
   * 두 번째 완주에서 첫 여정의 이름이 남는다.
   */
  const labels = useSampled(
    () => ({ title: questView.title, hint: questView.hint ?? "" }),
    RESULT_MS,
    shallowEqual,
  );

  if (!resultVisible(latch) || !latch.record) return null;

  return (
    <ResultPanelView
      record={latch.record}
      title={labels.title}
      hint={labels.hint}
      nickname={nickname}
      /*
       * 분모는 **찾아갈 수 있는 수**다. 전체 수로 세면 초롱이 만남 목록에 영영
       * 안 들어가서 다 모아도 3/4에 멈춘다 — 마지막 화면이 아직 남았다고
       * 거짓말을 한다.
       */
      metCount={met.filter((id) => DOKEBI[id]?.home).length}
      findableCount={FINDABLE_DOKEBI.length}
      onContinue={onContinue}
      onPhoto={onPhoto}
      onRestart={onRestart}
    />
  );
}
