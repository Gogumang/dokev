"use client";

/**
 * 최상위 오류 경계 (Next.js App Router 규약).
 *
 * `error.tsx`는 레이아웃 **안쪽**에서 난 오류만 잡는다. 레이아웃 자체가
 * 터지면 그것마저 못 뜨므로, 이 파일이 html/body부터 직접 그린다.
 *
 * 그래서 여기서는 프로젝트의 CSS 토큰을 쓸 수 없다 — 스타일이 실려 있다는
 * 보장이 없다. 인라인 스타일로만 그린다.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#14101c",
          color: "#f6f2ff",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        {/*
          본문 랜드마크. `role="alert"`는 내용을 읽어 주지만 구조를 주지 않는다 —
          다른 오류 화면과 같은 이유다.
        */}
        <main style={{ maxWidth: "52ch", textAlign: "center" }} role="alert">
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>페이지를 열지 못했습니다</h1>
          <p style={{ marginTop: "12px", color: "#b6acd0" }}>
            새로고침하거나 잠시 뒤 다시 시도해 주세요.
          </p>
          <p
            style={{
              marginTop: "8px",
              fontSize: "0.75rem",
              color: "#b6acd0",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {error.digest ? ` (${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            aria-label="다시 시도"
            style={{
              marginTop: "16px",
              minHeight: "44px",
              padding: "0 24px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontWeight: 600,
            }}
          >
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
