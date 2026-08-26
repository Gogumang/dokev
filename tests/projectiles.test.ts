import { describe, expect, it } from "vitest";

import {
  COMBAT_TUNING,
  createEnemies,
  GUNNER,
  markFired,
  readyToFire,
  stepEnemy,
  type EnemyState,
} from "@/game/combat/combatSim";
import { fireProjectile, PROJECTILE, stepProjectiles } from "@/game/combat/projectiles";
import {
  fireWeaponBolt,
  PLAYER_BOLT_MAX,
  stepPlayerBolts,
  type PlayerBolt,
} from "@/game/combat/projectiles";
import { WEAPONS } from "@/game/combat/weapons";

function makeGunner(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    kind: "gunner",
    x: 0,
    z: 0,
    facing: 0,
    mood: "chase",
    hp: COMBAT_TUNING.maxHp,
    velocityX: 0,
    velocityZ: 0,
    timer: 0,
    bobPhase: 0,
    fireCooldown: 0,
    strikePhase: "ready",
    strikeTimer: 0,
    homeX: 0,
    homeZ: 0,
    ...overrides,
  };
}

describe("fireProjectile", () => {
  it("목표 방향으로 정해진 속도로 날아간다", () => {
    // +z 방향 8m 앞
    const [bolt] = fireProjectile([], 0, 0, 0, 8);

    expect(bolt.vz).toBeCloseTo(PROJECTILE.speed, 5);
    expect(bolt.vx).toBeCloseTo(0, 5);
    expect(bolt.y).toBe(PROJECTILE.spawnHeight);
  });

  it("겹쳐 선 상태에서는 쏘지 않는다", () => {
    // 방향을 정할 수 없다
    expect(fireProjectile([], 3, 3, 3, 3)).toHaveLength(0);
  });

  it("상한을 넘으면 가장 오래된 탄을 버린다", () => {
    let list = fireProjectile([], 0, 0, 0, 1);
    const oldest = list[0];
    for (let i = 0; i < PROJECTILE.maxLive + 5; i += 1) {
      list = fireProjectile(list, i, 0, i, 1);
    }

    expect(list.length, `length was: ${list.length}`).toBe(PROJECTILE.maxLive);
    expect(list).not.toContain(oldest);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const original = fireProjectile([], 0, 0, 0, 1);
    fireProjectile(original, 0, 0, 0, 1);
    expect(original).toHaveLength(1);
  });
});

describe("stepProjectiles", () => {
  it("서 있는 플레이어를 맞힌다", () => {
    // 1m 앞에서 플레이어를 향해 쏜 탄은 곧 닿는다
    const list = fireProjectile([], 0, -1, 0, 0);
    const result = stepProjectiles(list, 0.1, 0, 0, 0);

    expect(result.hits, `hits was: ${result.hits}`).toBe(1);
    expect(result.projectiles, "맞은 탄은 사라져야 한다").toHaveLength(0);
  });

  it("점프하면 아래로 지나간다", () => {
    // 이 규칙이 깨지면 공중에서 피할 방법이 없다
    const list = fireProjectile([], 0, -1, 0, 0);
    const result = stepProjectiles(list, 0.1, 0, 3, 0);

    expect(result.hits, `hits was: ${result.hits}`).toBe(0);
    expect(result.projectiles).toHaveLength(1);
  });

  it("수명이 다하면 사라진다", () => {
    const list = fireProjectile([], 0, 0, 0, 1);
    const result = stepProjectiles(list, PROJECTILE.lifeSeconds + 0.01, 999, 0, 999);

    expect(result.projectiles).toHaveLength(0);
    expect(result.hits).toBe(0);
  });

  it("빗나간 탄은 계속 날아간다", () => {
    const list = fireProjectile([], 0, 0, 0, 10);
    const result = stepProjectiles(list, 0.2, 50, 0, 50);

    const moved = result.projectiles[0];
    expect(moved.z, `z was: ${moved.z}`).toBeCloseTo(PROJECTILE.speed * 0.2, 4);
    expect(moved.life).toBeLessThan(PROJECTILE.lifeSeconds);
  });

  it("한 번에 여러 발이 맞을 수 있다", () => {
    let list = fireProjectile([], 0, -1, 0, 0);
    list = fireProjectile(list, 0, 1, 0, 0);
    expect(stepProjectiles(list, 0.1, 0, 0, 0).hits).toBe(2);
  });
});

