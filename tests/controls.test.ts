import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTROL_CODES, CONTROLS, hintRows, type ControlId } from "@/game/systems/controls";
import { EMOTES } from "@/game/player/emote";
import { PHOTO_POSE_ORDER } from "@/game/player/photoPose";
import { TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

describe("CONTROL_CODES", () => {
  it("같은 키에 두 기능이 걸려 있지 않다", () => {
    // 겹치면 먼저 검사하는 쪽만 동작하고 나머지는 조용히 죽는다
    const codes = Object.values(CONTROL_CODES);
    expect(new Set(codes).size, `codes: ${codes.join(",")}`).toBe(codes.length);
  });

  it("전부 KeyboardEvent.code 형식이다", () => {
    /*
     * key가 아니라 code를 써야 한다. 한글 입력 상태에서 J를 누르면 key는
     * "ㅓ"지만 code는 KeyJ 그대로다.
     */
    for (const [id, code] of Object.entries(CONTROL_CODES)) {
      expect(/^(Key[A-Z]|F\d+|Space|Shift(Left|Right))$/.test(code), `${id} = ${code}`).toBe(true);
    }
  });
});

describe("조작표", () => {
  it("코드가 있는 기능은 모두 표에 있다", () => {
    // 바인딩만 있고 표에 없으면 조작표를 읽어서는 알 수 없는 기능이 된다.
    // 실제로 포토 모드(P)가 그 상태였다.
    for (const id of Object.keys(CONTROL_CODES) as ControlId[]) {
      const row = CONTROLS.find((control) => control.id === id);
      expect(row, `${id} is bound but missing from the control table`).toBeDefined();
    }
  });

  it("키보드 표기가 실제 코드와 맞는다", () => {
    // "J"라고 적어 두고 KeyK를 듣고 있으면 아무도 못 찾는다
    for (const [id, code] of Object.entries(CONTROL_CODES)) {
      const row = CONTROLS.find((control) => control.id === id);
      if (!row) continue;
      const expected = code.startsWith("Key") ? code.slice(3) : code;
      expect(
        row.keyboard.includes(expected),
        `${id}: table says "${row.keyboard}" but code is ${code}`,
      ).toBe(true);
    }
  });

  it("모든 행에 터치 대안이 있다", () => {
    // 키보드만 있는 기능은 모바일에서 영영 못 쓴다
    for (const row of CONTROLS) {
      expect(row.touch.length, `${row.id} has no touch equivalent`).toBeGreaterThan(0);
    }
  });

  it("행동 설명이 비어 있지 않다", () => {
    for (const row of CONTROLS) {
      expect(row.action.length, `${row.id}`).toBeGreaterThan(0);
    }
  });

  it("HUD 힌트가 조작표의 부분집합이다", () => {
    const hints = hintRows();
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThan(CONTROLS.length + 1);
    for (const row of hints) {
      expect(CONTROLS).toContain(row);
    }
  });
});

describe("바인딩이 정본을 참조하는가", () => {
  /*
   * 소스를 직접 읽어 확인한다. 누군가 다시 문자열을 박아 넣으면 정본이
   * 무의미해지는데, 그건 타입으로 막을 수 없다.
   */
  const source = readFileSync("src/game/systems/input.ts", "utf8");

  it("키 코드를 문자열로 박아 두지 않았다", () => {
    const hardcoded = source.match(/event\.code === "(?!Space)[^"]+"/g) ?? [];
    expect(hardcoded, `hardcoded codes: ${hardcoded.join(", ")}`).toEqual([]);
  });

  it("정본에 있는 코드를 모두 쓴다", () => {
    for (const id of Object.keys(CONTROL_CODES)) {
      expect(source.includes(`CONTROL_CODES.${id}`), `input.ts never reads ${id}`).toBe(true);
    }
  });
});

describe("터치 조작 동등성", () => {
  /*
   * 조작표에 "터치 대안이 있다"고 적는 것과 실제 화면에 버튼이 있는 것은
   * 다르다. 이 프로젝트에서 모바일 누락은 세 번 반복된 실수다 —
   * 공격 버튼, 활강(점프 길게), 그래플 버튼이 각각 뒤늦게 추가됐다.
   *
   * 여기서는 **버튼이 존재하는지**만 본다. 눌렀을 때 동작하는지는 화면에서만
   * 확인할 수 있다.
   */
  /*
   * HUD 폴더 전체를 읽는다.
   *
   * 파일 세 개를 손으로 적어 두었더니, `WorldHud`가 800줄을 넘어 쪼개질 때
   * 포토 모드 버튼이 목록 밖으로 나갔다 — 버튼은 멀쩡한데 「없다」고 잡혔다.
   * 반대 방향도 위험하다: 옮겨 간 버튼을 못 보고 「있다」고 통과할 수 있다.
   *
   * 파일이 어떻게 나뉘든 HUD 전체를 보는 편이 맞다.
   */
  const hudFiles = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join("src/components/hud", name));
  const hud = hudFiles.map((path) => readFileSync(path, "utf8")).join("\n");

  /** 각 기능의 터치 버튼을 찾을 때 쓸 단서 */
  const TOUCH_MARKER: Record<string, string> = {
    board: "탈것",
    attack: "공격",
    grapple: "그래플",
    drink: "음료",
    talk: "살펴보기",
    dance: "춤",
    sound: "소리",
    zoomIn: "가까이",
    zoomOut: "멀리",
    // 이름이 동료마다 달라져 템플릿이 된다. 고정된 부분으로 찾는다.
    companion: "부르기",
    ability: "능력",
    weapon: "무기",
    photo: "사진",
    perf: "성능",
  };

  /*
   * **버튼의 이름표만** 모은다.
   *
   * 파일 전체를 이어 붙여 낱말을 찾았더니, 「살펴보기」 버튼을 통째로 지워도
   * 통과했다 — 같은 낱말이 안내 문구(`{talkKey} 살펴보기`)에도 있었기
   * 때문이다. 되돌려 보고 알았다.
   *
   * `label="..."`과 `label={...}` 둘 다 쓰므로 줄 끝까지 가져온다.
   */
  const labels = [...hud.matchAll(/\baria-label=|\blabel=/g)]
    .map((match) => hud.slice(match.index, hud.indexOf("\n", match.index)))
    .join("\n");

  it("이름표를 실제로 모았다", () => {
    // 속성 이름이 바뀌면 빈 문자열을 훑으며 「전부 있다」가 된다
    expect(labels.length, `모은 길이 ${labels.length}`).toBeGreaterThan(200);
  });

  it("키로 되는 모든 기능에 터치 버튼이 있다", () => {
    for (const [id, marker] of Object.entries(TOUCH_MARKER)) {
      expect(labels.includes(marker), `${id}: 「${marker}」라는 이름표를 단 버튼이 없다`).toBe(true);
    }
  });

  it("표에 있는 기능을 빠뜨리지 않았다", () => {
    // 새 기능을 조작표에만 넣고 버튼을 안 만들면 여기서 걸린다
    const bound = Object.keys(CONTROL_CODES);
    expect(Object.keys(TOUCH_MARKER).sort(), "TOUCH_MARKER가 낡았다").toEqual(bound.sort());
  });

  it("HUD 파일을 실제로 읽고 있다", () => {
    /*
     * 폴더가 비거나 이름 규칙이 바뀌면 빈 문자열을 훑으며 「전부 있다」로
     * 통과한다 — 이번 세션에 여러 번 겪은 실패 방식이다.
     */
    expect(hudFiles.length, `HUD 파일 ${hudFiles.length}개`).toBeGreaterThan(5);
    expect(hud.length, "읽은 내용이 비었다").toBeGreaterThan(5000);
  });

  it("동료 이름을 박아 두지 않았다", () => {
    /*
     * 「초롱」을 버튼에 직접 적어 두었더니 도깨비가 셋이 된 뒤 거짓말이 됐다.
     * 능력 이름도 같은 이유로 한 번 고쳤다.
     */
    // 주석은 뺀다 — 왜 이렇게 고쳤는지 적어 둔 문장까지 걸리면 기록을 못 남긴다
    const code = readFileSync("src/components/hud/TouchControls.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code.includes("초롱"), "TouchControls 코드에 특정 도깨비 이름이 박혀 있다").toBe(false);
    expect(code).toContain("dokebiName");
  });
});

describe("문서가 조작 수를 맞게 말하는가", () => {
  /*
   * 트레일러 분석이 「키 **7종** 전부에 터치 버튼」이라고 적어 두었는데
   * 정본은 열셋이었다. 이 문서는 프로젝트의 성적표라 다음 사람이 「어디까지
   * 했나」를 여기서 읽는다 — 절반짜리 숫자가 적혀 있으면 판단이 틀어진다.
   *
   * 터치 버튼이 **있는지**는 위 「터치 조작 동등성」이 본다. 여기서는
   * **문서의 숫자**만 정본과 맞춘다.
   */
  const analysis = readFileSync("docs/TRAILER_FEATURE_ANALYSIS.md", "utf8");

  it("터치 버튼 개수가 조작 정본과 같다", () => {
    const claimed = /키 (\d+)종 전부에 터치 버튼/.exec(analysis);
    expect(claimed, "터치 버튼 문장을 못 찾았다").not.toBeNull();

    const actual = Object.keys(CONTROL_CODES).length;
    expect(Number(claimed?.[1]), `문서 ${claimed?.[1]}종 vs 정본 ${actual}종`).toBe(actual);
  });

  it("문서가 말하는 나머지 개수도 정본과 같다", () => {
    /*
     * 목록을 손으로 적지 않는다 — 「문서가 말하는 것 → 정본」 짝을 표로 두고
     * 한 번에 본다. 새 숫자를 문서에 적으면 여기 한 줄을 더하면 된다.
     */
    const pairs: Array<[string, RegExp, number]> = [
      ["포토 모드 포즈", /포토 모드 포즈 (\d+)종/, PHOTO_POSE_ORDER.length],
      ["시간대", /시간대 (\d+)종/, TIME_OF_DAY_ORDER.length],
    ];

    for (const [name, pattern, actual] of pairs) {
      const claimed = pattern.exec(analysis);
      expect(claimed, `${name} 문장을 못 찾았다`).not.toBeNull();
      expect(Number(claimed?.[1]), `${name}: 문서 ${claimed?.[1]}종 vs 정본 ${actual}종`).toBe(
        actual,
      );
    }
  });

  it("디자인 가이드의 입력 표가 정본과 맞는다", () => {
    /*
     * 가이드가 「상호작용 **E**」라고 적어 두었는데 `E`는 동료 능력이고
     * 살펴보기는 `T`였다. 다음 사람이 입력 구조를 읽는 문서라 여기가 틀리면
     * 엉뚱한 키로 설계한다.
     *
     * 표에 적힌 **한 글자 키**를 뽑아 정본에 있는지만 본다. 어떤 행동에
     * 붙었는지까지 맞추려면 표를 정본으로 만들어야 하는데, 그건 이 문서의
     * 역할이 아니다(정본은 `CONTROL_CODES` 하나다).
     */
    const guide = readFileSync("docs/DESIGN_GUIDE.md", "utf8");
    const table = guide.slice(guide.indexOf("| 행동 | 키보드/마우스"), guide.indexOf("키 재설정은"));
    expect(table.length, "입력 표를 못 찾았다").toBeGreaterThan(80);

    // 리터럴 유니온이라 `has`가 넓은 문자열을 안 받는다 — 문자열로 낮춰 비교한다
    const bound = new Set<string>(Object.values(CONTROL_CODES));
    const named = new Set(["WASD", "Space", "Esc", "T", "E", "P"]);
    const letters = [...table.matchAll(/\| ([A-Z])(?=[ /|])/g)].map((match) => match[1]);
    expect(letters.length, `표에서 읽은 키 ${letters.length}개`).toBeGreaterThan(1);

    const unknown = letters.filter(
      (letter) => !bound.has(`Key${letter}`) && !named.has(letter),
    );
    expect(unknown, `정본에 없는 키를 안내한다: ${unknown.join(", ")}`).toEqual([]);
  });

  it("감정 표현 개수가 실제와 같다", () => {
    // 「플레이어 3종(춤·손 흔들기·앉기)」 — 하나를 빼도 문서는 그대로 남는다
    const claimed = /감정 표현 — 플레이어 (\d+)종/.exec(analysis);
    expect(claimed, "감정 표현 문장을 못 찾았다").not.toBeNull();
    expect(Number(claimed?.[1]), `문서 ${claimed?.[1]}종 vs 실제 ${EMOTES.length}종`).toBe(
      EMOTES.length,
    );
  });
});
