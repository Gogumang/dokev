/**
 * 도깨비 명부 — 순수 데이터.
 *
 * 「도깨비」의 중심은 수집이다. 동료가 하나뿐이면 도시를 다시 돌 이유가 없다.
 * 해금 조건을 **이미 추적 중인 값**으로만 잡았다 — 처치 누적 수와 첫 퀘스트
 * 완료 여부. 새 상태를 만들면 저장 포맷이 또 늘고 마이그레이션이 따라온다.
 *
 * 능력은 셋이 서로 다른 규칙을 쓴다. 이름만 다르고 효과가 같으면 도감이
 * 카탈로그일 뿐 고를 이유가 없다. 효과를 **배율 몇 개로 기술**해 두고 각
 * 시스템(빛·전투)이 그 배율을 읽는다 — 도깨비마다 코드 분기를 두면 넷째를
 * 추가할 때 세 곳을 고쳐야 한다.
 */

import { CHORONG } from "@/game/dokebi/companionMotion";
import { ROAD_CENTERS } from "@/game/world/cityLayout";

/**
 * 도깨비가 기다리는 자리는 **교차로**로 잡는다.
 *
 * 건물 안이나 인도 위에 두면 닿을 수 없거나 벽에 낀다. 도로가 만나는 점은
 * 반드시 비어 있다.
 *
 * 좌표를 여기서 다시 계산하지 않고 cityLayout의 도로 중심선을 그대로 읽는다 —
 * 같은 값을 두 곳에서 유도하다가 반 칸이 어긋나 자리가 건물 안에 박혔다.
 * `tests/worldConsistency.test.ts`가 실제 충돌체와 대조한다.
 */
function crossing(colIndex: number, rowIndex: number): { x: number; z: number } {
  return { x: ROAD_CENTERS[colIndex], z: ROAD_CENTERS[rowIndex] };
}

/** 이 거리 안으로 들어가면 만난 것으로 본다(m) */
export const DISCOVERY_RADIUS = 7;

/**
 * 능력을 쓰지 않을 때 동료의 빛이 닿는 거리(m).
 *
 * 도깨비의 `lightRangeScale`은 **이 값에 곱하는 배율**이다. 숫자가
 * `Companion.tsx` 안에만 있었는데, 빛으로 여는 문(`spiritGates.ts`)이
 * 생기면서 「28m가 열 수 있는 거리인가」를 두 곳이 각자 알아야 하게 됐다 —
 * 그런 값은 한 곳에만 둔다.
 */
export const BASE_LIGHT_RANGE = 9;

export type DokebiId = "chorong" | "geueum" | "mulbineul" | "jajeong";

/**
 * 능력 효과 — 배율의 묶음.
 *
 * 각 값의 기준은 1(변화 없음)이다. 새 도깨비는 여기서 숫자만 정하면 되고,
 * 읽는 쪽 코드는 손대지 않는다.
 */
export interface AbilityEffect {
  /** 지속 시간(초) */
  durationSeconds: number;
  /** 발동 시점부터 다시 쓸 수 있을 때까지(초). 지속과 겹쳐서 센다 */
  cooldownSeconds: number;
  /** 동료가 내는 빛의 세기 배율 */
  lightScale: number;
  /** 빛이 닿는 거리 배율 */
  lightRangeScale: number;
  /** 적 인지 반경 배율. 1 미만이면 몸을 감춘다 */
  aggroScale: number;
  /** 체력 회복 속도 배율 */
  regenScale: number;
}

export interface DokebiSpirit {
  id: DokebiId;
  name: string;
  /** 한 줄 소개 — 도감과 대화에서 재사용한다 */
  tagline: string;
  personality: string;
  /** 능력 이름 */
  abilityName: string;
  ability: string;
  bodyColor: string;
  accentColor: string;
  effect: AbilityEffect;
  /** 이만큼 쓰러뜨리면 자리가 드러난다. 0이면 조건 없음 */
  requiredDefeats: number;
  /** 첫 퀘스트를 마쳐야 자리가 드러나는지 */
  requiresQuest: boolean;
  /**
   * 고물 대장을 눕혀야 자리가 드러나는지.
   *
   * 절정을 넘긴 보상이 대사 한 줄뿐이었다. 수집 루프가 가장 큰 사건과
   * 이어지지 않으면 보스를 잡을 이유가 이야기 안에만 남는다.
   */
  requiresBoss: boolean;
  /**
   * 기다리는 자리. null이면 찾아갈 필요가 없다(처음부터 함께 있는 도깨비).
   *
   * 조건을 채우면 지도에 표식이 뜨고, 그 자리에 가야 만난다. 조건만으로
   * 열리면 도시를 돌 이유가 없다 — 「도깨비」는 찾아다니는 게임이다.
   */
  home: { x: number; z: number } | null;
}

