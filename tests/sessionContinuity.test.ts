import { afterEach, describe, expect, it, vi } from "vitest";

import { collectSources, readCode } from "./support/source";

import {
  companionParty,
  DEFAULT_DOKEBI,
  resolveCompanion,
  DOKEBI,
  DOKEBI_ORDER,
  discoverAt,
  FINDABLE_DOKEBI,
  revealedDokebi,
  unlockedDokebi,
  type DokebiId,
} from "@/game/dokebi/roster";
import { createQuestProgress, currentStep, stepQuest } from "@/game/quest/questRunner";
import { BOSS_QUEST } from "@/game/quest/questContent";
import { FIRST_RUN_QUEST, questById, QUEST_CHAIN } from "@/game/quest/questContent";
import { resolveResume } from "@/game/systems/resumeProgress";
import { clampStepIndex, loadProgress, saveProgress } from "@/game/systems/saveGame";
import { SCENARIOS } from "@/game/systems/devScenario";
import { loadSettings, updateSettings } from "@/game/systems/settings";

/*
 * 한 판을 저장하고 다시 이어가기.
 *
 * 저장·복구는 **조용히 망가지는** 종류다. 잘못돼도 예외가 나지 않고, 다음
 * 판에서 목표가 사라지거나 동료가 없어질 뿐이다. 실제로 `clampStepIndex`가
 * NaN을 통과시켜 퀘스트가 즉시 완료되던 경로가 있었다(반복 47).
 *
 * 여기서는 저장 → 복구 → 이어가기를 한 흐름으로 돌려 본다.
 */

/** localStorage를 흉내 내되 실제로 값을 기억한다 — 왕복을 보려면 필요하다 */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return { storage, data };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("퀘스트 이어가기", () => {
  it("저장한 단계에서 다시 시작한다", () => {
    memoryStorage();

    saveProgress({
      questStepIndex: 2,
      questCompleted: false,
      defeatedTotal: 7,
      questId: "first-run",
    });
    const restored = loadProgress();

    expect(restored, "저장한 진행을 읽지 못했다").not.toBeNull();
    if (!restored) return;

    const quest = questById(restored.questId ?? QUEST_CHAIN[0].id);
    const progress = {
      ...createQuestProgress(SIGNALS),
      stepIndex: clampStepIndex(restored.questStepIndex, quest.steps.length),
      completed: restored.questCompleted,
    };

    expect(quest.id).toBe("first-run");
    expect(currentStep(quest, progress), "이어갈 단계가 비어 있다").not.toBeNull();
    expect(progress.stepIndex).toBe(2);
  });

  it("두 번째 여정도 이어진다", () => {
    memoryStorage();

    saveProgress({
      questStepIndex: 1,
      questCompleted: false,
      defeatedTotal: 20,
      questId: "boss-hunt",
    });
    const restored = loadProgress();

    expect(questById(restored?.questId ?? "").id, "여정 id를 잃어버렸다").toBe("boss-hunt");
  });

  it("여정을 지운 저장값도 안전하다", () => {
    /*
     * 콘텐츠가 줄어들 수 있다. 모르는 id는 첫 여정으로 돌아가야 하고,
     * 범위를 벗어난 단계는 접혀야 한다 — 둘 다 조용히 처리된다.
     */
    memoryStorage();
    saveProgress({ questStepIndex: 99, questCompleted: false, defeatedTotal: 0, questId: "gone" });

    const restored = loadProgress();
    const quest = questById(restored?.questId ?? "");
    const index = clampStepIndex(restored?.questStepIndex ?? 0, quest.steps.length);

    expect(quest.id).toBe(FIRST_RUN_QUEST.id);
    expect(index).toBe(quest.steps.length - 1);
  });

  it("이어서 진행하면 완주까지 간다", () => {
    memoryStorage();
    saveProgress({
      questStepIndex: 3,
      questCompleted: false,
      defeatedTotal: 5,
      questId: "first-run",
    });

    const restored = loadProgress();
    let progress = {
      ...createQuestProgress(SIGNALS),
      stepIndex: clampStepIndex(restored?.questStepIndex ?? 0, FIRST_RUN_QUEST.steps.length),
      completed: false,
    };

    for (let i = 0; i < 60 * 20 && !progress.completed; i += 1) {
      const step = currentStep(FIRST_RUN_QUEST, progress);
      const kind = step?.objective.kind;
      progress = stepQuest(
        FIRST_RUN_QUEST,
        progress,
        {
          ...SIGNALS,
          speed: kind === "reachSpeed" ? 99 : 0,
          onBoard: kind === "board",
          defeatedTotal: kind === "defeat" ? 99 : 5,
          gliding: kind === "glide",
        },
        1 / 60,
      );
    }

    expect(progress.completed, `stopped at ${progress.stepIndex}`).toBe(true);
  });
});

