import { afterEach, describe, expect, it, vi } from "vitest";

import { migrateStorageKey } from "@/game/systems/storageMigration";

/*
 * 이름이 바뀐 저장 키 옮기기.
 *
 * 프로젝트 이름이 `DOGGABI CITY`에서 `DokeV`로 바뀌면서 저장 키도 바뀌었다.
 * 옮기지 않으면 그때까지 플레이한 사람의 **진행·설정·만난 도깨비가 통째로
 * 사라지고**, 화면에는 「처음 시작」으로 보인다 — 이 저장소가 가장 조심해 온
 * 사고이고, 확인 지점 작업에서 실제로 두 번 겪었다.
 *
 * 「옮긴다」만 재면 절반이다. **덮어쓰지 않는지**와 **두 번 옮기지 않는지**가
 * 같이 맞아야 뜻이 있다.
 */

/** 실제 저장소를 쓰면 검사끼리 상태가 새고 순서에 의존한다 */
function stubStorage(
  initial: Record<string, string> = {},
  options: { throwOn?: "get" | "set" } = {},
) {
  const store = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => {
      if (options.throwOn === "get") throw new Error("차단됨");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options.throwOn === "set") throw new Error("용량 초과");
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return { store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("이름이 바뀐 저장 키를 옮기는가", () => {
  it("옛 키의 값이 새 키로 넘어온다", () => {
    const { store } = stubStorage({ "옛.키": '{"진행":3}' });

    expect(migrateStorageKey("옛.키", "새.키"), "안 옮겼다").toBe(true);
    expect(store.get("새.키"), "새 키가 비었다 — 진행이 사라졌다").toBe('{"진행":3}');
  });

  it("옮긴 뒤 옛 키를 지운다 — 남으면 다음에 어느 쪽이 최신인지 모른다", () => {
    const { store } = stubStorage({ "옛.키": "값" });
    migrateStorageKey("옛.키", "새.키");

    expect(store.has("옛.키"), "옛 키가 남았다").toBe(false);
  });

  it("값을 그대로 옮긴다 — 파싱하거나 손대지 않는다", () => {
    // 형식이 깨진 값도 그대로 넘긴다. 검증은 읽는 쪽이 이미 한다
    const broken = '{"version":1,"defeatedTotal":"많이"';
    const { store } = stubStorage({ "옛.키": broken });
    migrateStorageKey("옛.키", "새.키");

    expect(store.get("새.키"), "값이 바뀌었다").toBe(broken);
  });

  it("새 키가 이미 있으면 덮어쓰지 않는다 — 새로 쌓은 진행이 사라진다", () => {
    const { store } = stubStorage({ "옛.키": "옛것", "새.키": "새것" });

    expect(migrateStorageKey("옛.키", "새.키"), "덮어쓰려 했다").toBe(false);
    expect(store.get("새.키"), "새 진행이 옛것으로 덮였다").toBe("새것");
  });

  it("두 번 불러도 한 번만 옮긴다", () => {
    const { store } = stubStorage({ "옛.키": "값" });

    expect(migrateStorageKey("옛.키", "새.키"), "첫 번째에 안 옮겼다").toBe(true);
    // 그 사이 새 진행이 쌓였다고 하자
    store.set("새.키", "그 뒤로 쌓인 것");
    store.set("옛.키", "옛것");

    expect(migrateStorageKey("옛.키", "새.키"), "두 번째에 또 옮겼다").toBe(false);
    expect(store.get("새.키"), "쌓인 진행이 사라졌다").toBe("그 뒤로 쌓인 것");
  });

  it("옮길 것이 없으면 아무 일도 없다 — 처음 켠 사람이다", () => {
    const { store } = stubStorage();

    expect(migrateStorageKey("옛.키", "새.키")).toBe(false);
    expect(store.size, "없던 값을 만들었다").toBe(0);
  });

  it("저장소가 막혀 있어도 던지지 않는다 — 사생활 보호 모드", () => {
    stubStorage({ "옛.키": "값" }, { throwOn: "get" });

    expect(() => migrateStorageKey("옛.키", "새.키"), "예외가 새어 나왔다").not.toThrow();
    expect(migrateStorageKey("옛.키", "새.키")).toBe(false);
  });

  it("쓰기가 막혀도 던지지 않는다 — 용량 초과", () => {
    stubStorage({ "옛.키": "값" }, { throwOn: "set" });

    expect(() => migrateStorageKey("옛.키", "새.키")).not.toThrow();
  });

  it("서버에서는 아무것도 안 한다", () => {
    vi.stubGlobal("window", undefined);

    expect(migrateStorageKey("옛.키", "새.키")).toBe(false);
  });
});
