import { describe, expect, it } from "vitest";

import { createEnemies, resolveCompanionStrikes, type EnemyState } from "@/game/combat/combatSim";
import { COMBAT_TUNING } from "@/game/combat/combatSim";
import {
  canStrike,
  companionBossDamage,
  COMPANION_STRIKE,
  firstStrikeDelay,
  stepStrikeCooldown,
} from "@/game/dokebi/companionStrike";
import { BOSS } from "@/game/combat/bossSim";
import { recordCompanionHits } from "@/game/combat/companionHits";
import { COMPANION_TUNING } from "@/game/dokebi/companionMotion";
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

/*
 * 대장에게도 넣는다.
 *
 * 세기를 따로 두지 않고 **닿는 거리에 값을 맡긴다.** 동료는 주인공 뒤를
 * 도므로 동료의 손이 대장에게 닿는다는 것은 곧 주인공이 내려치기 반경
 * 가까이 들어와 있다는 뜻이다 — 그 관계가 실제로 성립하는지를 잰다.
 */
describe("동료가 대장을 친다", () => {
  /** 대장 몸 반지름. `Enemies.tsx`의 BOSS_HIT_RADIUS와 같은 값이다 */
  const bossRadius = 1.9;

  it("닿으면 피해가 들어간다", () => {
    expect(companionBossDamage([{ x: 0, z: 0 }], 0, 6, bossRadius)).toBe(COMPANION_STRIKE.damage);
  });

  it("멀면 0이다 — 대장 앞까지 안 오면 몫이 없다", () => {
    expect(companionBossDamage([{ x: 0, z: 0 }], 0, 12, bossRadius)).toBe(0);
  });

  it("넷이 붙으면 넷 몫이 한꺼번에 들어간다", () => {
    const spots = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ];
    expect(companionBossDamage(spots, 0, 5, bossRadius)).toBe(COMPANION_STRIKE.damage * 4);
  });

  it("칠 자리가 없으면 0이다", () => {
    expect(companionBossDamage([], 0, 0, bossRadius)).toBe(0);
  });

  /*
   * 이것이 이 기능의 균형 전부다. 깨지면 동료가 **안전한 자리에서** 대장을
   * 깎게 되고, 그러면 예고를 보고 피하는 이 싸움이 기다리기만 하면 되는
   * 것이 된다.
   */
  it("동료의 손이 대장에 닿으면 주인공은 이미 내려치기 사정권이다", () => {
    /* 동료가 설 수 있는 가장 먼 자리 — 뒷줄(slot 2·3)이다 */
    const orbit = COMPANION_TUNING.followDistance + COMPANION_TUNING.slotDistanceStep;
    const companionReach = COMPANION_STRIKE.reachMeters + bossRadius;
    /* 동료가 대장 쪽으로 최대한 나가 있어도 주인공은 이만큼까지만 물러설 수 있다 */
    const playerAtFarthest = companionReach + orbit;

    expect(orbit, "동료가 주인공 뒤 몇 미터를 도는지").toBeGreaterThan(0);
    expect(
      playerAtFarthest,
      `동료가 닿는 가장 먼 자리(${playerAtFarthest}m)가 인지 반경(${BOSS.aggroRadius}m) 안이다`,
    ).toBeLessThan(BOSS.aggroRadius);
    /*
     * 동료가 대장 **반대쪽**에 있으면 주인공은 그만큼 더 들어와야 한다 —
     * 그 자리가 내려치기 반경 안이다.
     */
    expect(
      companionReach - orbit,
      `가장 나쁜 자리에서 주인공이 서는 곳(${companionReach - orbit}m)이 내려치기 반경(${BOSS.slamRadius}m) 안이다`,
    ).toBeLessThan(BOSS.slamRadius);
  });
});

/*
 * 배선. 값이 맞아도 실어 보내지 않으면 대장은 안 맞는다.
 *
 * 실제로 이 검사를 빠뜨린 채 `link.bossBoltDamage += ...` 한 줄을 지워
 * 봤더니 **모든 검사가 통과했다.** 규칙만 재고 배선을 안 재면 그렇게 된다.
 */
describe("동료의 타격을 로봇과 대장이 나눠 받는다", () => {
  function link() {
    return { bossX: 0, bossZ: 5, bossHittable: true, bossBoltDamage: 0 };
  }

  it("대장 피해를 탄과 같은 통로에 싣는다", () => {
    const boss = link();
    const hits = recordCompanionHits(boss, [{ x: 0, z: 0 }], [], 1.9);
    expect(hits.bossDamage).toBe(COMPANION_STRIKE.damage);
    expect(boss.bossBoltDamage, "`bossBoltDamage`에 안 실었다 — 대장이 안 맞는다").toBe(
      COMPANION_STRIKE.damage,
    );
  });

  it("맞힐 수 없는 대장에게는 안 넣는다 — 누워 있거나 아직 안 만났다", () => {
    const boss = { ...link(), bossHittable: false };
    expect(recordCompanionHits(boss, [{ x: 0, z: 0 }], [], 1.9).bossDamage).toBe(0);
    expect(boss.bossBoltDamage).toBe(0);
  });

  it("같은 자리 하나로 로봇과 대장을 **둘 다** 친다", () => {
    /*
     * 자리를 두 번 꺼내면 뒤쪽이 빈 목록을 받는다. 한 자리에서 둘이 다
     * 맞는지가 그 실수를 잡는다.
     */
    const boss = link();
    const enemies = [{ ...createEnemies(1, 40, 1)[0], x: 0, z: 2, hp: COMBAT_TUNING.maxHp }];
    const hits = recordCompanionHits(boss, [{ x: 0, z: 0 }], enemies, 1.9);
    expect(hits.struck.length, "로봇이 안 맞았다").toBe(1);
    expect(hits.bossDamage, "대장이 안 맞았다").toBe(COMPANION_STRIKE.damage);
  });
});
