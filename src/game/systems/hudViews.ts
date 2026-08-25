/**
 * 공유 상태를 화면이 쓸 값으로 옮긴다 — HUD의 기능 쪽.
 *
 * 지금까지 이 계산은 컴포넌트의 `setInterval` 안에 있었다. 「체력을 언제
 * 보여 주는가」·「무기 이름을 언제 감추는가」가 JSX 바로 위 열 줄에 섞여 있어서
 * **화면을 띄우지 않고는 확인할 방법이 없었다.**
 *
 * 여기로 옮기면 값으로 잴 수 있다. 화면은 이 함수가 돌려준 것을 그리기만 한다.
 *
 * 시계를 읽지 않는다 — 흐른 시간은 받는다(`hudHold`와 같은 이유).
 */

import { weaponLabel, type WeaponId } from "@/game/combat/weapons";
import { healthVisible, questExpanded, weaponVisible } from "@/game/systems/hudFocus";
import type { QuestView } from "@/game/quest/questRunner";

/** 목표 패널이 그릴 것 */
export interface QuestPanelView {
  /** 다 마쳤으면 감춘다 — 같은 문장을 완주 화면이 크게 띄운다 */
  readonly visible: boolean;
  /** 힌트와 진행 막대까지 펼칠지 */
  readonly expanded: boolean;
  readonly title: string;
  readonly hint: string;
  readonly counter: string;
  /** 0~1로 자른 진행도. 화면이 다시 자르지 않아도 되도록 여기서 가둔다 */
  readonly ratio: number;
}

export function questPanelView(quest: QuestView, secondsSinceChange: number): QuestPanelView {
  return {
    visible: !quest.completed,
    expanded: questExpanded(secondsSinceChange),
    title: quest.title,
    hint: quest.hint ?? "",
    counter: quest.counter ?? "",
    ratio: Math.min(1, Math.max(0, quest.ratio)),
  };
}

/** 체력 패널이 그릴 것 */
export interface HealthPanelView {
  readonly visible: boolean;
  /** 채운 칸 수 */
  readonly filled: number;
  readonly total: number;
  readonly downed: boolean;
}

export function healthPanelView(
  hp: number,
  maxHp: number,
  downed: boolean,
  bossEngaged: boolean,
  secondsSinceChange: number,
): HealthPanelView {
  return {
    visible: healthVisible(hp, maxHp, downed, bossEngaged, secondsSinceChange),
    filled: Math.ceil(Math.max(0, hp)),
    total: maxHp,
    downed,
  };
}

/** 무기 알림이 그릴 것 */
export interface WeaponNoticeView {
  readonly visible: boolean;
  readonly label: string;
}

export function weaponNoticeView(weapon: WeaponId, secondsSinceChange: number): WeaponNoticeView {
  return {
    // 한 번도 안 바꿨으면 흐른 시간이 무한대다 — 시작하자마자 뜨지 않는다
    visible: weaponVisible(secondsSinceChange),
    label: weaponLabel(weapon),
  };
}

/** 대장 체력 막대가 그릴 것 */
export interface BossHealthView {
  readonly visible: boolean;
  /** 0~100의 정수 퍼센트. 화면이 반올림을 다시 하지 않도록 여기서 만든다 */
  readonly percent: number;
  readonly telegraph: boolean;
}

export function bossHealthView(boss: {
  engaged: boolean;
  healthRatio: number;
  telegraph: boolean;
}): BossHealthView {
  return {
    visible: boss.engaged,
    percent: Math.round(Math.min(1, Math.max(0, boss.healthRatio)) * 100),
    telegraph: boss.telegraph,
  };
}

/** 자판기 안내가 그릴 것 */
export interface VendingView {
  readonly visible: boolean;
  /** 효과가 남아 있으면 남은 초, 아니면 null(뽑으라는 안내) */
  readonly remaining: number | null;
}

export function vendingView(vending: {
  machineInReach: boolean;
  boostRemaining: number;
}): VendingView {
  const boosting = vending.boostRemaining > 0;
  return {
    visible: vending.machineInReach || boosting,
    remaining: boosting ? vending.boostRemaining : null,
  };
}

/** 완주한 순간에 굳은 기록 */
export interface ResultRecord {
  readonly elapsedSeconds: number;
  readonly maxSpeed: number;
  readonly defeated: number;
}

/**
 * 완주 화면이 들고 있는 것.
 *
 * 두 가지 결함이 여기 붙어 있었고 둘 다 컴포넌트 안에 손으로 적혀 있었다.
 *
 * 하나는 **기록이 시계가 된 것**: 완주한 뒤에도 계속 다시 담아 「걸린 시간」이
 * 화면을 보는 동안 올라갔다. 다른 하나는 **「계속 탐험」을 누르면 다시 안
 * 열리던 것**: 첫 여정을 그렇게 닫은 사람에게는 보스를 눕힌 뒤의 완주 화면이
 * 영영 뜨지 않았다 — 게임에서 가장 큰 순간의 보상이 통째로 사라졌다.
 *
 * 둘 다 「언제 담고 언제 되돌리는가」 하나의 규칙이라 여기 모은다.
 */
export interface ResultLatch {
  readonly record: ResultRecord | null;
  readonly dismissed: boolean;
}

export function createResultLatch(): ResultLatch {
  return { record: null, dismissed: false };
}

/** 표본 하나를 먹인다 */
export function stepResultLatch(
  state: ResultLatch,
  completed: boolean,
  summary: ResultRecord,
): ResultLatch {
  // 새 여정이 시작되면 처음으로 되돌린다 — 닫아 둔 것도 함께 열린다
  if (!completed) return state.record === null && !state.dismissed ? state : createResultLatch();
  if (state.record !== null) return state;
  return {
    record: {
      elapsedSeconds: summary.elapsedSeconds,
      maxSpeed: summary.maxSpeed,
      defeated: summary.defeated,
    },
    dismissed: false,
  };
}

/** 사람이 「계속 탐험」을 눌렀다 */
export function dismissResult(state: ResultLatch): ResultLatch {
  return state.dismissed ? state : { ...state, dismissed: true };
}

/** 지금 완주 화면을 띄울지 */
export function resultVisible(state: ResultLatch): boolean {
  return state.record !== null && !state.dismissed;
}
