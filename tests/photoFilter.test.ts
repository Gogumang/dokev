import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { colorDistance } from "@/game/core/color";
import { APPEARANCES } from "@/game/player/appearance";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

import {
  DEFAULT_PHOTO_FILTER,
  isTransparentFilter,
  nextPhotoFilter,
  PHOTO_FILTER_ORDER,
  PHOTO_FILTERS,
  photoFilterPreset,
  type PhotoFilterId,
} from "@/game/systems/photoFilter";

const RGBA = /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/;

describe("PHOTO_FILTERS", () => {
  it("순서에 빠진 필터가 없다", () => {
    // 순서에서 빠지면 버튼을 눌러도 영영 나오지 않는다
    const ids = Object.keys(PHOTO_FILTERS) as PhotoFilterId[];
    expect([...PHOTO_FILTER_ORDER].sort()).toEqual([...ids].sort());
  });

  it("색이 모두 rgba 문자열이다", () => {
    // canvas 그라데이션이 파싱하지 못하면 그 정지점이 조용히 무시된다
    for (const filter of Object.values(PHOTO_FILTERS)) {
      expect(RGBA.test(filter.center), `${filter.id}.center: ${filter.center}`).toBe(true);
      expect(RGBA.test(filter.edge), `${filter.id}.edge: ${filter.edge}`).toBe(true);
    }
  });

  it("이름이 비어 있지 않다", () => {
    for (const filter of Object.values(PHOTO_FILTERS)) {
      expect(filter.name.length, `${filter.id}`).toBeGreaterThan(0);
    }
  });

  it("가장자리가 가운데보다 진하다", () => {
    // 반대면 비네트가 아니라 후광이 된다
    const alpha = (rgba: string) => Number.parseFloat(rgba.split(",")[3]);
    for (const filter of Object.values(PHOTO_FILTERS)) {
      // 색을 얹지 않는 것(필터 없음·톤 항목)은 비네트 규칙의 대상이 아니다
      if (isTransparentFilter(filter)) continue;
      expect(
        alpha(filter.edge),
        `${filter.id}: center=${alpha(filter.center)}, edge=${alpha(filter.edge)}`,
      ).toBeGreaterThan(alpha(filter.center));
    }
  });

  it("기본값은 필터 없음이다", () => {
    expect(DEFAULT_PHOTO_FILTER).toBe("none");
    expect(PHOTO_FILTER_ORDER[0]).toBe("none");
  });
});

describe("nextPhotoFilter", () => {
  it("한 바퀴 돌면 제자리로 온다", () => {
    // 톤까지 포함한 한 바퀴를 본다 — 못 쓰는 환경의 순환은 photoTone이 따로 본다
    let id: PhotoFilterId = DEFAULT_PHOTO_FILTER;
    for (let i = 0; i < PHOTO_FILTER_ORDER.length; i += 1) id = nextPhotoFilter(id, true);
    expect(id).toBe(DEFAULT_PHOTO_FILTER);
  });

  it("모든 필터를 한 번씩 거친다", () => {
    const seen = new Set<PhotoFilterId>();
    let id: PhotoFilterId = DEFAULT_PHOTO_FILTER;
    for (let i = 0; i < PHOTO_FILTER_ORDER.length; i += 1) {
      seen.add(id);
      id = nextPhotoFilter(id, true);
    }
    expect(seen.size).toBe(PHOTO_FILTER_ORDER.length);
  });

  it("모르는 값이면 기본값으로 되돌린다", () => {
    // 필터 하나 때문에 버튼이 죽으면 안 된다
    expect(nextPhotoFilter("sepia" as PhotoFilterId)).toBe(DEFAULT_PHOTO_FILTER);
  });
});

describe("photoFilterPreset / isTransparentFilter", () => {
  it("아는 id는 그대로 준다", () => {
    expect(photoFilterPreset("dream").id).toBe("dream");
  });

  it("모르는 id는 기본값", () => {
    expect(photoFilterPreset("").id).toBe(DEFAULT_PHOTO_FILTER);
  });

  it("색을 얹지 않는 것을 투명으로 본다", () => {
    /*
     * 투명이면 사각형 자체를 그리지 않는다. 기준은 **id가 아니라 색**이다 —
     * id로 세면 톤 항목이 늘 때마다 빈 사각형을 하나씩 더 그리게 된다.
     */
    expect(isTransparentFilter(PHOTO_FILTERS.none), "필터 없음이 투명이 아니다").toBe(true);
    for (const filter of Object.values(PHOTO_FILTERS)) {
      const laysColor = filter.center !== "rgba(0, 0, 0, 0)" || filter.edge !== "rgba(0, 0, 0, 0)";
      expect(isTransparentFilter(filter), `${filter.id}`).toBe(!laysColor);
    }
  });
});

