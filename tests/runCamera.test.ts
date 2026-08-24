/**
 * 달릴 때 카메라가 진행 방향 뒤로 돌아오는가.
 *
 * 지금까지 카메라 yaw는 **오직 마우스로만** 움직였다. 그래서 앞으로 달려도
 * 카메라는 처음 보던 쪽을 계속 보고, 캐릭터만 화면 옆으로 빠져나갔다 —
 * 화면에서는 "달리는데 시점이 안 변한다"로 보인다. 3인칭 액션 게임이
 * 예외 없이 갖고 있는 것이 이 되돌림이다.
 *
 * 다만 **아무 때나 되돌리면 안 된다.** 걸으면서 옆을 둘러보는 것과, 방금
 * 손으로 돌려 둔 시점은 지켜야 한다 — 안 그러면 카메라와 손이 싸운다.
 */

import { describe, expect, it } from "vitest";

import { RUN_CAMERA } from "@/game/config/tuning";
import { stepFollowYaw } from "@/game/scene/cameraRig";

/** 오른쪽(+x)을 향해 달리는 중 */
const EAST = Math.PI / 2;

describe("stepFollowYaw", () => {
  it("달리면 카메라가 진행 방향 뒤로 돌아온다", () => {
    // Arrange — 카메라는 정면(0)을 보는데 몸은 오른쪽으로 달린다
    const yaw = 0;

    // Act — 반 초
    let next = yaw;
    for (let i = 0; i < 30; i += 1) {
      next = stepFollowYaw(next, EAST, 1, 10, 1 / 60, RUN_CAMERA);
    }

    // Assert — 완전히 붙지 않아도 확실히 그쪽으로 갔다
    expect(next, `yaw was ${next}`).toBeGreaterThan(0.3);
    expect(next).toBeLessThanOrEqual(EAST + 1e-9);
  });

  it("걷는 속도에서는 되돌리지 않는다 — 둘러보며 걸을 수 있어야 한다", () => {
    // Arrange / Act — 걷기는 speed01이 낮다
    const next = stepFollowYaw(0, EAST, RUN_CAMERA.alignSpeedFloor * 0.5, 10, 1 / 60, RUN_CAMERA);

    // Assert
    expect(next).toBe(0);
  });

  it("방금 손으로 돌렸으면 건드리지 않는다", () => {
    // Arrange / Act — 마지막 조작 뒤 0.1초. 유예 안이다
    const next = stepFollowYaw(0, EAST, 1, 0.1, 1 / 60, RUN_CAMERA);

    // Assert
    expect(next).toBe(0);
    expect(RUN_CAMERA.lookGraceSeconds).toBeGreaterThan(0.1);
  });

  it("유예가 지나면 다시 되돌리기 시작한다", () => {
    // Arrange
    const grace = RUN_CAMERA.lookGraceSeconds;

    // Act
    const during = stepFollowYaw(0, EAST, 1, grace * 0.5, 1 / 60, RUN_CAMERA);
    const after = stepFollowYaw(0, EAST, 1, grace + 0.01, 1 / 60, RUN_CAMERA);

    // Assert
    expect(during).toBe(0);
    expect(after).toBeGreaterThan(0);
  });

  it("이미 진행 방향을 보고 있으면 움직이지 않는다 — 직진 중에 화면이 떨리지 않는다", () => {
    // Arrange / Act
    const next = stepFollowYaw(EAST, EAST, 1, 10, 1 / 60, RUN_CAMERA);

    // Assert
    expect(next).toBeCloseTo(EAST, 9);
  });

  it("가까운 쪽으로 돈다 — 350도 차이를 350도 돌지 않는다", () => {
    // Arrange — 카메라는 +0.1rad, 몸은 -0.1rad 방향
    const yaw = 0.1;

    // Act
    const next = stepFollowYaw(yaw, -0.1, 1, 10, 1 / 60, RUN_CAMERA);

    // Assert — 줄어드는 쪽으로 갔다
    expect(next).toBeLessThan(yaw);
    expect(next).toBeGreaterThanOrEqual(-0.1);
  });

  it("빠를수록 빨리 되돌아온다", () => {
    // Arrange / Act
    const fast = stepFollowYaw(0, EAST, 1, 10, 1 / 60, RUN_CAMERA);
    const slow = stepFollowYaw(0, EAST, 0.6, 10, 1 / 60, RUN_CAMERA);

    // Assert
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(0);
  });

  it("되돌림이 한 프레임에 목표를 넘어가지 않는다 — 큰 dt에서도 진동하지 않는다", () => {
    // Arrange / Act — 탭 복귀 직후의 큰 프레임
    const next = stepFollowYaw(0, EAST, 1, 10, 1 / 3, RUN_CAMERA);

    // Assert
    expect(next).toBeLessThanOrEqual(EAST + 1e-9);
    expect(next).toBeGreaterThan(0);
  });
});

describe("RUN_CAMERA 수치", () => {
  it("걷기 속도는 되돌림 문턱 아래에 있다", () => {
    /*
     * 문턱이 걷기 속도보다 낮으면 **걸을 때도 카메라가 따라붙어** 둘러보기가
     * 불가능해진다. 두 수치가 같은 기준(`CAMERA.fovSpeedReference`)으로
     * 정규화된다는 사실을 여기서 붙잡는다.
     */
    const walkRatio = 3.2 / 17;
    expect(walkRatio).toBeLessThan(RUN_CAMERA.alignSpeedFloor);
  });

  it("달리기 속도는 문턱 위에 있다 — 켜지지 않는 기능이 되지 않게", () => {
    const runRatio = 7.4 / 17;
    expect(runRatio).toBeGreaterThan(RUN_CAMERA.alignSpeedFloor);
  });
});
