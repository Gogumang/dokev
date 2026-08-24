import type { Metadata } from "next";

import { PlayShell } from "./PlayShell";

export const metadata: Metadata = {
  title: "월드 — DokeV",
  description: "블록아웃 도시에서 이동 감각과 성능을 확인하는 개발용 월드입니다.",
  // 개발 스파이크 화면이므로 색인되지 않게 한다.
  robots: { index: false, follow: false },
};

export default function PlayPage() {
  return <PlayShell />;
}
