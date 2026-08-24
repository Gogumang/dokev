import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { CONTROL_CODES, CONTROLS, keyLabel } from "@/game/systems/controls";
import { createInputState } from "@/game/systems/input";
import { isWithinTalkRange, residentLine, TALK_LINE_SECONDS } from "@/game/world/residentTalk";

/*
 * 주민에게 말 걸기.
 *
 * PROJECT_PLAN의 핵심 루프는 「주민들과 대화하고」로 시작하는데 군중은 걸어
 * 다니기만 했다. 도시가 사람으로 차 있어도 만질 수 없으면 배경화면과 같다.
 */

describe("누가 무슨 말을 하는가", () => {
  it("같은 사람은 늘 같은 말을 한다", () => {
    /*
     * 누를 때마다 무작위로 뽑으면 같은 사람이 매번 다른 말을 해서 사람이
     * 아니라 자판기처럼 느껴진다.
     */
    for (const index of [0, 3, 17, 402]) {
      expect(residentLine(index)).toBe(residentLine(index));
    }
  });

  it("사람마다 다른 말이 나온다", () => {
    // 전원이 같은 말을 하면 대화가 아니라 안내방송이다
    const lines = new Set(Array.from({ length: 12 }, (_, i) => residentLine(i)));
    expect(lines.size, `서로 다른 대사 ${lines.size}종`).toBeGreaterThan(3);
  });

  it("번호가 이상해도 목록 밖으로 나가지 않는다", () => {
    // 컬링·품질 변경으로 번호가 어떻게 들어올지 모른다
    for (const index of [-1, -999, 1.7, 1e6]) {
      expect(residentLine(index), `index ${index}`).toBeTruthy();
    }
  });

  it("대사가 여정을 언급하지 않는다", () => {
    /*
     * 주민은 이 소동을 모르는 사람들이다. 도깨비를 아는 척하면 여정 안내와
     * 섞여 어느 쪽을 따라야 할지 흐려진다.
     */
    for (let i = 0; i < 24; i += 1) {
      expect(residentLine(i), `대사: ${residentLine(i)}`).not.toMatch(/도깨비|여정|보스|대장/);
    }
  });

  it("한 줄이 짧다", () => {
    // 달리다 멈춰 읽어야 하면 아무도 말을 걸지 않게 된다
    for (let i = 0; i < 24; i += 1) {
      expect(residentLine(i).length, `대사: ${residentLine(i)}`).toBeLessThan(40);
    }
  });
});

describe("말을 걸 수 있는 거리", () => {
  it("바로 앞은 걸린다", () => {
    expect(isWithinTalkRange(0)).toBe(true);
    expect(isWithinTalkRange(2 * 2)).toBe(true);
  });

  it("멀면 안 걸린다", () => {
    expect(isWithinTalkRange(20 * 20)).toBe(false);
  });

  it("스쳐 지나가며 눌러도 걸릴 만큼은 넉넉하다", () => {
    /*
     * 달리기 속도는 초당 7.4m다. 반경이 1m대면 누른 프레임에 이미 지나쳐
     * 있어 「안 되는 조작」이 된다.
     */
    expect(isWithinTalkRange(3 * 3), "3m에서 안 걸린다").toBe(true);
  });

  it("대사가 잠깐 머문다", () => {
    // 0이면 뜨자마자 사라지고, 너무 길면 다음 대사와 겹친다
    expect(TALK_LINE_SECONDS).toBeGreaterThan(2);
    expect(TALK_LINE_SECONDS).toBeLessThan(10);
  });
});

describe("화면과 조작에 닿아 있는가", () => {
  /*
   * 「만들어 두고 연결하지 않으면 없는 것과 같다」 — 이 세션에서 여러 번
   * 만났다. 순수 함수는 테스트가 다 통과해도 아무도 안 부르면 그만이다.
   */
  it("키가 묶여 있다", () => {
    expect(CONTROL_CODES.talk, "말 걸기 키가 없다").toBeTruthy();
    const input = createInputState();
    expect(input.talkQueued, "큐 필드가 없다").toBe(false);
    expect(readCode("src/game/systems/input.ts"), "키를 읽는 곳이 없다").toContain(
      "CONTROL_CODES.talk",
    );
  });

  it("조작표에 있다", () => {
    const row = CONTROLS.find((entry) => entry.id === "talk");
    expect(row, "조작표에 없다").toBeTruthy();
    expect(row?.keyboard, `표기: ${row?.keyboard}`).toContain(keyLabel(CONTROL_CODES.talk));
    expect(row?.touch, "터치 대안이 없다").toBeTruthy();
  });

  it("소비하는 곳이 하나다", () => {
    /*
     * 주민과 간판이 같은 키를 쓴다. 두 컴포넌트가 각자 큐를 소비하면 같은
     * 프레임에 서로의 줄을 덮어써 화면이 깜빡인다 — 군중은 후보만 올리고
     * 고르는 것은 둘을 아는 한 곳이 한다.
     */
    const consumers = collectSources("src").filter((path) =>
      /input\.talkQueued = false/.test(readCode(path)),
    );
    expect(consumers, `소비하는 파일: ${consumers.join(", ")}`).toHaveLength(1);

    const step = readCode("src/game/scene/interactionStep.ts");
    expect(step, "큐를 읽지 않는다").toContain("input.talkQueued");
    expect(step, "큐를 되돌리지 않는다").toContain("input.talkQueued = false");
  });

  it("대사를 화면이 그린다", () => {
    // 계산만 하고 안 그리면 눌러도 아무 일이 없다
    const hud = collectSources("src/components/hud")
      .map((path) => readCode(path))
      .join("\n");
    expect(hud, "대사를 그리는 곳이 없다").toContain("ResidentSpeech");
    expect(hud, "살펴보기 버튼이 없다").toContain("살펴보기");
  });

  it("키 표기를 화면에 박아 두지 않는다", () => {
    /*
     * 「T 말 걸기」를 문자열로 적으면 키를 옮길 때 안내만 남아 거짓이 된다.
     * 코드에서 만든다.
     */
    const notices = readCode("src/components/hud/Notices.tsx");
    expect(notices, "안내가 키를 박아 두었다").not.toMatch(/"T 살펴보기"/);
    expect(readCode("src/components/hud/WorldHud.tsx"), "키 표기를 코드에서 만들지 않는다").toContain(
      "keyLabel(CONTROL_CODES.talk)",
    );
  });
});
