import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FIXTURE_TONE } from "@/game/world/cityDetails";
import { buildSidewalkSurface, SIDEWALK_SLAB_SIZE } from "@/game/world/sidewalks";
import { terrainHeight } from "@/game/world/terrain";
import { CITY } from "@/game/world/cityLayout";
import {
  BANNER_TEXTS,
  PROP_CELL_COUNT,
  PROP_CELL_INDEX,
  SHOP_BRANDS,
} from "@/game/world/cityContent";
import { CROWD } from "@/game/world/crowdLayout";

/*
 * "반드시 일치해야 한다"고 주석에 적힌 짝들.
 *
 * 코드베이스에서 그런 문장을 전부 찾아 여기로 모았다. 주석은 어긋나도 아무
 * 일이 일어나지 않는다 — 도로 좌표가 정확히 그렇게 반 칸 어긋난 채 오래
 * 굴러갔다. 짝을 이루는 값은 되도록 한쪽으로 합치고, 합칠 수 없는 것(팔레트
 * 순서 같은 것)은 여기서 대조한다.
 */

describe("인도 높이", () => {
  it("보행자 발 높이가 인도 두께와 같다", () => {
    // 다르면 시민이 공중에 뜨거나 무릎까지 잠긴다
    expect(CROWD.groundY, `crowd ${CROWD.groundY} vs sidewalk ${CITY.sidewalkHeight}`).toBe(
      CITY.sidewalkHeight,
    );
  });

  it("깔린 판의 두께가 정본과 같다", () => {
    /*
     * 원래는 「City.tsx가 `CITY.sidewalkHeight`라는 글자를 담고 있는가」로 봤다.
     * 판을 만드는 코드를 밖으로 빼자 깨졌는데 — **결함이 아니라 자리가 바뀐 것**이다.
     *
     * 「숫자 0.16을 어디서도 박지 마라」로 넓혀 봤다가 되돌렸다: 팔 두께·숨쉬기
     * 진폭·음량에도 0.16이 있다. 결함 아닌 것을 무는 규칙이었다.
     *
     * 그래서 글자가 아니라 **깔린 결과**를 잰다. 파일이 어디로 옮겨 가든, 숫자를
     * 어떻게 쓰든, 판이 정본과 다른 두께로 깔리면 여기서 걸린다.
     */
    /*
     * 인도가 상자에서 **면**으로 바뀌었다(`buildSidewalkSurface`). 두께를
     * 잴 데가 없어졌으므로 대신 **윗면 높이**를 잰다 — 시민이 잠기느냐
     * 뜨느냐를 정하는 것은 원래 그 값이었다.
     */
    const surface = buildSidewalkSurface(SIDEWALK_SLAB_SIZE, 1);
    expect(surface.positions.length, "인도 면이 비었다").toBeGreaterThan(0);

    let checked = 0;
    for (let i = 0; i < surface.positions.length; i += 3) {
      const [x, y, z] = [surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]];
      const above = y - terrainHeight(x, z);
      // 치마(아래로 늘린 옆면) 정점은 빼고 윗면만 본다
      if (above < 0) continue;
      expect(
        above,
        `(${x.toFixed(1)}, ${z.toFixed(1)})에서 인도가 지면 위 ${above.toFixed(2)}m`,
      ).toBeCloseTo(CITY.sidewalkHeight, 6);
      checked += 1;
    }
    expect(checked, "윗면 정점을 하나도 못 찾았다 — 검사가 아무것도 안 보고 있다").toBeGreaterThan(
      100,
    );
  });
});

describe("소품 아틀라스", () => {
  it("셀 이름 수와 셀 개수가 맞는다", () => {
    /*
     * 이름이 셀 수보다 많으면 마지막 소품들이 아틀라스 밖을 가리켜
     * 엉뚱한 그림이 나온다. 적으면 빈 셀이 남는다.
     */
    const names = Object.keys(PROP_CELL_INDEX);
    expect(names.length, `${names.length} names for ${PROP_CELL_COUNT} cells`).toBe(
      PROP_CELL_COUNT,
    );
  });

  it("모든 인덱스가 범위 안이고 중복이 없다", () => {
    const indices = Object.values(PROP_CELL_INDEX);
    for (const [name, index] of Object.entries(PROP_CELL_INDEX)) {
      expect(index, `${name} = ${index}`).toBeGreaterThanOrEqual(0);
      expect(index, `${name} = ${index}`).toBeLessThan(PROP_CELL_COUNT);
    }
    // 두 소품이 같은 칸을 쓰면 하나는 영영 안 보인다
    expect(new Set(indices).size, `indices: ${indices.join(",")}`).toBe(indices.length);
  });

  it("셀 개수가 아틀라스 격자와 맞는다", () => {
    // 주석이 4×2라고 단언한다
    expect(PROP_CELL_COUNT).toBe(4 * 2);
  });
});

