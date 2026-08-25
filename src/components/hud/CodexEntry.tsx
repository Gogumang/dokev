"use client";

/**
 * 도감의 항목 한 장.
 *
 * 잠긴 도깨비도 자리를 비워 두지 않고 실루엣과 조건을 보여 준다. 무엇이
 * 남았는지 모르면 도감은 목표가 아니라 벽이 된다.
 *
 * `views/`에 두지 않는다 — 잠금 여부·해금 비율·이야기를 **로스터에서 끌어오기**
 * 때문이다. 모양만 하는 것이 아니므로 그 자리는 거짓말이 된다.
 */

import { CodexEntryBody } from "@/components/hud/CodexEntryBody";
import {
  DOKEBI,
  isUnlocked,
  revealedDokebi,
  unlockRatio,
  type DokebiId,
  type DokebiProgress,
} from "@/game/dokebi/roster";

export function CodexEntry({
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

        <CodexEntryBody
          id={id}
          spirit={spirit}
          met={met}
          progress={progress}
          unlocked={unlocked}
          revealed={revealed}
          ratio={ratio}
          isCurrent={isCurrent}
          onSelect={onSelect}
        />
      </div>
    </li>
  );
}
