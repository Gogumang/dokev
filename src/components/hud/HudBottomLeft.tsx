"use client";

/**
 * 좌하단 — 체력과 미니맵.
 *
 * 미니맵(148px)이 속도·체력을 통째로 덮고 있었다. 높이를 추정해 간격을 정하는
 * 방식은 하나만 커져도 다시 겹치므로 쌓는다.
 *
 * 네 칸이던 것이 둘이 됐다 — 속도계는 성능 패널로 갔고, 무기는 바꾼 직후에만
 * 뜨는 알림이 됐다 (DESIGN_GUIDE 「세계가 먼저, UI는 나중에」).
 */

import type { WorldHudProps } from "@/components/hud/worldHudProps";
import { Minimap } from "@/components/hud/Minimap";
import { HealthPanel } from "@/components/hud/StatusPanels";
import type { DokebiSpirit } from "@/game/dokebi/roster";

export function HudBottomLeft({
  hud,
  discoveries,
}: {
  hud: WorldHudProps;
  discoveries: readonly DokebiSpirit[];
}) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col-reverse items-start gap-[var(--space-2)]"
      style={{ bottom: "var(--safe-bottom)", left: "var(--safe-left)" }}
    >
      <HealthPanel combat={hud.combat} boss={hud.boss} />
      <Minimap
        stats={hud.stats}
        questView={hud.questView}
        combat={hud.combat}
        boss={hud.boss}
        discoveries={discoveries}
      />
    </div>
  );
}
