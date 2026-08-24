"use client";

/*
 * 사진·클립 저장 알림.
 *
 * 월드 HUD와 포토 모드 양쪽이 쓴다. 한쪽 파일에 두면 다른 쪽이 그 파일을
 * import하게 되므로 따로 둔다.
 */

/**
 * 촬영 결과 알림 — 토스트가 유일한 안내 수단이 되지 않도록 버튼 옆에 둔다.
 *
 * **자리는 부르는 쪽이 정한다.** 예전에는 여기서 `absolute left-1/2`로 스스로
 * 떴는데, 월드 HUD에서는 알림 넷을 쌓는 컨테이너 안에 들어가므로 그러면
 * 흐름에서 빠져 다른 알림과 겹친다(자판기 앞에서 사진을 찍으면 만난다).
 * 이미 가운데 정렬된 컨테이너 안에서 다시 반쪽을 밀어 좌우로도 어긋났다.
 * 포토 모드 쪽은 처음부터 감싸는 div가 자리를 잡아 주고 있었다.
 */
export function CaptureNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="hud-scrim rounded-[var(--radius-md)] px-4 py-2 text-sm"
    >
      {message}
    </div>
  );
}
