import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";
import { PHOTO_CAMERA } from "@/game/config/tuning";

import { CAMERA, CAMERA_REDUCED } from "@/game/config/tuning";
import {
  followDistance,
  followFov,
  lookAheadDistance,
  orbitDirection,
  speedRatio,
} from "@/game/scene/cameraRig";

/*
 * 카메라.
 *
 * 88번의 반복 동안 한 번도 검증된 적이 없다. 화면을 못 보는 상태에서 가장
 * 확인하기 어려운 부분이라 순수 함수로 떼어 냈고, 이제 그 값들을 검사한다.
 */

describe("speedRatio", () => {
  it("멈춰 있으면 0이다", () => {
    expect(speedRatio(0, CAMERA.fovSpeedReference)).toBe(0);
  });

  it("기준 속도에서 1이다", () => {
    expect(speedRatio(CAMERA.fovSpeedReference, CAMERA.fovSpeedReference)).toBe(1);
  });

  it("기준을 넘어도 1을 넘지 않는다", () => {
    // 넘치면 시야각이 계속 벌어져 어안 렌즈가 된다
    expect(speedRatio(CAMERA.fovSpeedReference * 5, CAMERA.fovSpeedReference)).toBe(1);
  });
});

describe("followDistance", () => {
  it("빠를수록 멀어진다", () => {
    // 멀어져야 앞이 더 보이고, 그 자체가 속도감이 된다
    const still = followDistance(CAMERA, 0, false, 0);
    const fast = followDistance(CAMERA, 1, false, 0);
    expect(fast, `still=${still}, fast=${fast}`).toBeGreaterThan(still);
  });

  it("포토 모드에서는 휠로 정한 거리를 그대로 쓴다", () => {
    // 속도에 따라 움직이면 구도를 잡을 수 없다
    expect(followDistance(CAMERA, 1, true, 6.5)).toBe(6.5);
  });

  it("저감 모션에서도 거리가 있다", () => {
    // 0이면 카메라가 머리 안에 들어간다
    expect(followDistance(CAMERA_REDUCED, 0, false, 0)).toBeGreaterThan(1);
  });
});

describe("orbitDirection", () => {
  it("단위 벡터다", () => {
    // 길이가 1이 아니면 거리 계산이 통째로 어긋난다
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.4],
      [-2.6, -0.3],
      [3.9, 1.1],
    ]) {
      const dir = orbitDirection(yaw, pitch);
      expect(Math.hypot(dir.x, dir.y, dir.z), `yaw=${yaw}, pitch=${pitch}`).toBeCloseTo(1, 6);
    }
  });

  it("yaw 0이면 +z를 본다", () => {
    const dir = orbitDirection(0, 0);
    expect(dir.z).toBeCloseTo(1, 6);
    expect(dir.x).toBeCloseTo(0, 6);
  });

  it("pitch가 올라가면 y가 커진다", () => {
    // 부호가 뒤집히면 위를 보려 할 때 카메라가 땅으로 들어간다
    expect(orbitDirection(0, 0.5).y).toBeGreaterThan(orbitDirection(0, 0).y);
  });

  it("yaw가 돌면 수평 방향이 돈다", () => {
    const east = orbitDirection(Math.PI / 2, 0);
    expect(east.x).toBeCloseTo(1, 6);
    expect(east.z).toBeCloseTo(0, 6);
  });
});

describe("followFov", () => {
  it("빠를수록 넓어진다", () => {
    const still = followFov(CAMERA, 0, false);
    const fast = followFov(CAMERA, 1, false);
    expect(fast, `still=${still}, fast=${fast}`).toBeGreaterThan(still);
  });

  it("포토 모드에서는 기본값으로 고정된다", () => {
    /*
     * 사진마다 화각이 다르면 같은 장소를 찍어도 다른 곳처럼 보인다.
     */
    expect(followFov(CAMERA, 1, true)).toBe(CAMERA.fovBase);
  });

  it("추가 각도가 더해진다", () => {
    // 만남의 카메라 숨이 이 인자로 들어온다
    expect(followFov(CAMERA, 0, false, 5)).toBeCloseTo(CAMERA.fovBase + 5, 6);
  });

  it("포토 모드에서는 추가 각도도 들어오지 않아야 정상이다", () => {
    /*
     * 함수 자체는 더해 준다 — 막는 것은 호출부의 책임이다. 여기서는 그
     * 계약을 분명히 해 둔다: 포토 모드에서 흔들리면 호출부가 잘못 부른 것이다.
     */
    expect(followFov(CAMERA, 1, true, 5)).toBe(CAMERA.fovBase + 5);
  });

  it("저감 모션이 더 좁은 범위를 쓴다", () => {
    // 시야각 변화는 멀미의 주된 원인이다
    const normal = followFov(CAMERA, 1, false) - followFov(CAMERA, 0, false);
    const reduced = followFov(CAMERA_REDUCED, 1, false) - followFov(CAMERA_REDUCED, 0, false);
    expect(reduced, `normal=${normal}, reduced=${reduced}`).toBeLessThan(normal);
  });
});