describe("수집 루프", () => {
  it("조건 → 자리 표시 → 만남 → 동행이 이어진다", () => {
    /*
     * 네 단계가 모두 이어져야 도깨비를 실제로 데리고 다닐 수 있다.
     * 한 군데만 끊겨도 "지도에 뜨는데 만날 수 없다"거나 "만났는데 안
     * 따라온다"가 된다 — 둘 다 실제로 있었던 버그다(반복 37·67).
     */
    const spirit = DOKEBI.geueum;
    const home = spirit.home;
    expect(home, "그을음의 자리가 없다").not.toBeNull();
    if (!home) return;

    // 1) 조건 전에는 아무것도 없다
    const fresh = { defeatedTotal: 0, questCompleted: false };
    expect(revealedDokebi(fresh)).not.toContain(spirit.id);
    expect(discoverAt(home.x, home.z, fresh, [])).toBeNull();

    // 2) 조건을 채우면 자리가 드러난다
    const ready = { defeatedTotal: spirit.requiredDefeats, questCompleted: false };
    expect(revealedDokebi(ready)).toContain(spirit.id);

    // 3) 그 자리에 가면 만난다
    const found = discoverAt(home.x, home.z, ready, []);
    expect(found, "자리에 도착했는데 만나지 못했다").toBe(spirit.id);
    if (!found) return;

    // 4) 만나면 따라온다
    const met: DokebiId[] = [found];
    expect(unlockedDokebi(ready, met)).toContain(spirit.id);
    expect(companionParty("chorong", ready, met)).toContain(spirit.id);
  });

  it("만남이 설정에 남아 다음 판까지 간다", () => {
    memoryStorage();

    updateSettings({ metDokebi: ["geueum"], dokebi: "geueum" });
    const restored = loadSettings();

    expect(restored.metDokebi).toContain("geueum");
    expect(restored.dokebi).toBe("geueum");
  });

  it("진행을 지우면 동행도 함께 잠긴다", () => {
    /*
     * 만난 기록은 남아도 조건이 사라지면 부를 수 없어야 한다. 도감과 월드가
     * 다른 말을 하면 어느 쪽이 맞는지 알 수 없다.
     */
    const met: DokebiId[] = ["chorong", "geueum", "mulbineul"];
    const reset = { defeatedTotal: 0, questCompleted: false };

    expect(companionParty("geueum", reset, met)).toEqual(["chorong"]);
  });
});

const SIGNALS = {
  position: { x: 0, y: 0, z: 0 },
  speed: 0,
  gliding: false,
  onBoard: false,
  defeatedTotal: 0,
  bossDefeated: false,
  cluesFound: 99,
};

describe("보스를 눕혀야 얻는 도깨비", () => {
  /*
   * 자정은 절정을 넘긴 대가다. 「조건→자리→만남→동행」 전체는 아래 로스터
   * 유도 검사가 모든 도깨비에 대해 본다 — 여기서는 **보스 조건에만 있는
   * 음성 사례**를 본다: 다른 조건을 전부 채워도 보스를 안 잡았으면 열리지
   * 않아야 한다.
   */
  it("다른 조건을 다 채워도 보스 전에는 열리지 않는다", () => {
    const spirit = DOKEBI.jajeong;
    const home = spirit.home;
    expect(home, "자정의 자리가 없다").not.toBeNull();
    if (!home) return;

    const almost = { defeatedTotal: 9999, questCompleted: true };
    expect(revealedDokebi(almost)).not.toContain(spirit.id);
    expect(discoverAt(home.x, home.z, almost, [])).toBeNull();
  });
});

