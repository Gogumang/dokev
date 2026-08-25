import { watchReads } from "./support/readsAll";
import { readCode } from "./support/source";

import { describe, expect, it } from "vitest";

import {
  type AttackState,
  COMBAT_TUNING,
  createAttackState,
  createEnemies,
  ENEMY_STRIKE,
  type EnemyState,
  isAttackActive,
  isInAttackArc,
  resolveHits,
  stepAttack,
  stepEnemy,
} from "@/game/combat/combatSim";
import {
  createPlayerCombat,
  isPlayerVulnerable,
  PLAYER_COMBAT,
  stepPlayerCombat,
} from "@/game/combat/playerCombat";
import { WEAPONS } from "@/game/combat/weapons";
import {
  consumeAttack,
  consumeRespawn,
  consumeSlam,
  projectAttackTiming,
  projectPlayerVitals,
  recordEnemyHits,
  type CombatSignals,
  type EnemyHitLink,
} from "@/game/combat/combatLink";

const FRAME = 1 / 60;

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    kind: "chaser",
    x: 0,
    z: 2,
    facing: 0,
    mood: "idle",
    hp: COMBAT_TUNING.maxHp,
    velocityX: 0,
    velocityZ: 0,
    timer: 0,
    bobPhase: 0,
    fireCooldown: 0,
    strikePhase: "ready",
    strikeTimer: 0,
    homeX: 0,
    homeZ: 2,
    ...overrides,
  };
}

/** 공격을 눌러 판정이 살아 있는 상태까지 진행시킨다. */
function swingToActive(): AttackState {
  let attack = stepAttack(createAttackState(), true, FRAME);
  let guard = 0;
  while (!isAttackActive(attack) && guard < 100) {
    attack = stepAttack(attack, false, FRAME);
    guard += 1;
  }
  return attack;
}

describe("createEnemies", () => {
  it("같은 시드면 같은 배치가 나온다", () => {
    expect(createEnemies(6, 90)).toEqual(createEnemies(6, 90));
  });

  it("월드 경계 안에 배치된다", () => {
    const halfExtent = 90;
    for (const enemy of createEnemies(30, halfExtent)) {
      expect(Math.abs(enemy.x), `x was: ${enemy.x}`).toBeLessThan(halfExtent);
      expect(Math.abs(enemy.z), `z was: ${enemy.z}`).toBeLessThan(halfExtent);
    }
  });
});

describe("stepAttack", () => {
  it("누르지 않으면 ready에 머무른다", () => {
    const result = stepAttack(createAttackState(), false, FRAME);
    expect(result.phase, `phase was: ${result.phase}`).toBe("ready");
  });

  it("windup → active → recovery → ready 순으로 진행한다", () => {
    // Arrange
    let attack = stepAttack(createAttackState(), true, FRAME);
    const seen: string[] = [attack.phase];

    // Act — 한 사이클을 충분히 돌린다
    for (let i = 0; i < 120; i += 1) {
      attack = stepAttack(attack, false, FRAME);
      if (seen[seen.length - 1] !== attack.phase) seen.push(attack.phase);
    }

    // Assert
    expect(seen, `phases were: ${seen.join(" → ")}`).toEqual([
      "windup",
      "active",
      "recovery",
      "ready",
    ]);
  });

  it("후딜 중에는 다시 공격이 시작되지 않는다", () => {
    // Arrange — recovery 단계까지 보낸다
    let attack = stepAttack(createAttackState(), true, FRAME);
    let guard = 0;
    while (attack.phase !== "recovery" && guard < 200) {
      attack = stepAttack(attack, false, FRAME);
      guard += 1;
    }

    // Act — 후딜 중 연타
    const spammed = stepAttack(attack, true, FRAME);

    // Assert — 연타로 무한히 때릴 수 있으면 안 된다
    expect(spammed.phase, `phase was: ${spammed.phase}`).toBe("recovery");
  });
});

describe("isInAttackArc", () => {
  it("정면 사거리 안이면 맞는다", () => {
    const enemy = makeEnemy({ x: 0, z: 1.5 });
    expect(isInAttackArc(enemy, 0, 0, 0)).toBe(true);
  });

  it("사거리 밖이면 빗나간다", () => {
    const enemy = makeEnemy({ x: 0, z: WEAPONS.bat.reachMeters + 1 });
    expect(isInAttackArc(enemy, 0, 0, 0)).toBe(false);
  });

  it("등 뒤는 빗나간다", () => {
    // 부채꼴 판정이 없으면 뒤에 있는 적까지 맞아 타격감이 사라진다
    const enemy = makeEnemy({ x: 0, z: -1.5 });
    expect(isInAttackArc(enemy, 0, 0, 0)).toBe(false);
  });
});

describe("원거리 무기의 근접 판정", () => {
  it("딱총은 코앞의 적도 부채꼴로 때리지 않는다", () => {
    /*
     * 원거리는 **탄으로만** 맞힌다. 걸러 두지 않으면 사거리 0이라 안전할
     * 것 같지만, 겹쳐 선 적(거리 0)은 각도를 못 정해 「맞은 것으로 본다」로
     * 빠진다 — 딱총을 들고 적에게 붙기만 해도 탄 없이 체력이 깎인다.
     */
    const enemies = [makeEnemy({ x: 0, z: 0.05 })];
    let attack = stepAttack(createAttackState(), true, FRAME, WEAPONS.popgun);
    // 판정이 살아 있는 구간까지 진행한다
    attack = stepAttack(attack, false, WEAPONS.popgun.timing.windupSeconds, WEAPONS.popgun);

    const resolution = resolveHits(enemies, attack, 0, 0, 0, WEAPONS.popgun);

    expect(resolution.struck, "탄 없이 맞았다").toEqual([]);
    expect(resolution.enemies[0].hp, "체력이 깎였다").toBe(enemies[0].hp);
  });

  it("같은 자리에서 방망이는 맞힌다 — 위 검사가 늘 통과하는 것이 아니다", () => {
    // 판정 자체가 죽어 있으면 위 검사는 아무것도 증명하지 않는다
    const enemies = [makeEnemy({ x: 0, z: 0.05 })];
    let attack = stepAttack(createAttackState(), true, FRAME, WEAPONS.bat);
    attack = stepAttack(attack, false, WEAPONS.bat.timing.windupSeconds, WEAPONS.bat);

    const resolution = resolveHits(enemies, attack, 0, 0, 0, WEAPONS.bat);
    expect(resolution.struck, "근접인데도 안 맞았다").toEqual([0]);
  });
});

