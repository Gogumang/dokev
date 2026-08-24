import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { DOKEBI_ORDER } from "@/game/dokebi/roster";
import { CLUES, pendingClues } from "@/game/quest/clues";
import { BOSS_QUEST, FIRST_RUN_QUEST, questById, QUEST_CHAIN } from "@/game/quest/questContent";
import { SCENARIOS } from "@/game/systems/devScenario";
import {
  mergeSandboxProgress,
  resolveMetDokebi,
  resolveResume,
  withMetDokebi,
} from "@/game/systems/resumeProgress";

/*
 * **확인 지점(`?see=`)과 저장이 주고받는 것.**
 *
 * 이 파일이 따로 있는 이유: 한 세션에 같은 뿌리에서 **일곱 개**가 나왔다.
 * 들어오는 쪽 다섯(저장이 확인 지점을 덮어 볼 것이 사라짐)과 나가는 쪽 둘
 * (확인 지점이 저장을 덮어 사람이 모은 것이 사라짐)이다.
 *
 * 규칙은 한 줄이다 — **확인 지점 → 저장은 흐르고, 저장 → 확인 지점은 흐르지
 * 않는다.** 그리고 흐를 때도 **더하기만 한다.**
 */

describe("확인 지점이 저장된 진행에 덮이지 않는가", () => {
  /*
   * `?see=clues`로 들어갔는데 **완주 화면이 먼저 떴다.** 저장이 둘째 여정
   * (`boss-hunt`)을 마친 상태였고, 시나리오는 단계 번호만 주므로 `questId`와
   * `questCompleted`를 저장에서 물려받았다 — 첫 여정의 단계 번호를 다른 여정에
   * 꽂은 셈이라 「단계 없음 = 완주」로 읽혔다. `?see=air`에서도 같았다.
   *
   * 확인 지점은 **특정 상태를 만들어 주는 도구**다. 저장과 섞이면 사람마다
   * 다른 화면을 보게 되고, 그러면 확인 지점으로서 쓸모가 없다.
   */
  const finishedLaterQuest = {
    version: 1,
    questStepIndex: 1,
    questCompleted: true,
    defeatedTotal: 99,
    questId: BOSS_QUEST.id,
    bossDefeated: true,
    foundClues: [],
  };

  /** 하나가 아니라 **모두**를 훑는다 — 새 확인 지점이 늘어도 규칙이 따라간다 */
  const all = Object.values(SCENARIOS);

  it("확인 지점이 여럿 있다", () => {
    // 목록이 비면 아래 검사가 조용히 사라진다
    expect(all.length, "확인 지점이 없다").toBeGreaterThan(3);
  });

  it("여정 진행을 저장에서 물려받지 않는다", () => {
    for (const scenario of all) {
      const resumed = resolveResume(finishedLaterQuest, scenario);
      expect(resumed?.questCompleted, `${scenario.id}의 완주 여부가 저장을 탔다`).toBe(
        scenario.questCompleted === true,
      );
      const quest = questById(resumed?.questId ?? QUEST_CHAIN[0].id);
      expect(quest?.id, `${scenario.id}이 ${resumed?.questId}에서 열렸다`).toBe(
        scenario.questId ?? FIRST_RUN_QUEST.id,
      );
    }
  });

  it("저장이 있든 없든 같은 자리에서 시작한다", () => {
    // 저장 유무로 확인 지점이 달라지면 「같은 링크, 다른 화면」이 된다
    for (const scenario of all) {
      const withSave = resolveResume(finishedLaterQuest, scenario);
      const withoutSave = resolveResume(null, scenario);
      for (const key of ["questStepIndex", "questCompleted", "questId"] as const) {
        expect(withoutSave?.[key], `${scenario.id}의 ${key}가 저장에 따라 달라진다`).toBe(
          withSave?.[key],
        );
      }
    }
  });

  it("여정 밖의 기록은 그대로 물려받는다", () => {
    /*
     * 여기까지 지우면 확인 지점에 들어갈 때마다 이미 만난 도깨비가 잠긴다.
     * 지우는 것과 남기는 것의 경계를 검사로 굳혀 둔다.
     */
    for (const scenario of all) {
      const resumed = resolveResume(finishedLaterQuest, scenario);
      expect(resumed?.firstQuestDone, `${scenario.id}에서 첫 여정 기록이 사라졌다`).toBe(true);
      expect(resumed?.bossDefeated, `${scenario.id}에서 대장 기록이 사라졌다`).toBe(true);
      expect(
        resumed?.defeatedTotal,
        `${scenario.id}에서 처치 수가 ${resumed?.defeatedTotal}로 줄었다`,
      ).toBeGreaterThanOrEqual(99);
    }
  });
});

