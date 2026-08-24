/**
 * 무기 — 순수 데이터.
 *
 * TRAILER_FEATURE_ANALYSIS 「3.4 실시간 액션 전투」가 근거다. 저 목록에서
 * 무기는 하나가 아니다 — 근접, 장난감 원거리, 큰 망치가 나란히 있고 전투의
 * 인상은 그것들이 **번갈아 나오는 데서** 온다. 우리 쪽은 지금까지 휘두르기
 * 하나뿐이라 로봇 한 기를 상대하는 방법이 한 가지였다.
 *
 * 무기별로 코드 분기를 두지 않는다. 도깨비 능력을 배율 몇 개로 기술해 둔
 * 것과 같은 방식이다 — **전투 규칙은 이 표를 읽기만 하고**, 셋째 무기를
 * 더할 때 전투 코드를 고치지 않는다.
 *
 * three.js도 React도 모른다.
 */

import type { AttackTiming } from "@/game/combat/attackPhase";

export type WeaponId = "bat" | "hammer" | "popgun";

/**
 * 어떻게 닿는가.
 *
 * 「근접」은 부채꼴 판정이 몸에서 바로 나가고, 「원거리」는 탄을 하나 쏜다.
 * 판정 방식이 다르면 전투 코드가 갈라지므로 **수치가 아니라 종류로** 적는다 —
 * 사거리만 길게 준 근접 무기로 원거리를 흉내 내면 벽 너머의 적이 맞는다.
 */
export type WeaponKind = "melee" | "ranged";

/** 탄이 어떻게 나는가. 근접 무기는 null이다 */
export interface BoltSpec {
  /** 날아가는 속도(m/s) */
  speed: number;
  /** 수명(초). 사거리는 speed × lifeSeconds다 */
  lifeSeconds: number;
  /** 나가는 높이(m) — 아이 가슴 높이 */
  spawnHeight: number;
  /** 명중 판정 반경(m) */
  hitRadius: number;
}

export interface Weapon {
  id: WeaponId;
  kind: WeaponKind;
  /** 화면에 뜨는 이름 */
  name: string;
  /** 한 줄 소개 — 무기를 바꿀 때 이 문구가 뜬다 */
  tagline: string;
  /** 준비·판정·후딜 길이(초) */
  timing: AttackTiming;
  /** 판정이 닿는 거리(m) */
  reachMeters: number;
  /** 판정 부채꼴의 반각(rad) */
  halfAngle: number;
  /** 한 대에 깎는 체력. 로봇 체력은 2다 */
  damage: number;
  /** 밀어내는 세기 배율. 1이 기준(`COMBAT_TUNING.knockbackSpeed`) */
  knockbackScale: number;
  /**
   * 탄 설정. **근접이면 반드시 null이다.**
   *
   * 선택 필드(`bolt?`)로 두지 않는다 — 빠뜨린 것과 「없음」이 구분되지
   * 않으면 원거리 무기를 추가하고 탄을 안 적어도 조용히 근접이 된다.
   */
  bolt: BoltSpec | null;
}

/**
 * 세 자루 — 근접 둘, 원거리 하나.
 *
 * 늘릴 때마다 **정말 다른가**를 먼저 본다. 이름만 다른 무기가 다섯 있는
 * 것보다 손맛이 갈리는 셋이 낫다 — `tests/weapons.test.ts`가 「다른 축이
 * 둘 이상」과 dps 균형을 지킨다.
 */
