import { describe, expect, it } from "vitest";

import { COMBAT_TUNING } from "@/game/combat/combatSim";
import { LOCOMOTION } from "@/game/config/tuning";
import {
  nextWeapon,
  swingSeconds,
  weaponRange,
  WEAPON_ORDER,
  WEAPONS,
  type WeaponId,
} from "@/game/combat/weapons";

/*
 * 무기가 **정말 서로 다른가.**
 *
 * 트레일러의 전투가 한 리듬으로 읽히지 않는 이유는 무기가 계속 바뀌기
 * 때문이다(TRAILER_FEATURE_ANALYSIS 「3.4 실시간 액션 전투」). 그런데 이름과
 * 모양만 다르고 수치가 비슷하면 고를 이유가 없다 — 도깨비 넷을 능력 규칙으로
 * 갈라 둔 것과 같은 문제다. 그래서 「다르다」를 검사로 고정한다.
 */
describe("무기 정의", () => {
  it("순서 목록이 정의된 무기를 모두 담는다", () => {
    // 목록에서 빠진 무기는 바꿔 가며 쓸 수 없다 — 정의만 있고 손에 잡히지 않는다
    const defined = Object.keys(WEAPONS).sort();
    expect([...WEAPON_ORDER].sort(), `order=${WEAPON_ORDER.join(",")}`).toEqual(defined);
  });

  it("id가 자기 자리와 맞는다", () => {
    // 표의 열쇠와 값 안의 id가 어긋나면 순환이 엉뚱한 무기로 간다
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].id, `${id} 자리에 ${WEAPONS[id].id}가 있다`).toBe(id);
    }
  });

  it("무기마다 이름과 한 줄 소개가 있다", () => {
    // HUD가 무엇을 들고 있는지 보여 주지 못하면 바꿔도 바뀐 줄 모른다
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].name.length, `${id} 이름이 비었다`).toBeGreaterThan(0);
      expect(WEAPONS[id].tagline.length, `${id} 소개가 비었다`).toBeGreaterThan(0);
    }
  });
});

