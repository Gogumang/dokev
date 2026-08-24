"use client";

/*
 * 대화상자 초점 관리.
 *
 * `role="dialog"`를 붙여 놓고 초점은 바깥 버튼에 남겨 두었었다 — 키보드
 * 사용자는 패널이 떴는지 알 수 없고, Tab을 눌러도 화면에 없는 것들을 먼저
 * 지난다. 마우스로는 아무 차이가 없어 눈에 띄지 않는다.
 *
 * 도감과 지도가 같은 처리를 필요로 하므로 훅으로 둔다. 한쪽만 고쳐 두면
 * 다음에 추가되는 패널도 어느 쪽을 따라야 할지 알 수 없다.
 */

import { useEffect, useRef } from "react";

export function useDialogFocus() {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      // 닫을 때 원래 자리로 — 돌려주지 않으면 초점이 문서 처음으로 튄다
      opener?.focus?.();
    };
  }, []);

  return panelRef;
}
