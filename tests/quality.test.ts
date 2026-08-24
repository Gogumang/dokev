import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectQualityLevel,
  detectWebGLSupport,
  downgrade,
  getQualityPreset,
  QUALITY_PRESETS,
  type QualityLevel,
} from "@/game/systems/quality";

const LEVELS: QualityLevel[] = ["low", "medium", "high"];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downgrade", () => {
  it("한 단계씩 낮춘다", () => {
    // Arrange & Act & Assert
    expect(downgrade("high"), `high → ${downgrade("high")}`).toBe("medium");
    expect(downgrade("medium"), `medium → ${downgrade("medium")}`).toBe("low");
  });

  it("이미 최저 등급이면 그대로 둔다", () => {
    // Arrange & Act
    const result = downgrade("low");

    // Assert
    expect(result, `result was: ${result}`).toBe("low");
  });

  it("반복해서 강등해도 low에서 멈추고 무한히 내려가지 않는다", () => {
    // Arrange
    let level: QualityLevel = "high";

    // Act — 실측 fps가 계속 나쁘면 런타임이 반복 호출한다
    for (let i = 0; i < 10; i += 1) level = downgrade(level);

    // Assert
    expect(level, `level was: ${level}`).toBe("low");
  });
});

describe("getQualityPreset", () => {
  it("요청한 등급의 프리셋을 돌려준다", () => {
    // Arrange & Act & Assert
    for (const level of LEVELS) {
      const preset = getQualityPreset(level);
      expect(preset.level, `level=${level}, preset.level=${preset.level}`).toBe(level);
      expect(preset, `level=${level}`).toBe(QUALITY_PRESETS[level]);
    }
  });

  it("등급이 높을수록 렌더 비용 지표가 단조 증가한다", () => {
    // Arrange
    const [low, medium, high] = LEVELS.map(getQualityPreset);

    // Act & Assert — 강등이 실제로 부하를 줄이지 못하면 자동 강등 자체가 무의미하다
    expect(low.maxPixelRatio, `low=${low.maxPixelRatio}, medium=${medium.maxPixelRatio}`)
      .toBeLessThan(medium.maxPixelRatio);
    expect(medium.maxPixelRatio, `medium=${medium.maxPixelRatio}, high=${high.maxPixelRatio}`)
      .toBeLessThan(high.maxPixelRatio);

    expect(low.shadowMapSize, `low=${low.shadowMapSize}`).toBeLessThan(medium.shadowMapSize);
    expect(medium.shadowMapSize, `medium=${medium.shadowMapSize}`).toBeLessThan(high.shadowMapSize);

    expect(low.fogFar, `low=${low.fogFar}`).toBeLessThan(medium.fogFar);
    expect(medium.fogFar, `medium=${medium.fogFar}`).toBeLessThan(high.fogFar);
  });

  it("최저 등급은 그림자와 안티에일리어싱을 끈다", () => {
    // Arrange & Act
    const low = getQualityPreset("low");

    // Assert
    expect(low.shadows, `shadows was: ${low.shadows}`).toBe(false);
    expect(low.antialias, `antialias was: ${low.antialias}`).toBe(false);
  });

  it("모든 프리셋에서 fogNear가 fogFar보다 작다", () => {
    // Arrange & Act & Assert — 뒤집히면 안개가 카메라 앞을 통째로 덮는다
    for (const level of LEVELS) {
      const preset = getQualityPreset(level);
      expect(preset.fogNear, `${level}: near=${preset.fogNear}, far=${preset.fogFar}`).toBeLessThan(
        preset.fogFar,
      );
    }
  });
});

describe("detectQualityLevel", () => {
  it("window가 없으면(서버 렌더) medium으로 추정한다", () => {
    // Arrange
    vi.stubGlobal("window", undefined);

    // Act
    const level = detectQualityLevel();

    // Assert
    expect(level, `level was: ${level}`).toBe("medium");
  });
});

describe("detectWebGLSupport", () => {
  it("window가 없으면 지원하지 않는 것으로 본다", () => {
    // Arrange
    vi.stubGlobal("window", undefined);

    // Act
    const supported = detectWebGLSupport();

    // Assert
    expect(supported, `supported was: ${supported}`).toBe(false);
  });
});
