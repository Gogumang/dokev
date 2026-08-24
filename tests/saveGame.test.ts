import { afterEach, describe, expect, it, vi } from "vitest";

import { CLUES } from "@/game/quest/clues";

import {
  clampStepIndex,
  clearProgress,
  loadProgress,
  PROGRESS_STORAGE_KEY,
  saveProgress,
} from "@/game/systems/saveGame";

/**
 * localStorage 스텁.
 *
 * 실제 저장소를 쓰면 테스트끼리 상태가 새고 순서에 의존하게 된다.
 */
function stubStorage(options: { stored?: string | null; throwOn?: "get" | "set" | "remove" } = {}) {
  const store = new Map<string, string>();
  if (options.stored != null) store.set(PROGRESS_STORAGE_KEY, options.stored);

  const storage = {
    getItem: (key: string) => {
      if (options.throwOn === "get") throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.throwOn === "set") throw new Error("quota");
      store.set(key, value);
    },
    removeItem: (key: string) => {
      if (options.throwOn === "remove") throw new Error("blocked");
      store.delete(key);
    },
  };

  vi.stubGlobal("window", { localStorage: storage });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadProgress", () => {
  it("저장이 없으면 null", () => {
    stubStorage({ stored: null });
    expect(loadProgress()).toBeNull();
  });

  it("정상 저장을 그대로 읽는다", () => {
    // Arrange
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: 3,
        questCompleted: false,
        defeatedTotal: 7,
      }),
    });

    // Act
    const loaded = loadProgress();

    // Assert
    expect(loaded, `loaded was: ${JSON.stringify(loaded)}`).toEqual({
      version: 1,
      questStepIndex: 3,
      questCompleted: false,
      defeatedTotal: 7,
      // 필드가 없는 예전 저장은 「눕힌 적 없음」으로 읽는다 — 버리지 않는다
      bossDefeated: false,
      foundClues: [],
    });
  });

  it("나중에 더한 필드가 이상해도 진행을 잃지 않는다", () => {
    /*
     * `bossDefeated`·`foundClues`는 나중에 더한 필드다. 그래서 다른 필드처럼
     * 「이상하면 저장 전체를 버린다」로 다루지 않는다 — 값이 없는 것은 손상이
     * 아니라 예전 포맷이고, 버리면 진행을 통째로 잃는다.
     *
     * 그런데 **틀린 타입으로 넣어 본 적이 한 번도 없었다.** 브라우저에서
     * 저장값을 망가뜨려 보다가 알았다. 문자열이 `foundClues`로 들어오면
     * 그대로 새어 흔적 계수기가 `.length`를 글자 수로 세게 된다.
     */
    // Arrange — 여정 부분은 멀쩡하고 나중 필드만 엉망이다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: 2,
        questCompleted: false,
        defeatedTotal: 5,
        bossDefeated: 7,
        foundClues: "흔적",
      }),
    });

    // Act
    const loaded = loadProgress();

    // Assert — 진행은 남고, 이상한 값만 안전한 기본값이 된다
    expect(loaded?.questStepIndex, `loaded was: ${JSON.stringify(loaded)}`).toBe(2);
    expect(loaded?.defeatedTotal).toBe(5);
    expect(loaded?.bossDefeated, "숫자 7이 참으로 새어 들어갔다").toBe(false);
    expect(loaded?.foundClues, "문자열이 그대로 새어 들어갔다").toEqual([]);
  });

  it("모르는 흔적 id와 중복을 걸러낸다", () => {
    // 중복이 있으면 「3 / 3」을 채웠는데 실제로는 두 자리만 본 것이 된다
    const real = CLUES[0].id;
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: 0,
        questCompleted: false,
        defeatedTotal: 0,
        foundClues: [real, real, "없는-흔적", 42],
      }),
    });

    expect(loadProgress()?.foundClues).toEqual([real]);
  });

  it("어느 필드가 오염돼도 통째로 새지 않는다", () => {
    /*
     * 설정 쪽과 같은 이유다 — 필드를 더하면서 검증을 빠뜨리면 아무도 모른다.
     * 여기는 「이상하면 버린다」와 「기본값으로 대체한다」가 섞여 있으므로
     * **어느 쪽이든 쓰레기가 그대로 나오지 않는 것**만 본다.
     *
     * 필드 목록은 정상 저장을 한 번 왕복시켜 얻는다 — 손으로 적지 않는다.
     */
    // Arrange — 정상 저장에서 필드 이름을 얻는다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: 1,
        questCompleted: false,
        defeatedTotal: 1,
      }),
    });
    const shape = loadProgress();
    expect(shape, "정상 저장을 못 읽었다").not.toBeNull();
    if (!shape) return;

    const garbage: Record<string, unknown> = { version: 1 };
    for (const key of Object.keys(shape)) {
      if (key === "version") continue;
      garbage[key] = {};
    }
    expect(Object.keys(garbage).length, "오염시킨 필드가 너무 적다").toBeGreaterThan(4);

    stubStorage({ stored: JSON.stringify(garbage) });

    // Act
    const loaded = loadProgress();

    // Assert — 버려도 좋고 대체해도 좋지만, `{}`가 그대로 나오면 안 된다
    if (loaded === null) return;
    for (const [key, value] of Object.entries(loaded)) {
      expect(
        typeof value === "object" && !Array.isArray(value),
        `${key}에 오염된 값이 그대로 들어왔다: ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it("손상된 JSON이면 null", () => {
    stubStorage({ stored: "{not json" });
    expect(loadProgress()).toBeNull();
  });

  it("알 수 없는 version이면 버린다", () => {
    // 퀘스트 콘텐츠가 바뀌면 예전 stepIndex는 엉뚱한 목표를 가리킨다
    stubStorage({
      stored: JSON.stringify({
        version: 99,
        questStepIndex: 2,
        questCompleted: false,
        defeatedTotal: 0,
      }),
    });
    expect(loadProgress()).toBeNull();
  });

  it("필드 타입이 틀리면 null", () => {
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: "셋",
        questCompleted: false,
        defeatedTotal: 0,
      }),
    });
    expect(loadProgress()).toBeNull();
  });

  it("음수 인덱스는 받지 않는다", () => {
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: -1,
        questCompleted: false,
        defeatedTotal: 0,
      }),
    });
    expect(loadProgress()).toBeNull();
  });

  it("소수점 인덱스는 내림한다", () => {
    // 배열 인덱스로 쓰이므로 정수여야 한다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        questStepIndex: 2.9,
        questCompleted: false,
        defeatedTotal: 4.7,
      }),
    });
    const loaded = loadProgress();
    expect(loaded?.questStepIndex, `was: ${loaded?.questStepIndex}`).toBe(2);
    expect(loaded?.defeatedTotal, `was: ${loaded?.defeatedTotal}`).toBe(4);
  });

  it("localStorage 접근이 막혀도 살아남는다", () => {
    // 사파리 프라이빗 모드는 접근 자체가 예외를 던진다
    stubStorage({ throwOn: "get" });
    expect(loadProgress()).toBeNull();
  });
});

describe("saveProgress", () => {
  it("version을 항상 현재 값으로 덮어쓴다", () => {
    // Arrange
    const store = stubStorage();

    // Act
    saveProgress({ questStepIndex: 1, questCompleted: false, defeatedTotal: 2 });

    // Assert
    const raw = store.get(PROGRESS_STORAGE_KEY);
    expect(raw, `raw was: ${raw}`).toBeDefined();
    expect(JSON.parse(raw as string).version).toBe(1);
  });

  it("저장한 값을 다시 읽을 수 있다", () => {
    stubStorage();
    saveProgress({ questStepIndex: 4, questCompleted: true, defeatedTotal: 9 });

    const loaded = loadProgress();
    expect(loaded?.questStepIndex, `was: ${loaded?.questStepIndex}`).toBe(4);
    expect(loaded?.questCompleted, `was: ${loaded?.questCompleted}`).toBe(true);
  });

  it("저장 실패는 예외를 던지지 않는다", () => {
    // 저장이 안 되는 것보다 플레이가 끊기는 쪽이 나쁘다
    stubStorage({ throwOn: "set" });
    expect(() =>
      saveProgress({ questStepIndex: 0, questCompleted: false, defeatedTotal: 0 }),
    ).not.toThrow();
  });
});

describe("clearProgress", () => {
  it("저장을 지운다", () => {
    stubStorage();
    saveProgress({ questStepIndex: 2, questCompleted: false, defeatedTotal: 1 });
    clearProgress();
    expect(loadProgress()).toBeNull();
  });

  it("삭제 실패도 예외를 던지지 않는다", () => {
    stubStorage({ throwOn: "remove" });
    expect(() => clearProgress()).not.toThrow();
  });
});

describe("clampStepIndex", () => {
  it("범위를 벗어난 인덱스를 잘라 낸다", () => {
    // 콘텐츠가 줄어든 뒤 예전 저장을 읽으면 존재하지 않는 단계를 가리킨다
    expect(clampStepIndex(9, 5)).toBe(4);
    expect(clampStepIndex(-3, 5)).toBe(0);
  });

  it("단계가 없으면 0", () => {
    expect(clampStepIndex(3, 0)).toBe(0);
  });

  it("정상 범위는 그대로 둔다", () => {
    expect(clampStepIndex(2, 5)).toBe(2);
  });
});

describe("손상된 저장이 그대로 흘러들지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** `questId`의 타입 검사를 없애도 검사가 전부
   * 통과했다 — 저장에 숫자나 객체가 들어 있으면 그대로 흘러든다.
   *
   * localStorage는 **외부 입력**이다. 사용자가 콘솔로 만질 수도 있고, 예전
   * 버전이 다른 형식으로 써 두었을 수도 있고, 확장 프로그램이 건드릴 수도 있다.
   * 「나중에 더한 필드가 이상해도 진행을 잃지 않는다」는 이미 있었지만
   * **여정 id 자체가 이상한 경우**는 아무도 보지 않았다.
   *
   * 이상한 여정 id는 조용히 아프다 — 없는 여정으로 열려 목표가 안 뜨거나,
   * 첫 여정으로 되돌아가 **진행을 잃은 것처럼** 보인다.
   */
  const base = {
    version: 1,
    questStepIndex: 2,
    questCompleted: false,
    defeatedTotal: 7,
    bossDefeated: false,
    foundClues: [],
  };

  const load = (questId: unknown) => {
    // 실제 저장소를 쓰면 검사끼리 상태가 샌다 — 이 파일의 스텁을 그대로 쓴다
    stubStorage({ stored: JSON.stringify({ ...base, questId }) });
    return loadProgress();
  };

  it("문자열이 아닌 여정 id를 받아들이지 않는다", () => {
    for (const bad of [42, true, { id: "x" }, ["x"], null]) {
      const loaded = load(bad);
      expect(loaded, `${JSON.stringify(bad)}에서 저장을 통째로 잃었다`).not.toBeNull();
      expect(
        loaded?.questId,
        `${JSON.stringify(bad)}이(가) 여정 id로 들어왔다`,
      ).toBeUndefined();
    }
  });

  it("이상한 여정 id 때문에 나머지 진행을 잃지는 않는다", () => {
    /*
     * 통째로 버리면 「한 필드가 깨졌다고 판을 지운다」가 된다 — 그쪽이 더 나쁘다.
     * 이상한 것만 떨어뜨리고 나머지는 살린다.
     */
    const loaded = load(42);
    expect(loaded?.questStepIndex, "단계를 잃었다").toBe(base.questStepIndex);
    expect(loaded?.defeatedTotal, "처치 수를 잃었다").toBe(base.defeatedTotal);
  });

  it("멀쩡한 여정 id는 그대로 온다", () => {
    // 막기만 하고 통과시키지 못하면 이어하기가 늘 첫 여정에서 시작한다
    expect(load("boss-hunt")?.questId, "멀쩡한 id가 사라졌다").toBe("boss-hunt");
  });
});

describe("저장이 막혔을 때 알 수 있는가", () => {
  /*
   * 시작 화면은 「여정 진행과 만난 도깨비는 이 브라우저에 저장된다」고
   * **약속한다.** 프라이빗 모드나 용량 초과에서는 그 약속이 지켜지지 않는데
   * 예전에는 조용히 삼켰다 — 한참 놀다 새로고침하고서야 알게 된다.
   *
   * 삼키는 것 자체는 맞다(저장 실패로 게임이 멈추면 안 된다). 다만 **부르는
   * 쪽이 알 수는 있어야** 화면에 알릴 수 있다.
   */
  it("막히면 거짓을 돌려준다", () => {
    stubStorage({ throwOn: "set" });
    expect(
      saveProgress({
        questStepIndex: 1,
        questCompleted: false,
        defeatedTotal: 0,
        bossDefeated: false,
        foundClues: [],
      }),
      "저장이 막혔는데 성공이라고 한다",
    ).toBe(false);
  });

  it("막혀도 던지지 않는다", () => {
    // 저장 실패로 게임이 멈추면 안 된다 — 그게 삼키는 이유다
    stubStorage({ throwOn: "set" });
    expect(() =>
      saveProgress({
        questStepIndex: 1,
        questCompleted: false,
        defeatedTotal: 0,
        bossDefeated: false,
        foundClues: [],
      }),
    ).not.toThrow();
  });

  it("되면 참을 돌려준다", () => {
    // 거짓만 돌려주면 「늘 실패」로 읽혀 알림이 항상 뜬다
    const store = stubStorage();
    expect(
      saveProgress({
        questStepIndex: 2,
        questCompleted: false,
        defeatedTotal: 3,
        bossDefeated: false,
        foundClues: [],
      }),
      "저장했는데 실패라고 한다",
    ).toBe(true);
    expect(store.get(PROGRESS_STORAGE_KEY), "저장소에 안 들어갔다").toBeTruthy();
  });
});

describe("망가진 저장을 걸러내는가", () => {
  /*
   * 저장은 사람이 손댈 수 있는 자리다(개발자 도구, 확장, 다른 탭). 형식이
   * 어긋난 값을 그대로 들이면 **게임이 이상한 상태로 시작하고 그 이유를 알
   * 방법이 없다** — 예를 들어 처치 수가 문자열이면 비교가 다 거짓이 되어
   * 여정이 영영 안 끝난다.
   *
   * 조건문 훑기에서 검증 두 줄이 「지워도 아무도 모른다」로 나왔다. 방어선이
   * 아니라 **실제로 밟을 수 있는 길**이라 값으로 잰다.
   */
  // 이 파일의 다른 검사들과 같은 스텁을 쓴다 — 진짜 저장소를 쓰면 순서에 의존한다
  function withStored(value: unknown): ReturnType<typeof loadProgress> {
    stubStorage({ stored: JSON.stringify(value) });
    return loadProgress();
  }

  const SOUND: Record<string, unknown> = {
    version: 1,
    questStepIndex: 1,
    questCompleted: false,
    defeatedTotal: 3,
  };

  it("멀쩡한 저장은 읽는다 — 이 검사가 늘 null이 되지 않게", () => {
    expect(withStored(SOUND), "멀쩡한 저장을 버렸다").not.toBeNull();
  });

  it("완주 여부가 불리언이 아니면 버린다", () => {
    expect(withStored({ ...SOUND, questCompleted: "네" }), "문자열 완주 여부를 들였다").toBeNull();
  });

  it("처치 수가 수가 아니면 버린다 — 비교가 다 거짓이 되어 여정이 안 끝난다", () => {
    expect(withStored({ ...SOUND, defeatedTotal: "많이" }), "문자열 처치 수를 들였다").toBeNull();
  });

  it("처치 수가 비어 있어도 버린다", () => {
    // JSON에는 NaN이 없지만 null이 들어오면 같은 자리로 온다
    expect(withStored({ ...SOUND, defeatedTotal: null }), "빈 처치 수를 들였다").toBeNull();
  });
});

describe("단계 번호를 잘라 내는가", () => {
  /*
   * 콘텐츠가 줄어든 뒤 예전 저장을 읽으면 범위 밖 번호가 들어온다.
   * `stepCount <= 0`을 안 막으면 **단계가 없는 여정에서 0으로 나눈 값**이
   * 나온다 — 그 파일 주석이 말하는 「마지막 방어선」이 뚫리는 자리다.
   */
  it("단계가 없으면 0이다", () => {
    expect(clampStepIndex(5, 0), "단계가 없는데 5를 그대로 쓴다").toBe(0);
    expect(clampStepIndex(-3, 0)).toBe(0);
  });

  it("범위 안은 그대로 둔다", () => {
    expect(clampStepIndex(1, 3)).toBe(1);
  });

  it("범위를 넘으면 마지막으로 당긴다", () => {
    expect(clampStepIndex(99, 3), "끝을 넘은 번호가 그대로다").toBeLessThan(3);
  });
});