describe("무기 사이의 관계", () => {
  it("두 무기가 같은 손맛이 아니다", () => {
    /*
     * 길이·사거리·피해 셋 중 **둘 이상**이 달라야 한다. 하나만 다르면
     * 「조금 센 같은 무기」라 바꿀 이유가 생기지 않는다.
     */
    for (let i = 0; i < WEAPON_ORDER.length; i += 1) {
      for (let j = i + 1; j < WEAPON_ORDER.length; j += 1) {
        const a = WEAPONS[WEAPON_ORDER[i]];
        const b = WEAPONS[WEAPON_ORDER[j]];
        const differences = [
          swingSeconds(a) !== swingSeconds(b),
          a.reachMeters !== b.reachMeters,
          a.damage !== b.damage,
        ].filter(Boolean).length;
        expect(differences, `${a.id} vs ${b.id}: 다른 축이 ${differences}개뿐`).toBeGreaterThan(1);
      }
    }
  });

  it("느린 무기가 더 세다", () => {
    /*
     * 빠르고 세면 다른 무기를 들 이유가 없다. 정렬해 두고 「길수록 피해가
     * 크다」를 본다 — 순서가 뒤집히면 그 무기는 그냥 열등품이다.
     */
    const bySpeed = [...WEAPON_ORDER].sort(
      (a, b) => swingSeconds(WEAPONS[a]) - swingSeconds(WEAPONS[b]),
    );
    for (let i = 1; i < bySpeed.length; i += 1) {
      const faster = WEAPONS[bySpeed[i - 1]];
      const slower = WEAPONS[bySpeed[i]];
      expect(
        slower.damage,
        `${slower.id}(${swingSeconds(slower)}초)가 ${faster.id}(${swingSeconds(faster)}초)보다 약하다`,
      ).toBeGreaterThanOrEqual(faster.damage);
    }
  });

  it("초당 피해량이 한쪽으로 기울지 않는다", () => {
    /*
     * 한 무기의 dps가 다른 것의 두 배면 나머지는 장식이다. 1.6배 안에 둔다 —
     * 차이는 「무엇을 상대하느냐」에서 나와야지 숫자에서 나오면 안 된다.
     */
    const rates = WEAPON_ORDER.map((id) => WEAPONS[id].damage / swingSeconds(WEAPONS[id]));
    const spread = Math.max(...rates) / Math.min(...rates);
    expect(
      spread,
      `dps 비율 ${spread.toFixed(2)} (${rates.map((rate) => rate.toFixed(2)).join(", ")})`,
    ).toBeLessThan(1.6);
  });

  it("망치는 로봇을 한 방에 눕힌다", () => {
    /*
     * 느린 무기의 값은 여기에 있다. 로봇 체력(2)보다 피해가 작으면 「느리기만
     * 한 무기」가 되고, 위의 dps 검사만으로는 그것을 잡지 못한다.
     */
    expect(WEAPONS.hammer.damage, "망치 피해가 로봇 체력보다 작다").toBeGreaterThanOrEqual(
      COMBAT_TUNING.maxHp,
    );
  });

  it("근접 사거리가 사람 손이 닿을 범위 안에 있다", () => {
    // 인지 반경(16m)에 가까워지면 다가갈 이유가 없어져 근접이 원거리가 된다
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      if (weapon.kind !== "melee") continue;
      expect(weapon.reachMeters, `${id} 사거리 ${weapon.reachMeters}m`).toBeLessThan(
        COMBAT_TUNING.aggroRadius / 3,
      );
    }
  });

  it("근접이 하나뿐인 전투가 아니다 — 원거리가 적어도 하나 있다", () => {
    /*
     * 전부 근접이면 「달려가서 휘두르기」 한 가지로 돌아간다. 사수 로봇은
     * 멀리서 쏘는데 이쪽에 거리를 두는 수단이 없으면 그건 선택이 아니다.
     */
    const ranged = WEAPON_ORDER.filter((id) => WEAPONS[id].kind === "ranged");
    expect(ranged.length, `원거리 ${ranged.length}자루`).toBeGreaterThan(0);
  });

  it("원거리 무기만 탄을 가진다", () => {
    /*
     * 종류와 탄이 어긋나면 조용히 아무 일도 안 한다 — 원거리인데 탄이
     * 없으면 쏠 것이 없고, 근접인데 탄이 있으면 아무도 그것을 읽지 않는다.
     */
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      expect(weapon.bolt !== null, `${id}: kind=${weapon.kind}, bolt=${weapon.bolt}`).toBe(
        weapon.kind === "ranged",
      );
    }
  });

  it("원거리 사거리가 적이 나를 알아보는 거리보다 길다", () => {
    /*
     * 짧으면 **이미 나를 본 적에게만** 쏠 수 있다. 그러면 「멀리서 먼저
     * 건다」가 성립하지 않아 원거리를 드는 이유가 사라진다.
     */
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      if (weapon.kind !== "ranged") continue;
      expect(weaponRange(weapon), `${id} 사거리 ${weaponRange(weapon)}m`).toBeGreaterThan(
        COMBAT_TUNING.aggroRadius,
      );
    }
  });

  it("원거리는 붙은 적을 떼어내지 못한다", () => {
    /*
     * 멀리서도 때리는데 밀어내기까지 세면 근접을 들 이유가 없다. 원거리의
     * 넉백은 근접 중 가장 약한 것보다도 약해야 한다.
     */
    const meleeKnockback = WEAPON_ORDER.filter((id) => WEAPONS[id].kind === "melee").map(
      (id) => WEAPONS[id].knockbackScale,
    );
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      if (weapon.kind !== "ranged") continue;
      expect(weapon.knockbackScale, `${id} 넉백 ${weapon.knockbackScale}`).toBeLessThan(
        Math.min(...meleeKnockback),
      );
    }
  });

  it("탄이 달리기보다 빠르다", () => {
    /*
     * 걸어서 따라잡히는 탄은 무기가 아니다. 달리기(7.4m/s)보다 빨라야
     * 도망치는 로봇의 등에 닿는다.
     */
    for (const id of WEAPON_ORDER) {
      const bolt = WEAPONS[id].bolt;
      if (bolt === null) continue;
      expect(bolt.speed, `${id} 탄속 ${bolt.speed}m/s`).toBeGreaterThan(LOCOMOTION.run.maxSpeed);
    }
  });

  it("넉백이 무기 무게를 따라간다", () => {
    // 큰 것에 맞았는데 살짝 밀리면 눈과 수치가 따로 논다
    const light = WEAPONS.bat;
    const heavy = WEAPONS.hammer;
    expect(
      heavy.knockbackScale,
      `망치 ${heavy.knockbackScale} vs 방망이 ${light.knockbackScale}`,
    ).toBeGreaterThan(light.knockbackScale);
  });
});

describe("무기 바꾸기", () => {
  it("한 바퀴 돌면 제자리로 온다", () => {
    let id: WeaponId = WEAPON_ORDER[0];
    for (let step = 0; step < WEAPON_ORDER.length; step += 1) id = nextWeapon(id);
    expect(id, "순환이 제자리로 돌아오지 않는다").toBe(WEAPON_ORDER[0]);
  });

  it("한 번 누르면 반드시 다른 무기가 된다", () => {
    // 같은 것이 나오면 버튼이 아무 일도 안 한 것처럼 보인다
    for (const id of WEAPON_ORDER) {
      expect(nextWeapon(id), `${id}에서 바꿨는데 그대로다`).not.toBe(id);
    }
  });
});

describe("휘두르기 길이", () => {
  it("세 단계를 더한 값이다", () => {
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      expect(swingSeconds(weapon), `${id}`).toBeCloseTo(
        weapon.timing.windupSeconds + weapon.timing.activeSeconds + weapon.timing.recoverySeconds,
      );
    }
  });

  it("준비 시간이 적의 예고보다 짧다", () => {
    /*
     * 플레이어의 준비 시간은 **자기가 누른 버튼**이라 길면 조작이 늦게
     * 느껴진다. 적의 예고(0.5초)보다는 짧아야 「내 쪽이 굼뜨다」가 안 된다.
     */
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].timing.windupSeconds, `${id} 준비`).toBeLessThan(0.5);
    }
  });
});
