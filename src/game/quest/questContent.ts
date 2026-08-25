/**
 * 첫 플레이 루프 — 퀘스트 데이터.
 *
 * 실행기(questRunner.ts)는 이 파일을 모른다. 여기에는 규칙이 아니라 내용만 있다.
 *
 * 구성 원칙: 지금까지 만든 능력을 **한 번씩 쓰게 하는 순서**로 짰다.
 * 달리기 → 보드 → 이동 → 전투 → 활강. 새 조작을 배운 직후 바로 쓰게 해야
 * 손에 남는다. TRAILER_FEATURE_ANALYSIS 5절의 "이동 → 조우 → 액션" 흐름과도 맞다.
 */

import type { Quest } from "@/game/quest/questRunner";
import { BOSS_HOME } from "@/game/combat/bossSim";
import { CLUES } from "@/game/quest/clues";
import { CITY } from "@/game/world/cityLayout";

/** 구역 중심 좌표. cityLayout의 배치 규칙과 같은 식이다 */
function blockCenter(index: number): { x: number; z: number } {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const offset = (CITY.gridSize - 1) / 2;
  return {
    x: ((index % CITY.gridSize) - offset) * pitch,
    z: (Math.floor(index / CITY.gridSize) - offset) * pitch,
  };
}

/**
 * 목적지는 스폰(광장)에서 대각선으로 먼 구역으로 잡는다.
 *
 * 가까우면 걸어서 끝나 버려 이동 능력을 쓸 이유가 없다. 대각선이라
 * 골목을 통과하거나 큰길을 돌아야 해서 도시를 실제로 지나가게 된다.
 */
const DESTINATION = blockCenter(CITY.gridSize * CITY.gridSize - 1);

export const FIRST_RUN_QUEST: Quest = {
  id: "first-run",
  title: "첫 번째 산책",
  completionTitle: "오늘 몫은 다 했다",
  completionHint: "이제 마음대로 도시를 돌아다녀 보세요. 도깨비가 계속 따라옵니다.",
  steps: [
    {
      id: "run",
      title: "달려서 몸을 풀기",
      hint: "Shift를 누른 채 WASD로 달리세요",
      objective: { kind: "reachSpeed", speed: 7 },
    },
    {
      id: "board",
      title: "스케이트보드 타기",
      hint: "B를 눌러 보드를 꺼내세요",
      objective: { kind: "board" },
    },
    {
      id: "travel",
      title: "동네 반대편까지 가기",
      hint: "보드를 탄 채로 큰길을 따라가면 빠릅니다",
      objective: { kind: "reach", x: DESTINATION.x, z: DESTINATION.z, radius: 14 },
    },
    {
      id: "fight",
      title: "말썽 부리는 장난감 로봇 멈추기",
      hint: "J로 활을 쏘세요. 한 발이면 넘어집니다",
      objective: { kind: "defeat", count: 3 },
    },
    {
      id: "glide",
      title: "높은 곳에서 뛰어내려 활강하기",
      /*
       * 「점프한 뒤 떨어질 때」라고만 적혀 있었다. 그런데 평지에서 뛰면
       * 활강이 0.62초(2단 점프까지 써도 0.83초)뿐이라 **힌트대로 하면
       * 영원히 못 채운다.** 제목은 「높은 곳에서」라고 말하는데 정작 실행
       * 문구가 그 절반을 빠뜨렸다.
       *
       * 올라가는 수단을 함께 적는다 — 도시에서 걸 수 있는 것은 가로등
       * 기둥뿐이고, 그게 유일한 길이라면 알려 줘야 한다.
       */
      hint: "G로 가로등 꼭대기에 붙었다가 뛰어내린 뒤 Space를 계속 누르세요",
      /*
       * 2초였다. 가로등 높이(5.4m)에서 뛰어내리면 1.92초, 공중 점프까지
       * 써야 2.12초다 — **여유 0.12초.** 첫 여정의 마지막 단계, 그러니까
       * 아직 조작을 익히는 사람에게 그 정밀도를 요구하는 것은 벽이다.
       *
       * 1.5초면 공중 점프 없이도 넘긴다. 달성 가능성은
       * `tests/questContent.test.ts`가 실제 도시에서 시뮬레이션해 지킨다.
       */
      objective: { kind: "glide", seconds: 1.5 },
    },
    {
      id: "clues",
      title: "골목에 남은 흔적 조사하기",
      /*
       * 단계를 **끝에 덧붙인다.** 중간에 끼워 넣으면 이미 저장된
       * `questStepIndex`가 가리키는 단계가 밀려서, 이어하는 사람이 엉뚱한
       * 목표에서 재개한다 — 그걸 막으려면 저장 버전을 올려야 하고 그러면
       * 진행이 통째로 지워진다.
       */
      /*
       * 지도에 그리는 **모양 그대로** 적는다. 「물음표」라고 적어 두었다가
       * 실제로는 마름모를 그리고 있었다 — 지도를 펴 놓고 없는 표식을 찾게
       * 된다. 조작 표기는 조작표가 정본이다(`tests/questContent.test.ts`가
       * 키 표기를 실제 바인딩과 대조한다).
       */
      hint: "지도의 노란 마름모 자리에서 T로 살펴보세요",
      // 수를 정본에서 만든다. 흔적이 늘면 목표도 따라온다
      objective: { kind: "clue", count: CLUES.length },
    },
  ],
};

