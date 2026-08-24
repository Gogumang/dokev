import { describe, expect, it } from "vitest";

import { reportNewClues } from "@/app/play/useFoundClues";

import { collectSources, readCode } from "./support/source";

import { CLUES, clueAt, pendingClues } from "@/game/quest/clues";
import { isWithinTalkRange } from "@/game/world/residentTalk";
import { resolveResume } from "@/game/systems/resumeProgress";
import { BOSS_QUEST, FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 흔적 — 도시에 남은 세 자리.
 *
 * 여정이 이동과 전투로만 되어 있어서 **찾아보는 대목이 없었다.** 도시가 넓은
 * 이유가 달리기 위해서만 있었다.
 */

describe("흔적이 놓인 자리", () => {
  const layout = buildCityLayout();

  it("세 개 이상이다", () => {
    // 하나면 「찾았다」가 아니라 「지나쳤다」가 된다
    expect(CLUES.length, `흔적 ${CLUES.length}개`).toBeGreaterThanOrEqual(3);
  });

  it("월드 안에 있다", () => {
    for (const clue of CLUES) {
      expect(Math.abs(clue.x), `${clue.id}.x`).toBeLessThan(layout.halfExtent);
      expect(Math.abs(clue.z), `${clue.id}.z`).toBeLessThan(layout.halfExtent);
    }
  });

  it("설 수 있는 자리다", () => {
    /*
     * 건물 안에 있으면 조사할 방법이 없다 — 여정이 그 자리에서 멈춘다.
     * 좌표를 손으로 박지 않고 도로 격자에서 유도하는 이유다.
     */
    const blocked = (x: number, z: number) =>
      layout.colliders.some((box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ);
    for (const clue of CLUES) {
      expect(blocked(clue.x, clue.z), `${clue.id}가 막혀 있다`).toBe(false);
    }
  });

  it("서로 떨어져 있다", () => {
    /*
     * 한자리에 모여 있으면 지나가다 전부 주워져서 찾아본 기억이 남지 않는다.
     * 조사 반경(3.4m)보다 훨씬 멀어야 한다.
     */
    for (const a of CLUES) {
      for (const b of CLUES) {
        if (a.id === b.id) continue;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        expect(distance, `${a.id}–${b.id} ${distance.toFixed(1)}m`).toBeGreaterThan(20);
      }
    }
  });

  it("id가 겹치지 않는다", () => {
    // 겹치면 하나를 조사했을 때 둘 다 찾은 것이 된다
    expect(new Set(CLUES.map((clue) => clue.id)).size).toBe(CLUES.length);
  });

  it("조사하면 무엇을 봤는지 말해 준다", () => {
    for (const clue of CLUES) {
      expect(clue.line.length, `${clue.id}: ${clue.line}`).toBeGreaterThan(8);
    }
  });
});

describe("조사 판정", () => {
  const first = CLUES[0];

  it("자리에 서면 찾는다", () => {
    expect(clueAt(first.x, first.z, [])?.id).toBe(first.id);
  });

  it("스쳐 지나가며 눌러도 걸린다", () => {
    /*
     * 정확히 그 자리에 선 경우만 보고 있었다 — 반경을 0.01m로 줄여도
     * 통과했다. 그러면 픽셀 단위로 서야 하는 기능이 된다.
     *
     * 달리기 속도는 초당 7.4m다. 한 프레임(1/60초)에 12cm를 지나가므로
     * 반경이 좁으면 누른 순간 이미 벗어나 있다.
     */
    for (const offset of [1, 2, 3]) {
      expect(clueAt(first.x + offset, first.z, [])?.id, `${offset}m 옆에서 못 찾는다`).toBe(
        first.id,
      );
    }
  });

  it("살펴보기와 같은 거리에서 걸린다", () => {
    /*
     * 주민·간판과 흔적이 **같은 키**를 쓴다. 사거리가 다르면 손끝의 감각이
     * 달라져 「왜 어떤 건 안 되지」가 된다.
     *
     * 안쪽 한 점(3.3m)만 보던 검사였다 — 그러면 흔적 사거리를 10m로 바꿔도
     * 통과한다. **양쪽 사거리를 직접 재서 비교한다.**
     */
    const cutoff = (within: (distance: number) => boolean): number => {
      let last = 0;
      for (let d = 0; d <= 12; d += 0.05) if (within(d)) last = d;
      return last;
    };

    const talk = cutoff((d) => isWithinTalkRange(d * d));
    const clue = cutoff((d) => clueAt(first.x + d, first.z, [])?.id === first.id);

    expect(talk, `살펴보기 사거리 ${talk.toFixed(2)}m`).toBeGreaterThan(1);
    expect(
      Math.abs(talk - clue),
      `살펴보기 ${talk.toFixed(2)}m 대 흔적 ${clue.toFixed(2)}m`,
    ).toBeLessThanOrEqual(0.06);
  });

  it("멀면 못 찾는다", () => {
    expect(clueAt(first.x + 50, first.z, [])).toBeNull();
  });

  it("이미 찾은 것은 다시 안 나온다", () => {
    // 같은 자리를 두 번 조사해도 수가 늘지 않는데 왜 안 되는지 알 수 없다
    expect(clueAt(first.x, first.z, [first.id])).toBeNull();
  });

  it("남은 목록이 줄어든다", () => {
    expect(pendingClues([]).length).toBe(CLUES.length);
    expect(pendingClues([first.id]).length).toBe(CLUES.length - 1);
    expect(pendingClues(CLUES.map((clue) => clue.id))).toEqual([]);
  });
});

describe("여정과 화면에 닿아 있는가", () => {
  it("여정 단계가 흔적 수를 정본에서 만든다", () => {
    const step = FIRST_RUN_QUEST.steps.find((entry) => entry.objective.kind === "clue");
    expect(step, "흔적 단계가 없다").toBeTruthy();
    if (step?.objective.kind !== "clue") return;
    expect(step.objective.count, `목표 ${step.objective.count}개`).toBe(CLUES.length);
  });

  it("단계를 여정 끝에 덧붙였다", () => {
    /*
     * 중간에 끼워 넣으면 이미 저장된 `questStepIndex`가 가리키는 단계가
     * 밀려서 이어하는 사람이 엉뚱한 목표에서 재개한다 — 그걸 막으려면
     * 저장 버전을 올려야 하고, 그러면 진행이 통째로 지워진다.
     */
    const last = FIRST_RUN_QUEST.steps[FIRST_RUN_QUEST.steps.length - 1];
    expect(last.objective.kind, `마지막 단계: ${last.id}`).toBe("clue");
  });

  it("지도가 남은 자리를 표시한다", () => {
    /*
     * 알려 주지 않으면 282m 도시에서 셋을 찾을 방법이 없다 — 「어딘가에
     * 있다」는 목표가 아니라 벽이다.
     */
    const map = readCode("src/components/hud/CityMap.tsx");
    expect(map, "흔적 표식이 없다").toContain("MARKS.clue.color");
    const hud = readCode("src/components/hud/WorldHud.tsx");
    expect(hud, "남은 흔적을 넘기지 않는다").toContain("pendingClues");
  });

  it("조사하는 곳이 하나다", () => {
    // 두 곳에서 찾으면 같은 흔적이 두 번 세어질 수 있다
    const users = collectSources("src").filter((path) => readCode(path).includes("clueAt("));
    // 정의 한 곳 + 부르는 한 곳
    expect(users, `쓰는 파일: ${users.join(", ")}`).toHaveLength(2);
  });
});

describe("조사한 흔적이 남는가", () => {
  /*
   * 처치 수는 저장되는데 흔적만 사라지면, 새로고침 한 번에 도시를 다시
   * 뒤져야 한다 — 몇 초짜리 활강과 달리 몇 분이 날아간다.
   */
  const saved = {
    version: 1,
    questStepIndex: 5,
    questCompleted: false,
    defeatedTotal: 12,
    questId: "first-run",
    bossDefeated: false,
  };

  it("이어받으면 그대로 돌아온다", () => {
    const resume = resolveResume({ ...saved, foundClues: [CLUES[0].id] }, null);
    expect(resume?.foundClues, `이어받은 흔적: ${resume?.foundClues.join(", ")}`).toEqual([
      CLUES[0].id,
    ]);
  });

  it("필드가 없는 예전 저장도 읽힌다", () => {
    // 버전을 올리면 진행 전체를 버린다 — 없는 값은 손상이 아니라 예전 포맷이다
    const resume = resolveResume(saved, null);
    expect(resume, "예전 저장을 버렸다").not.toBeNull();
    expect(resume?.foundClues).toEqual([]);
  });

  it("이어받은 자리는 다시 뜨지 않는다", () => {
    // 지도에 이미 조사한 자리가 뜨면 가 봐도 아무 일이 없다
    const resume = resolveResume({ ...saved, foundClues: [CLUES[0].id] }, null);
    const pending = pendingClues(resume?.foundClues ?? []);
    expect(pending.map((clue) => clue.id)).not.toContain(CLUES[0].id);
    expect(pending.length).toBe(CLUES.length - 1);
  });

  it("이어받은 수에서 세기 시작한다", () => {
    /*
     * 지도는 하나 남았다는데 목표가 0/3이면 어긋난다. 씬이 이어받은 개수로
     * 시작하는지 본다.
     */
    const scene = readCode("src/game/scene/GameScene.tsx");
    expect(scene, "0에서 시작한다").toContain("props.resumeFrom?.foundClues?.length");
  });

  it("저장이 흔적을 함께 쓴다", () => {
    // 다른 저장이 덮으면서 흔적을 빠뜨리면 조용히 지워진다
    const hook = readCode("src/app/play/useProgressSave.ts");
    expect(hook, "흔적을 저장하지 않는다").toContain("foundClues");
  });
});

describe("찾은 흔적을 알리는 규칙", () => {
  /*
   * `useFoundClues`는 검사가 **한 번도 언급하지 않은** 파일이었다. 그런데
   * 그 안에는 진행 저장과 직결된 규칙이 있다 — **이어받은 것은 다시 세지
   * 않는다.** 어기면 새로고침할 때마다 「흔적을 찾았다」가 다시 찍히고
   * 수가 부풀어 오른다.
   */
  function collect(found: string[], reported: number) {
    const calls: Array<[string, number]> = [];
    const next = reportNewClues(found, reported, (id, total) => calls.push([id, total]));
    return { calls, next };
  }

  it("새로 찾은 것만 알린다", () => {
    const { calls, next } = collect(["a", "b", "c"], 1);
    expect(calls, `알린 것: ${JSON.stringify(calls)}`).toEqual([
      ["b", 2],
      ["c", 3],
    ]);
    expect(next, "알린 개수가 안 맞는다").toBe(3);
  });

  it("이어받은 것은 알리지 않는다", () => {
    // 새로고침 직후 — 이미 둘을 찾아 둔 판을 이어받았다
    const { calls, next } = collect(["a", "b"], 2);
    expect(calls, `알린 것: ${JSON.stringify(calls)}`).toEqual([]);
    expect(next).toBe(2);
  });

  it("여러 번 불러도 같은 것을 두 번 알리지 않는다", () => {
    // 주기적으로 도는 자리다 — 매번 처음부터 세면 계속 다시 찍힌다
    const found = ["a", "b"];
    let reported = 0;
    const calls: string[] = [];
    for (let round = 0; round < 5; round += 1) {
      reported = reportNewClues(found, reported, (id) => calls.push(id));
    }
    expect(calls, `알린 것: ${calls.join(", ")}`).toEqual(["a", "b"]);
  });

  it("알린 수는 전체 개수를 말한다", () => {
    // 「2 / 3」처럼 쓰는 값이라, 이번에 몇 개를 알렸는지가 아니라 누적이어야 한다
    const { calls } = collect(["a", "b", "c"], 0);
    expect(calls.map(([, total]) => total)).toEqual([1, 2, 3]);
  });
});

describe("이어하기 판정", () => {
  /*
   * 「첫 여정을 마쳤는가」와 「대장을 눕혔는가」는 **이어하는 사람이 동료와
   * 기록을 유지하는지**를 정한다. 이 파일 주석이 「실제로 그렇게 두 번
   * 틀렸다」고 적어 둔 자리다.
   *
   * 그런데 호출이 둘뿐이라 분기가 거의 안 덮여 있었다. 표로 채운다.
   */
  const base = {
    questStepIndex: 0,
    questCompleted: false,
    defeatedTotal: 0,
  };

  it("첫 여정을 마쳤는지 — 네 갈래", () => {
    const cases: Array<[string, Record<string, unknown> | null, boolean]> = [
      ["저장이 없으면 아니다", null, false],
      ["첫 여정을 진행 중이면 아니다", { ...base, questId: FIRST_RUN_QUEST.id }, false],
      ["첫 여정을 끝냈으면 맞다", { ...base, questId: FIRST_RUN_QUEST.id, questCompleted: true }, true],
      ["다음 여정으로 넘어갔으면 맞다 — 끝냈다는 표시가 없어도", { ...base, questId: BOSS_QUEST.id }, true],
      ["예전 저장(여정 id 없음)은 완료 여부를 따른다", { ...base, questCompleted: true }, true],
    ];

    for (const [name, saved, expected] of cases) {
      const resume = resolveResume(saved as never, null);
      expect(saved === null ? false : resume?.firstQuestDone, name).toBe(expected);
    }
  });

  it("대장을 눕혔는지 — 세 갈래", () => {
    const cases: Array<[string, Record<string, unknown>, boolean]> = [
      ["표시가 있으면 맞다", { ...base, bossDefeated: true }, true],
      ["보스 여정을 끝냈으면 맞다 — 표시가 없어도(예전 저장)", { ...base, questId: BOSS_QUEST.id, questCompleted: true }, true],
      ["보스 여정 진행 중이면 아니다", { ...base, questId: BOSS_QUEST.id }, false],
    ];

    for (const [name, saved, expected] of cases) {
      expect(resolveResume(saved as never, null)?.bossDefeated, name).toBe(expected);
    }
  });

  it("저장이 없고 확인 지점도 없으면 이어받을 것이 없다", () => {
    expect(resolveResume(null, null)).toBeNull();
  });
});
