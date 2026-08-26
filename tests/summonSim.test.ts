import { describe, expect, it } from "vitest";

import { BOSS } from "@/game/combat/bossSim";
import {
  canSummon,
  createSummon,
  memberPosition,
  requestSummon,
  roleForDokebi,
  staggerHitsWithMark,
  stepSummon,
  SUMMON,
  type SummonState,
} from "@/game/combat/summonSim";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";

/*
 * 보스전 도깨비 소환.
 *
 * 「불렀더니 무언가 나온다」만 재면 절반이다. 이 기능이 하려는 말은 **도깨비마다
 * 다른 일을 하고, 많이 만날수록 전투가 달라진다**는 것이라, 역할이 실제로 갈리는지와
 * 만난 수가 결과를 바꾸는지를 같이 봐야 뜻이 있다.
 */

const BOSS_AT = { x: 10, z: -4, down: false };

/** 소환된 상태를 만들어 준다. 검사마다 같은 두 줄을 되풀이하지 않으려고 뺐다 */
function summoned(met = [...DOKEBI_ORDER]): SummonState {
  return requestSummon(createSummon(), met);
}

/** dt를 잘게 쪼개 seconds만큼 진행하고 결과를 합산한다 */
function advance(state: SummonState, seconds: number, boss = BOSS_AT) {
  const step = 1 / 60;
  let current = state;
  let damage = 0;
  let heal = 0;
  let markHits = 0;
  let bursts = 0;
  let lureSeen = false;

  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    const tick = stepSummon(current, step, boss);
    current = tick.state;
    damage += tick.damage;
    heal += tick.heal;
    markHits += tick.markHits;
    bursts += tick.bursts.length;
    if (tick.lureAt) lureSeen = true;
  }

  return { state: current, damage, heal, markHits, bursts, lureSeen };
}

describe("부를 수 있는 조건", () => {
  it("보스가 멀면 부를 수 없다", () => {
    // Arrange
    const state = createSummon();

    // Act
    const near = canSummon(state, SUMMON.callRadius - 1, ["chorong"]);
    const far = canSummon(state, SUMMON.callRadius + 1, ["chorong"]);

    // Assert
    expect(near, "부를 거리 안인데 막혔다").toBe(true);
    expect(far, "부를 거리 밖인데 통과했다").toBe(false);
  });

  it("만난 도깨비가 없으면 부를 수 없다 — 쿨다운만 먹는 소환을 막는다", () => {
    expect(canSummon(createSummon(), 0, [])).toBe(false);
  });

  it("이미 나와 있거나 쿨다운 중이면 부를 수 없다", () => {
    const active = summoned();
    expect(canSummon(active, 0, ["chorong"]), "나와 있는데 또 불렸다").toBe(false);

    const { state: cooling } = advance(active, SUMMON.durationSeconds + 1);
    expect(cooling.phase, `단계가 ${cooling.phase}다`).toBe("cooling");
    expect(canSummon(cooling, 0, ["chorong"]), "쿨다운 중인데 불렸다").toBe(false);
  });

  it("부를 거리가 보스 인지 반경보다 넓다 — 마주치기 전에 준비할 수 있어야 한다", () => {
    expect(
      SUMMON.callRadius,
      `부르는 거리 ${SUMMON.callRadius}m / 보스 인지 ${BOSS.aggroRadius}m`,
    ).toBeGreaterThan(BOSS.aggroRadius);
  });
});

describe("만난 도깨비를 전부 부른다", () => {
  it("만난 수만큼 나온다", () => {
    expect(summoned(["chorong"]).members).toHaveLength(1);
    expect(summoned(["chorong", "jajeong"]).members).toHaveLength(2);
    expect(summoned([...DOKEBI_ORDER]).members).toHaveLength(DOKEBI_ORDER.length);
  });

  it("한 덩어리로 붙어 있지 않다 — 시작 각도가 서로 다르다", () => {
    const angles = summoned([...DOKEBI_ORDER]).members.map((member) => member.angle);
    expect(new Set(angles).size, `각도 ${angles.join(", ")}`).toBe(angles.length);
  });

  it("부른 순간 전부 동시에 터지지 않는다", () => {
    const strikes = summoned([...DOKEBI_ORDER]).members.map((member) => member.strikeIn);
    expect(new Set(strikes).size, `첫 발동 ${strikes.join(", ")}`).toBe(strikes.length);
    for (const strikeIn of strikes) {
      expect(strikeIn, `첫 발동이 ${strikeIn}초다`).toBeGreaterThan(0);
    }
  });

  it("아무도 만나지 않았으면 상태가 그대로다", () => {
    const before = createSummon();
    expect(requestSummon(before, [])).toBe(before);
  });
});

