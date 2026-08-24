import { readdirSync, readFileSync } from "node:fs";
import { join as joinPath } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createAnalytics,
  type AnalyticsEvent,
  type AnalyticsEventName,
} from "@/game/systems/analytics";

/** 시계를 주입해 경과 시간을 결정적으로 만든다. */
function fakeClock(start = 1000) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

describe("createAnalytics — 기록", () => {
  it("기록한 이벤트를 순서대로 돌려준다", () => {
    // Arrange
    const analytics = createAnalytics();

    // Act
    analytics.track("landing_view");
    analytics.track("experience_start");

    // Assert
    const names = analytics.drain().map((event) => event.name);
    expect(names, `names were: ${names.join(",")}`).toEqual(["landing_view", "experience_start"]);
  });

  it("props를 그대로 담는다", () => {
    const analytics = createAnalytics();
    analytics.track("quest_step_complete", { stepId: "board", index: 1 });

    const event = analytics.drain()[0];
    expect(event.props, `props were: ${JSON.stringify(event.props)}`).toEqual({
      stepId: "board",
      index: 1,
    });
  });

  it("절대 시각이 아니라 세션 경과 시간을 담는다", () => {
    // Arrange — 시계 오차에 강해야 하고 개인 식별에도 쓰이면 안 된다
    const clock = fakeClock(1_700_000_000_000);
    const analytics = createAnalytics({ now: clock.now });

    // Act
    clock.advance(2500);
    analytics.track("world_loaded");

    // Assert
    const event = analytics.drain()[0];
    expect(event.elapsedMs, `elapsedMs was: ${event.elapsedMs}`).toBe(2500);
  });

  it("시계가 거꾸로 가도 음수 경과 시간을 만들지 않는다", () => {
    // 일부 환경에서 시스템 시계가 뒤로 조정될 수 있다
    let value = 5000;
    const analytics = createAnalytics({ now: () => value });
    value = 1000;
    analytics.track("world_loaded");

    expect(analytics.drain()[0].elapsedMs).toBe(0);
  });
});

describe("createAnalytics — 중복 방지", () => {
  it("세션당 한 번만 찍히는 이벤트는 두 번째를 버린다", () => {
    // Arrange — 두 번 찍히면 진입률 분모가 망가진다
    const analytics = createAnalytics();

    // Act
    analytics.track("world_loaded");
    analytics.track("world_loaded");

    // Assert
    const loaded = analytics.drain().filter((event) => event.name === "world_loaded");
    expect(loaded.length, `count was: ${loaded.length}`).toBe(1);
  });

  it("반복 가능한 이벤트는 매번 찍힌다", () => {
    // 퀘스트 단계 완료는 단계마다 필요하다
    const analytics = createAnalytics();
    analytics.track("quest_step_complete", { index: 0 });
    analytics.track("quest_step_complete", { index: 1 });
    analytics.track("photo_saved");
    analytics.track("photo_saved");

    const drained = analytics.drain();
    const steps = drained.filter((event) => event.name === "quest_step_complete");
    const photos = drained.filter((event) => event.name === "photo_saved");
    expect(steps.length, `steps were: ${steps.length}`).toBe(2);
    expect(photos.length, `photos were: ${photos.length}`).toBe(2);
  });
});

describe("createAnalytics — sink", () => {
  it("기록할 때마다 sink를 부른다", () => {
    // Arrange
    const received: AnalyticsEvent[] = [];
    const analytics = createAnalytics({ sink: (event) => received.push(event) });

    // Act
    analytics.track("photo_mode_opened");

    // Assert
    expect(received.length, `received: ${received.length}`).toBe(1);
    expect(received[0].name).toBe("photo_mode_opened");
  });

  it("sink가 터져도 게임이 멈추지 않는다", () => {
    // 분석은 보조 데이터다 — 실패가 플레이를 끊으면 안 된다
    const analytics = createAnalytics({
      sink: () => {
        throw new Error("network down");
      },
    });

    expect(() => analytics.track("world_loaded")).not.toThrow();
    // 버퍼에는 남아 있어야 나중에 다시 보낼 수 있다
    expect(analytics.drain().length, "buffered").toBe(1);
  });

  it("중복으로 버려진 이벤트는 sink에도 가지 않는다", () => {
    let calls = 0;
    const analytics = createAnalytics({
      sink: () => {
        calls += 1;
      },
    });

    analytics.track("session_resumed");
    analytics.track("session_resumed");

    expect(calls, `calls were: ${calls}`).toBe(1);
  });
});

