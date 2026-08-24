/**
 * 씬이 들고 있는 값을 HUD가 읽는 객체로 옮긴다.
 *
 * 계산은 하지 않는다 — **옮기기만** 한다. 그래도 따로 두는 이유는, 이 옮기는
 * 줄들이 프레임 루프 안에 있을 때 **한 줄을 지워도 아무도 몰랐기** 때문이다.
 * 공유 객체에 쓰는 줄을 하나씩 지워 보니 여기 열네 줄이 그랬다.
 *
 * 화면이 조용히 옛 값을 계속 보여 주는 것이 이 저장소에서 가장 자주 나온 결함
 * 모양이다. 옮기는 일을 함수로 두면 값으로 잴 수 있고, 이름 규칙(`project…`)이
 * 「화면에서 부르는가」까지 지켜 준다.
 *
 * 어디서도 객체를 **갈아 끼우지 않는다.** HUD는 처음 받은 참조를 계속 읽으므로
 * 새 객체를 만들면 그때부터 화면이 멈춘다.
 */

import type { EmoteState } from "@/game/player/emote";
import type { WeaponId } from "@/game/combat/weapons";
import type { DistrictId } from "@/game/world/districts";

/** HUD가 읽는 전투 상태 */
export interface CombatViewFields {
  playerHp: number;
  playerDowned: boolean;
  enemyBlips: Float32Array;
  enemyBlipCount: number;
  companionX: number;
  companionZ: number;
  companionVisible: boolean;
  companionAbilityReady: boolean;
}

/**
 * 씬 안쪽 전투 상태를 HUD 쪽으로 옮긴다.
 *
 * 여기가 끊기면 화면이 통째로 거짓말을 한다: 하트가 안 줄고, 쓰러져도 표시가
 * 없고, 지도에 적이 안 뜨고, 능력 버튼이 안 켜진다.
 *
 * `enemyBlips`는 **같은 버퍼를 계속 쓴다.** 참조만 맞춰 두고 개수만 매 프레임
 * 옮긴다 — 매 프레임 새 배열을 만들면 초당 60번 쓰레기를 만든다.
 */
export function projectCombatView(view: CombatViewFields, link: CombatViewFields): void {
  view.playerHp = link.playerHp;
  view.playerDowned = link.playerDowned;
  view.enemyBlips = link.enemyBlips;
  view.enemyBlipCount = link.enemyBlipCount;
  view.companionX = link.companionX;
  view.companionZ = link.companionZ;
  view.companionVisible = link.companionVisible;
  view.companionAbilityReady = link.companionAbilityReady;
}

/** HUD가 읽는 자판기 상태 */
export interface VendingViewFields {
  machineInReach: boolean;
  boostRemaining: number;
  drinks: number;
}

/**
 * 자판기 상태를 HUD로 옮긴다.
 *
 * `machineInReach`가 안 나가면 **자판기 앞에 서도 안내가 없어** 마실 수 있다는
 * 것을 모르고, `boostRemaining`이 안 나가면 언제 끝나는지 알 수 없다.
 */
export function projectVendingView(
  view: VendingViewFields,
  inReach: boolean,
  boostRemaining: number,
  drinks: number,
): void {
  view.machineInReach = inReach;
  view.boostRemaining = boostRemaining;
  view.drinks = drinks;
}

/** HUD가 읽는 구역 상태 */
export interface DistrictViewFields {
  id: DistrictId;
  name: string;
  subtitle: string;
}

/**
 * 지금 서 있는 구역을 HUD로 옮긴다.
 *
 * 넓은 도시에서 「어디쯤 왔다」를 알려 주는 유일한 단서다. 셋 중 하나만 빠져도
 * 배너가 **옛 구역 이름을 계속 달고 있는다** — 틀린 안내는 없는 것보다 나쁘다.
 */
export function projectDistrictView(view: DistrictViewFields, district: DistrictViewFields): void {
  view.id = district.id;
  view.name = district.name;
  view.subtitle = district.subtitle;
}

/** 완주 화면이 읽는 집계 */
export interface SummaryViewFields {
  elapsedSeconds: number;
  maxSpeed: number;
  defeated: number;
  bossDefeated: boolean;
}

/**
 * 완주 결과 집계를 한 프레임만큼 진행한다.
 *
 * 옮기기만 하는 위 함수들과 달리 **쌓는다** — 그래서 규칙이 둘 있다:
 *
 * 1. **완주한 뒤에는 시간을 더 세지 않는다.** 안 그러면 완주 화면을 열어 둔
 *    채로 기록이 계속 늘어난다 — 「1분 12초에 끝냈다」가 볼 때마다 달라진다.
 * 2. **최고 속도는 줄어들지 않는다.** 지금 속도를 그대로 쓰면 결과 화면에
 *    「최고 0.0 m/s」가 뜬다(멈춰 서서 화면을 여니까).
 *
 * 처치 수와 대장 기록은 **같은 출처, 같은 프레임**에서 옮긴다 — 어긋나면
 * 도감과 완주 화면이 다른 말을 한다.
 */
export function projectSummaryView(
  view: SummaryViewFields,
  source: { defeatedTotal: number; bossDefeated: boolean },
  speed: number,
  dt: number,
  questCompleted: boolean,
): void {
  if (!questCompleted) {
    view.elapsedSeconds += dt;
    if (speed > view.maxSpeed) view.maxSpeed = speed;
  }
  view.defeated = source.defeatedTotal;
  view.bossDefeated = source.bossDefeated;
}

/** 캐릭터가 자세를 뽑는 데 쓰는 신호들 */
export interface CharacterCueFields {
  emote: EmoteState;
  attackElapsed: number | null;
  companionPresent: boolean;
  downed: boolean;
  /** 지금 들고 있는 무기. 휘두르는 자세의 길이가 여기서 갈린다 */
  weapon: WeaponId;
}

/**
 * 캐릭터 자세 신호를 화면 쪽으로 옮긴다.
 *
 * 셋 다 **몸이 어떻게 움직이는지**를 정한다. 안 옮기면 춤을 춰도 가만히 서
 * 있고, 휘둘러도 팔이 안 나가고, 동료를 불러도 캐릭터가 모른 척한다.
 *
 * `emote`는 **객체를 그대로 넘긴다** — 안쪽 값(경과 시간)이 매 프레임 바뀌므로
 * 여기서 복사하면 한 프레임 낡은 자세를 그린다.
 */
export function projectCharacterCues(
  view: CharacterCueFields,
  emote: EmoteState,
  attackElapsed: number | null,
  companionPresent: boolean,
  downed: boolean,
  weapon: WeaponId,
): void {
  view.emote = emote;
  view.attackElapsed = attackElapsed;
  view.companionPresent = companionPresent;
  view.downed = downed;
  view.weapon = weapon;
}
