import { describe, expect, it } from "vitest";

import { colorDistance } from "@/game/core/color";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import {
  APPEARANCE_ORDER,
  APPEARANCES,
  appearancePreset,
  DEFAULT_APPEARANCE,
  type AppearanceId,
} from "@/game/player/appearance";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

const HEX = /^#[0-9a-f]{6}$/i;
const PARTS = ["skin", "hair", "hoodie", "hoodieDark", "pants", "shoe", "bag"] as const;

describe("APPEARANCES", () => {
  it("순서에 빠진 외형이 없다", () => {
    const ids = Object.keys(APPEARANCES) as AppearanceId[];
    expect([...APPEARANCE_ORDER].sort()).toEqual([...ids].sort());
  });

  it("모든 색이 유효한 hex다", () => {
    for (const look of Object.values(APPEARANCES)) {
      for (const part of PARTS) {
        expect(HEX.test(look[part]), `${look.id}.${part} = ${look[part]}`).toBe(true);
      }
    }
  });

  it("기본값이 지금까지의 화면과 같다", () => {
    // 처음 고르는 사람이 보던 캐릭터가 갑자기 달라지면 안 된다
    expect(DEFAULT_APPEARANCE).toBe("sunset");
    expect(APPEARANCES.sunset.hoodie).toBe("#ff8a3d");
    expect(APPEARANCES.sunset.bag).toBe("#2fd4c4");
  });

  it("네 시간대 하늘 어디서도 묻히지 않는다", () => {
    /*
     * Character.tsx가 "노을 아래에서 실루엣이 배경과 분리되어야 한다"는
     * 제약을 달고 있었다. 색을 고를 수 있게 되면 그 제약을 깰 수 있으므로
     * 여기서 지킨다 — 하늘색과 너무 가까운 후드는 역광에서 사라진다.
     *
     * 예전에는 **노을과 밤만** 봤다. 그 사이 외형이 넷이 되었고 시간대도
     * 넷인데 절반만 확인하고 있었다 — 조합이 곱해질 때 확인이 따라오지 않는
     * 것은 이 저장소에서 반복해 나온 구멍이다(플레이어×동료 색이 그랬다).
     *
     * 노을만 기준이 낮은 이유: **기본값(#ff8a3d)이 노을 하늘과 52밖에 차이
     * 나지 않는다.** 처음부터 그랬고 화면을 확인한 적이 없으므로, 지금은
     * 「기본값보다 나빠지지 않는다」만 보장한다. 나머지 시간대는 여유가
     * 있으므로 더 높게 잡아 둔다.
     */
    const FLOOR: Record<string, number> = { sunset: 50, dawn: 60, noon: 60, night: 60 };

    let checked = 0;
    for (const id of TIME_OF_DAY_ORDER) {
      const sky = TIME_OF_DAY[id].sky;
      const floor = FLOOR[id];
      expect(floor, `${id}의 기준이 없다`).toBeGreaterThan(0);

      for (const look of Object.values(APPEARANCES)) {
        checked += 1;
        const distance = colorDistance(look.hoodie, sky);
        expect(
          distance,
          `${id} 하늘 ${sky}에서 ${look.id}(${look.hoodie})가 ${distance.toFixed(0)}`,
        ).toBeGreaterThan(floor);
      }
    }

    // 시간대나 외형이 사라지면 빈 조합을 훑으며 통과한다
    expect(checked, `확인한 조합 ${checked}가지`).toBe(
      TIME_OF_DAY_ORDER.length * APPEARANCE_ORDER.length,
    );
  });

  it("후드 그늘색이 본색보다 어둡다", () => {
    // 그늘이 밝으면 접힌 부분이 튀어나온 것처럼 보인다
    for (const look of Object.values(APPEARANCES)) {
      const bright = colorDistance(look.hoodie, "#000000");
      const dark = colorDistance(look.hoodieDark, "#000000");
      expect(dark, `${look.id}: hoodie=${bright.toFixed(0)}, dark=${dark.toFixed(0)}`).toBeLessThan(
        bright,
      );
    }
  });

  it("가방이 후드와 확실히 다르다", () => {
    // 포인트 색이 옷과 비슷하면 실루엣이 한 덩어리가 된다
    for (const look of Object.values(APPEARANCES)) {
      expect(colorDistance(look.bag, look.hoodie), `${look.id}`).toBeGreaterThan(80);
    }
  });

  it("이름이 모두 다르다", () => {
    const names = Object.values(APPEARANCES).map((look) => look.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("appearancePreset", () => {
  it("아는 id는 그대로 준다", () => {
    expect(appearancePreset("mint").id).toBe("mint");
  });

  it("모르는 id는 기본값", () => {
    // 저장값이 깨져도 캐릭터는 보여야 한다
    expect(appearancePreset("neon").id).toBe(DEFAULT_APPEARANCE);
  });
});

describe("colorDistance", () => {
  it("같은 색은 0", () => {
    expect(colorDistance("#123456", "#123456")).toBe(0);
  });

  it("검정과 흰색이 최대에 가깝다", () => {
    expect(colorDistance("#000000", "#ffffff")).toBeCloseTo(441.67, 1);
  });

  it("파싱에 실패하면 0으로 본다", () => {
    // 모르면 "구분 안 됨"으로 보는 쪽이 안전하다
    expect(colorDistance("not-a-color", "#ffffff")).toBe(0);
  });
});

describe("외형이 바닥과 구분되는가", () => {
  /*
   * 기존 검사는 **하늘**과만 대조한다. 그런데 3인칭에서 캐릭터는 대부분
   * 바닥을 배경으로 보인다 — 하늘을 등지는 건 뛰어오를 때뿐이다.
   *
   * 실제로 밤에 후드와 보도블록의 명암비가 1.03까지 떨어진 적이 있다
   * (반복 102, 카메라 쪽 보조광으로 해결). 바닥 대조가 빠져 있어서 놓쳤다.
   *
   * 아래 값은 브라우저에서 **직접 재서** 옮긴 것이다. 조명이 바뀌면 달라지므로
   * 절대 기준이 아니라 「이 정도로 가까우면 묻힌다」는 하한으로만 쓴다.
   */
  const MEASURED_GROUND: Array<[string, string]> = [
    ["노을", "#6c4637"],
    ["한낮", "#887984"],
    ["밤", "#1b1125"],
  ];

  /*
   * 명암비가 아니라 색거리를 쓴다. 밝기만 비교하면 후드가 바닥보다 밝아지는
   * 지점에서 비율이 1을 지나며, 실제로는 색이 확 다른데도 「구분 안 됨」으로
   * 잡힌다 — 밤 수정 때 겪었다.
   */
  const MIN_DISTANCE = 60;

  for (const id of APPEARANCE_ORDER) {
    const preset = APPEARANCES[id];
    for (const [when, ground] of MEASURED_GROUND) {
      it(`${preset.name} 후드가 ${when} 바닥과 떨어져 있다`, () => {
        const distance = colorDistance(preset.hoodie, ground);
        expect(
          distance,
          `색거리 ${distance.toFixed(1)} (후드 ${preset.hoodie}, 바닥 ${ground})`,
        ).toBeGreaterThan(MIN_DISTANCE);
      });
    }
  }
});

describe("동료를 나와 구분할 수 있는가", () => {
  /*
   * 도깨비 색은 **도깨비끼리만** 비교하고 있었다. 그런데 화면에는 늘 플레이어와
   * 동료가 함께 있다 — 자정(보라)을 넣고 보니 외형 「자두」 후드와 색거리가
   * 41밖에 되지 않았다.
   *
   * 하한을 50으로 둔다. 지금 가장 가까운 쌍은 민트 후드와 물비늘(55)로,
   * 둘 다 청록 계열이지만 밝기가 달라 실제로는 구분된다 — 더 조이면 기존
   * 조합을 근거 없이 흔들게 된다.
   */
  const MIN_DISTANCE = 50;

  for (const appearanceId of APPEARANCE_ORDER) {
    for (const dokebiId of DOKEBI_ORDER) {
      it(`${appearanceId} 후드와 ${dokebiId}가 구분된다`, () => {
        const hoodie = APPEARANCES[appearanceId].hoodie;
        const body = DOKEBI[dokebiId].bodyColor;
        const distance = colorDistance(hoodie, body);
        expect(
          distance,
          `색거리 ${distance.toFixed(0)} (후드 ${hoodie}, 도깨비 ${body})`,
        ).toBeGreaterThan(MIN_DISTANCE);
      });
    }
  }
});
