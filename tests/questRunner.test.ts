import { describe, expect, it } from "vitest";

import {
  BOSS_QUEST,
  FIRST_RUN_QUEST,
  nextQuest,
  QUEST_CHAIN,
  questById,
} from "@/game/quest/questContent";
import {
  createQuestProgress,
  projectQuestView,
  type QuestView,
  currentStep,
  stepQuest,
  toQuestView,
  type Quest,
  type QuestProgress,
  type QuestSignals,
} from "@/game/quest/questRunner";

const FRAME = 1 / 60;

function makeSignals(overrides: Partial<QuestSignals> = {}): QuestSignals {
  return {
    position: { x: 0, y: 0, z: 0 },
    speed: 0,
    gliding: false,
    onBoard: false,
    defeatedTotal: 0,
    bossDefeated: false,
    cluesFound: 0,
    ...overrides,
  };
}

/** 두 단계짜리 최소 퀘스트 — 실행기 규칙만 보기 위한 것 */
const TINY_QUEST: Quest = {
  id: "tiny",
  title: "테스트",
  completionTitle: "끝",
  completionHint: "수고했다",
  steps: [
    { id: "a", title: "보드 타기", hint: "B", objective: { kind: "board" } },
    { id: "b", title: "둘 잡기", hint: "J", objective: { kind: "defeat", count: 2 } },
  ],
};

function run(
  quest: Quest,
  progress: QuestProgress,
  signals: QuestSignals,
  frames: number,
): QuestProgress {
  let current = progress;
  for (let i = 0; i < frames; i += 1) current = stepQuest(quest, current, signals, FRAME);
  return current;
}

describe("stepQuest — 단계 진행", () => {
  it("목표를 달성하면 다음 단계로 넘어간다", () => {
    // Arrange
    const progress = createQuestProgress(makeSignals());

    // Act — 보드를 탄다
    const result = stepQuest(TINY_QUEST, progress, makeSignals({ onBoard: true }), FRAME);

    // Assert
    expect(result.stepIndex, `stepIndex was: ${result.stepIndex}`).toBe(1);
    expect(result.completed, `completed was: ${result.completed}`).toBe(false);
  });

  it("한 프레임에 여러 단계를 건너뛰지 않는다", () => {
    // Arrange — 두 단계의 조건이 동시에 만족된 상태
    const signals = makeSignals({ onBoard: true, defeatedTotal: 99 });
    const progress = createQuestProgress(signals);

    // Act
    const result = stepQuest(TINY_QUEST, progress, signals, FRAME);

    // Assert — 무엇을 해냈는지 읽을 시간이 필요하다
    expect(result.stepIndex, `stepIndex was: ${result.stepIndex}`).toBe(1);
    expect(result.completed, `completed was: ${result.completed}`).toBe(false);
  });

  it("마지막 단계를 마치면 완료 상태가 된다", () => {
    // Arrange — 두 번째 단계까지 와 있다
    let progress = stepQuest(
      TINY_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ onBoard: true }),
      FRAME,
    );

    // Act
    progress = stepQuest(TINY_QUEST, progress, makeSignals({ defeatedTotal: 2 }), FRAME);

    // Assert
    expect(progress.completed, `completed was: ${progress.completed}`).toBe(true);
    expect(currentStep(TINY_QUEST, progress)).toBeNull();
  });

  it("완료 후에는 상태가 더 변하지 않는다", () => {
    // Arrange
    let progress = stepQuest(
      TINY_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ onBoard: true }),
      FRAME,
    );
    progress = stepQuest(TINY_QUEST, progress, makeSignals({ defeatedTotal: 2 }), FRAME);

    // Act
    const after = run(TINY_QUEST, progress, makeSignals({ defeatedTotal: 50 }), 60);

    // Assert
    expect(after).toEqual(progress);
  });
});

