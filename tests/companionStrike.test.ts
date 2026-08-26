import { describe, expect, it } from "vitest";

import { createEnemies, resolveCompanionStrikes, type EnemyState } from "@/game/combat/combatSim";
import { COMBAT_TUNING } from "@/game/combat/combatSim";
import {
  canStrike,
  COMPANION_STRIKE,
  firstStrikeDelay,
  stepStrikeCooldown,
} from "@/game/dokebi/companionStrike";
import { swingSeconds, WEAPON_ORDER, WEAPONS } from "@/game/combat/weapons";

/*
 * 동료가 때린다.
 *
 * **한 번도 안 때렸다.** 전투가 붙으면 나와서 곁을 돌고 빛을 냈지만 능력이
 * 전부 빛·인지 반경·회복이라 로봇의 체력은 주인공만 깎았다 — 화면에서는
 * 넷이 함께 싸우는 것처럼 보이는데 실제로는 구경하고 있었다.
 *
 * 붙이면서 가장 조심한 것은 **주인공이 주인공으로 남는가**다. 넷이 붙으면
 * 로봇이 저절로 눕는 판이 되고, 그러면 무기를 고르는 일도 예고를 피하는
 * 일도 뜻이 없어진다.
 */

function at(x: number, z: number): EnemyState {
  return { ...createEnemies(1, 100)[0], x, z, mood: "chase" };
}

describe("주인공이 주인공으로 남는가", () => {
  it("한 대로는 로봇을 못 눕힌다", () => {
    // 동료 하나가 로봇을 한 방에 정리하면 주인공이 구경한다
    expect(
      COMPANION_STRIKE.damage,
      `동료 ${COMPANION_STRIKE.damage} vs 체력 ${COMBAT_TUNING.maxHp}`,
    ).toBeLessThan(COMBAT_TUNING.maxHp);
  });

  it("넷이 다 나와도 주인공보다 크게 잦지 않다", () => {
    /*
     * 활이 0.86초에 한 발이다. 넷이 각자 `intervalSeconds`마다 치므로
     * 초당 4/interval회다 — 주인공의 두 배를 넘으면 화면의 타격이 동료
     * 것으로 읽힌다.
     */
    const quickest = Math.min(...WEAPON_ORDER.map((id) => swingSeconds(WEAPONS[id])));
    const partyRate = 4 / COMPANION_STRIKE.intervalSeconds;
    const playerRate = 1 / quickest;
    expect(
      partyRate,
      `동료 넷 초당 ${partyRate.toFixed(1)}회 vs 주인공 ${playerRate.toFixed(1)}회`,
    ).toBeLessThan(playerRate * 2);
  });

  it("밀어내는 힘이 주인공보다 약하다", () => {
    // 세면 넷이 각자 다른 방향으로 밀어 로봇이 주인공에게 오지 않는다
    const weakest = Math.min(...WEAPON_ORDER.map((id) => Math.abs(WEAPONS[id].knockbackScale)));
    expect(COMPANION_STRIKE.knockbackScale).toBeLessThan(weakest);
  });

  it("곁을 거들 뿐 멀리까지 닿지 않는다", () => {
    // 적 인지 반경(16m)에 가까우면 주인공이 갈 필요가 없어진다
    expect(COMPANION_STRIKE.reachMeters).toBeLessThan(COMBAT_TUNING.aggroRadius / 2);
  });
});

describe("언제 치는가", () => {
  it("사라져 있으면 시계가 안 돈다", () => {
    /*
     * 돌면 도시를 걷는 내내 차올라, 전투가 붙는 **그 프레임에 넷이 한꺼번에**
     * 친다. 나와 있을 때만 줄어야 박자가 유지된다.
     */
    const away = stepStrikeCooldown(2, 10, false);
    expect(away).toBe(COMPANION_STRIKE.intervalSeconds);
  });

  it("나와 있으면 줄어든다", () => {
    expect(stepStrikeCooldown(1, 0.4, true)).toBeCloseTo(0.6, 6);
  });

  it("0 아래로 내려가지 않는다 — 큰 dt에 음수가 되면 계속 친다", () => {
    expect(stepStrikeCooldown(0.1, 5, true)).toBe(0);
  });

  it("0이 되면 칠 수 있다", () => {
    expect(canStrike(0)).toBe(true);
    expect(canStrike(0.01)).toBe(false);
  });

  it("넷이 서로 다른 박자로 시작한다", () => {
    // 같으면 넷이 아니라 하나가 네 배 세게 치는 것으로 보인다
    const delays = [0, 1, 2, 3].map((slot) => firstStrikeDelay(slot, 4));
    expect(new Set(delays).size, `${delays.join(", ")}`).toBe(4);
  });

  it("첫 타격도 한 주기를 넘겨 기다리지 않는다", () => {
    for (const slot of [0, 1, 2, 3]) {
      const delay = firstStrikeDelay(slot, 4);
      expect(delay, `${slot}번`).toBeGreaterThan(0);
      expect(delay, `${slot}번`).toBeLessThanOrEqual(COMPANION_STRIKE.intervalSeconds);
    }
  });
});

describe("누구를 치는가", () => {
  const reach = COMPANION_STRIKE.reachMeters;
  const hit = (enemies: EnemyState[], x: number, z: number) =>
    resolveCompanionStrikes(enemies, [{ x, z }], reach, COMPANION_STRIKE.damage, 0);

  it("사거리 안의 적이 맞는다", () => {
    const enemies = [at(0, 2)];
    const struck = hit(enemies, 0, 0);
    expect(struck.length).toBe(1);
    expect(enemies[0].hp).toBeLessThan(COMBAT_TUNING.maxHp);
  });

  it("사거리 밖은 안 맞는다", () => {
    const enemies = [at(0, reach + 1)];
    expect(hit(enemies, 0, 0)).toEqual([]);
    expect(enemies[0].hp).toBe(COMBAT_TUNING.maxHp);
  });

  it("가장 가까운 하나만 맞는다 — 넷이 광역이면 청소가 된다", () => {
    const enemies = [at(0, 3), at(0, 1)];
    const struck = hit(enemies, 0, 0);
    expect(struck.length).toBe(1);
    expect(enemies[1].hp, "가까운 쪽이 안 맞았다").toBeLessThan(COMBAT_TUNING.maxHp);
    expect(enemies[0].hp, "먼 쪽이 맞았다").toBe(COMBAT_TUNING.maxHp);
  });

  it("누운 적은 안 친다 — 시체를 두들기는 그림이 된다", () => {
    const enemies = [{ ...at(0, 1), mood: "down" as const }];
    expect(hit(enemies, 0, 0)).toEqual([]);
  });

  it("칠 것이 없으면 아무 일도 없다", () => {
    expect(resolveCompanionStrikes([], [{ x: 0, z: 0 }], reach, 1, 0)).toEqual([]);
  });

  it("동료 둘이 각자 하나씩 친다", () => {
    const enemies = [at(0, 1), at(20, 1)];
    const struck = resolveCompanionStrikes(
      enemies,
      [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
      ],
      reach,
      COMPANION_STRIKE.damage,
      0,
    );
    expect(struck.length).toBe(2);
  });
});
