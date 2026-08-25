import { readFileSync } from "node:fs";

import { readCode } from "./support/source";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SETTINGS,
  loadSettings,
  getServerSettingsSnapshot,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type PlayerSettings,
} from "@/game/systems/settings";

interface FakeStorage {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
}

/**
 * localStorage만 가진 최소 window 스텁.
 *
 * jsdom을 끌어오지 않는 이유: settings.ts가 쓰는 브라우저 API는 localStorage 하나뿐이라
 * DOM 전체를 띄우면 테스트가 느려지기만 하고 검증되는 것은 늘지 않는다.
 */
function stubStorage(
  options: { stored?: string | null; getItemThrows?: boolean; setItemThrows?: boolean } = {},
): FakeStorage {
  const storage: FakeStorage = {
    getItem: vi.fn(() => {
      if (options.getItemThrows) throw new DOMException("SecurityError");
      return options.stored ?? null;
    }),
    setItem: vi.fn(() => {
      if (options.setItemThrows) throw new DOMException("QuotaExceededError");
    }),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSettings", () => {
  it("저장된 값이 없으면 기본값을 돌려준다", () => {
    // Arrange
    const storage = stubStorage({ stored: null });

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
    expect(storage.getItem).toHaveBeenCalledWith(SETTINGS_STORAGE_KEY);
  });

  it("정상 저장값은 기본값과 구분되게 그대로 읽는다", () => {
    // Arrange — 모든 필드를 기본값과 다르게 둔다.
    // 그래야 "복구 경로로 샜는데 통과하는" 테스트가 되지 않는다.
    const saved: PlayerSettings = {
      version: 1,
      sound: false,
      reducedMotion: true,
      quality: "low",
      timeOfDay: "night",
      photoFilter: "dream",
      photoPose: "cheer",
      dokebi: "geueum",
      appearance: "mint",
      nickname: "",
      metDokebi: ["geueum"],
    };
    stubStorage({ stored: JSON.stringify(saved) });

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(saved);
    expect(result, `result was: ${JSON.stringify(result)}`).not.toEqual(DEFAULT_SETTINGS);
  });

  it("손상된 JSON이면 기본값으로 복구한다", () => {
    // Arrange
    stubStorage({ stored: "{ not json at all" });

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  it("알 수 없는 version이면 통째로 기본값으로 되돌린다", () => {
    // Arrange — 예전(혹은 미래) 버전이 남긴 값
    stubStorage({
      stored: JSON.stringify({ version: 99, sound: false, reducedMotion: true, quality: "low" }),
    });

    // Act
    const result = loadSettings();

    // Assert — 의미가 바뀐 값을 그대로 읽으면 조용히 잘못된 설정으로 플레이하게 된다
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  it("version 필드 자체가 없으면 기본값으로 되돌린다", () => {
    // Arrange
    stubStorage({ stored: JSON.stringify({ sound: false, quality: "high" }) });

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  it("JSON이 객체가 아니면 기본값으로 되돌린다", () => {
    // Arrange & Act & Assert
    for (const stored of ["123", '"hello"', "null", "true", "[]"]) {
      stubStorage({ stored });
      const result = loadSettings();
      expect(result, `stored=${stored}, result=${JSON.stringify(result)}`).toEqual(
        DEFAULT_SETTINGS,
      );
      vi.unstubAllGlobals();
    }
  });

  it("필드 타입이 틀리면 그 필드만 기본값으로 되돌리고 나머지는 살린다", () => {
    // Arrange — sound만 오염됐다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        sound: "yes",
        reducedMotion: true,
        quality: "high",
      }),
    });

    // Act
    const result = loadSettings();

    // Assert
    expect(result.sound, `result was: ${JSON.stringify(result)}`).toBe(DEFAULT_SETTINGS.sound);
    expect(result.reducedMotion, `result was: ${JSON.stringify(result)}`).toBe(true);
    expect(result.quality, `result was: ${JSON.stringify(result)}`).toBe("high");
  });

  it("어느 필드가 오염돼도 기본값으로 막는다", () => {
    /*
     * 위 검사는 `sound` **하나만** 본다. 필드를 하나 더하면서 검증을
     * 빠뜨리면 아무도 모른다 — 이번 세션에 저장 쪽에서 정확히 그랬다
     * (`bossDefeated`·`foundClues`를 더하고 틀린 타입으로 넣어 본 적이
     * 없었다).
     *
     * 필드 목록을 손으로 적지 않는다. **정본의 키를 그대로 훑어** 전부
     * 쓰레기로 채운다 — 새 필드는 만들어지는 순간 이 검사를 받는다.
     *
     * `version`만 성한 값으로 둔다. 그것까지 망가뜨리면 통째로 되돌아가서
     * 「필드별 검증이 없어도」 통과해 버린다.
     */
    // Arrange — `{}`는 불리언·문자열·배열 어느 쪽으로도 틀린 값이다
    const garbage: Record<string, unknown> = { version: DEFAULT_SETTINGS.version };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key === "version") continue;
      garbage[key] = {};
    }
    expect(Object.keys(garbage).length, "오염시킨 필드가 너무 적다").toBeGreaterThan(5);

    stubStorage({ stored: JSON.stringify(garbage) });

    // Act
    const result = loadSettings();

    // Assert — 하나라도 그대로 새면 여기서 갈린다
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  it("알 수 없는 quality 값은 auto로 되돌린다", () => {
    // Arrange
    stubStorage({
      stored: JSON.stringify({ version: 1, sound: false, reducedMotion: false, quality: "ultra" }),
    });

    // Act
    const result = loadSettings();

    // Assert
    expect(result.quality, `result was: ${JSON.stringify(result)}`).toBe("auto");
    expect(result.sound, `result was: ${JSON.stringify(result)}`).toBe(false);
  });

  it("localStorage 접근이 예외를 던져도 기본값으로 살아남는다", () => {
    // Arrange — 사파리 프라이빗 모드에서는 getItem 자체가 던진다
    stubStorage({ getItemThrows: true });

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  it("window가 없으면(서버 렌더) 저장소를 건드리지 않고 기본값을 돌려준다", () => {
    // Arrange
    vi.stubGlobal("window", undefined);

    // Act
    const result = loadSettings();

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(DEFAULT_SETTINGS);
  });

  /**
   * 소스 문제로 보여 skip 처리했다 (잠재 위험 — 지금 이 값을 변경하는 호출자는 없다).
   *
   * settings.ts의 모든 복구 경로(46·54·57·61·64·76행)가 공유 상수 DEFAULT_SETTINGS를
   * **참조 그대로** 돌려준다. PlayerSettings 필드가 readonly가 아니고 객체도 얼지 않아,
   * 호출자가 한 번 변경하면 프로세스 수명 내내 모든 복구 경로의 기본값이 오염된다.
   * 고치는 방법은 `{ ...DEFAULT_SETTINGS }` 반환 또는 Object.freeze 중 하나다.
   */
  it("반환값을 변경해도 다음 호출의 기본값이 오염되지 않는다", () => {
    // Arrange
    stubStorage({ stored: null });

    // Act
    const first = loadSettings();
    first.sound = false;
    const second = loadSettings();

    // Assert
    expect(second.sound, `second was: ${JSON.stringify(second)}`).toBe(true);
  });
});

describe("saveSettings", () => {
  it("저장 시 version을 항상 현재 버전으로 덮어쓴다", () => {
    // Arrange
    const storage = stubStorage();

    // Act — 호출자가 이상한 version을 들고 와도 그대로 굳으면 안 된다
    saveSettings({
      version: 99,
      sound: false,
      reducedMotion: true,
      quality: "medium",
      timeOfDay: "noon",
      photoFilter: "cool",
      photoPose: "wave",
      dokebi: "mulbineul",
      appearance: "plum",
      nickname: "",
      metDokebi: [],
    });

    // Assert
    const [key, value] = storage.setItem.mock.calls[0] as [string, string];
    const stored = JSON.parse(value) as PlayerSettings;
    expect(key, `key was: ${key}`).toBe(SETTINGS_STORAGE_KEY);
    expect(stored.version, `stored was: ${value}`).toBe(DEFAULT_SETTINGS.version);
    expect(stored.quality, `stored was: ${value}`).toBe("medium");
  });

  it("저장한 값을 다시 읽으면 같은 설정이 나온다 (왕복)", () => {
    // Arrange
    const settings: PlayerSettings = {
      version: 1,
      sound: false,
      reducedMotion: true,
      quality: "high",
      timeOfDay: "dawn",
      photoFilter: "nostalgia",
      photoPose: "ready",
      dokebi: "geueum",
      appearance: "mint",
      nickname: "",
      metDokebi: ["geueum"],
    };
    const storage = stubStorage();

    // Act
    saveSettings(settings);
    const [, written] = storage.setItem.mock.calls[0] as [string, string];
    stubStorage({ stored: written });
    const loaded = loadSettings();

    // Assert
    expect(loaded, `loaded was: ${JSON.stringify(loaded)}`).toEqual(settings);
  });

  it("저장이 실패해도 예외를 밖으로 던지지 않는다", () => {
    // Arrange — 용량 초과·프라이빗 모드
    stubStorage({ setItemThrows: true });

    // Act & Assert — 설정 저장 실패로 플레이가 끊기면 안 된다
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it("window가 없으면 저장을 시도조차 하지 않는다", () => {
    // Arrange
    const storage = stubStorage();
    vi.stubGlobal("window", undefined);

    // Act
    saveSettings(DEFAULT_SETTINGS);

    // Assert
    expect(storage.setItem, `calls=${storage.setItem.mock.calls.length}`).not.toHaveBeenCalled();
  });
});

describe("항목 추가 이후의 예전 저장값", () => {
  it("새 키가 없어도 나머지 설정은 살아남는다", () => {
    /*
     * 이 테스트가 버전 정책을 지킨다. 항목을 늘렸다고 버전을 올리면
     * 이미 저장된 사운드·품질 설정이 통째로 초기화된다.
     */
    stubStorage({
      stored: JSON.stringify({ version: 1, sound: false, reducedMotion: true, quality: "low" }),
    });

    const result = loadSettings();

    expect(result.sound, `result was: ${JSON.stringify(result)}`).toBe(false);
    expect(result.quality).toBe("low");
    expect(result.timeOfDay).toBe(DEFAULT_SETTINGS.timeOfDay);
    expect(result.photoFilter).toBe(DEFAULT_SETTINGS.photoFilter);
    expect(result.photoPose).toBe(DEFAULT_SETTINGS.photoPose);
    expect(result.metDokebi, "만난 기록이 없으면 빈 배열이어야 한다").toEqual([]);
  });

  it("모르는 도깨비 id는 버리고 아는 것만 남긴다", () => {
    // 콘솔로 넣은 값이 그대로 해금으로 이어지면 안 된다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        sound: true,
        reducedMotion: false,
        quality: "auto",
        metDokebi: ["geueum", "ghost", 7],
      }),
    });

    const result = loadSettings();
    expect(result.metDokebi, `metDokebi was: ${JSON.stringify(result.metDokebi)}`).toEqual([
      "geueum",
    ]);
  });

  it("배열이 아니면 통째로 비운다", () => {
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        sound: true,
        reducedMotion: false,
        quality: "auto",
        metDokebi: "geueum",
      }),
    });

    expect(loadSettings().metDokebi).toEqual([]);
  });

  it("모르는 값이 들어 있으면 그 항목만 기본값으로 되돌린다", () => {
    // 콘솔로 넣은 임의 문자열이 그대로 렌더에 들어가면 안 된다
    stubStorage({
      stored: JSON.stringify({
        version: 1,
        sound: true,
        reducedMotion: false,
        quality: "high",
        timeOfDay: "eclipse",
        photoFilter: 42,
        photoPose: null,
      }),
    });

    const result = loadSettings();

    expect(result.quality, "정상 항목은 유지되어야 한다").toBe("high");
    expect(result.timeOfDay).toBe(DEFAULT_SETTINGS.timeOfDay);
    expect(result.photoFilter).toBe(DEFAULT_SETTINGS.photoFilter);
    expect(result.photoPose).toBe(DEFAULT_SETTINGS.photoPose);
  });
});

