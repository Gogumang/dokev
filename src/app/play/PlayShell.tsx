"use client";

import dynamic from "next/dynamic";

/**
 * 월드 화면을 서버 렌더 경로에서 완전히 분리한다.
 *
 * WebGL 지원 여부·기기 성능·저감 모션은 서버에서 알 수 없는 값이다. 서버에서
 * 한 번 렌더한 뒤 클라이언트에서 다시 판정하면 "감지 → setState → 재렌더"가
 * 강제되고, 그 사이 화면이 한 번 깜빡인다. 아예 클라이언트에서만 그리면
 * 첫 렌더부터 올바른 값으로 시작할 수 있다.
 *
 * 이 껍데기가 따로 있는 이유: `ssr: false`는 클라이언트 컴포넌트에서만 쓸 수 있고,
 * page.tsx는 metadata를 export해야 해서 서버 컴포넌트로 남아야 한다.
 */
const PlayClient = dynamic(() => import("./PlayClient").then((m) => m.PlayClient), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <p className="text-lg font-semibold">동네를 불러오는 중</p>
    </div>
  ),
});

export function PlayShell() {
  return <PlayClient />;
}
