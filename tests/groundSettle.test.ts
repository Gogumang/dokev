/**
 * 지면 정착 — 내리막에서 땅을 뚫거나 튀어오르지 않는가.
 *
 * 실제로 겪은 증상 두 가지를 그대로 재현한다:
 *
 *   1. **오르막에서 땅에 파묻힌다.** 이동 전 위치에서 잰 지면으로 발밑을
 *      정하면, 이동 뒤 그 자리의 지면은 더 높다 — 그 차이만큼 몸이 흙 속에
 *      들어간다. 빠를수록 깊다.
 *   2. **내리막에서 매 프레임 떴다 떨어진다.** 지면이 발밑에서 도망가므로
 *      공중 판정이 되고, 다음 프레임에 착지하고, 또 뜬다. 화면에서는 달리는
 *      동안 캐릭터가 덜덜 떨리고 발소리가 계속 터진다.
 *
 * 두 증상 모두 "이동한 **뒤의** 자리에서 지면을 다시 재고 앉힌다"로 풀린다.
 */

import { describe, expect, it } from "vitest";

import {
  createLocomotionState,
  settleOnGround,
  type LocomotionState,
} from "@/game/player/locomotion";

function movingState(patch: Partial<LocomotionState> = {}): LocomotionState {
  const base = createLocomotionState({ x: 0, y: 0, z: 0 });
  return { ...base, ...patch };
}

describe("settleOnGround", () => {
  it("이동 뒤 지면이 더 높으면 끌어올린다 — 오르막에서 땅에 묻히지 않는다", () => {
    // Arrange — 발밑이 0인 줄 알고 걸었는데 실제 그 자리는 0.3m 높다
    const state = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 6, y: 0, z: 0 },
      grounded: true,
    });

    // Act
    const settled = settleOnGround(state, 0.3, true, 1 / 60);

    // Assert
    expect(settled.position.y).toBe(0.3);
    expect(settled.grounded).toBe(true);
  });

  it("걷던 중 지면이 조금 내려가면 붙어서 따라 내려간다 — 내리막에서 뜨지 않는다", () => {
    // Arrange — 이번 프레임에 지면이 12cm 내려갔다
    const state = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 12, y: -0.4, z: 0 },
      grounded: true,
    });

    // Act
    const settled = settleOnGround(state, -0.12, true, 1 / 60);

    // Assert
    expect(settled.position.y).toBeCloseTo(-0.12, 6);
    expect(settled.grounded).toBe(true);
    expect(settled.velocity.y).toBe(0);
    // 땅에서 떨어진 적이 없으므로 착지 충격도 없다 — 있으면 매 프레임 카메라가 흔들린다
    expect(settled.landingImpact).toBe(0);
  });

  it("절벽에서 뛰어내리면 붙잡지 않는다 — 스냅 거리를 넘으면 공중이다", () => {
    // Arrange — 발밑이 3m 아래다
    const state = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 6, y: -1, z: 0 },
      grounded: true,
    });

    // Act
    const settled = settleOnGround(state, -3, true, 1 / 60);

    // Assert
    expect(settled.grounded).toBe(false);
    expect(settled.position.y).toBe(0);
  });

  it("점프 직후에는 끌어내리지 않는다 — 상승 중이면 스냅하지 않는다", () => {
    // Arrange — 막 점프해 5cm 떴고 아직 올라가는 중
    const state = movingState({
      position: { x: 0, y: 0.05, z: 0 },
      velocity: { x: 0, y: 8, z: 0 },
      grounded: false,
    });

    // Act
    const settled = settleOnGround(state, 0, true, 1 / 60);

    // Assert
    expect(settled.grounded).toBe(false);
    expect(settled.position.y).toBe(0.05);
    expect(settled.velocity.y).toBe(8);
  });

  it("공중에 있던 상태는 스냅으로 붙잡지 않는다 — 떨어져 닿을 때만 착지다", () => {
    // Arrange — 낙하 중이고 지면은 20cm 아래
    const state = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: -9, z: 0 },
      grounded: false,
    });

    // Act
    const settled = settleOnGround(state, -0.2, false, 1 / 60);

    // Assert
    expect(settled.grounded).toBe(false);
  });

  it("떨어져 지면에 닿으면 착지 충격을 남긴다", () => {
    // Arrange — 초속 9m로 내려오다 지면 위로 파고들었다
    const state = movingState({
      position: { x: 0, y: -0.4, z: 0 },
      velocity: { x: 0, y: -9, z: 0 },
      grounded: false,
    });

    // Act
    const settled = settleOnGround(state, 0, false, 1 / 60);

    // Assert
    expect(settled.grounded).toBe(true);
    expect(settled.position.y).toBe(0);
    expect(settled.velocity.y).toBe(0);
    expect(settled.landingImpact).toBeCloseTo(9, 6);
  });

  it("빠를수록 스냅 거리가 늘어난다 — 자전거 속도의 내리막도 붙잡는다", () => {
    // Arrange — 시속 65km(18m/s)로 달리는 한 프레임(1/30초) 동안의 낙차
    const fast = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 18, y: -0.6, z: 0 },
      grounded: true,
    });
    const slow = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0.5, y: -0.6, z: 0 },
      grounded: true,
    });

    // Act — 같은 낙차 42cm
    const fastSettled = settleOnGround(fast, -0.42, true, 1 / 30);
    const slowSettled = settleOnGround(slow, -0.42, true, 1 / 30);

    // Assert — 빠른 쪽만 붙잡힌다. 느린 쪽은 그냥 턱에서 떨어지는 것이다
    expect(fastSettled.grounded).toBe(true);
    expect(slowSettled.grounded).toBe(false);
  });

  it("이미 착지 충격이 실려 있으면 지우지 않는다 — 더 큰 쪽을 남긴다", () => {
    // Arrange — 앞 단계에서 이미 충격이 기록됐다
    const state = movingState({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      landingImpact: 7,
    });

    // Act
    const settled = settleOnGround(state, 0, false, 1 / 60);

    // Assert
    expect(settled.landingImpact).toBe(7);
  });
});