describe("도깨비마다 다른 일을 한다", () => {
  it("역할이 넷 다 다르다 — 이름만 다르고 효과가 같으면 부를 이유가 없다", () => {
    const roles = DOKEBI_ORDER.map((id) => roleForDokebi(id));
    expect(new Set(roles).size, `역할 ${roles.join(", ")}`).toBe(DOKEBI_ORDER.length);
  });

  it("「반딧불」만 피해를 준다", () => {
    const alone = advance(summoned(["chorong"]), SUMMON.durationSeconds);
    const others = advance(summoned(["geueum", "mulbineul", "jajeong"]), SUMMON.durationSeconds);

    expect(alone.damage, `초롱 혼자 ${alone.damage}`).toBeGreaterThan(0);
    expect(others.damage, `나머지 셋이 ${others.damage}만큼 때렸다`).toBe(0);
  });

  /*
   * 이 검사가 이 기능의 요점이다.
   *
   * 처음에는 자정이 피해였는데 자정은 **대장을 눕혀야 열린다.** 첫 대장전에는
   * 피해를 주는 역할이 아예 없어서 표식·유인·회복만 돌았다 — 이기는 데 필요한
   * 것이 이기고 나서 열리는 순환이었다. 넷을 다 모아 놓고 봐야만 보였다.
   */
  it("첫 대장전에 나올 수 있는 도깨비만으로도 피해가 들어간다", () => {
    const firstFight = DOKEBI_ORDER.filter((id) => !DOKEBI[id].requiresBoss);
    expect(firstFight.length, "대장 전에 만날 수 있는 도깨비가 없다").toBeGreaterThan(0);

    const tick = advance(summoned(firstFight), SUMMON.durationSeconds);
    expect(
      tick.damage,
      `대장 전에 만날 수 있는 ${firstFight.join("·")}가 12초 동안 ${tick.damage}만큼 때렸다`,
    ).toBeGreaterThan(0);
  });

  it("늘 곁에 있는 도깨비가 피해를 맡는다 — 조건이 붙으면 또 못 만날 수 있다", () => {
    const damaging = DOKEBI_ORDER.filter((id) => roleForDokebi(id) === "burst");
    expect(damaging.length, "피해 역할이 없다").toBeGreaterThan(0);
    for (const id of damaging) {
      const spirit = DOKEBI[id];
      expect(spirit.requiresBoss, `${spirit.name}이 대장을 눕혀야 열린다 — 순환이다`).toBe(false);
      expect(spirit.requiredDefeats, `${spirit.name}에 처치 조건이 붙어 있다`).toBe(0);
      expect(spirit.requiresQuest, `${spirit.name}에 여정 조건이 붙어 있다`).toBe(false);
    }
  });

  it("「물무늬」만 회복시킨다", () => {
    const alone = advance(summoned(["mulbineul"]), SUMMON.durationSeconds);
    const others = advance(summoned(["chorong", "geueum", "jajeong"]), SUMMON.durationSeconds);

    expect(alone.heal, `물비늘 혼자 ${alone.heal}`).toBeGreaterThan(0);
    expect(others.heal, `나머지 셋이 ${others.heal}만큼 회복시켰다`).toBe(0);
  });

  it("「잿불」만 보스의 시선을 끈다", () => {
    const lure = advance(summoned(["geueum"]), 1);
    const others = advance(summoned(["chorong", "mulbineul", "jajeong"]), 1);

    expect(lure.lureSeen, "잿불이 나왔는데 유인 자리가 없다").toBe(true);
    expect(others.lureSeen, "잿불이 없는데 유인 자리가 생겼다").toBe(false);
  });

  it("유인 자리는 보스 둘레 궤도 위다 — 렌더가 그리는 자리와 같아야 한다", () => {
    const state = summoned(["geueum"]);
    const tick = stepSummon(state, 1 / 60, BOSS_AT);

    expect(tick.lureAt, "유인 자리가 없다").not.toBeNull();
    const lureAt = tick.lureAt ?? { x: 0, z: 0 };
    const distance = Math.hypot(lureAt.x - BOSS_AT.x, lureAt.z - BOSS_AT.z);
    expect(distance, `보스에서 ${distance.toFixed(2)}m`).toBeCloseTo(SUMMON.orbitRadius, 5);
  });

  it("「먼 불빛」은 피해가 아니라 빈틈을 만든다", () => {
    const mark = advance(summoned(["jajeong"]), SUMMON.durationSeconds);

    expect(mark.markHits, `표식 ${mark.markHits}회`).toBeGreaterThan(0);
    expect(mark.damage, "표식이 피해로 새어 나갔다").toBe(0);
    expect(staggerHitsWithMark(true), "표식이 붙었는데 빈틈이 그대로다").toBeLessThan(
      staggerHitsWithMark(false),
    );
  });

  it("표식이 붙어도 한 대로 비틀거리지는 않는다", () => {
    expect(staggerHitsWithMark(true)).toBeGreaterThanOrEqual(1);
  });
});