describe("필드가 늘어난 뒤에도 예전 저장값을 이어받는가", () => {
  /*
   * 이 프로젝트는 항목을 여럿 추가하면서 **version을 올리지 않았다.** 올렸다면
   * 예전 값이 통째로 초기화되어, 소리를 꺼 두었던 사람이 다시 들어올 때 소리가
   * 켜진다 — 설정을 저장하는 이유가 사라진다.
   *
   * 대신 항목별 검증이 빠진 필드를 기본값으로 메운다. 그 경로가 실제로 도는지
   * 확인한다. 검증 함수가 하나라도 빠지면 `undefined`가 그대로 흘러 들어간다.
   */
  it("예전 판에만 있던 항목은 남고, 새 항목은 기본값으로 채워진다", () => {
    // 초기 판의 저장값 — 이후 추가된 필드가 하나도 없다
    const legacy = { version: 1, sound: false, reducedMotion: true, quality: "low" };
    stubStorage({ stored: JSON.stringify(legacy) });

    const loaded = loadSettings();

    expect(loaded.sound, "예전에 꺼 둔 소리가 켜졌다").toBe(false);
    expect(loaded.reducedMotion, "예전에 켜 둔 저감 모션이 꺼졌다").toBe(true);
    expect(loaded.quality).toBe("low");

    // 새 항목은 undefined가 아니라 기본값이어야 한다
    for (const [key, value] of Object.entries(loaded)) {
      expect(value, `${key}가 undefined다 — 검증 함수가 빠졌다`).toBeDefined();
    }
    expect(Array.isArray(loaded.metDokebi), "metDokebi가 배열이 아니다").toBe(true);
  });

  it("예전 값을 읽은 뒤 저장하면 새 항목까지 함께 남는다", () => {
    const legacy = { version: 1, sound: false, reducedMotion: false, quality: "auto" };
    const storage = stubStorage({ stored: JSON.stringify(legacy) });

    // 읽어서 메운 값을 그대로 다시 저장한다 — 실제 갱신 경로가 하는 일이다
    saveSettings({ ...loadSettings(), sound: true });
    const written = storage.setItem.mock.calls.at(-1)?.[1] ?? "{}";
    const stored = JSON.parse(written);

    expect(stored.sound).toBe(true);
    expect(stored.metDokebi, "새 항목이 저장되지 않았다").toBeDefined();
    expect(stored.appearance).toBeDefined();
  });
});

