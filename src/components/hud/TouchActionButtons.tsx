"use client";

/**
 * 터치 조작의 **행동 버튼** — 춤·살펴보기·음료·그래플·보드·점프.
 *
 * 동료 조작(부르기·능력·교체)과 나눈다. 저쪽은 「누구와 함께 있는가」이고
 * 여기는 「지금 무엇을 하는가」다.
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
        label="춤추기"
        onClick={() => {
          input.danceQueued = true;
        }}
      >
        춤
      </HudButton>
      <HudButton
        label="가까운 주민이나 간판 살펴보기"
        onClick={() => {
          input.talkQueued = true;
        }}
      >
        살펴보기
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
      {/*
      무기 바꾸기.

      키보드의 Q와 같은 신호를 큐에 담는다. 무엇으로 바뀌었는지는 이
      버튼이 말하지 않는다 — 손가락에 가려지는 자리라, 알림은 화면
      위쪽(`Notices`)이 맡는다.
    */}
      <HudButton
        label="무기 바꾸기"
        onClick={() => {
          input.weaponQueued = true;
        }}
      >
        무기
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
      {/*
      공격 버튼.

      이게 없으면 모바일에서 퀘스트 4단계(로봇 3기)를 완주할 수 없다.
      키보드의 J와 같은 신호를 큐에 담는다.
    */}
      <TouchJumpButton input={input} />
    </>
  );
}
