/**
 * 무기 — 순수 데이터.
 *
 * TRAILER_FEATURE_ANALYSIS 「3.4 실시간 액션 전투」가 근거다. 저 목록에서
 * 무기는 하나가 아니다 — 여러 자루가 나란히 있고 전투의
 * 인상은 그것들이 **번갈아 나오는 데서** 온다. 우리 쪽은 지금까지 휘두르기
 * 하나뿐이라 로봇 한 기를 상대하는 방법이 한 가지였다.
 *
 * 무기별로 코드 분기를 두지 않는다. 도깨비 능력을 배율 몇 개로 기술해 둔
 * 것과 같은 방식이다 — **전투 규칙은 이 표를 읽기만 하고**, 다음 무기를
 * 더할 때 전투 코드를 고치지 않는다.
 *
 * three.js도 React도 모른다.
 */

import type { AttackTiming } from "@/game/combat/attackPhase";

export type WeaponId = "beam" | "bow";

/**
 * 탄이 어떻게 나는가.
 *
 * **모든 무기가 탄을 쏜다.** 한때 근접 무기가 넷 있어서 이 값이 null일 수
 * 있었고, 부채꼴 판정이 그 갈래를 맡았다. 드는 것이 활·광선총 둘로 좁혀지면서
 * 근접 갈래가 통째로 사라졌다 — 「정의만 있고 손에 잡히지 않는 것」을 남기지
 * 않는다는 이 파일의 규칙 그대로다.
 */
export interface BoltSpec {
  /** 날아가는 속도(m/s). 사거리는 speed × lifeSeconds다 */
  speed: number;
  lifeSeconds: number;
  /** 나가는 높이(m) — 아이 가슴 높이 */
  spawnHeight: number;
  /** 명중 판정 반경(m) */
  hitRadius: number;
  /** 무지개 자국을 남기는지. **활만** — 35m를 나는 탄이라 어디로 갔는지가 안 읽혔다 */
  rainbow?: boolean;
}

export interface Weapon {
  id: WeaponId;
  /** 화면에 뜨는 이름 */
  name: string;
  /** 한 줄 소개 — 무기를 바꿀 때 이 문구가 뜬다 */
  tagline: string;
  /** 준비·판정·후딜 길이(초) */
  timing: AttackTiming;
  /** 한 대에 깎는 체력. 로봇 체력은 2다 */
  damage: number;
  /** 밀어내는 세기 배율. 1이 기준(`COMBAT_TUNING.knockbackSpeed`) */
  knockbackScale: number;
  /** 탄 설정. 빠뜨리면 컴파일이 막는다 — 안 쏘는 무기는 이제 없다 */
  bolt: BoltSpec;
}

/**
 * 여섯 자루 — 드는 것은 둘이다(`WEAPON_ORDER`).
 *
 * 늘릴 때마다 **정말 다른가**를 먼저 본다. 이름만 다른 무기가 다섯 있는
 * 것보다 손맛이 갈리는 셋이 낫다 — `tests/weapons.test.ts`가 「다른 축이
 * 둘 이상」과 dps 균형을 지킨다.
 */
