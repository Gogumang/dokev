"use client";

/**
 * 스스로 떴다 사라지는 알림을 **잇는** 자리 — 해금, 구역, 무기.
 *
 * 셋 다 「값이 바뀐 순간을 붙잡아 잠시 들고 있는다」는 한 규칙을 쓴다
 * (`hudHold`의 걸쇠). 나누기 전에는 그 규칙이 셋에 각자 적혀 있었고, 그중
 * 하나(첫 표본을 알릴지)는 실제로 서로 달랐다.
 */

import { useCallback } from "react";

import {
  DistrictBanner as DistrictBannerView,
  UnlockNotice as UnlockNoticeView,
  WeaponNotice as WeaponNoticeView,
} from "@/components/hud/views/Alerts";
import { useHeld } from "@/components/hud/useHeld";
import { shallowEqual } from "@/components/hud/useSampled";
import { useSampledSince } from "@/components/hud/useSampledSince";
import {
  DOKEBI,
  newlyUnlocked,
  unlockedDokebi,
  type DokebiId,
  type DokebiSpirit,
} from "@/game/dokebi/roster";
import { HUD_FOCUS } from "@/game/systems/hudFocus";
import { weaponNoticeView } from "@/game/systems/hudViews";
import type { QuestView } from "@/game/quest/questRunner";
import type { RuntimeStats } from "@/game/scene/GameScene";

/** 진행도는 이보다 자주 볼 이유가 없다 */
const PROGRESS_MS = 400;
const WEAPON_MS = 200;
const DISTRICT_MS = 200;

/**
 * 새 도깨비 해금 알림.
 *
 * 첫 표본은 조용히 삼킨다(`quietFirst`) — 이미 갖고 있던 도깨비까지 「새로
 * 만났다」고 하면 시작할 때마다 알림이 뜬다.
 */
export function UnlockNotice({
  summary,
  questView,
  met,
}: {
  summary: { defeated: number; bossDefeated: boolean };
  questView: QuestView;
  /** 실제로 만난 도깨비들. 만나야 알림이 뜬다 */
  met: readonly DokebiId[];
}) {
  const sample = useCallback(
    (seen: string | null) => {
      const unlocked = unlockedDokebi(
        {
          defeatedTotal: summary.defeated,
          questCompleted: questView.firstQuestDone,
          bossDefeated: summary.bossDefeated,
        },
        met,
      );

      /*
       * 직전 목록은 걸쇠가 열쇠로 들고 있다. 여기서 되읽어 **새로 열린 것만**
       * 고른다 — 한 번에 둘이 열려도 하나만 띄운다(두 장이 겹치면 둘 다 못 읽는다).
       */
      const known = seen === null ? [] : (seen.split(",").filter(Boolean) as DokebiId[]);
      const fresh = newlyUnlocked(known, unlocked);
      return {
        key: unlocked.join(","),
        value: fresh.length > 0 ? DOKEBI[fresh[0]] : null,
      };
    },
    [summary, questView, met],
  );

  const spirit = useHeld<DokebiSpirit | null>(
    sample,
    HUD_FOCUS.unlockNoticeSeconds,
    PROGRESS_MS,
    true,
  );

  return <UnlockNoticeView spirit={spirit ?? null} />;
}

export function DistrictBanner({
  district,
}: {
  district: { id: string; name: string; subtitle: string };
}) {
  const sample = useCallback(
    () => ({ key: district.id, value: { name: district.name, subtitle: district.subtitle } }),
    [district],
  );

  // 첫 구역은 알린다 — 처음 들어선 곳의 이름을 안 띄우면 도시가 균질해 보인다
  const shown = useHeld(sample, HUD_FOCUS.districtBannerSeconds, DISTRICT_MS, false);

  return <DistrictBannerView district={shown} />;
}

export function WeaponNotice({ stats }: { stats: RuntimeStats }) {
  const view = useSampledSince(
    () => stats.weapon,
    (seconds) => weaponNoticeView(stats.weapon, seconds),
    WEAPON_MS,
    shallowEqual,
  );

  return <WeaponNoticeView {...view} />;
}
