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
  it("정의된 무기는 전부 손에 잡힌다", () => {
    /*
     * 한동안 「드는 것이거나 **은퇴한 것**이거나」로 느슨하게 두었다. 은퇴
     * 목록에 넷을 적어 두고 정의를 남겨 뒀는데, 그 넷이 전부 근접이라
     * **부채꼴 판정·휘두른 자국·중복 타격 방지가 통째로 살아 있으면서 한 번도
     * 안 돌았다.** 화면에 안 나오는 코드를 검사가 지켜 주고 있었던 셈이다.
     *
     * 규칙을 원래대로 되돌린다: **정의만 있고 손에 잡히지 않는 무기는 없다.**
     */
    const defined = Object.keys(WEAPONS).sort();
    expect([...WEAPON_ORDER].sort(), `드는 것=${WEAPON_ORDER.join(",")}`).toEqual(defined);
  });

  it("주인공은 활과 광선총을 든다", () => {
    // 이 게임의 손맛을 정하는 줄이다 — 바꾸려면 여기부터 고쳐야 한다
    expect([...WEAPON_ORDER]).toEqual(["bow", "beam"]);
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
        // 사거리는 `weaponRange`로 잰다 — 탄 속도 × 수명이 실제 사거리다
        const differences = [
          swingSeconds(a) !== swingSeconds(b),
          weaponRange(a) !== weaponRange(b),
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

  it("모든 무기가 탄을 가진다", () => {
    /*
     * 근접이 사라지면서 이 규칙이 타입으로 옮겨 갔다(`bolt: BoltSpec`).
     * 그래도 값으로 한 번 더 본다 — 타입은 표를 손으로 고칠 때 지켜 주지만,
     * 「탄이 실제로 쏠 만한 값인가」는 못 본다.
     */
    for (const id of WEAPON_ORDER) {
      const bolt = WEAPONS[id].bolt;
      expect(bolt.speed, `${id} 탄속이 0이다`).toBeGreaterThan(0);
      expect(bolt.lifeSeconds, `${id} 탄 수명이 0이다`).toBeGreaterThan(0);
    }
  });

  it("원거리 사거리가 적이 나를 알아보는 거리보다 길다", () => {
    /*
     * 짧으면 **이미 나를 본 적에게만** 쏠 수 있다. 그러면 「멀리서 먼저
     * 건다」가 성립하지 않아 원거리를 드는 이유가 사라진다.
     */
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      expect(weaponRange(weapon), `${id} 사거리 ${weaponRange(weapon)}m`).toBeGreaterThan(
        COMBAT_TUNING.aggroRadius,
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

  it("광선총은 밀지 않고 끌어당긴다 — 넉백이 음수인 무기가 하나 있다", () => {
    /*
     * 이 게임은 도깨비를 **잡아서 친구로 만드는** 게임이다. 전부 밀어내는
     * 무기뿐이면 「멀어지게 하기」밖에 못 한다 — 끌어오는 수단이 하나는
     * 있어야 도망가는 놈을 붙잡는 선택지가 생긴다.
     *
     * 전투 코드를 고쳐 만든 것이 아니다. `strikeEnemy`가 「밀어내는 방향 ×
     * 배율」로 속도를 정하므로 부호만 뒤집으면 끌어당김이 된다.
     */
    const pullers = WEAPON_ORDER.filter((id) => WEAPONS[id].knockbackScale < 0);
    expect(pullers.length, `끌어당기는 무기 ${pullers.length}자루`).toBe(1);
    expect(pullers[0]).toBe("beam");
  });

  it("끌어당겨도 적이 등 뒤로 지나가지 않는다", () => {
    /*
     * 세게 당기면 적이 **등 뒤로 지나가** 조준이 의미를 잃는다.
     *
     * 예전에는 「방망이보다 약한가」로 쟀다. 그 무기가 은퇴하면서 기준이
     * 사라졌고, 남은 무기(활 0.35)와 견주면 **광선총이 더 세게 당긴다**고
     * 나온다 — 그런데 그건 고장이 아니다. 재던 것이 애초에 다른 무기가
     * 아니라 **끌려오는 거리**였기 때문이다.
     *
     * 거리로 잰다. 속도가 `knockbackSpeed × 배율`이고 감쇠가 지수라,
     * 끌려오는 총 거리는 `속도 / 감쇠`다. 그것이 접근 정지 거리보다 짧으면
     * 적은 내 앞에서 멈춘다.
     */
    const speed = COMBAT_TUNING.knockbackSpeed * Math.abs(WEAPONS.beam.knockbackScale);
    const pulled = speed / COMBAT_TUNING.knockbackDamping;
    expect(pulled, `${pulled.toFixed(2)}m 끌려온다`).toBeLessThan(COMBAT_TUNING.standoffRadius);
  });

  it("두 무기가 서로 다른 거리를 맡는다", () => {
    /*
     * 사거리가 비슷하면 둘 중 제일 센 것만 남는다. 「중간·멀리」로 갈라져
     * 있어야 무엇을 들지가 상황으로 정해진다.
     */
    const ranges = WEAPON_ORDER.map((id) => weaponRange(WEAPONS[id])).sort((a, b) => a - b);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(
        ranges[i] / ranges[i - 1],
        `사거리 ${ranges[i - 1].toFixed(1)}m와 ${ranges[i].toFixed(1)}m가 너무 가깝다`,
      ).toBeGreaterThan(1.2);
    }
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
