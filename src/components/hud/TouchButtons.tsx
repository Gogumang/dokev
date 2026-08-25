"use client";

/**
 * 터치 조작의 **버튼 쪽**.
 *
 * 왼쪽 가상 스틱과 나눈다 — 스틱은 손가락을 값으로 옮기는 일이고, 여기는
 * 「무엇을 누를 수 있는가」다. 없으면 폰에서 동료를 부르거나 능력을 쓸 방법이
 * 아예 없다.
 *
 * 2열 격자다. 버튼이 다섯을 넘으면서 세로로 쌓으면 화면을 덮었다.
 */

import { HudButton } from "@/components/hud/HudButton";
import { TouchActionButtons } from "@/components/hud/TouchActionButtons";
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
  return (
    <div
      className="absolute grid grid-cols-2 gap-[var(--space-2)]"
      style={{ bottom: "var(--safe-bottom)", right: "var(--safe-right)" }}
    >
      {/*
      동료 조작 — 키보드의 C·E에 대응한다.

      이게 없으면 모바일에서는 동료를 부르거나 능력을 쓸 방법이 아예 없다.
      2열 격자로 바꾼 이유는 버튼이 다섯 개가 되면서 세로로 쌓으면
      한 손 엄지 범위를 넘기 때문이다.
    */}
      <HudButton
        label={summoned ? `${dokebiName} 보내기` : `${dokebiName} 부르기`}
        pressed={summoned}
        onClick={() => {
          input.companionSummoned = !input.companionSummoned;
          setSummoned(input.companionSummoned);
        }}
      >
        {dokebiName}
      </HudButton>
      {/*
      능력 버튼.

      쿨다운 중에는 눌러도 아무 일이 없었고 이유를 알 방법이 없었다 —
      `canUseAbility`가 「HUD가 버튼 활성화에 쓴다」고 적힌 채 아무도
      쓰지 않고 있었다. 눌리는 것은 그대로 두고 **상태만 알린다**:
      막아 두면 "왜 안 눌리지"가 되고, 알려 주면 "기다리면 되는구나"가 된다.
    */}
      <HudButton
        label={abilityReady ? `능력 ${abilityName} 사용` : `능력 ${abilityName} 준비 중`}
        pressed={abilityReady}
        onClick={() => {
          input.companionAbilityQueued = true;
        }}
      >
        {abilityName}
      </HudButton>
      <TouchActionButtons input={input} boardOn={boardOn} setBoardOn={setBoardOn} />
    </div>
  );
}
