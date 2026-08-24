"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * 터치 조작은 포인터 이벤트 핸들러에서 공유 InputState의 필드를 갱신한다.
 * 렌더 중이 아니라 이벤트 콜백에서 일어나는 변경이고, 이를 setState로 바꾸면
 * 스틱을 움직이는 동안 매 이벤트마다 리렌더가 발생한다.
 */
/* eslint-disable react-hooks/immutability */

import { useEffect, useRef, useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import type { InputState } from "@/game/systems/input";

/* ------------------------------------------------------------------ */
/* 터치 조작                                                            */
/* ------------------------------------------------------------------ */

const STICK_RADIUS = 56;

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

  useEffect(() => {
    const origin = { x: 0, y: 0 };
    let stickPointer: number | null = null;
    let lookPointer: number | null = null;
    let lastLook = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const isLeftHalf = event.clientX < window.innerWidth / 2;

      if (isLeftHalf && stickPointer === null) {
        stickPointer = event.pointerId;
        origin.x = event.clientX;
        origin.y = event.clientY;
        if (baseRef.current) {
          baseRef.current.style.opacity = "1";
          baseRef.current.style.left = `${event.clientX}px`;
          baseRef.current.style.top = `${event.clientY}px`;
        }
      } else if (!isLeftHalf && lookPointer === null) {
        lookPointer = event.pointerId;
        lastLook = { x: event.clientX, y: event.clientY };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId === stickPointer) {
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        const distance = Math.hypot(dx, dy);
        const clamped = Math.min(distance, STICK_RADIUS);
        const nx = distance > 0 ? (dx / distance) * (clamped / STICK_RADIUS) : 0;
        const ny = distance > 0 ? (dy / distance) * (clamped / STICK_RADIUS) : 0;

        input.moveX = nx;
        // 화면 위쪽으로 밀면 전진이므로 y를 뒤집는다.
        input.moveZ = -ny;
        // 스틱을 끝까지 밀면 자동으로 달린다 — 별도 달리기 버튼을 두지 않는다.
        input.run = Math.hypot(nx, ny) > 0.85;

        if (knobRef.current) {
          knobRef.current.style.transform = `translate(-50%, -50%) translate(${
            nx * STICK_RADIUS
          }px, ${ny * STICK_RADIUS}px)`;
        }
      } else if (event.pointerId === lookPointer) {
        input.lookDeltaX += event.clientX - lastLook.x;
        input.lookDeltaY += event.clientY - lastLook.y;
        lastLook = { x: event.clientX, y: event.clientY };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === stickPointer) {
        stickPointer = null;
        input.moveX = 0;
        input.moveZ = 0;
        input.run = false;
        if (baseRef.current) baseRef.current.style.opacity = "0";
        if (knobRef.current) knobRef.current.style.transform = "translate(-50%, -50%)";
      } else if (event.pointerId === lookPointer) {
        lookPointer = null;
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [input]);

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
        <button
          type="button"
          aria-label="공격"
          onPointerDown={() => {
            input.attackQueued = true;
          }}
          className="hud-scrim rounded-[var(--radius-round)] px-6 text-base font-bold"
          style={{
            minHeight: "calc(var(--touch-min) * 1.4)",
            minWidth: "calc(var(--touch-min) * 1.4)",
          }}
        >
          공격
        </button>
        {/*
          점프 버튼.

          누르는 순간 점프를 큐에 담고, **누르고 있는 동안** jumpHeld를 세운다.
          활강은 눌림이 아니라 유지로 판정하므로 이것이 없으면 모바일에서
          활강이 아예 되지 않는다 — 퀘스트 5단계가 막힌다.

          pointerup만으로는 부족하다. 손가락이 버튼 밖으로 미끄러지면
          pointerup이 오지 않아 jumpHeld가 켜진 채로 남는다.
        */}
        <button
          type="button"
          aria-label="점프 · 길게 누르면 활강"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            input.jumpQueued = true;
            input.jumpHeld = true;
          }}
          onPointerUp={() => {
            input.jumpHeld = false;
          }}
          onPointerCancel={() => {
            input.jumpHeld = false;
          }}
          onLostPointerCapture={() => {
            input.jumpHeld = false;
          }}
          className="hud-scrim rounded-[var(--radius-round)] px-6 text-base font-bold"
          style={{
            minHeight: "calc(var(--touch-min) * 1.4)",
            minWidth: "calc(var(--touch-min) * 1.4)",
          }}
        >
          점프
        </button>
      </div>
    </>
  );
}

