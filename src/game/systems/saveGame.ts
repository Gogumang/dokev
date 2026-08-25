/**
 * 진행 상황 저장.
 *
 * PROJECT_PLAN 「기능 요구사항 · 퀘스트」: "중간 이탈 후 마지막 완료 단계부터 재개할 수 있어야 한다."
 * 새로고침 한 번에 처음부터 다시 하게 만들면 퀘스트를 넣은 의미가 없다.
 *
 * settings.ts와 같은 방어 방식을 쓴다 — 외부에서 들어온 값이므로 신뢰하지 않고,
 * 필드 단위로 검사해 이상하면 저장이 없는 것으로 취급한다.
 *
 * **저장 포맷에 version이 있는 이유**: 퀘스트 단계는 데이터(questContent.ts)로
 * 정의되어 있어 콘텐츠를 고치면 단계 수와 순서가 바뀐다. 예전 저장의
 * stepIndex를 그대로 믿으면 존재하지 않는 단계를 가리키거나 엉뚱한 목표에서
 * 재개하게 된다. 포맷이나 콘텐츠가 바뀌면 버전을 올려 저장을 버린다.
 */

import { CLUES } from "@/game/quest/clues";
import { migrateStorageKey } from "@/game/systems/storageMigration";

const CURRENT_VERSION = 1;
export const PROGRESS_STORAGE_KEY = "dokev.progress.v1";

/**
 * 이름이 바뀌기 전 키.
 *
 * 지우면 그때까지 플레이한 사람의 **진행이 통째로 사라진다.** 읽기 직전에 한 번
 * 옮기고, 옮긴 뒤에는 이 상수가 할 일이 없다 — 그래도 남겨 둔다. 언제 지워도
 * 되는지는 「옛 저장을 들고 있는 사람이 아무도 없을 때」인데, 그건 알 수 없다.
 */
const LEGACY_PROGRESS_KEY = "doggabi.progress.v1";

export interface SavedProgress {
  version: number;
  /** 현재 퀘스트 단계 인덱스 */
  questStepIndex: number;
  questCompleted: boolean;
  /** 지금까지 쓰러뜨린 로봇 누적 수 */
  defeatedTotal: number;
  /**
   * 이어서 할 여정의 id.
   *
   * 번호가 아니라 id를 남긴다 — 중간에 여정을 끼워 넣으면 번호가 밀려
   * 엉뚱한 퀘스트에서 재개된다. 없으면 첫 여정으로 본다.
   */
  questId?: string;
  /**
   * 고물 대장을 눕힌 적이 있는가.
   *
   * 「자정」이 이 조건으로만 열린다. 예전에는 저장하지 않고 **보스 여정을
   * 마쳤는가**로 유도했는데, 대장은 25초마다 다시 서고 여정과 무관하게 잡을
   * 수 있다 — 여정 없이 잡아 도깨비를 연 사람은 새로고침 한 번에 잃었다.
   *
   * 없어도 읽히도록 선택 항목으로 둔다. 이 값이 없는 예전 저장은 여정
   * 완료로 유도하던 규칙을 그대로 쓴다 — 버전을 올리면 진행 전체를 버려서,
   * 진행을 지키려던 수정이 진행을 지운다.
   */
  bossDefeated?: boolean;
  /**
   * 조사한 흔적의 id.
   *
   * 처치 수는 저장되는데 흔적만 사라지면, 새로고침 한 번에 도시를 다시
   * 뒤져야 한다 — 몇 초짜리 활강과 달리 몇 분이 날아간다.
   *
   * 없어도 읽히도록 선택 항목으로 둔다(보스 기록과 같은 이유 — 버전을
   * 올리면 진행 전체를 버린다).
   */
  foundClues?: string[];
}

function isFiniteIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * 저장된 진행을 읽는다.
 *
 * 없거나 손상됐으면 null — 호출자는 처음부터 시작한다. 잘못된 값으로
 * 재개하는 것보다 처음부터 하는 편이 낫다 (coding-style: 보조 데이터의
 * 부분 실패는 허용하되 그럴싸한 거짓 상태를 만들지 않는다).
 */
