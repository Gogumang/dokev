"use client";

/**
 * 시연 안내 — 1분 30초 코스의 지금 장면을 화면 구석에 띄운다.
 *
 * 시연 영상을 찍으려면 **다음에 무엇을 눌러야 하는지**를 알아야 한다.
 * 종이에 적어 두고 흘끔거리면 그 순간이 영상에 남는다 — 화면 안에 있으면
 * 눈이 화면을 떠나지 않는다.
 *
 * 개발 확인 지점(`?see=demo`)에서만 뜬다. 코스와 시각은 `demoRoute`가
 * 정본이고 여기서는 읽기만 한다.
 */

import { useEffect, useState } from "react";

import { beatAt, DEMO_SECONDS, type DemoBeat } from "@/game/systems/demoRoute";

export interface DemoGuideProps {
  beats: readonly DemoBeat[];
}

/** `0:07` 꼴로. 편집 프로그램의 타임코드와 같은 모양이라 대조하기 쉽다 */
function timecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function DemoGuide({ beats }: DemoGuideProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    /*
     * 1초마다 센다. 프레임마다 갱신하면 초당 60번 리렌더가 되고, 이 저장소가
     * 금지한 그것이다 — 표시되는 값도 초 단위라 더 자주 셀 이유가 없다.
     */
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed((performance.now() - started) / 1000);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const beat = beatAt(beats, elapsed);
  const index = beats.indexOf(beat);
  const done = elapsed >= DEMO_SECONDS;

  return (
    <div
      /*
       * **오른쪽 아래.** 처음에 왼쪽 위에 뒀다가 목표 패널과 통째로 겹쳤다 —
       * 두 글자 덩어리가 포개져 둘 다 못 읽는다. 실제로 화면을 열어 보고
       * 알았다(코드로는 보이지 않는 종류다).
       *
       * HUD가 쓰는 네 자리(왼쪽 위·오른쪽 위·아래 왼쪽·아래 가운데)를 피한
       * 곳이 여기다. 안전 영역 변수를 같이 쓴다 — 노치 있는 화면에서 잘린다.
       */
      className="pointer-events-none absolute max-w-sm rounded-lg bg-black/70 px-3 py-2 text-sm text-white"
      style={{ bottom: "var(--safe-bottom)", right: "var(--safe-right)" }}
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-xs opacity-80">
        {timecode(elapsed)} / {timecode(DEMO_SECONDS)}
        {done ? " · 끝" : ` · ${index + 1}/${beats.length}`}
      </p>
      <p className="font-semibold">{beat.title}</p>
      {beat.keys ? <p className="font-mono text-xs opacity-90">{beat.keys}</p> : null}
    </div>
  );
}
