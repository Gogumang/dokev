import { describe, expect, it } from "vitest";

import {
  ABILITY_VFX_OPACITY,
  ABILITY_VFX_PROFILES,
  abilityVfxFrame,
} from "@/game/dokebi/abilityVfx";
import { DOKEBI_ORDER } from "@/game/dokebi/roster";
import { createGliderFrame, stepGliderFrame } from "@/game/player/gliderPresentation";

describe("우산 활공 연출", () => {
  it("활공을 시작하면 우산이 펼쳐지고 보인다", () => {
    // Given
    const folded = createGliderFrame();

    // When
    const opening = stepGliderFrame(folded, true, 1 / 15, 0.5, false);

    // Then
    expect(opening.visible).toBe(true);
    expect(opening.deployment).toBeGreaterThan(0);
    expect(opening.openScale).toBeGreaterThan(0);
  });

  it("활공을 멈추면 완전히 접힌 뒤 사라진다", () => {
    // Given
    let frame = stepGliderFrame(createGliderFrame(), true, 1, 1, false);

    // When
    for (let index = 0; index < 30; index += 1) {
      frame = stepGliderFrame(frame, false, 1 / 30, 1 + index / 30, false);
    }

    // Then
    expect(frame.visible).toBe(false);
    expect(frame.deployment).toBeLessThan(0.02);
  });

  it("100ms 안에 거의 다 펼쳐진다", () => {
    /*
     * DESIGN_GUIDE의 월드 절차형 VFX 표가 정한 시간이다. 「0보다 크다」만
     * 보고 있던 동안 실제로는 100ms에 63%였고 문서와 세 배 어긋나 있었다 —
     * 표에 시간을 적었으면 시간을 재야 한다.
     */
    // Given
    let frame = createGliderFrame();

    // When — 60fps로 100ms
    for (let step = 0; step < 6; step += 1) {
      frame = stepGliderFrame(frame, true, 1 / 60, step / 60, false);
    }

    // Then
    expect(frame.openScale).toBeGreaterThan(0.95);
  });

  it("저감 모션에서는 흔들림 없이 펼침 상태만 전달한다", () => {
    // Given
    const opened = stepGliderFrame(createGliderFrame(), true, 1, 0.8, false);

    // When
    const reduced = stepGliderFrame(opened, true, 1 / 60, 1.2, true);

    // Then
    expect(reduced.roll).toBe(0);
    expect(reduced.bob).toBe(0);
    expect(reduced.deployment).toBe(1);
    expect(reduced.openScale).toBe(1);
    expect(reduced.visible).toBe(true);
  });
});

describe("도깨비 능력 절차형 VFX", () => {
  it("네 능력이 서로 다른 주 시각 언어를 쓴다", () => {
    // Given
    const kinds = DOKEBI_ORDER.map((id) => ABILITY_VFX_PROFILES[id].kind);

    // When
    const distinct = new Set(kinds);

    // Then
    expect(distinct.size).toBe(DOKEBI_ORDER.length);
  });

  it("능력이 켜진 동안만 충분한 불투명도와 크기로 보인다", () => {
    // Given
    const activeRemaining = 3;

    // When
    const active = abilityVfxFrame(activeRemaining, 4, 0.8, false);
    const idle = abilityVfxFrame(0, 4, 0.8, false);

    // Then
    expect(active.visible).toBe(true);
    expect(active.strength).toBeGreaterThan(0.9);
    expect(active.scale).toBeGreaterThan(0.8);
    expect(idle).toEqual({ visible: false, strength: 0, scale: 0, rotation: 0, pulse: 0 });
  });

  it("몸 색과 강조 색의 불투명도 차이가 남는다", () => {
    /*
     * 세기가 아니라 불투명도를 돌려주던 동안 화면 쪽이 두 재질에 **같은
     * 값**을 넣었다 — 색을 둘로 나눈 이유가 첫 프레임에 사라졌다.
     */
    // Given
    const frame = abilityVfxFrame(3, 4, 0.8, false);

    // When
    const body = ABILITY_VFX_OPACITY.body * frame.strength;
    const accent = ABILITY_VFX_OPACITY.accent * frame.strength;

    // Then
    expect(accent).toBeGreaterThan(body);
  });

  it("저감 모션에서는 회전과 맥동을 멈추되 효과는 남긴다", () => {
    // Given
    const remaining = 4;

    // When
    const reduced = abilityVfxFrame(remaining, 4, 1.2, true);

    // Then
    expect(reduced.visible).toBe(true);
    expect(reduced.rotation).toBe(0);
    expect(reduced.pulse).toBe(0);
    expect(reduced.scale).toBe(1);
    expect(reduced.strength).toBe(1);
  });
});
