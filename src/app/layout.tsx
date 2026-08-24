import type { Metadata, Viewport } from "next";

import "./globals.css";

const TITLE = "DokeV";
const DESCRIPTION =
  "노을 지는 동네를 달리며 도깨비와 친구가 되는 브라우저 3D 어드벤처. 독자 IP 프로젝트입니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  /*
   * 공유 카드 정보.
   *
   * 이 게임은 사진과 클립을 저장해 공유하라고 만들었는데 정작 **게임 링크
   * 자체가 제목도 설명도 없는 맨 카드**로 떴다. 링크를 받은 사람이 무엇인지
   * 모르면 열지 않는다.
   *
   * 미리보기 이미지는 넣지 않는다 — 외부 에셋 0개 원칙이고, 이미지를 코드로
   * 생성하는 경로(next/og)는 화면을 확인할 수 없는 지금 검증할 방법이 없다.
   * 제목과 설명만으로도 맨 카드보다 훨씬 낫다.
   */
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
  // 검색 결과에 뜨는 것을 막지 않는다. 다만 색인 힌트는 명시해 둔다.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#14101c",
  // 월드에서 두 손가락 확대가 카메라 조작과 충돌한다. 다만 확대를 완전히 막으면
  // 접근성 위반이므로 최대 배율은 남겨 둔다.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