describe("확인 지점이 만난 도깨비도 정하는가", () => {
  /*
   * `?see=shrine`은 「빛기둥이 골목에서 보이는지」를 보러 가는 자리인데
   * **빛기둥이 없었다.** 앞서 `?see=party`로 들어간 적이 있어 저장에 도깨비
   * 넷이 「만났다」로 남았고, 이미 만난 도깨비는 자리를 치우기 때문이다.
   *
   * 여정 진행에서 고친 것과 **같은 유형**이다 — 확인 지점이 저장에 덮인다.
   */
  const metAll = [...DOKEBI_ORDER];

  it("시나리오가 말하지 않으면 아무도 안 만난 상태로 연다", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.metDokebi !== undefined) continue;
      expect(
        resolveMetDokebi(metAll, scenario),
        `${scenario.id}이 저장의 만난 목록을 물려받았다`,
      ).toEqual([]);
    }
  });

  it("시나리오가 말하면 그대로 쓴다", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.metDokebi === undefined) continue;
      expect(resolveMetDokebi([], scenario), `${scenario.id}의 목록이 지워졌다`).toEqual(
        scenario.metDokebi,
      );
    }
  });

  it("빛기둥을 보러 가는 지점은 그 도깨비를 안 만난 상태여야 한다", () => {
    // 이 지점의 목적이 그것이다 — 목적과 상태가 어긋나면 확인 지점이 아니다
    const shrine = SCENARIOS.shrine;
    expect(resolveMetDokebi(metAll, shrine), "그을음을 이미 만난 상태로 연다").not.toContain(
      "geueum",
    );
  });

  it("확인 지점이 없으면 저장을 그대로 쓴다", () => {
    // 평소 플레이는 건드리지 않는다
    expect(resolveMetDokebi(metAll, null)).toEqual(metAll);
  });
});

describe("무엇을 물려받고 무엇을 만들어 주는가", () => {
  /*
   * 확인 지점이 저장에 덮이는 사고를 **세 번** 고쳤다(`questCompleted`·`questId`·
   * `metDokebi`). 셋 다 모양이 같았다 — `scenario?.X ?? 저장의 X`.
   *
   * 그런데 같은 모양이 하나 더 있고 **그건 고치면 안 된다**: `timeOfDay`다.
   * 앞의 셋은 **진행 상태**이고 시나리오가 만들어 줘야 하는 것이지만, 시간대는
   * **취향**이다. 밤을 켜 둔 사람이 확인 지점마다 노을로 돌아가면 그건 도와주는
   * 것이 아니다. 시간대가 중요한 지점(`night`·`noon`)은 스스로 말한다.
   *
   * 이 구분을 적어 두지 않으면 다음 사람이 앞의 셋을 흉내 내다 이것까지 바꾼다.
   */
  it("시간대는 저장을 물려받는다 — 취향이기 때문이다", () => {
    const client = readCode("src/app/play/PlayClient.tsx");
    expect(client, "시간대까지 시나리오가 정해 버린다").toContain(
      "scenario?.timeOfDay ?? loadSettings().timeOfDay",
    );
  });

  it("시간대가 중요한 지점은 스스로 말한다", () => {
    // 물려받기가 괜찮은 이유는 「중요하면 말한다」가 지켜지기 때문이다
    const pinned = Object.values(SCENARIOS).filter((s) => s.timeOfDay !== undefined);
    expect(pinned.map((s) => s.id).join(","), "시간대를 정하는 지점이 없다").not.toBe("");
  });

  it("진행 상태는 반대로 물려받지 않는다", () => {
    /*
     * 위와 짝이다. 하나만 두면 「물려받는 게 맞다」로 읽혀 앞의 세 사고가
     * 돌아온다 — 두 규칙이 같은 자리에 있어야 경계가 보인다.
     */
    const resume = readCode("src/game/systems/resumeProgress.ts");
    const branch = resume.slice(resume.indexOf("if (!scenario) {"));
    expect(branch, "완주 여부를 저장에서 물려받는다").not.toMatch(
      /questCompleted:[^,\n]*saved\?\.questCompleted/,
    );
    expect(branch, "여정 id를 저장에서 물려받는다").not.toMatch(/questId: scenario\.questId \?\?/);
  });
});

