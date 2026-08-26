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
 *
 * 그 여덟도 **접었다**(요청: 모바일 버튼을 웬만하면 다 빼 달라). 아래쪽
 * 행동 버튼과 합쳐 열여덟이 화면에 떠 있었다 — 게임보다 조작이 넓었다.
 * 평소에는 「메뉴」 하나만 뜨고, 누르면 펼쳐진다.
 */

import { useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import { MotionToggle, SoundToggle } from "@/components/hud/MenuToggles";
import type { InputState } from "@/game/systems/input";

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
  const [open, setOpen] = useState(false);

  /*
   * 펼치면 **세로로 쌓는다.**
   *
   * 예전에는 가로로 늘어놓고 `flex-wrap`으로 넘겼다. 여덟이 늘 떠 있을 때는
   * 그것이 최선이었지만 — 접고 나니 이것은 「줄」이 아니라 **눌러서 여는
   * 목록**이다. 세로가 그 뜻에 맞고, 폰 가로 폭을 넘길 일도 없어진다.
   */
  return (
    <div
      className="absolute flex flex-col items-end gap-[var(--space-2)]"
      style={{ top: "var(--safe-top)", right: "var(--safe-right)" }}
    >
      <HudButton
        onClick={() => setOpen(!open)}
        expanded={open}
        label={open ? "메뉴 닫기" : "메뉴 열기"}
      >
        {open ? "닫기" : "메뉴"}
      </HudButton>
      {!open ? null : (
        <>
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
        </>
      )}
    </div>
  );
}
