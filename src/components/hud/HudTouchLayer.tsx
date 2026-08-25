"use client";

/**
 * 터치 기기에서만 뜨는 것들 — 우상단 메뉴와 가상 스틱.
 *
 * 데스크톱에서는 지도·도감·사진·성능·소리·모션·나가기가 전부 키보드 단축키로
 * 되므로 버튼은 두 번째 입구였다(요청: 화면에서 빼 달라). 터치에는 그 대안이
 * 없어서 통째로 지우면 접근할 방법이 사라진다.
 *
 * 가상 스틱은 **안내가 아니라 입력 수단 자체**라 없으면 폰에서 움직일 방법이
 * 없다.
 */

import { TouchControls } from "@/components/hud/TouchControls";
import { TouchMenu } from "@/components/hud/TouchMenu";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudTouchLayer({
  hud,
  panels,
}: {
  hud: WorldHudProps;
  panels: { codexOpen: boolean; mapOpen: boolean; openCodex: () => void; openMap: () => void };
}) {
  return (
    <>
      {/*
      우상단 메뉴는 **터치 기기에서만** 뜬다 (요청: 화면에서 빼 달라).

      데스크톱에서는 지도·도감·사진·성능·소리·모션·나가기가 전부 키보드
      단축키로 되므로 버튼은 두 번째 입구였다. 터치에는 그 대안이 없어서
      통째로 지우면 접근할 방법이 사라진다. 넘치는 버튼을 접는 규칙은
      `TouchMenu`가 들고 있다.
      */}
      <TouchMenu
        input={hud.input}
        dokebiName={hud.dokebiName}
        dokebiUnlockedCount={hud.dokebiUnlockedCount}
        mapOpen={panels.mapOpen}
        codexOpen={panels.codexOpen}
        showPerf={hud.showPerf}
        onCycleDokebi={hud.onCycleDokebi}
        onToggleMap={panels.openMap}
        onToggleCodex={panels.openCodex}
        onTogglePhoto={hud.onTogglePhoto}
        onTogglePerf={hud.onTogglePerf}
        onExit={hud.onExit}
      />
      <TouchControls
        input={hud.input}
        abilityName={hud.abilityName}
        abilityReady={hud.combat.companionAbilityReady}
        dokebiName={hud.dokebiName}
      />
    </>
  );
}