describe("stepQuest — 처치 목표", () => {
  it("이전 단계에서 잡은 로봇은 다음 단계에 얹히지 않는다", () => {
    // Arrange — 보드 단계 전에 이미 5기를 잡아 둔 상태
    let progress = createQuestProgress(makeSignals({ defeatedTotal: 5 }));

    // Act — 보드를 타서 다음 단계로 넘어간 뒤, 더 잡지 않고 진행
    progress = stepQuest(
      TINY_QUEST,
      progress,
      makeSignals({ onBoard: true, defeatedTotal: 5 }),
      FRAME,
    );
    progress = stepQuest(TINY_QUEST, progress, makeSignals({ defeatedTotal: 5 }), FRAME);

    // Assert — 기준값을 옮기지 않으면 두 번째 단계가 즉시 끝나 버린다
    expect(progress.completed, `completed was: ${progress.completed}`).toBe(false);
    expect(progress.accumulated, `accumulated was: ${progress.accumulated}`).toBe(0);
  });

  it("필요한 수를 채우면 넘어간다", () => {
    // Arrange
    let progress = stepQuest(
      TINY_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ onBoard: true }),
      FRAME,
    );

    // Act — 기준값 0에서 2기를 잡는다
    progress = stepQuest(TINY_QUEST, progress, makeSignals({ defeatedTotal: 2 }), FRAME);

    // Assert
    expect(progress.completed, `completed was: ${progress.completed}`).toBe(true);
  });
});

describe("stepQuest — 활강 목표", () => {
  const GLIDE_QUEST: Quest = {
    id: "g",
    title: "g",
    completionTitle: "끝",
    completionHint: "",
    steps: [{ id: "g", title: "활강", hint: "Space", objective: { kind: "glide", seconds: 1 } }],
  };

  it("활강을 유지하면 시간이 쌓인다", () => {
    const progress = run(
      GLIDE_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ gliding: true }),
      30,
    );
    expect(progress.accumulated, `accumulated was: ${progress.accumulated}`).toBeGreaterThan(0.4);
  });

  it("활강을 놓으면 처음부터 다시 쌓는다", () => {
    // Arrange — 절반쯤 쌓아 둔다
    const half = run(
      GLIDE_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ gliding: true }),
      30,
    );

    // Act — 한 프레임 놓는다
    const dropped = stepQuest(GLIDE_QUEST, half, makeSignals({ gliding: false }), FRAME);

    // Assert — 끊어서 채울 수 있으면 "유지"가 아니다
    expect(dropped.accumulated, `accumulated was: ${dropped.accumulated}`).toBe(0);
  });

  it("충분히 유지하면 완료된다", () => {
    const progress = run(
      GLIDE_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ gliding: true }),
      120,
    );
    expect(progress.completed, `completed was: ${progress.completed}`).toBe(true);
  });
});

