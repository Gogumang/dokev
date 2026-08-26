import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { dokebiPreset, DEFAULT_DOKEBI, DOKEBI } from "@/game/dokebi/roster";
import { appearancePreset, DEFAULT_APPEARANCE, APPEARANCES } from "@/game/player/appearance";
import { photoPosePreset, DEFAULT_PHOTO_POSE, PHOTO_POSES } from "@/game/player/photoPose";
import { photoFilterPreset, DEFAULT_PHOTO_FILTER, PHOTO_FILTERS } from "@/game/systems/photoFilter";
import { timeOfDayPreset, DEFAULT_TIME_OF_DAY, TIME_OF_DAY } from "@/game/world/timeOfDay";

/*
 * 빠뜨려도 조용한 인자.
 *
 * 해금 판정의 「만난 목록」에 기본값 `[]`가 있었고, 도감이 실제로 그것을
 * 빠뜨리고 있었다 — 자리가 있는 도깨비는 이미 함께 다녀도 「못 만난 것」이
 * 되는데 타입도 검사도 아무 말을 하지 않았다. 그쪽은 기본값을 없애 컴파일이
 * 막게 했다.
 *
 * 시뮬레이션 함수들은 사정이 다르다. 단위 검사가 90곳 넘게 부르고 있어
 * 기본값이 있는 편이 낫다 — 대신 **제품 호출**이 값을 다 넘기는지 본다.
 * 빠뜨리면 동료 능력이나 그래플이 조용히 아무 일도 하지 않게 된다.
 */

interface Required {
  fn: string;
  /** 그 호출에 반드시 들어 있어야 하는 낱말 */
  argument: string;
  /** 빠뜨리면 무엇이 조용해지는가 */
  breaks: string;
}

const REQUIRED: Required[] = [
  { fn: "stepEnemy", argument: "abilityAggroScale", breaks: "동료의 인지 낮추기 능력" },
  { fn: "stepPlayerCombat", argument: "abilityRegenScale", breaks: "동료의 회복 능력" },
  { fn: "stepLocomotion", argument: "grappleAnchors", breaks: "그래플이 걸 곳을 못 찾는다" },
  { fn: "stepAttack", argument: "weapon", breaks: "무기를 바꿔도 활 길이로 준비한다" },
  { fn: "followDistance", argument: "combatEase", breaks: "전투에서 카메라가 물러나지 않는다" },
];

describe("제품 호출이 값을 다 넘기는가", () => {
  /** 호출 지점부터 인자 목록 끝까지 — 여러 줄에 걸쳐 있다 */
  function callsOf(source: string, fn: string): string[] {
    const calls: string[] = [];
    let at = source.indexOf(`${fn}(`);
    while (at > -1) {
      const end = source.indexOf(");", at);
      calls.push(source.slice(at, end > -1 ? end : at + 400));
      at = source.indexOf(`${fn}(`, at + 1);
    }
    return calls;
  }

  it("목록이 낡지 않았다", () => {
    /*
     * 이 목록은 **판단**이라 자동으로 만들 수 없다 — 「빠뜨리면 무엇이 조용히
     * 죽는가」는 사람이 정한다. 대신 목록이 현실과 어긋나는 것은 막을 수 있다.
     *
     * 함수가 사라지거나 이름이 바뀌면 검사는 「부르는 파일이 없다」로 통과해
     * 버린다 — 지키는 척만 하게 된다. 그래서 **정의가 실재하는지**부터 본다.
     */
    const sources = collectSources("src")
      .map((path) => readCode(path))
      .join("\n");

    for (const { fn, argument } of REQUIRED) {
      expect(sources, `${fn} 정의가 없다 — 목록이 낡았다`).toMatch(
        new RegExp(`export function ${fn}\\(`),
      );
      expect(sources, `${argument}라는 이름이 어디에도 없다 — 목록이 낡았다`).toContain(argument);
    }
  });

  for (const { fn, argument, breaks } of REQUIRED) {
    it(`${fn} 호출이 ${argument}를 넘긴다`, () => {
      const users = collectSources("src").filter((path) => {
        const source = readCode(path);
        // 정의부는 제외한다 — 기본값을 두는 곳이다
        return source.includes(`${fn}(`) && !source.includes(`export function ${fn}(`);
      });
      expect(users.length, `${fn}을 부르는 파일 ${users.length}개`).toBeGreaterThan(0);

      for (const path of users) {
        for (const call of callsOf(readCode(path), fn)) {
          expect(call, `${path}: ${argument}가 없다 — ${breaks}가 조용히 죽는다`).toContain(
            argument,
          );
        }
      }
    });
  }
});

