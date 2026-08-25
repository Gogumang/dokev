import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSeededRandom } from "@/game/core/mathx";
import { buildCityDetails, FIXTURE_TONE } from "@/game/world/cityDetails";
import { addSigns } from "@/game/world/facadeSigns";
import { SHOP_BRANDS, SIGN_SCHEMES } from "@/game/world/cityContent";
import { buildCityLayout, type BoxInstance } from "@/game/world/cityLayout";

/**
 * 이 파일은 소품 **개수**를 검증하지 않는다.
 *
 * 디테일 레이어는 연출 튜닝으로 자주 바뀌는 곳이라, 개수를 박아 두면 정상적인
 * 조정마다 테스트가 깨져 아무도 안 보게 된다. 대신 레이어가 늘거나 줄어도 유지돼야 하는
 * 성질(결정성, 유한한 좌표, 양수 크기, 정점 개수 정합)만 본다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);

function isBoxInstance(value: unknown): value is BoxInstance {
  if (typeof value !== "object" || value === null) return false;
  const box = value as Partial<BoxInstance>;
  return typeof box.width === "number" && typeof box.height === "number";
}

/** 결과 안의 모든 BoxInstance 배열을 필드 이름과 함께 훑는다. */
function boxLayers(): [string, BoxInstance[]][] {
  return Object.entries(details).filter(
    (entry): entry is [string, BoxInstance[]] =>
      Array.isArray(entry[1]) && entry[1].every(isBoxInstance) && entry[1].length > 0,
  );
}

