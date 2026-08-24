import { describe, expect, it } from "vitest";

import { colorDistance } from "@/game/core/color";
import { FACADE_TONES, TOON_BANDS } from "@/game/world/textures";

/*
 * 카툰 렌더링(DokeV 계열) 룩이 성립하는 조건.
 *
 * 셀 셰이딩은 "켜면 만화가 되는" 스위치가 아니다. 조명이 계단으로 뭉개지는
 * 만큼 **색과 선이 화면을 대신 지탱해야** 하고, 그 전제가 깨지면 결과는
 * 만화가 아니라 그냥 음영이 뭉개진 사진이 된다. 화면을 봐야만 아는 종류의
 * 실패라서, 전제 쪽을 숫자로 잡아 둔다.
 */

/** 테스트 전용 HSL 변환. src에 쓰는 곳이 없는 함수를 내보내지 않는다 */
function toHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return { hue: max === min ? 0 : max, saturation, lightness };
}

describe("건물 팔레트", () => {
  it("벽 색이 셀 셰이딩을 견딜 만큼 채도가 있다", () => {
    /*
     * 채도가 낮은 벽은 밝기 단이 나뉘는 순간 회색 계단만 남는다. 사진처럼
     * 찍으려던 회벽·베이지가 정확히 그래서 걸렸다.
     */
    for (const tone of FACADE_TONES) {
      const { saturation } = toHsl(tone.wall);
      expect(saturation, `${tone.wall} saturation ${saturation.toFixed(2)}`).toBeGreaterThan(0.3);
    }
  });

  it("벽이 밝은 쪽에 있다", () => {
    // 어두운 벽은 그늘 단에서 창문과 붙어 파사드가 한 덩어리가 된다
    for (const tone of FACADE_TONES) {
      const { lightness } = toHsl(tone.wall);
      expect(lightness, `${tone.wall} lightness ${lightness.toFixed(2)}`).toBeGreaterThan(0.6);
    }
  });

  it("유리가 벽보다 확실히 어둡다", () => {
    /*
     * 여기가 무너지면 "밝게 만들었다"가 곧 "창문이 사라졌다"가 된다 —
     * 채도만 재는 검사는 그 상태도 통과시킨다.
     */
    for (const tone of FACADE_TONES) {
      const wall = toHsl(tone.wall).lightness;
      const glass = toHsl(tone.glass).lightness;
      expect(glass, `${tone.glass} vs wall ${tone.wall}`).toBeLessThan(wall - 0.15);
    }
  });

  it("톤끼리 서로 다른 색으로 읽힌다", () => {
    // 여섯 톤이 비슷하면 구역마다 색을 바꾼 의미가 없다
    for (let i = 0; i < FACADE_TONES.length; i += 1) {
      for (let j = i + 1; j < FACADE_TONES.length; j += 1) {
        const distance = colorDistance(FACADE_TONES[i].wall, FACADE_TONES[j].wall);
        expect(
          distance,
          `${FACADE_TONES[i].wall} vs ${FACADE_TONES[j].wall}: ${distance.toFixed(0)}`,
        ).toBeGreaterThan(35);
      }
    }
  });
});

describe("셀 셰이딩 단수", () => {
  it("계단이 보이되 형태가 읽히는 범위다", () => {
    // 2단은 스텐실, 6단 이상은 Lambert와 구분이 안 된다
    expect(TOON_BANDS).toBeGreaterThanOrEqual(3);
    expect(TOON_BANDS).toBeLessThanOrEqual(5);
  });
});
