import { describe, expect, it } from "vitest";

import { BOSS, createBoss, stepBoss } from "@/game/combat/bossSim";
import { COMBAT_TUNING, createEnemies, stepEnemy } from "@/game/combat/combatSim";
import { createLocomotionState, stepLocomotion } from "@/game/player/locomotion";
import { MAX_DELTA_SECONDS } from "@/game/config/tuning";

/*
 * 숫자가 한 번 NaN이 되면 되돌아오지 않는다.
 *
 * 위치가 NaN이 된 적은 화면에서 사라지고, 지도 표식도 사라지고, 거리 비교가
 * 전부 false가 되어 **아무 일도 일어나지 않는 상태로 굳는다.** 예외도 로그도
 * 없다 — 그냥 조용해진다.
 *
 * 방향 계산은 거리로 나눈다. 겹쳐 선 순간(거리 0)이 그 자리다. 지금은
 * 제어 흐름이 막고 있지만(`standoffRadius`·`slamRange` 안쪽에서 먼저 멈춘다),
 * 그 상수가 0이 되면 조용히 열린다. 그래서 상수와 결과를 함께 본다.
 */

const finite = (value: number) => Number.isFinite(value);

describe("겹쳐 서도 숫자가 깨지지 않는다", () => {
  it("멈추는 반경이 0보다 크다", () => {
    /*
     * 이 둘이 0이 되는 순간 「거리로 나누기」가 그대로 노출된다. 값 자체가
     * 안전장치다.
     */
    expect(COMBAT_TUNING.standoffRadius, "근접 정지 반경이 0이다").toBeGreaterThan(0);
    expect(BOSS.slamRange, "보스 사거리가 0이다").toBeGreaterThan(0);
  });

  it("로봇이 플레이어와 같은 자리에 있어도 유한하다", () => {
    const enemies = createEnemies(6, 100);
    for (const enemy of enemies) {
      const stepped = stepEnemy({ ...enemy, x: 0, z: 0 }, 0, 0, 1 / 60);
      expect(finite(stepped.x) && finite(stepped.z), `${enemy.kind}: ${stepped.x}, ${stepped.z}`).toBe(
        true,
      );
      expect(finite(stepped.facing), `facing ${stepped.facing}`).toBe(true);
    }
  });

  it("보스가 플레이어와 같은 자리에 있어도 유한하다", () => {
    let boss = createBoss(0, 0);
    for (let i = 0; i < 120; i += 1) {
      boss = stepBoss(boss, 0, 0, 1 / 60);
    }
    expect(finite(boss.x) && finite(boss.z), `${boss.x}, ${boss.z}`).toBe(true);
  });

  it("dt가 0이어도 깨지지 않는다", () => {
    // 첫 프레임이나 일시정지 직후에 실제로 0이 들어온다
    const enemies = createEnemies(4, 100);
    for (const enemy of enemies) {
      const stepped = stepEnemy(enemy, 10, 10, 0);
      expect(finite(stepped.x) && finite(stepped.z), `${stepped.x}, ${stepped.z}`).toBe(true);
    }
    const boss = stepBoss(createBoss(0, 0), 10, 10, 0);
    expect(finite(boss.x) && finite(boss.z)).toBe(true);
  });
});

describe("플레이어 이동이 극단 입력에서도 유한하다", () => {
  const input = {
    moveX: 0,
    moveZ: 0,
    jump: false,
    jumpHeld: false,
    grappleRequested: false,
    run: false,
    vehicle: null,
    cameraYaw: 0,
  };

  it("입력이 없거나 대각선 최대여도 유한하다", () => {
    for (const [moveX, moveZ] of [
      [0, 0],
      [1, 1],
      [-1, -1],
    ]) {
      let state = createLocomotionState({ x: 0, y: 0, z: 0 });
      for (let i = 0; i < 60; i += 1) {
        state = stepLocomotion(state, { ...input, moveX, moveZ, run: true }, MAX_DELTA_SECONDS, 0);
      }
      expect(
        finite(state.position.x) && finite(state.position.y) && finite(state.position.z),
        `(${moveX},${moveZ}) → ${state.position.x}, ${state.position.z}`,
      ).toBe(true);
    }
  });

  it("dt가 0인 프레임이 섞여도 유한하다", () => {
    let state = createLocomotionState({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 60; i += 1) {
      state = stepLocomotion(state, { ...input, moveZ: 1 }, i % 2 === 0 ? 0 : 1 / 60, 0);
    }
    expect(finite(state.position.z), `z=${state.position.z}`).toBe(true);
    expect(finite(state.velocity.y), `vy=${state.velocity.y}`).toBe(true);
  });

  it("속도 배율이 0이어도 유한하다", () => {
    // 음료 효과가 꺼진 프레임에 0이 들어올 수 있다
    let state = createLocomotionState({ x: 0, y: 0, z: 0 });
    state = stepLocomotion(state, { ...input, moveZ: 1, speedScale: 0 }, 1 / 60, 0);
    expect(finite(state.position.z) && finite(state.velocity.x)).toBe(true);
  });
});
