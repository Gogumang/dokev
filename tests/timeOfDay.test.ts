import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_OF_DAY,
  nextTimeOfDay,
  sunPosition,
  TIME_OF_DAY,
  TIME_OF_DAY_ORDER,
  timeOfDayPreset,
  type TimeOfDayId,
} from "@/game/world/timeOfDay";

const HEX = /^#[0-9a-f]{6}$/i;

describe("TIME_OF_DAY", () => {
  it("순서에 빠진 시간대가 없다", () => {
    // 순서에서 빠지면 버튼을 눌러도 영영 나오지 않는다
    const ids = Object.keys(TIME_OF_DAY) as TimeOfDayId[];
    expect([...TIME_OF_DAY_ORDER].sort()).toEqual([...ids].sort());
  });

  it("모든 색이 유효한 hex다", () => {
    for (const preset of Object.values(TIME_OF_DAY)) {
      for (const key of ["sky", "hemisphereSky", "hemisphereGround", "sunColor", "fillColor"] as const) {
        expect(HEX.test(preset[key]), `${preset.id}.${key} was: ${preset[key]}`).toBe(true);
      }
    }
  });

  it("이름이 비어 있지 않다", () => {
    for (const preset of Object.values(TIME_OF_DAY)) {
      expect(preset.name.length, `${preset.id}`).toBeGreaterThan(0);
    }
  });

  it("밤이 가장 어둡다", () => {
    // 이름만 밤이고 밝기가 같으면 시간대를 바꾼 의미가 없다
    const night = TIME_OF_DAY.night.sunIntensity;
    for (const preset of Object.values(TIME_OF_DAY)) {
      if (preset.id === "night") continue;
      expect(preset.sunIntensity, `${preset.id} vs night`).toBeGreaterThan(night);
    }
  });

  it("밤에 창문이 가장 밝게 켜진다", () => {
    // 조명만 어두워지고 창문이 그대로면 불 꺼진 도시가 된다
    for (const preset of Object.values(TIME_OF_DAY)) {
      if (preset.id === "night") continue;
      expect(preset.nightGlow, `${preset.id} vs night`).toBeLessThan(TIME_OF_DAY.night.nightGlow);
    }
  });

  it("한낮에도 창문 발광이 0은 아니다", () => {
    // 완전히 0이면 창이 벽과 같은 평면으로 눌려 건물이 밋밋해진다
    expect(TIME_OF_DAY.noon.nightGlow).toBeGreaterThan(0);
  });

  it("창문 발광이 0~1 범위 안에 있다", () => {
    for (const preset of Object.values(TIME_OF_DAY)) {
      expect(preset.nightGlow, `${preset.id}: ${preset.nightGlow}`).toBeGreaterThanOrEqual(0);
      expect(preset.nightGlow, `${preset.id}: ${preset.nightGlow}`).toBeLessThanOrEqual(1);
    }
  });

  it("한낮이 기본값이다", () => {
    /*
     * 오래 노을이 기본이었다 — 만들어 온 화면이 그 빛이었다.
     *
     * 노을은 **모든 것을 주황 한 겹으로 덮는다.** 파사드를 크림·민트·코랄·
     * 라벤더로 갈라 놓아도 화면에서는 한 색으로 읽히고 그늘은 갈색으로 눌린다.
     * 색으로 화면을 지탱하기로 한 이상, 기본은 색이 가장 덜 뭉개지는 시간대여야
     * 한다. 노을은 시간대 전환으로 그대로 남아 있다.
     */
    expect(DEFAULT_TIME_OF_DAY).toBe("noon");
    // 노을의 색은 그대로다 — 바뀐 것은 「기본이 무엇인가」와 광량뿐이다
    expect(TIME_OF_DAY.sunset.sky).toBe("#f0a06a");
  });
});

describe("nextTimeOfDay", () => {
  it("한 바퀴 돌면 제자리로 온다", () => {
    let id: TimeOfDayId = DEFAULT_TIME_OF_DAY;
    for (let i = 0; i < TIME_OF_DAY_ORDER.length; i += 1) id = nextTimeOfDay(id);
    expect(id).toBe(DEFAULT_TIME_OF_DAY);
  });

  it("모든 시간대를 한 번씩 거친다", () => {
    const seen = new Set<TimeOfDayId>();
    let id: TimeOfDayId = DEFAULT_TIME_OF_DAY;
    for (let i = 0; i < TIME_OF_DAY_ORDER.length; i += 1) {
      seen.add(id);
      id = nextTimeOfDay(id);
    }
    expect(seen.size).toBe(TIME_OF_DAY_ORDER.length);
  });

  it("모르는 값이면 기본값으로 되돌린다", () => {
    // 저장된 설정이 깨져도 화면은 나와야 한다
    expect(nextTimeOfDay("noon-ish" as TimeOfDayId)).toBe(DEFAULT_TIME_OF_DAY);
  });
});

describe("timeOfDayPreset", () => {
  it("아는 id는 그대로 준다", () => {
    expect(timeOfDayPreset("night").id).toBe("night");
  });

  it("모르는 id는 기본값", () => {
    expect(timeOfDayPreset("").id).toBe(DEFAULT_TIME_OF_DAY);
  });
});

