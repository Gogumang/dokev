"use client";

/**
 * 라우트 오류 경계 (Next.js App Router 규약).
 *
 * `SceneErrorBoundary`는 3D 화면만 감싼다. HUD나 PlayClient 자체가 예외를
 * 던지면 여전히 **빈 페이지**가 남는다 — 이 파일이 그 마지막 그물이다.
 *
 * Next는 이 파일을 라우트 세그먼트의 경계로 자동 인식한다. 직접 감싸는 것과
 * 달리 렌더 트리 어디서 터져도 걸린다.
 */

import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
     * 분석 이벤트를 여기서 보내지 않는다. 오류가 난 상황에서 또 다른 모듈을
     * 불러오다 두 번째 오류가 나면 이 화면조차 못 띄운다. 기록은 3D 경계가
     * 이미 남긴다(그쪽이 대부분의 경우다).
     */
    void error;
  }, [error]);

  return (
    /*
     * 본문 랜드마크.
     *
     * `role="alert"`만 있으면 내용은 읽히지만 **구조가 없다** — 낭독기 사용자가
     * 「본문으로 건너뛰기」를 할 수 없다. 오류 화면도 화면이다(같은 이유로
     * WebGL 미지원 화면에도 `<main>`을 넣었다).
     */
    <main className="grid min-h-dvh place-items-center px-[var(--space-6)]" role="alert">
      <div className="max-w-[52ch] text-center">
        <h1 className="text-2xl font-bold">문제가 생겨 화면을 열지 못했습니다</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          다시 시도해도 같으면 새로고침해 주세요. 저장된 진행은 그대로 남아 있습니다.
        </p>
        {/* 제보에 쓸 수 있게 원문을 남긴다. digest는 서버 로그와 대조하는 열쇠다 */}
        <p className="mt-2 break-words text-xs text-[var(--color-text-secondary)]">
          {error.message}
          {error.digest ? ` (${error.digest})` : ""}
        </p>

        <div className="mt-[var(--space-4)] flex flex-wrap justify-center gap-[var(--space-2)]">
          <button
            type="button"
            onClick={reset}
            aria-label="다시 시도"
            className="rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-base font-semibold"
            style={{ minHeight: "var(--touch-min)" }}
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="새로고침"
            className="rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-base font-semibold"
            style={{ minHeight: "var(--touch-min)" }}
          >
            새로고침
          </button>
        </div>
      </div>
    </main>
  );
}
