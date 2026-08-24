"use client";

/**
 * HUD 공통 버튼.
 *
 * 최소 크기를 `--touch-min`으로 잡는다 — DESIGN_GUIDE의 터치 대상 크기 기준이고,
 * 마우스에서도 작은 버튼보다 누르기 쉽다.
 */

import type React from "react";

export function HudButton({
  children,
  onClick,
  label,
  pressed,
  expanded,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  pressed?: boolean;
  /**
   * 대화상자를 여는 버튼인지.
   *
   * `pressed`(눌린 상태)와 다르다 — 이건 "누르면 무언가 펼쳐진다"는 뜻이고,
   * 낭독기가 그렇게 안내한다. 지도·도감처럼 패널을 여는 버튼에 쓴다.
   */
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={expanded === undefined ? pressed : undefined}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      className="hud-scrim rounded-[var(--radius-round)] px-4 text-sm font-semibold text-[var(--color-text-primary)]"
      style={{ minHeight: "var(--touch-min)", minWidth: "var(--touch-min)" }}
    >
      {children}
    </button>
  );
}
