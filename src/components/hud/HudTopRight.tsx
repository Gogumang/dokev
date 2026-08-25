"use client";

/**
 * 우상단 — 성능 패널과 도감.
 *
 * 둘 다 버튼으로 켜므로 함께 열면 **완전히 같은 자리**(+56px, right)에
 * 포개졌다. 좌표를 손으로 맞추는 대신 쌓는다.
 */

import { Codex } from "@/components/hud/Codex";
import { PerfPanel } from "@/components/hud/PerfPanel";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudTopRight({
  hud,
  codexOpen,
  onCloseCodex,
}: {
  hud: WorldHudProps;
  codexOpen: boolean;
  onCloseCodex: () => void;
}) {
  return (
    <div
      className="absolute flex flex-col items-end gap-[var(--space-2)]"
      style={{ top: "calc(var(--safe-top) + 56px)", right: "var(--safe-right)" }}
    >
      {hud.showPerf && <PerfPanel stats={hud.stats} quality={hud.quality} boss={hud.boss} />}
      {codexOpen && (
        <Codex
          current={hud.dokebi}
          summary={hud.summary}
          questView={hud.questView}
          met={hud.metDokebi}
          onSelect={hud.onSelectDokebi}
          onClose={onCloseCodex}
        />
      )}
    </div>
  );
}