describe("저장 실패를 알리는 것과 삼키는 것", () => {
  /*
   * **둘이 다르게 굴고, 그게 맞다.**
   *
   * 진행(`saveProgress`)은 실패를 **돌려주고** 화면이 한 번 알린다 — 시작
   * 화면이 「이 브라우저에 저장된다」고 약속했고, 못 지키면 몇 시간이 사라진다.
   *
   * 설정(`saveSettings`)은 **삼킨다** — 소리·모션·외형은 다음에 다시 고르면
   * 되는 것이라, 알림을 띄우면 이득보다 방해가 크다.
   *
   * 이 비대칭을 **짝으로 적어 둔다.** 한쪽만 보면 「왜 여긴 안 알리지」나
   * 「왜 여긴 알리지」로 읽혀 둘 중 하나를 맞춘다고 고치게 된다 — 그러면
   * 잃는 것의 무게 차이가 사라진다.
   */
  it("진행은 실패를 돌려준다", () => {
    const source = readCode("src/game/systems/saveGame.ts");
    expect(source, "진행 저장이 성공 여부를 안 돌려준다").toMatch(
      /export function saveProgress\([^)]*\): boolean/,
    );
  });

  it("설정도 실패를 돌려준다 — 한 덩어리에 두 종류가 섞여 있다", () => {
    /*
     * 처음엔 「설정은 삼켜도 된다」로 적었는데 **너무 넓었다.** 같은 저장 키에
     * 소리·모션 같은 **취향**과 만난 도깨비·이름 같은 **모은 것**이 함께 있다.
     * 앞의 것은 다시 고르면 되지만 뒤의 것은 잃는 것이다.
     *
     * 그래서 저장 쪽은 **성공 여부만 돌려주고**, 알릴지 말지는 부르는 쪽이 정한다.
     */
    const source = readFileSync("src/game/systems/settings.ts", "utf8");
    expect(source, "설정 저장이 성공 여부를 안 돌려준다").toMatch(
      /export function saveSettings\([^)]*\): boolean/,
    );
    expect(source, "왜 두 종류가 섞여 있는지 적혀 있지 않다").toMatch(/모은 것/);
  });

  it("만난 도깨비가 안 남으면 알린다", () => {
    // 「새 도깨비를 만났다」고 축하해 놓고 다음에 오면 사라져 있으면 안 된다
    const client = readCode("src/app/play/PlayClient.tsx");
    expect(client, "수집 저장 실패를 알리지 않는다").toMatch(
      /const kept = updateSettings\(\{ metDokebi[\s\S]{0,160}if \(!kept\)/,
    );
  });

  it("취향은 여전히 조용하다", () => {
    /*
     * 소리·모션·시간대까지 알리면 알림이 화면을 덮는다. **잃는 것의 무게로**
     * 가른다 — 이 구분이 사라지면 둘 중 하나가 틀리게 된다.
     */
    const client = readCode("src/app/play/PlayClient.tsx");
    const noisy = [...client.matchAll(/updateSettings\(\{ (\w+)/g)]
      .map((match) => match[1])
      .filter((field) => !["metDokebi"].includes(field));
    expect(noisy.length, "취향을 바꾸는 곳이 없다 — 검사가 헛돈다").toBeGreaterThan(2);
    for (const field of noisy) {
      const at = client.indexOf(`updateSettings({ ${field}`);
      const after = client.slice(at, at + 120);
      expect(after, `${field} 저장 실패까지 알린다`).not.toContain("setCaptureNotice");
    }
  });
});

/*
 * 서버 스냅샷은 **같은 객체여야 한다.**
 *
 * `useSyncExternalStore`는 이 값이 안정적인 참조라고 가정한다. 호출마다 새
 * 객체를 돌려주면 React가 매번 「바뀌었다」로 읽어 **무한 렌더**로 간다.
 * 파일 주석이 이미 그렇게 적어 두었는데, 실제로 `{ ...SERVER_SNAPSHOT }`으로
 * 바꿔 봐도 아무 검사가 몰랐다 — 화면이 멈추는 급인데 글로만 있던 규칙이다.
 *
 * 값이 같은지가 아니라 **같은 것인지**를 본다(`toBe`). `toEqual`로 쓰면 새 객체를
 * 돌려줘도 통과해서 이 검사가 아무것도 안 막는다.
 */
describe("서버 스냅샷", () => {
  it("호출마다 같은 객체를 돌려준다 — 달라지면 무한 렌더다", () => {
    expect(getServerSettingsSnapshot()).toBe(getServerSettingsSnapshot());
  });

  it("얼려 두어 밖에서 못 바꾼다 — 공유 객체라 한 번 더럽혀지면 되돌릴 데가 없다", () => {
    expect(Object.isFrozen(getServerSettingsSnapshot())).toBe(true);
  });
});