export const DOKEBI: Record<DokebiId, DokebiSpirit> = {
  chorong: {
    id: "chorong",
    name: CHORONG.name,
    tagline: CHORONG.tagline,
    personality: CHORONG.personality,
    abilityName: "반딧불",
    ability: CHORONG.ability,
    // 탐색형 — 짧고 강하게 밝힌다. 전투에는 관여하지 않는다.
    effect: {
      durationSeconds: 4,
      cooldownSeconds: 12,
      lightScale: 3.2,
      lightRangeScale: 2.2,
      aggroScale: 1,
      regenScale: 1,
    },
    bodyColor: CHORONG.bodyColor,
    accentColor: CHORONG.accentColor,
    // 처음부터 함께 있다. 첫 동료가 잠겨 있으면 시작이 외롭다.
    requiredDefeats: 0,
    requiresQuest: false,
    requiresBoss: false,
    home: null,
  },
  geueum: {
    id: "geueum",
    name: "그을음",
    tagline: "굴뚝 그림자에서 떨어져 나온 검댕 덩어리",
    personality: "느긋하고 말이 적다. 서두르는 법이 없어 늘 조금 늦게 도착한다.",
    abilityName: "잿불",
    ability: "연기로 몸을 감춰 로봇이 잘 알아보지 못한다",
    /*
     * 은신형 — 인지 반경을 40%로 줄인다. 대신 빛이 거의 없어 어두운 골목에서는
     * 앞이 안 보인다. 느긋한 성격에 맞게 길고 느리게 돈다.
     */
    effect: {
      durationSeconds: 7,
      cooldownSeconds: 18,
      lightScale: 0.5,
      lightRangeScale: 0.7,
      aggroScale: 0.4,
      regenScale: 1,
    },
    // 어두운 몸에 따뜻한 테두리. 밤에도 실루엣이 배경에 묻히지 않아야 한다.
    bodyColor: "#57505f",
    accentColor: "#ff8a3d",
    requiredDefeats: 12,
    requiresQuest: false,
    requiresBoss: false,
    // 굴뚝 그림자 — 스폰에서 멀리 떨어진 변두리 교차로.
    home: crossing(1, 4),
  },
  mulbineul: {
    id: "mulbineul",
    name: "물비늘",
    tagline: "빗물받이에 고인 빛이 굳어 생긴 도깨비",
    personality: "조심스럽고 겁이 많다. 큰 소리가 나면 먼저 뒤로 물러선다.",
    abilityName: "물무늬",
    ability: "물무늬가 상처를 씻어 빠르게 아물게 한다",
    /*
     * 회복형 — 회복 속도를 네 배로 올린다. 회복은 마지막 피격 후 대기 시간이
     * 지나야 시작되므로, 맞자마자 켠다고 즉시 차오르지는 않는다.
     */
    effect: {
      durationSeconds: 6,
      cooldownSeconds: 20,
      lightScale: 1.6,
      lightRangeScale: 1.3,
      aggroScale: 1,
      regenScale: 4,
    },
    /*
     * 처음에는 옅은 물빛(#8fd8ff)이었는데 한낮 하늘(#9ec9f0)과 색 거리가
     * 26밖에 되지 않아 낮에는 하늘에 묻혔다. 물이라는 인상은 유지하면서
     * 채도를 올려 모든 시간대에서 122 이상 떨어지게 했다.
     */
    bodyColor: "#2f9fd4",
    accentColor: "#c9f7ff",
    requiredDefeats: 0,
    requiresQuest: true,
    requiresBoss: false,
    // 빗물받이 — 반대쪽 끝이다. 둘을 같은 방향에 두면 한 번에 지나친다.
    home: crossing(4, 1),
  },
  jajeong: {
    id: "jajeong",
    name: "자정",
    tagline: "가장 시끄럽던 것이 조용해진 자리에서 피어난 도깨비",
    personality: "말수가 적고 뜸을 들인다. 대신 한 번 한 말은 오래 남는다.",
    abilityName: "먼 불빛",
    ability: "멀리까지 빛이 번져 골목 구석까지 한꺼번에 드러난다",
    /*
     * 탐색형 — 빛의 범위를 크게 넓힌다. 세기는 초롱보다 낮게 둔다.
     * 밝기까지 올리면 밤의 인상이 통째로 날아간다.
     *
     * 보스를 눕힌 뒤에 얻으므로 전투 보정은 넣지 않는다. 이미 끝난 싸움을
     * 쉽게 만드는 능력은 받는 시점이 어긋난다.
     */
    effect: {
      durationSeconds: 10,
      cooldownSeconds: 24,
      lightScale: 1.2,
      lightRangeScale: 2.6,
      aggroScale: 1,
      regenScale: 1,
    },
    /*
     * 보라 계열 — 나머지 셋(등불빛·잿빛·물빛)과 색 계열이 겹치지 않는다.
     * 네 시간대 하늘과도 멀어야 해서 채도를 낮추지 않았다.
     *
     * 처음에는 #8a4fd8이었는데 **외형 「자두」 후드(#a86bd6)와 색거리가 41**밖에
     * 되지 않았다. 동료가 나와 같은 색이면 화면에서 둘을 구분할 수 없다 —
     * 도깨비끼리만 보고 고른 색이었다. 더 짙은 쪽으로 옮겨 81까지 벌렸다.
     */
    bodyColor: "#6d34d6",
    accentColor: "#e9c6ff",
    requiredDefeats: 0,
    requiresQuest: false,
    requiresBoss: true,
    // 고물 대장이 서 있던 자리에서 가장 가까운 교차로
    home: crossing(2, 4),
  },
};

