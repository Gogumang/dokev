/**
 * 개발 중 확인용 시작 상태 — 순수 파서.
 *
 * 확인해야 할 것들이 도시 곳곳에 흩어져 있다. 보스는 걸어서 2분, 밤 조명은
 * 포토 모드를 거쳐야 보이고, 도깨비 자리는 로봇을 열두 기 잡아야 드러난다.
 * 한 판을 봐 달라고 부탁하면서 그 앞에 10분짜리 절차를 두는 것은 앞뒤가 맞지 않는다.
 *
 * `?see=boss` 같은 주소로 확인 지점에서 바로 시작한다.
 *
 * **개발 빌드에서만 동작한다.** 배포된 게임에서 주소만으로 진행을 건너뛸 수
 * 있으면 그건 확인 도구가 아니라 치트다.
 */

import { BOSS_HOME } from "@/game/combat/bossSim";
import { CLUES } from "@/game/quest/clues";
import { BOSS_QUEST, FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import type { DokebiId } from "@/game/dokebi/roster";
import type { TimeOfDayId } from "@/game/world/timeOfDay";

export interface Scenario {
  id: string;
  /** 무엇을 보러 가는지 — 목록으로 보여 준다 */
  label: string;
  /** 시작 위치. 없으면 평소 스폰 */
  spawn?: { x: number; z: number };
  /**
   * 시작 높이(m). 없으면 땅.
   *
   * 땅에 세워 두면 캐릭터 뒤에 늘 건물이나 바닥이 온다. **하늘을 등진
   * 모습은 뛰어올라야만 볼 수 있어서** 확인할 방법이 없었다.
   */
  spawnHeight?: number;
  timeOfDay?: TimeOfDayId;
  /** 이미 쓰러뜨린 로봇 수로 시작한다 — 해금 조건을 건너뛴다 */
  defeatedTotal?: number;
  /** 이미 만난 도깨비 */
  metDokebi?: DokebiId[];
  /** 고물 대장을 이미 눕힌 상태로 시작한다 — 보스 조건 도깨비를 보러 갈 때 쓴다 */
  bossDefeated?: boolean;
  /**
   * 첫 여정을 이미 마친 상태로 시작한다.
   *
   * 이것 없이 「모두 동행」 지점을 만들었더니 물비늘만 「???」로 잠겨
   * **색을 보러 간 자리에서 색을 볼 수 없었다.**
   */
  questCompleted?: boolean;
  /**
   * 이어서 볼 여정의 id.
   *
   * 마지막 여정을 마친 상태로 들어가면 완주 화면이 곧바로 뜬다 — 그러지
   * 않으면 그 화면은 한 판을 끝내야만 볼 수 있다.
   */
  questId?: string;
  /**
   * 여정의 몇 번째 단계에서 시작할지.
   *
   * `questId`만으로는 **마지막 단계를 넘어선 상태**밖에 만들 수 없다(완주
   * 화면용). 중간 단계를 보려면 번호가 필요하다 — 흔적처럼 앞 단계를 다
   * 거쳐야 닿는 것은 그 앞이 10분짜리 절차다.
   */
  questStepIndex?: number;
  dokebi?: DokebiId;
}

/**
 * 확인 지점들.
 *
 * "무엇을 확인해야 하는가"(RALPH_BACKLOG의 한계 절)와 짝을 이룬다 — 목록이
 * 어긋나면 확인하려는 것과 가는 곳이 달라진다.
 */
export const SCENARIOS: Record<string, Scenario> = {
  boss: {
    id: "boss",
    label: "미니 보스 앞 — 예고 링과 크기감",
    // 예고 링이 보일 만큼 가깝고, 시작하자마자 맞지는 않을 거리
    spawn: { x: BOSS_HOME.x, z: BOSS_HOME.z + 14 },
  },

  /**
   * 보스전 합동 공격.
   *
   * `boss`와 자리는 같지만 **넷을 다 만난 채로** 연다. 확인 지점은 원래 아무도
   * 안 만난 상태로 열리는데(그래야 도깨비 자리가 보인다), 소환은 만난 도깨비가
   * 있어야 일어나므로 빈 목록으로는 확인하려던 것이 화면에 아예 없다 — 실제로
   * 여기서 한참 코드를 뒤졌다.
   *
   * `boss`에 얹지 않고 따로 뒀다. 저쪽은 `devScenarioState` 검사가 **「진행에
   * 대해 아무 말도 하지 않는 지점」**으로 삼고 있어, 필드를 하나라도 채우면
   * 물려받기 검사의 전제가 무너진다.
   */
  summon: {
    id: "summon",
    label: "보스전 합동 공격 — 도깨비 넷이 도는지, 능력 자국이 보이는지",
    spawn: { x: BOSS_HOME.x, z: BOSS_HOME.z + 14 },
    metDokebi: [...DOKEBI_ORDER],
  },
  night: {
    id: "night",
    label: "밤 — 창문·가로등·전조등 밝기",
    timeOfDay: "night",
  },
  noon: {
    id: "noon",
    /*
     * 원래 이름은 「실루엣이 하늘에 묻히는지」였다. 그런데 이 지점은 땅에
     * 세워 두기만 하므로 **캐릭터 뒤에 하늘이 오지 않는다** — 확인할 수 없는
     * 것을 확인하러 가는 이름이었다. 하늘을 등지려면 뛰어올라야 하고,
     * 그건 사람이 직접 눌러야 한다.
     *
     * 실제로 확인되는 것으로 이름을 바꾼다. 재 보니 후드 대 보도블록
     * 명암비는 2.04였다(색상 차이는 그보다 크다).
     */
    label: "한낮 — 색이 날아가는지, 그림자 길이",
    timeOfDay: "noon",
  },
  air: {
    id: "air",
    /*
     * 떨어지는 동안 하늘이 배경이 된다. 40m면 활강을 걸어 볼 시간도 있고,
     * 안 걸어도 착지 연출까지 확인된다.
     */
    /*
     * 원래 「실루엣이 보이는지」였다. **묻히지 않는 것은 확인됐다** — 주황 후드와
     * 남색 바지가 옅은 하늘색 하늘에도 회색 옥상에도 묻히지 않는다(보색이라
     * 색상 거리가 가장 멀다). 남은 것은 떨어지고 활강하는 **감각**이다.
     */
    label: "공중 — 높은 곳에서 떨어지고 활강하는 감각 (실루엣이 묻히지 않는 것은 확인됨)",
    // 어두운 하늘은 쉬운 쪽이다. 캐릭터가 묻힌다면 밝은 하늘에서 묻힌다.
    timeOfDay: "noon",
    spawnHeight: 40,
  },
  result: {
    id: "result",
    /*
     * 원래 「한 화면에 들어가는지」였다. **들어간다** — 기록 넷과 버튼 셋이
     * 패널 안에 담기고 도감을 열면 완주 화면이 비켜난다. 남은 것은 **한 번 닫은
     * 뒤 다음 여정을 마쳐도 다시 뜨는가**다. 그 장치는 코드에 있지만(소스를
     * 읽는 검사가 붙들고 있다) 두 번째 완주까지 가 본 사람이 아직 없다.
     */
    label: "완주 화면 — 두 번째 완주에도 다시 뜨는지 (한 화면에 담기는 것은 확인됨)",
    questId: BOSS_QUEST.id,
    questCompleted: true,
    defeatedTotal: 99,
    bossDefeated: true,
    metDokebi: [...DOKEBI_ORDER],
  },
  party: {
    id: "party",
    /*
     * 도깨비가 늘면 이 지점도 함께 늘어야 한다. 「셋」이라고 박아 두었더니
     * 넷이 된 뒤 거짓이 됐다 — 이름과 목록 모두 정본에서 만든다.
     */
    /*
     * 원래 「자리 배치와 색 구분」이었다. **둘 다 확인됐다** — 넷이 고리까지
     * 안 겹치고, 노랑·회주황·파랑·보라가 밤 거리에서 갈린다. 남은 것은 그
     * 대열이 **보기 좋은가**라는 취향이다.
     */
    label: `도깨비 ${DOKEBI_ORDER.length}종 동행 — 대열이 보기 좋은지 (겹침·색 구분은 확인됨)`,
    defeatedTotal: 99,
    bossDefeated: true,
    questCompleted: true,
    metDokebi: [...DOKEBI_ORDER],
  },
  clues: {
    id: "clues",
    /*
     * 원래 「지도의 마름모 표식과 살펴보기」였다. 마름모 셋은 **화면으로**,
     * 살펴보기와 개수 증가는 **검사로** 확인됐다. 남은 것은 `E`로 드러나는
     * 흔적 원반이 **눈에 띄면서도 길을 안 가리는 크기인가**다.
     */
    label: "흔적 조사 — 흔적 원반의 크기가 알맞은지 (마름모·살펴보기는 확인됨)",
    /*
     * 단계 번호를 정본에서 찾는다. 여정에 단계가 하나 끼면 박아 둔 번호는
     * 엉뚱한 목표를 연다.
     */
    questStepIndex: FIRST_RUN_QUEST.steps.findIndex((step) => step.objective.kind === "clue"),
    spawn: { x: CLUES[0].x, z: CLUES[0].z + 16 },
  },
  shrine: {
    id: "shrine",
    /*
     * 원래 「보이는지」였다. 22m 떨어진 노을 화면에서 **보인다는 것은
     * 확인됐다** — 골목 끝에 옅은 노란 기둥이 건물 사이로 솟는다. 남은 질문은
     * 「눈길을 끄는가」이고 그건 사람만 답할 수 있다. `noon`을 고쳤을 때와 같은
     * 이유로, 이미 답이 난 것을 확인하러 가는 이름을 두지 않는다.
     */
    label: "도깨비 자리 앞 — 빛기둥이 눈길을 끄는지 (보이는 것은 확인됨)",
    defeatedTotal: DOKEBI.geueum.requiredDefeats,
    spawn: DOKEBI.geueum.home ? { x: DOKEBI.geueum.home.x, z: DOKEBI.geueum.home.z + 22 } : undefined,
  },
};

/**
 * 주소에서 확인 지점을 읽는다.
 *
 * 프로덕션에서는 무엇을 넣어도 null이다. 모르는 이름도 null — 오타로 엉뚱한
 * 상태에서 시작하면 무엇을 보고 있는지 알 수 없다.
 */
export function parseScenario(search: string, isDevelopment: boolean): Scenario | null {
  if (!isDevelopment) return null;

  const value = new URLSearchParams(search).get("see");
  if (!value) return null;

  /*
   * `SCENARIOS[value]`만 쓰면 **프로토타입의 것이 딸려 나온다.**
   * `?see=constructor`는 `Object` 함수를, `?see=toString`은 그 메서드를
   * 시나리오랍시고 돌려줬다 — 이름이 목록에 없는데도 null이 아니다.
   *
   * 뒤쪽 코드는 `scenario.timeOfDay`·`scenario.metDokebi`를 읽으므로 전부
   * undefined가 되어 조용히 이상한 상태로 시작한다. 자기 것만 본다.
   */
  return Object.hasOwn(SCENARIOS, value) ? SCENARIOS[value] : null;
}
