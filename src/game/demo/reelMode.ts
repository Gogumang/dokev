/**
 * 시연 영상 촬영 모드 — 켜는 조건과 시계.
 *
 * **프레임을 실시간으로 그리지 않는다.** 바깥(촬영 스크립트)이 「한 프레임
 * 진행해라」를 부르면 그때 정확히 1/60초가 흐른다. 한 장에 10초가 걸려도
 * 결과물은 완벽한 60fps다 — 실시간 녹화는 프레임이 한 번 떨어지면 그게
 * 그대로 영상에 남고, 이 게임은 저사양에서 품질을 스스로 낮추기까지 한다.
 *
 * `?see=`와 같은 규칙으로 **개발 빌드에서만** 켜진다. 배포된 게임에서 주소만
 * 으로 시계를 뺏을 수 있으면 그건 촬영 도구가 아니라 결함이다.
 *
 * three.js도 React도 모른다.
 */

/** 한 프레임에 흐르는 시간(초). 60fps로 뽑는다 */
export const REEL_STEP_SECONDS = 1 / 60;

/**
 * 뽑을 전체 길이(초).
 *
 * 코스는 90초인데 마지막 장면(82초)이 마무리 연출이라 조금 더 돈다. 96초면
 * 대장이 눕고 카메라가 얼굴에 붙는 것까지 담긴다.
 */
export const REEL_TOTAL_SECONDS = 96;

/** 촬영 스크립트가 창에서 찾는 이름 */
export const REEL_HANDLE = "__dokevReel";

/**
 * 주소에서 촬영 모드를 읽는다.
 *
 * `?reel=1`. 값은 보지 않는다 — 있으면 켠다.
 */
export function parseReel(search: string, isDevelopment: boolean): boolean {
  if (!isDevelopment) return false;
  try {
    return new URLSearchParams(search).has("reel");
  } catch {
    /*
     * 주소가 망가져 있으면 그냥 끈다. 여기서 예외를 던지면 **게임이 아예
     * 안 뜬다** — 확인 도구 때문에 본편이 멈추는 것은 앞뒤가 맞지 않는다.
     */
    return false;
  }
}

/**
 * 이 판이 촬영 모드인가 — **한 번만 읽고 기억한다.**
 *
 * 주소는 새로고침 없이 안 바뀐다. 그런데 매 렌더 읽으면 `frameloop`이 흔들려
 * 캔버스가 다시 서고, 그러면 촬영 도중에 세계가 초기화된다.
 *
 * 서버에서는 늘 꺼져 있다(`window`가 없다). 여기서 예외를 던지면 게임이 아예
 * 안 뜬다 — 확인 도구 때문에 본편이 멈추는 것은 앞뒤가 맞지 않는다.
 */
let cached: boolean | null = null;
export function reelOn(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return false;
  cached = parseReel(window.location.search, process.env.NODE_ENV !== "production");
  return cached;
}

/**
 * 촬영 스크립트가 쓰는 손잡이.
 *
 * 창에 얹어 두고 바깥에서 부른다. 이렇게 두는 이유: 촬영 쪽이 「한 프레임
 * 그려라 → 그 그림을 가져가라」를 **번갈아** 해야 하는데, 게임이 스스로
 * 돌고 있으면 가져가는 사이에 다음 프레임이 지나가 버린다.
 */
export interface ReelHandle {
  /** 한 프레임(1/60초) 진행하고, 진행 뒤의 시각(초)을 준다 */
  step: () => number;
  /** 지금까지 흐른 시간(초) */
  seconds: () => number;
  /** 코스 전체 길이(초). 촬영 쪽이 몇 장을 뽑을지 이걸로 정한다 */
  total: number;
}

declare global {
  interface Window {
    [REEL_HANDLE]?: ReelHandle;
  }
}
