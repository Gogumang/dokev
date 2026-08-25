/**
 * 적의 원거리 공격 — 순수 함수.
 *
 * 근접 로봇만 있으면 전투가 "달려와서 부딪힌다" 한 가지로 끝난다. 멀리서
 * 쏘는 적이 섞이면 플레이어가 자리를 옮길 이유가 생긴다 — 이 게임의 중심인
 * 이동이 전투 안에서도 쓰인다.
 *
 * three.js에 의존하지 않는다. 렌더러 없이 궤적과 명중을 검증할 수 있어야 한다.
 *
 * 아래쪽 절반은 **플레이어의 탄**이다 — 딱총(`weapons.ts`)이 쏘고 로봇과
 * 대장을 맞힌다. 나는 규칙이 같으므로 한 파일에 둔다.
 */

import type { BoltSpec } from "@/game/combat/weapons";

export const PROJECTILE = {
  /** 날아가는 속도(m/s). 달리기(7)보다 빨라야 도망만으로는 못 피한다 */
  speed: 13,
  /**
   * 수명(초). 사거리는 speed × lifeSeconds = 약 21m다.
   * 적 인지 반경(16m)보다 조금 길게 잡아 도망치는 등에도 닿게 한다.
   */
  lifeSeconds: 1.6,
  /** 발사 높이(m) — 로봇 가슴 높이 */
  spawnHeight: 1.15,
  /** 명중 판정 수평 반경(m) */
  hitRadius: 0.55,
  /**
   * 명중 판정 높이 폭(m).
   *
   * 탄은 수평으로만 날아간다(포물선 아님) — 점프하면 아래로 지나간다는
   * 규칙이 눈으로 분명해야 피하는 재미가 생긴다.
   *
   * **1.0에서 0.8로 낮췄다.** 계산해 보니 1.0에서는 점프해서 판정 위에
   * 머무는 시간이 0.23초뿐이었다 — 사람 반응 시간(0.2~0.3초)보다 짧아
   * "탄을 보고 뛰기"가 사실상 불가능했다. 0.8이면 0.34초로 늘어난다.
   * 탄은 반지름 0.22의 작은 구슬이라 ±0.8도 여전히 후한 판정이다.
   * (`tests/tuningRelations.test.ts`가 이 관계를 지킨다)
   */
  hitHeight: 0.8,
  /** 동시에 존재할 수 있는 최대 수. 넘으면 가장 오래된 것부터 버린다 */
  maxLive: 24,
  /** 한 발이 깎는 체력 */
  damage: 1,
} as const;

export interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  /** 남은 수명(초) */
  life: number;
}

/**
 * 한 발 쏜다.
 *
 * 조준은 쏘는 순간의 위치로 고정한다 — 유도탄이면 피할 방법이 없다.
 */
export function fireProjectile(
  list: readonly Projectile[],
  fromX: number,
  fromZ: number,
  towardX: number,
  towardZ: number,
): Projectile[] {
  const dx = towardX - fromX;
  const dz = towardZ - fromZ;
  const distance = Math.hypot(dx, dz);
  // 겹쳐 선 상태에서는 방향을 정할 수 없다. 쏘지 않는 편이 낫다.
  if (distance < 1e-4) return [...list];

  const bolt: Projectile = {
    x: fromX,
    y: PROJECTILE.spawnHeight,
    z: fromZ,
    vx: (dx / distance) * PROJECTILE.speed,
    vz: (dz / distance) * PROJECTILE.speed,
    life: PROJECTILE.lifeSeconds,
  };

  // 오래된 것부터 밀어내 상한을 지킨다. 상한이 없으면 사수가 많을 때
  // 인스턴스 버퍼를 넘긴다.
  const kept =
    list.length >= PROJECTILE.maxLive ? list.slice(list.length - PROJECTILE.maxLive + 1) : list;
  return [...kept, bolt];
}

export interface ProjectileStep {
  projectiles: Projectile[];
  /** 이번 프레임에 플레이어를 맞힌 발 수 */
  hits: number;
}

/**
 * 탄을 한 프레임 진행하고 명중을 판정한다.
 *
 * 맞은 탄과 수명이 다한 탄은 목록에서 사라진다 — 관통하면 한 발에 여러 번
 * 맞는다.
 */
export function stepProjectiles(
  list: readonly Projectile[],
  dt: number,
  playerX: number,
  playerY: number,
  playerZ: number,
  /**
   * 그 자리가 벽인지. 주지 않으면 탄이 벽을 통과한다.
   *
   * 벽 뒤에 숨는 것이 통하지 않으면 은신(그을음)도 이동도 의미가 없어진다.
   */
  isBlocked?: (x: number, z: number) => boolean,
): ProjectileStep {
  const projectiles: Projectile[] = [];
  let hits = 0;

  // 플레이어의 가슴 높이. 발밑 기준으로 재면 점프해도 계속 맞는다.
  const chestY = playerY + 0.9;

  for (const bolt of list) {
    const life = bolt.life - dt;
    if (life <= 0) continue;

    const moved: Projectile = {
      ...bolt,
      x: bolt.x + bolt.vx * dt,
      z: bolt.z + bolt.vz * dt,
      life,
    };

    // 벽에 닿으면 사라진다. 관통하면 숨을 곳이 없다.
    if (isBlocked?.(moved.x, moved.z)) continue;

    const horizontal = Math.hypot(moved.x - playerX, moved.z - playerZ);
    if (horizontal <= PROJECTILE.hitRadius && Math.abs(moved.y - chestY) <= PROJECTILE.hitHeight) {
      hits += 1;
      continue;
    }
    projectiles.push(moved);
  }

  return { projectiles, hits };
}

