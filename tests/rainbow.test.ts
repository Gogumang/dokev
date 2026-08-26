import { describe, expect, it } from "vitest";

import { colorDistance } from "@/game/core/color";
import { RAINBOW, rainbowAt, rainbowFlow, rainbowIndex } from "@/game/core/rainbow";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

/*
 * 어린이 상상 색.
 *
 * 이펙트가 전부 이 색상환 하나를 탄다 — 화살과 그 자국, 참격, 색종이,
 * 빠져나가는 빛, 갈고리 줄. 그래서 여기 색 하나가 잘못되면 **여섯 군데가
 * 동시에** 잘못된다. 팔레트가 지켜야 하는 것을 값으로 잰다.
 */

/** 위험 신호. 적이 쏘는 탄의 색(`Enemies.tsx`의 BOLT_COLOR) */
const ENEMY_BOLT = "#ff2f6a";

describe("팔레트가 무지개인가", () => {
  it("여섯 색이다 — 화살 자국 열두 마디가 정확히 두 바퀴를 돈다", () => {
    expect(RAINBOW.length).toBe(6);
  });

  it("여섯이 서로 다르다", () => {
    expect(new Set(RAINBOW).size).toBe(RAINBOW.length);
  });

  it("이웃한 색끼리 눈에 띄게 다르다", () => {
    /*
     * 리본은 이웃한 마디가 나란히 붙어 그려진다. 이웃이 서로 가까우면
     * 「무지개」가 아니라 **한 색의 그러데이션**으로 보인다.
     */
    for (let i = 0; i < RAINBOW.length; i += 1) {
      const next = RAINBOW[(i + 1) % RAINBOW.length];
      const distance = colorDistance(RAINBOW[i], next);
      expect(distance, `${RAINBOW[i]} → ${next}: ${distance.toFixed(0)}`).toBeGreaterThan(50);
    }
  });
});

describe("팔레트가 화면에서 살아남는가", () => {
  it("네 시간대 하늘 어디서도 묻히지 않는다", () => {
    // 색종이도 화살도 하늘을 배경으로 뜬다. 한 색만 묻혀도 그 색인 조각이 사라진다
    for (const color of RAINBOW) {
      for (const id of TIME_OF_DAY_ORDER) {
        const distance = colorDistance(color, TIME_OF_DAY[id].sky);
        expect(
          distance,
          `${color}가 ${TIME_OF_DAY[id].name} 하늘과 ${distance.toFixed(0)}`,
        ).toBeGreaterThan(80);
      }
    }
  });

  it("적 탄과 헷갈리지 않는다", () => {
    /*
     * 이 팔레트에서 가장 비싼 제약이다. 정통 빨강을 쓰면 적 탄과 색거리가
     * 60 밑으로 떨어져 **내가 쏜 화살이 피해야 할 것으로 읽힌다.** 빨강을
     * 주홍 쪽으로 민 이유가 이것이고, 이 검사가 그 자리를 지킨다.
     */
    for (const color of RAINBOW) {
      const distance = colorDistance(color, ENEMY_BOLT);
      expect(distance, `${color}가 적 탄과 ${distance.toFixed(0)}`).toBeGreaterThan(80);
    }
  });

  it("동료 도깨비 몸색과 떨어진다", () => {
    // 옆에 붙어 다니는 것들이라 겹치면 누가 낸 빛인지 모른다
    for (const color of RAINBOW) {
      for (const id of DOKEBI_ORDER) {
        const distance = colorDistance(color, DOKEBI[id].bodyColor);
        expect(distance, `${color}가 ${DOKEBI[id].name}과 ${distance.toFixed(0)}`).toBeGreaterThan(
          70,
        );
      }
    }
  });
});

describe("색상환을 도는 법", () => {
  it("한 바퀴를 다 돌면 여섯 색이 전부 나온다", () => {
    const seen = new Set(Array.from({ length: RAINBOW.length }, (_, i) => rainbowAt(i)));
    expect(seen.size).toBe(RAINBOW.length);
  });

  it("음수도 감긴다 — 뒤로 세는 자리가 있다", () => {
    expect(rainbowIndex(-1)).toBe(RAINBOW.length - 1);
    expect(rainbowIndex(-RAINBOW.length)).toBe(0);
    expect(rainbowIndex(-RAINBOW.length - 1)).toBe(RAINBOW.length - 1);
  });

  it("유한하지 않은 값이 들어와도 색이 나온다", () => {
    /*
     * 수명이 한 번 NaN이 되면 색상환이 통째로 NaN을 물고, 인스턴스 색이
     * NaN이면 그 조각은 **화면에서 사라진다.** 예외도 로그도 없이.
     */
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(rainbowIndex(bad), `${bad}`).toBe(0);
      expect(RAINBOW.includes(rainbowAt(bad)), `${bad}`).toBe(true);
    }
  });

  it("시간이 흐르면 색이 넘어간다 — 안 넘어가면 줄무늬 막대다", () => {
    const first = rainbowFlow(0, 2.4);
    const later = rainbowFlow(1 / 2.4 / RAINBOW.length, 2.4);
    expect(later, `${first} → ${later}`).not.toBe(first);
  });

  it("한 바퀴 돌면 제자리다", () => {
    // 바퀴/초가 뜻대로면 1/cycles초 뒤에 같은 색이어야 한다
    for (const cycles of [0.8, 1.1, 2.4, 4]) {
      expect(rainbowFlow(1 / cycles, cycles), `${cycles}바퀴/초`).toBe(rainbowFlow(0, cycles));
    }
  });

  it("시작 자리를 밀면 그만큼 밀린다 — 마디마다 다른 색이 되는 근거다", () => {
    for (let offset = 0; offset < RAINBOW.length; offset += 1) {
      expect(rainbowFlow(0, 2.4, offset), `offset ${offset}`).toBe(offset);
    }
  });
});