export const WEAPONS: Record<WeaponId, Weapon> = {
  /**
   * 장난감 방망이 — 지금까지 쓰던 그 공격이다.
   *
   * 수치를 바꾸지 않았다. 무기를 나누면서 기본 손맛까지 흔들면 「무기가
   * 늘었다」와 「전투가 달라졌다」를 구분할 수 없다.
   */
  bat: {
    id: "bat",
    kind: "melee",
    name: "장난감 방망이",
    tagline: "가볍다. 빠르게 두 번 두들기는 쪽이 맞다",
    timing: { windupSeconds: 0.08, activeSeconds: 0.14, recoverySeconds: 0.26 },
    reachMeters: 2.4,
    halfAngle: 0.9,
    damage: 1,
    knockbackScale: 1,
    bolt: null,
  },
  /**
   * 고무 망치 — 느리고, 넓고, 한 방이다.
   *
   * 피해를 로봇 체력(2)과 같게 잡은 것이 이 무기의 존재 이유다. 1이면
   * 「느리기만 한 방망이」가 되고, 3이면 방망이를 들 이유가 사라진다.
   *
   * 대신 후딜이 방망이의 두 배다 — 헛치면 그동안 맞는다. 여러 기에
   * 둘러싸였을 때 무엇을 들지가 실제로 갈린다.
   */
  hammer: {
    id: "hammer",
    kind: "melee",
    name: "고무 망치",
    tagline: "느리다. 대신 한 번 맞으면 로봇이 눕는다",
    timing: { windupSeconds: 0.3, activeSeconds: 0.18, recoverySeconds: 0.55 },
    reachMeters: 3.2,
    halfAngle: 1.3,
    damage: 2,
    knockbackScale: 1.8,
    bolt: null,
  },
  /**
   * 딱총 — 멀리서 한 발.
   *
   * TRAILER_FEATURE_ANALYSIS 「3.4 실시간 액션 전투」의 「장난감 같은 원거리
   * 무기」다. 사수 로봇이 멀리서 쏘는데 이쪽은 붙어야만 때릴 수 있었다 —
   * 거리를 두는 선택지가 없으니 전투가 늘 「달려가서 휘두르기」였다.
   *
   * 세다고 느껴지면 안 되는 무기다. 그래서:
   *
   * - **넉백이 가장 약하다.** 붙은 적을 떼어내지 못하므로 둘러싸이면 곤란하다.
   * - **탄이 날아가는 시간이 있다.** 움직이는 적은 조준한 자리에 없다.
   * - **후딜이 길다.** 한 발 쏘고 다시 쏘기까지 방망이 두 번보다 느리다.
   *
   * 사거리(12 × 1.4 = 16.8m)는 적 인지 반경(16m)보다 조금 길다. 짧으면
   * **나를 이미 본 적에게만 쏠 수 있어** 먼저 거는 재미가 없다.
   */
  popgun: {
    id: "popgun",
    kind: "ranged",
    name: "딱총",
    tagline: "멀리 닿는다. 대신 붙은 적을 떼어내지 못한다",
    timing: { windupSeconds: 0.06, activeSeconds: 0.05, recoverySeconds: 0.42 },
    // 원거리의 사거리는 탄이 정한다. 이 값은 부채꼴 판정에 쓰이지 않는다.
    reachMeters: 0,
    halfAngle: 0,
    damage: 1,
    knockbackScale: 0.6,
    bolt: { speed: 12, lifeSeconds: 1.4, spawnHeight: 1.05, hitRadius: 0.75 },
  },
};

/**
 * 바꾸는 순서. **첫째가 시작 무기다.**
 *
 * 표(`WEAPONS`)의 키 순서에 기대지 않는다 — 객체 키 순서에 조작 순서를
 * 맡기면 정의를 위아래로 옮기는 것만으로 손에 잡히는 무기가 바뀐다.
 */
export const WEAPON_ORDER: readonly WeaponId[] = ["bat", "hammer", "popgun"];

/** 시작 무기 */
export const DEFAULT_WEAPON: WeaponId = WEAPON_ORDER[0];

/** 다음 무기로. 끝에서 처음으로 돈다 */
export function nextWeapon(id: WeaponId): WeaponId {
  const at = WEAPON_ORDER.indexOf(id);
  // 모르는 값이 들어오면 시작 무기로 돌린다 — 저장에서 낡은 id가 올라올 수 있다
  if (at < 0) return DEFAULT_WEAPON;
  return WEAPON_ORDER[(at + 1) % WEAPON_ORDER.length];
}

/**
 * 탄이 닿는 거리(m). 근접 무기는 부채꼴 사거리를 돌려준다.
 *
 * 두 종류의 「사거리」를 한 이름으로 묻을 수 있어야 지도·HUD·검사가 무기
 * 종류를 따로 알 필요가 없다.
 */
export function weaponRange(weapon: Weapon): number {
  if (weapon.bolt === null) return weapon.reachMeters;
  return weapon.bolt.speed * weapon.bolt.lifeSeconds;
}

/** 한 번의 휘두르기 전체 길이(초) */
export function swingSeconds(weapon: Weapon): number {
  return weapon.timing.windupSeconds + weapon.timing.activeSeconds + weapon.timing.recoverySeconds;
}
