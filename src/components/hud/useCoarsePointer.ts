"use client";

/**
 * 손가락으로 조작하는 기기인가.
 *
 * 터치 조작과 우상단 메뉴는 여기서 갈린다 — 데스크톱에서는 키보드 단축키가
 * 있으므로 버튼이 두 번째 입구지만, 터치에는 그 대안이 없어 통째로 지우면
 * 접근할 방법이 사라진다.
 */

import { useEffect, useState } from "react";

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}
