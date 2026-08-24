"use client";

/*
 * 「찾아갈 자리가 생겼다」 알림.
 *
 * 조건을 채워 도깨비 자리가 드러나도 **아무도 말해 주지 않았다.** 보스를
 * 눕혀도, 로봇 열두 기를 잡아도, 지도를 직접 열어 보기 전에는 모른다 —
 * 보상이 있는데 보상이 있다는 사실이 전달되지 않았다.
 *
 * 이름은 밝히지 않는다. 아직 만나지 않은 도깨비이고, 찾아가는 것이 그 자체로
 * 놀이다 — 미리 말하면 도착이 확인 절차가 된다.
 */

import { useEffect, useRef, useState } from "react";

import { pendingDiscoveries, type DokebiId } from "@/game/dokebi/roster";
import type { QuestView } from "@/game/quest/questRunner";

const SHOW_SECONDS = 4;

export function ShrineNotice({
  summary,
  questView,
  met,
}: {
  summary: { defeated: number; bossDefeated: boolean };
  questView: QuestView;
  met: readonly DokebiId[];
}) {
  const [visible, setVisible] = useState(false);
  const known = useRef<DokebiId[] | null>(null);
  const hideAt = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const waiting = pendingDiscoveries(
        {
          defeatedTotal: summary.defeated,
          questCompleted: questView.firstQuestDone,
          bossDefeated: summary.bossDefeated,
        },
        met,
      ).map((spirit) => spirit.id);

      /*
       * 첫 확인에서는 알리지 않는다. 이어서 하는 판이면 이미 드러나 있던
       * 자리까지 "방금 생겼다"고 말하게 된다.
       */
      if (known.current === null) {
        known.current = waiting;
        return;
      }

      const fresh = waiting.filter((id) => !known.current?.includes(id));
      known.current = waiting;

      if (fresh.length > 0) {
        setVisible(true);
        hideAt.current = Date.now() + SHOW_SECONDS * 1000;
      } else if (Date.now() > hideAt.current) {
        setVisible(false);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [summary, questView, met]);

  if (!visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-lg)] px-5 py-3 text-center"
      /*
       * 해금 알림(+128px) 위에 놓는다.
       *
       * 같은 자리에 두었더니 둘이 겹쳤다 — 도깨비를 만나는 순간 다른 조건이
       * 함께 채워지면 두 알림이 동시에 뜬다. 이 세션에서 같은 실수를 세 번째
       * 하는 참이었다(완주 문구 중복, 좌하단 미니맵).
       */
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">어딘가에 빛기둥이 섰다</p>
      <p className="m-0 mt-1 text-lg font-bold">찾아갈 자리가 생겼다</p>
      <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">지도에서 위치를 볼 수 있다</p>
    </div>
  );
}
