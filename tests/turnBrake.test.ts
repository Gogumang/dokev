import { describe, expect, it } from "vitest";

import { LOCOMOTION, TURN_BRAKE, type VehicleKind } from "@/game/config/tuning";
import {
  horizontalSpeed,
  stepLocomotion,
  turnBrakeScale,
  type LocomotionState,
  type MoveInput,
} from "@/game/player/locomotion";
import { shortestAngleDelta } from "@/game/core/mathx";

/*
 * "뒤로 갈 때 캐릭터가 뒤로 가지 말고 돌아서 가야 한다."
 *
 * 코드는 원래도 몸을 돌리고 있었다. 문제는 **도는 동안 속도가 그대로**라는
 * 것이었다 — 자전거(각속도 1.9 rad/s, 최고 18m/s)는 회전 반경이 9.5m라,
 * 화면에서는 돌지 않고 밀려나는 것으로 보인다.
 *
 * 그래서 여기서 재는 것은 "도는가"가 아니라 **"크게 꺾을 때 느려지는가"** 다.
 */

const FRAME = 1 / 60;

function makeState(overrides: Partial<LocomotionState> = {}): LocomotionState {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    grounded: true,
    coyoteRemaining: 0,
    jumpBufferRemaining: 0,
    landingImpact: 0,
    airJumpsUsed: 0,
    gliding: false,
    grapple: null,
    grappleHeldSeconds: 0,
    grappleCooldown: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<MoveInput> = {}): MoveInput {
  return {
    moveX: 0,
    moveZ: 0,
    cameraYaw: 0,
    run: false,
    jump: false,
    jumpHeld: false,
    ...overrides,
  } as MoveInput;
}

describe("꺾을 때의 감속 배율", () => {
  it("정면과 옆까지는 속도를 잃지 않는다", () => {
    // 옆으로 꺾을 때마다 느려지면 골목을 못 돈다
    expect(turnBrakeScale(0)).toBe(1);
    expect(turnBrakeScale(Math.PI / 4)).toBe(1);
    expect(turnBrakeScale(TURN_BRAKE.startAngle - 0.01)).toBe(1);
  });

  it("정반대를 누르면 가장 강하게 걸린다", () => {
    const scale = turnBrakeScale(Math.PI);
    expect(scale).toBeCloseTo(TURN_BRAKE.minScale);
  });

  it("각도가 커질수록 단조롭게 줄어든다", () => {
    let previous = turnBrakeScale(TURN_BRAKE.startAngle);
    for (let angle = TURN_BRAKE.startAngle; angle <= Math.PI; angle += 0.1) {
      const current = turnBrakeScale(angle);
      expect(current, `${angle.toFixed(2)}rad → ${current.toFixed(3)}`).toBeLessThanOrEqual(
        previous + 1e-9,
      );
      previous = current;
    }
  });

  it("완전히 멈추지는 않는다", () => {
    // 0이면 반전할 때마다 조작이 끊긴다
    expect(turnBrakeScale(Math.PI)).toBeGreaterThan(0);
  });

  it("제동 세기 계산이 0으로 나누지 않는다", () => {
    // minScale이 1이면 `(1 - scale) / (1 - minScale)`이 NaN이 된다
    expect(TURN_BRAKE.minScale).toBeLessThan(1);
  });

  it("제동력이 가장 둔한 탈것의 감속도보다 세다", () => {
    /*
     * 첫 구현은 탈것의 `decel`을 그대로 썼다. 자전거는 1.6이라 도는 동안
     * 속도가 거의 그대로였고, 브레이크가 있으나 마나였다.
     */
    const slowest = Math.min(...Object.values(LOCOMOTION).map((mode) => mode.decel));
    expect(
      TURN_BRAKE.decel,
      `제동 ${TURN_BRAKE.decel} vs 가장 낮은 감속 ${slowest}`,
    ).toBeGreaterThan(slowest * 4);
  });

  it("부호와 무관하다", () => {
    expect(turnBrakeScale(-Math.PI * 0.9)).toBeCloseTo(turnBrakeScale(Math.PI * 0.9));
  });
});

