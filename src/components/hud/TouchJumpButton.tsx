"use client";

/**
 * 공격과 점프 — 손가락이 머무는 큰 버튼 둘.
 *
 * 다른 버튼과 모양이 다르다. **누르고 있으면 활강**이라 손가락이 머무는
 * 버튼이고, 그래서 판정 면적이 1.4배다 — `HudButton`으로 만들면 그 차이가
 * 사라진다.
 */

import type { InputState } from "@/game/systems/input";

export function TouchJumpButton({ input }: { input: InputState }) {
  return (
    <>
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
    </>
  );
}