describe("buildCityDetails", () => {
  it("같은 layout으로 두 번 호출하면 완전히 같은 결과가 나온다", () => {
    // Arrange & Act
    const first = buildCityDetails(layout);
    const second = buildCityDetails(layout);

    // Assert — 시드가 고정이라 새로고침해도 같은 도시가 나와야 한다
    expect(second, `layers=${Object.keys(first).join(",")}`).toEqual(first);
  });

  it("소품이 하나도 없는 빈 결과를 돌려주지 않는다", () => {
    // Arrange & Act
    const layers = boxLayers();

    // Assert — 전부 비어 있으면 "한국 도시" 인상 자체가 사라진다
    expect(layers.length, `non-empty layers: ${layers.map(([k]) => k).join(",")}`).toBeGreaterThan(
      0,
    );
  });

  it("모든 소품의 크기가 양수다", () => {
    // Arrange & Act & Assert
    for (const [name, boxes] of boxLayers()) {
      for (const box of boxes) {
        expect(box.width, `${name}: ${JSON.stringify(box)}`).toBeGreaterThan(0);
        expect(box.height, `${name}: ${JSON.stringify(box)}`).toBeGreaterThan(0);
        expect(box.depth, `${name}: ${JSON.stringify(box)}`).toBeGreaterThan(0);
      }
    }
  });

  it("모든 소품의 좌표가 유한한 수다", () => {
    // Arrange & Act & Assert — NaN이 하나라도 섞이면 인스턴스 전체가 사라진다
    for (const [name, boxes] of boxLayers()) {
      for (const box of boxes) {
        expect(Number.isFinite(box.x), `${name}: ${JSON.stringify(box)}`).toBe(true);
        expect(Number.isFinite(box.y), `${name}: ${JSON.stringify(box)}`).toBe(true);
        expect(Number.isFinite(box.z), `${name}: ${JSON.stringify(box)}`).toBe(true);
      }
    }
  });

  it("모든 소품의 tone이 0 이상의 정수다", () => {
    // Arrange & Act & Assert — 팔레트 인덱스로 쓰이므로 음수·소수면 색이 undefined가 된다
    for (const [name, boxes] of boxLayers()) {
      for (const box of boxes) {
        expect(Number.isInteger(box.tone), `${name}: tone=${box.tone}`).toBe(true);
        expect(box.tone, `${name}: tone=${box.tone}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("소품이 월드 경계를 크게 벗어나지 않는다", () => {
    // Arrange — 간판·처마가 조금 튀어나오는 것은 허용한다
    const limit = layout.halfExtent + 5;

    // Act & Assert
    for (const [name, boxes] of boxLayers()) {
      for (const box of boxes) {
        expect(Math.abs(box.x), `${name}: ${JSON.stringify(box)}, limit=${limit}`).toBeLessThan(
          limit,
        );
        expect(Math.abs(box.z), `${name}: ${JSON.stringify(box)}, limit=${limit}`).toBeLessThan(
          limit,
        );
      }
    }
  });

  it("전깃줄 정점이 선분 단위(6개 = xyz 2개)로 떨어진다", () => {
    // Arrange
    const { wireVertices } = details;

    // Act & Assert — LineSegments는 정점을 둘씩 짝지어 쓴다. 나머지가 남으면 마지막 선이 깨진다
    expect(wireVertices.length % 6, `wireVertices.length=${wireVertices.length}`).toBe(0);
    for (const value of wireVertices) {
      expect(Number.isFinite(value), `wireVertices had: ${value}`).toBe(true);
    }
  });
});

describe("팔레트에 죽은 색이 없는가", () => {
  /*
   * `tentOrange`가 팔레트에도 있고 색까지 정해져 있었는데 **아무도 쓰지
   * 않았다.** 도시를 한 판 만들어 소품 1035개의 tone을 세어 보니 5만
   * 빠져 있었다 — 화면으로는 「없는 색」을 알아볼 방법이 없다.
   *
   * 소품 종류가 하나 죽는 것과 같은 무게다: 색을 정해 두고 안 쓰면 다음
   * 사람은 그 색이 어딘가 나온다고 믿는다.
   */
  const used = new Set(details.streetFixtures.map((box) => box.tone));

  it("소품을 실제로 만들었다", () => {
    expect(
      details.streetFixtures.length,
      `소품 ${details.streetFixtures.length}개`,
    ).toBeGreaterThan(100);
  });

  it("정한 색이 모두 도시에 나온다", () => {
    const missing = Object.entries(FIXTURE_TONE)
      .filter(([, index]) => !used.has(index))
      .map(([name, index]) => `${name}(${index})`);
    expect(missing, `정해 두고 안 쓰는 색: ${missing.join(", ")}`).toEqual([]);
  });

  it("정하지 않은 색을 쓰지 않는다", () => {
    // 반대 방향 — 팔레트 밖 인덱스를 쓰면 렌더가 undefined 색을 받는다
    // 리터럴 유니온이라 `has`가 넓은 number를 안 받는다 — 수로 낮춰 비교한다
    const known = new Set<number>(Object.values(FIXTURE_TONE));
    const stray = [...used].filter((tone) => !known.has(tone));
    expect(stray, `팔레트 밖 인덱스: ${stray.join(", ")}`).toEqual([]);
  });
});

describe("소품 가중치", () => {
  /*
   * 주석과 산술이 어긋나 있었다 — 「나머지는 비워 둔다」고 적혀 있는데 합이
   * 정확히 1이라 비는 자리가 없다. 둘 중 하나가 거짓말이고, 어느 쪽이든
   * 다음 사람이 잘못된 전제로 값을 만진다.
   *
   * 합을 읽어 주석과 맞춘다.
   */
  const source = readFileSync("src/game/world/streetProps.ts", "utf8");
  const block = /const PROP_WEIGHTS = \{([\s\S]*?)\} as const;/.exec(source);

  it("가중치를 실제로 읽었다", () => {
    expect(block, "PROP_WEIGHTS를 못 읽었다").not.toBeNull();
  });

  it("합이 1을 넘지 않는다", () => {
    // 넘으면 뒤쪽 소품이 영영 안 나온다 — 화면으로는 알 수 없다
    const weights = [...(block?.[1] ?? "").matchAll(/:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    expect(weights.length, `읽은 가중치 ${weights.length}개`).toBeGreaterThan(4);

    const total = weights.reduce((sum, value) => sum + value, 0);
    expect(total, `합이 ${total}`).toBeLessThanOrEqual(1.0000001);
  });

  it("빈 자리에 대한 설명이 산술과 맞는다", () => {
    const weights = [...(block?.[1] ?? "").matchAll(/:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const leavesGaps = total < 0.9999999;

    // 합이 1이면 「비워 둔다」고 적으면 안 되고, 1보다 작으면 적어야 한다
    const claimsGaps = /비는 자리가 없다/.test(source);
    expect(claimsGaps, `합 ${total}인데 설명이 반대다`).toBe(!leavesGaps);
  });
});

describe("간판 내용", () => {
  /*
   * `cityContent.ts`는 내보낸 이름 일곱 중 둘만 검사에 나오는 파일이었다.
   * 여기 값들은 **화면에 글자로 그대로 나가는데**, 잘못돼도 예외가 안 난다.
   */
  it("세로 간판 글자가 네 자를 넘지 않는다", () => {
    /*
     * 주석이 단언한다 — 「세로 간판은 글자를 한 자씩 쌓으므로 4자를 넘으면
     * 글자가 급격히 작아진다」. 지금은 전부 2~3자지만 아무도 지키지 않는다.
     */
    const tooLong = SHOP_BRANDS.filter((brand) => brand.short.length > 4).map(
      (brand) => `${brand.short}(${brand.short.length}자)`,
    );
    expect(tooLong, `네 자를 넘는 세로 간판: ${tooLong.join(", ")}`).toEqual([]);
  });

  it("배색 번호가 실제로 있는 번호다", () => {
    /*
     * 쓰는 쪽이 `SIGN_SCHEMES[brand.scheme % SIGN_SCHEMES.length]`다 — 범위를
     * 넘으면 **예외 대신 엉뚱한 배색**이 조용히 나온다. 넘겨서 감기는 것과
     * 처음부터 맞는 것은 다르다.
     */
    const stray = SHOP_BRANDS.filter(
      (brand) =>
        !Number.isInteger(brand.scheme) || brand.scheme < 0 || brand.scheme >= SIGN_SCHEMES.length,
    ).map((brand) => `${brand.short}: ${brand.scheme}`);
    expect(stray, `배색 ${SIGN_SCHEMES.length}개인데 범위 밖: ${stray.join(", ")}`).toEqual([]);
  });

  it("가로 간판과 세로 간판이 서로 다른 글자다", () => {
    // 같으면 세로로 쌓을 이유가 없다 — 줄인 이름이라는 것이 이 필드의 뜻이다
    const same = SHOP_BRANDS.filter((brand) => brand.short === brand.long).map((b) => b.short);
    expect(same, `줄이지 않은 업종: ${same.join(", ")}`).toEqual([]);
  });

  it("업종을 실제로 읽었다", () => {
    expect(SHOP_BRANDS.length, `업종 ${SHOP_BRANDS.length}개`).toBeGreaterThan(8);
    expect(SIGN_SCHEMES.length, `배색 ${SIGN_SCHEMES.length}개`).toBeGreaterThan(3);
  });
});

describe("간판이 층마다 쌓이는가", () => {
  /*
   * 개수를 박지 않는다(이 파일의 원칙). 대신 **관계**를 본다 — 높은 건물이
   * 낮은 건물보다 간판이 많아야 층마다 붙은 것이다.
   *
   * 도시 전체에서 거리로 골라 세다가 **옆 건물 간판까지 셌다.** 간접적으로
   * 재면 두 건물이 한 덩어리가 된다 — 건물 하나만 세워 놓고 직접 잰다.
   */
  function signsOf(height: number) {
    const one = { x: 0, y: height / 2, z: 0, width: 10, height, depth: 10, tone: 0, blockIndex: 0 };
    const bucket = { signsHorizontal: [], signsVertical: [] } as unknown as Parameters<
      typeof addSigns
    >[0];
    addSigns(bucket, one, [0], createSeededRandom(7));
    return { signs: bucket.signsHorizontal, building: one };
  }

  it("건물마다 1층 간판은 있다", () => {
    // 하나도 없으면 상가가 아니라 창고다
    for (const height of [8, 16, 24]) {
      const { signs } = signsOf(height);
      expect(signs.length, `${height}m 건물에 간판이 없다`).toBeGreaterThan(0);
    }
  });

  it("벽을 간판으로 덮지 않는다", () => {
    /*
     * 예전에는 1층부터 꼭대기까지 층마다 달았다. 잡거빌딩의 모습이라 근거는
     * 있었지만, 20m 건물에 다섯 장이 세로로 쌓이면서 **벽이 통째로 간판이
     * 됐다** — "건물이 이상하다"는 지적의 큰 몫이었다.
     *
     * 이제 1층에 하나, 위층은 가끔 한 장까지다. 이 상한이 무너지면 예전
     * 모습으로 조용히 돌아간다.
     */
    for (const height of [8, 16, 24, 32]) {
      const { signs } = signsOf(height);
      expect(signs.length, `${height}m 건물에 간판 ${signs.length}장`).toBeLessThanOrEqual(2);
    }
  });

  it("그래도 위층 간판이 아주 사라지지는 않았다", () => {
    /*
     * 확률로 붙이므로 건물 하나만 보면 없을 수 있다. 도시 전체에서 **한 장도
     * 없으면** 확률이 0으로 굳은 것이고, 그건 거리가 밋밋해졌다는 뜻이다.
     */
    let upper = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const one = { x: 0, y: 12, z: 0, width: 10, height: 24, depth: 10, tone: 0, blockIndex: 0 };
      const bucket = { signsHorizontal: [], signsVertical: [] } as unknown as Parameters<
        typeof addSigns
      >[0];
      addSigns(bucket, one, [0], createSeededRandom(seed));
      if (bucket.signsHorizontal.length > 1) upper += 1;
    }
    expect(upper, `60채 중 ${upper}채에 위층 간판`).toBeGreaterThan(3);
  });

  it("옥상을 뚫고 올라가지 않는다", () => {
    for (const height of [7.5, 12.2, 18, 26]) {
      const { signs, building } = signsOf(height);
      const over = signs.filter((sign) => sign.y + sign.height / 2 > building.height);
      expect(over.length, `${height}m 건물 위로 ${over.length}개가 솟았다`).toBe(0);
    }
  });

  it("낮은 건물에도 하나는 붙는다 — 없으면 빈 상자다", () => {
    expect(signsOf(7.3).signs.length, "가장 낮은 건물에 간판이 없다").toBeGreaterThan(0);
  });
});