describe("실제 이동에서", () => {
  /** 자전거로 +z 방향 최고 속도까지 붙인 상태 */
  function ridingForward(): LocomotionState {
    let state = makeState();
    const input = makeInput({ moveZ: 1, vehicle: "bike" } as Partial<MoveInput>);
    for (let i = 0; i < 600; i += 1) {
      state = stepLocomotion(state, input, FRAME, 0);
    }
    return state;
  }

  it("최고 속도까지 붙는다", () => {
    const speed = horizontalSpeed(ridingForward().velocity);
    expect(speed, `${speed.toFixed(1)} m/s`).toBeGreaterThan(LOCOMOTION.bike.maxSpeed * 0.9);
  });

  it("정반대를 누르면 속도가 떨어진다", () => {
    /*
     * 이 검사가 이 파일의 이유다. 떨어지지 않으면 몸이 도는 동안 원래
     * 방향으로 계속 밀려난다.
     *
     * **최저 속도**를 본다. 특정 프레임의 값을 보면 안 된다 — 반전이 빨라질수록
     * 그 시점에는 이미 다시 붙고 있어서, 조작감이 좋아질수록 검사가 깨진다.
     */
    let state = ridingForward();
    const before = horizontalSpeed(state.velocity);
    const back = makeInput({ moveZ: -1, vehicle: "bike" } as Partial<MoveInput>);

    let lowest = before;
    for (let i = 0; i < 90; i += 1) {
      state = stepLocomotion(state, back, FRAME, 0);
      lowest = Math.min(lowest, horizontalSpeed(state.velocity));
    }

    /*
     * 0.8이 느슨해 보이지만 여기가 맞다.
     *
     * 제자리 선회가 빨라지면서 **각도가 빨리 닫히고**, 브레이크가 가장 세게
     * 걸리는 구간(정반대 부근)을 금방 벗어난다. 즉 속도를 덜 잃는 대신 빨리
     * 돌아선다 — 둘을 맞바꾼 것이고, 화면에서 중요한 것은 「얼마나 느려졌나」가
     * 아니라 「얼마나 빨리 돌아섰나」다(아래 검사).
     */
    expect(lowest, `${before.toFixed(1)} → 최저 ${lowest.toFixed(1)} m/s`).toBeLessThan(
      before * 0.8,
    );
  });

  it("반전이 오래 끌지 않는다", () => {
    /*
     * "뒤로 가면 백워크를 한다"는 **회전이 안 된다**가 아니라 **너무 오래
     * 걸린다**였다. 탈것에서는 그 시간 동안 캐릭터 동작까지 굳어 있어
     * (`characterClips.freezes`), 동작 없이 밀려나는 인형으로 보인다.
     *
     * 속도가 낮을수록 제자리 선회가 빨라지게 해서 이 시간을 줄였다.
     */
    const limits: Array<[VehicleKind | undefined, number]> = [
      [undefined, 0.3],
      ["kickboard", 0.7],
      ["skateboard", 0.9],
      ["bike", 1.1],
    ];

    for (const [vehicle, limit] of limits) {
      let state = makeState();
      const forward = makeInput({ moveZ: 1, vehicle } as Partial<MoveInput>);
      for (let i = 0; i < 600; i += 1) state = stepLocomotion(state, forward, FRAME, 0);

      const back = makeInput({ moveZ: -1, vehicle } as Partial<MoveInput>);
      let frames = 0;
      while (Math.abs(shortestAngleDelta(state.facing, 0)) > 0.05 && frames < 600) {
        state = stepLocomotion(state, back, FRAME, 0);
        frames += 1;
      }

      const seconds = frames * FRAME;
      expect(seconds, `${vehicle ?? "walk"}: 반전에 ${seconds.toFixed(2)}초`).toBeLessThan(limit);
    }
  });

  it("최고 속도에서는 탈것의 둔함이 남는다", () => {
    /*
     * 제자리 선회 가속을 속도 기준으로 둔 이유다. 최고 속도에서 배수가 1이
     * 아니면 「자전거는 크게 돈다」는 성격 자체가 사라진다.
     */
    let state = makeState();
    const forward = makeInput({ moveZ: 1, vehicle: "bike" } as Partial<MoveInput>);
    for (let i = 0; i < 600; i += 1) state = stepLocomotion(state, forward, FRAME, 0);

    // 살짝만 꺾는다 — 브레이크가 걸리지 않는 각도라 속도가 유지된다
    const slight = makeInput({ moveZ: 1, moveX: 0.35, vehicle: "bike" } as Partial<MoveInput>);
    const before = state.facing;
    state = stepLocomotion(state, slight, FRAME, 0);
    const turned = Math.abs(shortestAngleDelta(state.facing, before));

    // 한 프레임에 도는 각도가 기본 각속도를 넘지 않아야 한다
    expect(turned, `${turned.toFixed(4)}rad in one frame`).toBeLessThanOrEqual(
      LOCOMOTION.bike.turnRate * FRAME + 1e-6,
    );
  });

  it("한 프레임에 멈춰 버리지는 않는다", () => {
    /*
     * 목표 속도를 낮추기만 하고 감속도를 거치지 않으면 `Math.min`이
     * 즉시 목표값으로 눌러 버린다 — 달리다 벽에 부딪힌 것처럼 보인다.
     */
    const state = ridingForward();
    const before = horizontalSpeed(state.velocity);
    const back = makeInput({ moveZ: -1, vehicle: "bike" } as Partial<MoveInput>);

    const after = horizontalSpeed(stepLocomotion(state, back, FRAME, 0).velocity);
    expect(after, `한 프레임 뒤 ${after.toFixed(1)} m/s`).toBeGreaterThan(before * 0.9);
  });

  it("반전을 마치면 입력 방향을 향한다", () => {
    let state = ridingForward();
    const back = makeInput({ moveZ: -1, vehicle: "bike" } as Partial<MoveInput>);
    for (let i = 0; i < 240; i += 1) {
      state = stepLocomotion(state, back, FRAME, 0);
    }

    // 카메라 yaw 0에서 moveZ:-1은 화면상 뒤 = 월드 +z
    const delta = Math.abs(shortestAngleDelta(state.facing, 0));
    expect(delta, `facing ${state.facing.toFixed(2)}`).toBeLessThan(0.2);
  });

  it("반전 뒤에는 다시 최고 속도로 붙는다", () => {
    // 브레이크가 걸린 채로 남으면 한 번 꺾을 때마다 영영 느려진다
    let state = ridingForward();
    const back = makeInput({ moveZ: -1, vehicle: "bike" } as Partial<MoveInput>);
    for (let i = 0; i < 900; i += 1) {
      state = stepLocomotion(state, back, FRAME, 0);
    }

    const speed = horizontalSpeed(state.velocity);
    expect(speed, `${speed.toFixed(1)} m/s`).toBeGreaterThan(LOCOMOTION.bike.maxSpeed * 0.9);
  });

  it("걸을 때 옆으로 꺾는 것은 느려지지 않는다", () => {
    let state = makeState();
    const forward = makeInput({ moveZ: 1 });
    for (let i = 0; i < 120; i += 1) state = stepLocomotion(state, forward, FRAME, 0);

    const side = makeInput({ moveX: 1 });
    for (let i = 0; i < 30; i += 1) state = stepLocomotion(state, side, FRAME, 0);

    const speed = horizontalSpeed(state.velocity);
    expect(speed, `${speed.toFixed(2)} m/s`).toBeGreaterThan(LOCOMOTION.walk.maxSpeed * 0.9);
  });
});
