"use client";

/**
 * 좌하단 — 체력.
 *
 * 넷이던 것이 하나가 됐다. 속도계는 성능 패널로, 무기는 바꾼 직후에만 뜨는
 * 알림으로 갔고, **미니맵은 걷어냈다** — 148px짜리 판이 늘 떠 있는 것은
 * 「세계가 먼저, UI는 나중에」와 정면으로 어긋난다(DESIGN_GUIDE). 원작
 * 트레일러 93장에도 미니맵은 한 장도 없다(DOKEV_VIDEO_STUDY 「그 밖 (프레임)」).
 *
 * 길을 잃지 않게 하는 일은 남은 셋이 나눠 맡는다: 목표 방향은 화면 위쪽 목표
 * 칸이, 대장 자리는 화살표(`bossPointer`)가, 도시 전체는 지도(`CityMap`)가
 * 요청할 때 연다.
 */

import type { WorldHudProps } from "@/components/hud/worldHudProps";
import { HealthPanel } from "@/components/hud/StatusPanels";

export function HudBottomLeft({ hud }: { hud: WorldHudProps }) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col-reverse items-start gap-[var(--space-2)]"
      style={{ bottom: "var(--safe-bottom)", left: "var(--safe-left)" }}
    >
      <HealthPanel combat={hud.combat} boss={hud.boss} />
    </div>
  );
}