describe("색보정을 얹어도 실루엣이 남는가", () => {
  /*
   * 필터 자체(알파·이름·순환)는 보고 있었지만 **시간대·외형과 곱한 결과**는
   * 아무도 안 봤다. 필터는 화면 전체를 물들이므로 배경과 인물이 **같은 방향**
   * 으로 끌려간다 — 색거리가 함께 줄어든다.
   *
   * 재 보니 노을 하늘 + 노을 후드가 필터 없이 52인데, 「몽환」의 가장자리
   * 비네트를 얹으면 **23**까지 떨어졌다. 가운데는 43으로 버틴다.
   */
  function channels(rgba: string): { r: number; g: number; b: number; a: number } {
    const parts = rgba
      .replace(/rgba?\(|\)/g, "")
      .split(",")
      .map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }

  function toHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
    return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
  }

  /** hex 위에 rgba를 얹은 결과 */
  function over(base: string, layer: string): string {
    const b = {
      r: Number.parseInt(base.slice(1, 3), 16),
      g: Number.parseInt(base.slice(3, 5), 16),
      b: Number.parseInt(base.slice(5, 7), 16),
    };
    const l = channels(layer);
    return toHex(
      b.r * (1 - l.a) + l.r * l.a,
      b.g * (1 - l.a) + l.g * l.a,
      b.b * (1 - l.a) + l.b * l.a,
    );
  }

  it("합성 계산이 맞는다", () => {
    // 완전 투명은 원본 그대로, 완전 불투명은 얹은 색 그대로
    expect(over("#ff8a3d", "rgba(0, 0, 0, 0)")).toBe("#ff8a3d");
    expect(over("#ff8a3d", "rgba(0, 0, 0, 1)")).toBe("#000000");
  });

  it("가운데에서는 눈에 띄게 다르다", () => {
    /*
     * 피사체는 보통 가운데에 온다. 여기서 40을 밑돌면 사진마다 인물이
     * 배경에 붙어 나온다 — 이 저장소가 「눈에 띄게 다르다」로 쓰는 값이다.
     */
    let checked = 0;
    for (const time of TIME_OF_DAY_ORDER) {
      for (const filterId of PHOTO_FILTER_ORDER) {
        const filter = PHOTO_FILTERS[filterId];
        for (const look of Object.values(APPEARANCES)) {
          checked += 1;
          const distance = colorDistance(
            over(look.hoodie, filter.center),
            over(TIME_OF_DAY[time].sky, filter.center),
          );
          expect(
            distance,
            `${time}/${filter.id}/${look.id}: ${distance.toFixed(0)}`,
          ).toBeGreaterThan(40);
        }
      }
    }
    expect(checked, `확인한 조합 ${checked}가지`).toBe(
      TIME_OF_DAY_ORDER.length * PHOTO_FILTER_ORDER.length * Object.keys(APPEARANCES).length,
    );
  });

  it("색보정이 위험 신호를 지우지 않는다", () => {
    /*
     * 필터는 3D 화면 전체에 얹히므로 **보스 예고 색**에도 걸린다. 예고를
     * 못 보면 못 피하고, 그건 취향 문제가 아니라 공정성 문제다.
     *
     * 재 보니 필터 없이 146이고 가장 나쁜 조합(「몽환」 가장자리)이 66이다 —
     * 기준(40)을 넉넉히 넘는다. 필터가 늘거나 색이 바뀔 때 이 여유가
     * 사라지는 것을 막는다.
     */
    const BODY = "#8a8394";
    const TELEGRAPH = "#ff8a3d";

    const boss = readFileSync("src/game/combat/Boss.tsx", "utf8");
    expect(boss, "몸통 색이 바뀌었다").toContain(`normal: "${BODY}"`);
    expect(boss, "예고 색이 바뀌었다").toContain(`windup: "${TELEGRAPH}"`);

    for (const filterId of PHOTO_FILTER_ORDER) {
      const filter = PHOTO_FILTERS[filterId];
      for (const [where, layer] of [
        ["가운데", filter.center],
        ["가장자리", filter.edge],
      ] as const) {
        const distance = colorDistance(over(BODY, layer), over(TELEGRAPH, layer));
        expect(distance, `${filter.id} ${where}: ${distance.toFixed(0)}`).toBeGreaterThan(50);
      }
    }
  });

  it("가장자리에서도 형태가 남는다", () => {
    /*
     * 비네트는 배경과 인물을 함께 어둡게 만든다. 지금 가장 나쁜 조합이 23이고
     * 그것이 실제로 읽히는지는 **사람이 봐야** 안다(README 2분 목록에 적어
     * 두었다). 여기서는 「지금보다 나빠지지 않는다」만 지킨다.
     */
    for (const time of TIME_OF_DAY_ORDER) {
      for (const filterId of PHOTO_FILTER_ORDER) {
        const filter = PHOTO_FILTERS[filterId];
        for (const look of Object.values(APPEARANCES)) {
          const distance = colorDistance(
            over(look.hoodie, filter.edge),
            over(TIME_OF_DAY[time].sky, filter.edge),
          );
          expect(
            distance,
            `${time}/${filter.id}/${look.id}: ${distance.toFixed(0)}`,
          ).toBeGreaterThan(20);
        }
      }
    }
  });
});