describe("거리 소품 팔레트", () => {
  it("팔레트 길이가 톤 개수와 같다", () => {
    /*
     * 배치는 색 인덱스만 갖고 실제 색은 렌더가 갖는다. 팔레트가 짧으면
     * 그 인덱스의 소품이 undefined 색으로 그려진다.
     */
    /*
     * 팔레트가 `City.tsx`에서 `cityPalettes.ts`로 옮겨 갔다(그 파일이 800줄
     * 상한을 넘었다). 경로가 낡으면 이 검사는 **아무것도 못 읽고 실패**한다 —
     * 조용히 통과하지 않는다는 점이 중요하다. 그래서 아래 not.toBeNull이 있다.
     */
    const city = readFileSync("src/game/world/cityPalettes.ts", "utf8");
    const block = /const FIXTURE_PALETTE = \[([\s\S]*?)\];/.exec(city);
    expect(block, "FIXTURE_PALETTE를 찾지 못했다").not.toBeNull();
    if (!block) return;

    const colors = block[1].match(/"#[0-9a-f]{6}"/gi) ?? [];
    const tones = Object.keys(FIXTURE_TONE);
    expect(colors.length, `${colors.length} colors for ${tones.length} tones`).toBe(tones.length);
  });

  it("톤 인덱스가 0부터 빈틈없이 이어진다", () => {
    // 순서가 곧 팔레트 배열의 위치다. 구멍이 있으면 색이 밀린다.
    const values = Object.values(FIXTURE_TONE).sort((a, b) => a - b);
    expect(values, `tones: ${values.join(",")}`).toEqual(values.map((_, i) => i));
  });

  it("팔레트 주석이 톤 순서를 그대로 적어 두었다", () => {
    /*
     * 색 옆에 이름을 주석으로 달아 두었다. 순서가 어긋나면 그 주석이
     * 가장 먼저 거짓말을 한다 — 사람이 읽고 판단하는 유일한 단서다.
     */
    /*
     * 팔레트가 `City.tsx`에서 `cityPalettes.ts`로 옮겨 갔다(그 파일이 800줄
     * 상한을 넘었다). 경로가 낡으면 이 검사는 **아무것도 못 읽고 실패**한다 —
     * 조용히 통과하지 않는다는 점이 중요하다. 그래서 아래 not.toBeNull이 있다.
     */
    const city = readFileSync("src/game/world/cityPalettes.ts", "utf8");
    const block = /const FIXTURE_PALETTE = \[([\s\S]*?)\];/.exec(city);
    /*
     * 못 찾으면 그냥 빠져나가고 있었다 — 상수 이름을 바꾸거나 줄바꿈만
     * 달라져도 **검사가 조용히 사라진다.** 못 찾은 것 자체가 실패다.
     */
    expect(block, "FIXTURE_PALETTE를 못 읽었다 — 검사가 아무것도 안 보고 있다").not.toBeNull();
    if (!block) return;

    const labels = [...block[1].matchAll(/\/\/\s*(\w+)/g)].map((match) => match[1]);
    const tones = Object.entries(FIXTURE_TONE)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    expect(labels, `palette says ${labels.join(",")}`).toEqual(tones);
  });
});

describe("아틀라스 격자가 내용을 담는가", () => {
  /*
   * 간판·현수막 그림은 격자 아틀라스 한 장에 굽는다. 칸을 고르는 식이
   * `index % columns`와 `Math.floor(index / columns)`이라, **내용이 칸보다
   * 많으면 캔버스 밖에 그려진다** — 예외도 경고도 없이 그 문구만 빈칸이 된다.
   *
   * 지금은 셋 다 정확히 꽉 차 있다(가로 간판 16/16, 세로 간판 16/16,
   * 현수막 8/8). **하나만 더해도 넘친다**는 뜻이라 더 위험하다.
   */
  const source = readFileSync("src/game/world/atlasTextures.ts", "utf8");

  function grid(prefix: string): number {
    const columns = new RegExp(`const ${prefix}_COLUMNS = (\\d+)`).exec(source);
    const rows = new RegExp(`const ${prefix}_ROWS = (\\d+)`).exec(source);
    expect(columns, `${prefix}_COLUMNS를 못 읽었다`).not.toBeNull();
    expect(rows, `${prefix}_ROWS를 못 읽었다`).not.toBeNull();
    return Number(columns?.[1]) * Number(rows?.[1]);
  }

  it("가로 간판이 격자에 들어간다", () => {
    const cells = grid("SIGN_H");
    expect(SHOP_BRANDS.length, `업종 ${SHOP_BRANDS.length}개, 칸 ${cells}개`).toBeLessThanOrEqual(
      cells,
    );
  });

  it("세로 간판이 격자에 들어간다", () => {
    const cells = grid("SIGN_V");
    expect(SHOP_BRANDS.length, `업종 ${SHOP_BRANDS.length}개, 칸 ${cells}개`).toBeLessThanOrEqual(
      cells,
    );
  });

  it("현수막이 격자에 들어간다", () => {
    const cells = grid("BANNER");
    expect(BANNER_TEXTS.length, `문구 ${BANNER_TEXTS.length}개, 칸 ${cells}개`).toBeLessThanOrEqual(
      cells,
    );
  });
});
