"use client";

/**
 * 화면에 잠깐 떴다 사라지는 알림 셋 — 동료 대사, 도깨비 해금, 구역 진입.
 *
 * 셋 다 같은 구조다: 공유 객체를 주기적으로 들여다보다가 값이 바뀌면 잠시
 * 띄우고 스스로 사라진다. 매 프레임 setState를 하지 않기 위한 공통 패턴이라
 * 한 파일에 모아 둔다.
 *
 * 화면 위치는 서로 겹치지 않게 나눠 잡았다 — 대사는 좌상단 목표 아래,
 * 구역은 상단 가운데, 해금은 하단 가운데다.
 */

import { useEffect, useRef, useState } from "react";

import {
  DOKEBI,
  newlyUnlocked,
  unlockedDokebi,
  type DokebiId,
  type DokebiSpirit,
} from "@/game/dokebi/roster";
import type { QuestView } from "@/game/quest/questRunner";

/**
 * 동료의 말풍선.
 *
 * 목표 패널 아래에 붙인다 — 둘 다 "지금 무엇을 하나"를 말하므로 눈이 한 곳에
 * 머물러야 한다. 화면 반대편에 두면 대사를 놓친다.
 */
export function CompanionSpeech({
  dialogue,
  speaker,
}: {
  dialogue: { line: string | null };
  /** 지금 데리고 다니는 도깨비 이름. 「초롱」을 박아 두면 다른 동료일 때 거짓말이 된다 */
  speaker: string;
}) {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setLine(dialogue.line), 200);
    return () => window.clearInterval(id);
  }, [dialogue]);

  if (!line) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ maxWidth: "min(34ch, 70vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">{speaker}</p>
      <p className="m-0 mt-0.5 text-sm">{line}</p>
    </div>
  );
}

/**
 * 주민 대사와 「말 걸 수 있음」 표시.
 *
 * 두 가지를 한 자리에서 보여 준다. 나눠 두면 대사가 뜨는 순간 안내가
 * 사라지면서 화면이 두 번 움직인다.
 *
 * 안내가 없으면 아무 데서나 눌러 보다 「안 되는 조작」으로 여기게 된다 —
 * 자판기 앞에서만 되는 음료와 같은 문제이고, 그쪽은 조작표에 「자판기
 * 앞에서」라고 적어 해결했다. 여기는 대상이 걸어 다니므로 화면이 말해야 한다.
 */
export function ResidentSpeech({
  talk,
  talkKey,
}: {
  talk: { line: string | null; speaker: string; nearby: boolean };
  /** 안내에 넣을 키 표기. 코드에서 만든다 — 「T」를 박으면 키를 옮길 때 거짓이 된다 */
  talkKey: string;
}) {
  const [view, setView] = useState<{ line: string | null; speaker: string; nearby: boolean }>({
    line: null,
    speaker: "",
    nearby: false,
  });

  useEffect(() => {
    // 매 프레임 바뀌는 공유 객체다. 상태로 올리면 초당 60번 리렌더가 된다
    const id = window.setInterval(() => setView({ line: talk.line, speaker: talk.speaker, nearby: talk.nearby }), 200);
    return () => window.clearInterval(id);
  }, [talk]);

  if (!view.line && !view.nearby) return null;

  /*
   * 안내와 대사를 **다른 영역**에 둔다.
   *
   * 하나로 묶고 `aria-live`를 걸었더니, 주민이 걸어 다니므로 「살펴보기」
   * 안내가 켜졌다 꺼졌다 하며 낭독기가 끝없이 읽었다 — 보스 체력 막대와
   * 완주 기록에서 이미 고친 것과 같은 종류다.
   *
   * 읽어 줄 가치가 있는 것은 **말한 내용**뿐이다. 안내는 눈으로 보는 것이고,
   * 낭독기 쪽에는 지도 문장이 이미 「조사할 흔적은 북쪽 30m」를 말해 준다.
   */
  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ maxWidth: "min(34ch, 70vw)" }}
    >
      {view.line ? (
        <div role="status" aria-live="polite">
          <p className="m-0 text-xs text-[var(--color-text-secondary)]">{view.speaker}</p>
          <p className="m-0 mt-0.5 text-sm">{view.line}</p>
        </div>
      ) : (
        <p className="m-0 text-sm text-[var(--color-text-secondary)]">{talkKey} 살펴보기</p>
      )}
    </div>
  );
}