describe("toQuestView", () => {
  it("처치 목표에는 카운터가 붙는다", () => {
    let progress = stepQuest(
      TINY_QUEST,
      createQuestProgress(makeSignals()),
      makeSignals({ onBoard: true }),
      FRAME,
    );
    progress = stepQuest(TINY_QUEST, progress, makeSignals({ defeatedTotal: 1 }), FRAME);

    const view = toQuestView(TINY_QUEST, progress);
    expect(view.counter, `counter was: ${view.counter}`).toBe("1 / 2");
  });

  it("완료되면 완료 문구를 보여준다", () => {
    const progress: QuestProgress = {
      stepIndex: 1,
      ratio: 1,
      accumulated: 0,
      baseline: 0,
      completed: true,
    };
    const view = toQuestView(TINY_QUEST, progress);
    expect(view.title, `title was: ${view.title}`).toBe(TINY_QUEST.completionTitle);
    expect(view.completed).toBe(true);
  });

  it("진행도는 항상 0~1 범위다", () => {
    // 막대 너비로 쓰이므로 범위를 벗어나면 화면이 깨진다
    let progress = createQuestProgress(makeSignals());
    for (const signals of [
      makeSignals({ speed: 999 }),
      makeSignals({ position: { x: 9999, y: 0, z: 9999 } }),
      makeSignals({ defeatedTotal: 999 }),
    ]) {
      progress = stepQuest(FIRST_RUN_QUEST, progress, signals, FRAME);
      const view = toQuestView(FIRST_RUN_QUEST, progress);
      expect(view.ratio, `ratio was: ${view.ratio}`).toBeGreaterThanOrEqual(0);
      expect(view.ratio, `ratio was: ${view.ratio}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("FIRST_RUN_QUEST", () => {
  it("모든 단계에 제목과 힌트가 있다", () => {
    // 조작을 모르면 목표만으로는 막힌다
    for (const step of FIRST_RUN_QUEST.steps) {
      expect(step.title.length, `step ${step.id} title was empty`).toBeGreaterThan(0);
      expect(step.hint.length, `step ${step.id} hint was empty`).toBeGreaterThan(0);
    }
  });

  it("단계 id가 중복되지 않는다", () => {
    const ids = FIRST_RUN_QUEST.steps.map((step) => step.id);
    expect(new Set(ids).size, `ids were: ${ids.join(", ")}`).toBe(ids.length);
  });

  it("스폰 지점에서 이미 달성된 단계로 시작하지 않는다", () => {
    // 첫 목표가 시작하자마자 끝나면 무엇을 하라는 건지 알 수 없다
    const atSpawn = makeSignals();
    const progress = stepQuest(FIRST_RUN_QUEST, createQuestProgress(atSpawn), atSpawn, FRAME);
    expect(progress.stepIndex, `stepIndex was: ${progress.stepIndex}`).toBe(0);
  });
});

describe("여정 이어가기", () => {
  it("체인 순서가 첫 여정부터다", () => {
    expect(QUEST_CHAIN[0].id).toBe(FIRST_RUN_QUEST.id);
    expect(QUEST_CHAIN.length, "두 번째 여정이 없다").toBeGreaterThan(1);
  });

  it("id로 찾는다", () => {
    expect(questById(BOSS_QUEST.id).id).toBe(BOSS_QUEST.id);
  });

  it("모르는 id면 첫 여정으로 되돌린다", () => {
    // 저장값이 낡았거나 손상됐을 때 빈 목표가 뜨면 안 된다
    expect(questById("no-such-quest").id).toBe(FIRST_RUN_QUEST.id);
  });

  it("마지막 여정 다음은 없다", () => {
    const last = QUEST_CHAIN[QUEST_CHAIN.length - 1];
    expect(nextQuest(last.id)).toBeNull();
  });

  it("첫 여정 다음은 보스 여정이다", () => {
    expect(nextQuest(FIRST_RUN_QUEST.id)?.id).toBe(BOSS_QUEST.id);
  });

  it("모든 여정에 단계와 완주 문구가 있다", () => {
    for (const quest of QUEST_CHAIN) {
      expect(quest.steps.length, `${quest.id} has no steps`).toBeGreaterThan(0);
      expect(quest.completionTitle.length, `${quest.id}`).toBeGreaterThan(0);
      for (const step of quest.steps) {
        expect(step.title.length, `${quest.id}/${step.id}`).toBeGreaterThan(0);
        // 조작을 모르면 목표만으로는 막힌다
        expect(step.hint.length, `${quest.id}/${step.id} has no hint`).toBeGreaterThan(0);
      }
    }
  });

  it("단계 id가 여정 안에서 겹치지 않는다", () => {
    // 겹치면 대사 시점(cueForStep)이 엉뚱한 단계에 붙는다
    for (const quest of QUEST_CHAIN) {
      const ids = quest.steps.map((step) => step.id);
      expect(new Set(ids).size, `${quest.id}: ${ids.join(",")}`).toBe(ids.length);
    }
  });
});

describe("보스 목표", () => {
  it("보스를 쓰러뜨려야 끝난다", () => {
    const step = BOSS_QUEST.steps.find((item) => item.objective.kind === "defeatBoss");
    expect(step, "보스 처치 단계가 없다").toBeDefined();
  });

  it("일반 처치로는 끝나지 않는다", () => {
    /*
     * 누적 수로 세면 지나가던 로봇을 잡아도 보스를 쓰러뜨린 것이 된다.
     */
    const progress = createQuestProgress(makeSignals());
    const busy = makeSignals({ defeatedTotal: 99, bossDefeated: false });
    const after = stepQuest(BOSS_QUEST, { ...progress, stepIndex: 1 }, busy, 1);
    expect(after.completed, "일반 로봇만 잡고 완주했다").toBe(false);
  });

  it("보스를 잡으면 끝난다", () => {
    const progress = { ...createQuestProgress(makeSignals()), stepIndex: 1 };
    const won = makeSignals({ bossDefeated: true });
    const after = stepQuest(BOSS_QUEST, progress, won, 1);
    expect(after.completed || after.ratio >= 1, `ratio=${after.ratio}`).toBe(true);
  });
});

describe("여정을 시작하는 순간의 기준값", () => {
  /*
   * 「이전 단계에서 잡은 로봇이 다음 단계에 얹히면 안 된다」는 이미 검사가
   * 있었는데, **단계를 넘길 때만** 봤다. 여정을 **처음 만들 때**의 기준값은
   * 아무도 안 봐서 `baseline: 0`으로 바꿔도 통과했다.
   *
   * 실제로 아픈 자리다: 도시를 한참 돌아다녀 스무 기를 잡아 둔 사람이 새 여정을
   * 시작하면 **첫 단계가 시작하자마자 완료된다.** 할 일을 안내받기도 전에 끝나
   * 있으니 무슨 게임인지 알 수 없다. 확인 지점(`?see=`)으로 여정을 되돌릴 때도
   * 같은 경로를 탄다.
   *
   * 「이미 잡은 수만큼은 안 쳐 준다」를 값으로 본다 — 기준값 필드를 직접 보지
   * 않는다. 필드 이름이 바뀌어도 규칙은 그대로여야 하고, 무엇보다 **사람이 겪는
   * 것은 필드가 아니라 진행률**이다.
   */
  const DEFEAT_FIRST: Quest = {
    id: "defeat-first",
    title: "테스트",
    completionTitle: "끝",
    completionHint: "수고했다",
    steps: [{ id: "a", title: "둘 잡기", hint: "J", objective: { kind: "defeat", count: 2 } }],
  };

  it("이미 잡아 둔 로봇은 새 여정에 안 얹힌다", () => {
    // Arrange — 도시를 돌아다니며 이미 스무 기를 잡아 둔 사람
    const veteran = makeSignals({ defeatedTotal: 20 });

    // Act — 그 상태에서 「둘 잡기」로 시작하는 여정을 연다
    const progress = run(DEFEAT_FIRST, createQuestProgress(veteran), veteran, 3);

    // Assert — 아직 한 기도 안 잡았으므로 진행률 0이어야 한다
    expect(progress.ratio, `진행률 ${progress.ratio}`).toBe(0);
    expect(progress.completed, "시작하자마자 완료됐다").toBe(false);
  });

  it("여정을 연 뒤에 잡은 것만 쳐 준다", () => {
    // Arrange — 같은 사람이 여정을 열고
    const before = makeSignals({ defeatedTotal: 20 });
    const progress = createQuestProgress(before);

    // Act — 두 기를 더 잡는다
    const after = run(DEFEAT_FIRST, progress, makeSignals({ defeatedTotal: 22 }), 3);

    // Assert — 그때 비로소 완료된다
    expect(after.ratio, `진행률 ${after.ratio}`).toBe(1);
  });
});

describe("여정이 화면으로 나가는가", () => {
  /*
   * HUD는 처음 받은 객체를 계속 읽는다. `toQuestView`가 만드는 **새 객체**를
   * 그대로 갈아 끼울 수 없어 칸을 하나씩 옮기는데, 그 다섯 줄이 화면 안에
   * 있을 때는 **한 줄을 지워도 아무도 몰랐다** — 제목이 안 바뀌거나 진행
   * 막대가 멈춰도 검사는 전부 통과했다.
   *
   * `firstQuestDone`이 특히 아프다. **덮어쓰면 첫 여정을 마치는 순간 다시
   * 거짓이 되고**(다음 여정으로 넘어가며 `completed`가 초기화된다), 해금 조건이
   * 그 값을 읽으므로 **만난 도깨비가 도로 잠긴다.**
   */
  const FIRST = "first-run";

  /*
   * 초기값을 **기대값과 다르게** 둔다.
   *
   * 처음엔 빈 문자열·false로 시작했다가 `counter`와 `completed`를 안 채워도
   * 검사가 통과했다 — 새 여정의 기대값이 마침 빈 문자열과 false라 **안 채운
   * 것과 채운 것이 같아 보였다.** 「어딘가 한 군데만 맞으면 통과」의 사촌이다.
   *
   * 표식 값으로 시작하면 안 채운 칸이 그대로 남아 눈에 띈다.
   */
  const UNSET = "아직-안-채움";

  function blankView(): QuestView {
    return {
      title: UNSET,
      hint: UNSET,
      ratio: -1,
      counter: UNSET,
      stepIndex: -1,
      completed: true,
      firstQuestDone: false,
      targetX: -1,
      targetZ: -1,
    };
  }

  it("제목·힌트·진행이 모두 나간다 — 하나라도 비면 화면이 옛 값을 든다", () => {
    const view = blankView();
    projectQuestView(view, TINY_QUEST, createQuestProgress(makeSignals()), FIRST);

    const expected = toQuestView(TINY_QUEST, createQuestProgress(makeSignals()));
    expect(view.title, "제목이 안 나갔다").toBe(expected.title);
    expect(view.hint, "힌트가 안 나갔다").toBe(expected.hint);
    expect(view.counter, "보조 표기가 안 나갔다").toBe(expected.counter);
    expect(view.completed, "완료 여부가 안 나갔다").toBe(expected.completed);
  });

  it("진행 막대가 따라 움직인다 — 멈추면 뭘 하고 있는지 알 수 없다", () => {
    /*
     * 처음에 「보드 타기」 단계를 20프레임 돌렸다가 진행률 0이 나왔다 — 그 사이
     * **단계가 이미 끝나** 다음 단계의 0을 보고 있었다. 부분 진행이 남는 목표로
     * 재야 「막대가 움직이는가」를 실제로 묻는 것이 된다.
     */
    const twoKills: Quest = {
      ...TINY_QUEST,
      steps: [{ id: "a", title: "둘 잡기", hint: "J", objective: { kind: "defeat", count: 2 } }],
    };
    const view = blankView();
    const progress = createQuestProgress(makeSignals());
    const half = run(twoKills, progress, makeSignals({ defeatedTotal: 1 }), 3);

    projectQuestView(view, twoKills, half, FIRST);
    expect(view.ratio, `진행률 ${view.ratio}`).toBeGreaterThan(0);
    expect(view.ratio, `진행률 ${view.ratio} — 하나만 잡았는데 다 찼다`).toBeLessThan(1);
  });

  it("객체를 갈아 끼우지 않는다 — 새로 만들면 HUD가 보던 것과 갈라진다", () => {
    const view = blankView();
    projectQuestView(view, TINY_QUEST, createQuestProgress(makeSignals()), FIRST);
    // 같은 객체가 채워졌는지는 위 검사들이 이미 본다. 여기서는 참조가 그대로인지 본다
    const same = view;
    projectQuestView(view, TINY_QUEST, createQuestProgress(makeSignals()), FIRST);
    expect(view).toBe(same);
  });

  it("첫 여정을 마치면 그 사실이 켜진 채로 남는다 — 꺼지면 도깨비가 도로 잠긴다", () => {
    const view = blankView();
    const first: Quest = { ...TINY_QUEST, id: FIRST };

    // 첫 여정을 끝까지 마친다
    const done = { ...createQuestProgress(makeSignals()), completed: true, stepIndex: 1 };
    projectQuestView(view, first, done, FIRST);
    expect(view.firstQuestDone, "마쳤는데 안 켜졌다").toBe(true);

    // 다음 여정으로 넘어간다 — 그 여정은 아직 진행 중이다
    const second: Quest = { ...TINY_QUEST, id: "boss-hunt" };
    projectQuestView(view, second, createQuestProgress(makeSignals()), FIRST);
    expect(view.completed, "새 여정이 완료로 보인다").toBe(false);
    expect(view.firstQuestDone, "다음 여정을 시작하자 첫 여정 기록이 꺼졌다").toBe(true);
  });

  it("첫 여정을 안 마쳤으면 안 켜진다", () => {
    const view = blankView();
    const first: Quest = { ...TINY_QUEST, id: FIRST };
    projectQuestView(view, first, createQuestProgress(makeSignals()), FIRST);
    expect(view.firstQuestDone, "시작만 했는데 마친 것으로 켜졌다").toBe(false);
  });
});

describe("단계 번호가 끝을 넘었을 때", () => {
  /*
   * 이어하기와 확인 지점이 단계 번호를 **일부러 끝 너머로** 둘 수 있다
   * (완주 화면을 보여 주려고 `Number.MAX_SAFE_INTEGER`를 쓴다). 그때 그 번호로
   * 단계를 꺼내면 **없는 것을 꺼내 터진다.**
   *
   * 막는 줄이 있었는데 지워도 아무도 몰랐다 — 완주로 들어오는 경로가 위쪽
   * `completed` 검사에 대부분 걸려서, 남은 좁은 길이 안 보였다.
   */
  it("끝을 넘긴 번호로 돌려도 터지지 않고 완주로 잡힌다", () => {
    const past: QuestProgress = {
      ...createQuestProgress(makeSignals()),
      stepIndex: Number.MAX_SAFE_INTEGER,
    };

    const next = stepQuest(TINY_QUEST, past, makeSignals(), FRAME);
    expect(next.completed, "끝을 넘었는데 진행 중으로 잡힌다").toBe(true);
  });

  it("마지막 단계 바로 뒤도 완주다", () => {
    const past: QuestProgress = {
      ...createQuestProgress(makeSignals()),
      stepIndex: TINY_QUEST.steps.length,
    };

    const next = stepQuest(TINY_QUEST, past, makeSignals(), FRAME);
    expect(next.completed, `단계 ${past.stepIndex}에서 완주가 아니다`).toBe(true);
  });

  it("있는 단계는 그대로 진행한다 — 이 검사가 늘 참이 되지 않게", () => {
    const fresh = createQuestProgress(makeSignals());
    const next = stepQuest(TINY_QUEST, fresh, makeSignals(), FRAME);
    expect(next.completed, "첫 단계인데 완주로 잡힌다").toBe(false);
  });
});

describe("「가서 보라」 목표가 거리로 차오르는가", () => {
  /*
   * 비교 방향 훑기에서 나왔다. `distance <= radius`를 뒤집으면 **멀리 있을 때
   * 진행률이 1이 되어 출발하자마자 완료**되고, 정작 도착하면 부분 진행으로
   * 떨어진다 — 정확히 거꾸로다.
   *
   * 「도착하면 완료된다」는 재고 있었는데 **가는 동안의 진행률**은 안 봤다.
   * 그 값이 있는 이유가 「방향이 맞는지 알려 주려고」인데, 방향을 거꾸로
   * 알려 주면 없느니만 못하다.
   */
  const SPOT = { kind: "reach", x: 30, z: 40, radius: 3 } as const;
  const WALK: Quest = {
    ...TINY_QUEST,
    steps: [{ id: "a", title: "가 보기", hint: "저기", objective: SPOT }],
  };

  function ratioAt(x: number, z: number): number {
    const progress = createQuestProgress(makeSignals());
    return stepQuest(WALK, progress, makeSignals({ position: { x, y: 0, z } }), FRAME).ratio;
  }

  it("도착하면 완료다", () => {
    expect(ratioAt(SPOT.x, SPOT.z), "도착했는데 안 찼다").toBe(1);
  });

  it("멀리 있으면 안 찼다 — 출발하자마자 완료되면 안 된다", () => {
    const far = ratioAt(SPOT.x + 80, SPOT.z + 80);
    expect(far, `먼 곳에서 진행률 ${far}`).toBeLessThan(1);
  });

  it("가까워질수록 차오른다 — 방향이 맞는지 알려 주는 값이다", () => {
    const far = ratioAt(SPOT.x + 50, SPOT.z);
    const near = ratioAt(SPOT.x + 10, SPOT.z);

    expect(near, `먼 곳 ${far} / 가까운 곳 ${near}`).toBeGreaterThan(far);
  });

  it("반경 안이면 어디서든 완료다 — 딱 한 점만 되면 닿을 수 없다", () => {
    expect(ratioAt(SPOT.x + SPOT.radius - 0.1, SPOT.z), "반경 안인데 안 찼다").toBe(1);
  });
});