/* ------------------------------------------------------------------ *
 * 플레이어의 탄
 *
 * 위쪽(적 → 플레이어)과 방향이 반대다. 맞힐 대상이 하나가 아니라 여럿이고,
 * 발마다 **자기 피해와 판정 반경을 들고 다닌다** — 쏜 뒤에 무기를 바꿔도
 * 날아가던 딱총 탄이 갑자기 망치 피해로 변하면 안 된다.
 * ------------------------------------------------------------------ */

/** 무엇을 맞힐 수 있는가. 위치와 판정 반경만 있으면 된다 — 적이든 대장이든 */
export interface BoltTarget {
  x: number;
  z: number;
  radius: number;
}

/** 날아가는 중인 플레이어의 탄 */
export interface PlayerBolt extends Projectile {
  /** 탄 자체의 판정 반경(m). 표적 반경과 더해 쓴다 */
  radius: number;
  /** 맞으면 깎는 체력 */
  damage: number;
  /** 뒤에 무지개 자국을 남기는지. 무기가 정한다(`BoltSpec.rainbow`) */
  rainbow: boolean;
}

/** 동시에 떠 있을 수 있는 플레이어 탄 수. 후딜이 있어 많이 쌓이지 않는다 */
export const PLAYER_BOLT_MAX = 12;

/** 이번 프레임에 무엇이 맞았는가 */
export interface BoltHit {
  /** 맞은 표적의 인덱스 */
  target: number;
  damage: number;
  /** 맞은 자리. 넉백 방향과 파티클이 쓴다 */
  x: number;
  z: number;
}

export interface PlayerBoltStep {
  bolts: PlayerBolt[];
  hits: BoltHit[];
}

/**
 * 바라보는 쪽으로 한 발 쏜다.
 *
 * 조준을 표적이 아니라 **방향**으로 잡는다. 가장 가까운 적을 자동으로 겨누면
 * 원거리가 근접보다 쉬워지고, 그러면 무기를 고를 이유가 사라진다.
 */
export function fireWeaponBolt(
  list: readonly PlayerBolt[],
  fromX: number,
  fromZ: number,
  /** 바라보는 방향(rad). 캐릭터의 facing과 같은 기준이다 */
  facing: number,
  spec: BoltSpec,
  damage: number,
): PlayerBolt[] {
  const bolt: PlayerBolt = {
    x: fromX,
    y: spec.spawnHeight,
    z: fromZ,
    vx: Math.sin(facing) * spec.speed,
    vz: Math.cos(facing) * spec.speed,
    life: spec.lifeSeconds,
    radius: spec.hitRadius,
    damage,
    rainbow: spec.rainbow === true,
  };

  // 오래된 것부터 밀어낸다. 상한이 없으면 인스턴스 버퍼를 넘긴다.
  const kept =
    list.length >= PLAYER_BOLT_MAX ? list.slice(list.length - PLAYER_BOLT_MAX + 1) : list;
  return [...kept, bolt];
}

/**
 * 플레이어의 탄을 한 프레임 진행하고 명중을 판정한다.
 *
 * 맞은 탄과 수명이 다한 탄, 벽에 닿은 탄은 목록에서 사라진다 — 관통하면 한
 * 발이 줄지어 선 로봇을 통째로 눕힌다.
 *
 * 표적 순서는 부르는 쪽이 정한다. 인덱스를 그대로 돌려주므로, 적 뒤에 대장을
 * 붙여 넘기면 한 번의 판정으로 둘 다 본다.
 */
export function stepPlayerBolts(
  list: readonly PlayerBolt[],
  dt: number,
  targets: readonly BoltTarget[],
  /** 그 자리가 벽인지. 주지 않으면 탄이 벽을 통과한다 */
  isBlocked?: (x: number, z: number) => boolean,
): PlayerBoltStep {
  const bolts: PlayerBolt[] = [];
  const hits: BoltHit[] = [];

  for (const bolt of list) {
    const life = bolt.life - dt;
    if (life <= 0) continue;

    const moved: PlayerBolt = {
      ...bolt,
      x: bolt.x + bolt.vx * dt,
      z: bolt.z + bolt.vz * dt,
      life,
    };

    if (isBlocked?.(moved.x, moved.z)) continue;

    /*
     * 가장 가까운 표적 하나만 맞힌다. 판정 안에 둘이 겹쳐 있어도 한 발은
     * 한 번만 들어가야 한다 — 그렇지 않으면 몰려 있는 무리에 쏠 때 딱총이
     * 광역 무기가 된다.
     */
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const distance = Math.hypot(moved.x - target.x, moved.z - target.z);
      if (distance > target.radius + moved.radius) continue;
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      bestIndex = index;
    }

    if (bestIndex >= 0) {
      hits.push({ target: bestIndex, damage: moved.damage, x: moved.x, z: moved.z });
      continue;
    }

    bolts.push(moved);
  }

  return { bolts, hits };
}