describe("찾아가야 하는 도깨비가 모두 끝까지 이어지는가", () => {
  /*
   * 그을음·자정을 각각 손으로 써 두었더니 물비늘만 빠져 있었다 — 도깨비를
   * 늘릴 때마다 같은 검사를 다시 쓰는 방식은 반드시 하나를 빠뜨린다.
   *
   * 조건은 각 도깨비가 스스로 들고 있다(`requiredDefeats`·`requiresQuest`·
   * `requiresBoss`). 그대로 채워 주면 새 도깨비도 자동으로 덮인다.
   */
  const withHome = DOKEBI_ORDER.filter((id) => DOKEBI[id].home !== null);

  it("찾아갈 도깨비가 있다", () => {
    // 목록이 비면 아래 검사들이 하나도 돌지 않고 통과한다
    expect(withHome.length, `${withHome.length}종`).toBeGreaterThan(1);
  });

  for (const id of withHome) {
    const spirit = DOKEBI[id];
    const satisfied = {
      defeatedTotal: spirit.requiredDefeats,
      questCompleted: spirit.requiresQuest,
      bossDefeated: spirit.requiresBoss,
    };

    it(`${spirit.name}: 조건을 채우면 자리가 드러나고 찾아가면 만난다`, () => {
      const home = spirit.home;
      expect(home, `${spirit.name}의 자리가 없다`).not.toBeNull();
      if (!home) return;

      expect(revealedDokebi(satisfied), "조건을 채웠는데 안 드러난다").toContain(id);
      expect(discoverAt(home.x, home.z, satisfied, []), "자리에 갔는데 못 만났다").toBe(id);
      expect(unlockedDokebi(satisfied, [id]), "만났는데 부를 수 없다").toContain(id);
    });

    it(`${spirit.name}: 만나기 전에는 부를 수 없다`, () => {
      // 자리가 드러난 것과 만난 것은 다르다 — 찾아가는 일이 남아 있어야 한다
      expect(unlockedDokebi(satisfied, [])).not.toContain(id);
    });
  }
});

