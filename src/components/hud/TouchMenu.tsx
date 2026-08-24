"use client";

/**
 * 터치 기기 전용 메뉴 — 우상단 버튼 묶음.
 *
 * 원래 이 버튼들은 데스크톱에서도 늘 떠 있었다. **화면에서 빼 달라는 요청**을
 * 받아 걷어냈는데, 그대로 지우면 터치 기기에서는 소리·모션·지도·도감·사진을
 * 켤 방법이 통째로 사라진다 — 키보드가 없으니 단축키가 대안이 되지 못한다.
 * 저장소도 그 동등성을 검사로 지키고 있다(`tests/controls.test.ts`
 * 「키로 되는 모든 기능에 터치 버튼이 있다」).
 *
 * 그래서 지우는 대신 **입력 수단이 없는 쪽에만** 남긴다. 데스크톱에서는
 * 렌더되지 않는다.
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
function SoundToggle({ input }: { input: InputState }) {
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
function MotionToggle() {
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

export function TouchMenu({
  input,
  dokebiName,
  dokebiUnlockedCount,
  mapOpen,
  codexOpen,
  showPerf,
  onCycleDokebi,
  onToggleMap,
  onToggleCodex,
  onTogglePhoto,
  onTogglePerf,
  onExit,
}: {
  input: InputState;
  dokebiName: string;
  dokebiUnlockedCount: number;
  mapOpen: boolean;
  codexOpen: boolean;
  showPerf: boolean;
  onCycleDokebi: () => void;
  onToggleMap: () => void;
  onToggleCodex: () => void;
  onTogglePhoto: () => void;
  onTogglePerf: () => void;
  onExit: () => void;
}) {
  /*
   * `flex-wrap`이 반드시 있어야 한다. 버튼 일곱 개가 480px인데 폰 가로 폭에서
   * 안전 영역을 빼면 340px 남짓이라, 넘친 버튼은 화면 밖으로 밀려 아예 누를
   * 수 없다.
   */
  return (
    <div
      className="absolute flex max-w-[calc(100vw-2rem)] flex-wrap justify-end gap-[var(--space-2)]"
      style={{ top: "var(--safe-top)", right: "var(--safe-right)" }}
    >
      {/* 도깨비가 하나뿐일 때는 버튼을 숨긴다 — 눌러도 아무 일이 없다 */}
      {dokebiUnlockedCount > 1 && (
        <HudButton onClick={onCycleDokebi} label={`동료 바꾸기 (지금 ${dokebiName})`}>
          {dokebiName}
        </HudButton>
      )}
      <SoundToggle input={input} />
      <MotionToggle />
      <HudButton
        onClick={onToggleMap}
        expanded={mapOpen}
        label={mapOpen ? "도시 지도 닫기" : "도시 지도 열기"}
      >
        지도
      </HudButton>
      <HudButton
        onClick={onToggleCodex}
        expanded={codexOpen}
        label={codexOpen ? "도감 닫기" : "도감 열기"}
      >
        도감
      </HudButton>
      <HudButton onClick={onTogglePhoto} label="포토 모드 켜기">
        사진
      </HudButton>
      <HudButton onClick={onTogglePerf} pressed={showPerf} label="성능 패널 표시 전환">
        성능
      </HudButton>
      <HudButton onClick={onExit} label="랜딩 화면으로 나가기">
        나가기
      </HudButton>
    </div>
  );
}