export const WEAPONS: Record<WeaponId, Weapon> = {
  /**
   * 유령 잡는 광선총 — **밀지 않고 끌어당긴다.**
   *
   * 원작 트레일러의 원거리 무기가 「장난감 같은 총」인 것과, 우리 게임이
   * 도깨비를 **잡아서 친구로 만드는** 게임인 것이 여기서 만난다. 다른
   * 무기가 전부 적을 밀어내는데, 이것만 반대다 — 넉백 배율이 **음수**여서
   * 맞은 도깨비가 내 쪽으로 딸려 온다.
   *
   * 규칙을 새로 만들지 않았다. `strikeEnemy`가 「밀어내는 방향 × 배율」로
   * 속도를 정하므로, 배율의 부호만 뒤집으면 그대로 끌어당김이 된다 —
   * 무기 표를 읽기만 하는 전투 코드가 지켜지는지가 여기서 드러난다.
   *
   * 이것이 쓸모 있는 자리: 멀리 도망가는 도깨비를 끌어와 근접으로 마무리하고,
   * 약해진 놈을 포획 범위 안으로 당긴다. 대신 **끌어당기므로 위험하다** —
   * 여러 기를 당기면 내 발밑에 다 모인다.
   */
  beam: {
    id: "beam",
    name: "유령 잡는 광선총",
    tagline: "맞으면 끌려온다. 여러 기를 당기면 내 발밑에 다 모인다",
    timing: { windupSeconds: 0.12, activeSeconds: 0.08, recoverySeconds: 0.32 },
    damage: 1,
    /*
     * 음수 — 이것이 이 무기의 전부다. 크기는 활의 밀어냄보다 작게 둔다. 세게
     * 당기면 적이 등 뒤로 지나가 버려 조준이 의미를 잃는다.
     */
    knockbackScale: -0.9,
    /** 굵고 빠른 광선. 사거리 21m — 활(35m)보다 짧은 대신 주기가 절반이다 */
    bolt: { speed: 30, lifeSeconds: 0.7, spawnHeight: 1.1, hitRadius: 0.9 },
  },
  /**
   * 장난감 활 — 제일 멀리, 제일 세게, 제일 느리게.
   *
   * 원거리가 하나뿐일 때는 「멀리서 조금씩 깎기」한 가지였다. 활은
   * 반대쪽 끝이다 — 35m 밖에서 **한 발에 로봇을 눕힌다.** 대신 쏘고 나서
   * 0.86초 동안 아무것도 못 한다(광선총 한 번 반에 가까운 시간이다).
   *
   * 「느릴수록 세다」 줄에서 활이 맨 끝이다. 광선총과 가르는 것이 무게가
   * 아니라 **거리**이고, 그래서 둘 중 무엇을 들지가 상황으로 정해진다.
   */
  bow: {
    id: "bow",
    name: "장난감 활",
    tagline: "제일 멀리 닿고 한 발에 눕힌다. 대신 쏘고 나서 한참 굳는다",
    timing: { windupSeconds: 0.34, activeSeconds: 0.06, recoverySeconds: 0.46 },
    damage: 2,
    knockbackScale: 0.35,
    /** 사거리 35.2m — 도시 한 블록 건너까지 닿는다 */
    bolt: { speed: 22, lifeSeconds: 1.6, spawnHeight: 1.15, hitRadius: 0.7, rainbow: true },
  },
};

/**
 * **주인공이 드는 것.** 첫째가 시작 무기다.
 *
 * 여섯을 만들어 놓고 **둘로 좁혔다.** 활이 「멀리서 한 발」을, 광선총이
 * 그 반대편을 맡는다. 표(`WEAPONS`)의 키 순서에 기대지 않는다 — 키 순서에 조작 순서를 맡기면
 * 정의를 위아래로 옮기는 것만으로 손에 잡히는 무기가 바뀐다.
 */
export const WEAPON_ORDER: readonly WeaponId[] = ["bow", "beam"];

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
 * 자리 번호(1부터)로 무기를 고른다. 범위 밖이면 null.
 *
 * 숫자키가 읽는다. **번호를 여기서 정하지 않는다** — `WEAPON_ORDER`가 곧
 * 번호다. 따로 표를 두면 순서를 바꿀 때 화면의 「3」과 손의 「3」이 갈라진다.
 *
 * 범위 밖에서 시작 무기로 되돌리지 않고 null을 주는 것이 `nextWeapon`과
 * 다른 점이다. 저 쪽은 낡은 저장값을 복구하는 자리라 무엇이든 하나를
 * 골라야 하고, 이 쪽은 **사람이 방금 누른 키**라 없는 자리면 아무 일도
 * 일어나지 않는 편이 맞다 — 7을 눌렀는데 무기가 바뀌면 그게 버그다.
 */
export function weaponAtSlot(slot: number): WeaponId | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > WEAPON_ORDER.length) return null;
  return WEAPON_ORDER[slot - 1];
}

/** 탄이 닿는 거리(m). 지도·HUD·검사가 무기 종류를 몰라도 사거리를 묻는 자리다 */
export function weaponRange(weapon: Weapon): number {
  return weapon.bolt.speed * weapon.bolt.lifeSeconds;
}

/** 한 번의 휘두르기 전체 길이(초) */
export function swingSeconds(weapon: Weapon): number {
  return weapon.timing.windupSeconds + weapon.timing.activeSeconds + weapon.timing.recoverySeconds;
}

/**
 * 화면에 쓰는 이름 — 무기 이름에 **사거리**를 붙인다.
 *
 * 이름만으로는 그 무기가 얼마나 멀리 닿는지 알 수 없다.
 * 원거리는 탄이 나는 거리 — `weaponRange`가 그 둘을 한 값으로 답한다.
 *
 * HUD 알림과 성능 패널이 함께 쓴다. 둘이 각자 만들면 같은 무기가 화면 두 곳에
 * 다른 이름으로 뜬다.
 */
export function weaponLabel(id: WeaponId): string {
  const weapon = WEAPONS[id];
  return `${weapon.name} · ${weaponRange(weapon).toFixed(0)}m`;
}
