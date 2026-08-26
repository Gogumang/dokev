import { describe, expect, it } from "vitest";

import {
  COMBAT_TUNING,
  createEnemies,
  ENEMY_STRIKE,
  stepEnemyStrike,
  strikeWindupProgress,
  type EnemyState,
} from "@/game/combat/combatSim";
import { createPlayerCombat, PLAYER_COMBAT, stepPlayerCombat } from "@/game/combat/playerCombat";
import { WEAPON_ORDER, WEAPONS } from "@/game/combat/weapons";

/*
 * 안 싸웠는데 죽는 문제.
 *
 * 예전에는 적이 추격 상태로 사거리 안에 **있기만 하면** 체력이 깎였다.
 * 모션도 예고도 없어서, 도시를 달리다 스친 로봇에게 조용히 다섯 대를 맞고
 * 쓰러졌다. 플레이어 입장에서는 원인을 알 방법이 없는 실패다.
 *
 * 여기서 지키는 것은 하나다: **피해는 예고 뒤에만 들어온다.**
 */

const FRAME = 1 / 60;

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    kind: "chaser",
    x: 0,
    z: 1,
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
    homeZ: 1,
    ...overrides,
  };
}

/** 적을 원하는 단계까지 진행시킨다. 플레이어는 원점에 붙어 서 있다 */
function advance(enemy: EnemyState, seconds: number): EnemyState {
  let current = enemy;
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    current = stepEnemyStrike(current, 0, 0, FRAME);
  }
  return current;
}

describe("적 공격 단계", () => {
  it("사거리에 들어오면 준비부터 시작한다", () => {
    // Arrange · Act
    const struck = stepEnemyStrike(makeEnemy(), 0, 0, FRAME);

    // Assert — 곧바로 판정이 살아나면 예고가 없는 것과 같다
    expect(struck.strikePhase).toBe("windup");
  });

  it("사거리 밖이면 휘두르지 않는다", () => {
    const far = makeEnemy({ z: ENEMY_STRIKE.range + 3 });
    expect(advance(far, 2).strikePhase).toBe("ready");
  });

  it("준비 시간이 지나야 판정이 살아난다", () => {
    // 준비 중간에는 아직 판정이 없다
    const middle = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds * 0.6);
    expect(middle.strikePhase, `${middle.strikePhase}`).toBe("windup");

    const after = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds + FRAME * 2);
    expect(after.strikePhase, `${after.strikePhase}`).toBe("active");
  });

  it("맞고 밀리는 중에는 휘두르던 것을 접는다", () => {
    /*
     * 접지 않으면 넉백으로 날아가는 동안 판정이 살아나 때린 쪽이 맞는다.
     */
    const swinging = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds + FRAME * 2);
    expect(swinging.strikePhase).toBe("active");

    const knocked = stepEnemyStrike({ ...swinging, mood: "hit" }, 0, 0, FRAME);
    expect(knocked.strikePhase).toBe("ready");
  });

  it("쓰러진 적은 휘두르지 않는다", () => {
    const downed = advance(makeEnemy({ mood: "down" }), 2);
    expect(downed.strikePhase).toBe("ready");
  });

  it("준비가 화면에 드러난다", () => {
    /*
     * 상태기만 넣고 렌더가 모르면 플레이어에게는 예전과 똑같다.
     * 렌더는 이 값 하나로 경고색을 올린다.
     */
    expect(strikeWindupProgress(makeEnemy())).toBeNull();

    const early = advance(makeEnemy(), FRAME * 2);
    const late = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds * 0.9);
    const earlyProgress = strikeWindupProgress(early) ?? -1;
    const lateProgress = strikeWindupProgress(late) ?? -1;

    expect(earlyProgress, `early ${earlyProgress}`).toBeGreaterThan(0);
    expect(lateProgress, `late ${lateProgress} vs early ${earlyProgress}`).toBeGreaterThan(
      earlyProgress,
    );
    // 판정이 살아 있는 동안은 최대로 유지된다 — 맞는 순간 색이 꺼지면 안 된다
    const active = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds + FRAME * 2);
    expect(strikeWindupProgress(active)).toBe(1);
  });

  it("준비 시간이 사람이 반응할 만큼 길다", () => {
    // 플레이어의 가장 짧은 준비 시간을 그대로 쓰면 예고가 있으나 마나다
    const quickest = Math.min(...WEAPON_ORDER.map((id) => WEAPONS[id].timing.windupSeconds));
    expect(ENEMY_STRIKE.windupSeconds).toBeGreaterThan(quickest * 3);
    expect(ENEMY_STRIKE.windupSeconds).toBeGreaterThan(0.3);
  });
});

