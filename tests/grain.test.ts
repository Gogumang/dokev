import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { buildGrain, GRAIN, type GrainMark } from "@/game/world/grain";

/**
 * 이 결이 만들어 낼 밝기 분산의 어림값. **단색이면 0이다.**
 *
 * 검사 파일 안에 둔다 — 제품이 부르지 않는 계산을 `grain.ts`에 두면 아무도
 * 안 쓰는 export가 된다(채도 검사에서 이미 같은 판단을 했다).
 *
 * 실제 픽셀을 계산하지 않는다. 각 얼룩이 자기 면적만큼 밝기를 옮긴다고 보고,
 * 그 이동량의 제곱을 면적 비율로 가중해 더한다.
 */
function grainVariance(marks: readonly GrainMark[], size: number): number {
  const total = size * size;
  let variance = 0;
  for (const mark of marks) {
    const coverage = (mark.width * mark.height) / total;
    variance += coverage * mark.alpha * mark.alpha;
  }
  return variance;
}

/*
 * 벽면의 결.
 *
 * 원작 화면의 정체는 **사실적인 배경 위의 카툰 캐릭터**다. 우리는 배경과
 * 캐릭터가 같은 추상도에 있어서 캐릭터가 떠오르지 않았다 — 벽이 단색이라
 * 가까이 붙어도 볼 것이 없었다(RALPH_BACKLOG 「11. 배경의 결을 올려 캐릭터와
 * 갈라 세운다」).
 *
 * 백로그가 요구한 검사가 이것이다: **밝기 분산이 문턱을 넘는가.** 단색이면
 * 0에 가깝다 — 눈이 아니라 값으로 잡는다.
 */
const SIZE = 512;

describe("결이 실제로 있는가", () => {
  it("단색이 아니다 — 분산이 0을 넘는다", () => {
    const variance = grainVariance(buildGrain(SIZE, 1), SIZE);
    expect(variance, `분산 ${variance.toExponential(2)}`).toBeGreaterThan(0);
  });

  it("아무것도 없으면 0이다 — 문턱이 늘 통과하는 값이 아니다", () => {
    // 이 줄이 없으면 위 검사가 「무엇을 넣어도 통과」인지 알 수 없다
    expect(grainVariance([], SIZE)).toBe(0);
  });

  it("얼룩이 옅어지면 분산도 줄어든다", () => {
    /*
     * 분산이 진하기를 실제로 반영하는지 본다. 반영하지 않으면 나중에 누가
     * 얼룩을 거의 투명하게 만들어도 검사가 조용하다.
     */
    const marks = buildGrain(SIZE, 2);
    const faded = marks.map((mark) => ({ ...mark, alpha: mark.alpha / 4 }));
    expect(grainVariance(faded, SIZE)).toBeLessThan(grainVariance(marks, SIZE));
  });
});

describe("결이 벽을 망치지 않는가", () => {
  const marks = buildGrain(SIZE, 3);

  it("텍스처 밖으로 나가지 않는다 — 넘으면 타일 이음매에서 잘린 자국이 보인다", () => {
    for (const mark of marks) {
      expect(mark.x, `x=${mark.x}`).toBeGreaterThanOrEqual(0);
      expect(mark.y, `y=${mark.y}`).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.width, `오른쪽 끝 ${mark.x + mark.width}`).toBeLessThanOrEqual(
        SIZE + 1e-6,
      );
      expect(mark.y + mark.height, `아래쪽 끝 ${mark.y + mark.height}`).toBeLessThanOrEqual(
        SIZE + 1e-6,
      );
    }
  });

  it("어두운 것과 밝은 것이 섞여 있다", () => {
    /*
     * 한쪽만 쓰면 벽 전체가 그만큼 어두워지거나 밝아져 **팔레트가 조용히
     * 바뀐다** — 색을 눌러 둔 규칙(A-1)이 거기서 깨진다.
     */
    const dark = marks.filter((mark) => mark.dark).length;
    const light = marks.length - dark;
    expect(dark, `어두운 ${dark} / 밝은 ${light}`).toBeGreaterThan(0);
    expect(light, `어두운 ${dark} / 밝은 ${light}`).toBeGreaterThan(0);
  });

  it("벽지가 되지 않는다 — 진하기에 상한이 있다", () => {
    for (const mark of marks) {
      expect(mark.alpha, `alpha=${mark.alpha}`).toBeLessThanOrEqual(
        Math.max(GRAIN.maxAlpha, GRAIN.seamAlpha),
      );
    }
  });

  it("칠하는 수에 상한이 있다 — 합성은 시작할 때 한 번에 굽는다", () => {
    // 예산 항목이다. 해상도를 올리지 않는 대신 그리는 횟수도 늘리지 않는다
    expect(marks.length, `${marks.length}개`).toBeLessThan(GRAIN.markCount * 2);
  });
});

describe("판마다 같은가", () => {
  it("같은 시드는 같은 결", () => {
    expect(buildGrain(SIZE, 9)).toEqual(buildGrain(SIZE, 9));
  });

  it("다른 시드는 다른 결 — 같으면 도시 전체가 같은 무늬가 된다", () => {
    const a = buildGrain(SIZE, 1);
    const b = buildGrain(SIZE, 2);
    expect(a, "톤이 달라도 무늬가 같다").not.toEqual(b);
  });
});

describe("벽이 실제로 이 결을 쓰는가", () => {
  it("텍스처 합성이 결을 부른다", () => {
    // 만들어 두고 안 부르면 벽은 그대로 단색이다
    const textures = readCode("src/game/world/textures.ts");
    expect(textures, "결을 만들지 않는다").toMatch(/buildGrain\(/);
    // 만들기만 하고 안 칠하면 벽은 그대로다 — 칠하는 줄까지 본다
    expect(textures, "만든 결을 칠하지 않는다").toMatch(/mark\.alpha/);
  });
});
