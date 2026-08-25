import { describe, expect, it } from "vitest";

import { BOSS, BOSS_HOME, createBoss, damageBoss, slamHits, stepBoss } from "@/game/combat/bossSim";
import {
  COMBAT_TUNING,
  createAttackState,
  createEnemies,
  isAttackActive,
  resolveHits,
  stepAttack,
  stepEnemy,
  stepEnemyStrike,
  type EnemyState,
} from "@/game/combat/combatSim";
import {
  createPlayerCombat,
  PLAYER_COMBAT,
  stepPlayerCombat,
  type PlayerCombatState,
} from "@/game/combat/playerCombat";
import { swingSeconds, WEAPONS } from "@/game/combat/weapons";
import { LOCOMOTION } from "@/game/config/tuning";

/*
 * 싸움이 성립하는가.
 *
 * 규칙 하나하나는 검증했지만 **한 판이 끝나는지**는 확인한 적이 없다.
 * 이길 수 없는 보스, 죽지 않는 잡몹, 피할 수 없는 공격은 규칙이 옳아도
 * 게임을 망친다 — 그건 값들이 시간 위에서 만나야 드러난다.
 */

const FRAME = 1 / 60;

function enemyAt(x: number, z: number): EnemyState {
  return { ...createEnemies(1, 100)[0], x, z, homeX: x, homeZ: z, kind: "chaser", mood: "chase" };
}

/** 방망이 한 번의 휘두르기 길이(초). 무기마다 다르므로 어느 것인지 밝혀 둔다 */
const BAT_SWING = swingSeconds(WEAPONS.bat);

describe("잡몹 한 마리", () => {
  it("두 번 때리면 쓰러진다", () => {
    let enemies = [enemyAt(0, 1.5)];
    let attack = createAttackState();
    let swings = 0;

    for (let i = 0; i < 60 * 10; i += 1) {
      // 쉬는 중이면 다시 휘두른다
      const request = attack.phase === "ready";
      if (request) swings += 1;
      attack = stepAttack(attack, request, FRAME);

      const result = resolveHits(enemies, attack, 0, 0, 0);
      enemies = result.enemies.map((enemy) => stepEnemy(enemy, 0, 0, FRAME));
      if (enemies[0].mood === "down") break;
    }

    expect(enemies[0].mood, `${swings}번 휘둘렀다`).toBe("down");
    expect(swings, `${swings}번 휘둘러 쓰러뜨렸다`).toBeLessThanOrEqual(4);
  });

  it("등 뒤의 적은 맞지 않는다", () => {
    // 부채꼴 판정이 실제로 방향을 가리는지 — 한 판을 돌려서 본다
    let enemies = [enemyAt(0, -1.5)];
    let attack = createAttackState();

    for (let i = 0; i < 60 * 5; i += 1) {
      attack = stepAttack(attack, attack.phase === "ready", FRAME);
      const result = resolveHits(enemies, attack, 0, 0, 0);
      enemies = result.enemies;
    }

    expect(enemies[0].hp, `hp=${enemies[0].hp}`).toBe(COMBAT_TUNING.maxHp);
  });

  it("쓰러진 뒤 시간이 지나면 다시 일어난다", () => {
    let enemy: EnemyState = {
      ...enemyAt(0, 1.5),
      mood: "down",
      timer: COMBAT_TUNING.downSeconds,
    };

    for (let i = 0; i < 60 * (COMBAT_TUNING.downSeconds + 1); i += 1) {
      enemy = stepEnemy(enemy, 999, 999, FRAME);
    }

    expect(enemy.mood, "영영 누워 있으면 도시가 비어 간다").not.toBe("down");
    expect(enemy.hp).toBe(COMBAT_TUNING.maxHp);
  });
});

describe("둘러싸였을 때", () => {
  it("가만히 있으면 결국 쓰러진다", () => {
    /*
     * 체력이 장식이 아니어야 한다. 세 마리에 둘러싸여 아무것도 안 하면
     * 쓰러져야 정상이다.
     */
    let enemies = [enemyAt(1, 0), enemyAt(-1, 0), enemyAt(0, 1)];
    let combat = createPlayerCombat();
    let downed = false;

    for (let i = 0; i < 60 * 30; i += 1) {
      /*
       * 적의 공격 단계도 함께 돌린다.
       *
       * 예전에는 "가까이 있다"만으로 깎여서 적을 세워 두기만 해도 됐다.
       * 지금은 준비→판정을 실제로 거쳐야 하므로, 이 검사는 **예고를 넣은
       * 뒤에도 전투가 여전히 위협적인가**를 재는 것이 된다.
       */
      enemies = enemies.map((enemy) => stepEnemyStrike(enemy, 0, 0, FRAME));
      const result = stepPlayerCombat(combat, enemies, 0, 0, FRAME);
      combat = result.state;
      if (combat.downed) {
        downed = true;
        break;
      }
    }

    expect(downed, `hp=${combat.hp.toFixed(1)}`).toBe(true);
  });

  it("걸어서 벗어나면 회복된다", () => {
    /*
     * 적 속도(3.1)가 걷기(3.2)보다 느리므로 걸어서 떨어질 수 있어야 한다.
     * 떨어지면 회복이 시작되고, 그래야 한 번의 실수가 판을 끝내지 않는다.
     */
    let combat = { ...createPlayerCombat(), hp: 2 };
    const far: EnemyState[] = [];

    for (let i = 0; i < 60 * (PLAYER_COMBAT.regenDelaySeconds + 5); i += 1) {
      combat = stepPlayerCombat(combat, far, 0, 0, FRAME).state;
    }

    expect(combat.hp, `hp=${combat.hp.toFixed(1)}`).toBeGreaterThan(2);
  });

  it("쓰러지면 부활 신호가 온다", () => {
    let combat: PlayerCombatState = {
      ...createPlayerCombat(),
      hp: 0,
      downed: true,
      respawnRemaining: PLAYER_COMBAT.respawnSeconds,
    };
    let respawned = false;

    for (let i = 0; i < 60 * 5; i += 1) {
      const result = stepPlayerCombat(combat, [], 0, 0, FRAME);
      combat = result.state;
      if (result.respawned) respawned = true;
    }

    expect(respawned, "부활하지 못하면 판이 거기서 끝난다").toBe(true);
    expect(combat.hp).toBe(PLAYER_COMBAT.maxHp);
  });
});

