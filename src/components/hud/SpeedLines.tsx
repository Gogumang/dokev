"use client";

import { useEffect, useRef } from "react";

import { SPEED_LINES } from "@/game/config/tuning";
import type { RuntimeStats } from "@/game/scene/GameScene";

/**
 * 속도선.
 *
 * 3D 안에서 파티클로 만들면 드로우콜과 오버드로우가 늘어난다. 화면 전체를 덮는
 * 그라디언트 하나면 같은 인상을 훨씬 싸게 만들 수 있고, 저감 모션에서는
 * 컴포넌트째 렌더하지 않으면 그만이다.
 */
export function SpeedLines({ stats }: { stats: RuntimeStats }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const element = ref.current;
      if (element) {
        const range = SPEED_LINES.fullSpeed - SPEED_LINES.startSpeed;
        const t = Math.min(1, Math.max(0, (stats.speed - SPEED_LINES.startSpeed) / range));
        element.style.opacity = String(t * SPEED_LINES.maxOpacity);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: 0,
        background:
          "radial-gradient(ellipse at center, transparent 30%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0.42) 100%)",
      }}
    />
  );
}