describe("readyToFire", () => {
  it("조준·거리·쿨다운이 맞으면 쏜다", () => {
    expect(readyToFire(makeGunner(), 0, 8)).toBe(true);
  });

  it("근접형은 쏘지 않는다", () => {
    expect(readyToFire(makeGunner({ kind: "chaser" }), 0, 8)).toBe(false);
  });

  it("쿨다운이 남아 있으면 쏘지 않는다", () => {
    expect(readyToFire(makeGunner({ fireCooldown: 0.5 }), 0, 8)).toBe(false);
  });

  it("등 뒤로는 쏘지 않는다", () => {
    // 어디서 날아온 탄인지 알 수 없으면 피할 수 없다
    expect(readyToFire(makeGunner({ facing: Math.PI }), 0, 8)).toBe(false);
  });

  it("너무 가까우면 쏘지 않는다", () => {
    expect(readyToFire(makeGunner(), 0, 1)).toBe(false);
  });

  it("사거리를 벗어나면 쏘지 않는다", () => {
    expect(readyToFire(makeGunner(), 0, GUNNER.maxDistance + 5)).toBe(false);
  });

  it("추격 중이 아니면 쏘지 않는다", () => {
    expect(readyToFire(makeGunner({ mood: "hit" }), 0, 8)).toBe(false);
    expect(readyToFire(makeGunner({ mood: "down" }), 0, 8)).toBe(false);
  });

  it("발사 후에는 쿨다운이 찬다", () => {
    expect(markFired(makeGunner()).fireCooldown).toBe(GUNNER.fireIntervalSeconds);
  });
});

describe("사수 이동", () => {
  it("가까우면 물러선다", () => {
    // Arrange — 플레이어 바로 앞(2m)
    const gunner = makeGunner({ z: -2 });

    // Act
    const next = stepEnemy(gunner, 0, 0, 0.1);

    // Assert — 플레이어에서 멀어져야 한다
    expect(next.z, `z was: ${next.z}`).toBeLessThan(gunner.z);
  });

  it("멀면 다가온다", () => {
    const gunner = makeGunner({ z: -(GUNNER.maxDistance + 3) });
    const next = stepEnemy(gunner, 0, 0, 0.1);
    expect(next.z, `z was: ${next.z}`).toBeGreaterThan(gunner.z);
  });

  it("적정 거리에서는 제자리에 선다", () => {
    const between = (GUNNER.minDistance + GUNNER.maxDistance) / 2;
    const gunner = makeGunner({ z: -between });
    const next = stepEnemy(gunner, 0, 0, 0.1);

    expect(next.z, `z was: ${next.z}`).toBeCloseTo(gunner.z, 6);
  });

  it("근접형은 거리를 두지 않고 계속 붙는다", () => {
    const chaser = makeGunner({ kind: "chaser", z: -2 });
    const next = stepEnemy(chaser, 0, 0, 0.1);
    expect(next.z, `z was: ${next.z}`).toBeGreaterThan(chaser.z);
  });

  it("시간이 지나면 쿨다운이 줄어든다", () => {
    const gunner = makeGunner({ fireCooldown: 1, z: -8 });
    expect(stepEnemy(gunner, 0, 0, 0.25).fireCooldown).toBeCloseTo(0.75, 6);
  });

  it("겹쳐 서도 좌표가 NaN이 되지 않는다", () => {
    // 0으로 나누면 적이 화면에서 사라진다
    const next = stepEnemy(makeGunner(), 0, 0, 0.1);
    expect(Number.isFinite(next.x) && Number.isFinite(next.z)).toBe(true);
  });
});

describe("createEnemies", () => {
  it("사수를 섞어 배치한다", () => {
    const enemies = createEnemies(16, 100);
    const gunners = enemies.filter((e) => e.kind === "gunner");

    expect(gunners.length, `gunners: ${gunners.length}/16`).toBe(16 / GUNNER.everyNth);
  });

  it("쿨다운이 흩어져 있다 — 일제사격 방지", () => {
    const enemies = createEnemies(16, 100).filter((e) => e.kind === "gunner");
    const unique = new Set(enemies.map((e) => e.fireCooldown));
    expect(unique.size, `unique cooldowns: ${unique.size}`).toBeGreaterThan(1);
  });
});

