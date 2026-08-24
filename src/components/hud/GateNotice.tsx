"use client";

/*
 * 「빛으로 여는 문」 안내.
 *
 * 문이 막고 있는데 아무 말이 없으면 그냥 벽으로 보인다 — 벽 앞에서는 아무도
 * 능력 키를 눌러 보지 않으므로, 이 기능이 있다는 것 자체를 모른 채 지나간다.
 *
 * 매 프레임 바뀌는 값이라 상태로 내리지 않고, 다른 알림들처럼 **공유 객체를
 * 자기 주기로 들여다본다**(ShrineNotice와 같은 방식).
 */

import { useEffect, useState } from "react";

import type { GateView } from "@/game/world/SpiritGate";
import { CONTROL_CODES, keyLabel } from "@/game/systems/controls";

/** 들여다보는 주기(ms). 초당 여섯 번이면 문 앞에서 늦었다는 느낌이 없다 */
const POLL_MS = 160;

export function GateNotice({ gate }: { gate: GateView }) {
  const [shown, setShown] = useState<{ name: string; open: boolean; shortfall: number } | null>(
    null,
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      if (gate.name === null) {
        setShown(null);
        return;
      }
      setShown({ name: gate.name, open: gate.open, shortfall: gate.shortfall });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [gate]);

  if (shown === null) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-center"
      /*
       * 열림·닫힘이 소리 없이 바뀌므로 화면 낭독기에도 알린다. 「공손한」
       * 알림이라 읽던 것을 끊지 않는다.
       */
      aria-live="polite"
    >
      <div className="text-sm font-semibold">{shown.name}</div>
      <div className="text-xs text-[var(--color-text-secondary)]">
        {shown.open
          ? "동료의 빛이 문을 열었다"
          : `동료의 빛이 ${shown.shortfall.toFixed(0)}m 모자라다 — ${keyLabel(CONTROL_CODES.ability)}로 능력을 켜거나 더 밝은 도깨비와 오자`}
      </div>
    </div>
  );
}
