/**
 * WebGL 컨텍스트 손실 감시 — 순수 규칙 + 얇은 브라우저 연결.
 *
 * 모바일에서 탭을 오래 백그라운드에 두거나 메모리가 부족해지면 브라우저가
 * WebGL 컨텍스트를 회수한다. 그러면 캔버스는 **영영 검은 채로** 남고 아무
 * 안내도 없다 — 사용자에게는 게임이 그냥 죽은 것으로 보인다.
 *
 * 자동 복구를 시도하지 않는다. three.js의 씬·텍스처·인스턴스 버퍼를 전부
 * 다시 올려야 하는데, 그 경로는 검증할 방법이 없고 반쯤 복구된 화면이
 * 검은 화면보다 낫다는 보장도 없다. 대신 **무슨 일이 일어났는지 알리고
 * 새로고침을 권한다.**
 *
 * 알리는 쪽은 **브라우저에서 확인했다** — `WEBGL_lose_context`로 컨텍스트를
 * 강제로 끊으면 `role="alert"`에 안내와 새로고침 버튼이 뜬다. 그 과정에서
 * 알림이 완주 화면 아래에 깔리는 것을 발견해 고쳤다(`WorldHud` 맨 끝).
 */

export type ContextState = "ok" | "lost" | "restored";

export interface ContextLossView {
  state: ContextState;
  /** 손실이 몇 번 일어났는지. 반복되면 기기 문제일 가능성이 높다 */
  losses: number;
}

export function createContextLossView(): ContextLossView {
  return { state: "ok", losses: 0 };
}

/**
 * 상태에 따른 안내 문구. 없으면 아무것도 띄우지 않는다.
 *
 * 복구되었을 때도 알린다 — 화면이 돌아왔더라도 그 사이 무슨 일이 있었는지
 * 모르면 다음에 또 검게 변할 때 당황한다.
 */
export function contextMessage(view: ContextLossView): string | null {
  if (view.state === "lost") {
    return "그래픽 연결이 끊겼습니다. 새로고침하면 다시 시작할 수 있습니다.";
  }
  if (view.state === "restored") {
    return "그래픽 연결이 돌아왔습니다. 이상하면 새로고침해 주세요.";
  }
  return null;
}

/**
 * 캔버스에 감시를 건다. 해제 함수를 돌려준다.
 *
 * `webglcontextlost`의 기본 동작은 "복구 시도 안 함"이다. preventDefault를
 * 불러야 브라우저가 `webglcontextrestored`를 보낼 기회가 생긴다 — 우리가
 * 직접 복구하지는 않지만, 브라우저가 스스로 살려 주는 경우까지 막을 이유는 없다.
 */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  view: ContextLossView,
  onChange?: () => void,
): () => void {
  const onLost = (event: Event) => {
    event.preventDefault();
    view.state = "lost";
    view.losses += 1;
    onChange?.();
  };

  const onRestored = () => {
    view.state = "restored";
    onChange?.();
  };

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}