describe("미니 보스", () => {
  it("규칙대로 싸우면 이긴다", () => {
    /*
     * 대본: 예고가 뜨면 물러서고, 빈틈·비틀거림에 붙어서 때린다.
     *
     * **이길 수 없는 보스**는 규칙이 옳아도 게임을 망친다. 값들이 시간 위에서
     * 만나야만 드러나는 문제라 여기서 한 판을 끝까지 돌린다.
     */
    let boss = createBoss(0, 0);
    let attack = createAttackState();
    let playerZ = -12;
    let hitsTaken = 0;
    let seconds = 0;

    for (let i = 0; i < 60 * 120 && boss.phase !== "down"; i += 1) {
      seconds += FRAME;

      // 예고·충격 중에는 물러서고, 아니면 붙는다
      const dangerous = boss.phase === "windup" || boss.phase === "slam";
      const want = dangerous ? -(BOSS.slamRadius + 1.5) : -(WEAPONS.bat.reachMeters - 0.6);
      const speed = LOCOMOTION.run.maxSpeed * FRAME;
      playerZ += Math.max(-speed, Math.min(speed, want - playerZ));

      boss = stepBoss(boss, 0, playerZ, FRAME);
      if (slamHits(boss, 0, playerZ)) hitsTaken += 1;

      // 사거리 안이고 쉬고 있으면 휘두른다
      const inReach = Math.abs(playerZ - boss.z) <= WEAPONS.bat.reachMeters;
      attack = stepAttack(attack, attack.phase === "ready" && inReach, FRAME);
      if (
        isAttackActive(attack) &&
        inReach &&
        attack.timer > WEAPONS.bat.timing.activeSeconds - FRAME
      ) {
        boss = damageBoss(boss).state;
      }
    }

    expect(boss.phase, `${seconds.toFixed(0)}초 싸웠고 체력 ${boss.hp}이 남았다`).toBe("down");
    expect(seconds, `${seconds.toFixed(0)}초 걸렸다`).toBeLessThan(120);
    /*
     * 대본대로 물러섰다면 거의 맞지 않아야 한다. 많이 맞는다면 예고 시간이
     * 물러설 거리에 비해 짧다는 뜻이다 — 그건 피할 수 없는 공격이다.
     */
    expect(hitsTaken, `${hitsTaken}프레임 동안 충격에 닿았다`).toBeLessThan(60);
  });

  it("한 판이 지루하지 않을 만큼은 걸린다", () => {
    /*
     * 반대로 너무 빨리 끝나도 곤란하다. 최소 체력만큼은 때려야 하므로
     * 휘두르기 횟수 × 주기가 하한이 된다.
     */
    const minimumSeconds = BOSS.maxHp * BAT_SWING;
    expect(minimumSeconds, `${minimumSeconds.toFixed(1)}초`).toBeGreaterThan(4);
  });

  it("가만히 서 있으면 맞는다", () => {
    // 피하지 않아도 이길 수 있으면 예고 링이 장식이 된다
    let boss = createBoss(0, 0);
    let hits = 0;

    for (let i = 0; i < 60 * 20; i += 1) {
      boss = stepBoss(boss, 0, 2, FRAME);
      if (slamHits(boss, 0, 2)) hits += 1;
    }

    expect(hits, "가만히 있어도 안 맞는다").toBeGreaterThan(0);
  });
});

