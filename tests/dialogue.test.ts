import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { BOSS_QUEST, FIRST_RUN_QUEST, QUEST_CHAIN } from "@/game/quest/questContent";
import {
  BOSS_QUEST_ID,
  completionCue,
  createDialogueState,
  createRemarkMemory,
  cueForStep,
  DIALOGUE_SECONDS,
  LINES,
  pickLine,
  projectDialogue,
  recordRemark,
  speak,
  stepDialogue,
} from "@/game/quest/dialogue";

describe("pickLine", () => {
  it("같은 카운터면 같은 대사가 나온다", () => {
    // 재현 가능해야 대사를 검토할 수 있다
    expect(pickLine("start", 3, null)).toBe(pickLine("start", 3, null));
  });

  it("카운터가 바뀌면 다른 대사가 나온다", () => {
    const a = pickLine("start", 0, null);
    const b = pickLine("start", 1, null);
    expect(b, `a=${a}, b=${b}`).not.toBe(a);
  });

  it("직전과 같은 대사를 연달아 내지 않는다", () => {
    const first = pickLine("step:run", 0, null);
    const second = pickLine("step:run", 0, first);
    expect(second, `first=${first}, second=${second}`).not.toBe(first);
  });

  it("후보가 하나뿐이면 그대로 쓴다", () => {
    /*
     * 예전에는 `dismissed`로 확인했는데 그쪽에 줄을 늘리면서 대상이 사라졌다.
     * 지금 한 줄인 것은 보스 경고뿐이다 — 그건 일부러 하나다(신호는 같은
     * 소리로 반복되어야 배운다).
     */
    const only = pickLine("bossWarning", 0, null);
    expect(pickLine("bossWarning", 0, only)).toBe(only);
  });

  it("모든 상황에 빈 대사가 없다", () => {
    const cues = [
      "start",
      "step:run",
      "step:board",
      "step:travel",
      "step:fight",
      "step:glide",
      "complete",
      "downed",
      "dismissed",
      "discovered",
      "drink",
      "dance",
      "bossWarning",
      "step:find-boss",
      "step:beat-boss",
    ] as const;
    for (const cue of cues) {
      const line = pickLine(cue, 0, null);
      expect(line.length, `cue ${cue} was empty`).toBeGreaterThan(0);
    }
  });
});

describe("speak / stepDialogue", () => {
  it("말하면 표시 시간이 채워진다", () => {
    const state = speak(createDialogueState(), "start", 0);
    expect(state.line).not.toBeNull();
    expect(state.remaining).toBe(DIALOGUE_SECONDS);
  });

  it("시간이 다하면 사라진다", () => {
    let state = speak(createDialogueState(), "start", 0);
    for (let i = 0; i < 60 * 10; i += 1) state = stepDialogue(state, 1 / 60);
    expect(state.line, `line was: ${state.line}`).toBeNull();
  });

  it("대사가 없으면 상태가 그대로다", () => {
    const empty = createDialogueState();
    expect(stepDialogue(empty, 1)).toBe(empty);
  });

  it("직전 대사를 기억해 반복을 피한다", () => {
    let state = speak(createDialogueState(), "step:board", 0);
    const first = state.line;
    state = speak(state, "step:board", 0);
    expect(state.line, `first=${first}, second=${state.line}`).not.toBe(first);
  });
});

describe("만남 대사", () => {
  it("후보가 여러 개다 — 만날 때마다 같은 말이면 사건이 아니다", () => {
    const first = pickLine("discovered", 0, null);
    const second = pickLine("discovered", 1, first);
    expect(second, `first=${first}, second=${second}`).not.toBe(first);
  });

  it("퀘스트 단계로 오해되지 않는다", () => {
    // cueForStep은 "step:" 접두사만 본다
    expect(cueForStep("discovered")).toBeNull();
  });
});

describe("여정과 대사가 맞물리는가", () => {
  it("모든 퀘스트 단계에 대사가 있다", () => {
    /*
     * 단계를 추가하고 대사를 안 넣으면 그 구간에서 동료가 입을 다문다.
     * 터지지는 않지만(cueForStep이 null을 준다) 조용히 비어 버린다.
     */
    const missing: string[] = [];
    for (const quest of QUEST_CHAIN) {
      for (const step of quest.steps) {
        if (cueForStep(step.id) === null) missing.push(`${quest.id}/${step.id}`);
      }
    }
    expect(missing, `steps without dialogue: ${missing.join(", ")}`).toEqual([]);
  });

  it("보스 경고는 후보가 하나뿐이다", () => {
    // 매번 다른 말을 하면 "무엇을 피하라는 것"인지 흐려진다
    expect(pickLine("bossWarning", 0, null)).toBe(pickLine("bossWarning", 5, null));
  });
});

