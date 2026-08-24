/**
 * 기기 성능 등급 판정과 WebGL 지원 확인.
 *
 * DESIGN_GUIDE 「성능 부족」의 "성능 부족" 플로우와 300~301행의 "WebGL 미지원 /
 * GPU·메모리 부족" 상태를 코드로 옮긴 것이다. 판정은 어디까지나 초기 추정이며,
 * 실측 fps로 낮추는 자동 강등은 런타임(GameScene)이 담당한다.
 */

export type QualityLevel = "low" | "medium" | "high";

export interface QualityPreset {
  level: QualityLevel;
  /** 렌더 해상도 배율의 상한. 모바일에서 DPR 3을 그대로 그리면 픽셀이 9배가 된다 */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** 안개 시작·끝 거리. 가까울수록 멀리 있는 물체를 그리지 않아도 된다 */
  fogNear: number;
  /**
   * 안개가 완전히 덮는 거리(m).
   *
   * **스트리밍 반경이 덮는 거리를 넘으면 안 된다.** 넘으면 그 사이 구간의
   * 건물이 통째로 빠진 채 안개 너머로 보인다 — 도시가 잘린 것처럼 보인다.
   * 관계는 `tests/tuningRelations.test.ts`가 지킨다.
   */
  fogFar: number;
  /**
   * 구역 스트리밍 반경(구역 수).
   *
   * 덮는 거리 = (radius + 0.5) × 구역 간격 − 구역 절반.
   * 반경 2는 약 100m, 3은 약 147m, 4는 약 194m다.
   */
  streamRadius: number;
  /**
   * 그림자 카메라가 덮는 반경(m).
   *
   * 예전에는 도시 전체(약 161m)를 한 장에 담았다. 2048px로 나눠도 텍셀 하나가
   * 16cm라 사람 발밑 그림자가 뭉개졌다 — 접지감이 없으면 캐릭터가 바닥에서
   * 떠 보인다. 플레이어를 따라다니게 하고 반경을 좁히면 같은 해상도로 텍셀이
   * 몇 cm가 된다. 대신 이 거리 밖은 그림자를 만들지 않으므로, 해가 높은
   * 시간대(그림자가 짧을 때)를 기준으로 잡는다.
   */
  shadowRadius: number;
  /**
   * 블룸·색보정 후처리를 켤지.
   *
   * 저사양에서는 끈다. 풀스크린 패스가 넷이라 픽셀 채우기 비용이 그대로 늘고,
   * 그 비용을 감당 못 하는 기기는 애초에 그림자도 끈 기기다. 꺼도 화면이
   * 성립해야 한다 — 후처리는 인상을 더하는 것이지 화면을 만드는 것이 아니다.
   */
  postProcessing: boolean;
  antialias: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: "low",
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    fogNear: 30,
    // 반경 2가 덮는 100.5m 안으로 맞춘다
    fogFar: 100,
    streamRadius: 2,
    shadowRadius: 34,
    postProcessing: false,
    antialias: false,
  },
  medium: {
    level: "medium",
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    fogNear: 45,
    fogFar: 145,
    streamRadius: 3,
    shadowRadius: 46,
    postProcessing: true,
    antialias: false,
  },
  high: {
    level: "high",
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    fogNear: 60,
    fogFar: 190,
    streamRadius: 4,
    shadowRadius: 62,
    postProcessing: true,
    antialias: true,
  },
};

/** WebGL2 컨텍스트를 실제로 만들어 본다. 속성 존재 여부만으로는 판단할 수 없다. */
export function detectWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    // 컨텍스트를 즉시 반납한다. 남겨 두면 이후 실제 캔버스가 컨텍스트 상한에 걸린다.
    const lose = (context as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  isMobile: boolean;
  pixelRatio: number;
}

function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // userAgentData가 없는 브라우저가 아직 많아 coarse pointer로 보조 판정한다.
  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    isMobile: coarsePointer,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * 초기 품질 등급을 추정한다.
 *
 * 정확한 GPU 식별은 브라우저가 막고 있으므로(UNMASKED_RENDERER는 대부분 차단),
 * 코어 수·메모리·포인터 종류로 보수적으로 시작한 뒤 실측으로 조정하는 편이 낫다.
 */
/**
 * 기기 사양에서 시작 등급을 고른다.
 *
 * `detectQualityLevel`에서 **판단만** 떼어 냈다. 브라우저를 읽는 부분과 섞여
 * 있을 때는 값으로 잴 데가 없었고, 실제로 네 갈래를 지워도 아무도 몰랐다 —
 * 그런데 이건 **모든 사람이 처음 켤 때 밟는 길**이다. 여기가 틀리면 좋은
 * 기기가 흐린 화면으로 시작하거나, 약한 기기가 첫 화면부터 끊긴다.
 *
 * 모바일은 **한 단계 보수적으로** 시작한다 — 첫인상이 끊기는 것보다 덜 예쁜
 * 편이 낫고, 실측으로 올릴 기회는 뒤에 있다.
 */
export function qualityForDevice(cores: number, memory: number, isMobile: boolean): QualityLevel {
  if (isMobile) {
    if (cores >= 8 && memory >= 6) return "medium";
    return "low";
  }

  if (cores >= 8 && memory >= 8) return "high";
  if (cores >= 4) return "medium";
  return "low";
}

export function detectQualityLevel(): QualityLevel {
  if (typeof window === "undefined") return "medium";

  const hints = readDeviceHints();
  return qualityForDevice(
    hints.hardwareConcurrency ?? 4,
    hints.deviceMemory ?? (hints.isMobile ? 4 : 8),
    hints.isMobile,
  );
}

export function getQualityPreset(level: QualityLevel): QualityPreset {
  return QUALITY_PRESETS[level];
}

/** 한 단계 낮은 등급. 이미 최저면 그대로 돌려준다. */
/**
 * 낮은 fps가 이어질 때만 한 단계 내린다.
 *
 * `PlayerRig`의 프레임 루프 안에 손으로 적혀 있던 계산이다. 거기서는 **잴 수가
 * 없었다** — 「로딩 직후 한두 프레임으로 판단하지 않는다」와 「한 번 내리면
 * 시계가 0으로 돌아간다」가 화면을 오래 보고 있어야만 확인되는 규칙이었다.
 *
 * 부르는 쪽이 남은 시계를 들고 있고, 여기서는 **다음 시계와 내릴 등급**만
 * 돌려준다. 내릴 필요가 없으면 `next`는 null이다.
 */
export function stepDowngradeWatch(
  lowSeconds: number,
  fps: number,
  /** 이번 호출이 대표하는 시간(초). 프레임마다가 아니라 표본 주기마다 부른다 */
  intervalSeconds: number,
  level: QualityLevel,
  thresholdFps: number,
  sampleSeconds: number,
): { lowSeconds: number; next: QualityLevel | null } {
  // 기준을 넘겼으면 시계를 되돌린다. 띄엄띄엄 떨어지는 것으로 내리면 안 된다
  if (fps >= thresholdFps) return { lowSeconds: 0, next: null };

  const elapsed = lowSeconds + intervalSeconds;
  if (elapsed < sampleSeconds) return { lowSeconds: elapsed, next: null };

  const next = downgrade(level);
  // 이미 최저면 내릴 것이 없다 — null을 돌려줘야 부르는 쪽이 같은 요청을 반복하지 않는다
  return { lowSeconds: 0, next: next === level ? null : next };
}

export function downgrade(level: QualityLevel): QualityLevel {
  if (level === "high") return "medium";
  if (level === "medium") return "low";
  return "low";
}