describe("많이 만날수록 전투가 달라진다", () => {
  it("도깨비가 늘면 터지는 연출도 늘어난다", () => {
    const one = advance(summoned(["jajeong"]), SUMMON.durationSeconds);
    const all = advance(summoned([...DOKEBI_ORDER]), SUMMON.durationSeconds);

    expect(all.bursts, `하나 ${one.bursts}회 / 넷 ${all.bursts}회`).toBeGreaterThan(one.bursts);
  });

  it("연출 좌표가 궤도 위에 있다", () => {
    const state = summoned([...DOKEBI_ORDER]);
    const { bursts } = stepSummon(state, SUMMON.strikeIntervalSeconds, BOSS_AT);

    expect(bursts.length, "터진 것이 없다").toBeGreaterThan(0);
    for (const burst of bursts) {
      const distance = Math.hypot(burst.x - BOSS_AT.x, burst.z - BOSS_AT.z);
      expect(distance, `${burst.id}가 보스에서 ${distance.toFixed(2)}m`).toBeCloseTo(
        SUMMON.orbitRadius,
        5,
      );
    }
  });
});

describe("지속과 쿨다운", () => {
  it("지속이 끝나면 쿨다운으로 넘어가고 아무도 남지 않는다", () => {
    const { state } = advance(summoned(), SUMMON.durationSeconds + 0.1);

    expect(state.phase, `단계가 ${state.phase}다`).toBe("cooling");
    expect(state.members, "쿨다운인데 도깨비가 남아 있다").toHaveLength(0);
  });

  it("쿨다운이 끝나면 다시 부를 수 있다", () => {
    const { state } = advance(summoned(), SUMMON.cooldownSeconds + 0.2);

    expect(state.phase, `단계가 ${state.phase}다`).toBe("ready");
    expect(canSummon(state, 0, ["chorong"]), "쿨다운이 끝났는데 못 부른다").toBe(true);
  });

  it("쿨다운을 부른 시점부터 센다 — 지속 뒤부터 세면 간격이 상수보다 길어진다", () => {
    /*
     * 지속(12) + 쿨다운(26)으로 세면 38초마다 부를 수 있게 된다. 상수에 26이라
     * 적어 두고 실제로 38초면 값을 조정할 때마다 화면과 어긋난다.
     */
    const justBefore = advance(summoned(), SUMMON.cooldownSeconds - 0.2);
    expect(justBefore.state.phase, "쿨다운이 끝나기 전인데 준비 상태다").toBe("cooling");

    const justAfter = advance(summoned(), SUMMON.cooldownSeconds + 0.2);
    expect(justAfter.state.phase, "쿨다운이 지났는데 아직 대기 중이다").toBe("ready");
  });

  it("혼자 싸우는 구간이 남는다 — 소환이 보스전을 통째로 덮지 않는다", () => {
    expect(
      SUMMON.cooldownSeconds,
      `지속 ${SUMMON.durationSeconds}초 / 쿨다운 ${SUMMON.cooldownSeconds}초`,
    ).toBeGreaterThan(SUMMON.durationSeconds);
  });
});

describe("쓰러진 보스", () => {
  it("누워 있는 동안은 아무 능력도 나가지 않는다", () => {
    const down = { ...BOSS_AT, down: true };
    const result = advance(summoned([...DOKEBI_ORDER]), SUMMON.durationSeconds, down);

    expect(result.damage, `누운 보스를 ${result.damage}만큼 때렸다`).toBe(0);
    expect(result.heal, "누운 보스 옆에서 회복했다").toBe(0);
    expect(result.markHits, "누운 보스에 표식이 붙었다").toBe(0);
    expect(result.bursts, `연출이 ${result.bursts}회 터졌다`).toBe(0);
  });

  it("누워 있어도 시간은 흐른다 — 쿨다운이 멈추면 무한 소환이 된다", () => {
    const down = { ...BOSS_AT, down: true };
    const { state } = advance(summoned(), SUMMON.durationSeconds + 0.1, down);

    expect(state.phase, `단계가 ${state.phase}다`).toBe("cooling");
  });
});

describe("궤도", () => {
  it("도깨비가 보스 둘레를 돈다", () => {
    const state = summoned(["chorong"]);
    const first = memberPosition(state.members[0], BOSS_AT.x, BOSS_AT.z);

    const later = stepSummon(state, 0.5, BOSS_AT).state;
    const second = memberPosition(later.members[0], BOSS_AT.x, BOSS_AT.z);

    expect(
      Math.hypot(second.x - first.x, second.z - first.z),
      "자리가 그대로다 — 돌지 않는다",
    ).toBeGreaterThan(0.1);
  });

  it("궤도가 내려침 반경 안이다 — 도깨비도 위험을 함께 진다", () => {
    expect(
      SUMMON.orbitRadius,
      `궤도 ${SUMMON.orbitRadius}m / 내려침 ${BOSS.slamRadius}m`,
    ).toBeLessThan(BOSS.slamRadius);
  });
});