describe("브라우저 저장소를 만지는 곳", () => {
  /*
   * 사파리 프라이빗 모드에서는 `localStorage`에 **접근하는 것만으로도**
   * 예외가 난다. 게임 중에 터지면 화면이 통째로 검게 나가고, 사용자는
   * 자기가 무엇을 잘못했는지 알 방법이 없다.
   *
   * `saveGame.ts`와 `settings.ts`에는 「막혀도 살아남는다」 검사가 각각
   * 있다. 하지만 그건 **그 두 파일만** 본다 — 내일 다른 파일이
   * `localStorage`를 만지면 아무도 모른다. 만지는 곳을 찾아서 전부 본다.
   */
  const touches = collectSources("src")
    .map((path) => ({ path, lines: readCode(path).split("\n") }))
    .flatMap(({ path, lines }) => {
      let depth = 0;
      const found: { path: string; line: number; guarded: boolean }[] = [];
      lines.forEach((line, index) => {
        // 주석은 세지 않는다 — 「프라이빗 모드에서 예외가 난다」 같은 설명이 걸린다
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/\btry\s*\{/.test(code)) depth += 1;
        if (/\}\s*catch/.test(code)) depth -= 1;
        if (code.includes("localStorage")) {
          found.push({ path, line: index + 1, guarded: depth > 0 });
        }
      });
      return found;
    });

  it("만지는 곳을 실제로 찾았다", () => {
    expect(touches.length, `찾은 곳 ${touches.length}군데`).toBeGreaterThan(3);
  });

  it("모두 예외를 삼킨다", () => {
    const bare = touches
      .filter((touch) => !touch.guarded)
      .map((touch) => `${touch.path}:${touch.line}`);
    expect(bare, `try 없이 만지는 곳:\n${bare.join("\n")}`).toEqual([]);
  });
});

describe("모르는 id를 안전하게 되돌리는가", () => {
  /*
   * `RECORD[id as Type] ?? RECORD[DEFAULT]`는 안전해 보이지만 **프로토타입의
   * 것을 못 거른다.** `timeOfDayPreset("constructor")`가 `Object` 함수를
   * 돌려줬고, 호출부가 읽는 `sky`는 undefined였다 — 「모르는 id면 기본값」
   * 이라는 그 함수의 약속이 그 자리에서 깨진다.
   *
   * `?see=constructor`로 시나리오가 열리는 것을 보고 찾았고, 훑어 보니
   * **다섯 군데**가 같은 모양이었다(시간대·도깨비·색보정·외형·포즈).
   *
   * 목록으로 적지 않는다. 「캐스팅한 키로 객체를 찾는 곳」을 전부 찾아
   * 자기 것인지 확인하고 쓰는지 본다.
   */
  const lookups = collectSources("src").flatMap((path) => {
    const source = readCode(path);
    return [...source.matchAll(/(\w+)\[(\w+) as \w+\]/g)].map((match) => ({
      path,
      what: match[0],
      // 같은 문장 안에서 자기 것인지 확인했는가
      guarded: source.slice(Math.max(0, match.index - 160), match.index).includes("hasOwn"),
    }));
  });

  it("그런 조회를 실제로 찾았다", () => {
    expect(lookups.length, `찾은 조회 ${lookups.length}군데`).toBeGreaterThan(3);
  });

  it("실제로 불러 봐도 기본값이 나온다", () => {
    /*
     * 정적 훑기는 「확인하는 코드가 있다」만 본다. 정말 기본값이 나오는지는
     * 불러 봐야 안다 — 프로토타입에 있는 이름 셋으로 다섯 함수를 다 부른다.
     */
    const cases = [
      ["시간대", (id: string) => timeOfDayPreset(id), TIME_OF_DAY[DEFAULT_TIME_OF_DAY]],
      ["도깨비", (id: string) => dokebiPreset(id), DOKEBI[DEFAULT_DOKEBI]],
      ["색보정", (id: string) => photoFilterPreset(id), PHOTO_FILTERS[DEFAULT_PHOTO_FILTER]],
      ["외형", (id: string) => appearancePreset(id), APPEARANCES[DEFAULT_APPEARANCE]],
      ["포즈", (id: string) => photoPosePreset(id), PHOTO_POSES[DEFAULT_PHOTO_POSE]],
    ] as const;

    for (const [name, lookup, fallback] of cases) {
      for (const key of ["constructor", "toString", "__proto__", "valueOf"]) {
        expect(lookup(key), `${name}: ${key}가 기본값으로 안 돌아왔다`).toBe(fallback);
      }
    }
  });

  it("모두 자기 것인지 확인하고 쓴다", () => {
    const bare = lookups
      .filter((lookup) => !lookup.guarded)
      .map((lookup) => `${lookup.path}: ${lookup.what}`);
    expect(bare, `프로토타입이 새는 조회:\n${bare.join("\n")}`).toEqual([]);
  });
});

