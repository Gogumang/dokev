import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import {
  clamp,
  createSeededRandom,
  damp,
  inverseLerpClamped,
  lerp,
  normalizeAngle,
  rotateToward,
  shortestAngleDelta,
  TAU,
} from "@/game/core/mathx";

describe("damp", () => {
  it("dt를 반으로 쪼개 두 번 불러도 한 번 부른 것과 같은 값에 도달한다 (프레임률 독립성)", () => {
    // Arrange
    const current = 0;
    const target = 10;
    const lambda = 6.5;
    const dt = 1 / 30;

    // Act
    const singleStep = damp(current, target, lambda, dt);
    const halfStep = damp(current, target, lambda, dt / 2);
    const twoHalfSteps = damp(halfStep, target, lambda, dt / 2);

    // Assert
    expect(
      twoHalfSteps,
      `single=${singleStep}, twoHalves=${twoHalfSteps}`,
    ).toBeCloseTo(singleStep, 10);
  });

  it("같은 조건에서 naive lerp는 프레임률에 따라 결과가 달라진다 (damp가 존재하는 이유)", () => {
    // Arrange
    const current = 0;
    const target = 10;
    const t = 0.2;

    // Act
    const singleStep = lerp(current, target, t);
    const twoHalfSteps = lerp(lerp(current, target, t), target, t);

    // Assert — 이 차이가 사라지면 damp를 lerp로 바꿔도 된다는 뜻이므로 반드시 벌어져야 한다
    expect(
      Math.abs(twoHalfSteps - singleStep),
      `single=${singleStep}, twice=${twoHalfSteps}`,
    ).toBeGreaterThan(1);
  });

  it("dt가 0이면 현재 값을 그대로 돌려준다", () => {
    // Arrange & Act
    const result = damp(3.5, 100, 6.5, 0);

    // Assert
    expect(result, `result was: ${result}`).toBe(3.5);
  });

  it("dt가 커질수록 목표에 가까워지되 넘어서지 않는다", () => {
    // Arrange
    const current = 0;
    const target = 10;

    // Act
    const short = damp(current, target, 6.5, 1 / 120);
    const long = damp(current, target, 6.5, 1 / 15);
    const huge = damp(current, target, 6.5, 10);

    // Assert
    expect(short, `short=${short}, long=${long}`).toBeLessThan(long);
    expect(long, `long=${long}`).toBeLessThan(target);
    expect(huge, `huge=${huge}`).toBeLessThanOrEqual(target);
  });
});