describe("보스가 확인 지점에서 실제로 다가오는가", () => {
  /*
   * 브라우저에서 `?see=boss`로 14m 앞에 서서 40초를 기다렸는데 보스가
   * 다가오지 않았다. 계측을 붙여 봤지만 개발 서버 재빌드 타이밍 때문에
   * 읽은 값이 서로 어긋나 원인을 확정하지 못했다.
   *
   * 그래서 **시뮬레이션만 떼어 내 확정한다.** 여기서 통과하면 규칙은 옳고
   * 문제는 씬 연결에 있다. 여기서 실패하면 규칙 자체가 틀린 것이다.
   */
  const FRAME = 1 / 60;

  it("14m에서 시작하면 10초 안에 예고까지 간다", () => {
    let state = createBoss(BOSS_HOME.x, BOSS_HOME.z);
    const px = BOSS_HOME.x;
    const pz = BOSS_HOME.z + 14;
    let telegraphed = false;

    for (let i = 0; i < 60 * 10 && !telegraphed; i += 1) {
      state = stepBoss(state, px, pz, FRAME);
      if (state.phase === "windup") telegraphed = true;
    }

    const distance = Math.hypot(px - state.x, pz - state.z);
    expect(telegraphed, `10초 뒤 거리 ${distance.toFixed(1)}m, 상태 ${state.phase}`).toBe(true);
  });

  it("쫓는 동안 실제로 가까워진다", () => {
    let state = createBoss(BOSS_HOME.x, BOSS_HOME.z);
    const px = BOSS_HOME.x;
    const pz = BOSS_HOME.z + 14;
    const before = Math.hypot(px - state.x, pz - state.z);

    for (let i = 0; i < 60; i += 1) state = stepBoss(state, px, pz, FRAME);

    const after = Math.hypot(px - state.x, pz - state.z);
    expect(after, `1초 동안 ${before.toFixed(1)}m → ${after.toFixed(1)}m`).toBeLessThan(before - 1);
  });

  it("확인 지점 거리는 인지 범위 안이다", () => {
    // 인지 범위 밖이면 보스는 영원히 가만히 있고, 확인하러 간 사람은 이유를 모른다
    expect(14).toBeLessThan(BOSS.aggroRadius);
  });
});

describe("무작위 전투 60초", () => {
  /*
   * 이동에는 퍼즈가 있는데 전투에는 없었다. 대본대로 싸우는 테스트는 **의도한
   * 순서**만 훑는다 — 상태 기계의 구멍은 의도하지 않은 순서에서 열린다.
   * 맞으면서 때리고, 죽는 순간 또 때리고, 부활 직후 또 맞는 식이다.
   *
   * 규칙이 깨지는 방식은 정해져 있다: 체력이 범위를 벗어나거나, 적이 사라지거나,
   * 처치 수가 줄거나, 보스가 없는 단계에 들어가거나, NaN이 번진다.
   */
  const SEEDS = [3, 11, 99, 2026];
  const PHASES = ["idle", "chase", "windup", "slam", "recover", "stagger", "down"];

  /** 시드 난수 — 프로젝트 규칙상 Math.random을 쓰지 않는다 */
  function seeded(seed: number) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };
  }

  for (const seed of SEEDS) {
    it(`seed ${seed}: 규칙이 깨지지 않는다`, () => {
      const random = seeded(seed);
      let combat = createPlayerCombat();
      let enemies = createEnemies(6, 120, seed);
      let boss = createBoss(BOSS_HOME.x, BOSS_HOME.z);
      let attack = createAttackState();
      let defeated = 0;
      let px = BOSS_HOME.x;
      let pz = BOSS_HOME.z + 10;

      for (let frame = 0; frame < 60 * 60; frame += 1) {
        // 플레이어가 무작위로 돌아다니며 아무 때나 휘두른다
        px += (random() - 0.5) * 0.4;
        pz += (random() - 0.5) * 0.4;
        attack = stepAttack(attack, random() < 0.08, FRAME);

        enemies = enemies.map((enemy) => stepEnemy(enemy, px, pz, FRAME));
        const hit = resolveHits(enemies, attack, px, pz, random() * Math.PI * 2);
        enemies = hit.enemies;
        attack = hit.attack;
        defeated += hit.struck.length;

        boss = stepBoss(boss, px, pz, FRAME);
        if (random() < 0.05) boss = damageBoss(boss).state;

        const result = stepPlayerCombat(combat, enemies, px, pz, FRAME);
        combat = result.state;

        // ---- 매 프레임 지켜야 하는 것 ----
        expect(Number.isFinite(combat.hp), `frame ${frame}: hp=${combat.hp}`).toBe(true);
        expect(combat.hp, `frame ${frame}: hp=${combat.hp}`).toBeGreaterThanOrEqual(0);
        expect(combat.hp, `frame ${frame}: hp=${combat.hp}`).toBeLessThanOrEqual(
          PLAYER_COMBAT.maxHp,
        );
        expect(enemies.length, `frame ${frame}: 적이 ${enemies.length}기로 변했다`).toBe(6);
        expect(PHASES, `frame ${frame}: 보스 단계 ${boss.phase}`).toContain(boss.phase);
        expect(
          Number.isFinite(boss.x) && Number.isFinite(boss.z),
          `frame ${frame}: 보스 좌표`,
        ).toBe(true);
      }

      expect(defeated, `처치 수 ${defeated}`).toBeGreaterThanOrEqual(0);
    });
  }
});
