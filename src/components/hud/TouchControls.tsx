"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * 터치 조작은 포인터 이벤트 핸들러에서 공유 InputState의 필드를 갱신한다.
 * 렌더 중이 아니라 이벤트 콜백에서 일어나는 변경이고, 이를 setState로 바꾸면
 * 스틱을 움직이는 동안 매 이벤트마다 리렌더가 발생한다.
 */
/* eslint-disable react-hooks/immutability */

import { useRef, useState } from "react";

import { STICK_RADIUS } from "@/components/hud/touchStick";
import { TouchButtons } from "@/components/hud/TouchButtons";
import { useVirtualStick } from "@/components/hud/useVirtualStick";
import type { InputState } from "@/game/systems/input";

/* ------------------------------------------------------------------ */
/* 터치 조작                                                            */
/* ------------------------------------------------------------------ */

/**
 * 모바일 조작 — 좌측 가상 스틱, 우측 드래그 시점, 액션 버튼.
 *
 * DESIGN_GUIDE 「입력 방식」 입력 표를 따른다. 스틱은 고정 위치가 아니라 처음 닿은
 * 지점을 원점으로 삼는다. 엄지 위치가 사람마다 달라 고정 스틱은 잘 빗나간다.
 */
export function TouchControls({
  input,
  abilityName,
  abilityReady,
  dokebiName,
}: {
  input: InputState;
  /** 지금 동료의 능력 이름. 버튼 글자가 도깨비를 따라가야 한다 */
  abilityName: string;
  /** 지금 쓸 수 있는지. 쿨다운 중이면 이름으로 알린다 */
  abilityReady: boolean;
  /** 지금 동료의 이름. 「초롱」을 박아 두었더니 도깨비가 셋이 된 뒤 거짓말이 됐다 */
  dokebiName: string;
}) {
  const knobRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const [boardOn, setBoardOn] = useState(false);
  // 동료는 처음부터 소환된 상태로 시작한다 (input의 기본값과 맞춘다).
  const [summoned, setSummoned] = useState(true);

  useVirtualStick({ input, knobRef, baseRef });

  return (
    <>
      <div
        ref={baseRef}
        aria-hidden="true"
        className="pointer-events-none fixed rounded-full border-2 border-white/35"
        style={{
          width: STICK_RADIUS * 2,
          height: STICK_RADIUS * 2,
          transform: "translate(-50%, -50%)",
          opacity: 0,
        }}
      >
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 rounded-full bg-white/55"
          style={{ width: 44, height: 44, transform: "translate(-50%, -50%)" }}
        />
      </div>

      <TouchButtons
        input={input}
        abilityName={abilityName}
        abilityReady={abilityReady}
        dokebiName={dokebiName}
        boardOn={boardOn}
        setBoardOn={setBoardOn}
        summoned={summoned}
        setSummoned={setSummoned}
      />
    </>
  );
}