/** 해금 알림이 화면에 머무는 시간(초). 구역 배너보다 길다 — 처음 보는 이름이다 */
export const UNLOCK_NOTICE_SECONDS = 5;
/** 진행도 확인 주기(ms) */
const UNLOCK_POLL_MS = 400;

/**
 * 새 도깨비 해금 알림.
 *
 * 이게 없으면 도감을 열어 보기 전까지 아무도 알려 주지 않는다 — 수집의 순간이
 * 사라진다. 조건을 채운 그 자리에서 알아야 "그래서 그랬구나"가 된다.
 *
 * 첫 확인에서는 알리지 않는다. 이미 갖고 있던 도깨비까지 "새로 만났다"고
 * 하면 매번 시작할 때마다 알림이 뜬다.
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
  const [shown, setShown] = useState<DokebiSpirit | null>(null);
  const known = useRef<DokebiId[] | null>(null);
  const hideAt = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const unlocked = unlockedDokebi(
        {
          defeatedTotal: summary.defeated,
          questCompleted: questView.firstQuestDone,
          bossDefeated: summary.bossDefeated,
        },
        met,
      );

      if (known.current === null) {
        known.current = unlocked;
        return;
      }

      const fresh = newlyUnlocked(known.current, unlocked);
      if (fresh.length > 0) {
        known.current = unlocked;
        // 한 번에 둘이 열려도 하나만 띄운다. 두 장이 겹치면 둘 다 못 읽는다.
        setShown(DOKEBI[fresh[0]]);
        hideAt.current = performance.now() + UNLOCK_NOTICE_SECONDS * 1000;
        return;
      }

      if (hideAt.current !== 0 && performance.now() > hideAt.current) {
        hideAt.current = 0;
        setShown(null);
      }
    }, UNLOCK_POLL_MS);
    return () => window.clearInterval(id);
  }, [summary, questView, met]);

  if (!shown) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-lg)] px-5 py-3 text-center"
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">새 도깨비를 만났다</p>
      <p className="m-0 mt-1 flex items-center justify-center gap-2 text-lg font-bold">
        <span
          aria-hidden="true"
          className="inline-block rounded-[var(--radius-round)]"
          style={{
            width: "16px",
            height: "16px",
            background: shown.bodyColor,
            boxShadow: `0 0 10px ${shown.accentColor}`,
          }}
        />
        {shown.name}
      </p>
      <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">{shown.tagline}</p>
      <p className="m-0 mt-1 text-xs">도감에서 데리고 다닐 수 있다</p>
    </div>
  );
}

/** 구역 이름이 화면에 머무는 시간(초) */
export const DISTRICT_BANNER_SECONDS = 3.2;

/**
 * 구역 진입 배너.
 *
 * 넓은 도시에서 "어디쯤 왔다"를 알려 주는 유일한 단서다. 상단 중앙에 두고
 * 잠깐만 띄운다 — 계속 떠 있으면 화면을 가리고, 안 뜨면 도시가 균질해 보인다.
 */
export function DistrictBanner({ district }: { district: { id: string; name: string; subtitle: string } }) {
  const [shown, setShown] = useState<{ name: string; subtitle: string } | null>(null);
  const lastId = useRef<string | null>(null);
  const hideAt = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (district.id !== lastId.current) {
        lastId.current = district.id;
        hideAt.current = performance.now() + DISTRICT_BANNER_SECONDS * 1000;
        setShown({ name: district.name, subtitle: district.subtitle });
        return;
      }
      // 시간이 다하면 스스로 사라진다. 타이머를 따로 걸면 구역을 빠르게 오갈 때 겹친다.
      if (hideAt.current !== 0 && performance.now() > hideAt.current) {
        hideAt.current = 0;
        setShown(null);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [district]);

  if (!shown) return null;

  return (
    <div
      className="pointer-events-none text-center"

      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-2xl font-semibold tracking-[0.2em]">{shown.name}</p>
      <p className="m-0 mt-1 text-xs opacity-70">{shown.subtitle}</p>
    </div>
  );
}
