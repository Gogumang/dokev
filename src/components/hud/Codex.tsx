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

import { HudButton } from "@/components/hud/HudButton";
import { CodexEntry } from "@/components/hud/CodexEntry";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import { useDialogFocus } from "@/components/hud/useDialogFocus";
import { DOKEBI_ORDER, isUnlocked, type DokebiId, type DokebiProgress } from "@/game/dokebi/roster";
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
  const progress: DokebiProgress = useSampled(
    () => ({
      defeatedTotal: summary.defeated,
      questCompleted: questView.firstQuestDone,
      bossDefeated: summary.bossDefeated,
    }),
    POLL_MS,
    shallowEqual,
  );

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