export function loadProgress(): SavedProgress | null {
  if (typeof window === "undefined") return null;

  // 이름이 바뀌기 전 저장을 한 번 옮긴다 — 안 옮기면 처음부터 시작하게 된다
  migrateStorageKey(LEGACY_PROGRESS_KEY, PROGRESS_STORAGE_KEY);

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
  } catch {
    // 사파리 프라이빗 모드 등에서는 접근 자체가 예외를 던진다.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Partial<SavedProgress>;
    if (candidate.version !== CURRENT_VERSION) return null;
    if (!isFiniteIndex(candidate.questStepIndex)) return null;
    if (typeof candidate.questCompleted !== "boolean") return null;
    if (!isFiniteIndex(candidate.defeatedTotal)) return null;

    return {
      version: CURRENT_VERSION,
      // 소수점이 들어오면 배열 인덱스로 쓸 수 없다.
      questStepIndex: Math.floor(candidate.questStepIndex),
      questCompleted: candidate.questCompleted,
      defeatedTotal: Math.floor(candidate.defeatedTotal),
      // 모르는 id면 넘기지 않는다. 받는 쪽이 첫 여정으로 되돌린다.
      questId: typeof candidate.questId === "string" ? candidate.questId : undefined,
      /*
       * 없으면 false다 — 예전 저장에는 이 필드가 없다. 다른 필드처럼
       * 「이상하면 저장 전체를 버린다」로 다루면 안 된다: 값이 없는 것은
       * 손상이 아니라 예전 포맷이고, 버리면 진행을 통째로 잃는다.
       */
      bossDefeated: candidate.bossDefeated === true,
      /*
       * 모르는 id는 버리고 중복도 지운다 — 만난 도깨비와 같은 이유다.
       * 중복이 있으면 「3 / 3」을 채웠는데 실제로는 두 자리만 본 것이 된다.
       */
      foundClues: Array.isArray(candidate.foundClues)
        ? [...new Set(candidate.foundClues.filter((id) => CLUES.some((clue) => clue.id === id)))]
        : [],
    };
  } catch {
    return null;
  }
}

/** 저장 실패는 삼킨다 — 저장이 안 되는 것보다 플레이가 끊기는 쪽이 나쁘다. */
/**
 * 진행을 저장한다. **성공했는지 돌려준다.**
 *
 * 예전에는 실패를 조용히 삼켰다. 그런데 시작 화면은 「여정 진행과 만난 도깨비는
 * 이 브라우저에 저장된다」고 **약속한다** — 프라이빗 모드나 용량 초과에서는 그
 * 약속이 지켜지지 않는데 화면은 아무 말도 하지 않았다. 한참 놀다 새로고침하고
 * 나서야 알게 된다.
 *
 * 삼키는 것 자체는 맞다(저장 실패로 게임이 멈추면 안 된다). 다만 **부르는 쪽이
 * 알 수는 있어야** 한다.
 */
export function saveProgress(progress: Omit<SavedProgress, "version">): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({ ...progress, version: CURRENT_VERSION }),
    );
    return true;
  } catch {
    // 용량 초과·프라이빗 모드. 게임은 계속 돈다.
    return false;
  }
}

/** 처음부터 다시 하기. */
export function clearProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // 무시해도 되는 실패다.
  }
}

/**
 * 저장된 단계가 지금 퀘스트에서 유효한지 확인해 잘라 낸다.
 *
 * 콘텐츠가 줄어든 뒤 예전 저장을 읽으면 범위를 벗어난 인덱스가 들어온다.
 * 버전을 올리는 것을 잊었을 때의 마지막 방어선이다.
 */
export function clampStepIndex(stepIndex: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  /*
   * NaN만 걷어낸다. Math.min/max는 NaN을 그대로 통과시키고, 그 값이
   * quest.steps[NaN]으로 가면 undefined가 되어 **퀘스트가 즉시 완료 처리**된다.
   * 손상된 저장값 하나로 첫 여정이 통째로 사라지는 경로였다.
   *
   * 무한대는 걷어내지 않는다 — "끝을 넘어섰다"는 뜻이므로 아래 클램프가
   * 마지막 단계로 접어 주는 것이 맞다. NaN은 뜻이 없어 처음으로 보낸다.
   */
  if (Number.isNaN(stepIndex)) return 0;
  return Math.max(0, Math.min(stepCount - 1, Math.floor(stepIndex)));
}