describe("스스로 무력화되는 검사가 없는가", () => {
  /*
   * 검사가 조건을 못 찾으면 그냥 빠져나가는 코드가 있었다.
   *
   *     const claimsTwo = hints.includes("두 번 때리면");
   *     if (!claimsTwo) return;
   *
   * 문구를 「세 번 때리면」으로 고쳐 적는 순간 검사가 사라진다 — **틀린
   * 안내를 막으려던 검사가 하필 틀린 안내에만 반응하지 않는다.** 훑어 보니
   * 이 모양이 여섯 군데였고 둘은 진짜 구멍이었다(팔레트 주석, 명부 진행도).
   *
   * 빠져나가는 것 자체는 괜찮다 — 타입을 좁히려면 필요하다. 다만 **그 값이
   * 있다는 것을 어딘가에서 단언**해야 한다. 같은 파일 안이면 형제 검사여도
   * 좋다(`도달 목표가 있다`가 그렇게 지킨다).
   *
   * 파일 단위라 느슨하다 — 같은 이름을 쓰는 다른 검사가 단언하면 통과한다.
   * 그래도 맞다: 그 경우 값이 사라지면 **그 형제 검사가 시끄럽게 실패**하므로
   * 조용히 사라지는 일은 없다. 되돌려 확인할 때 이 점을 잘못 짚어 한 번
   * 「규칙이 헐겁다」고 결론 낼 뻔했다 — 파일 안의 단언을 **전부** 지우니 잡혔다.
   */
  const skips = collectSources("tests").flatMap((path) => {
    const lines = readCode(path).split("\n");
    const whole = lines.join("\n");
    return lines.flatMap((line, index) => {
      const match = /if \(!(\w+)[^)]*\) return;/.exec(line);
      if (!match) return [];
      /*
       * 문자열 안에 적힌 코드는 세지 않는다 — 소스에서 그 문장을 찾는
       * 검사(`expect(hud).toContain("if (!codexOpen ...) return;")`)가
       * 자기 자신에게 걸렸다.
       */
      if (/["'`]/.test(line.slice(0, match.index))) return [];
      const name = match[1];
      const asserted = new RegExp(`expect\\(\\s*${name}\\b`).test(whole);
      return asserted ? [] : [`${path}:${index + 1} — ${name}`];
    });
  });

  it("그런 자리를 실제로 훑었다", () => {
    // 훑기가 망가지면 빈 목록이 되고 아래 검사는 통과한다
    const total = collectSources("tests").filter((path) =>
      /if \(!\w+[^)]*\) return;/.test(readCode(path)),
    );
    expect(total.length, `조건부로 빠져나가는 파일 ${total.length}개`).toBeGreaterThan(3);
  });

  it("빠져나가기 전에 그 값이 있다고 단언한다", () => {
    expect(skips, `단언 없이 빠져나간다:\n${skips.join("\n")}`).toEqual([]);
  });
});