export const DOKEBI_ORDER: readonly DokebiId[] = ["chorong", "geueum", "mulbineul", "jajeong"];

export const DEFAULT_DOKEBI: DokebiId = "chorong";

export interface DokebiProgress {
  /** 지금까지 쓰러뜨린 로봇 누적 수 */
  defeatedTotal: number;
  /** 첫 플레이 퀘스트를 마쳤는지 */
  questCompleted: boolean;
  /**
   * 고물 대장을 눕혔는지.
   *
   * 선택값이다 — 아직 값을 넘기지 않는 호출부는 예전처럼 동작한다.
   * 새 저장 필드는 필요 없다: 보스 여정 완료가 이미 저장된다.
   */
  bossDefeated?: boolean;
}

/**
 * 조건을 채워 **자리가 드러난** 도깨비들. 아직 만난 것은 아니다.
 *
 * 순서는 DOKEBI_ORDER를 따른다 — 해금 순서대로 나열되어야 도감에서 빈칸의
 * 위치가 고정된다.
 */
export function revealedDokebi(progress: DokebiProgress): DokebiId[] {
  return DOKEBI_ORDER.filter((id) => {
    const spirit = DOKEBI[id];
    if (spirit.requiresQuest && !progress.questCompleted) return false;
    if (spirit.requiresBoss && !progress.bossDefeated) return false;
    return progress.defeatedTotal >= spirit.requiredDefeats;
  });
}

/**
 * 지금 부를 수 있는 도깨비들.
 *
 * 자리가 없는 도깨비(초롱)는 조건만 채우면 되고, 자리가 있는 도깨비는
 * 실제로 찾아가 만나야 한다.
 */
