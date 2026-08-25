"use client";

/**
 * 왼쪽 가상 스틱 — 손가락을 값으로 옮긴다.
 *
 * 화면(모양)에서 떼어 냈다. 여기 있는 것은 **입력 규칙**이다: 왼쪽 절반에서
 * 시작한 손가락만 스틱으로 잡고, 반지름 밖으로 나가면 가장자리에 붙이고,
 * 놓으면 0으로 돌린다.
 *
 * 손잡이는 DOM 스타일을 직접 갱신한다 — 손가락을 따라 매 프레임 리렌더하면
 * 그 자체로 프레임을 깎아먹는다.
 */

import { useEffect, type RefObject } from "react";

import { STICK_RADIUS } from "@/components/hud/touchStick";
import type { InputState } from "@/game/systems/input";

export function useVirtualStick({
  input,
  knobRef,
  baseRef,
}: {
  input: InputState;
  knobRef: RefObject<HTMLDivElement | null>;
  baseRef: RefObject<HTMLDivElement | null>;
}) {
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
    /*
     * ref는 의존성이 아니다. 자동 수정이 `knobRef.current.style`까지 넣었는데,
     * 그건 **렌더 중에 DOM을 읽는** 셈이라 첫 렌더에서 null이다.
     */
  }, [input, knobRef, baseRef]);
}
