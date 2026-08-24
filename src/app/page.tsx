import type { Metadata } from "next";

import { TitleScreen } from "@/components/title/TitleScreen";

export const metadata: Metadata = {
  title: "DokeV — 노을 지는 동네를 달리는 3D 어드벤처",
  description:
    "설치 없이 브라우저에서 바로 시작하는 3D 어드벤처. 노을 지는 한국 동네를 달리고, 골목을 가로지르고, 도깨비와 친구가 됩니다.",
};

/**
 * 시작 화면.
 *
 * 3D를 싣지 않는다. DESIGN_GUIDE 「공개 품질 게이트」의 LCP 2.5초 / INP 200ms / CLS 0.1
 * 게이트는 three.js가 이 페이지에 섞이는 순간 지킬 수 없다. 배경 연출은 전부
 * CSS로 만들고, 월드 청크는 `/play`로 이동할 때만 내려받는다.
 */
export default function Home() {
  return <TitleScreen />;
}
