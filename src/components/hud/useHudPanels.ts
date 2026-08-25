"use client";

/**
 * 도감과 지도의 열림 상태.
 *
 * **서로를 닫는다.** 둘 다 화면 가운데를 차지하므로 겹치면 아무것도 못 읽는다.
 * 두 상태를 각자 두면 「하나를 열 때 다른 하나를 닫는다」를 부르는 자리마다
 * 다시 적어야 하고, 그중 한 곳을 빠뜨리는 날이 온다.
 */

import { useCallback, useEffect, useState } from "react";

export function useHudPanels() {
  const [codexOpen, setCodexOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const openCodex = useCallback(() => {
    setCodexOpen((open) => !open);
    setMapOpen(false);
  }, []);

  const openMap = useCallback(() => {
    setMapOpen((open) => !open);
    setCodexOpen(false);
  }, []);

  const closePanels = useCallback(() => {
    setCodexOpen(false);
    setMapOpen(false);
  }, []);

  /*
   * Escape로 닫는다.
   *
   * 도감은 `role="dialog"`인데 Escape가 어디에도 없었다 — 키보드 사용자는
   * 도깨비 항목을 전부 지나 「닫기」까지 Tab해야 빠져나온다. 마우스로는 아무
   * 불편이 없어 눈에 띄지 않는 종류다.
   *
   * 월드 조작(`input.ts`)이 아니라 여기서 듣는다. 이건 게임 동작이 아니라
   * 화면 조작이고, 패널이 열려 있는지는 여기만 안다.
   */
  useEffect(() => {
    if (!codexOpen && !mapOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") closePanels();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [codexOpen, mapOpen, closePanels]);

  return { codexOpen, mapOpen, openCodex, openMap, closePanels };
}
