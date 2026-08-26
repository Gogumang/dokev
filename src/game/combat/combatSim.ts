/**
 * 전투 시뮬레이션 — 순수 함수.
 *
 * TRAILER_FEATURE_ANALYSIS 3.4절: 전투는 무겁거나 잔인하지 않고 장난감처럼
 * 유쾌해야 한다. 그래서 적은 로봇이고, 맞으면 피가 아니라 색종이가 튀며,
 * 쓰러져도 잠시 뒤 다시 일어난다. 죽음이 아니라 놀이다.
 *
 * three.js와 React에 의존하지 않는다 — 렌더러 없이 테스트할 수 있어야 한다.
 */

import { advanceAttackPhase, type AttackPhase } from "@/game/combat/attackPhase";
import { WEAPONS, type Weapon } from "@/game/combat/weapons";
import { createSeededRandom, damp, rotateToward } from "@/game/core/mathx";

export const COMBAT_TUNING = {
  /** 적이 플레이어를 인지하는 거리(m) */
  aggroRadius: 16,
  /** 이 거리 안으로는 더 다가오지 않는다 — 겹쳐 서면 때릴 대상이 안 보인다 */
  standoffRadius: 1.6,
  enemySpeed: 3.1,
  enemyTurnRate: 3.2,
  /** 적 최대 체력. 두 대면 쓰러진다 */
  maxHp: 2,

  // 공격 주기와 피해는 **무기가 정한다**(`weapons.ts`).

  /** 피격 시 밀려나는 속도(m/s) */
  knockbackSpeed: 9,
  /** 밀려난 뒤 속도가 줄어드는 비율 */
  knockbackDamping: 6,
  /** 피격 경직 시간(초) */
  hitStunSeconds: 0.3,
  /** 쓰러진 뒤 다시 일어나기까지(초) */
  downSeconds: 3.5,

  /**
   * 스폰 지점 주변에 적을 두지 않는 반경(m).
   *
   * 인지 반경(16)보다 넓어야 한다. 좁으면 시작하자마자 로봇이 달려와,
   * 조작을 배우기도 전에 체력이 깎인다.
   */
  spawnClearanceRadius: 26,
} as const;

/**
 * 적의 공격 타이밍.
 *
 * 플레이어(windup 0.08초)와 값을 나눠 두는 이유: 플레이어의 준비 시간은
 * 자기가 누른 버튼이라 짧아야 반응이 즉각적으로 느껴지지만, **적의 준비
 * 시간은 경고다.** 이만큼은 보고 물러설 수 있어야 "안 싸웠는데 죽었다"가
 * 되지 않는다 — 예전에는 이 단계 자체가 없어서 가까이 서 있기만 해도
 * 체력이 깎였다.
 */
export const ENEMY_STRIKE = {
  windupSeconds: 0.5,
  activeSeconds: 0.16,
  /** 후딜. 이 동안 다시 때리지 못한다 */
  recoverySeconds: 0.95,
  /**
   * 적이 때릴 수 있는 거리(m). 접근 정지 거리보다 살짝 넓게 둔다.
   *
   * `PLAYER_COMBAT`에 있던 값이다. 맞는 쪽을 `playerCombat.ts`로 떼어 내면서
   * 옮겼다 — **때리는 쪽의 사거리**라 적 옆에 있어야 맞고, 저쪽에 두면
   * 적을 굴리는 이 파일이 맞는 쪽을 import해 순환이 된다.
   */
  range: COMBAT_TUNING.standoffRadius + 0.8,
} as const;

/**
 * 사수 로봇 설정.
 *
 * 전부 원거리로 만들지 않는다 — 다 멀리 서 있으면 근접 공격이 쓸모없어지고
 * 플레이어가 계속 쫓아다녀야 한다. 넷 중 하나만 사수로 둔다.
 */
