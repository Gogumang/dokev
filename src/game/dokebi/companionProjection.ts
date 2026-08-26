import {
  canUseAbility,
  showsOnMap,
  type CompanionState,
  type CompanionTarget,
} from "@/game/dokebi/companionMotion";
import type { Vec3 } from "@/game/player/locomotion";

/** 동료가 화면·플레이어에게 내보내는 칸들 */
export interface CompanionEffects {
  abilityAggroScale: number;
  abilityRegenScale: number;
  companionX: number;
  companionZ: number;
  companionVisible: boolean;
  companionAbilityReady: boolean;
  companionLightRange: number;
}

/**
 * 동료 하나가 공유 효과 객체에 자기 몫을 얹는다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다.** 여기 걸린 것이 지도 점·흔적을 밝히는 범위·능력 버튼이다.
 *
 * 두 가지 규칙이 이 함수의 이유다:
 *
 * 1. **덮어쓰지 않고 합친다.** 동료가 여럿이면 마지막에 쓴 하나만 남아 나머지
 *    능력이 사라진다. 인지 반경은 가장 낮은 값, 회복은 가장 높은 값을 쓴다.
 * 2. **지도와 능력 버튼은 맨 앞 동료만** 쓴다. 셋이 겹쳐 있어 점 세 개는 뭉쳐
 *    보이고, 뒤따르는 도깨비 상태로 버튼이 바뀌면 헷갈린다.
 *
 * 매 프레임 기본값으로 되돌리는 일은 PlayerRig가 한다(이 함수보다 먼저 돈다).
 */
export function projectCompanionEffects(
  effects: CompanionEffects,
  state: CompanionState,
  ability: { aggroScale: number; regenScale: number },
  /** 몇 번째 자리인가. 0이 맨 앞이다 */
  slot: number,
  /** 능력이 켜져 있고 아직 사라지지 않았는가 */
  applies: boolean,
  /** 흔적을 드러내는 반경(m) */
  lightRange: number,
): void {
  if (applies) {
    effects.abilityAggroScale = Math.min(effects.abilityAggroScale, ability.aggroScale);
    effects.abilityRegenScale = Math.max(effects.abilityRegenScale, ability.regenScale);
  }

  if (slot !== 0) return;

  effects.companionX = state.position.x;
  effects.companionZ = state.position.z;
  effects.companionVisible = showsOnMap(state);
  effects.companionAbilityReady = canUseAbility(state);
  /*
   * 흔적을 드러내는 범위. **능력이 켜져 있을 때만** 값이 실린다 — 평소 빛(9m)으로도
   * 드러나면 「잠깐 빛나게 한다」가 아니라 늘 보이는 것이 된다. 사라지는 중에는
   * 0이다: 안 보이는 동료가 흔적을 밝히면 앞뒤가 안 맞는다.
   */
  effects.companionLightRange = applies ? lightRange : 0;
}

/**
 * 동료가 읽어 갈 플레이어 상태를 옮긴다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다.** 여기가 끊기면 동료가 이상하게 군다:
 *
 *   - 자리가 안 나가면 **동료가 첫 자리에 멈춰 서서 안 따라온다.**
 *   - `speed`가 안 나가면 늘 걷는 속도로 판단해 달릴 때 뒤처진다.
 *   - `facing`이 안 나가면 대열이 플레이어 등 뒤가 아니라 엉뚱한 쪽에 선다.
 *   - `grounded`가 안 나가면 점프해도 동료가 따라 뜨지 않는다.
 *
 * **객체를 교체하지 않고 칸만 옮긴다** — `position`까지 갈아 끼우면 동료가
 * 들고 있던 참조와 갈라진다.
 */
export function projectCompanionTarget(
  target: CompanionTarget,
  position: Vec3,
  speed: number,
  facing: number,
  grounded: boolean,
): void {
  target.position.x = position.x;
  target.position.y = position.y;
  target.position.z = position.z;
  target.speed = speed;
  target.facing = facing;
  target.grounded = grounded;
}

/**
 * 동료 능력 효과를 매 프레임 되돌린다.
 *
 * `projectCompanionEffects`의 **짝**이다. 저쪽은 동료마다 자기 몫을 얹기만 하고
 * (덮어쓰지 않고 합친다), 되돌리는 일은 그보다 **먼저 도는 곳**이 한 번 한다.
 *
 * 되돌리는 곳이 없으면 **능력이 한 번 걸린 뒤 영영 안 풀린다** — 인지 반경이
 * 줄어든 채로 남고, 능력이 끝나도 흔적이 계속 밝다. 화면에는 아무 표시가 없어
 * 「원래 이런 게임인가」 싶게 된다.
 *
 * 순서가 뒤바뀌면 반대로 **능력이 걸려도 즉시 지워진다.** 프레임 순서 자체는
 * `tests/resourceRelease.test.ts`가 지킨다 — 여기서는 되돌리는 값이 맞는지만 본다.
 */
export function resetCompanionEffects(effects: CompanionEffects): void {
  effects.abilityAggroScale = 1;
  effects.abilityRegenScale = 1;
  effects.companionLightRange = 0;
}