describe("resolveHits", () => {
  it("판정이 살아 있지 않으면 아무도 맞지 않는다", () => {
    const enemies = [makeEnemy({ z: 1 })];
    const result = resolveHits(enemies, createAttackState(), 0, 0, 0);
    expect(result.struck, `struck was: ${JSON.stringify(result.struck)}`).toEqual([]);
  });

  it("한 번 휘두르면 같은 적을 한 번만 때린다", () => {
    // Arrange — 판정이 여러 프레임 살아 있다
    let attack = swingToActive();
    let enemies = [makeEnemy({ z: 1 })];
    let totalStruck = 0;

    // Act — 판정이 끝날 때까지 매 프레임 적용
    let guard = 0;
    while (isAttackActive(attack) && guard < 100) {
      const result = resolveHits(enemies, attack, 0, 0, 0);
      enemies = result.enemies;
      attack = stepAttack(result.attack, false, FRAME);
      totalStruck += result.struck.length;
      guard += 1;
    }

    // Assert — 기록이 없으면 한 번 휘둘러 서너 번 맞는다
    expect(totalStruck, `totalStruck was: ${totalStruck}`).toBe(1);
  });

  it("맞으면 체력이 줄고 뒤로 밀려난다", () => {
    // Arrange
    const enemies = [makeEnemy({ x: 0, z: 1.5 })];

    // Act
    const result = resolveHits(enemies, swingToActive(), 0, 0, 0);
    const hit = result.enemies[0];

    // Assert — 넉백은 플레이어 반대 방향(+z)이어야 한다
    expect(hit.hp, `hp was: ${hit.hp}`).toBe(COMBAT_TUNING.maxHp - 1);
    expect(hit.mood, `mood was: ${hit.mood}`).toBe("hit");
    expect(hit.velocityZ, `velocityZ was: ${hit.velocityZ}`).toBeGreaterThan(0);
  });

  it("체력이 다하면 쓰러진다", () => {
    const enemies = [makeEnemy({ x: 0, z: 1.5, hp: 1 })];
    const result = resolveHits(enemies, swingToActive(), 0, 0, 0);
    expect(result.enemies[0].mood, `mood was: ${result.enemies[0].mood}`).toBe("down");
  });

  it("이미 쓰러진 적은 다시 맞지 않는다", () => {
    const enemies = [makeEnemy({ x: 0, z: 1.5, mood: "down", hp: 0 })];
    const result = resolveHits(enemies, swingToActive(), 0, 0, 0);
    expect(result.struck, `struck was: ${JSON.stringify(result.struck)}`).toEqual([]);
  });
});

