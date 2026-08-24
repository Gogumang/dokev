"use client";

/**
 * 3D 화면 오류 경계.
 *
 * `useFrame` 안에서 예외가 나면 React가 트리를 통째로 걷어낸다. 경계가 없으면
 * **빈 페이지**가 남는다 — 사용자는 무슨 일이 일어났는지도, 무엇을 하면 되는지도
 * 알 수 없다.
 *
 * 오류를 삼켜 계속 돌리려 하지 않는다. 시뮬레이션이 한 번 깨지면 그 다음
 * 프레임의 상태를 믿을 수 없고, 반쯤 망가진 채로 도는 게임이 멈춘 게임보다
 * 낫다는 보장이 없다 (컨텍스트 손실에서 자동 복구를 포기한 것과 같은 판단).
 *
 * 클래스 컴포넌트인 이유: React는 아직 훅으로 오류 경계를 만들 방법을 주지 않는다.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 경계가 잡았을 때. 분석 이벤트를 남기는 데 쓴다 */
  onError?: (message: string) => void;
}

interface State {
  message: string | null;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : "알 수 없는 오류" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    /*
     * 콘솔에 남기지 않는다 — 프로덕션 코드에 console을 두지 않는 것이 이
     * 프로젝트의 규칙이고, 필요한 기록은 onError로 넘긴다.
     */
    void info;
    this.props.onError?.(error.message);
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;

    return (
      /*
       * 본문 랜드마크. `role="alert"`는 내용을 읽어 주지만 구조를 주지 않는다 —
       * 다른 오류 화면들과 같은 이유다.
       */
      <main className="grid min-h-dvh place-items-center px-[var(--space-6)]" role="alert">
        <div className="max-w-[52ch] text-center">
          <h1 className="text-2xl font-bold">화면을 그리다 문제가 생겼습니다</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            새로고침하면 마지막으로 저장된 지점부터 다시 시작합니다.
          </p>
          {/*
            오류 메시지를 그대로 보여 준다. 사용자에게는 낯설지만, 제보할 때
            이 한 줄이 있는 것과 없는 것의 차이가 크다.
          */}
          <p className="mt-2 break-words text-xs text-[var(--color-text-secondary)]">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="새로고침"
            className="mt-[var(--space-4)] rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-base font-semibold"
            style={{ minHeight: "var(--touch-min)" }}
          >
            새로고침
          </button>
        </div>
      </main>
    );
  }
}