export const GUNNER = {
  /** 넷째마다 사수 */
  everyNth: 4,
  /** 이 거리보다 가까우면 물러선다(m) */
  minDistance: 6,
  /** 이 거리보다 멀면 다가온다(m) */
  maxDistance: 11,
  /** 물러설 때의 속도 배율. 뒷걸음질이 추격보다 느려야 붙을 수 있다 */
  retreatSpeedScale: 0.7,
  /** 발사 간격(초) */
  fireIntervalSeconds: 2.2,
  /**
   * 조준이 이 각도(rad) 안으로 들어와야 쏜다.
   *
   * 몸을 돌리는 중에 등 뒤로 쏘면 어디서 날아온 탄인지 알 수 없다.
   */
  aimHalfAngle: 0.35,
} as const;

// 무기를 안 넘긴 호출이 쓰는 값. **제품 호출이 넘기는지**는 `silentDefaults`가
// 본다 — 빠뜨리면 무기를 바꿔도 조용히 시작 무기의 주기로 때린다.
const DEFAULT_WEAPON_PROFILE = WEAPONS.bow;

/** 시야 확인 간격(m). 가장 얇은 건물보다 촘촘해야 한다 */
const SIGHT_STEP_METERS = 1.5;

/** 빈 자리를 찾는 최대 시도 횟수 */
const SPAWN_ATTEMPTS = 24;

export type EnemyKind = "chaser" | "gunner";

/**
 * 벽을 피해 움직인다.
 *
 * 축을 나눠 시도한다 — 정면이 막혀도 옆으로는 갈 수 있어야 모서리에서
 * 붙잡히지 않는다. 둘 다 막히면 제자리다.
 *
 * 판정을 주지 않으면 그대로 통과한다. 예전 호출부의 동작을 바꾸지 않기 위해서다.
 */
function slideTo(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  isBlocked?: (x: number, z: number) => boolean,
): { x: number; z: number } {
  if (!isBlocked?.(toX, toZ)) return { x: toX, z: toZ };
  if (!isBlocked(toX, fromZ)) return { x: toX, z: fromZ };
  if (!isBlocked(fromX, toZ)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}

export type EnemyMood = "idle" | "chase" | "hit" | "down";

export interface EnemyState {
  /** 근접형인지 사수인지 */
  kind: EnemyKind;
  x: number;
  z: number;
  /** 바라보는 방향(yaw) */
  facing: number;
  mood: EnemyMood;
  hp: number;
  /** 넉백 속도. 경직 중에만 0이 아니다 */
  velocityX: number;
  velocityZ: number;
  /** 현재 상태가 끝나기까지 남은 시간(초) */
  timer: number;
  /** 걷는 흔들림 위상 */
  bobPhase: number;
  /** 다음 발사까지 남은 시간(초). 근접형에서는 쓰이지 않는다 */
  fireCooldown: number;
  /** 스폰 지점 — 쓰러진 뒤 여기로 돌아온다 */
  homeX: number;
  homeZ: number;
  /** 공격 단계. **active일 때만** 플레이어를 때린다 */
  strikePhase: AttackPhase;
  /** 현재 공격 단계가 끝나기까지 남은 시간(초) */
  strikeTimer: number;
}

export interface AttackState {
  phase: AttackPhase;
  /** 현재 단계가 끝나기까지 남은 시간(초) */
  timer: number;
}

export function createAttackState(): AttackState {
  return { phase: "ready", timer: 0 };
}

/**
 * 적을 배치한다.
 *
 * 도로 위가 아니라 월드 전역에 흩어 둔다. 달리는 길목마다 서 있으면
 * 이동이 전투에 계속 끊긴다 — 이 게임의 중심은 이동이다.
 */
export function createEnemies(
  count: number,
  halfExtent: number,
  seed = 0x51e1,
  /**
   * 그 자리가 막혀 있는지. 주지 않으면 아무 데나 생긴다.
   *
   * 없이 두었더니 24기 중 10기가 건물 안에서 생겼다 — 보이지도 않고 때릴 수도
   * 없는 로봇이라 퀘스트의 "3기 처치"를 방해한다.
   */
  isBlocked?: (x: number, z: number) => boolean,
  /**
   * 비워 둘 자리 — 보통 플레이어 스폰 지점이다.
   *
   * 없이 두었더니 시작 광장 옆에 로봇이 서 있었다. 조작 설명을 읽는 동안
   * 다가와 때리므로 "안 싸웠는데 죽는다"의 절반은 여기서 나왔다.
   */
  reserved?: { x: number; z: number; radius: number },
): EnemyState[] {
  const random = createSeededRandom(seed);
  const enemies: EnemyState[] = [];
  const margin = 12;

  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let z = 0;
    /*
     * 거절 샘플링. 시도 횟수를 제한해 두어야 한다 — 도시가 꽉 차 있으면
     * 무한 루프가 되고, 그건 화면이 아예 안 뜨는 실패다.
     * 다 실패하면 마지막 후보를 그냥 쓴다. 한 기가 벽에 끼는 편이 낫다.
     */
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
      x = (random() * 2 - 1) * (halfExtent - margin);
      z = (random() * 2 - 1) * (halfExtent - margin);
      if (isBlocked?.(x, z)) continue;
      if (reserved && Math.hypot(x - reserved.x, z - reserved.z) < reserved.radius) continue;
      break;
    }
    enemies.push({
      // 사수를 규칙적으로 섞는다. 난수로 고르면 판마다 사수가 0기일 수 있다.
      kind: i % GUNNER.everyNth === GUNNER.everyNth - 1 ? "gunner" : "chaser",
      x,
      z,
      facing: random() * Math.PI * 2,
      mood: "idle",
      hp: COMBAT_TUNING.maxHp,
      velocityX: 0,
      velocityZ: 0,
      timer: 0,
      bobPhase: random() * Math.PI * 2,
      // 쿨다운을 흩어 둔다. 같은 값이면 사수 전원이 동시에 일제사격한다.
      fireCooldown: random() * GUNNER.fireIntervalSeconds,
      homeX: x,
      homeZ: z,
      strikePhase: "ready",
      strikeTimer: 0,
    });
  }
  return enemies;
}

