import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { colorDistance } from "@/game/core/color";
import { QUALITY_PRESETS } from "@/game/systems/quality";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

/*
 * 하늘 돔.
 *
 * 단색 배경 하나였던 하늘을 그라데이션 + 구름으로 바꿨다. 여기서 잡는 것은
 * **화면을 봐야만 아는 실패들**이다:
 *
 * - 돔이 카메라 far 밖에 있으면 클립 단계에서 통째로 잘려 한 픽셀도 안 나온다.
 *   실제로 반지름 500m로 시작했다가 그렇게 됐고, 배경색이 그대로 보여서
 *   "하늘이 원래 저 색"으로 착각했다.
 * - 지평선 색이 안개 색과 다르면 먼 건물이 다른 색 띠에 잘려 보인다.
 */

const domeSource = readFileSync("src/game/world/SkyDome.tsx", "utf8");

describe("돔이 카메라 안에 들어오는가", () => {
  it("반지름 배율이 1보다 작다", () => {
    /*
     * 카메라 far = 안개 거리 + 60이다. 배율이 1을 넘으면 far 밖으로 나가
     * 하늘이 사라진다. 여유분(+60)에 기대지 않는다 — 그 값이 줄면 조용히 깨진다.
     */
    const match = /const DOME_RADIUS_SCALE = ([\d.]+);/.exec(domeSource);
    expect(match, "DOME_RADIUS_SCALE를 찾지 못했다").not.toBeNull();
    if (!match) return;

    const scale = Number(match[1]);
    expect(scale, `배율 ${scale}`).toBeGreaterThan(0);
    expect(scale, `배율 ${scale}`).toBeLessThan(1);
  });

  it("모든 품질에서 돔이 far 평면 안이다", () => {
    const match = /const DOME_RADIUS_SCALE = ([\d.]+);/.exec(domeSource);
    if (!match) return;
    const scale = Number(match[1]);

    for (const preset of Object.values(QUALITY_PRESETS)) {
      // GameScene: camera far = quality.fogFar + 60
      const far = preset.fogFar + 60;
      const radius = preset.fogFar * scale;
      expect(radius, `${preset.level}: 반지름 ${radius} vs far ${far}`).toBeLessThan(far);
    }
  });

  it("깊이를 쓰지 않고 가장 먼저 그린다", () => {
    // 깊이를 켜면 무엇에 가려지거나 무엇을 가린다 — 배경은 둘 다 하면 안 된다
    expect(domeSource).toContain("depthTest={false}");
    expect(domeSource).toContain("depthWrite={false}");
    expect(domeSource).toMatch(/renderOrder=\{-\d+\}/);
  });

  it("안개를 받지 않는다", () => {
    // 받으면 하늘이 안개색 한 장으로 덮여 그라데이션이 통째로 사라진다
    expect(domeSource).toContain("fog={false}");
  });
});

describe("시간대 하늘 색", () => {
  it("모든 시간대에 꼭대기 색과 구름 양이 있다", () => {
    for (const id of TIME_OF_DAY_ORDER) {
      const preset = TIME_OF_DAY[id];
      expect(preset.skyTop, `${id} skyTop`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.cloudiness, `${id} cloudiness`).toBeGreaterThanOrEqual(0);
      expect(preset.cloudiness, `${id} cloudiness`).toBeLessThanOrEqual(1);
    }
  });

  it("꼭대기가 지평선보다 확실히 짙다", () => {
    /*
     * 둘이 같으면 단색 배경으로 돌아간다 — 돔을 넣은 의미가 없어진다.
     * 「그라데이션이 있다」를 색 거리로 잰다.
     */
    for (const id of TIME_OF_DAY_ORDER) {
      const preset = TIME_OF_DAY[id];
      const distance = colorDistance(preset.skyTop, preset.sky);
      expect(
        distance,
        `${id}: top ${preset.skyTop} vs horizon ${preset.sky} = ${distance.toFixed(0)}`,
      ).toBeGreaterThan(25);
    }
  });

  it("밤에는 구름을 거의 띄우지 않는다", () => {
    // 어두운 하늘에 흰 구름이 그대로 뜨면 종잇장을 붙인 것처럼 보인다
    expect(TIME_OF_DAY.night.cloudiness).toBeLessThan(TIME_OF_DAY.noon.cloudiness / 2);
  });
});

describe("그림자 카메라", () => {
  it("반경이 품질에 따라 커진다", () => {
    expect(QUALITY_PRESETS.low.shadowRadius).toBeLessThan(QUALITY_PRESETS.medium.shadowRadius);
    expect(QUALITY_PRESETS.medium.shadowRadius).toBeLessThan(QUALITY_PRESETS.high.shadowRadius);
  });

  it("텍셀이 사람 발보다 잘다", () => {
    /*
     * 예전에는 도시 전체(약 322m)를 한 장에 담아 텍셀이 16cm였다 — 발밑
     * 그림자가 뭉개져 캐릭터가 바닥에서 떠 보였다.
     */
    for (const preset of Object.values(QUALITY_PRESETS)) {
      if (!preset.shadows) continue;
      const texel = (preset.shadowRadius * 2) / preset.shadowMapSize;
      expect(texel, `${preset.level}: 텍셀 ${(texel * 100).toFixed(1)}cm`).toBeLessThan(0.12);
    }
  });

  it("그림자 반경이 안개 거리를 넘지 않는다", () => {
    // 보이지도 않는 곳의 그림자를 그리는 데 해상도를 쓰면 손해다
    for (const preset of Object.values(QUALITY_PRESETS)) {
      expect(preset.shadowRadius, `${preset.level}`).toBeLessThan(preset.fogFar);
    }
  });
});