/*
 * 「항상 맨 위에 뜬다」가 지켜지는지.
 *
 * `FilterOverlay`는 카메라 30cm 앞에 사각형 하나를 띄워 화면을 덮는다. 그
 * 방식이 성립하려면 네 가지가 동시에 참이어야 하고, **파일 주석이 그것을 이미
 * 못 박아 두었다** — 그런데 넷을 하나씩 뒤집어 봐도 검사가 아무것도 몰랐다.
 *
 * 넷 중 무엇이 깨지든 증상이 다르다: 깊이 판정이 켜지면 앞을 지나는 동료에게
 * 가려지고, 시야 판정이 켜지면 **통째로 사라지며**(위치를 매 프레임 바꾸므로
 * 경계 구가 낡는다), 순서가 앞으로 오면 투명한 것들 밑에 깔리고, 톤매핑이
 * 켜지면 고른 색이 그대로 안 나온다.
 *
 * 눈으로만 잡히는 것들이라 여기서 막는다. 카메라 앞 오버레이는 지금 이 하나뿐이고
 * (`renderOrder`/`depthTest`를 쓰는 다른 곳이 없다), 새로 생기면 이 규칙을 함께 늘린다.
 */
describe("카메라 앞 오버레이", () => {
  const overlay = readFileSync("src/game/scene/FilterOverlay.tsx", "utf8");

  // 서식에 안 걸리게 공백을 지우고 본다 (붙여 쓰든 줄을 나누든 같게 읽힌다)
  const dense = overlay.replace(/\s+/g, "");

  it.each([
    ["깊이 판정", "depthTest={false}", "앞을 지나는 것에 가려진다"],
    ["깊이 쓰기", "depthWrite={false}", "뒤에 그릴 것을 지운다"],
    ["시야 판정", "frustumCulled={false}", "위치가 매 프레임 바뀌어 통째로 사라진다"],
    ["톤매핑", "toneMapped={false}", "고른 색이 그대로 안 나온다"],
  ])("%s를 꺼 둔다 — 켜지면 %s", (_name, flag, symptom) => {
    expect(dense, `${symptom}: ${flag}를 찾지 못했다`).toContain(flag.replace(/\s+/g, ""));
  });

  it("렌더 순서를 뒤로 민다 — 앞으로 오면 투명한 것들 밑에 깔린다", () => {
    const found = /renderOrder=\{(\d+)\}/.exec(dense);
    expect(found, `renderOrder를 찾지 못했다`).not.toBeNull();
    // 100이면 충분히 뒤다. 정확한 값(999)을 고정하면 조정할 때마다 검사가 깨진다.
    expect(Number(found?.[1]), `renderOrder=${found?.[1]}`).toBeGreaterThanOrEqual(100);
  });
});