/**
 * 공격 상태를 한 프레임 진행한다.
 *
 * 단계를 나눈 이유: 판정이 아주 짧은 준비 뒤에 살아나야 휘두르는 동작과
 * 타이밍이 맞는다. 후딜이 없으면 연타해 무한히 때릴 수 있다.
 */
export function stepAttack(
  state: AttackState,
  requested: boolean,
  dt: number,
  weapon: Weapon = DEFAULT_WEAPON_PROFILE,
): AttackState {
  // 쉬고 있고 요청도 없으면 같은 객체를 돌려준다 — 매 프레임 새 객체를 만들 이유가 없다.
  if (state.phase === "ready" && !requested) return state;

  const next = advanceAttackPhase(state.phase, state.timer, requested, dt, weapon.timing);
  if (next.phase === "ready") return createAttackState();

  return { phase: next.phase, timer: next.timer };
}

/**
 * 휘두르기 시작 후 지난 시간(초). 쉬고 있으면 null.
 *
 * 캐릭터 자세가 이 값 하나로 동작을 만든다 — 단계 이름을 넘기면 자세 쪽이
 * 전투 규칙을 알아야 하고, 단계 길이를 바꿀 때 두 곳을 고쳐야 한다.
 */
export function attackElapsed(
  state: AttackState,
  weapon: Weapon = DEFAULT_WEAPON_PROFILE,
): number | null {
  const { windupSeconds, activeSeconds, recoverySeconds } = weapon.timing;
  if (state.phase === "ready") return null;
  if (state.phase === "windup") return windupSeconds - state.timer;
  if (state.phase === "active") return windupSeconds + (activeSeconds - state.timer);
  return windupSeconds + activeSeconds + (recoverySeconds - state.timer);
}

