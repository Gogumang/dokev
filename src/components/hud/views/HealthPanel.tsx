/**
 * 체력 — 모양만.
 *
 * 칸으로 그린다: 막대 하나는 「얼마나 남았나」를 대략만 알려주지만, 칸은
 * 「몇 대 더 맞을 수 있나」를 셀 수 있다. 색만으로 구분하지 않도록 숫자도 남긴다
 * (DESIGN_GUIDE 「색상」).
 *
 * **언제 보이는가는 여기서 정하지 않는다.** `hudViews.healthPanelView`가 정하고
 * `visible`로 온다 — 그 규칙은 값으로 재는 검사가 따로 지킨다.
 */

import type { HealthPanelView } from "@/game/systems/hudViews";

export function HealthPanel({ view }: { view: HealthPanelView }) {
  if (!view.visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-3 py-2"
      role="status"
      aria-live="off"
      aria-label={`체력 ${view.filled} / ${view.total}`}
    >
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: view.total }, (_, index) => (
          <span
            key={index}
            className="h-3 w-3 rounded-[2px]"
            style={{
              background:
                index < view.filled ? "var(--color-status-danger)" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>
      <span className="tabular text-xs text-[var(--color-text-secondary)]">
        {view.filled}/{view.total}
      </span>
      {view.downed && (
        <span className="text-xs font-semibold text-[var(--color-status-warning)]">
          쓰러짐 — 곧 일어납니다
        </span>
      )}
    </div>
  );
}