describe("벽", () => {
  /** x가 3~7인 띠를 벽으로 본다 */
  const wall = (x: number) => x >= 3 && x <= 7;

  it("탄이 벽에 막혀 사라진다", () => {
    // 관통하면 숨을 곳이 없다
    const list = fireProjectile([], 0, 0, 20, 0);
    const result = stepProjectiles(list, 0.5, 100, 0, 100, (x) => wall(x));

    expect(result.projectiles, "벽을 지난 탄이 남아 있다").toHaveLength(0);
    expect(result.hits).toBe(0);
  });

  it("벽 앞까지는 날아간다", () => {
    const list = fireProjectile([], 0, 0, 20, 0);
    const result = stepProjectiles(list, 0.1, 100, 0, 100, (x) => wall(x));

    expect(result.projectiles, `x was: ${result.projectiles[0]?.x}`).toHaveLength(1);
    expect(result.projectiles[0].x).toBeLessThan(3);
  });

  it("판정을 주지 않으면 예전처럼 통과한다", () => {
    const list = fireProjectile([], 0, 0, 20, 0);
    expect(stepProjectiles(list, 0.5, 100, 0, 100).projectiles).toHaveLength(1);
  });
});

describe("사수의 시야", () => {
  const wall = (x: number) => x >= 3 && x <= 7;

  it("벽 너머로는 쏘지 않는다", () => {
    // 보이지도 않는 곳에서 날아오는 탄은 피할 방법이 없다
    const gunner = makeGunner({ x: 0, z: 0, facing: Math.PI / 2 });
    expect(readyToFire(gunner, 10, 0, (x) => wall(x))).toBe(false);
  });

  it("시야가 트여 있으면 쏜다", () => {
    const gunner = makeGunner({ x: 0, z: 0, facing: 0 });
    expect(readyToFire(gunner, 0, 8, (x) => wall(x))).toBe(true);
  });

  it("판정을 주지 않으면 예전처럼 쏜다", () => {
    // 기존 호출부의 동작을 바꾸지 않는다
    const gunner = makeGunner({ x: 0, z: 0, facing: Math.PI / 2 });
    expect(readyToFire(gunner, 10, 0)).toBe(true);
  });

  it("얇은 벽도 놓치지 않는다", () => {
    // 확인 간격보다 얇은 벽이 있으면 그 사이로 쏜다
    const gunner = makeGunner({ x: 0, z: 0, facing: Math.PI / 2 });
    const thin = (x: number) => x >= 4.9 && x <= 6.5;
    expect(readyToFire(gunner, 10, 0, thin)).toBe(false);
  });
});

/*
 * 플레이어의 탄 — 광선총.
 *
 * 「멀리서 맞는다」만 보면 원거리가 늘 이득이므로, 이 검사들은 **맞지 않아야
 * 할 때 안 맞는지**를 함께 본다(벽 뒤, 사거리 밖, 한 발에 둘).
 *
 * 예전에는 딱총으로 쟀다. 딱총이 은퇴하면서(드는 것은 활·광선총 둘뿐이다)
 * 표에서 사라졌고, 검사가 **없는 무기를 재고 있을 수는 없다.** 자리는 탄이
 * 12m/s로 날던 시절에 맞춰져 있었으므로, 광선총(30m/s)에서 **같은 자리에
 * 오도록 dt를 0.4배** 했다 — 재는 것은 속도가 아니라 판정 규칙이라 자리가
 * 같으면 뜻이 같다.
 */
