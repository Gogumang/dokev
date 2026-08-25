/**
 * 숫자키로 무기를 곧장 고를 수 있는가.
 *
 * 무기가 여섯이 되면서 순환(Q)만으로는 원하는 것까지 최대 다섯 번을 눌러야
 * 한다. 전투 중에는 그 다섯 번이 곧 맞는 횟수라, 화면에서 눈을 떼게 된다.
 *
 * 자리 번호는 **따로 두지 않는다** — `WEAPON_ORDER`가 곧 번호다. 별도 표를
 * 두면 순서를 바꿀 때 화면의 「3」과 손의 「3」이 갈라진다.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { weaponAtSlot, WEAPON_ORDER, WEAPONS } from "@/game/combat/weapons";
import { CONTROLS } from "@/game/systems/controls";

describe("weaponAtSlot", () => {
  it("자리 번호가 목록 순서와 같다", () => {
    for (let slot = 1; slot <= WEAPON_ORDER.length; slot += 1) {
      expect(weaponAtSlot(slot), `${slot}번`).toBe(WEAPON_ORDER[slot - 1]);
    }
  });

  it("드는 무기에는 모두 번호가 있다", () => {
    /*
     * 은퇴한 무기에는 번호가 없다 — 그게 은퇴의 뜻이다. 드는 것만 셈한다.
     */
    const reachable = new Set(
      Array.from({ length: WEAPON_ORDER.length }, (_, i) => weaponAtSlot(i + 1)),
    );
    expect(reachable.size).toBe(WEAPON_ORDER.length);
  });

  it("범위 밖이면 아무 일도 일어나지 않는다", () => {
    /*
     * `nextWeapon`처럼 시작 무기로 되돌리지 않는다. 저 쪽은 낡은 저장값을
     * 복구하는 자리라 무엇이든 하나를 골라야 하고, 이 쪽은 **사람이 방금
     * 누른 키**다 — 7을 눌렀는데 무기가 바뀌면 그게 버그다.
     */
    expect(weaponAtSlot(0)).toBeNull();
    expect(weaponAtSlot(WEAPON_ORDER.length + 1)).toBeNull();
    expect(weaponAtSlot(-1)).toBeNull();
    expect(weaponAtSlot(1.5)).toBeNull();
    expect(weaponAtSlot(Number.NaN)).toBeNull();
  });
});

describe("숫자키 배선", () => {
  const input = readFileSync("src/game/systems/input.ts", "utf8");

  it("숫자키를 실제로 읽는다", () => {
    // 함수만 있고 걸지 않으면 화면에서는 아무 일도 안 일어난다
    expect(input, "Digit 키를 보지 않는다").toMatch(/Digit/);
    expect(input, "weaponAtSlot을 부르지 않는다").toContain("weaponAtSlot(");
  });

  it("숫자키가 순환보다 뒤에 있다 — 같은 프레임이면 직접 고른 쪽이 이긴다", () => {
    /*
     * 「3번을 눌렀는데 4번이 잡히는」 일이 없어야 손이 믿는다. 순서가
     * 뒤집히면 순환이 나중에 덮어쓴다.
     */
    const cycleAt = input.indexOf("link.weapon = nextWeapon(");
    const slotAt = input.indexOf("weaponAtSlot(");
    expect(cycleAt, "순환 배선이 없다").toBeGreaterThan(-1);
    expect(slotAt, "숫자키 배선이 없다").toBeGreaterThan(-1);
    expect(slotAt, `순환 ${cycleAt} / 숫자키 ${slotAt}`).toBeGreaterThan(cycleAt);
  });

  it("조작표가 숫자키를 안내한다", () => {
    /*
     * 안내에 없는 조작은 없는 것과 같다 — 포토 모드(P)가 바인딩만 있고
     * 어느 표에도 없어 「읽어서는 알 수 없는 기능」이던 적이 있다.
     */
    const row = CONTROLS.find((entry) => entry.id === "weapon");
    expect(row, "무기 줄이 없다").toBeDefined();
    expect(row?.keyboard, `안내 문구: ${row?.keyboard}`).toMatch(/1[~-]\d/);
  });
});
