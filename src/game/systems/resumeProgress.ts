/**
 * 저장과 확인 지점을 합쳐 「어디서부터 시작할 것인가」를 정한다.
 *
 * 화면 안에 조건식으로만 두었을 때는 틀려도 **확인 지점으로 들어가 봐야**
 * 알 수 있었다. 실제로 그렇게 두 번 틀렸다: 이어받은 판에서 처치 수가 0으로
 * 잡혀 동료 바꾸기가 안 나왔고, 대장을 여정 없이 잡은 기록이 새로고침에
 * 사라졌다.
 *
 * 순수 함수로 두면 저장값 조합을 그냥 넣어 볼 수 있다.
 */

import { BOSS_QUEST, FIRST_RUN_QUEST } from "@/game/quest/questContent";
import type { DokebiId } from "@/game/dokebi/roster";
import type { Scenario } from "@/game/systems/devScenario";
import type { SavedProgress } from "@/game/systems/saveGame";

export interface ResumeState {
  questStepIndex: number;
  questCompleted: boolean;
  defeatedTotal: number;
  questId?: string;
  bossDefeated: boolean;
  /**
   * 첫 여정을 마친 적이 있는가.
   *
   * 「물비늘」이 이 조건으로 열린다. **현재 여정의 완료 여부와 다르다** —
   * 여정이 다음으로 넘어가면 `questCompleted`는 다시 거짓이 되므로, 그것으로
   * 판정하면 두 번째 여정 중에 이미 만난 도깨비가 잠긴 것으로 보인다.
   */
  firstQuestDone: boolean;
  /** 이미 조사한 흔적. 새로고침해도 도시를 다시 뒤지지 않게 한다 */
  foundClues: string[];
}

/** 이어받은 지점이 첫 여정을 이미 지났는가 */
function firstQuestDoneIn(saved: SavedProgress | null): boolean {
  if (!saved) return false;
  // 다른 여정을 하고 있다는 것 자체가 첫 여정을 지났다는 뜻이다
  if (saved.questId !== undefined && saved.questId !== FIRST_RUN_QUEST.id) return true;
  return saved.questCompleted;
}

/**
 * 고물 대장을 눕힌 적이 있는가.
 *
 * 저장된 값을 먼저 믿는다. 예전 저장에는 이 필드가 없어서 「보스 여정을
 * 마쳤는가」로 유도했는데, 대장은 25초마다 다시 서고 여정과 무관하게 잡을 수
 * 있다 — 그 경로로 연 도깨비가 새로고침에 사라졌다. 유도 규칙은 필드가 없는
 * 예전 저장을 위해 남긴다.
 */
function bossDefeatedIn(saved: SavedProgress | null): boolean {
  if (!saved) return false;
  if (saved.bossDefeated === true) return true;
  return saved.questId === BOSS_QUEST.id && saved.questCompleted;
}

/**
 * 확인 지점이 없으면 저장 그대로, 있으면 저장 **위에 얹는다.**
 *
 * 진행을 지우고 시작하면 확인하러 온 사람이 퀘스트부터 다시 해야 한다.
 * 그래서 처치 수는 큰 쪽을, 조건은 둘 중 하나라도 참이면 참을 쓴다.
 */
export function resolveResume(
  saved: SavedProgress | null,
  scenario: Scenario | null,
): ResumeState | null {
  const bossDefeated = bossDefeatedIn(saved);
  const firstQuestDone = firstQuestDoneIn(saved);

  if (!scenario) {
    if (!saved) return null;
    return {
      questStepIndex: saved.questStepIndex,
      questCompleted: saved.questCompleted,
      defeatedTotal: saved.defeatedTotal,
      questId: saved.questId,
      bossDefeated,
      firstQuestDone,
      foundClues: [...(saved.foundClues ?? [])],
    };
  }

  /*
   * 확인 지점이 있으면 **여정 진행은 전부 시나리오가 정한다.** 저장에서
   * 물려받지 않는다.
   *
   * `?see=clues`로 들어갔는데 완주 화면이 먼저 떴다. 저장이 둘째 여정
   * (`boss-hunt`)을 마친 상태였고, 첫 여정의 단계 번호를 그 여정에 꽂으니
   * 「단계 없음 = 완주」로 읽혔다. `?see=air`에서도 같은 화면이 떴다.
   *
   * 확인 지점은 특정 상태를 만들어 주는 도구다. 저장과 섞이면 **사람마다 다른
   * 화면**을 보게 되고, 그러면 확인 지점으로서 쓸모가 없다. 완주 화면을 보고
   * 싶은 지점(`result`)은 스스로 `questCompleted`를 켜므로 물려받을 이유가 없다.
   *
   * 여정 **밖의** 값은 그대로 물려받는다 — 처치 수·대장 기록, 그리고 「첫 여정을
   * 마친 적이 있는가」(`firstQuestDone`)다. 이쪽까지 지우면 확인 지점에 들어갈
   * 때마다 이미 만난 도깨비가 잠긴다.
   *
   * **찾은 흔적은 여기 끼지 않는다.** 한동안 물려받는 쪽에 적어 두었는데 틀렸다 —
   * 흔적은 여정 단계가 세는 **진행 상태**다. 세 곳을 다 조사한 사람이
   * `?see=clues`로 들어가면 남은 흔적이 0곳이라 **표식도 빛도 마름모도 없다.**
   * 빛기둥이 없던 것과 같은 사고다.
   */
  return {
    /*
     * 시나리오가 단계를 지정하면 그것을 쓴다. `questId`만 있으면 마지막
     * 단계를 넘어선 상태(완주 화면)로 본다. 둘 다 없으면 첫 여정의 처음이다.
     */
    questStepIndex: scenario.questStepIndex ?? (scenario.questId ? Number.MAX_SAFE_INTEGER : 0),
    questCompleted: scenario.questCompleted === true,
    defeatedTotal: Math.max(saved?.defeatedTotal ?? 0, scenario.defeatedTotal ?? 0),
    // 여정을 말하지 않았으면 첫 여정이다 (`PlayerRig`의 기본값과 같은 약속)
    questId: scenario.questId,
    bossDefeated: scenario.bossDefeated === true || bossDefeated,
    firstQuestDone: scenario.questCompleted === true || firstQuestDone,
    // 다시 찾을 수 있는 상태로 연다 (위 주석 참고) — 평소 이어하기는 그대로 물려받는다
    foundClues: [],
  };
}

