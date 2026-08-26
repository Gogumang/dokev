"use client";

/**
 * 터치 조작의 **버튼 쪽**.
 *
 * 왼쪽 가상 스틱과 나눈다 — 스틱은 손가락을 값으로 옮기는 일이고, 여기는
 * 「무엇을 누를 수 있는가」다.
 *
 * 열이던 것이 **넷 + 접기 하나**가 됐다(요청: 모바일 버튼을 웬만하면 다 빼
 * 달라). 늘 뜨는 넷은 여정이 요구하는 것뿐이고(`TouchActionButtons`),
 * 나머지 여섯은 「⋯」 뒤에 접힌다(`TouchExtraButtons`).
 */

import { useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import { TouchActionButtons } from "@/components/hud/TouchActionButtons";
import { TouchExtraButtons } from "@/components/hud/TouchExtraButtons";
import type { InputState } from "@/game/systems/input";

export function TouchButtons({
  input,
  abilityName,
  abilityReady,
  dokebiName,
  boardOn,
  setBoardOn,
  summoned,
  setSummoned,
}: {
  input: InputState;
  abilityName: string;
  abilityReady: boolean;
  dokebiName: string;
  boardOn: boolean;
  setBoardOn: (on: boolean) => void;
  summoned: boolean;
  setSummoned: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="absolute grid grid-cols-2 gap-[var(--space-2)]"
      style={{ bottom: "var(--safe-bottom)", right: "var(--safe-right)" }}
    >
      {open && (
        <TouchExtraButtons
          input={input}
          abilityName={abilityName}
          abilityReady={abilityReady}
          dokebiName={dokebiName}
          summoned={summoned}
          setSummoned={setSummoned}
        />
      )}
      {/*
        접기 단추.

        접힌 여섯에 닿는 **유일한 통로**다. 이것까지 지우면 폰에서 동료·능력·
        무기가 영영 안 잡힌다.
      */}
      <HudButton
        onClick={() => setOpen(!open)}
        expanded={open}
        label={open ? "행동 버튼 접기" : "행동 버튼 더 보기"}
      >
        {open ? "닫기" : "⋯"}
      </HudButton>
      <TouchActionButtons input={input} boardOn={boardOn} setBoardOn={setBoardOn} />
    </div>
  );
}
