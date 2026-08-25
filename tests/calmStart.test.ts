import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import {
  BOSS_QUEST,
  FIRST_RUN_QUEST,
  firstCombatStep,
  isCalmStep,
} from "@/game/quest/questContent";

/*
 * 시작은 조용하다.
 *
 * 기사들은 트레일러를 「chaotic」이라 부르면서도 **시작은 조용했다**고 적는다 —
 * 걷는 장면에서 시작해 고조된다(RALPH_BACKLOG 「9. 첫 여정의 앞부분을 조용하게
 * 만든다」). 우리는 시작하자마자 로봇이 달려와 고조될 자리가 없었다.
 */
describe("여정이 전투를 언제 요구하는가", () => {
  it("첫 단계는 전투가 아니다", () => {
    expect(firstCombatStep(FIRST_RUN_QUEST), "시작하자마자 싸우라고 한다").toBeGreaterThan(0);
  });

  it("전투 단계가 있기는 하다 — 없으면 조용한 구간이 영영 안 끝난다", () => {
    expect(firstCombatStep(FIRST_RUN_QUEST), "첫 여정에 전투가 없다").toBeGreaterThanOrEqual(0);
  });

  it("단계 순서를 손으로 세지 않는다", () => {
    // 순서를 바꾸면 이 값이 따라와야 한다. 손으로 적으면 바로 그 자리가 어긋난다
    const kinds = FIRST_RUN_QUEST.steps.map((step) => step.objective.kind);
    expect(kinds.indexOf("defeat"), `단계들: ${kinds.join(" → ")}`).toBe(
      firstCombatStep(FIRST_RUN_QUEST),
    );
  });

  it("보스 여정은 처음부터 전투다 — 그쪽은 조용할 이유가 없다", () => {
    expect(
      firstCombatStep(BOSS_QUEST),
      "대장을 찾아가는 여정인데 전투가 없다",
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("조용한 구간", () => {
  it("시작 직후는 조용하다", () => {
    expect(isCalmStep({ stepIndex: 0, firstQuestDone: false })).toBe(true);
  });

  it("전투 단계에 닿으면 끝난다", () => {
    const combat = firstCombatStep(FIRST_RUN_QUEST);
    expect(
      isCalmStep({ stepIndex: combat, firstQuestDone: false }),
      "전투를 시키면서 조용하다",
    ).toBe(false);
  });

  it("첫 여정을 마친 뒤에는 조용하지 않다", () => {
    /*
     * 조용한 도시는 **처음 한 번**만 뜻이 있다. 이미 아는 사람에게는 그냥
     * 로봇이 안 나오는 것이고, 그건 빈 도시다.
     */
    expect(isCalmStep({ stepIndex: 0, firstQuestDone: true })).toBe(false);
  });

  it("이어받은 판에서도 판단이 선다", () => {
    // 저장에서 중간 단계로 돌아오면 그 단계 기준으로 정해져야 한다
    const combat = firstCombatStep(FIRST_RUN_QUEST);
    expect(isCalmStep({ stepIndex: combat - 1, firstQuestDone: false }), "직전 단계").toBe(true);
    expect(isCalmStep({ stepIndex: combat + 1, firstQuestDone: false }), "지난 단계").toBe(false);
  });
});

describe("화면이 실제로 조용해지는가", () => {
  it("적이 조용한 구간을 안다", () => {
    // 규칙만 있고 로봇이 모르면 화면에서는 아무것도 달라지지 않는다
    const enemies = readCode("src/game/combat/Enemies.tsx");
    expect(enemies, "로봇이 조용한 구간을 모른다").toMatch(/calm/);
  });

  it("씬이 여정에서 그 값을 구해 넘긴다", () => {
    const scene = readCode("src/game/scene/GameScene.tsx");
    expect(scene, "씬이 조용한 구간을 안 넘긴다").toMatch(/isCalmStep\(/);
  });
});