describe("clamp", () => {
  it("범위 안이면 그대로, 밖이면 경계로 잘린다", () => {
    // Arrange & Act & Assert
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe("inverseLerpClamped", () => {
  it("범위 밖 값은 0..1로 잘린다", () => {
    // Arrange & Act
    const below = inverseLerpClamped(8, 15, 2);
    const above = inverseLerpClamped(8, 15, 100);

    // Assert
    expect(below, `below was: ${below}`).toBe(0);
    expect(above, `above was: ${above}`).toBe(1);
  });

  it("중간값은 0.5를 돌려준다", () => {
    // Arrange & Act
    const result = inverseLerpClamped(8, 16, 12);

    // Assert
    expect(result, `result was: ${result}`).toBeCloseTo(0.5, 12);
  });

  it("from과 to가 같으면 0으로 나누지 않고 0을 돌려준다", () => {
    // Arrange & Act
    const result = inverseLerpClamped(5, 5, 5);

    // Assert — NaN/Infinity가 새어 나가면 속도선 오퍼시티가 통째로 깨진다
    expect(result, `result was: ${result}`).toBe(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("역방향 범위(from > to)도 정상 정규화한다", () => {
    // Arrange & Act
    const result = inverseLerpClamped(10, 0, 7.5);

    // Assert
    expect(result, `result was: ${result}`).toBeCloseTo(0.25, 12);
  });
});

describe("shortestAngleDelta", () => {
  it("항상 -PI..PI 범위를 돌려준다", () => {
    // Arrange
    const samples = [-9, -4.2, -1, 0, 0.3, 3.1, 6.5, 12.7];

    // Act & Assert
    for (const from of samples) {
      for (const to of samples) {
        const delta = shortestAngleDelta(from, to);
        expect(
          Math.abs(delta),
          `from=${from}, to=${to}, delta=${delta}`,
        ).toBeLessThanOrEqual(Math.PI + 1e-12);
      }
    }
  });

  it("경계를 넘어가는 편이 짧으면 그쪽으로 돈다", () => {
    // Arrange
    const from = 3.0;
    const to = -3.0;

    // Act
    const delta = shortestAngleDelta(from, to);

    // Assert — 먼 길(-6.0)이 아니라 짧은 길(+0.283)로 가야 한다
    expect(delta, `delta was: ${delta}`).toBeCloseTo(TAU - 6.0, 12);
  });

  it("한 바퀴 차이는 0으로 본다", () => {
    // Arrange & Act
    const delta = shortestAngleDelta(1.2, 1.2 + TAU);

    // Assert
    expect(delta, `delta was: ${delta}`).toBeCloseTo(0, 10);
  });
});

describe("rotateToward", () => {
  it("남은 각이 maxDelta 이하면 정확히 목표 각을 돌려준다", () => {
    // Arrange & Act
    const result = rotateToward(0, 0.1, 0.5);

    // Assert — 근사치가 아니라 목표에 정확히 붙어야 미세 진동이 안 생긴다
    expect(result, `result was: ${result}`).toBe(0.1);
  });

  it("남은 각이 maxDelta보다 크면 maxDelta만큼만 돈다", () => {
    // Arrange & Act
    const result = rotateToward(0, 2.0, 0.5);

    // Assert
    expect(result, `result was: ${result}`).toBeCloseTo(0.5, 12);
  });

  it("반대 방향이 더 짧으면 음의 방향으로 돈다", () => {
    // Arrange & Act
    const result = rotateToward(0, -2.0, 0.5);

    // Assert
    expect(result, `result was: ${result}`).toBeCloseTo(-0.5, 12);
  });

  it("경계를 넘는 최단 경로를 택한다", () => {
    // Arrange & Act — 3.0 → -3.0은 +0.283 방향이 최단이다
    const result = rotateToward(3.0, -3.0, 0.1);

    // Assert
    expect(result, `result was: ${result}`).toBeCloseTo(3.1, 12);
  });
});

describe("normalizeAngle", () => {
  it("어떤 각을 넣어도 -PI..PI로 접힌다", () => {
    // Arrange
    const samples = [0, 3.2, -3.2, TAU + 0.5, -TAU - 0.5, 100];

    // Act & Assert
    for (const angle of samples) {
      const normalized = normalizeAngle(angle);
      expect(
        Math.abs(normalized),
        `angle=${angle}, normalized=${normalized}`,
      ).toBeLessThanOrEqual(Math.PI + 1e-12);
    }
  });
});

describe("createSeededRandom", () => {
  it("같은 시드면 같은 수열을 돌려준다 (도시 배치 재현성의 근거)", () => {
    // Arrange
    const first = createSeededRandom(20260816);
    const second = createSeededRandom(20260816);

    // Act
    const a = Array.from({ length: 32 }, () => first());
    const b = Array.from({ length: 32 }, () => second());

    // Assert
    expect(a, `first=${a.slice(0, 3)}, second=${b.slice(0, 3)}`).toEqual(b);
  });

  it("시드가 다르면 다른 수열을 돌려준다", () => {
    // Arrange
    const first = createSeededRandom(20260816);
    const second = createSeededRandom(20260817);

    // Act
    const a = Array.from({ length: 32 }, () => first());
    const b = Array.from({ length: 32 }, () => second());

    // Assert
    expect(a, `first=${a.slice(0, 3)}, second=${b.slice(0, 3)}`).not.toEqual(b);
  });

  it("모든 값이 0 이상 1 미만이고 상수로 고착되지 않는다", () => {
    // Arrange
    const random = createSeededRandom(1);

    // Act
    const values = Array.from({ length: 500 }, () => random());

    // Assert
    for (const value of values) {
      expect(value, `value was: ${value}`).toBeGreaterThanOrEqual(0);
      expect(value, `value was: ${value}`).toBeLessThan(1);
    }
    expect(new Set(values).size, `unique=${new Set(values).size}`).toBeGreaterThan(400);
  });
});

describe("프레임률에 끌려가지 않는가", () => {
  /*
   * `damp`의 주석이 「따라붙는 동작에는 반드시 이 함수를 쓴다」고 못 박아 두었다.
   * 지금 소스에 어기는 곳은 없지만, **어겨도 아무도 안 막았다** — 카메라 fov를
   * `lerp(현재, 목표, 0.1)`로 바꿔 봐도 전부 통과했다.
   *
   * 이건 조용하고 고약한 부류다: 검사도 통과하고 화면도 멀쩡한데 **모니터마다
   * 조작감이 달라진다.** 120Hz에서는 60Hz의 두 배 속도로 붙는다. 사람이
   * 플레이테스트로 「감도가 이상하다」고 느껴도 원인을 짚기 어렵다.
   *
   * 정적인 섞기(중간색, 중간점)까지 막으면 시끄러우므로 **매 프레임 도는
   * 곳에서만** 본다 — `dt`를 쓰거나 `useFrame`이 있는 파일이다. 거기서 계수가
   * 상수라면 시간이 안 들어간 것이다.
   */
  const perFrame = collectSources("src")
    .map((path) => [path, readCode(path)] as const)
    .filter(([path]) => path !== "src/game/core/mathx.ts")
    .filter(([, code]) => code.includes("useFrame") || /\bdt\b\s*[,:)]/.test(code));

  it("매 프레임 도는 파일을 실제로 골랐다", () => {
    // 판별이 헛돌면 빈 목록을 훑으며 통과한다
    expect(perFrame.length, `매 프레임 파일 ${perFrame.length}개`).toBeGreaterThan(5);
  });

  it("따라붙는 보간에 상수 계수를 쓰지 않는다", () => {
    const framebound: string[] = [];
    for (const [path, code] of perFrame) {
      for (const [index, line] of code.split("\n").entries()) {
        if (line.trim().startsWith("*") || line.trim().startsWith("//")) continue;
        // lerp(a, b, 0.1) / v.lerp(target, 0.1) — 시간이 안 들어간 계수
        if (/\.?\blerp\w*\([^)]*,\s*\d*\.\d+\s*\)/.test(line)) {
          framebound.push(`${path}:${index + 1}  ${line.trim()}`);
        }
      }
    }
    expect(
      framebound,
      `프레임률에 끌려가는 보간 — damp(현재, 목표, lambda, dt)를 쓰라:\n${framebound.join("\n")}`,
    ).toEqual([]);
  });
});