describe("확인 지점이 이미 찾은 흔적에 비지 않는가", () => {
  /*
   * `?see=clues`는 흔적 표식·초롱 빛·지도 마름모를 보러 가는 자리다. 그런데
   * **찾은 흔적을 저장에서 물려받고 있었다** — 세 곳을 다 조사한 사람이 이
   * 링크로 들어가면 남은 흔적이 0곳이라 **볼 것이 하나도 없다.**
   *
   * 「빛기둥이 없던 것」과 같은 사고다. 흔적은 취향이 아니라 **진행 상태**다.
   */
  const foundAll = {
    version: 1,
    questStepIndex: 0,
    questCompleted: false,
    defeatedTotal: 0,
    foundClues: CLUES.map((clue) => clue.id),
  };

  it("확인 지점은 흔적을 다시 찾을 수 있는 상태로 연다", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      const resumed = resolveResume(foundAll, scenario);
      expect(resumed?.foundClues, `${scenario.id}이 찾은 흔적을 물려받았다`).toEqual([]);
    }
  });

  it("흔적 지점은 실제로 남은 흔적이 있다", () => {
    // 이 지점의 목적이 그것이다 — 목적과 상태가 어긋나면 확인 지점이 아니다
    const resumed = resolveResume(foundAll, SCENARIOS.clues);
    expect(
      pendingClues(resumed?.foundClues ?? []).length,
      "남은 흔적이 없어 볼 것이 없다",
    ).toBe(CLUES.length);
  });

  it("확인 지점이 없으면 찾은 흔적을 그대로 이어받는다", () => {
    // 평소 플레이는 건드리지 않는다 — 새로고침에 도시를 다시 뒤지면 안 된다
    const resumed = resolveResume(foundAll, null);
    expect(resumed?.foundClues, "이어하기가 흔적을 잃었다").toEqual(foundAll.foundClues);
  });
});

describe("물려받는 것과 만들어 주는 것의 경계", () => {
  /*
   * 이 경계를 **다섯 번** 틀렸다 — `questCompleted`·`questId`·`metDokebi`·
   * `foundClues`, 그리고 마지막 하나는 경계를 세운 주석 자신이었다(찾은 흔적을
   * 「물려받는 쪽」에 적어 두었다).
   *
   * 그래서 경계를 말로 적지 않고 **목록으로 세운 뒤 동작으로 다시 확인한다.**
   * 새 필드가 생기면 어느 칸인지 정할 때까지 이 검사가 실패한다 — 조용히
   * 물려받는 쪽으로 흘러가는 것이 지금까지의 실패 방식이었다.
   */
  const INHERITED = ["defeatedTotal", "bossDefeated", "firstQuestDone"] as const;
  const CONSTRUCTED = ["questStepIndex", "questCompleted", "questId", "foundClues"] as const;

  /** 저장에만 있고 시나리오는 말하지 않는 값들 — 어느 쪽이 살아남는지 본다 */
  const saved = {
    version: 1,
    questStepIndex: 7,
    questCompleted: true,
    defeatedTotal: 99,
    questId: BOSS_QUEST.id,
    bossDefeated: true,
    foundClues: CLUES.map((clue) => clue.id),
  };
  /** 여정에 대해 아무 말도 하지 않는 지점 — 물려받기가 일어난다면 여기서 난다 */
  const quiet = SCENARIOS.boss;

  it("모든 필드가 두 칸 중 하나에 들어 있다", () => {
    const resumed = resolveResume(saved, quiet);
    const keys = Object.keys(resumed ?? {}).sort();
    const classified = [...INHERITED, ...CONSTRUCTED].sort();
    expect(keys, `분류되지 않은 필드가 있다: ${keys.join(",")}`).toEqual(classified);
  });

  it("물려받는 칸은 저장값이 살아남는다", () => {
    const resumed = resolveResume(saved, quiet) as unknown as Record<string, unknown>;
    expect(resumed.defeatedTotal, "처치 수가 사라졌다").toBe(saved.defeatedTotal);
    expect(resumed.bossDefeated, "대장 기록이 사라졌다").toBe(true);
    expect(resumed.firstQuestDone, "첫 여정 기록이 사라졌다").toBe(true);
  });

  it("만들어 주는 칸은 저장값이 살아남지 않는다", () => {
    /*
     * 값을 하나하나 적지 않고 **저장과 달라졌는지**로 본다 — 기본값이 바뀌어도
     * 규칙은 그대로 성립해야 한다.
     */
    const resumed = resolveResume(saved, quiet) as unknown as Record<string, unknown>;
    for (const key of CONSTRUCTED) {
      expect(
        JSON.stringify(resumed[key]),
        `${key}가 저장값(${JSON.stringify(saved[key])})을 그대로 물려받았다`,
      ).not.toBe(JSON.stringify(saved[key]));
    }
  });

  it("만난 도깨비도 만들어 주는 쪽이다", () => {
    // `ResumeState` 밖에 있어 위 목록에 안 잡힌다 — 빠뜨리기 쉬운 자리다
    expect(resolveMetDokebi([...DOKEBI_ORDER], quiet), "만난 목록을 물려받았다").toEqual([]);
  });
});

