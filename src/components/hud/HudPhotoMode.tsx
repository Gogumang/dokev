"use client";

/**
 * 포토 모드의 HUD.
 *
 * 다른 것은 전부 숨긴다 — 사진에 목표 문구와 체력이 찍히면 쓸 수 없는 그림이
 * 된다 (DESIGN_GUIDE 「아이콘과 일러스트」의 UI 숨기기).
 */

import { PhotoControls } from "@/components/hud/PhotoControls";
import type { WorldHudProps } from "@/components/hud/worldHudProps";

export function HudPhotoMode({ hud }: { hud: WorldHudProps }) {
  return (
    <PhotoControls
      input={hud.input}
      recording={hud.recording}
      captureNotice={hud.captureNotice}
      timeOfDayName={hud.timeOfDayName}
      onCycleTimeOfDay={hud.onCycleTimeOfDay}
      photoFilterName={hud.photoFilterName}
      onCyclePhotoFilter={hud.onCyclePhotoFilter}
      photoPoseName={hud.photoPoseName}
      onCyclePhotoPose={hud.onCyclePhotoPose}
      onTakePhoto={hud.onTakePhoto}
      onToggleClip={hud.onToggleClip}
      onExit={hud.onTogglePhoto}
    />
  );
}
