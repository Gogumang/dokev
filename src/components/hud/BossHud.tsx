"use client";

/**
 * 대장 표시를 **잇는** 자리 — 체력 막대와 방향 화살표.
 *
 * 둘 다 같은 공유 객체(`BossView`)를 읽지만 주기가 다르다. 체력은 예고를
 * 놓치면 피할 수 없으므로 촘촘히, 화살표는 걸어가는 동안 각도가 따라오면
 * 되므로 그보다 성기게 본다.
 */

import {
  BossHealth as BossHealthView,
  BossPointer as BossPointerView,
} from "@/components/hud/views/BossHud";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import type { BossView } from "@/game/combat/bossSim";
import { bossPointerFrame } from "@/game/systems/bossPointer";
import { bossHealthView } from "@/game/systems/hudViews";
import type { RuntimeStats } from "@/game/scene/GameScene";

/** 예고는 1.1초다. 그 안에 여러 번 봐야 색이 바뀌는 것을 놓치지 않는다 */
const HEALTH_MS = 120;
const POINTER_MS = 120;

export function BossHealth({ boss }: { boss: BossView }) {
  const view = useSampled(() => bossHealthView(boss), HEALTH_MS, shallowEqual);
  return <BossHealthView view={view} />;
}

export function BossPointer({
  stats,
  boss,
  reducedMotion,
}: {
  stats: RuntimeStats;
  boss: BossView;
  reducedMotion: boolean;
}) {
  const frame = useSampled(
    () =>
      bossPointerFrame({
        playerX: stats.x,
        playerZ: stats.z,
        viewYaw: stats.viewYaw,
        bossX: boss.x,
        bossZ: boss.z,
        // 누워 있는 동안에는 가리키지 않는다 — 미니맵이 표식을 지우는 것과 같은 규칙이다
        alive: boss.phase !== "down",
      }),
    POINTER_MS,
    shallowEqual,
  );

  return <BossPointerView frame={frame} reducedMotion={reducedMotion} />;
}