describe("확인 지점이 모아 둔 것을 지우지 않는가", () => {
  /*
   * 확인 지점은 **아무도 안 만난 상태**로 연다(그래야 도깨비 자리가 보인다).
   * 그런데 거기서 하나를 만나면 그 한 마리짜리 목록이 저장을 덮어써 **모아 둔
   * 것이 통째로 사라진다.** 확인 지점은 사람이 플레이테스트하는 입구이고,
   * 저장은 같은 브라우저에 있다.
   *
   * 「확인 지점에서 한 일은 기록된다」는 **더하는** 것이지 **줄이는** 것이 아니다.
   */
  it("저장에 없던 것을 더한다", () => {
    expect(withMetDokebi(["chorong"], "geueum")).toEqual(["chorong", "geueum"]);
  });

  it("이미 있으면 그대로 둔다", () => {
    const saved = ["chorong", "geueum"] as const;
    expect(withMetDokebi(saved, "geueum"), "중복이 들어갔다").toEqual([...saved]);
  });

  it("저장에 있던 것을 지우지 않는다", () => {
    /*
     * 확인 지점의 시작 목록은 비어 있다. 그 목록에 더해서 저장하면 **넷이
     * 하나가 된다** — 이 검사가 막는 것이 그것이다.
     */
    const collected = [...DOKEBI_ORDER];
    const after = withMetDokebi(collected, "geueum");
    for (const id of collected) {
      expect(after, `${id}이 사라졌다`).toContain(id);
    }
  });

  it("저장하는 값이 세션 목록이 아니라 저장에서 만들어진다", () => {
    // 세션 목록(확인 지점에서는 비어 있다)을 그대로 쓰면 위 규칙이 소용없다
    const client = readCode("src/app/play/PlayClient.tsx");
    expect(client, "세션 목록을 그대로 저장한다").toMatch(
      /updateSettings\(\{ metDokebi: withMetDokebi\(loadSettings\(\)\.metDokebi, found\) \}\)/,
    );
  });
});

describe("확인 지점이 진행한 여정을 지우지 않는가", () => {
  /*
   * 확인 지점은 여정을 **처음으로 되돌린** 상태로 열린다. 그 상태에서 무엇
   * 하나만 진행돼도 저장이 통째로 덮여 **사람이 진행한 여정과 찾아 둔 흔적이
   * 사라진다.** 만난 도깨비와 같은 사고이고 잃는 양이 더 크다.
   */
  const stored = {
    questStepIndex: 4,
    questCompleted: true,
    defeatedTotal: 99,
    questId: BOSS_QUEST.id,
    bossDefeated: true,
    foundClues: CLUES.map((c) => c.id),
  };
  /** 확인 지점에서 막 진행된 상태 — 여정은 처음, 흔적은 방금 찾은 하나 */
  const fresh = {
    questStepIndex: 1,
    questCompleted: false,
    defeatedTotal: 2,
    questId: undefined,
    bossDefeated: false,
    foundClues: [CLUES[0].id],
  };

  it("여정 진행을 되돌리지 않는다", () => {
    const merged = mergeSandboxProgress(stored, fresh);
    expect(merged.questStepIndex, "단계가 뒤로 갔다").toBe(stored.questStepIndex);
    expect(merged.questCompleted, "완주 기록이 사라졌다").toBe(true);
    expect(merged.questId, "여정 id가 바뀌었다").toBe(stored.questId);
  });

  it("늘어나는 것만 받는다", () => {
    const merged = mergeSandboxProgress(stored, fresh);
    expect(merged.defeatedTotal, "처치 수가 줄었다").toBe(99);
    expect(merged.bossDefeated, "대장 기록이 꺼졌다").toBe(true);
    expect(merged.foundClues, "흔적이 줄었다").toHaveLength(CLUES.length);
  });

  it("확인 지점에서 새로 찾은 흔적은 더해진다", () => {
    // 「기록된다」는 약속은 지킨다 — 지우지 않을 뿐이다
    const partial = { ...stored, foundClues: [CLUES[0].id] };
    const merged = mergeSandboxProgress(partial, { ...fresh, foundClues: [CLUES[1].id] });
    expect(merged.foundClues, "새로 찾은 것이 안 들어갔다").toContain(CLUES[1].id);
    expect(merged.foundClues, "있던 것이 사라졌다").toContain(CLUES[0].id);
  });

  it("저장이 없으면 그대로 쓴다", () => {
    expect(mergeSandboxProgress(null, fresh)).toEqual(fresh);
  });

  it("확인 지점일 때만 합친다", () => {
    // 평소 플레이에서 합치면 여정이 영영 뒤로 못 간다 — 다시 하기가 막힌다
    const hook = readCode("src/app/play/useProgressSave.ts");
    expect(hook, "확인 지점 여부를 보지 않는다").toMatch(
      /saveProgress\(sandboxed \? mergeSandboxProgress\(loadProgress\(\), next\) : next\)/,
    );
  });
});
