"use client";

/**
 * 늘 떠 있는 행동 버튼 — 살펴보기·탈것, 그리고 공격·점프.
 *
 * **여정이 요구하는 것만** 남긴다. 흔적을 주우려면 살펴보기가 있어야 하고
 * (`stepInteraction`이 `talkQueued`를 본다), 「탈것을 탄다」 단계는 탈것
 * 버튼 없이는 넘어갈 수 없다. 공격과 점프는 로봇 셋·대장·활강 1.5초가
 * 걸려 있다.
 *
 * 나머지 여섯(춤·음료·그래플·무기·동료·능력)은 접었다
 * (`TouchExtraButtons`). 폰 화면 아래 절반이 버튼으로 덮여 있었다.
 */

import { HudButton } from "@/components/hud/HudButton";
import { TouchJumpButton } from "@/components/hud/TouchJumpButton";
import type { InputState } from "@/game/systems/input";

export function TouchActionButtons({
  input,
  boardOn,
  setBoardOn,
}: {
  input: InputState;
  boardOn: boolean;
  setBoardOn: (on: boolean) => void;
}) {
  return (
    <>
      <HudButton
        label="가까운 주민이나 간판 살펴보기"
        onClick={() => {
          input.talkQueued = true;
        }}
      >
        살펴보기
      </HudButton>
      <HudButton
        label={boardOn ? "탈것에서 내리기" : "탈것 타기"}
        pressed={boardOn}
        onClick={() => {
          /*
           * 무엇을 탈지는 곁에 무엇이 세워져 있느냐가 정한다 — 여기서
           * 고르지 않는다. 세상을 아는 쪽이 다음 프레임에 결정한다.
           */
          input.vehicleQueued = true;
          setBoardOn(input.vehicle === null);
        }}
      >
        탈것
      </HudButton>
      <TouchJumpButton input={input} />
    </>
  );
}