/** 공격 판정이 살아 있는지. */
export function isAttackActive(state: AttackState): boolean {
  return state.phase === "active";
}

/**
 * 적 하나를 한 프레임 진행한다.
 *
 * 상태 순서가 곧 우선순위다 — 쓰러진 적은 플레이어가 옆에 있어도 일어나지
 * 않고, 경직 중인 적은 추격을 재개하지 않는다.
 */
export function stepEnemy(
  enemy: EnemyState,
  playerX: number,
  playerZ: number,
  dt: number,
  /**
   * 인지 반경 배율. 동료 능력이 1 미만으로 낮추면 로봇이 늦게 알아본다.
   * 기본 1이라 능력을 모르는 호출부는 그대로 둔다.
   */
  aggroScale = 1,
  /**
   * 그 자리가 벽인지. 주지 않으면 벽을 통과한다.
   *
   * 없이 두었더니 로봇이 건물을 뚫고 걸어 나왔다. 추격 경로에 건물이 있으면
   * 벽에서 튀어나오는 것처럼 보인다.
   */
  isBlocked?: (x: number, z: number) => boolean,
): EnemyState {
  const timer = enemy.timer - dt;
  const fireCooldown = Math.max(0, enemy.fireCooldown - dt);

  if (enemy.mood === "down") {
    if (timer > 0) return { ...enemy, timer };
    // 다시 일어날 때는 스폰 지점으로 돌려보낸다. 쓰러진 자리에 계속 쌓이면
    // 플레이어 주변만 붐비고 나머지 도시가 비어 버린다.
    return {
      ...enemy,
      x: enemy.homeX,
      z: enemy.homeZ,
      mood: "idle",
      hp: COMBAT_TUNING.maxHp,
      velocityX: 0,
      velocityZ: 0,
      timer: 0,
      // 일어나자마자 쏘면 부활이 반격처럼 느껴진다. 한 박자 쉬게 한다.
      fireCooldown: GUNNER.fireIntervalSeconds,
    };
  }

  if (enemy.mood === "hit") {
    // 경직 중에는 넉백 속도로만 밀려난다.
    const velocityX = damp(enemy.velocityX, 0, COMBAT_TUNING.knockbackDamping, dt);
    const velocityZ = damp(enemy.velocityZ, 0, COMBAT_TUNING.knockbackDamping, dt);
    // 넉백도 벽을 뚫지 않는다 — 때려서 건물 안으로 밀어 넣으면 꺼낼 방법이 없다.
    const pushed = slideTo(
      enemy.x,
      enemy.z,
      enemy.x + velocityX * dt,
      enemy.z + velocityZ * dt,
      isBlocked,
    );
    const moved: EnemyState = {
      ...enemy,
      x: pushed.x,
      z: pushed.z,
      velocityX,
      velocityZ,
      timer,
      fireCooldown,
    };
    if (timer > 0) return moved;
    return { ...moved, mood: "chase", timer: 0 };
  }

  const dx = playerX - enemy.x;
  const dz = playerZ - enemy.z;
  const distance = Math.hypot(dx, dz);

  if (distance > COMBAT_TUNING.aggroRadius * aggroScale) {
    return {
      ...enemy,
      mood: "idle",
      timer: 0,
      fireCooldown,
      bobPhase: enemy.bobPhase + dt * 1.6,
    };
  }

  const desiredFacing = Math.atan2(dx, dz);
  const facing = rotateToward(enemy.facing, desiredFacing, COMBAT_TUNING.enemyTurnRate * dt);

  /*
   * 사수는 거리를 유지한다 — 붙어 버리면 근접형과 구분되지 않고, 플레이어가
   * 자리를 옮길 이유도 사라진다. 가까우면 물러서고 멀면 다가온다.
   */
  if (enemy.kind === "gunner") {
    // 겹쳐 서면 방향을 정할 수 없다. 제자리에서 방향만 맞춘다.
    if (distance < 1e-4) {
      return { ...enemy, facing, mood: "chase", timer: 0, fireCooldown };
    }
    const direction =
      distance < GUNNER.minDistance
        ? -GUNNER.retreatSpeedScale
        : distance > GUNNER.maxDistance
          ? 1
          : 0;
    const gunnerStep = COMBAT_TUNING.enemySpeed * dt * direction;
    const moved = slideTo(
      enemy.x,
      enemy.z,
      enemy.x + (dx / distance) * gunnerStep,
      enemy.z + (dz / distance) * gunnerStep,
      isBlocked,
    );
    return {
      ...enemy,
      x: moved.x,
      z: moved.z,
      facing,
      mood: "chase",
      timer: 0,
      fireCooldown,
      bobPhase: enemy.bobPhase + dt * (direction === 0 ? 2.4 : 6),
    };
  }

  // 사거리 안쪽이면 방향만 맞추고 멈춘다.
  if (distance <= COMBAT_TUNING.standoffRadius) {
    return {
      ...enemy,
      mood: "chase",
      facing,
      timer: 0,
      fireCooldown,
      bobPhase: enemy.bobPhase + dt * 4,
    };
  }

  const step = COMBAT_TUNING.enemySpeed * dt;
  const moved = slideTo(
    enemy.x,
    enemy.z,
    enemy.x + (dx / distance) * step,
    enemy.z + (dz / distance) * step,
    isBlocked,
  );
  return {
    ...enemy,
    x: moved.x,
    z: moved.z,
    facing,
    mood: "chase",
    timer: 0,
    fireCooldown,
    bobPhase: enemy.bobPhase + dt * 8,
  };
}