describe("대장을 눕힌 기록이 남는가", () => {
  /*
   * 「자정」은 고물 대장을 눕혀야만 열린다. 그런데 저장 포맷에 그 사실이
   * 없었고, **보스 여정을 마쳤는가**로 유도했다 — 대장은 25초마다 다시 서고
   * 여정과 무관하게 잡을 수 있으므로, 여정 없이 잡아서 연 사람은 새로고침
   * 한 번에 도깨비를 잃었다. 도감이 조용히 3칸으로 돌아간다.
   */
  const base = { questStepIndex: 1, questCompleted: false, defeatedTotal: 20 };

  it("저장하고 읽으면 그대로 돌아온다", () => {
    memoryStorage();
    saveProgress({ ...base, questId: "first-run", bossDefeated: true });
    const restored = loadProgress();
    expect(restored?.bossDefeated, `restored: ${JSON.stringify(restored)}`).toBe(true);
  });

  it("눕힌 적이 없으면 거짓이다", () => {
    memoryStorage();
    saveProgress({ ...base, questId: "first-run", bossDefeated: false });
    expect(loadProgress()?.bossDefeated).toBe(false);
  });

  it("여정 없이 잡아도 도깨비가 열린다", () => {
    /*
     * 이 판이 핵심이다. 여정은 첫 번째 중간이고 완료도 아니다 — 예전 유도
     * 규칙(보스 여정 완료)으로는 거짓이 나온다.
     */
    memoryStorage();
    saveProgress({ ...base, questId: "first-run", bossDefeated: true });
    const restored = loadProgress();
    const unlocked = unlockedDokebi(
      {
        defeatedTotal: restored?.defeatedTotal ?? 0,
        questCompleted: restored?.questCompleted ?? false,
        bossDefeated: restored?.bossDefeated,
      },
      DOKEBI_ORDER,
    );
    const bossOnly = DOKEBI_ORDER.filter((id) => DOKEBI[id].requiresBoss);
    expect(bossOnly.length, "보스 조건 도깨비가 없다").toBeGreaterThan(0);
    for (const id of bossOnly) {
      expect(unlocked, `${id}가 잠겨 있다: ${unlocked.join(", ")}`).toContain(id);
    }
  });

  it("필드가 없는 예전 저장도 읽힌다", () => {
    /*
     * 버전을 올려 버리는 쪽이 간단하지만, 그러면 진행을 지키려던 수정이
     * 진행을 통째로 지운다. 없는 값은 손상이 아니라 예전 포맷이다.
     */
    memoryStorage({
      "dokev.progress.v1": JSON.stringify({
        version: 1,
        questStepIndex: 2,
        questCompleted: false,
        defeatedTotal: 5,
        questId: "first-run",
      }),
    });
    const restored = loadProgress();
    expect(restored, "예전 저장을 버렸다").not.toBeNull();
    expect(restored?.questStepIndex).toBe(2);
    expect(restored?.bossDefeated).toBe(false);
  });

  it("저장 출구가 하나다", () => {
    /*
     * 저장 지점이 둘이 되면 한쪽이 필드를 빠뜨리는 순간 다른 쪽이 쌓아 둔
     * 것을 조용히 덮는다 — 보스 기록이 실제로 그렇게 지워질 뻔했다.
     * 왕복 테스트로는 안 잡힌다. 출구가 하나인지 본다.
     */
    const callers = collectSources("src")
      .filter((path) => !path.endsWith("saveGame.ts"))
      .filter((path) => /saveProgress\(/.test(readCode(path)));
    expect(callers, `저장하는 파일: ${callers.join(", ")}`).toHaveLength(1);
  });

  it("여정을 건드리지 않아도 저장이 일어난다", () => {
    // 저장이 여정 진행에만 걸려 있으면, 대장만 잡은 사람은 저장 자체가 없다
    const hook = readCode("src/app/play/useProgressSave.ts");
    /*
     * 흔적 저장이 들어오면서 같은 주기가 둘을 함께 본다. 「보스만」을 찾으면
     * 실제로 저장하는데도 실패한다 — 지켜보는지와 저장하는지를 나눠 본다.
     */
    expect(hook, "대장을 눕혔는지 보지 않는다").toContain("summaryView.bossDefeated");
    expect(hook, "지켜보다 저장하지 않는다").toMatch(/setInterval[\s\S]{0,600}persist\(/);
  });

  it("여정 저장이 보스 기록을 함께 올린다", () => {
    // 빠뜨리면 다음 단계를 넘기는 순간 이미 눕힌 대장 기록이 지워진다
    const hook = readCode("src/app/play/useProgressSave.ts");
    const advance = hook.slice(hook.indexOf("handleQuestAdvance"), hook.indexOf("useEffect("));
    expect(advance, "여정 저장에 보스 기록이 없다").toContain("bossDefeated");
  });
});

describe("어디서부터 시작할 것인가", () => {
  /*
   * 저장과 확인 지점을 합치는 규칙. 화면 안에 조건식으로만 있었을 때는
   * 틀려도 **확인 지점으로 들어가 봐야** 알 수 있었다 — 실제로 두 번 틀렸다.
   */
  const saved = {
    version: 1,
    questStepIndex: 2,
    questCompleted: false,
    defeatedTotal: 9,
    questId: "first-run",
    bossDefeated: false,
    cluesFound: 99,
  };

  it("저장도 확인 지점도 없으면 처음부터", () => {
    expect(resolveResume(null, null)).toBeNull();
  });

  it("확인 지점이 없으면 저장 그대로", () => {
    const resume = resolveResume(saved, null);
    expect(resume?.questStepIndex).toBe(2);
    expect(resume?.defeatedTotal).toBe(9);
  });

  it("확인 지점이 저장을 지우지 않는다", () => {
    /*
     * 진행을 지우고 시작하면 확인하러 온 사람이 퀘스트부터 다시 해야 한다.
     * 처치 수는 큰 쪽을 쓴다.
     */
    const resume = resolveResume({ ...saved, defeatedTotal: 40 }, SCENARIOS.shrine);
    expect(resume?.defeatedTotal, `이어받은 처치 수: ${resume?.defeatedTotal}`).toBe(40);
  });

  it("확인 지점의 처치 수가 더 크면 그쪽을 쓴다", () => {
    const resume = resolveResume(saved, SCENARIOS.party);
    expect(resume?.defeatedTotal).toBe(SCENARIOS.party.defeatedTotal);
  });

  it("저장된 보스 기록이 살아남는다", () => {
    // 이 판이 핵심이다 — 여정은 첫 번째 중간이고 완료도 아니다
    expect(resolveResume({ ...saved, bossDefeated: true }, null)?.bossDefeated).toBe(true);
  });

  it("보스 여정을 마친 예전 저장도 인정한다", () => {
    // 필드가 없던 시절의 저장. 버리면 그 사람은 도깨비를 잃는다
    const old = { ...saved, bossDefeated: undefined, questId: "boss-hunt", questCompleted: true };
    expect(resolveResume(old, null)?.bossDefeated).toBe(true);
  });

  it("보스를 안 잡았으면 거짓이다", () => {
    // 늘 참이면 「자정」이 처음부터 열려 수집의 의미가 사라진다
    expect(resolveResume(saved, null)?.bossDefeated).toBe(false);
    expect(resolveResume(saved, SCENARIOS.shrine)?.bossDefeated).toBe(false);
  });

  it("완주 화면 지점은 마지막 단계를 넘어선다", () => {
    // 실제 단계 수를 넘겨야 완주 화면이 곧바로 뜬다
    const resume = resolveResume(saved, SCENARIOS.result);
    expect(resume?.questStepIndex).toBeGreaterThan(100);
    expect(resume?.questCompleted).toBe(true);
  });
});

describe("처음부터 다시 하면 정말 처음인가", () => {
  /*
   * 설정은 동료 id가 **아는 이름인지만** 확인하고 해금 여부는 보지 않았다.
   * 그래서 「진행을 지우고 처음부터 다시 하기」를 눌러도 마지막으로 고른
   * 동료가 그대로 남았다 — 고물 대장을 눕혀야 열리는 「자정」을 능력까지
   * 쓰면서 첫 화면에서 시작하게 된다.
   */
  const fresh = { defeatedTotal: 0, questCompleted: false, bossDefeated: false };

  it("잠긴 동료를 들고 시작하지 않는다", () => {
    const bossOnly = DOKEBI_ORDER.filter((id) => DOKEBI[id].requiresBoss);
    expect(bossOnly.length, "보스 조건 도깨비가 없다").toBeGreaterThan(0);
    for (const id of bossOnly) {
      expect(resolveCompanion(id, fresh, []), `${id}을 들고 시작한다`).toBe(DEFAULT_DOKEBI);
    }
  });

  it("해금된 동료는 그대로 둔다", () => {
    // 아무거나 되돌리면 애써 고른 동료가 매번 초기화된다
    expect(resolveCompanion(DEFAULT_DOKEBI, fresh, [])).toBe(DEFAULT_DOKEBI);
  });

  it("만나야 하는 도깨비는 만나기 전까지 못 든다", () => {
    /*
     * 조건만 채우고 자리에 가지 않은 상태. 이때도 들 수 있으면 찾아가는
     * 부분이 통째로 빠진다.
     */
    const homed = DOKEBI_ORDER.find((id) => DOKEBI[id].home !== null && !DOKEBI[id].requiresBoss);
    expect(homed, "자리가 있는 도깨비가 없다").toBeTruthy();
    if (!homed) return;
    const enough = { ...fresh, defeatedTotal: 99, questCompleted: true, bossDefeated: true };
    expect(resolveCompanion(homed, enough, []), `${homed}을 만나지 않고 든다`).toBe(DEFAULT_DOKEBI);
    expect(resolveCompanion(homed, enough, [homed])).toBe(homed);
  });

  it("만난 기록도 함께 지운다", () => {
    /*
     * 남겨 두면 다시 조건을 채웠을 때 자리를 찾아가지 않아도 곧바로 부를 수
     * 있어 도깨비 자리가 한 번도 서지 않는다 — 「처음부터」가 아니다.
     */
    const client = readCode("src/app/play/PlayClient.tsx");
    const restart = client.slice(client.indexOf("const handleRestart"));
    const body = restart.slice(0, restart.indexOf("}, []);"));
    expect(body, "저장만 지우고 만난 기록은 남긴다").toContain("metDokebi: []");
  });
});

describe("두 번째 여정 중에 이어하면", () => {
  /*
   * 여정이 다음으로 넘어가면 `questCompleted`는 다시 거짓이 된다. 그것으로
   * 해금을 판정하면 **이미 만난 도깨비가 잠긴 것으로 보인다** — 예전에
   * 도감이 3/4으로 보이던 것과 같은 원인이고, 동료 판정에서 다시 나왔다.
   * 「물비늘」을 데리고 있던 사람이 이어하면 조용히 초롱으로 되돌아갔다.
   */
  const midSecond = {
    version: 1,
    questStepIndex: 1,
    // 두 번째 여정을 하는 중이다 — 이 여정은 아직 안 끝났다
    questCompleted: false,
    defeatedTotal: 30,
    questId: BOSS_QUEST.id,
    bossDefeated: false,
    cluesFound: 99,
  };

  it("첫 여정을 마친 것으로 본다", () => {
    const resume = resolveResume(midSecond, null);
    expect(resume?.questCompleted, "현재 여정은 아직 안 끝났다").toBe(false);
    expect(resume?.firstQuestDone, "첫 여정을 안 마친 것으로 본다").toBe(true);
  });

  it("첫 여정 중이면 아직 아니다", () => {
    // 늘 참이면 첫 여정만 하고 있는 사람에게 도깨비가 먼저 열린다
    const first = { ...midSecond, questId: "first-run" };
    expect(resolveResume(first, null)?.firstQuestDone).toBe(false);
  });

  it("여정 조건 도깨비를 계속 데리고 있다", () => {
    const resume = resolveResume(midSecond, null);
    const questOnly = DOKEBI_ORDER.filter((id) => DOKEBI[id].requiresQuest);
    expect(questOnly.length, "여정 조건 도깨비가 없다").toBeGreaterThan(0);
    for (const id of questOnly) {
      // 자리가 있는 도깨비는 만난 뒤라야 들 수 있다
      const kept = resolveCompanion(
        id,
        {
          defeatedTotal: resume?.defeatedTotal ?? 0,
          questCompleted: resume?.firstQuestDone === true,
          bossDefeated: resume?.bossDefeated,
        },
        [id],
      );
      expect(kept, `${id}이 초롱으로 되돌아갔다`).toBe(id);
    }
  });

  it("화면이 그 값을 쓴다", () => {
    /*
     * 규칙을 한 곳에서 만들어도 화면이 예전 필드를 계속 읽으면 고친 것이
     * 아니다. 동료 초기값이 현재 여정 완료가 아니라 첫 여정 완료를 보는지 본다.
     */
    const client = readCode("src/app/play/PlayClient.tsx");
    const init = client.slice(client.indexOf("resolveCompanion("));
    const body = init.slice(0, init.indexOf("});"));
    expect(body, "동료 판정이 현재 여정 완료를 본다").toContain("firstQuestDone");
    expect(body, "이어받기 값이 아니라 다른 것을 본다").not.toMatch(
      /questCompleted: resumeFrom\?\.questCompleted/,
    );
  });
});

describe("손상된 만남 기록", () => {
  /*
   * 설정은 외부에서 들어온 값이라 신뢰하지 않는다 — 모르는 id는 이미
   * 버리고 있었다. 그런데 **중복은 그대로 통과**했다. 같은 도깨비가 두 번
   * 들어 있으면 완주 화면의 「만난 도깨비」가 분모를 넘어 4 / 3 같은 수가
   * 된다. 지금 코드는 넣기 전에 확인하지만, 손으로 고친 저장값은 그 확인을
   * 거치지 않는다.
   */
  function withSettings(metDokebi: unknown) {
    memoryStorage({
      "dokev.settings.v1": JSON.stringify({ version: 1, metDokebi }),
    });
  }

  it("중복을 지운다", () => {
    withSettings(["geueum", "geueum", "mulbineul"]);
    const met = loadSettings().metDokebi;
    expect(met, `읽은 목록: ${met.join(", ")}`).toEqual(["geueum", "mulbineul"]);
  });

  it("모르는 id를 버린다", () => {
    withSettings(["geueum", "없는도깨비", 42, null]);
    expect(loadSettings().metDokebi).toEqual(["geueum"]);
  });

  it("배열이 아니면 비운다", () => {
    withSettings("geueum");
    expect(loadSettings().metDokebi).toEqual([]);
  });

  it("만난 수가 셀 수 있는 수를 넘지 않는다", () => {
    /*
     * 완주 화면이 세는 방식 그대로 계산해 본다 — 분모를 넘으면 그 화면이
     * 4 / 3을 보여 준다는 뜻이다.
     */
    withSettings([...DOKEBI_ORDER, ...DOKEBI_ORDER]);
    const met = loadSettings().metDokebi;
    const counted = met.filter((id) => DOKEBI[id].home).length;
    expect(
      counted,
      `센 수 ${counted}, 셀 수 있는 수 ${FINDABLE_DOKEBI.length}`,
    ).toBeLessThanOrEqual(FINDABLE_DOKEBI.length);
  });
});
