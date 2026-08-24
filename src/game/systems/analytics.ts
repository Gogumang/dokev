/**
 * 분석 이벤트.
 *
 * PROJECT_PLAN 8절이 정의한 이벤트에 **실패·이탈 이벤트를 더했다.**
 * 원안은 성공 경로만 있어서 퍼널이 어디서 끊기는지 알 수 없다 —
 * "월드 진입률 60%"를 측정하려면 진입한 사람 수뿐 아니라 로딩에 실패한 사람과
 * 저사양으로 튕긴 사람을 구분할 수 있어야 한다.
 *
 * 전송 대상(sink)은 주입받는다. 지금은 수집 서버가 없으므로 기본 sink가
 * 아무것도 하지 않는다. 그래도 이벤트를 정의해 두는 이유는, 나중에 sink만
 * 갈아 끼우면 되도록 **호출 지점을 지금 코드에 박아 두기 위해서다.**
 * 나중에 이벤트를 넣으려면 전체 코드를 다시 훑어야 한다.
 */

/** 이벤트 이름 — PROJECT_PLAN 8절 + 실패 경로 */
/*
 * 이벤트 이름.
 *
 * **선언만 하고 한 번도 발생하지 않는 이벤트를 두지 않는다.** 퍼널에 있다고
 * 믿는 구멍이 실제로는 비어 있으면, 데이터를 볼 때 "여기서 다 이탈했다"는
 * 잘못된 결론에 이른다. 원안에 있던 tutorial_complete·share_clicked·
 * world_load_failed는 해당 기능이 없어 지웠다 — 기능이 생기면 그때 넣는다.
 * `tests/analytics.test.ts`가 선언과 호출 지점을 대조한다.
 */
export type AnalyticsEventName =
  // 원안
  | "landing_view"
  | "experience_start"
  | "world_loaded"
  | "quest_step_complete"
  | "quest_complete"
  | "dokebi_unlocked"
  /** 흔적 하나를 조사했을 때. 여정 중간에 막히는 지점이 여기라 단계 완료만으로는 안 보인다 */
  | "clue_found"
  | "photo_mode_opened"
  | "photo_saved"
  | "clip_saved"
  // 실패·이탈 — 퍼널 진단에 반드시 필요하다
  | "webgl_unsupported"
  | "quality_fallback_entered"
  /** 3D 화면이 예외로 무너졌을 때. 이 이벤트가 없으면 사용자가 사라진 이유를 알 수 없다 */
  | "scene_error"
  | "session_resumed"
  | "session_ended";

/** 이벤트에 붙는 값. 개인정보는 담지 않는다 (security 규칙) */
export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  props: AnalyticsProps;
  /** 세션 시작으로부터 경과한 밀리초. 절대 시각을 쓰지 않아 시계 오차에 강하다 */
  elapsedMs: number;
}

/** 이벤트를 실제로 내보내는 곳. 실패해도 게임에 영향을 주면 안 된다 */
export type AnalyticsSink = (event: AnalyticsEvent) => void;

/**
 * 세션당 한 번만 의미 있는 이벤트.
 *
 * 예를 들어 `world_loaded`가 두 번 찍히면 진입률 분모가 망가진다.
 * 반대로 `quest_step_complete`는 단계마다 찍혀야 하므로 여기 넣지 않는다.
 */
const ONCE_PER_SESSION: ReadonlySet<AnalyticsEventName> = new Set([
  "landing_view",
  "experience_start",
  "world_loaded",
  "webgl_unsupported",
  "quest_complete",
  "session_resumed",
  "session_ended",
]);

/**
 * 버퍼 상한.
 *
 * sink가 없을 때도 이벤트를 쌓아 두지만, 무한히 쌓으면 장시간 플레이에서
 * 메모리가 샌다. 오래된 것부터 버린다 — 최근 이벤트가 진단에 더 쓸모 있다.
 */
const MAX_BUFFERED = 200;

export interface Analytics {
  track(name: AnalyticsEventName, props?: AnalyticsProps): void;
  /** 지금까지 기록된 이벤트. 디버깅과 테스트용 */
  drain(): AnalyticsEvent[];
}

export interface AnalyticsOptions {
  sink?: AnalyticsSink;
  /** 경과 시간 계산의 기준. 테스트가 시계를 주입할 수 있게 한다 */
  now?: () => number;
}

/** 아무것도 보내지 않는 기본 sink. 수집 서버가 정해지면 교체한다. */
const noopSink: AnalyticsSink = () => {};

export function createAnalytics(options: AnalyticsOptions = {}): Analytics {
  const sink = options.sink ?? noopSink;
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  const seen = new Set<AnalyticsEventName>();
  const buffer: AnalyticsEvent[] = [];

  return {
    track(name, props = {}) {
      if (ONCE_PER_SESSION.has(name)) {
        if (seen.has(name)) return;
        seen.add(name);
      }

      const event: AnalyticsEvent = {
        name,
        props,
        elapsedMs: Math.max(0, now() - startedAt),
      };

      buffer.push(event);
      if (buffer.length > MAX_BUFFERED) buffer.shift();

      try {
        sink(event);
      } catch {
        // 분석은 보조 데이터다. sink가 터져도 게임은 계속 돌아야 한다.
      }
    },

    drain() {
      return [...buffer];
    },
  };
}