/**
 * 적의 공격 단계를 한 프레임 진행한다.
 *
 * `stepEnemy`(이동·기분)와 나눠 둔 이유: 이동은 반환 지점이 여덟 곳이라
 * 거기에 공격 단계를 끼워 넣으면 한 갈래를 빠뜨려도 화면에서는 티가 안 난다.
 * 여기 한 곳에서 마지막에 얹는다.
 *
 * 호출부는 `stepEnemyStrike(stepEnemy(...), ...)`로 겹쳐 부른다.
 */
export function stepEnemyStrike(
  enemy: EnemyState,
  playerX: number,
  playerZ: number,
  dt: number,
): EnemyState {
  /*
   * 쓰러졌거나 맞고 밀리는 중이면 휘두르던 것을 접는다.
   *
   * 접지 않으면 넉백으로 날아가는 동안 판정이 살아나 **때린 쪽이 맞는다.**
   */
  if (enemy.mood === "down" || enemy.mood === "hit") {
    if (enemy.strikePhase === "ready") return enemy;
    return { ...enemy, strikePhase: "ready", strikeTimer: 0 };
  }

  const distance = Math.hypot(playerX - enemy.x, playerZ - enemy.z);
  const requested = enemy.mood === "chase" && distance <= ENEMY_STRIKE.range;

  const next = advanceAttackPhase(
    enemy.strikePhase,
    enemy.strikeTimer,
    requested,
    dt,
    ENEMY_STRIKE,
  );
  if (next.phase === enemy.strikePhase && next.timer === enemy.strikeTimer) return enemy;
  return { ...enemy, strikePhase: next.phase, strikeTimer: next.timer };
}

/**
 * 준비 동작이 얼마나 진행됐는지(0~1). 준비 중이 아니면 null.
 *
 * 렌더가 이 값으로 경고 색을 올린다 — 단계 이름을 넘기면 렌더가 전투 규칙을
 * 알아야 하고, 준비 시간을 바꿀 때 두 곳을 고쳐야 한다.
 */
export function strikeWindupProgress(enemy: EnemyState): number | null {
  if (enemy.strikePhase === "windup") {
    return 1 - enemy.strikeTimer / ENEMY_STRIKE.windupSeconds;
  }
  // 판정이 살아 있는 동안은 경고를 최대로 유지한다 — 맞는 순간 색이 꺼지면 안 된다.
  if (enemy.strikePhase === "active") return 1;
  return null;
}