describe("createAnalytics — 버퍼", () => {
  it("무한히 쌓이지 않는다", () => {
    // Arrange — 장시간 플레이에서 메모리가 새면 안 된다
    const analytics = createAnalytics();

    // Act — 상한보다 훨씬 많이 기록한다
    for (let i = 0; i < 500; i += 1) {
      analytics.track("quest_step_complete", { index: i });
    }

    // Assert
    const drained = analytics.drain();
    expect(drained.length, `length was: ${drained.length}`).toBeLessThanOrEqual(200);
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    // 최근 이벤트가 진단에 더 쓸모 있다
    const analytics = createAnalytics();
    for (let i = 0; i < 300; i += 1) {
      analytics.track("quest_step_complete", { index: i });
    }

    const drained = analytics.drain();
    const last = drained[drained.length - 1];
    expect(last.props.index, `last index was: ${last.props.index}`).toBe(299);
  });

  it("drain은 복사본을 돌려준다", () => {
    // 호출자가 배열을 건드려도 내부 상태가 오염되면 안 된다
    const analytics = createAnalytics();
    analytics.track("landing_view");

    const first = analytics.drain();
    first.length = 0;

    expect(analytics.drain().length, "internal buffer intact").toBe(1);
  });
});

describe("이벤트 목록", () => {
  it("퍼널 진단에 필요한 실패 이벤트가 정의되어 있다", () => {
    // 성공 경로만 있으면 어디서 끊기는지 알 수 없다
    const required: AnalyticsEventName[] = [
      "webgl_unsupported",
      "scene_error",
      "quality_fallback_entered",
      "session_resumed",
    ];
    const analytics = createAnalytics();
    for (const name of required) analytics.track(name);

    const names = analytics.drain().map((event) => event.name);
    for (const name of required) {
      expect(names, `missing ${name}`).toContain(name);
    }
  });
});

describe("선언과 호출 지점", () => {
  /*
   * 선언만 하고 한 번도 발생하지 않는 이벤트는 **퍼널에 있다고 믿는 구멍**을
   * 만든다. 데이터를 볼 때 "여기서 다 이탈했다"는 잘못된 결론에 이른다.
   *
   * 실제로 17개 중 7개가 그랬다 — 퍼널의 시작(landing_view), 수집 루프의
   * 핵심(dokebi_unlocked), 세션 종료(session_ended)가 전부 비어 있었다.
   */
  const sources = [
    ...collectSources("src/app"),
    ...collectSources("src/components"),
    ...collectSources("src/game"),
  ].join("\n");

  it("모든 이벤트에 호출 지점이 있다", () => {
    const declared = readFileSync("src/game/systems/analytics.ts", "utf8");
    const names = [...declared.matchAll(/\|\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(names.length, "이벤트 선언을 찾지 못했다").toBeGreaterThan(5);

    const missing = names.filter((name) => !new RegExp(`track\\(\\s*"${name}"`).test(sources));
    expect(missing, `declared but never fired: ${missing.join(", ")}`).toEqual([]);
  });

  it("사용자가 적은 것을 이벤트에 싣지 않는다", () => {
    /*
     * 지금 sink는 아무 데도 보내지 않는다(`noopSink`). 그래서 **지금은**
     * 무엇을 실어도 새지 않는다 — 수집 서버가 붙는 날 함께 새기 시작한다.
     * 그때 이 코드를 다시 읽을 사람은 없다.
     *
     * 실을 수 있는 유일한 자유 입력은 별명이다. 게임이 만든 값(도깨비 id,
     * 처치 수, 품질 단계)만 싣는다.
     */
    const calls = [...sources.matchAll(/track\(\s*"[^"]+"\s*,\s*\{([^}]*)\}/g)].map(
      (match) => match[1],
    );
    expect(calls.length, `인자 있는 이벤트 ${calls.length}개`).toBeGreaterThan(3);

    const leaks = calls.filter((props) => /nickname|playerName|사용자|입력/.test(props));
    expect(leaks, `사용자 입력을 싣는 이벤트: ${leaks.join(" | ")}`).toEqual([]);
  });

  it("퍼널의 시작과 끝이 모두 있다", () => {
    /*
     * 시작만 세고 끝을 안 세면 "다들 들어와서 아무것도 안 했다"와 "오래 놀다
     * 나갔다"가 같은 데이터로 보인다.
     */
    expect(sources).toContain('track("landing_view")');
    expect(sources).toContain('track("session_ended")');
  });
});

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = joinPath(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(readFileSync(path, "utf8"));
  }
  return out;
}
