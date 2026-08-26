import { describe, expect, it } from "vitest";

import { readCode, collectSources } from "./support/source";

import { resolveAnimation } from "@/game/player/characterPose";
import { createQuestProgress, currentStep } from "@/game/quest/questRunner";
import { FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { LAYER_THRESHOLD } from "@/game/systems/audio/music";
import { downgrade, QUALITY_PRESETS, type QualityLevel } from "@/game/systems/quality";
import { clampStepIndex } from "@/game/systems/saveGame";

/*
 * 상태 전이의 경계.
 *
 * 여기 모은 것들은 전부 "조용히 잘못되는" 종류다 — 예외도 안 나고 타입도
 * 통과하지만 게임이 이상해진다. 품질 강등이 안 멈추거나, 저장값이 없는 단계를
 * 가리키거나, 음악 레이어 순서가 뒤집히는 것.
 */

describe("품질 강등", () => {
  it("가장 낮은 단계에서 멈춘다", () => {
    // 안 멈추면 매 4초마다 강등을 시도하며 리렌더를 반복한다
    expect(downgrade("low")).toBe("low");
  });

  it("한 단계씩만 내려간다", () => {
    expect(downgrade("high")).toBe("medium");
    expect(downgrade("medium")).toBe("low");
  });

  it("몇 번을 반복해도 수렴한다", () => {
    let level: QualityLevel = "high";
    for (let i = 0; i < 10; i += 1) level = downgrade(level);
    expect(level).toBe("low");
  });

  it("모든 단계에 프리셋이 있다", () => {
    for (const level of ["low", "medium", "high"] as QualityLevel[]) {
      expect(QUALITY_PRESETS[level], `${level} preset missing`).toBeDefined();
      expect(QUALITY_PRESETS[level].level).toBe(level);
    }
  });

  it("낮은 단계일수록 가볍다", () => {
    // 이름만 낮고 설정이 같으면 강등이 아무것도 안 한다
    expect(QUALITY_PRESETS.low.maxPixelRatio).toBeLessThanOrEqual(
      QUALITY_PRESETS.medium.maxPixelRatio,
    );
    expect(QUALITY_PRESETS.medium.fogFar).toBeLessThanOrEqual(QUALITY_PRESETS.high.fogFar);
    expect(QUALITY_PRESETS.low.shadows).toBe(false);
  });
});

describe("저장값 복구", () => {
  it("잘라 낸 단계는 언제나 실제 단계를 가리킨다", () => {
    /*
     * 콘텐츠가 줄어든 뒤 예전 저장값을 읽으면 없는 단계를 가리킬 수 있다.
     * 그러면 목표가 빈칸으로 뜨고 무엇을 해야 하는지 알 수 없다.
     */
    const count = FIRST_RUN_QUEST.steps.length;
    for (const saved of [-5, 0, 1, count - 1, count, count + 99, 1.7]) {
      const index = clampStepIndex(saved, count);
      const progress = { ...createQuestProgress(SIGNALS), stepIndex: index };
      expect(
        currentStep(FIRST_RUN_QUEST, progress),
        `saved ${saved} → index ${index}`,
      ).not.toBeNull();
    }
  });

  it("NaN이 들어와도 첫 단계로 떨어진다", () => {
    // 손상된 저장값에서 NaN이 나오면 비교가 전부 false가 되어 조용히 통과한다
    expect(clampStepIndex(Number.NaN, FIRST_RUN_QUEST.steps.length)).toBe(0);
  });

  it("무한대도 유효한 단계로 접힌다", () => {
    // JSON.parse("1e999")는 Infinity를 만든다. 저장 파일을 손으로 고치면 실제로 들어온다.
    const count = FIRST_RUN_QUEST.steps.length;
    expect(clampStepIndex(Number.POSITIVE_INFINITY, count)).toBe(count - 1);
    expect(clampStepIndex(Number.NEGATIVE_INFINITY, count)).toBe(0);
  });

  it("완주 상태에서는 현재 단계가 없다", () => {
    const progress = { ...createQuestProgress(SIGNALS), completed: true };
    expect(currentStep(FIRST_RUN_QUEST, progress)).toBeNull();
  });
});

describe("음악 레이어 문턱", () => {
  it("속도가 오르는 순서대로 쌓인다", () => {
    // 뒤집히면 "속도에 따라 쌓인다"는 설계가 깨지는데 귀로만 알 수 있다
    expect(LAYER_THRESHOLD.pad).toBeLessThan(LAYER_THRESHOLD.bass);
    expect(LAYER_THRESHOLD.bass).toBeLessThan(LAYER_THRESHOLD.hat);
    expect(LAYER_THRESHOLD.hat).toBeLessThan(LAYER_THRESHOLD.arp);
  });

  it("전부 0~1 안이다", () => {
    // 1을 넘으면 그 레이어는 영영 안 들린다
    for (const [name, value] of Object.entries(LAYER_THRESHOLD)) {
      expect(value, `${name} = ${value}`).toBeGreaterThanOrEqual(0);
      expect(value, `${name} = ${value}`).toBeLessThan(1);
    }
  });

  it("패드는 멈춰 있어도 들린다", () => {
    // 정적이 아니라 여백이어야 한다
    expect(LAYER_THRESHOLD.pad).toBe(0);
  });
});

describe("자세 선택", () => {
  it("모든 이동 상태에 자세가 있다", () => {
    /*
     * 하나라도 빠지면 그 상황에서 캐릭터가 마네킹처럼 굳는다.
     * 조합을 전부 훑어 undefined가 나오지 않는지 본다.
     */
    for (const grounded of [true, false]) {
      for (const onBoard of [true, false]) {
        for (const gliding of [true, false]) {
          for (const speed of [0, 1, 5, 15]) {
            const animation = resolveAnimation({
              speed,
              grounded,
              onBoard,
              gliding,
              landingImpact: 0,
            });
            expect(
              animation,
              `speed=${speed} grounded=${grounded} board=${onBoard} glide=${gliding}`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it("활강이 공중 자세보다 우선한다", () => {
    const animation = resolveAnimation({
      speed: 5,
      grounded: false,
      onBoard: false,
      gliding: true,
      landingImpact: 0,
    });
    expect(animation).toBe("glide");
  });
});

const SIGNALS = {
  position: { x: 0, y: 0, z: 0 },
  speed: 0,
  gliding: false,
  onBoard: false,
  defeatedTotal: 0,
  bossDefeated: false,
  cluesFound: 0,
};

describe("매 프레임 쓰는 값이 읽히기는 하는가", () => {
  /*
   * 「만들어 두고 연결하지 않으면 없는 것과 같다」를 이번 세션에 세 번 만났다
   * (분석 이벤트 7개, 확인 지점, 대사 3종). 매 프레임 갱신되는 값은 그 반대도
   * 아프다 — 아무도 안 읽는 필드를 초당 60번 쓰는 것은 순수한 낭비다.
   *
   * 소비자는 이름이 제각각이다(`stats`·`snapshot`·`motion`). 그래서 변수
   * 이름이 아니라 **필드 이름**으로 찾는다.
   */
  const types = readCode("src/game/scene/sceneTypes.ts");
  const block = types.slice(types.indexOf("export interface RuntimeStats {"));
  const fields = [...block.slice(0, block.indexOf("\n}")).matchAll(/^\s+(\w+)\??:/gm)].map(
    (m) => m[1],
  );

  const sources = collectSources("src")
    .filter((path) => !path.endsWith("sceneTypes.ts"))
    .map((path) => readCode(path))
    .join("\n");

  it("필드 목록을 실제로 읽었다", () => {
    // 인터페이스 이름이 바뀌면 빈 목록을 훑으며 통과한다
    expect(fields.length, `필드 ${fields.length}개`).toBeGreaterThan(10);
  });

  it("모든 필드에 읽는 곳이 있다", () => {
    const unread: string[] = [];
    for (const field of fields) {
      const writes = new RegExp(`stats\\.${field}\\s*=`, "g");
      const uses = new RegExp(`\\.${field}\\b`, "g");
      const total = (sources.match(uses) ?? []).length;
      const written = (sources.match(writes) ?? []).length;
      if (total - written <= 0) unread.push(field);
    }
    expect(unread, `쓰기만 하고 아무도 안 읽는 값:\n${unread.join(", ")}`).toEqual([]);
  });
});

describe("한 번 켜지면 안 꺼지는 상태", () => {
  /*
   * 완주 화면의 「닫음」 표시가 그랬다 — 한 번 켜지면 다시 꺼지지 않아,
   * 첫 여정을 닫은 사람에게는 **보스 완주 화면이 영영 뜨지 않았다.**
   * 게임에서 가장 큰 순간의 보상이 통째로 사라진 셈이다(반복 188).
   *
   * 한 방향 상태가 늘 틀린 것은 아니다. 「처음 한 번만」이 맞는 자리도 있다.
   * 다만 **왜 한 방향인지 적어야** 다음 사람이 판단할 수 있다.
   */
  const ONE_WAY: Record<string, string> = {
    initialized: "카메라를 첫 프레임에 한 번만 붙인다. 다시 하면 화면이 튄다",
    spokeStart: "시작 인사는 한 판에 한 번이다. 반복하면 인사가 아니라 알림이 된다",
    /*
     * `warnedAboutBoss`가 여기 있었다. 「언제 말하나」를 `quest/dialogue.ts`의
     * 정책 함수로 옮기면서 그 플래그는 `RemarkMemory`의 한 칸이 됐다 — useRef가
     * 아니므로 이 검사의 대상이 아니고, 대신 그쪽 검사가 규칙을 직접 잰다.
     */
    /*
     * 저장이 막힌 브라우저(프라이빗 모드·용량 초과)에서는 **저장할 때마다**
     * 실패한다 — 매번 알리면 알림이 화면을 덮는다. 한 판에 한 번이면 충분하고,
     * 새로고침하면 다시 알린다(그때는 진행이 사라진 것을 이미 본 뒤다).
     */
    warned: "저장 실패는 한 판에 한 번만 알린다. 매번 뜨면 알림이 화면을 덮는다",
  };

  it("한 방향 상태를 실제로 찾고 있다", () => {
    /*
     * 정규식이 `useRef(false)`·`useState(false)` 꼴을 글자로 찾는다. 표기가
     * 바뀌거나(줄바꿈·타입 인자) 경로가 어긋나면 **하나도 못 찾은 채 빈
     * 목록을 훑으며 통과한다.** ONE_WAY에 적어 둔 것이 실제로 잡히는지 본다.
     */
    const found = new Set<string>();
    for (const path of collectSources("src")) {
      const source = readCode(path);
      for (const match of source.matchAll(/const (\w+) = useRef\((?:false|true)\)/g)) {
        found.add(match[1]);
      }
      for (const match of source.matchAll(/const \[(\w+), set\w+\] = useState\(false\)/g)) {
        found.add(match[1]);
      }
    }
    expect(found.size, `찾은 불리언 상태 ${found.size}개`).toBeGreaterThan(10);

    const listed = Object.keys(ONE_WAY).filter((name) => found.has(name));
    expect(listed, `ONE_WAY에 적힌 것 중 실제로 찾은 것: ${listed.join(", ")}`).not.toEqual([]);
  });

  it("근거 없는 한 방향 상태가 늘지 않는다", () => {
    const surprises: string[] = [];

    for (const path of collectSources("src")) {
      const source = readCode(path);

      for (const match of source.matchAll(/const (\w+) = useRef\((?:false|true)\)/g)) {
        const name = match[1];
        const on = source.includes(`${name}.current = true`);
        const off = source.includes(`${name}.current = false`);
        if (on && !off && !(name in ONE_WAY)) surprises.push(`${path}: ${name}`);
      }

      for (const match of source.matchAll(/const \[(\w+), (set\w+)\] = useState\(false\)/g)) {
        const [, name, setter] = match;
        const on = source.includes(`${setter}(true)`);
        const off = source.includes(`${setter}(false)`);
        if (on && !off && !(name in ONE_WAY)) surprises.push(`${path}: ${name}`);
      }
    }

    expect(
      surprises,
      `되돌아가지 않는 상태:\n${surprises.join("\n")}\n` +
        "한 방향이 맞다면 ONE_WAY에 이유와 함께 적는다.",
    ).toEqual([]);
  });

  it("목록이 낡지 않았다", () => {
    // 지워진 이름을 계속 면제해 두면 목록이 거짓이 된다
    const all = collectSources("src")
      .map((path) => readCode(path))
      .join("\n");
    for (const name of Object.keys(ONE_WAY)) {
      expect(all, `ONE_WAY의 ${name}이 소스에 없다`).toContain(name);
    }
  });
});

describe("매 프레임 쓰는 값이 상수로 굳지 않았는가", () => {
  /*
   * 앞 검사의 짝이다. 저쪽은 「쓰기만 하고 아무도 안 읽는가」를 보고, 여기는
   * **「읽히기는 하는데 늘 같은 값인가」**를 본다. 둘 다 「연결된 것처럼 보이지만
   * 아무 말도 안 하는 값」이고, 화면에서는 똑같이 조용히 틀린다.
   *
   * 실제로 그렇게 뚫렸다: 동료가 사라지는 중에도 지도에 점을 남기지 않는 규칙을
   * 순수 함수로 빼서 검사까지 붙였는데, **화면 쪽에서 `= true`로 되돌려도 통과했다.**
   * 규칙은 지켜지고 배선만 끊긴 상태 — 이 저장소에서 가장 자주 나온 결함 모양이다.
   *
   * 조건부 초기화(`if (...) effects.x = 0;`)까지 막으면 쓸 데 없이 시끄럽다.
   * 그래서 **그 필드가 어디서도 계산된 값을 안 받을 때만** 문제로 본다.
   */
  const sources = collectSources("src")
    .filter((path) => !path.endsWith("sceneTypes.ts"))
    .map((path) => [path, readCode(path)] as const);

  const all = sources.map(([, code]) => code).join("\n");
  const OWNERS = "effects|stats|view|motion|snapshot";
  const CONSTANTS = "true|false|0|null";

  it("상수를 박는 줄을 실제로 훑었다", () => {
    // 소유자 이름이 다 바뀌면 빈 목록을 훑으며 통과한다 — 자를 먼저 확인한다
    const writes = all.match(new RegExp(`\\b(?:${OWNERS})\\.\\w+\\s*=`, "g")) ?? [];
    expect(writes.length, `공유 객체에 쓰는 줄 ${writes.length}개`).toBeGreaterThan(20);
  });

  it("늘 같은 값만 받는 필드가 없다", () => {
    const frozen: string[] = [];
    for (const [path, code] of sources) {
      const lines = code.split("\n");
      for (const [index, line] of lines.entries()) {
        const hit = new RegExp(`\\b(?:${OWNERS})\\.(\\w+)\\s*=\\s*(?:${CONSTANTS})\\s*;`).exec(
          line,
        );
        if (!hit) continue;
        const field = hit[1];
        const anyWrite = new RegExp(`\\b(?:${OWNERS})\\.${field}\\s*=\\s*(.+)$`, "gm");
        const rights = [...all.matchAll(anyWrite)].map((m) => m[1].trim());

        // 어디선가 계산된 값을 받는가 (상수가 아닌 오른쪽이 한 번이라도 있는가)
        const computed = rights.some((right) => !new RegExp(`^(?:${CONSTANTS})\\s*;`).test(right));
        /*
         * 상수만 받더라도 **서로 다른 상수**를 받으면 굳은 것이 아니다.
         *
         * 켜짐/꺼짐을 나타내는 칸이 실제로 그렇다 — 마운트에서 true,
         * 언마운트에서 false. 이것까지 잡으면 「값이 두 개뿐인 상태」를
         * 공유 객체에 담을 방법이 없어진다. 잡으려던 것은 「한 값으로
         * 굳어 아무 뜻이 없는 칸」이다.
         */
        const distinct = new Set(rights.map((right) => right.replace(/;.*$/, "").trim()));
        if (!computed && distinct.size < 2) frozen.push(`${path}:${index + 1}  ${line.trim()}`);
      }
    }
    expect(frozen, `늘 같은 값만 실리는 필드:\n${frozen.join("\n")}`).toEqual([]);
  });
});

describe("공유 화면 객체의 모든 칸이 채워지는가", () => {
  /*
   * 공유 객체에 쓰는 줄 **60개를 하나씩 지워 보니 51개는 아무도 몰랐다.**
   * 배선이 이 저장소에서 가장 자주 나온 결함 모양이라는 것이 숫자로 나온 셈이다.
   *
   * 그 51개는 전부 컴포넌트의 프레임 루프 안에 있어 값으로 재려면 하나하나 밖으로
   * 빼야 한다. 그 대신 **한 칸이라도 아무도 안 채우면 실패**하는 규칙을 둔다.
   * 지운 줄이 그 칸의 유일한 쓰기였다면 여기서 걸린다.
   *
   * 자를 두 번 고쳤다. 처음엔 `RuntimeStats`처럼 **최상위 인터페이스만** 읽었는데,
   * 정작 화면이 기다리는 칸 대부분은 `SceneProps` 안의 **중첩 객체**(bossView,
   * combatView, talkView…)에 있었다. 그리고 「원시 타입만 본다」로 좁혔더니
   * `district: DistrictId` 같은 **이름 붙은 값 타입**이 통째로 빠졌다.
   *
   * 앞의 두 검사와 한 벌이다:
   *   - 「쓰기만 하고 안 읽는 값」 — 만들어 놓고 아무도 안 본다
   *   - 「늘 같은 값만 받는 값」 — 연결은 됐는데 아무 말도 안 한다
   *   - (여기) 「아무도 안 채우는 칸」 — 화면이 기다리는데 안 온다
   *
   * 완전하지 않다. 같은 이름의 칸이 둘 이상이면 하나가 사라져도 다른 쪽이 가려
   * 준다. 그건 값으로 재는 수밖에 없고, 실제로 이번에 몇 곳을 그렇게 뺐다.
   */
  const sources = collectSources("src")
    .map((path) => readCode(path))
    .join("\n");

  /**
   * 그릇은 통째로 건네므로 대입이 없을 수 있다 — 칸별로 채우는 것만 본다.
   *
   * `RuntimeStats.combat: CombatCues`처럼 **이름 붙은 그릇**은 문법만으로 가릴 수
   * 없어 따로 적는다. 목록으로 빼는 것은 「아는 것만 담는다」는 약점이 있지만,
   * 여기서는 이유가 분명하고(전투 신호 묶음을 통째로 넘긴다) 수가 하나다.
   */
  const HANDED_WHOLE = new Set(["combat"]);

  function isContainer(type: string, field = ""): boolean {
    if (HANDED_WHOLE.has(field)) return true;
    return /[{[]|Array<|Float32Array|readonly/.test(type);
  }

  /**
   * 매 프레임 채워지는 칸들.
   *
   * `SceneProps`의 **최상위는 props**다 — JSX로 건네받는 것이지 대입으로 채우지
   * 않는다. 매 프레임 채우는 것은 그 안의 **중첩 화면 객체**(bossView, combatView,
   * talkView…)뿐이다. 처음에 깊이를 안 가리고 모았더니 props 스무 개가 통째로
   * 걸렸다 — 규칙이 결함 아닌 것을 물면 규칙을 좁힌다.
   */
  function nestedViewFields(path: string, name: string): string[] {
    const code = readCode(path);
    const start = code.indexOf(`export interface ${name} `);
    if (start < 0) return [];
    const body = code.slice(start, code.indexOf("\n}\n", start));
    const fields: string[] = [];
    // `무엇: {` 로 열리는 블록 안쪽만 본다
    for (const block of body.matchAll(/^ {2}\w+\??: \{\n([\s\S]*?)^ {2}\};/gm)) {
      for (const found of block[1].matchAll(/^\s+(\w+)\??:\s*([^;]+);/gm)) {
        if (!isContainer(found[2], found[1])) fields.push(found[1]);
      }
    }
    return fields;
  }

  /** 평평한 인터페이스는 최상위 칸이 곧 매 프레임 채우는 칸이다 */
  function flatViewFields(path: string, name: string): string[] {
    const code = readCode(path);
    const start = code.indexOf(`export interface ${name} `);
    if (start < 0) return [];
    const body = code.slice(start, code.indexOf("\n}\n", start));
    return [...body.matchAll(/^ {2}(\w+)\??:\s*([^;]+);/gm)]
      .filter((found) => !isContainer(found[2], found[1]))
      .map((found) => found[1]);
  }

  function viewFields(path: string, name: string): string[] {
    return name === "SceneProps" ? nestedViewFields(path, name) : flatViewFields(path, name);
  }

  const VIEWS: Array<[string, string]> = [
    ["src/game/scene/sceneTypes.ts", "RuntimeStats"],
    ["src/game/scene/sceneTypes.ts", "SceneProps"],
    /*
     * 대장 상태는 `SceneProps` 안에 모양을 손으로 적어 두었다가 정본을 가리키게
     * 바뀌었다 — 손으로 적은 쪽은 칸이 늘어도 따라오지 않았다. 중첩으로는 더
     * 이상 안 보이므로 여기서 따로 본다.
     */
    ["src/game/combat/bossSim.ts", "BossView"],
    ["src/game/scene/sceneTypes.ts", "PlayerLink"],
    ["src/game/quest/questRunner.ts", "QuestView"],
    ["src/game/player/GrappleVisuals.tsx", "GrappleView"],
  ];

  it.each(VIEWS)("%s의 %s에서 칸 목록을 실제로 읽었다", (path, name) => {
    // 인터페이스 이름이 바뀌면 빈 목록을 훑으며 조용히 통과한다 — 자부터 확인한다
    const fields = viewFields(path, name);
    expect(fields.length, `${name} 칸 ${fields.length}개`).toBeGreaterThan(2);
  });

  it("중첩 객체 안의 칸까지 본다", () => {
    // 자를 처음 썼을 때 여기가 통째로 빠져 있었다
    expect(viewFields("src/game/scene/sceneTypes.ts", "SceneProps")).toContain("playerDowned");
  });

  it("모든 칸에 채우는 곳이 있다", () => {
    const unwritten: string[] = [];
    for (const [path, name] of VIEWS) {
      for (const field of viewFields(path, name)) {
        /*
         * 대입 꼴 셋을 다 본다: `= 값`, `+= 값`(누적), `field.x = 값`(칸별).
         * 처음엔 `=`만 봤다가 **`elapsedSeconds += dt`를 못 읽고 결함이라고 했다.**
         * 자를 먼저 의심하는 습관이 또 필요했다.
         */
        const direct = new RegExp(`\\.${field}\\s*(?:[+\\-*/|?&]{1,2})?=[^=>]`).test(sources);
        const nested = new RegExp(`\\.${field}\\.\\w+\\s*=[^=>]`).test(sources);
        if (!direct && !nested) unwritten.push(`${name}.${field}`);
      }
    }
    expect(unwritten, `화면이 기다리는데 아무도 안 채우는 칸:\n${unwritten.join(", ")}`).toEqual(
      [],
    );
  });
});

describe("프레임마다 하는 일이 실제로 불리는가", () => {
  /*
   * 프레임 루프 안의 대입을 함수로 빼면 **칸은 값으로 잴 수 있게 되지만 배선은
   * 여전히 빈다** — 실제로 `projectBossView`를 빼고 다섯 칸을 다 물게 해 놓고도,
   * 컴포넌트에서 그 호출을 지우면 아무도 몰랐다.
   *
   * 「죽은 export」 검사도 여기서는 못 잡는다. 검사 파일이 부르고 있으니
   * **아무도 안 쓰는 것은 아니기** 때문이다. 「쓰이는가」와 「어디서 쓰이는가」는
   * 다른 질문이다.
   *
   * 그래서 **이름의 동사**로 묶는다: `project`(화면 칸을 채운다)·`record`(일어난
   * 일을 적는다)·`reset`(매 프레임 되돌린다)·`consume`(한 번짜리 신호를 꺼낸다).
   * 넷 다 **매 프레임 도는 곳에서 불려야** 뜻이 있다.
   *
   * 「화면(.tsx)에서」로 좁혔다가 넓혔다 — `consumeCues`는 화면이 아니라 오디오
   * 루프에서 돈다. 부르는 자리는 **프레임 루프가 있는 파일**이 맞다.
   */
  const VERBS = /^export function ((?:project|record|reset|consume|paint)\w+)/gm;

  const duties = collectSources("src").flatMap((path) =>
    [...readCode(path).matchAll(VERBS)].map((found) => ({ path, name: found[1] })),
  );

  /** 매 프레임 도는 파일들 — **정의한 파일은 뺀다** */
  function loopsOtherThan(definedIn: string): string {
    return (
      collectSources("src")
        .filter((path) => path !== definedIn)
        .map((path) => readCode(path))
        /*
         * 「도는 곳」에는 `setInterval`도 넣는다. `consumeDiscovery`를 부르는
         * `PlayClient`는 프레임이 아니라 **일정 간격**으로 신호를 가져간다 —
         * useFrame 안에서 setState를 부르면 매 프레임 리렌더가 걸리기 때문이다.
         * 그걸 빼 두면 멀쩡한 코드를 「안 불린다」고 잡는다.
         */
        .filter(
          (code) =>
            code.includes("useFrame(") ||
            code.includes("requestAnimationFrame(") ||
            code.includes("setInterval("),
        )
        .join("\n")
    );
  }

  it("프레임마다 하는 일을 실제로 찾았다", () => {
    // 이름 규칙이 바뀌면 빈 목록을 훑으며 조용히 통과한다
    expect(duties.length, `찾은 함수 ${duties.length}개`).toBeGreaterThan(10);
  });

  it("정의한 파일을 부르는 쪽에서 뺀다", () => {
    /*
     * 처음엔 안 뺐다가, 정의가 `.tsx`에 있는 `projectGrappleView`가 **자기
     * 정의를 호출로 세어** 조용히 통과했다. 그 뒤로 규칙을 쓸 때마다 사례
     * 전부에 변이를 걸어 확인한다.
     */
    const self = duties.find((duty) => duty.path.endsWith("GrappleVisuals.tsx"));
    expect(self, "정의가 .tsx에 있는 사례가 사라졌다 — 이 검사가 헛돈다").toBeDefined();
    if (self) expect(loopsOtherThan(self.path)).not.toContain(`export function ${self.name}`);
  });

  it("모두 프레임 루프에서 불린다", () => {
    const unused = duties.filter(
      ({ name, path }) => !new RegExp(`${name}\\(`).test(loopsOtherThan(path)),
    );
    expect(
      unused.map((entry) => `${entry.path}: ${entry.name}`),
      "프레임 루프에서 부르지 않는다 — 값은 맞는데 아무 일도 안 일어난다",
    ).toEqual([]);
  });
});

describe("넘겨받은 객체를 고치는 함수의 이름", () => {
  /*
   * 위 검사는 **이름의 동사**로 대상을 찾는다. 그래서 이름을 잘못 지으면
   * 조용히 비켜 간다 — 실제로 `takeDiscovery`라고 지었더니 검사가 아예 못 봤고,
   * 배선을 끊어도 통과했다. **이름이 곧 계약**인 구조라 이름을 검사해야 한다.
   *
   * 넘겨받은 객체를 고치는 함수는 다섯 중 하나여야 한다:
   *   `project`(화면 칸을 채운다)·`record`(일어난 일을 적는다)
   *   `reset`(매 프레임 되돌린다)·`consume`(한 번짜리 신호를 꺼낸다)
   *   `paint`(칠한다 — 캔버스에 긋거나 재질을 갈아입힌다)
   *
   * `paint`가 늦게 들어왔다. 지도를 컴포넌트에서 떼어 내면서 생겼는데, 넷 중
   * 어느 것도 아니다 — 화면 칸을 채우는 것이 아니라 **픽셀을 칠한다.** 이름을
   * 넷 중 하나로 우겨 넣으면 그 넷의 뜻이 흐려진다.
   *
   * React **훅과 컴포넌트**는 뺀다 — 이름 앞자리가 React 규칙으로 정해져 있어
   * 바꿀 수 없다(`use…`, PascalCase). 하는 일도 다르다: 훅은 이벤트를 받아
   * 채우고, 컴포넌트는 props를 구조 분해해 그 안의 공유 객체를 만진다.
   * 컴포넌트 안의 그 대입들이 바로 **밖으로 빼는 중인 대상**이고, 다 빼고 나면
   * 여기 걸릴 컴포넌트도 없어진다.
   */
  const VERBS = ["project", "record", "reset", "consume", "paint"];

  /** 첫 인자의 칸을 고치는 export 함수들 */
  const mutators = collectSources("src").flatMap((path) => {
    const code = readCode(path);
    const found: Array<{ path: string; name: string }> = [];
    for (const head of code.matchAll(/^export function (\w+)\(([^)]*)\)[^{]*\{/gm)) {
      const arg = /\s*(\w+)/.exec(head[2])?.[1];
      if (!arg) continue;

      // 본문 끝을 중괄호 짝으로 찾는다 — 정규식으로는 중첩을 못 센다
      let depth = 1;
      let index = head.index + head[0].length;
      while (index < code.length && depth > 0) {
        if (code[index] === "{") depth += 1;
        else if (code[index] === "}") depth -= 1;
        index += 1;
      }
      const body = code.slice(head.index + head[0].length, index);

      if (new RegExp(`\\b${arg}\\.\\w+(\\.\\w+)?\\s*[+\\-*/]?=[^=]`).test(body)) {
        found.push({ path, name: head[1] });
      }
    }
    return found;
  });

  it("고치는 함수를 실제로 찾았다", () => {
    // 본문 찾기가 헛돌면 빈 목록을 훑으며 통과한다
    expect(mutators.length, `찾은 함수 ${mutators.length}개`).toBeGreaterThan(15);
  });

  it("훅이 아니면 넷 중 한 동사로 시작한다", () => {
    const offNames = mutators
      .filter(({ name }) => !name.startsWith("use"))
      .filter(({ name }) => name[0] !== name[0].toUpperCase())
      .filter(({ name }) => !VERBS.some((verb) => name.startsWith(verb)));

    expect(
      offNames.map((entry) => `${entry.path}: ${entry.name}`),
      `넘겨받은 객체를 고치는데 이름이 가족 밖이다 (${VERBS.join("/")} 중 하나로)`,
    ).toEqual([]);
  });
});
