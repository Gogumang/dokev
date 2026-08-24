import { describe, expect, it } from "vitest";

import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import {
  AWNING_PALETTE,
  CAR_CABIN_PALETTE,
  CONIFER_PALETTE,
  CROWN_PALETTE,
  HILLSIDE_PALETTE,
  MARKET_PALETTE,
  NEON_PALETTE,
  OLD_TOWN_PALETTE,
  PARK_PALETTE,
  PLANTER_PALETTE,
  PROP_PALETTE,
  ROAD_MARK_PALETTE,
  ROAD_SURFACE_COLOR,
  ROCK_PALETTE,
  ROOFTOP_PALETTE,
  SHOPFRONT_PALETTE,
  TRUNK_PALETTE,
  UNDERGROWTH_PALETTE,
  WALL_GREEN_PALETTE,
} from "@/game/world/cityPalettes";

/*
 * 색의 **절제**.
 *
 * 트레일러 프레임 93장을 보고 나온 규칙이다(DOKEV_VIDEO_STUDY 「3.5 프레임에서
 * 직접 확인한 것 (2026-08-24)」). 원작 화면에서 채도 높은 색은 캐릭터·도깨비·
 * 이펙트·소품에만 얹히고 **바탕은 거의 무채색**이다. 화면 전체가 원색이 되는 것은
 * 전환 순간뿐이다.
 *
 * 우리는 반대였다 — 어느 팔레트를 열어도 고채도가 두엇씩 섞여 있어 도시 전체가
 * 골고루 알록달록했다. 그러면 **화면이 무엇이 중요한지 말해 주지 못한다.** 색을
 * 예쁘게 고르는 문제가 아니라 **어디에 몰아 주느냐**의 문제다.
 *
 * 채도는 HSL의 S다. 이 파일 안에서 잰다 — 제품이 부르지 않는 계산을
 * `core/color.ts`에 두면 아무도 안 쓰는 export가 된다.
 */
function saturation(hex: string): number {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max === min) return 0;

  // HSL 정의 그대로. 밝기가 0.5를 넘으면 분모가 뒤집힌다
  const lightness = (max + min) / 2;
  return lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** 이 위면 「튀는 색」이다 */
const VIVID = 0.55;

/**
 * **바탕** — 화면 면적을 차지하는 것들.
 *
 * 건물 벽·지붕·노면·바위·흙·줄기처럼 **어디에나 있는** 색이다. 여기에 채도가
 * 있으면 도시 전체가 알록달록해지고, 그러면 캐릭터가 배경에서 뜨지 않는다.
 */
const BACKDROP: Array<[string, readonly string[]]> = [
  ["PROP", PROP_PALETTE],
  ["SHOPFRONT", SHOPFRONT_PALETTE],
  ["ROOFTOP", ROOFTOP_PALETTE],
  ["ROAD_SURFACE", [ROAD_SURFACE_COLOR]],
  ["TRUNK", TRUNK_PALETTE],
  ["ROCK", ROCK_PALETTE],
  ["HILLSIDE", HILLSIDE_PALETTE],
  ["PLANTER", PLANTER_PALETTE],
  ["CONIFER", CONIFER_PALETTE],
  ["CAR_CABIN", CAR_CABIN_PALETTE],
];

/**
 * **소품 악센트** — 배경 안에 심는 평면 원색 그래픽.
 *
 * 차양·시장 천막·벽화 같은 것들이다. 프레임에서 실사 배경과 만화 캐릭터 사이를
 * 잇는 **중간 단계**로 확인됐다 — 그러니 이쪽은 눌러선 안 된다. 대신 수가 적어야
 * 하고, 그것은 아래 「몰아 주기」 검사가 지킨다.
 */
const ACCENT_PROPS: Array<[string, readonly string[]]> = [
  ["AWNING", AWNING_PALETTE],
  ["MARKET", MARKET_PALETTE],
  ["PARK", PARK_PALETTE],
];

/** 넓게 깔리는 것들 — 수풀·꽃·가로수 잎처럼 도시 전역에 반복되는 색 */
const SPREAD: Array<[string, readonly string[]]> = [
  ["UNDERGROWTH", UNDERGROWTH_PALETTE],
  /*
   * 담에 붙는 식물은 **악센트가 아니라 넓게 깔리는 것**이다. 처음에 소품 쪽으로
   * 놓았다가 `oldTown` 검사에 걸려 알았다 — 이 팔레트의 분홍은 벽화가 아니라
   * 화분의 철쭉이고, 발밑 잡초의 철쭉과 **같은 값이어야 한다.**
   */
  ["WALL_GREEN", WALL_GREEN_PALETTE],
  ["CROWN", CROWN_PALETTE],
  ["ROAD_MARK", ROAD_MARK_PALETTE],
  ["OLD_TOWN", OLD_TOWN_PALETTE],
];

