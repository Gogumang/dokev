import { describe, expect, it } from "vitest";

import { HUD_FOCUS, healthVisible, questExpanded, weaponVisible } from "@/game/systems/hudFocus";

/*
 * 상시 표시를 줄이는 규칙.
 *
 * DESIGN_GUIDE 「세계가 먼저, UI는 나중에」는 고정 HUD를 목표·상호작용·메뉴로
 * 제한하는데, 화면에는 체력·무기·속도계가 함께 늘 떠 있었다. 규칙은 문서에만
 * 있었고 화면은 그 반대였다.
 *
 * 여기서 지키려는 것은 **양쪽**이다: 필요 없을 때 사라지는 것과, 필요할 때
 * 반드시 나타나는 것. 뒤쪽이 깨지면 안 보이는 게임이 된다.
 */

const MAX_HP = 5;

describe("체력을 언제 보여 주는가", () => {
  it("가득 차 있고 아무 일도 없으면 사라진다", () => {
    // Given — 다치지 않았고 대장도 없다
    const seconds = HUD_FOCUS.healthLingerSeconds + 1;

    // When
    const visible = healthVisible(MAX_HP, MAX_HP, false, false, seconds);

    // Then
    expect(visible).toBe(false);
  });

  it("한 칸이라도 줄면 보인다", () => {
    expect(healthVisible(MAX_HP - 1, MAX_HP, false, false, 99)).toBe(true);
  });

  it("쓰러지면 보인다", () => {
    // 쓰러진 순간은 체력이 0이지만, 「곧 일어납니다」를 띄우는 것이 이 패널이다
    expect(healthVisible(0, MAX_HP, true, false, 99)).toBe(true);
  });

  it("대장과 교전 중이면 맞기 전에도 보인다", () => {
    /*
     * 맞고 나서야 뜨면 **첫 대를 맞을 때 화면에 없다.** 한 대에 5분의 1이
     * 날아가는 상대 앞에서는 그 한 대가 늦다.
     */
    expect(healthVisible(MAX_HP, MAX_HP, false, true, 99)).toBe(true);
  });

  it("다 회복한 직후에는 잠시 남는다", () => {
    /*
     * 마지막 칸이 차는 순간 사라지면 **다 찼는지 확인할 틈이 없다.** 회복이
     * 끝났다는 것을 보고 나서 사라져야 한다.
     */
    expect(healthVisible(MAX_HP, MAX_HP, false, false, 0)).toBe(true);
    expect(healthVisible(MAX_HP, MAX_HP, false, false, HUD_FOCUS.healthLingerSeconds)).toBe(false);
  });
});

describe("무기 이름을 언제 보여 주는가", () => {
  it("바꾼 직후에만 뜬다", () => {
    expect(weaponVisible(0)).toBe(true);
    expect(weaponVisible(HUD_FOCUS.weaponSeconds - 0.1)).toBe(true);
    expect(weaponVisible(HUD_FOCUS.weaponSeconds)).toBe(false);
  });

  it("읽을 수 있을 만큼은 남는다", () => {
    // 「장난감 방망이 · 2m」를 눈으로 잡기 전에 사라지면 없는 것과 같다
    expect(HUD_FOCUS.weaponSeconds).toBeGreaterThan(1.5);
  });
});

describe("목표 패널을 언제 접는가", () => {
  it("바뀐 직후에는 전문을 펼친다", () => {
    expect(questExpanded(0)).toBe(true);
  });

  it("지나면 접힌다", () => {
    expect(questExpanded(HUD_FOCUS.questSeconds)).toBe(false);
  });

  it("힌트 한 줄을 읽을 시간은 준다", () => {
    /*
     * 「G로 가로등 꼭대기에 붙었다가 뛰어내린 뒤 Space를 계속 누르세요」가
     * 가장 긴 힌트다. 달리면서 읽는 글이라 넉넉해야 한다.
     */
    expect(HUD_FOCUS.questSeconds).toBeGreaterThan(6);
  });
});
