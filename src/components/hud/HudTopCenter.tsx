"use client";

/**
 * 위쪽 가운데 — 대장 체력과 구역 배너.
 *
 * 둘이 각자 좌표를 들고 있었고 간격은 손으로 맞춘 값이었다. 좌상단 목표 패널이
 * 좁은 화면에서 가운데까지 닿으므로 시작 위치는 그 아래(+96)에 둔다.
 */

import { DistrictBanner } from "@/components/hud/Alerts";
import { BossHealth } from "@/components/hud/BossHud";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudTopCenter({ hud }: { hud: WorldHudProps }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-[var(--space-2)]"
      style={{ top: "calc(var(--safe-top) + 96px)" }}
    >
      <BossHealth boss={hud.boss} />
      <DistrictBanner district={hud.district} />
    </div>
  );
}