/**
 * 지금 쏠 수 있는 사수인지 판정한다.
 *
 * 쿨다운·거리·조준을 모두 만족해야 한다. 셋 중 하나라도 빠지면 등 뒤에서
 * 예고 없이 날아오는 탄이 생긴다.
 */
export function readyToFire(
  enemy: EnemyState,
  playerX: number,
  playerZ: number,
  /**
   * 시야가 막혔는지 확인할 판정. 주지 않으면 벽 너머로도 쏜다.
   *
   * 보이지도 않는 곳에서 날아오는 탄은 피할 방법이 없다.
   */
  isBlocked?: (x: number, z: number) => boolean,
): boolean {
  if (enemy.kind !== "gunner") return false;
  if (enemy.mood !== "chase") return false;
  if (enemy.fireCooldown > 0) return false;

  const dx = playerX - enemy.x;
  const dz = playerZ - enemy.z;
  const distance = Math.hypot(dx, dz);
  // 너무 붙으면 쏘지 않는다 — 코앞에서 맞으면 피할 여지가 없다.
  if (distance < COMBAT_TUNING.standoffRadius || distance > GUNNER.maxDistance + 2) return false;

  let delta = Math.atan2(dx, dz) - enemy.facing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) > GUNNER.aimHalfAngle) return false;

  return hasLineOfSight(enemy.x, enemy.z, playerX, playerZ, isBlocked);
}

/**
 * 두 점 사이가 뚫려 있는지 일정 간격으로 훑는다.
 *
 * 정확한 광선-상자 교차를 풀지 않는다. 건물이 이 간격보다 얇은 경우가 없고,
 * 사수는 프레임마다 쿨다운이 찼을 때만 이 검사를 한다 — 정확도보다 단순함이 낫다.
 */
function hasLineOfSight(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  isBlocked?: (x: number, z: number) => boolean,
): boolean {
  if (!isBlocked) return true;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  const steps = Math.ceil(distance / SIGHT_STEP_METERS);

  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (isBlocked(fromX + dx * t, fromZ + dz * t)) return false;
  }
  return true;
}

/** 발사 직후 쿨다운을 채운다. */
export function markFired(enemy: EnemyState): EnemyState {
  return { ...enemy, fireCooldown: GUNNER.fireIntervalSeconds };
}

/**
 * 한 대 맞은 적의 다음 상태.
 *
 * 탄이 맞았을 때 부르는 유일한 자리다. 예전에는 부채꼴 판정도 같이 썼는데,
 * 드는 무기가 활·광선총 둘뿐이 되면서 그쪽 경로가 사라졌다 — 넉백 계산이
 * 여기 한 곳에만 있다는 것은 그대로다.
 */
export function strikeEnemy(
  enemy: EnemyState,
  damage: number,
  /** 맞은 방향의 출처(플레이어나 탄의 자리). 여기서 멀어지는 쪽으로 밀린다 */
  fromX: number,
  fromZ: number,
  knockbackScale: number,
): EnemyState {
  const dx = enemy.x - fromX;
  const dz = enemy.z - fromZ;
  const distance = Math.max(1e-4, Math.hypot(dx, dz));
  const hp = enemy.hp - damage;
  const isDown = hp <= 0;
  // 쓰러질 때 더 크게 날아간다. 마지막 한 방이 시원해야 한다.
  // 무기 무게가 곱해진다 — 센 것에 맞고 살짝 밀리면 눈과 수치가 따로 논다.
  const knockback = COMBAT_TUNING.knockbackSpeed * knockbackScale * (isDown ? 1.6 : 1);

  return {
    ...enemy,
    hp,
    mood: isDown ? "down" : "hit",
    timer: isDown ? COMBAT_TUNING.downSeconds : COMBAT_TUNING.hitStunSeconds,
    velocityX: (dx / distance) * knockback,
    velocityZ: (dz / distance) * knockback,
  };
}