/**
 * 두 번째 여정 — 미니 보스.
 *
 * 첫 여정을 마치면 목표가 사라져 도시가 그냥 넓기만 했다. 이미 만들어 둔
 * 것들(보스·지도 표식·동료 능력)을 하나의 목표로 잇는다.
 *
 * 첫 단계가 "찾아가기"인 이유: 지도에 표식이 있어도 갈 이유가 없으면 안 간다.
 */
export const BOSS_QUEST: Quest = {
  id: "boss-hunt",
  title: "고물 대장",
  completionTitle: "골목이 조용해졌다",
  /*
   * 「다시 일어난다」를 반드시 적는다.
   *
   * 고물 대장은 25초 뒤 다시 선다(`BOSS.downSeconds`). 그런데 완주 문구는
   * 「이제 도시는 온전히 놀이터다」라고만 해서, 다시 마주친 사람은 이겼는데
   * 왜 또 있는지 알 수 없었다 — 버그로 읽힌다.
   *
   * 반복해서 싸울 수 있다는 것은 **알려 주면 기능이고 숨기면 결함**이다.
   */
  completionHint:
    "이제 도시는 온전히 놀이터다. 고물 대장은 잠시 뒤 다시 일어나니 언제든 다시 겨뤄 보세요.",
  steps: [
    {
      id: "find-boss",
      title: "고물 대장을 찾아가기",
      hint: "지도의 붉은 삼각형이 서 있는 자리입니다",
      objective: { kind: "reach", x: BOSS_HOME.x, z: BOSS_HOME.z, radius: 12 },
    },
    {
      id: "beat-boss",
      title: "고물 대장 멈추기",
      hint: "바닥에 링이 퍼지면 물러서고, 휘두른 뒤 빈틈에 때리세요",
      objective: { kind: "defeatBoss" },
    },
  ],
};

/**
 * 순서대로 이어지는 여정들.
 *
 * 배열 순서가 곧 진행 순서다. 저장에는 **번호가 아니라 id**를 남긴다 —
 * 중간에 여정을 끼워 넣으면 번호가 밀려 엉뚱한 퀘스트에서 재개된다.
 */
export const QUEST_CHAIN: readonly Quest[] = [FIRST_RUN_QUEST, BOSS_QUEST];

/** id로 여정을 찾는다. 모르는 id면 첫 여정 */
export function questById(id: string): Quest {
  return QUEST_CHAIN.find((quest) => quest.id === id) ?? QUEST_CHAIN[0];
}

/** 다음 여정. 마지막이면 null */
export function nextQuest(id: string): Quest | null {
  const index = QUEST_CHAIN.findIndex((quest) => quest.id === id);
  if (index < 0 || index + 1 >= QUEST_CHAIN.length) return null;
  return QUEST_CHAIN[index + 1];
}

/* ------------------------------------------------------------------ *
 * 시작은 조용하다
 *
 * 기사들은 트레일러를 「chaotic」이라 부르면서도 **시작은 조용했다**고 적는다 —
 * 아이들이 걷는 장면에서 시작해 고조된다. 우리는 시작하자마자 로봇이 달려와
 * **고조될 자리가 없었다.**
 *
 * 여정 데이터는 이미 전투를 네 번째 단계에 두고 있었다. 빠진 것은 화면 쪽이다 —
 * 목표가 걷기여도 로봇은 첫 프레임부터 사방에서 달려온다.
 * ------------------------------------------------------------------ */

/**
 * 이 여정에서 전투를 처음 요구하는 단계. 없으면 -1.
 *
 * 단계 순서를 손으로 세지 않는다 — 순서를 바꾸면 이 값도 따라와야 하는데,
 * 손으로 적으면 바로 그 자리가 어긋난다.
 */
export function firstCombatStep(quest: Quest): number {
  return quest.steps.findIndex(
    (step) => step.objective.kind === "defeat" || step.objective.kind === "defeatBoss",
  );
}

/**
 * 지금이 「조용한 구간」인가 — 첫 여정에서 전투를 만나기 전까지.
 *
 * 첫 여정을 마친 뒤에는 조용할 이유가 없다. 그때는 도시를 이미 아는 사람이고,
 * 조용한 도시는 **처음 한 번**만 뜻이 있다.
 */
export function isCalmStep(view: { stepIndex: number; firstQuestDone: boolean }): boolean {
  if (view.firstQuestDone) return false;
  const combat = firstCombatStep(FIRST_RUN_QUEST);
  if (combat < 0) return false;
  return view.stepIndex < combat;
}
