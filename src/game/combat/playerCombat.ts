/**
 * 플레이어 피격 — 순수 함수.
 *
 * `combatSim`에서 떼어 냈다. 무기(`weapons.ts`)를 들이면서 그 파일이 800줄
 * 상한에 닿았고, 상한이 「이건 다른 책임인가」를 대신 물어 줬다 — 답은
 * 그렇다였다. 저쪽은 **적을 굴리고**, 여기는 **맞는 쪽을 굴린다.**
 * `attackPhase`·`combatLink`를 떼어 냈을 때와 같은 기준이다.
 *
 * three.js와 React에 의존하지 않는다.
 */

import { ENEMY_STRIKE, type EnemyState } from "@/game/combat/combatSim";

/** 탄 한 발이 깎는 체력. projectiles.ts를 import하면 순환 참조가 된다 */
const PROJECTILE_DAMAGE = 1;

export const PLAYER_COMBAT = {
  maxHp: 5,
  /** 로봇에 닿았을 때 깎이는 양 */
  contactDamage: 1,
  /**
   * 피격 후 무적 시간(초).
   *
   * 이게 없으면 로봇 세 기에 둘러싸였을 때 한 프레임에 체력이 다 깎인다.
   * 밀려나 빠져나갈 시간을 주는 값이다.
   */
  invulnerableSeconds: 1.1,
  /** 마지막 피격 후 이 시간이 지나면 회복이 시작된다 */
  regenDelaySeconds: 6,
  /** 초당 회복량 */
  regenPerSecond: 0.35,
  /** 쓰러진 뒤 다시 시작하기까지(초) */
  respawnSeconds: 1.8,
} as const;

export interface PlayerCombatState {
  /** 소수점을 허용한다 — 회복이 연속적이어야 자연스럽다 */
  hp: number;
  /** 남은 무적 시간(초) */
  invulnerableRemaining: number;
  /** 마지막 피격 이후 지난 시간(초) */
  sinceHitSeconds: number;
  /** 쓰러져 있는지 */
  downed: boolean;
  /** 부활까지 남은 시간(초) */
  respawnRemaining: number;
}

export function createPlayerCombat(): PlayerCombatState {
  return {
    hp: PLAYER_COMBAT.maxHp,
    invulnerableRemaining: 0,
    sinceHitSeconds: PLAYER_COMBAT.regenDelaySeconds,
    downed: false,
    respawnRemaining: 0,
  };
}

/** 지금 피해를 받을 수 있는 상태인지. */
export function isPlayerVulnerable(state: PlayerCombatState): boolean {
  return !state.downed && state.invulnerableRemaining <= 0;
}

export interface PlayerCombatResult {
  state: PlayerCombatState;
  /** 이번 프레임에 맞았는지. 렌더가 화면 붉게 물들이기 등에 쓴다 */
  struck: boolean;
  /** 이번 프레임에 부활했는지. 씬이 위치를 스폰 지점으로 되돌린다 */
  respawned: boolean;
}

/**
 * 플레이어 피격을 한 프레임 진행한다.
 *
 * 추격 중인 적만 때린다 — 경직 중이거나 쓰러진 적에게 맞으면 억울하다.
 */
export function stepPlayerCombat(
  state: PlayerCombatState,
  enemies: readonly EnemyState[],
  playerX: number,
  playerZ: number,
  dt: number,
  /** 이번 프레임에 맞은 탄 수. 기본 0이라 근접만 쓰는 호출부는 그대로 둔다 */
  rangedHits = 0,
  /** 회복 속도 배율. 동료 능력이 올린다 */
  regenScale = 1,
  /**
   * 즉시 더할 회복량. 보스전에서 부른 「물무늬」가 쓴다. `regenScale`과 나누고 아래 대기
   * 시간도 타지 않는다 — 저쪽은 맞은 직후 0인데, 그때가 회복이 필요한 구간이다.
   */
  healBonus = 0,
): PlayerCombatResult {
  if (state.downed) {
    const respawnRemaining = state.respawnRemaining - dt;
    if (respawnRemaining > 0) {
      return { state: { ...state, respawnRemaining }, struck: false, respawned: false };
    }
    // 부활 직후에는 무적을 준다. 쓰러진 자리에 적이 그대로 있으면 즉사가 반복된다.
    return {
      state: {
        hp: PLAYER_COMBAT.maxHp,
        invulnerableRemaining: PLAYER_COMBAT.invulnerableSeconds,
        sinceHitSeconds: 0,
        downed: false,
        respawnRemaining: 0,
      },
      struck: false,
      respawned: true,
    };
  }

  const invulnerableRemaining = Math.max(0, state.invulnerableRemaining - dt);
  const sinceHitSeconds = state.sinceHitSeconds + dt;

  /*
   * **판정이 살아 있는 순간에만** 맞는다.
   *
   * 예전에는 "추격 중이고 가까이 있다"만으로 깎였다 — 모션도 예고도 없이
   * 1.1초마다 체력이 하나씩 줄어, 싸운 적이 없는데 쓰러지는 일이 생겼다.
   * 이제 준비(0.5초) 동안 색이 바뀌므로 물러설 시간이 있다.
   */
  const inRange = enemies.some((enemy) => {
    if (enemy.strikePhase !== "active") return false;
    /*
     * 넉백으로 날아가거나 쓰러진 적에게 맞으면 억울하다.
     *
     * `stepEnemyStrike`가 그 상태에서 휘두르던 것을 접으므로 실제로는 여기까지
     * 오지 않는다. 그래도 두 번 막는다 — 피해 판정은 억울함이 결과로 남는
     * 자리라, 위쪽 한 곳이 바뀌면 조용히 되살아난다.
     */
    if (enemy.mood !== "chase") return false;
    return Math.hypot(enemy.x - playerX, enemy.z - playerZ) <= ENEMY_STRIKE.range;
  });

  if ((inRange || rangedHits > 0) && invulnerableRemaining <= 0) {
    // 여러 발이 한 프레임에 닿아도 한 번만 깎는다 — 무적 시간의 의미가 없어진다.
    const damage = inRange ? PLAYER_COMBAT.contactDamage : PROJECTILE_DAMAGE;
    const hp = Math.max(0, state.hp - damage);
    return {
      state: {
        hp,
        invulnerableRemaining: PLAYER_COMBAT.invulnerableSeconds,
        sinceHitSeconds: 0,
        downed: hp <= 0,
        respawnRemaining: hp <= 0 ? PLAYER_COMBAT.respawnSeconds : 0,
      },
      struck: true,
      respawned: false,
    };
  }

  // 한동안 맞지 않으면 천천히 회복한다. 회복이 없으면 이동 중심 게임에서
  // 결국 모두가 최저 체력으로 돌아다니게 된다.
  const waited = sinceHitSeconds >= PLAYER_COMBAT.regenDelaySeconds;
  const regened = waited ? PLAYER_COMBAT.regenPerSecond * regenScale * dt : 0;
  const hp = Math.min(PLAYER_COMBAT.maxHp, state.hp + regened + healBonus);

  return {
    state: { ...state, hp, invulnerableRemaining, sinceHitSeconds },
    struck: false,
    respawned: false,
  };
}
