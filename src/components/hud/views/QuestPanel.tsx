/**
 * 현재 목표 — 모양만.
 *
 * 값을 어디서 어떻게 읽는지 모른다. 훅도, 타이머도, 공유 객체도 없다.
 * 접을지 말지는 이미 정해져서 `expanded`로 온다(`hudViews.questPanelView`).
 */

import type { QuestPanelView } from "@/game/systems/hudViews";

/**
 * 접힌 모습 — 제목과 진행 수만.
 *
 * 진행 수를 남기는 이유: 「로봇 3/5」는 목표가 바뀌지 않아도 계속 변하는 값이라,
 * 이것까지 감추면 접힌 동안 무엇이 진행되는지 알 길이 없다.
 */
function Collapsed({ title, counter }: { title: string; counter: string }) {
  return (
    <div
      className="hud-scrim pointer-events-none absolute flex items-baseline gap-[var(--space-2)] rounded-[var(--radius-round)] px-3 py-1.5"
      style={{ top: "var(--safe-top)", left: "var(--safe-left)", maxWidth: "min(40ch, 62vw)" }}
      role="status"
      aria-live="polite"
    >
      <span className="text-sm font-semibold">{title}</span>
      {counter && (
        <span className="tabular text-xs text-[var(--color-text-secondary)]">{counter}</span>
      )}
    </div>
  );
}

export function QuestPanel({ view }: { view: QuestPanelView }) {
  if (!view.visible) return null;
  if (!view.expanded) return <Collapsed title={view.title} counter={view.counter} />;

  return (
    <div
      className="hud-scrim pointer-events-none absolute rounded-[var(--radius-md)] px-4 py-3"
      style={{ top: "var(--safe-top)", left: "var(--safe-left)", maxWidth: "min(46ch, 70vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs tracking-wide text-[var(--color-text-secondary)]">현재 목표</p>
      <p className="m-0 mt-1 text-base font-semibold">{view.title}</p>
      {view.hint && (
        <p className="m-0 mt-1 text-sm text-[var(--color-text-secondary)]">{view.hint}</p>
      )}
      {view.counter && <p className="tabular m-0 mt-1 text-sm font-semibold">{view.counter}</p>}
      {/* 진행 막대 — 색만으로 상태를 구분하지 않도록 위 문구와 함께 쓴다 */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-[var(--radius-round)] bg-white/15">
        <div
          className="h-full rounded-[var(--radius-round)] bg-[var(--color-action-primary)] transition-[width]"
          style={{ width: `${Math.round(view.ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