describe("lookAheadDistance", () => {
  it("멈춰 있으면 0이다", () => {
    // 움직이지 않는데 시선이 앞서면 화면이 흔들린다
    expect(lookAheadDistance(CAMERA, 0, false)).toBe(0);
  });

  it("빠를수록 멀리 본다", () => {
    expect(lookAheadDistance(CAMERA, 1, false)).toBeGreaterThan(
      lookAheadDistance(CAMERA, 0.3, false),
    );
  });

  it("포토 모드에서는 선행하지 않는다", () => {
    // 구도를 잡는 중에 시선이 앞서면 원하는 곳을 못 담는다
    expect(lookAheadDistance(CAMERA, 1, true)).toBe(0);
  });
});

describe("튜닝 값의 관계", () => {
  it("최대 거리가 기본 거리보다 멀다", () => {
    expect(CAMERA.distanceMax).toBeGreaterThan(CAMERA.distanceBase);
  });

  it("최대 시야각이 기본 시야각보다 넓다", () => {
    expect(CAMERA.fovMax).toBeGreaterThan(CAMERA.fovBase);
  });

  it("시야각이 멀미를 부를 만큼 넓지 않다", () => {
    /*
     * DESIGN_GUIDE 「카메라」가 "멀미를 줄이기 위해 기본 FOV와 가속도를
     * 보수적으로" 요구한다. 90도를 넘으면 가장자리 왜곡이 커진다.
     */
    expect(CAMERA.fovMax, `fovMax=${CAMERA.fovMax}`).toBeLessThanOrEqual(90);
  });

  it("저감 모션이 모든 축에서 더 얌전하다", () => {
    expect(CAMERA_REDUCED.fovMax).toBeLessThanOrEqual(CAMERA.fovMax);
    expect(CAMERA_REDUCED.lookAheadMax).toBeLessThanOrEqual(CAMERA.lookAheadMax);
  });
});

describe("포토 모드를 키보드로 조작할 수 있는가", () => {
  /*
   * 구도는 드래그와 휠로만 잡을 수 있었다 — 키보드만 쓰는 사람은 P로 들어갈
   * 수는 있어도 아무것도 할 수 없었다. 사진을 남기는 것이 이 게임의 목적 중
   * 하나인데 그 사람에게는 닫힌 문이었다.
   *
   * 포토 모드에서는 시뮬레이션이 멈춰 이동 키가 하는 일이 없으므로 그 자리를
   * 카메라에 내준다.
   */
  it("이동 키가 카메라를 돌린다", () => {
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    expect(rig, "포토 모드에서 키보드가 시점을 바꾸지 않는다").toContain(
      "input.moveX * PHOTO_CAMERA.keyTurnRate",
    );
    expect(rig).toContain("input.moveZ * PHOTO_CAMERA.keyTurnRate");
  });

  it("포토 모드에서만 그렇게 한다", () => {
    /*
     * 월드에서 이동 키가 카메라를 돌리면 걷다가 화면이 같이 돈다.
     * 조건 안에 있어야 한다.
     */
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    const at = rig.indexOf("PHOTO_CAMERA.keyTurnRate");
    const before = rig.slice(Math.max(0, at - 200), at);
    expect(before, "포토 모드 조건 밖에서 돈다").toContain("if (photoMode)");
  });

  it("돌리는 속도가 쓸 만한 범위다", () => {
    // 한 바퀴에 4초쯤. 너무 느리면 못 쓰고, 너무 빠르면 원하는 각도에서 못 멈춘다
    const seconds = (Math.PI * 2) / PHOTO_CAMERA.keyTurnRate;
    expect(seconds, `한 바퀴 ${seconds.toFixed(1)}초`).toBeGreaterThan(2);
    expect(seconds, `한 바퀴 ${seconds.toFixed(1)}초`).toBeLessThan(8);
  });

  it("거리도 키보드로 바꿀 수 있다", () => {
    /*
     * 각도만 되고 거리가 휠뿐이면 절반만 열어 준 것이다 — 가까이 가서 찍는
     * 구도를 만들 수 없다.
     */
    const input = readCode("src/game/systems/input.ts");
    expect(input, "확대 키가 없다").toContain("CONTROL_CODES.zoomIn");
    expect(input, "축소 키가 없다").toContain("CONTROL_CODES.zoomOut");
  });

  it("확대와 축소가 반대 방향이다", () => {
    // 둘 다 같은 부호면 한쪽으로만 움직인다
    const input = readCode("src/game/systems/input.ts");
    expect(input).toContain("input.zoomDelta -= WHEEL_NOTCH");
    expect(input).toContain("input.zoomDelta += WHEEL_NOTCH");
  });

  it("안내에 키보드가 적혀 있다", () => {
    // 할 수 있게 만들어도 알려 주지 않으면 없는 것과 같다
    const controls = readCode("src/components/hud/PhotoControls.tsx");
    expect(controls).toMatch(/WASD|방향키/);
    expect(controls, "거리 조절 키가 안내에 없다").toMatch(/Z·X|Z, X/);
  });
});