describe("sunPosition", () => {
  it("노을 프리셋이 기존 방향을 재현한다", () => {
    // (0.7, 0.9, -0.5) 방향을 고도·방위로 옮긴 값이다. 어긋나면 그림자가 돈다.
    const sun = sunPosition(TIME_OF_DAY.sunset, 1);
    const length = Math.hypot(0.7, 0.9, -0.5);

    expect(sun.x, `x was: ${sun.x}`).toBeCloseTo(0.7 / length, 3);
    expect(sun.y, `y was: ${sun.y}`).toBeCloseTo(0.9 / length, 3);
    expect(sun.z, `z was: ${sun.z}`).toBeCloseTo(-0.5 / length, 3);
  });

  it("모든 시간대에서 해가 지평선 위에 있다", () => {
    // 지평선 아래로 내려가면 도시 전체가 검게 눌린다
    for (const preset of Object.values(TIME_OF_DAY)) {
      expect(sunPosition(preset, 100).y, `${preset.id}`).toBeGreaterThan(0);
    }
  });

  it("한낮 해가 여명보다 높다", () => {
    const noon = sunPosition(TIME_OF_DAY.noon, 100).y;
    const dawn = sunPosition(TIME_OF_DAY.dawn, 100).y;
    expect(noon, `noon=${noon}, dawn=${dawn}`).toBeGreaterThan(dawn);
  });

  it("거리에 비례한다", () => {
    const near = sunPosition(TIME_OF_DAY.noon, 10);
    const far = sunPosition(TIME_OF_DAY.noon, 20);
    expect(far.y).toBeCloseTo(near.y * 2, 6);
  });
});

describe("어느 시간대에도 세계가 보이는가", () => {
  /*
   * 해 밝기를 0으로 만들어도 통과했다 — 방향광이 아무 일도 안 하면 그 시간대는
   * 반구광만 남아 형태가 사라진다. 「밤이 어둡다」와 「아무것도 안 보인다」는
   * 다르다.
   */
  it("모든 시간대에 해가 살아 있다", () => {
    for (const id of TIME_OF_DAY_ORDER) {
      const preset = TIME_OF_DAY[id];
      expect(preset.sunIntensity, `${preset.name}의 해 밝기 ${preset.sunIntensity}`).toBeGreaterThan(
        0.2,
      );
    }
  });

  it("밤이 가장 어둡다", () => {
    /*
     * 보조광 세기를 「밝기의 정확히 반대 순서」로 깔아 두었으므로, 밝기 순서가
     * 뒤집히면 보조광 규칙의 근거가 무너진다.
     */
    const night = TIME_OF_DAY.night.sunIntensity;
    for (const id of TIME_OF_DAY_ORDER) {
      if (id === "night") continue;
      expect(TIME_OF_DAY[id].sunIntensity, `${TIME_OF_DAY[id].name}`).toBeGreaterThan(night);
    }
  });
});

describe("카메라 쪽 보조광", () => {
  /*
   * 다른 광원은 전부 월드 고정 방향이라, 플레이어가 어느 쪽을 보느냐에 따라
   * **카메라가 보는 면이 통째로 죽는다.** 브라우저에서 밤을 띄워 재 보니
   * 후드(28,9,3)와 먼 보도블록(19,15,36)의 명암비가 1.03이었다 — 3인칭이라
   * 늘 등을 보는데 그 등이 배경과 구분되지 않았다.
   *
   * 보조광을 넣은 뒤 후드는 (118,17,7)이 됐다.
   */
  it("어두운 시간대일수록 세게 깐다", () => {
    const presets = TIME_OF_DAY_ORDER.map((id) => TIME_OF_DAY[id]);
    const night = TIME_OF_DAY.night;
    for (const preset of presets) {
      expect(
        night.cameraFillIntensity,
        `${preset.name}(${preset.cameraFillIntensity}) 쪽이 밤보다 세다`,
      ).toBeGreaterThanOrEqual(preset.cameraFillIntensity);
    }
  });

  it("밝기 순서의 정확히 반대로 깐다", () => {
    /*
     * 「밤이 가장 세다」만 보면 새벽·노을 사이가 뒤집혀도 통과한다. 실제로
     * 값을 손으로 넣었으므로 순서가 어긋나기 쉽다 — 새벽은 해 1.6·반구 0.95로
     * 밤(0.55/0.5)보다 3배 밝은데, 보조광이 더 세면 새벽만 이상하게 뜬다.
     */
    const brightness = (id: TimeOfDayId) =>
      TIME_OF_DAY[id].sunIntensity + TIME_OF_DAY[id].hemisphereIntensity;

    const byBrightness = [...TIME_OF_DAY_ORDER].sort((a, b) => brightness(a) - brightness(b));

    for (let i = 1; i < byBrightness.length; i += 1) {
      const darker = TIME_OF_DAY[byBrightness[i - 1]];
      const brighter = TIME_OF_DAY[byBrightness[i]];
      expect(
        darker.cameraFillIntensity,
        `${darker.name}(밝기 ${brightness(byBrightness[i - 1]).toFixed(2)}, 보조 ${darker.cameraFillIntensity}) ` +
          `< ${brighter.name}(밝기 ${brightness(byBrightness[i]).toFixed(2)}, 보조 ${brighter.cameraFillIntensity})`,
      ).toBeGreaterThanOrEqual(brighter.cameraFillIntensity);
    }
  });

  it("한낮에는 달지 않는다", () => {
    // 해가 충분한데 정면광을 더하면 입체감만 죽는다
    expect(TIME_OF_DAY.noon.cameraFillIntensity).toBe(0);
  });

  it("밤에는 반드시 있다", () => {
    expect(TIME_OF_DAY.night.cameraFillIntensity).toBeGreaterThan(0);
  });

  it("주광을 넘지 않는다 — 보조광이지 조명이 아니다", () => {
    for (const id of TIME_OF_DAY_ORDER) {
      const preset = TIME_OF_DAY[id];
      expect(
        preset.cameraFillIntensity,
        `${preset.name}: 보조 ${preset.cameraFillIntensity} vs 주광 ${preset.sunIntensity}`,
      ).toBeLessThan(preset.sunIntensity);
    }
  });
});
