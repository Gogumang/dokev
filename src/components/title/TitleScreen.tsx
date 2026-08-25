"use client";

/**
 * 시작 화면.
 *
 * DESIGN_GUIDE 「내비게이션 규칙」에 따라 주 행동은 `동네로 들어가기` 하나로 유지하고,
 * 설정과 조작 안내는 접어 둔다. 배경은 3D가 아니라 CSS 그라디언트와 실루엣이다 —
 * 랜딩에서 three.js를 건드리는 순간 LCP 예산이 무너지기 때문이다.
 *
 * 여기서 정한 설정은 localStorage에 저장되어 월드가 읽어 간다.
 */

import Link from "next/link";

import { Backdrop } from "@/components/title/Backdrop";
import { useEffect } from "react";

import { createAnalytics } from "@/game/systems/analytics";

export function TitleScreen() {
  /*
   * 퍼널의 시작점. 이 이벤트가 없으면 "랜딩을 본 사람 중 몇 명이 시작했나"를
   * 셀 수 없다 — 가장 먼저 알고 싶은 수치인데 비어 있었다.
   *
   * 효과 안에서 부르는 이유: 렌더 중에 부르면 React가 렌더를 두 번 할 때
   * 두 번 기록된다(세션당 1회 규칙이 막아 주지만 의도가 흐려진다).
   */
  useEffect(() => {
    createAnalytics().track("landing_view");
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Backdrop />

      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[72rem] flex-col justify-between gap-[var(--space-8)]"
        style={{
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
        }}
      >
        <header className="pt-[var(--space-8)]">
          <h1 className="mt-[var(--space-3)] text-[clamp(3rem,10vw,6.5rem)] leading-[0.95] font-black tracking-tight">
            Doke
            <span className="text-[var(--color-brand-sunset)]">V</span>
          </h1>
        </header>

        <div className="flex flex-col gap-[var(--space-4)] pb-[var(--space-8)]">
          {/*
            주 행동은 하나다.

            전에는 「동네로 들어가기」·「조작법」·「설정」 셋이 같은 크기로 나란히
            서 있었다. 셋 다 눌러도 되는 것처럼 보이면 **무엇을 먼저 눌러야 하는지
            화면이 말해 주지 않는다.** 시작 버튼만 크게 두고 나머지는 작은 글로
            내린다 — 지우지는 않는다. 품질·닉네임·외형이 설정 안에 있어서,
            없애면 들어가기 전에 정할 방법이 사라진다.
          */}
          <Link
            href="/play"
            className="inline-flex w-fit items-center justify-center rounded-[var(--radius-round)] bg-[var(--color-action-primary)] px-[var(--space-8)] text-2xl font-black tracking-wide text-[var(--color-text-inverse)] no-underline shadow-[0_14px_50px_-10px_rgba(47,212,196,0.85)] transition-transform hover:scale-[1.03]"
            style={{ minHeight: "calc(var(--touch-min) * 1.6)" }}
          >
            동네로 들어가기
          </Link>

          {/*
            저장 안내는 실제 동작과 정확히 맞춰야 한다. "저장되지 않습니다"라고
            적혀 있던 적이 있는데 저장은 이미 동작하고 있었다 — 여정과 만난
            도깨비는 남고 서 있던 자리만 안 남는다.
          */}
          <footer className="mt-[var(--space-2)] text-xs leading-relaxed text-[var(--color-text-secondary)]">
            설치·로그인 없이 시작합니다. 여정과 만난 도깨비는 이 브라우저에 저장되고, 서 있던 자리는
            저장되지 않아 다시 들어오면 광장에서 시작합니다.
            <br />
            한국 설화와 현대 도시에서 출발한 독자 IP 창작물이며, 특정 상용 게임의 공식 서비스가
            아닙니다.
          </footer>
        </div>
      </div>
    </main>
  );
}