describe("플레이어 피격", () => {
  it("옆에 서 있기만 해서는 체력이 깎이지 않는다", () => {
    /*
     * 이 프로젝트에서 실제로 일어났던 실패다. 여기가 무너지면 "싸우지
     * 않았는데 죽는다"가 그대로 돌아온다.
     */
    let combat = createPlayerCombat();
    const enemy = makeEnemy();

    // 접근만 계속한다 — 공격 단계는 진행시키지 않는다
    for (let i = 0; i < 300; i += 1) {
      combat = stepPlayerCombat(combat, [enemy], 0, 0, FRAME).state;
    }

    expect(combat.hp, `hp ${combat.hp}`).toBe(PLAYER_COMBAT.maxHp);
    expect(combat.downed).toBe(false);
  });

  it("준비 중에는 깎이지 않고 판정에서 깎인다", () => {
    const windup = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds * 0.5);
    const duringWindup = stepPlayerCombat(createPlayerCombat(), [windup], 0, 0, FRAME);
    expect(duringWindup.state.hp).toBe(PLAYER_COMBAT.maxHp);
    expect(duringWindup.struck).toBe(false);

    const active = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds + FRAME * 2);
    const duringActive = stepPlayerCombat(createPlayerCombat(), [active], 0, 0, FRAME);
    expect(duringActive.struck).toBe(true);
    expect(duringActive.state.hp).toBe(PLAYER_COMBAT.maxHp - PLAYER_COMBAT.contactDamage);
  });

  it("판정이 여러 프레임 살아 있어도 한 번만 깎인다", () => {
    // 무적 시간이 그 역할이다. 없으면 0.16초 동안 매 프레임 깎인다
    const active = advance(makeEnemy(), ENEMY_STRIKE.windupSeconds + FRAME * 2);
    let combat = createPlayerCombat();
    for (let i = 0; i < 8; i += 1) {
      combat = stepPlayerCombat(combat, [active], 0, 0, FRAME).state;
    }
    expect(combat.hp).toBe(PLAYER_COMBAT.maxHp - PLAYER_COMBAT.contactDamage);
  });
});

describe("스폰 지점 비우기", () => {
  it("시작 자리 주변에는 로봇이 서지 않는다", () => {
    /*
     * 조작 설명을 읽는 동안 다가와 때리면 배우기 전에 죽는다.
     */
    const spawn = { x: 23.5, z: 23.5, radius: COMBAT_TUNING.spawnClearanceRadius };
    const enemies = createEnemies(24, 141, undefined, undefined, spawn);

    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.x - spawn.x, enemy.z - spawn.z);
      expect(
        distance,
        `(${enemy.x.toFixed(1)}, ${enemy.z.toFixed(1)}) → ${distance.toFixed(1)}m`,
      ).toBeGreaterThanOrEqual(spawn.radius);
    }
  });

  it("비우는 반경이 인지 반경보다 넓다", () => {
    // 좁으면 시작하자마자 인지 범위에 걸려 곧장 달려온다
    expect(COMBAT_TUNING.spawnClearanceRadius).toBeGreaterThan(COMBAT_TUNING.aggroRadius);
  });

  it("예약 구역을 주지 않으면 예전대로 도시 전역에 흩어진다", () => {
    // 기존 호출부가 있다면 동작이 달라지면 안 된다
    const enemies = createEnemies(24, 141, undefined, undefined);
    expect(enemies).toHaveLength(24);
  });
});
