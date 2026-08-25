"use client";

/**
 * 도감 항목의 **속**.
 *
 * 만난 도깨비에게는 능력과 사연을, 못 만난 도깨비에게는 조건과 진행도를 보여
 * 준다. 잠긴 자리를 비워 두지 않는 것이 이 화면의 규칙이다 — 무엇이 남았는지
 * 모르면 도감은 목표가 아니라 벽이 된다.
 */

import {
  storyFor,
  unlockHint,
  type DokebiId,
  type DokebiProgress,
  type DokebiSpirit,
} from "@/game/dokebi/roster";

export function CodexEntryBody({
  id,
  spirit,
  met,
  progress,
  unlocked,
  revealed,
  ratio,
  isCurrent,
  onSelect,
}: {
  id: DokebiId;
  spirit: DokebiSpirit;
  met: readonly DokebiId[];
  progress: DokebiProgress;
  unlocked: boolean;
  /** 조건은 채웠지만 아직 찾아가지 않은 상태 — 도감이 이걸 구분해 줘야 한다 */
  revealed: boolean;
  /** 해금까지의 진행 비율 0~1 */
  ratio: number;
  isCurrent: boolean;
  onSelect: (id: DokebiId) => void;
}) {
  return (
    <>
      {unlocked ? (
        <>
          <p className="m-0 mt-0.5 text-xs text-[var(--color-text-secondary)]">{spirit.tagline}</p>
          <p className="m-0 mt-1 text-xs">
            <span className="text-[var(--color-action-primary)]">{spirit.abilityName}</span>
            {" — "}
            {spirit.ability}
          </p>
          {/*
        사연 — **만난 뒤에만** 온다. 여기서 조건을 다시 보지 않는다:
        `storyFor`가 못 만난 도깨비에게 빈 목록을 돌려주므로 화면은
        없는 것을 그릴 수 없다. 가리는 것과 안 받는 것은 다르다.
      */}
          {storyFor(id, met).map((line) => (
            <p key={line} className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">
              {line}
            </p>
          ))}
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
              {Math.min(progress.defeatedTotal, spirit.requiredDefeats)} / {spirit.requiredDefeats}
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
    </>
  );
}
