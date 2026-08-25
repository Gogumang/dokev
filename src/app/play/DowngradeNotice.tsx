"use client";

/**
 * 자동 강등 안내.
 *
 * DESIGN_GUIDE 「공개 품질 게이트」의 "품질을 자동 낮추고 선택권을 제공".
 * 조용히 낮추면 화면이 갑자기 거칠어진 이유를 알 수 없다.
 */

import type { QualityLevel } from "@/game/systems/quality";

export function DowngradeNotice({
  level,
  onDismiss,
}: {
  level: QualityLevel;
  onDismiss: () => void;
}) {
  const labels: Record<QualityLevel, string> = {
    low: "가벼움",
    medium: "보통",
    high: "높음",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="hud-scrim absolute left-1/2 flex -translate-x-1/2 items-center gap-[var(--space-4)] rounded-[var(--radius-md)] px-4 py-3"
      style={{ bottom: "calc(var(--safe-bottom) + 72px)" }}
    >
      <p className="m-0 text-sm">
        프레임이 낮아 그래픽 품질을 <strong>{labels[level]}</strong>으로 낮췄습니다.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-[var(--radius-round)] px-3 text-sm font-semibold underline"
        style={{ minHeight: "var(--touch-min)" }}
      >
        확인
      </button>
    </div>
  );
}
