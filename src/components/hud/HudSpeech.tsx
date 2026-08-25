"use client";

/**
 * 좌상단 말풍선 더미.
 *
 * 동료 대사와 주민·간판 대사가 각자 좌표를 들고 있었다. 6px 차이로 안 겹쳤을
 * 뿐이라, 동료 대사가 좁은 화면에서 한 줄 늘어나면 곧바로 밑을 덮는다. 쌓아
 * 두면 위가 늘어난 만큼 아래가 밀린다.
 */

import { ScriptBox } from "@/components/hud/ScriptBox";
import { CompanionSpeech, ResidentSpeech } from "@/components/hud/Speech";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudSpeech({ hud, talkKey }: { hud: WorldHudProps; talkKey: string }) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col gap-[var(--space-2)]"
      style={{ top: "calc(var(--safe-top) + 132px)", left: "var(--safe-left)" }}
    >
      <CompanionSpeech dialogue={hud.dialogue} speaker={hud.dokebiName} />
      <ResidentSpeech talk={hud.talkView} talkKey={talkKey} />
      {/* 대본은 말풍선보다 아래·크게. 「읽는 말」과 「지나가는 말」을 갈라 둔다 */}
      <ScriptBox line={hud.scriptLine} />
    </div>
  );
}