describe("cueForStep", () => {
  it("아는 단계는 시점으로 바뀐다", () => {
    expect(cueForStep("run")).toBe("step:run");
    expect(cueForStep("glide")).toBe("step:glide");
  });

  it("모르는 단계는 null", () => {
    // 퀘스트에 단계를 추가하고 대사를 안 넣어도 터지면 안 된다
    expect(cueForStep("unknown-step")).toBeNull();
  });
});

describe("여정을 마쳤을 때의 말", () => {
  /*
   * 몸풀기 산책과 고물 대장을 눕힌 순간에 **같은 대사**가 나왔다.
   * 가장 큰 사건이 가장 작은 사건과 같은 무게로 끝났다.
   */
  it("보스를 넘기면 다른 말을 한다", () => {
    expect(completionCue(BOSS_QUEST_ID)).toBe("completeBoss");
    expect(completionCue(FIRST_RUN_QUEST.id)).toBe("complete");
  });

  it("보스 여정 id가 실제 여정과 같다", () => {
    /*
     * 순환 의존을 피하려고 id를 문자열로 들고 있다. 그 대가로 조용히
     * 어긋날 수 있으므로 여기서 대조한다 — 어긋나면 절정에서 평범한 말이 나온다.
     */
    expect(BOSS_QUEST_ID, `실제 여정 id는 ${BOSS_QUEST.id}`).toBe(BOSS_QUEST.id);
  });

  it("모르는 여정이면 평범한 완주 대사로 떨어진다", () => {
    // 말이 없는 것보다 평범한 말이라도 하는 편이 낫다
    expect(completionCue("나중에-생길-여정")).toBe("complete");
  });

  it("보스 완주 대사가 여러 개라 반복되지 않는다", () => {
    const first = pickLine("completeBoss", 1, null);
    const second = pickLine("completeBoss", 2, first);
    expect(second, `두 번 다 "${first}"`).not.toBe(first);
  });
});