describe("바탕은 눌려 있는가", () => {
  it("어디에나 있는 색은 채도가 낮다", () => {
    /*
     * 0.5로 잡는다. 완전 무채색을 요구하면 도시가 회색 상자가 되고, 그건 원작
     * 화면도 아니다 — 저쪽 배경에도 색은 있다. 다만 **약하다.**
     */
    const loud = BACKDROP.flatMap(([name, palette]) =>
      palette
        .map((color) => ({ name, color, value: saturation(color) }))
        .filter((entry) => entry.value > 0.5),
    );
    expect(
      loud.map((entry) => `${entry.name} ${entry.color}=${entry.value.toFixed(2)}`),
      "바탕에 튀는 색이 섞여 있다",
    ).toEqual([]);
  });

  it("넓게 깔리는 것에 원색을 쓰지 않는다", () => {
    /*
     * 수풀 꽃 하나가 원색이면 **도시 전역에 그 원색이 반복된다.** 소품 악센트와
     * 다른 점이 이것이다 — 저쪽은 자리가 정해져 있고 이쪽은 어디에나 있다.
     */
    const loud = SPREAD.flatMap(([name, palette]) =>
      palette
        .map((color) => ({ name, color, value: saturation(color) }))
        .filter((entry) => entry.value >= 0.7),
    );
    expect(
      loud.map((entry) => `${entry.name} ${entry.color}=${entry.value.toFixed(2)}`),
      "넓게 깔리는 색이 원색이다",
    ).toEqual([]);
  });
});

describe("튀는 색을 몰아 주는가", () => {
  it("도시 팔레트에서 고채도가 3분의 1을 넘지 않는다", () => {
    /*
     * 개수 비율로 잰다. 실제로 중요한 것은 **면적**이지만 면적은 팔레트에서 알
     * 수 없다 — 대신 「고채도가 골고루 흩어져 있는가」는 개수로 드러난다.
     * 이 검사를 처음 쓴 시점에 42%였다.
     */
    const all = [...BACKDROP, ...ACCENT_PROPS, ...SPREAD].flatMap(([, palette]) => palette);
    const vivid = all.filter((color) => saturation(color) >= VIVID);
    const ratio = vivid.length / all.length;
    expect(
      ratio,
      `고채도 ${vivid.length}/${all.length} = ${(ratio * 100).toFixed(0)}%: ${vivid.join(", ")}`,
    ).toBeLessThanOrEqual(1 / 3);
  });

  it("소품 악센트는 눌리지 않았다 — 다 누르면 도시가 회색 상자가 된다", () => {
    /*
     * 위 검사만 있으면 「전부 눌러 버리기」로 통과할 수 있다. 프레임이 말한 것은
     * 「색을 없애라」가 아니라 **「몰아 줘라」**다. 차양·시장·벽화는 튀어야 한다.
     */
    for (const [name, palette] of ACCENT_PROPS) {
      const brightest = Math.max(...palette.map(saturation));
      expect(brightest, `${name}에 튀는 색이 하나도 없다`).toBeGreaterThanOrEqual(VIVID);
    }
  });
});

describe("가장 튀는 것은 바탕이 아니다", () => {
  it("네온과 도깨비가 도시 어느 바탕보다 튄다", () => {
    /*
     * 원작 밤 장면에서 청록 발광체는 화면의 3% 미만인데 가장 먼저 눈에 걸린다.
     * 그 자리를 우리 쪽에서 차지해야 하는 것은 **동료와 간판빛**이다.
     */
    const backdropTop = Math.max(...BACKDROP.flatMap(([, palette]) => palette.map(saturation)));

    const neonLow = Math.min(...NEON_PALETTE.map(saturation));
    expect(
      neonLow,
      `네온 최저 ${neonLow.toFixed(2)} vs 바탕 최고 ${backdropTop.toFixed(2)}`,
    ).toBeGreaterThan(backdropTop);

    for (const id of DOKEBI_ORDER) {
      const body = saturation(DOKEBI[id].bodyColor);
      const accent = saturation(DOKEBI[id].accentColor);
      expect(
        Math.max(body, accent),
        `${id}: 몸 ${body.toFixed(2)}, 강조 ${accent.toFixed(2)}, 바탕 최고 ${backdropTop.toFixed(2)}`,
      ).toBeGreaterThan(backdropTop);
    }
  });
});
