import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";
import {
  SCRIPTS,
  advanceLine,
  createScriptState,
  currentLine,
  startScript,
  type ScriptId,
} from "@/game/quest/script";

const IDS = Object.keys(SCRIPTS) as ScriptId[];

describe("대본이 실제로 말을 하는가", () => {
  it("빈 대본이 없다", () => {
    for (const id of IDS) {
      expect(SCRIPTS[id].length, `${id}가 비어 있다`).toBeGreaterThan(0);
    }
  });

  it("이어지는 말이다 — 한 줄짜리는 대본이 아니라 추임새다", () => {
    /*
     * 한 줄이면 `dialogue.ts`가 이미 하는 일이다. 여기 있을 이유가 없다.
     */
    for (const id of IDS) {
      expect(SCRIPTS[id].length, `${id}가 한 줄뿐이다`).toBeGreaterThan(1);
    }
  });

  it("한 줄이 너무 길지 않다", () => {
    /*
     * 3.2초에 읽을 수 있어야 한다. 넘치면 다음 줄로 넘어가 버려서 읽다 만다.
     */
    for (const id of IDS) {
      for (const line of SCRIPTS[id]) {
        expect(line.text.length, `${id}: "${line.text}" (${line.text.length}자)`).toBeLessThan(45);
      }
    }
  });

  it("화자가 있는 줄과 지문이 섞여 있다", () => {
    // 전부 대사면 장면이 안 보이고, 전부 지문이면 소설이 된다
    const first = SCRIPTS.firstProblem;
    expect(first.some((line) => line.speaker !== "")).toBe(true);
    expect(first.some((line) => line.speaker === "")).toBe(true);
  });
});

describe("세계관을 실제로 전하는가", () => {
  /*
   * 이 모듈이 존재하는 유일한 이유다 (DESIGN_GUIDE 「세계관 — 도깨비란
   * 무엇인가」). 대본이 있어도 그 말이 안 들어 있으면 만든 뜻이 없고,
   * 나중에 대사를 다듬다 그 문장이 빠져도 아무도 모른다.
   */
  const problemText = SCRIPTS.firstProblem.map((line) => line.text).join(" ");
  const friendText = SCRIPTS.firstFriend.map((line) => line.text).join(" ");

  it("첫 만남에서 「문제가 모습을 갖춘다」고 말한다", () => {
    expect(problemText, `첫 대본: ${problemText}`).toMatch(/어긋나|모습/);
    expect(problemText, "「도깨비」라는 말이 나오지 않는다").toContain("도깨비");
  });

  it("어른 눈과 아이 눈이 다르다는 것을 말한다", () => {
    expect(problemText, "어른/아이의 차이가 없다").toMatch(/어른/);
  });

  it("이기는 것이 없애는 것이 아니라고 말한다", () => {
    /*
     * 이 한 줄이 빠지면 「몬스터를 잡아 동료로 만드는 게임」이 된다.
     * 그건 다른 게임이다.
     */
    expect(friendText, `친구 대본: ${friendText}`).toMatch(/없앤|마주/);
  });

  it("친구가 된 뒤 힘이 된다는 것을 말한다", () => {
    expect(friendText).toMatch(/네 편|밝혀/);
  });
});

describe("대본이 도는 방식", () => {
  it("시작 전에는 아무것도 안 보인다", () => {
    expect(currentLine(createScriptState())).toBeNull();
  });

  it("시작하면 첫 줄이 보인다", () => {
    const state = startScript(createScriptState(), "firstProblem");
    expect(currentLine(state)).toEqual(SCRIPTS.firstProblem[0]);
  });

  it("돌고 있으면 새 대본이 끼어들지 못한다", () => {
    /*
     * 대본이 대본을 끊으면 앞의 말이 무슨 뜻이었는지 알 수 없게 된다.
     * 여기서 대사는 세계관을 전하는 유일한 통로라 끊기면 그 몫을 잃는다.
     */
    let state = startScript(createScriptState(), "firstProblem");
    state = startScript(state, "bossBefore");

    expect(state.id, "뒤에 온 대본이 앞의 것을 밀어냈다").toBe("firstProblem");
  });

  it("넘기면 다음 줄로 간다", () => {
    let state = startScript(createScriptState(), "firstProblem");
    state = advanceLine(state);

    expect(state.index).toBe(1);
    expect(currentLine(state)).toEqual(SCRIPTS.firstProblem[1]);
  });

  it("마지막 줄이 끝나면 스스로 닫는다", () => {
    /*
     * 닫는 일을 부르는 쪽에 맡기면 한 곳만 잊어도 대사가 화면에 영영 남는다.
     */
    let state = startScript(createScriptState(), "friend");
    for (let i = 0; i < SCRIPTS.friend.length; i += 1) state = advanceLine(state);

    expect(currentLine(state), "대사가 화면에 남아 있다").toBeNull();
  });

  it("돌고 있지 않을 때 넘겨도 아무 일이 없다", () => {
    expect(advanceLine(createScriptState()).id).toBeNull();
  });
});

describe("제품이 대본을 실제로 쓰는가", () => {
  it("한 줄 대사와 다른 모듈이다", () => {
    /*
     * `dialogue.ts`에 밀어 넣었으면 「한 줄이 지나가는 것」과 「앞뒤가 있는 말」이
     * 한 파일에서 섞인다. 둘은 고르는 규칙도 화면에 뜨는 모양도 다르다.
     */
    const dialogue = readCode("src/game/quest/dialogue.ts");
    expect(dialogue, "한 줄 대사 쪽에 대본이 섞였다").not.toContain("SCRIPTS");
  });
});