/**
 * 확인 지점이 있으면 **만난 도깨비도 시나리오가 정한다.**
 *
 * `?see=shrine`은 「빛기둥이 골목에서 보이는지」를 보러 가는 자리인데 빛기둥이
 * 없었다 — 앞서 `?see=party`로 들어간 적이 있어 저장에 넷이 「만났다」로 남았고,
 * **이미 만난 도깨비는 자리를 치우기 때문**이다. 여정 진행에서 고친 것과 같은
 * 유형이다: 확인 지점이 저장에 덮이면 사람마다 다른 화면을 보게 된다.
 *
 * 시나리오가 목록을 말하지 않으면 **아무도 안 만난 상태**로 연다. 「말하지 않음」을
 * 「저장을 쓰라」로 읽으면 같은 사고가 돌아온다.
 */
export function resolveMetDokebi(
  saved: readonly DokebiId[],
  scenario: Scenario | null,
): DokebiId[] {
  if (!scenario) return [...saved];
  return [...(scenario.metDokebi ?? [])];
}

/**
 * 저장에 만난 도깨비 하나를 **더한다.**
 *
 * 확인 지점은 「아무도 안 만난」 상태로 열린다(그래야 도깨비 자리가 보인다).
 * 그 상태의 목록에 하나를 얹어 저장하면 **모아 둔 넷이 하나가 된다** — 사람이
 * 플레이테스트하는 입구가 확인 지점이고 저장은 같은 브라우저에 있으니, 확인하러
 * 들어갔다가 수집을 잃는다.
 *
 * 그래서 저장할 값은 **세션 목록이 아니라 저장에서** 만든다. 「확인 지점에서 한
 * 일은 기록된다」는 더하는 것이지 줄이는 것이 아니다.
 */
export function withMetDokebi(saved: readonly DokebiId[], found: DokebiId): DokebiId[] {
  return saved.includes(found) ? [...saved] : [...saved, found];
}

/** 저장 형식에서 버전을 뺀 것 — 화면이 들고 다니는 진행 상태 */
type Progress = Omit<SavedProgress, "version">;

/**
 * 확인 지점에서 저장할 때 **뒤로 가지 않게** 합친다.
 *
 * 확인 지점은 여정을 처음으로 되돌린 상태로 열린다(그래야 볼 것이 있다).
 * 그 상태에서 무엇 하나만 진행돼도 저장이 통째로 덮여 **사람이 진행한 여정과
 * 찾아 둔 흔적이 사라진다.** 만난 도깨비에서 겪은 것과 같은 사고이고, 잃는
 * 양은 더 크다.
 *
 * 그래서 확인 지점에서는 **늘어나는 것만** 기록한다 — 처치 수는 큰 쪽,
 * 대장 기록은 한 번 켜지면 켜진 채, 흔적은 합집합. 여정 단계·완주 여부·여정
 * id는 **저장된 것을 그대로 둔다**: 확인 지점의 여정은 진짜 진행이 아니다.
 *
 * 저장이 아직 없으면 합칠 것이 없으므로 그대로 쓴다.
 */
export function mergeSandboxProgress(stored: Progress | null, next: Progress): Progress {
  if (!stored) return next;
  const clues = new Set([...(stored.foundClues ?? []), ...(next.foundClues ?? [])]);
  return {
    ...stored,
    defeatedTotal: Math.max(stored.defeatedTotal, next.defeatedTotal),
    bossDefeated: stored.bossDefeated === true || next.bossDefeated === true,
    foundClues: [...clues],
  };
}
