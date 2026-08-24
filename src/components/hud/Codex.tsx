"use client";

/**
 * 도감 — 지금까지 만난 도깨비.
 *
 * 잠긴 도깨비도 자리를 비워 두지 않고 실루엣과 조건을 보여 준다. 무엇이 남았는지
 * 모르면 도감은 목표가 아니라 벽이 된다.
 *
 * 시뮬레이션을 멈추지 않는다 — 포토 모드처럼 화면을 얼리면 도감을 여는 것만으로
 * 달리던 흐름이 끊긴다. 대신 패널이 화면 절반을 넘지 않게 두어 뒤가 보인다.
 */

import { useEffect, useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import { useDialogFocus } from "@/components/hud/useDialogFocus";
import {
  DOKEBI,
  DOKEBI_ORDER,
  isUnlocked,
  revealedDokebi,
  unlockHint,
  unlockRatio,
  type DokebiId,
  type DokebiProgress,
} from "@/game/dokebi/roster";
import type { QuestView } from "@/game/quest/questRunner";

export interface CodexProps {
  /** 지금 데리고 다니는 도깨비 */
  current: DokebiId;
  /** 씬이 매 프레임 갱신하는 공유 객체 — 폴링으로 읽는다 */
  summary: { defeated: number; bossDefeated: boolean };
  questView: QuestView;
  /** 실제로 만난 도깨비들 */
  met: readonly DokebiId[];
  onSelect: (id: DokebiId) => void;
  onClose: () => void;
}

/** 진행도 폴링 주기(ms). 매 프레임 읽을 이유가 없다 */
const POLL_MS = 250;

export function Codex({ current, summary, questView, met, onSelect, onClose }: CodexProps) {
  const [progress, setProgress] = useState<DokebiProgress>({
    defeatedTotal: 0,
    questCompleted: false,
    bossDefeated: false,
  });

  useEffect(() => {
    const read = () =>
      setProgress({
        defeatedTotal: summary.defeated,
        questCompleted: questView.firstQuestDone,
        bossDefeated: summary.bossDefeated,
      });
    read();
    const id = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(id);
  }, [summary, questView]);

  const panelRef = useDialogFocus();

  const found = DOKEBI_ORDER.filter((id) => isUnlocked(id, progress, met)).length;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="hud-scrim overflow-y-auto rounded-[var(--radius-lg)] p-[var(--space-4)]"
      style={{
        width: "min(38ch, 92vw)",
        maxHeight: "min(60vh, 520px)",
      }}
      role="dialog"
      aria-label="도깨비 도감"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-bold">도깨비 도감</h2>
        <p className="m-0 text-xs text-[var(--color-text-secondary)]">
          {found} / {DOKEBI_ORDER.length}
        </p>
      </div>

      <ul className="m-0 mt-[var(--space-3)] flex list-none flex-col gap-[var(--space-3)] p-0">
        {DOKEBI_ORDER.map((id) => (
          <CodexEntry
            key={id}
            id={id}
            progress={progress}
            met={met}
            isCurrent={id === current}
            onSelect={onSelect}
          />
        ))}
      </ul>

      <div className="mt-[var(--space-4)] flex justify-end">
        <HudButton onClick={onClose} label="도감 닫기">
          닫기
        </HudButton>
      </div>
    </div>
  );
}

function CodexEntry({
  id,
  progress,
  met,
  isCurrent,
  onSelect,
}: {
  id: DokebiId;
  progress: DokebiProgress;
  met: readonly DokebiId[];
  isCurrent: boolean;
  onSelect: (id: DokebiId) => void;
}) {
  const spirit = DOKEBI[id];
  const unlocked = isUnlocked(id, progress, met);
  // 조건은 채웠지만 아직 찾아가지 않은 상태 — 도감이 이걸 구분해 줘야 한다.
  const revealed = !unlocked && revealedDokebi(progress).includes(id);
  const ratio = unlockRatio(spirit, progress, met);

  return (
    <li className="flex gap-[var(--space-3)]">
      {/*
        실루엣 — 잠겨 있으면 색을 지운다. 형태만 남겨 두면 "무언가 있다"는 것은
        알면서 정체는 모르는 상태가 된다.
      */}
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 rounded-[var(--radius-round)]"
        style={{
          width: "34px",
          height: "34px",
          background: unlocked ? spirit.bodyColor : "#3a3644",
          boxShadow: unlocked ? `0 0 12px ${spirit.accentColor}` : "none",
          border: `2px solid ${unlocked ? spirit.accentColor : "#4c4756"}`,
        }}
      />

      <div className="min-w-0 flex-1">
        <p className="m-0 flex items-center gap-2 text-sm font-semibold">
          {unlocked ? spirit.name : "???"}
          {isCurrent && (
            <span className="text-xs font-normal text-[var(--color-action-primary)]">동행 중</span>
          )}
        </p>

        {unlocked ? (
          <>
            <p className="m-0 mt-0.5 text-xs text-[var(--color-text-secondary)]">{spirit.tagline}</p>
            <p className="m-0 mt-1 text-xs">
              <span className="text-[var(--color-action-primary)]">{spirit.abilityName}</span>
              {" — "}
              {spirit.ability}
            </p>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => onSelect(id)}
                /*
                 * 글자는 작게 두되 **누르는 자리는 44px**로 잡는다.
                 * `text-xs underline`만 있었더니 높이가 글자 높이(약 16px)라
                 * 디자인 가이드의 「터치 영역 최소 44×44」를 한참 밑돌았다 —
                 * 손가락으로는 옆 카드가 눌린다.
                 */
                className="mt-1 inline-flex items-center text-xs underline"
                style={{ minHeight: "var(--touch-min)" }}
                aria-label={`${spirit.name} 데리고 다니기`}
              >
                데리고 다니기
              </button>
            )}
          </>
        ) : (
          <>
            <p className="m-0 mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {revealed ? "지도에 자리가 표시됐다. 찾아가 보자" : unlockHint(spirit)}
            </p>
            {/* 진행률은 셀 수 있는 조건에만 붙인다 */}
            {!revealed && spirit.requiredDefeats > 0 && (
              <p className="m-0 mt-1 text-xs tabular-nums">
                {Math.min(progress.defeatedTotal, spirit.requiredDefeats)} /{" "}
                {spirit.requiredDefeats}
                <span
                  aria-hidden="true"
                  className="ml-2 inline-block h-1 w-24 rounded-[var(--radius-round)] bg-[rgba(255,255,255,0.16)] align-middle"
                >
                  <span
                    className="block h-full rounded-[var(--radius-round)] bg-[var(--color-action-primary)]"
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