describe("stepEnemy", () => {
  it("인지 범위 밖이면 다가오지 않는다", () => {
    // Arrange
    const far = COMBAT_TUNING.aggroRadius + 10;
    const enemy = makeEnemy({ x: 0, z: far });

    // Act
    const result = stepEnemy(enemy, 0, 0, FRAME);

    // Assert
    expect(result.mood, `mood was: ${result.mood}`).toBe("idle");
    expect(result.z, `z was: ${result.z}`).toBe(far);
  });

  it("인지 범위 안이면 플레이어 쪽으로 다가온다", () => {
    // Arrange
    const enemy = makeEnemy({ x: 0, z: 10 });

    // Act
    const result = stepEnemy(enemy, 0, 0, FRAME);

    // Assert
    expect(result.mood, `mood was: ${result.mood}`).toBe("chase");
    expect(result.z, `z was: ${result.z}`).toBeLessThan(10);
  });

  it("가까이 오면 더 붙지 않는다", () => {
    // Arrange — 겹쳐 서면 때릴 대상이 안 보인다
    const enemy = makeEnemy({ x: 0, z: COMBAT_TUNING.standoffRadius * 0.8 });

    // Act
    const result = stepEnemy(enemy, 0, 0, FRAME);

    // Assert
    expect(result.z, `z was: ${result.z}`).toBeCloseTo(enemy.z, 6);
  });

  it("쓰러진 적은 플레이어가 옆에 있어도 추격을 재개하지 않는다", () => {
    const enemy = makeEnemy({ x: 0, z: 1, mood: "down", timer: COMBAT_TUNING.downSeconds });
    const result = stepEnemy(enemy, 0, 0, FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("down");
  });

  it("쓰러진 뒤 시간이 지나면 스폰 지점에서 다시 일어난다", () => {
    // Arrange — 맞고 멀리 밀려난 상태
    const enemy = makeEnemy({
      x: 40,
      z: 40,
      homeX: 5,
      homeZ: -5,
      mood: "down",
      hp: 0,
      timer: 0.001,
    });

    // Act
    const result = stepEnemy(enemy, 0, 0, FRAME);

    // Assert — 쓰러진 자리에 쌓이면 플레이어 주변만 붐빈다
    expect(result.mood, `mood was: ${result.mood}`).toBe("idle");
    expect(result.hp, `hp was: ${result.hp}`).toBe(COMBAT_TUNING.maxHp);
    expect(result.x, `x was: ${result.x}`).toBe(5);
    expect(result.z, `z was: ${result.z}`).toBe(-5);
  });

  it("경직이 끝나면 추격을 재개한다", () => {
    const enemy = makeEnemy({ mood: "hit", timer: 0.001, velocityX: 3, velocityZ: 0 });
    const result = stepEnemy(enemy, 0, 0, FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("chase");
  });
});

describe("stepPlayerCombat", () => {
  const FAR = COMBAT_TUNING.aggroRadius + 50;

  it("적이 멀면 아무 일도 없다", () => {
    const result = stepPlayerCombat(
      createPlayerCombat(),
      [makeEnemy({ x: FAR, z: FAR, mood: "chase" })],
      0,
      0,
      FRAME,
    );
    expect(result.struck, `struck was: ${result.struck}`).toBe(false);
    expect(result.state.hp).toBe(PLAYER_COMBAT.maxHp);
  });

  it("판정이 살아 있는 적이 붙으면 체력이 깎인다", () => {
    /*
     * 예전에는 "추격 중이고 가까이 있다"만으로 깎였다 — 예고가 없어
     * 싸우지 않았는데 쓰러지는 일이 생겼다. 지금은 준비 단계를 거친
     * 적만 때린다 (tests/enemyStrike.test.ts).
     */
    const result = stepPlayerCombat(
      createPlayerCombat(),
      [makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" })],
      0,
      0,
      FRAME,
    );
    expect(result.struck, `struck was: ${result.struck}`).toBe(true);
    expect(result.state.hp, `hp was: ${result.state.hp}`).toBe(
      PLAYER_COMBAT.maxHp - PLAYER_COMBAT.contactDamage,
    );
  });

  it("경직 중이거나 쓰러진 적은 때리지 않는다", () => {
    // 넉백으로 날아가는 적에게 맞으면 억울하다
    for (const mood of ["hit", "down", "idle"] as const) {
      const result = stepPlayerCombat(
        createPlayerCombat(),
        [makeEnemy({ x: 0, z: 1, mood, strikePhase: "active" })],
        0,
        0,
        FRAME,
      );
      expect(result.struck, `mood ${mood} struck`).toBe(false);
    }
  });

  it("무적 시간 동안은 여러 적에게 둘러싸여도 한 번만 맞는다", () => {
    // Arrange — 세 기가 겹쳐 있다
    const swarm = [
      makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" }),
      makeEnemy({ x: 1, z: 0, mood: "chase", strikePhase: "active" }),
      makeEnemy({ x: -1, z: 0, mood: "chase", strikePhase: "active" }),
    ];

    // Act — 무적 시간보다 짧게 여러 프레임 돌린다
    let state = createPlayerCombat();
    let hits = 0;
    for (let i = 0; i < 30; i += 1) {
      const result = stepPlayerCombat(state, swarm, 0, 0, FRAME);
      state = result.state;
      if (result.struck) hits += 1;
    }

    // Assert — 없으면 한 프레임에 체력이 다 깎인다
    expect(hits, `hits were: ${hits}`).toBe(1);
  });

  it("무적이 끝나면 다시 맞는다", () => {
    const swarm = [makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" })];
    let state = createPlayerCombat();
    let hits = 0;
    // 무적 시간의 세 배를 돌린다
    for (let i = 0; i < Math.ceil(PLAYER_COMBAT.invulnerableSeconds * 3 * 60); i += 1) {
      const result = stepPlayerCombat(state, swarm, 0, 0, FRAME);
      state = result.state;
      if (result.struck) hits += 1;
    }
    expect(hits, `hits were: ${hits}`).toBeGreaterThan(1);
  });

  it("체력이 다하면 쓰러진다", () => {
    const swarm = [makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" })];
    let state = createPlayerCombat();
    for (let i = 0; i < 60 * 20; i += 1) {
      const result = stepPlayerCombat(state, swarm, 0, 0, FRAME);
      state = result.state;
      if (state.downed) break;
    }
    expect(state.downed, `hp was: ${state.hp}`).toBe(true);
  });

  it("쓰러진 뒤 부활하면 체력이 가득 차고 무적이 붙는다", () => {
    // Arrange — 부활 직전
    let state = {
      ...createPlayerCombat(),
      hp: 0,
      downed: true,
      respawnRemaining: 0.001,
    };

    // Act
    const result = stepPlayerCombat(state, [], 0, 0, FRAME);
    state = result.state;

    // Assert — 무적이 없으면 쓰러진 자리에서 즉사가 반복된다
    expect(result.respawned, `respawned was: ${result.respawned}`).toBe(true);
    expect(state.hp).toBe(PLAYER_COMBAT.maxHp);
    expect(state.invulnerableRemaining, `inv was: ${state.invulnerableRemaining}`).toBeGreaterThan(
      0,
    );
  });

  it("쓰러져 있는 동안에는 더 맞지 않는다", () => {
    const state = { ...createPlayerCombat(), hp: 0, downed: true, respawnRemaining: 1 };
    const result = stepPlayerCombat(
      state,
      [makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" })],
      0,
      0,
      FRAME,
    );
    expect(result.struck).toBe(false);
  });

  it("한동안 맞지 않으면 회복한다", () => {
    // Arrange — 체력이 깎인 상태에서 적이 없다
    let state = { ...createPlayerCombat(), hp: 2, sinceHitSeconds: 0 };

    // Act — 회복 대기 시간을 넘겨 돌린다
    for (let i = 0; i < 60 * 20; i += 1) {
      state = stepPlayerCombat(state, [], 0, 0, FRAME).state;
    }

    // Assert
    expect(state.hp, `hp was: ${state.hp}`).toBeGreaterThan(2);
    expect(state.hp, `hp was: ${state.hp}`).toBeLessThanOrEqual(PLAYER_COMBAT.maxHp);
  });

  it("회복은 최대 체력을 넘지 않는다", () => {
    let state = createPlayerCombat();
    for (let i = 0; i < 60 * 60; i += 1) {
      state = stepPlayerCombat(state, [], 0, 0, FRAME).state;
    }
    expect(state.hp, `hp was: ${state.hp}`).toBe(PLAYER_COMBAT.maxHp);
  });

  it("무적 중에는 피해를 받지 않는 상태로 보고된다", () => {
    const hit = stepPlayerCombat(
      createPlayerCombat(),
      [makeEnemy({ x: 0, z: 1, mood: "chase", strikePhase: "active" })],
      0,
      0,
      FRAME,
    );
    expect(isPlayerVulnerable(hit.state), "just hit").toBe(false);
    expect(isPlayerVulnerable(createPlayerCombat()), "fresh").toBe(true);
  });
});

describe("동료 능력 배율", () => {
  it("인지 반경 배율이 낮으면 늦게 알아본다", () => {
    // 사거리 안쪽에 서 있어도 감춰지면 추격하지 않는다
    const enemy = makeEnemy({ z: -(COMBAT_TUNING.aggroRadius * 0.6), mood: "idle" });

    const seen = stepEnemy(enemy, 0, 0, 0.1);
    const hidden = stepEnemy(enemy, 0, 0, 0.1, 0.4);

    expect(seen.mood, `seen was: ${seen.mood}`).toBe("chase");
    expect(hidden.mood, `hidden was: ${hidden.mood}`).toBe("idle");
  });

  it("배율을 주지 않으면 원래대로 본다", () => {
    // 기본값 1이라 능력을 모르는 호출부는 그대로 동작해야 한다
    const enemy = makeEnemy({ z: -5, mood: "idle" });
    expect(stepEnemy(enemy, 0, 0, 0.1).mood).toBe(stepEnemy(enemy, 0, 0, 0.1, 1).mood);
  });

  it("회복 배율이 높으면 더 빨리 찬다", () => {
    // Arrange — 회복 대기가 끝난 상태
    const hurt = {
      ...createPlayerCombat(),
      hp: 2,
      sinceHitSeconds: PLAYER_COMBAT.regenDelaySeconds,
    };

    // Act
    const normal = stepPlayerCombat(hurt, [], 0, 0, 1);
    const boosted = stepPlayerCombat(hurt, [], 0, 0, 1, 0, 4);

    // Assert
    expect(
      boosted.state.hp,
      `normal=${normal.state.hp}, boosted=${boosted.state.hp}`,
    ).toBeGreaterThan(normal.state.hp);
  });

  it("회복 배율이 높아도 대기 시간은 건너뛰지 못한다", () => {
    // 맞자마자 켠다고 즉시 차오르면 피격이 의미가 없다
    const justHit = { ...createPlayerCombat(), hp: 2, sinceHitSeconds: 0 };
    const result = stepPlayerCombat(justHit, [], 0, 0, 1, 0, 4);
    expect(result.state.hp, `hp was: ${result.state.hp}`).toBe(2);
  });
});

describe("적과 벽", () => {
  /** x가 0~4인 띠를 벽으로 본다 */
  const wall = (x: number) => x >= 0 && x <= 4;

  it("벽을 향해 걸어도 통과하지 않는다", () => {
    // 판정이 없었을 때는 로봇이 건물에서 걸어 나왔다
    const enemy = makeEnemy({ x: -1, z: 0, mood: "chase", strikePhase: "active" });
    const next = stepEnemy(enemy, 10, 0, 0.5, 1, (x) => wall(x));

    expect(next.x, `x was: ${next.x}`).toBeLessThan(0);
  });

  it("한 축이 막히면 다른 축으로 미끄러진다", () => {
    // 모서리에서 붙잡히면 추격이 거기서 끝난다
    const enemy = makeEnemy({ x: -1, z: 0, mood: "chase", strikePhase: "active" });
    const next = stepEnemy(enemy, 10, 10, 0.5, 1, (x) => wall(x));

    expect(next.x, `x was: ${next.x}`).toBeLessThan(0);
    expect(next.z, `z was: ${next.z}`).toBeGreaterThan(0);
  });

  it("넉백도 벽을 뚫지 않는다", () => {
    // 때려서 건물 안으로 밀어 넣으면 꺼낼 방법이 없다
    const enemy = makeEnemy({ x: -1, z: 0, mood: "hit", timer: 0.3, velocityX: 20 });
    const next = stepEnemy(enemy, -20, 0, 0.2, 1, (x) => wall(x));

    expect(next.x, `x was: ${next.x}`).toBeLessThan(0);
  });

  it("판정을 주지 않으면 예전처럼 통과한다", () => {
    // 기존 호출부의 동작을 바꾸지 않는다
    const enemy = makeEnemy({ x: -1, z: 0, mood: "chase", strikePhase: "active" });
    expect(stepEnemy(enemy, 10, 0, 0.5).x).toBeGreaterThan(0);
  });

  it("사수도 물러설 때 벽을 뚫지 않는다", () => {
    // 플레이어가 밀어붙이면 사수는 뒤로 물러선다. 그 방향이 벽일 수 있다.
    const gunner = makeEnemy({ kind: "gunner", x: -1, z: 0, mood: "chase" });
    const next = stepEnemy(gunner, -3, 0, 0.5, 1, (x) => wall(x));

    expect(next.x, `x was: ${next.x}`).toBeLessThan(0);
  });
});

describe("적이 선 자리에서 실제로 때리는가", () => {
  /*
   * **검사가 하나도 없던 관계다.**
   *
   * 적은 `standoffRadius`(추격을 멈추고 서는 거리)까지 붙고, 플레이어를 때리는
   * 판정은 `ENEMY_STRIKE.range` 안에서 일어난다. 그래서 **그 사거리가 서는 거리보다
   * 넓어야** 붙은 적이 실제로 위협이 된다.
   *
   * 뒤집히면 적은 1.6m에 서서 **영영 때리지 않는다** — 화면에는 적이 몰려드는데
   * 아무 일도 일어나지 않는 게임이 된다. 조용히 깨지고, 테스트도 화면도 아무 말을
   * 하지 않는다.
   *
   * 지금은 `standoffRadius + 0.8`로 **파생**되어 있어 저절로 성립한다. 이 검사는
   * 그 파생을 리터럴로 바꾸는 날을 위한 것이다.
   */
  it("때리는 사거리가 서는 거리보다 넓다", () => {
    expect(
      ENEMY_STRIKE.range,
      `서는 거리 ${COMBAT_TUNING.standoffRadius}m, 때리는 사거리 ${ENEMY_STRIKE.range}m`,
    ).toBeGreaterThan(COMBAT_TUNING.standoffRadius);
  });

  it("여유가 아슬아슬하지 않다", () => {
    /*
     * 간신히 넓기만 하면 적이 서는 위치가 조금만 흔들려도(밀림·충돌 보정)
     * 때렸다 안 때렸다 한다. 손끝에서는 「가끔 안 맞는 적」으로 느껴진다.
     */
    const margin = ENEMY_STRIKE.range - COMBAT_TUNING.standoffRadius;
    expect(margin, `여유 ${margin.toFixed(2)}m`).toBeGreaterThanOrEqual(0.5);
  });
});

describe("쓰러진 사이에는 맞지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 「지금 피해를 받을 수 있는 상태인지」를 정의하는
   * `isPlayerVulnerable`에서 **쓰러짐 조건을 지워도 통과했다.**
   *
   * 실제 진행(`stepPlayerCombat`)은 쓰러진 프레임에서 곧바로 반환하므로 **제품
   * 동작은 멀쩡하다.** 문제는 그 함수가 「무적 규칙의 정의」로 쓰인다는 것이다 —
   * 정의가 실제와 어긋나도 아무도 모르면, 다음 사람은 **틀린 규칙을 기준 삼아**
   * 다른 코드를 고친다.
   *
   * 그래서 둘 다 굳힌다: 정의와 실제 동작.
   */
  const downed = () => ({ ...createPlayerCombat(), hp: 0, downed: true, respawnRemaining: 1 });

  it("정의: 쓰러졌으면 맞을 수 없다", () => {
    expect(isPlayerVulnerable(downed()), "쓰러졌는데 맞을 수 있다고 한다").toBe(false);
  });

  it("정의: 쓰러짐은 무적 시간과 따로 본다", () => {
    // 무적이 끝나도 쓰러진 동안에는 여전히 안 맞는다 — 두 조건이 각각 필요하다
    const state = { ...downed(), invulnerableRemaining: 0 };
    expect(isPlayerVulnerable(state), "무적이 끝나자 쓰러진 채로 맞는다").toBe(false);
  });

  it("실제: 쓰러진 프레임에서는 적이 붙어 있어도 안 맞는다", () => {
    /*
     * 쓰러진 자리에 적이 그대로 서 있는 것이 보통이다. 여기서 맞으면
     * **일어나기도 전에 다시 눕는다.**
     */
    const enemy = makeEnemy({ x: 0, z: 0, mood: "chase" });
    const result = stepPlayerCombat(downed(), [enemy], 0, 0, 1 / 60);
    expect(result.struck, "쓰러졌는데 맞았다").toBe(false);
    expect(result.state.hp, "쓰러진 채로 체력이 더 깎였다").toBe(0);
  });
});

describe("화면의 하트 수가 실제 체력과 같은가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 하트 수를 `5`로 박아도 검사가 전부 통과했다.
   *
   * 지금은 우연히 맞다(`maxHp`가 5다). 그런데 체력을 조정하는 날 화면은 그대로
   * 다섯을 그리고, 플레이어는 **「한 대 더 맞아도 되나」를 틀린 수로 판단한다.**
   * 간판이 딴 가게를 읽어 주던 것과 같은 종류다 — 화면이 진실에서 떨어진다.
   *
   * 값을 박지 않는다. **하트를 그리는 수가 `maxHp`에서 오는지**만 본다 —
   * 체력을 바꾸면 화면도 함께 바뀌어야 한다.
   */
  /*
   * 규칙과 모양이 나뉘고 나서 이 길은 두 걸음이 됐다: 잇는 쪽이 정본에서
   * 최대 체력을 읽어 넘기고, 모양 쪽이 **받은 수만큼** 그린다. 둘 다 본다 —
   * 한쪽만 보면 나머지에서 수가 갈려도 통과한다.
   */
  const panels = readCode("src/components/hud/StatusPanels.tsx");
  const view = readCode("src/components/hud/views/HealthPanel.tsx");

  it("하트를 그리는 수가 정본에서 온다", () => {
    expect(panels, "하트 수를 박아 두었다").toContain("PLAYER_COMBAT.maxHp");
  });

  it("그 수로 실제로 그린다", () => {
    // 값만 읽고 다른 수로 그리면 소용이 없다
    expect(view, "읽어 놓고 그리지 않는다").toMatch(/Array\.from\(\{ length: view\.total \}/);
  });

  it("체력을 숫자로 박아 둔 곳이 없다", () => {
    /*
     * `length: 5`처럼 어딘가 하나만 박혀 있어도 그 줄만 안 따라온다.
     * 「어딘가 한 군데만 맞으면 통과」를 피하려고 **박힌 곳이 없는지**를 본다.
     */
    expect(panels, "하트를 숫자로 그린다").not.toMatch(/Array\.from\(\{ length: \d/);
  });
});

describe("적이 정해진 시간만큼 그 상태에 머무는가", () => {
  /*
   * 보스에서 찾은 것과 같은 구멍이 여기에도 있었다. 「쓰러진 적은 추격을
   * 재개하지 않는다」와 「시간이 지나면 다시 일어난다」는 있었는데, 둘 다
   * **한 프레임씩만** 본다. 그래서 타이머를 0으로 굳혀도 전부 통과했다 —
   * 쓰러진 적이 두 프레임 만에 벌떡 일어난다.
   *
   * 사람이 겪는 모습: 때려 눕혀도 곧바로 다시 서니 **한 구역을 정리했다는 감각이
   * 아예 없다.** 게다가 일어날 때 스폰 지점으로 돌아가므로, 눈앞에서 사라졌다가
   * 멀리서 나타나는 것처럼 보인다.
   *
   * 「상태가 바뀌는가」가 아니라 **「얼마나 머무르는가」**를 잰다.
   */
  function dwell(start: EnemyState, playerX: number, playerZ: number): number {
    let enemy = start;
    for (let i = 0; i < 60 * 10; i += 1) {
      const next = stepEnemy(enemy, playerX, playerZ, FRAME);
      if (next.mood !== start.mood) return (i + 1) * FRAME;
      enemy = next;
    }
    return Number.POSITIVE_INFINITY;
  }

  it("쓰러진 적은 정해진 시간을 채우고 일어난다 — 곧바로 서면 정리한 감각이 없다", () => {
    const held = dwell(makeEnemy({ mood: "down", hp: 0, timer: COMBAT_TUNING.downSeconds }), 0, 1);
    expect(held, `기상까지 ${held}초 (기대 ${COMBAT_TUNING.downSeconds}초)`).toBeGreaterThan(
      COMBAT_TUNING.downSeconds * 0.8,
    );
  });

  it("맞은 경직도 시간을 채운다 — 없으면 때린 손맛이 사라진다", () => {
    const held = dwell(makeEnemy({ mood: "hit", timer: COMBAT_TUNING.hitStunSeconds }), 0, 1);
    expect(held, `경직 ${held}초 (기대 ${COMBAT_TUNING.hitStunSeconds}초)`).toBeGreaterThan(
      COMBAT_TUNING.hitStunSeconds * 0.8,
    );
  });
});

describe("플레이어 상태가 화면으로 나가는가", () => {
  /*
   * 두 칸뿐이지만 화면에서 가장 눈에 띄는 둘이다. 프레임 루프 안에서 손으로
   * 적을 때는 **지워도 아무도 몰랐다**(공유 객체 쓰기 60개 중 51개가 그랬고
   * 이 둘도 거기 있었다).
   *
   * 하트가 안 줄면 맞은 줄 모르고, 쓰러짐이 안 나가면 **쓰러졌는데 화면은
   * 멀쩡하다** — 부활을 기다리는 동안 왜 조작이 안 먹는지 알 수 없다.
   */
  it("체력과 쓰러짐이 그대로 나간다", () => {
    const link = { playerHp: -1, playerDowned: false };
    projectPlayerVitals(link, { ...createPlayerCombat(), hp: 2, downed: true });

    expect(link.playerHp, "체력이 안 나갔다").toBe(2);
    expect(link.playerDowned, "쓰러짐이 안 나갔다").toBe(true);
  });

  it("맞아서 줄어든 체력이 따라간다 — 안 따라가면 맞은 줄 모른다", () => {
    /*
     * 처음에 `COMBAT_TUNING.maxHp`와 비교했다가 걸렸다 — **그건 적의 체력**이다.
     * 플레이어 시작값은 `createPlayerCombat()`이 안다. 상수 이름이 비슷하면
     * 엉뚱한 자를 집기 쉽다.
     */
    let state = createPlayerCombat();
    const full = state.hp;
    const link = { playerHp: full, playerDowned: false };

    // 한 대 맞힌다
    const hit = stepPlayerCombat(state, [], 0, 0, FRAME, 1, 1);
    state = hit.state;
    projectPlayerVitals(link, state);

    expect(link.playerHp, `체력 ${link.playerHp} (시작 ${full})`).toBeLessThan(full);
    expect(link.playerHp, "sim과 화면이 다른 값을 든다").toBe(state.hp);
  });

  it("멀쩡할 때는 쓰러짐이 꺼져 있다 — 켜진 채로 두면 조작이 막힌 것처럼 보인다", () => {
    const link = { playerHp: 0, playerDowned: true };
    projectPlayerVitals(link, createPlayerCombat());
    expect(link.playerDowned).toBe(false);
  });
});

describe("한 번짜리 신호가 한 번만 나가는가", () => {
  /*
   * 누른 쪽(`PlayerRig`)과 쓰는 쪽(`Enemies`)이 다른 컴포넌트라 공유 객체로
   * 신호를 넘긴다. 꺼내면서 비우지 않으면:
   *
   *   - 공격 — **한 번 누른 공격이 매 프레임 다시 나간다.** 가만히 서서 계속
   *     휘두르는 그림이 되고, 그건 조작이 아니다.
   *   - 충격 — 한 번 맞은 충격이 **매 프레임 다시 들어와** 무적이 끝나는 족족
   *     또 맞는다. 대장 앞에서 아무것도 못 하고 쓰러진다.
   *
   * 입력 큐(`consumeJump`)에서 같은 결함을 찾고 나서, 같은 모양이 여기에도
   * 있는 것을 보고 함께 막았다 — 한 곳에서 찾은 모양은 이웃에도 있다.
   *
   * 「돌려주는 값이 맞는가」가 아니라 **「두 번째에도 나가는가」**를 잰다.
   */
  function signals(overrides: Partial<CombatSignals> = {}): CombatSignals {
    return { attackQueued: false, bossSlamHit: false, summonHeal: 0, ...overrides };
  }

  it("공격은 한 번 누르면 한 번만 나간다", () => {
    const link = signals({ attackQueued: true });
    expect(consumeAttack(link), "첫 번째에 안 나갔다").toBe(true);
    expect(consumeAttack(link), "누른 적 없는 두 번째가 나갔다").toBe(false);
  });

  it("충격도 한 번만 들어온다 — 아니면 무적이 끝나는 족족 또 맞는다", () => {
    const link = signals({ bossSlamHit: true });
    expect(consumeSlam(link), "첫 번째에 안 들어왔다").toBe(true);
    expect(consumeSlam(link), "맞은 적 없는 두 번째가 들어왔다").toBe(false);
  });

  it("누르지 않았으면 나가지 않는다", () => {
    const link = signals();
    expect(consumeAttack(link), "누르지 않은 공격이 나갔다").toBe(false);
    expect(consumeSlam(link), "맞지 않은 충격이 들어왔다").toBe(false);
  });

  it("다시 누르면 또 나간다 — 한 번 쓰고 죽으면 조작이 멈춘다", () => {
    const link = signals({ attackQueued: true });
    consumeAttack(link);

    link.attackQueued = true;
    expect(consumeAttack(link), "다시 누른 공격이 안 나갔다").toBe(true);
  });

  it("둘이 서로를 지우지 않는다 — 한 통로로 합쳐지지만 출처는 다르다", () => {
    const link = signals({ attackQueued: true, bossSlamHit: true });
    consumeAttack(link);
    expect(consumeSlam(link), "공격을 꺼내며 충격까지 지웠다").toBe(true);
  });
});

describe("적을 때린 것이 기록되는가", () => {
  /*
   * 소리가 안 나면 **때렸는지 귀로 알 수 없고**, 처치 수가 안 늘면 여정이
   * 영영 안 끝난다. 프레임 루프 안에 있을 때는 지워도 아무도 몰랐다.
   *
   * 「**부활은 누적에서 빼지 않는다**」가 이 자리의 규칙이다 — 여정은 「몇 번
   * 쓰러뜨렸나」를 묻지 「몇 기가 누워 있나」를 묻지 않는다.
   */
  function blank(): EnemyHitLink {
    return { cues: { hits: 0, defeats: 0 }, defeatedTotal: 0 };
  }

  it("때리면 소리가 난다", () => {
    const link = blank();
    recordEnemyHits(link, [makeEnemy({ mood: "hit" })]);

    expect(link.cues.hits, "때린 소리가 안 났다").toBe(1);
    expect(link.cues.defeats, "안 눕혔는데 눕힌 소리가 났다").toBe(0);
    expect(link.defeatedTotal, "안 눕혔는데 처치 수가 늘었다").toBe(0);
  });

  it("눕히면 처치 수가 는다 — 안 늘면 여정이 영영 안 끝난다", () => {
    const link = blank();
    recordEnemyHits(link, [makeEnemy({ mood: "down" })]);

    expect(link.cues.hits, "때린 소리가 안 났다").toBe(1);
    expect(link.cues.defeats, "눕힌 소리가 안 났다").toBe(1);
    expect(link.defeatedTotal, "처치 수가 안 늘었다").toBe(1);
  });

  it("한 번에 여럿을 맞히면 그만큼 센다", () => {
    const link = blank();
    recordEnemyHits(link, [
      makeEnemy({ mood: "hit" }),
      makeEnemy({ mood: "down" }),
      makeEnemy({ mood: "down" }),
    ]);

    expect(link.cues.hits, `때린 소리 ${link.cues.hits}`).toBe(3);
    expect(link.defeatedTotal, `처치 ${link.defeatedTotal}`).toBe(2);
  });

  it("아무도 못 맞히면 아무 일도 없다", () => {
    const link = blank();
    recordEnemyHits(link, []);
    expect(link.cues.hits, "안 맞혔는데 소리가 났다").toBe(0);
  });

  it("쌓인다 — 매번 덮어쓰면 소리가 한 번만 난다", () => {
    const link = blank();
    recordEnemyHits(link, [makeEnemy({ mood: "hit" })]);
    recordEnemyHits(link, [makeEnemy({ mood: "hit" })]);
    expect(link.cues.hits, `때린 소리 ${link.cues.hits}`).toBe(2);
  });
});

describe("휘두르기 진행 시간이 캐릭터로 가는가", () => {
  /*
   * 캐릭터가 이 값으로 **팔이 어디쯤 갔는지**를 정한다. 안 넘기면 휘두르는 동안
   * 자세가 그대로여서 **때리는 시늉조차 안 한다** — 소리는 나고 적은 날아가는데
   * 캐릭터만 가만히 서 있다.
   *
   * `null`(안 휘두름)과 `0`(막 시작함)은 **다르다.** 0으로 바꾸면 평소에도
   * 휘두르기 시작 자세로 서 있게 된다.
   */
  it("안 휘두를 때는 없음이다 — 0이면 늘 시작 자세다", () => {
    const link = { attackElapsed: 1 as number | null };
    projectAttackTiming(link, createAttackState(), WEAPONS.bat);
    expect(link.attackElapsed, "가만히 있는데 자세가 잡혔다").toBeNull();
  });

  it("휘두르는 동안 시간이 흐른다 — 멈추면 자세가 그대로다", () => {
    const link = { attackElapsed: null as number | null };
    let attack = stepAttack(createAttackState(), true, FRAME);

    projectAttackTiming(link, attack, WEAPONS.bat);
    const first = link.attackElapsed;
    expect(first, "휘두르는데 자세가 없다").not.toBeNull();

    attack = stepAttack(attack, false, FRAME * 4);
    projectAttackTiming(link, attack, WEAPONS.bat);

    expect(link.attackElapsed, `${first} → ${link.attackElapsed}`).toBeGreaterThan(first ?? 0);
  });

  it("끝나면 다시 없음으로 돌아간다 — 안 돌아가면 자세가 굳는다", () => {
    const link = { attackElapsed: null as number | null };
    let attack = stepAttack(createAttackState(), true, FRAME);
    for (let i = 0; i < 240; i += 1) attack = stepAttack(attack, false, FRAME);

    projectAttackTiming(link, attack, WEAPONS.bat);
    expect(link.attackElapsed, `자세가 ${link.attackElapsed}에서 굳었다`).toBeNull();
  });
});

describe("부활 신호가 한 번만 오는가", () => {
  /*
   * 전투 쪽은 플레이어의 스폰 지점을 모르므로 신호만 보내고, 자리를 아는 쪽이
   * 받아서 옮긴다. 꺼내면서 비우지 않으면 **매 프레임 스폰 지점으로 끌려가
   * 아예 움직일 수 없다** — 쓰러진 것도 아닌데 조작이 안 먹는 상태다.
   */
  it("요청이 있으면 한 번만 나온다", () => {
    const link = { respawnRequested: true };
    expect(consumeRespawn(link), "부활 신호가 안 나왔다").toBe(true);
    expect(consumeRespawn(link), "매 프레임 스폰으로 끌려간다").toBe(false);
  });

  it("요청이 없으면 안 나온다", () => {
    expect(consumeRespawn({ respawnRequested: false })).toBe(false);
  });

  it("다시 쓰러지면 또 나온다", () => {
    const link = { respawnRequested: true };
    consumeRespawn(link);

    link.respawnRequested = true;
    expect(consumeRespawn(link), "두 번째 부활이 안 된다").toBe(true);
  });
});

describe("벽을 따라 미끄러지는가", () => {
  /*
   * 벽에 비스듬히 부딪히면 **한 축은 살려서 미끄러져야** 한다. 두 축을 다
   * 막으면 벽에 닿는 순간 완전히 멈춰 「끼인다」 — 좁은 골목에서 특히 답답하다.
   *
   * 조건문 훑기에서 그 두 줄이 「지워도 아무도 모른다」로 나왔다. 방어선이
   * 아니라 **실제로 매 프레임 밟는 길**이라 값으로 잰다.
   *
   * 미끄러짐을 하는 함수는 내보내지 않는다. **검사 때문에 내보내는 대신**
   * 실제 입구(`stepEnemy`의 넉백)로 민다 — 이쪽이 바뀌어도 규칙은 그대로다.
   *
   * 처음에 `isBlocked`를 다섯 번째 인자로 넘겼다가 통과했다. 그 자리는
   * `aggroScale`이고 벽은 여섯 번째다 — **벽을 안 준 채로 「안 뚫는다」를
   * 재고 있었다.** 인자가 많은 함수는 자리를 세어 보고 써야 한다.
   */
  /** x > 4 를 벽으로 둔다 */
  const wall = (x: number) => x > 4;

  it("벽으로 밀린 적이 벽을 따라 옆으로 간다", () => {
    // 벽 쪽(+x)과 옆(+z)으로 동시에 밀린 적
    const pushed = makeEnemy({ x: 3.9, z: 0, mood: "hit", timer: 1, velocityX: 20, velocityZ: 20 });
    const after = stepEnemy(pushed, 0, 0, FRAME, 1, wall);

    expect(after.x, `벽을 뚫었다: x=${after.x}`).toBeLessThanOrEqual(4);
    expect(after.z, `옆으로 못 갔다: z=${after.z}`).toBeGreaterThan(0);
  });

  it("반대 축이 막혀도 마찬가지다 — 한쪽만 재면 절반이 빈다", () => {
    /*
     * 미끄러짐은 **두 축을 각각** 시도한다. x 벽만 재고 끝내면 z 벽 갈래가
     * 통째로 안 보인다 — 실제로 처음엔 그래서 한 줄이 안 물렸다.
     */
    const zWall = (_x: number, z: number) => z > 4;
    const pushed = makeEnemy({ x: 0, z: 3.9, mood: "hit", timer: 1, velocityX: 20, velocityZ: 20 });
    const after = stepEnemy(pushed, 0, 0, FRAME, 1, zWall);

    expect(after.z, `벽을 뚫었다: z=${after.z}`).toBeLessThanOrEqual(4);
    expect(after.x, `옆으로 못 갔다: x=${after.x}`).toBeGreaterThan(0);
  });

  it("막히지 않으면 밀린 대로 간다", () => {
    const pushed = makeEnemy({ x: 0, z: 0, mood: "hit", timer: 1, velocityX: 20, velocityZ: 20 });
    const after = stepEnemy(pushed, 0, 0, FRAME, 1, wall);

    expect(after.x, "안 막혔는데 못 갔다").toBeGreaterThan(0);
    expect(after.z, "안 막혔는데 못 갔다").toBeGreaterThan(0);
  });

  it("모서리에 몰리면 제자리다 — 뚫고 나가지 않는다", () => {
    const corner = (x: number, z: number) => x > 4 || z > 4;
    const pushed = makeEnemy({
      x: 3.9,
      z: 3.9,
      mood: "hit",
      timer: 1,
      velocityX: 20,
      velocityZ: 20,
    });
    const after = stepEnemy(pushed, 0, 0, FRAME, 1, corner);

    expect(after.x, `모서리를 뚫었다: x=${after.x}`).toBeLessThanOrEqual(4);
    expect(after.z, `모서리를 뚫었다: z=${after.z}`).toBeLessThanOrEqual(4);
  });
});

describe("겹쳐 선 적을 때릴 수 있는가", () => {
  /*
   * 거리가 0이면 방향을 정할 수 없다 — `atan2(0, 0)`은 0이라 **바로 위에 겹친
   * 적이 등 뒤에 있는 것으로 잡힌다.** 그러면 껴안은 채로 휘둘러도 안 맞는다.
   *
   * 조건문 훑기에서 나왔고, 이건 실제로 밟는 길이다: 적이 플레이어에게
   * 달라붙는 것이 이 게임의 기본 동작이다.
   */
  it("바로 위에 겹친 적은 어느 쪽을 보든 맞는다", () => {
    for (const facing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      expect(isInAttackArc({ x: 0, z: 0 }, 0, 0, facing), `facing ${facing}`).toBe(true);
    }
  });

  it("등 뒤의 적은 안 맞는다 — 겹침 예외가 전부를 삼키지 않게", () => {
    expect(isInAttackArc({ x: 0, z: -1.5 }, 0, 0, 0), "등 뒤가 맞았다").toBe(false);
  });
});

describe("한 대 맞았다고 쓰러지지는 않는가", () => {
  /*
   * 비교 방향 훑기에서 나왔다. `hp <= 0`을 `>= 0`으로 뒤집으면 **맞는 순간
   * 무조건 쓰러진다**(체력은 늘 0 이상이니까). 하트가 다섯이든 하나든 첫 대에
   * 쓰러져 부활을 기다리게 되는데, 검사는 전부 통과했다.
   *
   * 「맞으면 체력이 준다」는 이미 재고 있었는데 **쓰러짐 여부는 안 봤다** —
   * 값 하나만 보고 옆 칸을 안 본 자리다.
   */
  // 쫓는 중인 적만 때린다 — 처음에 mood를 안 줘서 한 대도 안 맞고 있었다
  const NEARBY = [makeEnemy({ x: 0, z: 0.5, mood: "chase", strikePhase: "active" })];

  it("체력이 남아 있으면 안 쓰러진다", () => {
    const hit = stepPlayerCombat(createPlayerCombat(), NEARBY, 0, 0, FRAME);

    expect(hit.state.hp, "안 맞았다").toBeLessThan(createPlayerCombat().hp);
    expect(hit.state.hp, "한 대에 다 깎였다").toBeGreaterThan(0);
    expect(hit.state.downed, "체력이 남았는데 쓰러졌다").toBe(false);
    expect(hit.state.respawnRemaining, "안 쓰러졌는데 부활을 센다").toBe(0);
  });

  it("체력이 다하면 쓰러진다 — 이 검사가 늘 거짓이 되지 않게", () => {
    let state = createPlayerCombat();
    for (let i = 0; i < 20 && !state.downed; i += 1) {
      // 무적 시간을 지나 보내며 계속 맞는다
      state = stepPlayerCombat({ ...state, invulnerableRemaining: 0 }, NEARBY, 0, 0, FRAME).state;
    }

    expect(state.downed, "계속 맞았는데 안 쓰러진다").toBe(true);
    expect(state.hp, `체력 ${state.hp}`).toBe(0);
    expect(state.respawnRemaining, "쓰러졌는데 부활을 안 센다").toBeGreaterThan(0);
  });

  it("여러 대를 맞아도 하트가 하나씩 준다", () => {
    // 「한 대에 다 깎인다」와 「안 깎인다」 사이를 구분한다
    const full = createPlayerCombat().hp;
    const once = stepPlayerCombat(createPlayerCombat(), NEARBY, 0, 0, FRAME).state;
    const twice = stepPlayerCombat(
      { ...once, invulnerableRemaining: 0 },
      NEARBY,
      0,
      0,
      FRAME,
    ).state;

    expect(once.hp, `한 대 뒤 ${once.hp} / 처음 ${full}`).toBeLessThan(full);
    expect(twice.hp, `두 대 뒤 ${twice.hp} / 한 대 뒤 ${once.hp}`).toBeLessThan(once.hp);
  });
});

describe("맞은 결과의 칸을 검사가 다 보는가", () => {
  /*
   * 쓰러짐 버그가 살던 자리다. 「체력이 준다」만 재고 있어서 **옆 칸(쓰러짐·부활
   * 시간)이 무엇으로 바뀌든 통과**했다. 그 모양을 다시 들이지 않게, 결과 객체의
   * 칸을 실제로 다 읽는지 센다.
   *
   * 도구는 `tests/support/readsAll.ts` — 프록시로 읽기를 기록한다.
   */
  it("맞은 뒤 상태의 다섯 칸을 다 본다", () => {
    const hit = stepPlayerCombat(
      createPlayerCombat(),
      [makeEnemy({ x: 0, z: 0.5, mood: "chase", strikePhase: "active" })],
      0,
      0,
      FRAME,
    );
    const watch = watchReads(hit.state);

    // 위 검사들이 실제로 보는 칸들 — 하나라도 빠지면 그 칸은 아무 값이나 돼도 통과한다
    expect(watch.watched.hp, "체력").toBeGreaterThan(0);
    expect(watch.watched.downed, "쓰러짐").toBe(false);
    expect(watch.watched.respawnRemaining, "부활 시간").toBe(0);
    expect(watch.watched.invulnerableRemaining, "무적 시간").toBeGreaterThan(0);
    expect(watch.watched.sinceHitSeconds, "맞은 뒤 경과").toBe(0);

    expect(watch.unreadFields(), "아무도 안 보는 칸이 있다").toEqual([]);
  });
});