describe("같은 말만 반복하지 않는가", () => {
  /*
   * `bossWarning`과 `dismissed`가 한 줄뿐이었다. 보스는 25초 뒤 다시 서고
   * 동료 보내기는 `C`로 자주 누르는 자리라, 두 번째부터는 사람이 아니라
   * 버튼처럼 들린다.
   *
   * `pickLine`은 직전 줄을 피하지만 **고를 것이 하나면 피할 수가 없다.**
   */
  /*
   * 신호는 예외다.
   *
   * 보스 경고를 여러 줄로 늘리려다 되돌렸다 — 「매번 다른 말을 하면 무엇을
   * 피하라는 것인지 흐려진다」는 판단이 이미 기록되어 있었다. 대사가 아니라
   * 신호이고, 신호는 같은 소리로 반복되어야 배운다.
   */
  const SIGNALS = new Set(["bossWarning"]);

  it("신호가 아닌 상황에는 두 줄 이상 있다", () => {
    const thin: string[] = [];
    for (const [cue, lines] of Object.entries(LINES)) {
      if (SIGNALS.has(cue)) continue;
      if (lines.length < 2) thin.push(`${cue} (${lines.length}줄)`);
    }
    expect(thin, `한 줄뿐인 상황:\n${thin.join("\n")}`).toEqual([]);
  });

  it("자주 나오는 상황일수록 여유가 있다", () => {
    // 동료 보내기는 C로 자주 누르는 자리다 — 한 판에 여러 번 나온다
    expect(LINES.dismissed.length, `dismissed ${LINES.dismissed.length}줄`).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("연달아 같은 줄이 나오지 않는다", () => {
    for (const cue of Object.keys(LINES) as Array<keyof typeof LINES>) {
      if (SIGNALS.has(cue)) continue;
      let last: string | null = null;
      for (let i = 1; i <= 6; i += 1) {
        const line = pickLine(cue, i, last);
        expect(line, `${cue}: "${line}"이 두 번 연속`).not.toBe(last);
        last = line;
      }
    }
  });
});

describe("쓴 대사가 실제로 들리는가", () => {
  /*
   * `start`·`downed`·`dismissed` 세 상황은 대사가 쓰여 있는데 **한 번도
   * 발화되지 않았다.** 부를 자리를 만들지 않았기 때문이다 — 쓰고 잊은 것이
   * 아니라 연결을 잊은 것이라, 아무도 못 듣는 줄도 몰랐다.
   *
   * 바로 앞 반복에서 `dismissed`를 세 줄로 늘렸는데, 그 작업은 아무 효과도
   * 없었다. 「고쳤다」와 「들린다」는 다르다.
   */
  const rig = readCode("src/game/scene/PlayerRig.tsx");

  it("모든 상황이 어딘가에서 불린다", () => {
    // 정책 함수 본문만 본다. 주석은 `readCode`가 이미 걷어내므로 코드로 가른다
    const policy =
      readCode("src/game/quest/dialogue.ts").split("export function recordRemark")[1] ?? "";
    const silent: string[] = [];
    for (const cue of Object.keys(LINES)) {
      if (cue.startsWith("step:")) continue;
      // 여정 단계와 완주는 함수가 골라 준다
      if (cue === "complete" || cue === "completeBoss") continue;
      if (["dance", "wave", "sit"].includes(cue)) continue;
      /*
       * 부르는 곳이 리그만은 아니게 됐다. 「언제 말하나」가 프레임 루프 안에
       * 있을 때는 잴 수 없어서 `dialogue.ts`의 정책 함수(`pickRemark`)로
       * 옮겼고, 그 함수가 돌려주는 상황도 **들리는 대사**다.
       */
      const spokenSomewhere = rig.includes(`"${cue}"`) || policy.includes(`"${cue}"`);
      if (!spokenSomewhere) silent.push(cue);
    }
    expect(silent, `아무도 못 듣는 대사:\n${silent.join(", ")}`).toEqual([]);
  });

  it("상태가 바뀌는 순간에만 말한다", () => {
    /*
     * 매 프레임 부르면 초당 60번 말한다. 직전 상태와 비교해 「방금 바뀌었을
     * 때」만 불러야 한다.
     */
    expect(rig).toContain("wasSummoned.current && !input.companionSummoned");
    expect(rig).toContain("!wasDowned.current && playerLink.playerDowned");
  });

  it("시작 인사는 한 번만 한다", () => {
    expect(rig).toContain("if (!spokeStart.current)");
    expect(rig).toContain("spokeStart.current = true");
  });
});

describe("동료 말이 화면으로 나가는가", () => {
  /*
   * 안 나가면 동료가 **입을 다문다** — 부르고 보내고 능력을 써도 아무 말이 없다.
   * 이 도시에서 동료가 사람처럼 느껴지는 거의 유일한 통로다.
   *
   * 시간이 다한 대사(`null`)도 그대로 내보내야 한다. 안 내보내면 마지막 말이
   * 화면에 **영영 붙어 있는다** — 「안 나가는 것」과 「사라지는 것」이 짝이다.
   */
  it("지금 하는 말이 나간다", () => {
    const view = { line: "옛-말" as string | null };
    const state = speak(createDialogueState(), "discovered", 1);

    projectDialogue(view, state);
    expect(view.line, "동료가 입을 다물었다").toBe(state.line);
    expect(view.line, "말이 비었다").toBeTruthy();
  });

  it("시간이 다하면 지워진다 — 안 지우면 마지막 말이 영영 붙어 있는다", () => {
    const view = { line: null as string | null };
    let state = speak(createDialogueState(), "discovered", 1);
    projectDialogue(view, state);
    expect(view.line).toBeTruthy();

    state = stepDialogue(state, DIALOGUE_SECONDS + 1);
    projectDialogue(view, state);
    expect(view.line, `${DIALOGUE_SECONDS}초 뒤에도 남아 있다`).toBeNull();
  });

  it("말이 바뀌면 화면도 바뀐다 — 한 번만 옮기면 첫 말에 멈춘다", () => {
    const view = { line: null as string | null };
    const first = speak(createDialogueState(), "discovered", 1);
    projectDialogue(view, first);
    const shown = view.line;

    const second = speak(first, "downed", 2);
    projectDialogue(view, second);
    expect(view.line, `${shown} → ${view.line}`).toBe(second.line);
  });
});

describe("대사가 머무는 동안", () => {
  /*
   * 남은 시간이 있으면 **그대로 두어야** 한다. 그 줄을 지우면 대사가 뜨자마자
   * 다음 프레임에 사라진다 — **한 프레임짜리 말풍선**이라 사람 눈에는 안 뜬 것과
   * 같다.
   *
   * 이미 「시간이 다하면 지워진다」는 검사가 있었는데, **반대쪽을 안 봐서**
   * 조건문 훑기에서 이 줄이 통과했다. 사라지는 쪽만 재면 늘 사라져도 통과한다.
   */
  it("절반쯤 지난 대사는 그대로 있다", () => {
    const spoken = speak(createDialogueState(), "discovered", 1);
    const halfway = stepDialogue(spoken, DIALOGUE_SECONDS / 2);

    expect(halfway.line, "절반도 안 돼서 사라졌다").toBe(spoken.line);
    expect(halfway.remaining, `남은 시간 ${halfway.remaining}`).toBeGreaterThan(0);
  });

  it("한 프레임 뒤에도 그대로 있다 — 뜨자마자 사라지면 안 뜬 것과 같다", () => {
    const spoken = speak(createDialogueState(), "discovered", 1);
    const oneFrame = stepDialogue(spoken, 1 / 60);

    expect(oneFrame.line, "한 프레임 만에 사라졌다").toBe(spoken.line);
  });

  it("시간이 줄어든다 — 안 줄면 영영 안 사라진다", () => {
    const spoken = speak(createDialogueState(), "discovered", 1);
    const later = stepDialogue(spoken, 1);

    expect(later.remaining, `${spoken.remaining} → ${later.remaining}`).toBeLessThan(
      spoken.remaining,
    );
  });
});

/*
 * 언제 말하나.
 *
 * 이 규칙은 `PlayerRig`의 프레임 루프 안에 손으로 적혀 있었다 — 「대장 예고는
 * 처음 한 번만」과 「빛 이야기는 처음 몇 번만」이 화면을 오래 보고 있어야만
 * 확인되는 규칙이었고, 그래서 지워도 아무도 몰랐다.
 */
describe("recordRemark", () => {
  const quiet = { bossTelegraph: false, defeats: 0 };

  it("아무 일도 없으면 아무 말도 안 한다", () => {
    const memory = createRemarkMemory();
    expect(recordRemark(memory, quiet), "가만히 있는데 말한다").toBeNull();
  });

  it("예고가 처음 뜰 때 대장을 경고한다", () => {
    const memory = createRemarkMemory();
    expect(recordRemark(memory, { bossTelegraph: true, defeats: 0 })).toBe("bossWarning");
  });

  it("예고가 떠 있는 동안 계속 말하지 않는다 — 매 프레임 말하면 초당 60번이다", () => {
    const memory = createRemarkMemory();
    recordRemark(memory, { bossTelegraph: true, defeats: 0 });
    expect(
      recordRemark(memory, { bossTelegraph: true, defeats: 0 }),
      "두 번째도 말했다",
    ).toBeNull();
  });

  it("한 판에 한 번뿐이다 — 링이 꺼졌다 다시 떠도 조용하다", () => {
    const memory = createRemarkMemory();
    recordRemark(memory, { bossTelegraph: true, defeats: 0 });
    recordRemark(memory, quiet);
    expect(recordRemark(memory, { bossTelegraph: true, defeats: 0 }), "잔소리가 된다").toBeNull();
  });

  it("로봇이 누우면 빠져나가는 빛을 말한다", () => {
    const memory = createRemarkMemory();
    expect(recordRemark(memory, { bossTelegraph: false, defeats: 1 })).toBe("release");
  });

  it("같은 처치 수로는 다시 말하지 않는다", () => {
    const memory = createRemarkMemory();
    recordRemark(memory, { bossTelegraph: false, defeats: 1 });
    expect(recordRemark(memory, { bossTelegraph: false, defeats: 1 })).toBeNull();
  });

  it("몇 번 말하고 나면 화면에 맡긴다", () => {
    /*
     * 처치마다 말하면 시끄럽고, 시끄러우면 아무도 안 듣는다. 가슴의 빛은
     * 계속 뜨므로 **말이 멎어도 장면은 남는다.**
     */
    const memory = createRemarkMemory();
    let spoken = 0;
    for (let defeats = 1; defeats <= 12; defeats += 1) {
      if (recordRemark(memory, { bossTelegraph: false, defeats })) spoken += 1;
    }
    expect(spoken, `${spoken}번 말했다`).toBeGreaterThan(0);
    expect(spoken, `${spoken}번 말했다 — 처치마다 말하고 있다`).toBeLessThan(12);
  });

  it("한 프레임에 하나만 말한다 — 겹치면 어느 쪽도 안 들린다", () => {
    /*
     * 대장이 팔을 드는 순간에 로봇도 눕는 일이 실제로 있다. 그때 두 마디가
     * 겹치면 둘 다 흘려듣게 되므로, 위험을 알리는 쪽(대장)이 먼저다.
     */
    const memory = createRemarkMemory();
    expect(recordRemark(memory, { bossTelegraph: true, defeats: 3 })).toBe("bossWarning");
    // 처치는 기억되지 않았으므로 다음 프레임에 빛 이야기가 나온다
    expect(recordRemark(memory, { bossTelegraph: true, defeats: 3 })).toBe("release");
  });
});
