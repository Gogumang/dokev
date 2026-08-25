"use client";

/**
 * 소리·모션 토글.
 *
 * 둘 다 **설정 저장소를 직접 구독한다** — 메뉴가 값을 들고 내려 주면, 키보드로
 * 바꿨을 때 화면과 실제가 갈라진다.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { HudButton } from "@/components/hud/HudButton";
import type { InputState } from "@/game/systems/input";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  updateSettings,
} from "@/game/systems/settings";

/**
 * 소리 토글.
 *
 * HUD는 **설정만 바꾼다.** 오디오 컨텍스트를 직접 만지지 않는다 — 소리를
 * 켜고 끄는 경로가 둘이 되면 설정과 실제 소리가 어긋난다
 * (`tests/inputState.test.ts`).
 */
export function SoundToggle({ input }: { input: InputState }) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );

  const toggle = useCallback(() => updateSettings({ sound: !settings.sound }), [settings.sound]);

  // 키보드(M)도 같은 경로를 쓴다. 큐를 여기서 소비한다.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!input.soundToggleQueued) return;
      input.soundToggleQueued = false;
      updateSettings({ sound: !getSettingsSnapshot().sound });
    }, 100);
    return () => window.clearInterval(id);
  }, [input]);

  return (
    <HudButton
      onClick={toggle}
      pressed={settings.sound}
      label={settings.sound ? "소리 끄기" : "소리 켜기"}
    >
      {settings.sound ? "소리" : "음소거"}
    </HudButton>
  );
}

/** 저감 모션 토글. 이름은 시작 화면과 **같아야** 한다 — 다르면 같은 설정으로 안 읽힌다 */
export function MotionToggle() {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );

  const toggle = useCallback(
    () => updateSettings({ reducedMotion: !settings.reducedMotion }),
    [settings.reducedMotion],
  );

  return (
    <HudButton
      onClick={toggle}
      pressed={settings.reducedMotion}
      label={settings.reducedMotion ? "모션 줄이기 끄기" : "모션 줄이기"}
    >
      모션
    </HudButton>
  );
}