export function unlockedDokebi(
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId[] {
  const metSet = new Set(met);
  return revealedDokebi(progress).filter((id) => DOKEBI[id].home === null || metSet.has(id));
}

/**
 * 지금 찾아가야 할 도깨비들 — 자리는 드러났지만 아직 만나지 못한.
 *
 * 지도가 이 목록만 표시한다. 만난 뒤에도 표식이 남으면 갈 곳이 아닌데
 * 계속 부르는 셈이 된다.
 */
export function pendingDiscoveries(
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiSpirit[] {
  const metSet = new Set(met);
  return revealedDokebi(progress)
    .map((id) => DOKEBI[id])
    .filter((spirit) => spirit.home !== null && !metSet.has(spirit.id));
}

/**
 * 지금 위치에서 만날 수 있는 도깨비. 없으면 null.
 *
 * 한 번에 하나만 돌려준다 — 두 자리가 겹칠 만큼 가깝지 않고, 겹친다면
 * 알림이 두 장 뜨는 편이 더 나쁘다.
 */
export function discoverAt(
  x: number,
  z: number,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId | null {
  for (const spirit of pendingDiscoveries(progress, met)) {
    const home = spirit.home;
    if (!home) continue;
    if (Math.hypot(home.x - x, home.z - z) <= DISCOVERY_RADIUS) return spirit.id;
  }
  return null;
}

/**
 * 이전 목록에는 없고 지금 목록에는 있는 도깨비들.
 *
 * 해금 판정을 매 프레임 다시 하는 대신 **목록의 차이**로 본다. 조건이 늘어나도
 * (시간대·구역 같은 것이 붙어도) 이 함수는 그대로다.
 */
export function newlyUnlocked(
  previous: readonly DokebiId[],
  current: readonly DokebiId[],
): DokebiId[] {
  const before = new Set(previous);
  return current.filter((id) => !before.has(id));
}

/**
 * 찾아가 만날 수 있는 도깨비들 — 자리가 있는 것만.
 *
 * 초롱은 처음부터 함께 있어서 `home`이 없고, 그래서 **만남 목록에는 영영
 * 들어가지 않는다**(`discoverAt`가 자리 있는 도깨비만 돌려준다). 완주 화면이
 * 「만난 도깨비 n / 전체」로 세는 바람에 다 모아도 3/4에서 멈춰 있었다 —
 * 마지막 화면이 아직 남았다고 거짓말을 한 셈이다.
 *
 * 세는 쪽과 셀 수 있는 쪽을 같은 정본에서 만든다.
 */
export const FINDABLE_DOKEBI: readonly DokebiId[] = DOKEBI_ORDER.filter(
  (id) => DOKEBI[id].home !== null,
);

export function isUnlocked(
  id: DokebiId,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): boolean {
  return unlockedDokebi(progress, met).includes(id);
}

/**
 * 시작할 때 데리고 나갈 동료를 정한다.
 *
 * 설정은 **id가 아는 이름인지만** 확인하고 해금 여부는 보지 않았다. 그래서
 * 「진행을 지우고 처음부터 다시 하기」를 눌러도 마지막으로 고른 동료가
 * 그대로 남았다 — 고물 대장을 눕혀야 열리는 「자정」을 들고, 그 능력까지
 * 쓰면서 첫 화면에서 시작하게 된다.
 *
 * 잠긴 것을 고르고 있으면 처음부터 함께 있는 도깨비로 되돌린다.
 */
export function resolveCompanion(
  selected: DokebiId,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId {
  return isUnlocked(selected, progress, met) ? selected : DEFAULT_DOKEBI;
}

/**
 * 다음 도깨비로 넘긴다. 잠긴 것은 건너뛴다.
 *
 * 해금된 것이 하나뿐이면 그대로 둔다 — 버튼을 눌러도 아무 일이 없는 편이
 * 잠긴 도깨비로 바뀌었다가 되돌아오는 것보다 낫다.
 */
export function nextDokebi(
  current: DokebiId,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId {
  const unlocked = unlockedDokebi(progress, met);
  if (unlocked.length === 0) return DEFAULT_DOKEBI;

  const index = unlocked.indexOf(current);
  // 지금 데리고 있는 도깨비가 잠긴 상태라면(저장값이 낡았다) 첫 번째로 되돌린다.
  if (index < 0) return unlocked[0];
  return unlocked[(index + 1) % unlocked.length];
}

/**
 * 해금 조건을 한 줄로 알려 준다.
 *
 * "언젠가 나타난다" 같은 막연한 문구를 쓰지 않는다 — 조건을 숨기면 도감이
 * 목표가 아니라 벽이 된다.
 */
export function unlockHint(spirit: DokebiSpirit): string {
  /*
   * 조건을 하나씩 확인하지 않고 **모아서** 만든다.
   *
   * 조건마다 `if`로 하나씩 돌려주던 때 보스 조건을 빠뜨렸고, 그러면 마지막
   * 줄로 떨어져 잠긴 도깨비가 「처음부터 함께 있다」고 안내했다 — 실제로
   * 「자정」이 도감에서 그렇게 보였다. 조건이 둘 이상인 도깨비도 한쪽만
   * 말하게 된다.
   */
  const conditions: string[] = [];
  if (spirit.requiresQuest) conditions.push("첫 여정을 끝까지 마치");
  if (spirit.requiresBoss) conditions.push("고물 대장을 눕히");
  if (spirit.requiredDefeats > 0) {
    conditions.push(`장난감 로봇을 ${spirit.requiredDefeats}기 쓰러뜨리`);
  }

  if (conditions.length === 0) return "처음부터 함께 있다";
  return `${conditions.join("고 ")}면 나타난다`;
}

/**
 * 해금까지의 진행도(0~1).
 *
 * 조건이 처치 수인 경우에만 의미가 있다. 퀘스트 조건은 달성 전까지 0이다 —
 * 중간 단계를 진행률로 보여 주면 "거의 다 왔다"는 잘못된 인상을 준다.
 */
export function unlockRatio(
  spirit: DokebiSpirit,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): number {
  /*
   * `met`을 받는다. 예전에는 기본값 `[]`에 기대 빠뜨리고 있었고, 그러면
   * **자리가 있는 도깨비는 이미 함께 다녀도 「못 만난 것」**이 되어 진행도가
   * 0으로 나온다. 지금 화면은 그 경우 막대를 그리지 않아 드러나지 않았을
   * 뿐이다 — 조건이 하나 바뀌면 곧바로 보인다.
   */
  if (isUnlocked(spirit.id, progress, met)) return 1;
  if (spirit.requiredDefeats > 0) {
    return Math.max(0, Math.min(1, progress.defeatedTotal / spirit.requiredDefeats));
  }
  return 0;
}

/**
 * 지금 함께 다니는 도깨비들. 고른 도깨비가 맨 앞이다.
 *
 * **해금 여부를 여기서 다시 확인한다.** 만난 기록만 보고 데리고 다니면,
 * 진행을 지운 뒤 도감에는 잠긴 것으로 보이는 도깨비가 월드에서는 계속
 * 따라다닌다 — 도감과 화면이 다른 말을 하게 된다.
 *
 * 고른 도깨비가 잠겼으면 첫 도깨비로 되돌린다. 아무도 없는 것보다 낫다.
 */
export function companionParty(
  selected: DokebiId,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId[] {
  const unlocked = unlockedDokebi(progress, met);
  if (unlocked.length === 0) return [DEFAULT_DOKEBI];

  const lead = unlocked.includes(selected) ? selected : unlocked[0];
  return [lead, ...unlocked.filter((id) => id !== lead)];
}

/**
 * 도깨비를 안전하게 꺼낸다. 모르는 id면 기본값.
 *
 * `timeOfDayPreset`과 같은 구멍이 있었다 — `??`는 프로토타입의 것을
 * 못 걸러서 `dokebiPreset("constructor")`가 `Object` 함수를 돌려줬다.
 */
export function dokebiPreset(id: string): DokebiSpirit {
  return Object.hasOwn(DOKEBI, id) ? DOKEBI[id as DokebiId] : DOKEBI[DEFAULT_DOKEBI];
}

/** 만남 알림을 기다리는 자리. `PlayClient`가 가져가고 비운다 */
export interface DiscoveryView {
  pending: DokebiId | null;
}

/**
 * 도깨비와의 만남을 신호로 올린다.
 *
 * **이 한 줄이 수집의 유일한 입구다.** 화면 안(프레임 루프)에 있을 때는 지워도
 * 아무도 몰랐다 — 그러면 도깨비 자리에 가 서도 아무 일이 없고, **누구도 모을 수
 * 없는데 화면은 멀쩡하다.**
 *
 * **이미 신호가 대기 중이면 건너뛴다.** `PlayClient`가 가져가기 전에 덮어쓰면
 * 만남이 하나 사라진다 — 두 도깨비 자리가 가까우면 실제로 일어날 수 있다.
 *
 * @returns 이번에 새로 만난 도깨비. 없으면 null (알림 연출을 걸지 판단에 쓴다)
 */
export function projectDiscovery(
  view: DiscoveryView,
  x: number,
  z: number,
  progress: DokebiProgress,
  met: readonly DokebiId[],
): DokebiId | null {
  if (view.pending !== null) return null;
  const found = discoverAt(x, z, progress, met);
  if (!found) return null;
  view.pending = found;
  return found;
}

/**
 * 대기 중인 만남을 **한 번만** 꺼낸다.
 *
 * `projectDiscovery`의 **짝**이다. 저쪽은 신호를 올리고 여기서 가져간다.
 *
 * 꺼내면서 비우지 않으면 `projectDiscovery`가 「이미 대기 중」으로 보고 계속
 * 건너뛴다 — **도깨비를 하나 만난 뒤로는 아무도 못 만난다.** 첫 만남은 되니까
 * 「되긴 되는데 왜 더는 안 열리지」가 되고, 원인을 짚기가 특히 어렵다.
 *
 * 반대로 비우기만 하고 값을 안 돌려주면 **만남이 통째로 사라진다.** 그래서
 * 꺼내기와 비우기를 한 함수에 둔다 — 둘을 떼어 놓으면 한쪽만 남기 쉽다.
 *
 * 이름이 `take…`였을 때는 **배선 검사가 이 함수를 아예 못 봤다** — 그 검사는
 * `consume`처럼 **하는 일을 말하는 동사**로 대상을 찾는다. 이름을 가족에 맞추면
 * 규칙이 저절로 따라온다.
 */
export function consumeDiscovery(view: DiscoveryView): DokebiId | null {
  const found = view.pending;
  if (!found) return null;
  view.pending = null;
  return found;
}
