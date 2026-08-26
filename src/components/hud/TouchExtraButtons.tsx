"use client";

/**
 * 접어 두는 행동 버튼 — 춤·음료·그래플·무기·동료·능력.
 *
 * 늘 떠 있던 것을 접었다(요청: 모바일 버튼을 웬만하면 다 빼 달라). 폰에서
 * 아래쪽 절반이 버튼으로 덮여 **게임 화면보다 조작이 넓었다.**
 *
 * 지우지 않고 접는 이유: 터치에는 키보드 단축키라는 대안이 없다. 지우면
 * 폰에서는 동료를 부르거나 무기를 바꿀 방법이 **영영 없어진다** — 저장소가
 * 그 동등성을 검사로 지킨다(`tests/controls.test.ts` 「모든 행에 터치
 * 대안이 있다」).
 *
 * 여섯이 접히고 넷이 남는다. 남은 넷은 **여정이 요구하는 것**이다: 공격
 * (로봇 셋·대장), 점프(활강 1.5초), 탈것(타기 단계), 살펴보기(흔적 줍기).
 * 이 넷 중 하나라도 접으면 폰에서 한 판을 끝낼 수 없다.
 */

import { HudButton } from "@/components/hud/HudButton";
import type { InputState } from "@/game/systems/input";

export function TouchExtraButtons({
  input,
  abilityName,
  abilityReady,
  dokebiName,
  summoned,
  setSummoned,
}: {
  input: InputState;
  abilityName: string;
  abilityReady: boolean;
  dokebiName: string;
  summoned: boolean;
  setSummoned: (on: boolean) => void;
}) {
  return (
    <>
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
        쿨다운 중에도 눌리는 것은 그대로 두고 **상태만 알린다** — 막아 두면
        "왜 안 눌리지"가 되고, 알려 주면 "기다리면 되는구나"가 된다.
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
      <HudButton
        label="춤추기"
        onClick={() => {
          input.danceQueued = true;
        }}
      >
        춤
      </HudButton>
      <HudButton
        label="음료 뽑기"
        onClick={() => {
          input.drinkQueued = true;
        }}
      >
        음료
      </HudButton>
      <HudButton
        label="그래플 걸기"
        onClick={() => {
          input.grappleQueued = true;
        }}
      >
        그래플
      </HudButton>
      {/* 무엇으로 바뀌었는지는 화면 위쪽 알림이 말한다 — 여기는 손가락에 가린다 */}
      <HudButton
        label="무기 바꾸기"
        onClick={() => {
          input.weaponQueued = true;
        }}
      >
        무기
      </HudButton>
    </>
  );
}