describe("플레이어의 탄", () => {
  const SPEC = WEAPONS.beam.bolt;
  const DAMAGE = WEAPONS.beam.damage;

  function fire(facing: number, fromX = 0, fromZ = 0): PlayerBolt[] {
    return fireWeaponBolt([], fromX, fromZ, facing, SPEC, DAMAGE);
  }

  it("바라보는 쪽으로 나간다", () => {
    // facing 0은 +z다 — 캐릭터·카메라와 같은 기준이 아니면 등 뒤로 쏜다
    const [bolt] = fire(0);
    expect(bolt.vz, `vx=${bolt.vx}, vz=${bolt.vz}`).toBeGreaterThan(0);
    expect(Math.abs(bolt.vx), "옆으로 새어 나간다").toBeLessThan(1e-6);
  });

  it("자동으로 겨누지 않는다", () => {
    /*
     * 등 뒤의 적을 향해 휘어 날아가면 원거리가 근접보다 쉬워진다 — 무기를
     * 고를 이유가 사라진다. 방향만 보고 나간다.
     */
    const bolts = fire(0);
    const behind = [{ x: 0, z: -6, radius: 0.9 }];
    const step = stepPlayerBolts(bolts, 0.08, behind);
    expect(step.hits, "뒤에 있는 적이 맞았다").toEqual([]);
  });

  it("맞으면 사라진다 — 관통하면 한 발이 줄지어 선 로봇을 다 눕힌다", () => {
    const bolts = fire(0);
    const targets = [
      { x: 0, z: 2, radius: 0.9 },
      { x: 0, z: 3, radius: 0.9 },
    ];
    const step = stepPlayerBolts(bolts, 0.1, targets);

    expect(step.hits.length, `맞은 수 ${step.hits.length}`).toBe(1);
    expect(step.bolts, "맞고도 계속 날아간다").toEqual([]);
  });

  it("판정이 겹치면 탄에 가까운 쪽이 맞는다", () => {
    /*
     * 목록 순서가 아니라 **거리**로 고른다. 순서로 고르면 뒤에 선 로봇이
     * 앞의 로봇을 통과해 맞는 것처럼 보인다. 일부러 먼 쪽을 먼저 넣는다.
     */
    const bolts = fire(0);
    const targets = [
      { x: 0, z: 3.4, radius: 1.2 },
      { x: 0, z: 2.5, radius: 1.2 },
    ];
    // 0.08초 뒤 탄은 z=2.4다 — 둘째(2.5)가 0.1m, 첫째(3.4)가 1.0m 떨어져 있다
    const step = stepPlayerBolts(bolts, 0.08, targets);
    expect(step.hits[0]?.target, "탄에서 먼 쪽이 맞았다").toBe(1);
  });

  it("벽에 막힌다", () => {
    // 벽 뒤에 숨는 것이 통하지 않으면 은신도 이동도 의미가 없어진다
    const bolts = fire(0);
    const wall = (_x: number, z: number) => z > 1;
    const step = stepPlayerBolts(bolts, 0.1, [{ x: 0, z: 3, radius: 0.9 }], wall);

    expect(step.hits, "벽을 통과해 맞혔다").toEqual([]);
    expect(step.bolts, "벽에 닿고도 남아 있다").toEqual([]);
  });

  it("사거리를 넘기면 사라진다", () => {
    let bolts = fire(0);
    // 수명보다 조금 더 오래 굴린다. 표적은 두지 않는다
    for (let t = 0; t < SPEC.lifeSeconds + 0.2; t += 0.1) {
      bolts = stepPlayerBolts(bolts, 0.1, []).bolts;
    }
    expect(bolts, "수명이 다한 탄이 남아 있다").toEqual([]);
  });

  it("탄이 자기 피해를 들고 다닌다 — 쏜 뒤 무기를 바꿔도 그대로다", () => {
    /*
     * 피해를 표(`WEAPONS`)에서 그때그때 읽으면, 쏘고 나서 활로 바꾸는
     * 것만으로 날아가던 광선총 탄이 두 배로 아프다.
     */
    const bolts = fire(0);
    const step = stepPlayerBolts(bolts, 0.1, [{ x: 0, z: 2.5, radius: 0.9 }]);
    expect(step.hits[0]?.damage, "탄의 피해가 광선총 값이 아니다").toBe(DAMAGE);
  });

  it("상한을 넘게 쏘면 오래된 것부터 버린다", () => {
    let bolts: PlayerBolt[] = [];
    for (let i = 0; i < PLAYER_BOLT_MAX + 5; i += 1) {
      bolts = fireWeaponBolt(bolts, 0, 0, 0, SPEC, DAMAGE);
    }
    expect(bolts.length, `${bolts.length}발이 떠 있다`).toBeLessThanOrEqual(PLAYER_BOLT_MAX);
  });
});
