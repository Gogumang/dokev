"use client";

/**
 * 하단 중앙 — 스스로 떴다 사라지는 알림들.
 *
 * 다섯이 각자 절대 좌표를 들고 있었다 — 자판기 안내(+168)와 자리 알림(+208)이
 * 겹쳤고, 새 알림을 넣을 때마다 남은 틈을 찾아야 했다.
 *
 * 아래에서부터 쌓으므로 새 알림이 위로 밀려 올라간다. 보이는 것만 자리를
 * 차지한다 — 각 알림이 조건에 따라 null을 돌려준다.
 */

import { UnlockNotice } from "@/components/hud/Alerts";
import { CaptureNotice } from "@/components/hud/CaptureNotice";
import { WeaponNotice } from "@/components/hud/Alerts";
import { ShrineNotice, ShrinePrompt, VendingPrompt } from "@/components/hud/Prompts";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudBottomCenter({ hud, talkKey }: { hud: WorldHudProps; talkKey: string }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col-reverse items-center gap-[var(--space-2)]"
      style={{ bottom: "calc(var(--safe-bottom) + 96px)" }}
    >
      {hud.captureNotice && <CaptureNotice message={hud.captureNotice} />}
      <WeaponNotice stats={hud.stats} />
      <ShrinePrompt discovery={hud.discovery} talkKey={talkKey} />
      <UnlockNotice summary={hud.summary} questView={hud.questView} met={hud.metDokebi} />
      <VendingPrompt vending={hud.vending} />
      {/* 만나기 전 단계 — 자리가 드러났다는 것만 알린다 */}
      <ShrineNotice summary={hud.summary} questView={hud.questView} met={hud.metDokebi} />
    </div>
  );
}
