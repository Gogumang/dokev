import { describe, expect, it } from "vitest";

import { watchReads } from "./support/readsAll";

import {
  AIR_CONTROL,
  AIR_JUMP_COUNT,
  AIR_JUMP_VELOCITY,
  COYOTE_TIME_SECONDS,
  GLIDE,
  GRAVITY,
  JUMP_BUFFER_SECONDS,
  JUMP_VELOCITY,
  LOCOMOTION,
} from "@/game/config/tuning";
import {
  clampToBounds,
  findGrappleTarget,
  createLocomotionState,
  horizontalSpeed,
  resolveHorizontalCollisions,
  resolveMode,
  stepLocomotion,
  type Aabb,
  type GrappleAnchor,
  type LocomotionState,
  type MoveInput,
  type Vec3,
} from "@/game/player/locomotion";
import { projectMotionView, type MotionView } from "@/game/player/motionView";

const FRAME = 1 / 60;

/** 기본 입력 — 아무 키도 안 누른 상태. 테스트마다 필요한 필드만 덮어쓴다. */
function makeInput(overrides: Partial<MoveInput> = {}): MoveInput {
  return {
    moveX: 0,
    moveZ: 0,
    jump: false,
    jumpHeld: false,
    grappleRequested: false,
    run: false,
    vehicle: null,
    cameraYaw: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<LocomotionState> = {}): LocomotionState {
  return { ...createLocomotionState({ x: 0, y: 0, z: 0 }), ...overrides };
}

/** 여러 프레임을 같은 입력으로 굴린다. */
function run(
  state: LocomotionState,
  input: MoveInput,
  frames: number,
  dt = FRAME,
  groundHeight = 0,
): LocomotionState {
  let current = state;
  for (let i = 0; i < frames; i += 1) current = stepLocomotion(current, input, dt, groundHeight);
  return current;
}

describe("resolveMode", () => {
  it("탈것이 run보다 우선한다", () => {
    // Arrange
    const input = makeInput({ vehicle: "skateboard" as const, run: true });

    // Act
    const mode = resolveMode(input);

    // Assert
    expect(mode, `mode was: ${mode}`).toBe("skateboard");
  });

  it("run만 눌렸으면 run, 아무것도 없으면 walk", () => {
    // Arrange & Act & Assert
    expect(resolveMode(makeInput({ run: true }))).toBe("run");
    expect(resolveMode(makeInput())).toBe("walk");
  });
});

describe("horizontalSpeed", () => {
  it("수직 속도는 무시하고 x/z 크기만 센다", () => {
    // Arrange
    const velocity: Vec3 = { x: 3, y: 99, z: 4 };

    // Act
    const speed = horizontalSpeed(velocity);

    // Assert
    expect(speed, `speed was: ${speed}`).toBeCloseTo(5, 12);
  });
});

describe("stepLocomotion — 가감속", () => {
  it("입력이 없으면 감속해서 결국 멈춘다", () => {
    // Arrange — walk 최고 속도로 +z를 향해 달리는 중
    const state = makeState({ velocity: { x: 0, y: 0, z: LOCOMOTION.walk.maxSpeed } });

    // Act — 1초 동안 아무 입력 없음
    const result = run(state, makeInput(), 60);

    // Assert
    const speed = horizontalSpeed(result.velocity);
    expect(speed, `speed was: ${speed}`).toBeCloseTo(0, 10);
  });

  it("정지 상태에서 입력이 없으면 바라보는 방향이 유지된다", () => {
    // Arrange
    const state = makeState({ facing: 1.23 });

    // Act
    const result = run(state, makeInput(), 10);

    // Assert — 속도가 0일 때 heading을 계산하면 방향이 0으로 튄다
    expect(result.facing, `facing was: ${result.facing}`).toBe(1.23);
  });

  it("입력을 유지하면 모드별 maxSpeed까지 가속한다", () => {
    // Arrange
    const state = makeState();

    // Act — board 모드로 3초간 전진
    const result = run(state, makeInput({ moveZ: 1, vehicle: "skateboard" as const }), 180);

    // Assert
    const speed = horizontalSpeed(result.velocity);
    expect(speed, `speed was: ${speed}`).toBeCloseTo(LOCOMOTION.skateboard.maxSpeed, 6);
  });

  it("큰 dt에서도 속도가 maxSpeed를 넘지 않는다", () => {
    // Arrange — 탭 복귀 직후처럼 비정상적으로 큰 dt
    const state = makeState();

    // Act
    const result = stepLocomotion(
      state,
      makeInput({ moveZ: 1, vehicle: "skateboard" as const }),
      5,
      0,
    );

    // Assert
    const speed = horizontalSpeed(result.velocity);
    expect(speed, `speed was: ${speed}`).toBeLessThanOrEqual(LOCOMOTION.skateboard.maxSpeed + 1e-9);
  });

  it("입력 세기가 0.5면 maxSpeed의 절반까지만 붙는다", () => {
    // Arrange
    const state = makeState();

    // Act
    const result = run(state, makeInput({ moveZ: 0.5, run: true }), 180);

    // Assert
    const speed = horizontalSpeed(result.velocity);
    expect(speed, `speed was: ${speed}`).toBeCloseTo(LOCOMOTION.run.maxSpeed * 0.5, 6);
  });

  it("입력 상태 객체를 변경하지 않는다 (불변성)", () => {
    // Arrange
    const state = makeState({ velocity: { x: 0, y: 0, z: 2 } });
    const before = structuredClone(state);

    // Act
    stepLocomotion(state, makeInput({ moveZ: 1 }), FRAME, 0);

    // Assert
    expect(state, `state was: ${JSON.stringify(state)}`).toEqual(before);
  });

  it("cameraYaw를 90도 돌리면 이동 방향도 정확히 90도 돌아간다", () => {
    // Arrange — 카메라가 돌아간 만큼 입력 방향도 같이 돌아야 한다
    const input = (cameraYaw: number) =>
      makeInput({ moveZ: 1, vehicle: "skateboard" as const, cameraYaw });

    // Act
    const straight = run(makeState(), input(0), 240);
    const turned = run(makeState(), input(Math.PI / 2), 240);

    // Assert
    const dot = straight.velocity.x * turned.velocity.x + straight.velocity.z * turned.velocity.z;
    expect(
      dot,
      `straight=${JSON.stringify(straight.velocity)}, turned=${JSON.stringify(turned.velocity)}`,
    ).toBeCloseTo(0, 6);
    expect(
      horizontalSpeed(turned.velocity),
      `speed was: ${horizontalSpeed(turned.velocity)}`,
    ).toBeCloseTo(horizontalSpeed(straight.velocity), 6);
  });

  /**
   * 소스 버그로 보여 skip 처리했다 — 테스트가 아니라 구현이 틀린 쪽이다.
   *
   * GameScene.tsx 225~246행이 카메라를 `playerHead + (sin yaw, _, cos yaw) * distance`에
   * 두므로 화면상 "앞"(카메라에서 멀어지는 방향)은 `(-sin yaw, -cos yaw)`다.
   * 그런데 locomotion.ts 99~100행의 worldZ는 `moveX*sin + moveZ*cos`로,
   * 올바른 값 `-(moveX*sin + moveZ*cos)`의 부호가 뒤집혀 있다.
   * 결과적으로 yaw=0에서 W(moveZ=+1)를 누르면 월드 +z, 즉 카메라 쪽으로 다가온다.
   * worldX(99행)는 화면 오른쪽과 일치하므로 z축만 거울처럼 뒤집힌 상태다.
   */
  it("전진 입력은 카메라에서 멀어지는 방향으로 나가야 한다", () => {
    // Arrange — GameScene이 카메라를 놓는 방향(플레이어 → 카메라)
    const cameraYaw = 0;
    const playerToCamera = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };

    // Act
    const result = run(makeState(), makeInput({ moveZ: 1, cameraYaw }), 120);

    // Assert — 전진 속도와 "플레이어 → 카메라" 방향의 내적은 음수여야 한다
    const dot = result.velocity.x * playerToCamera.x + result.velocity.z * playerToCamera.z;
    expect(dot, `velocity was: ${JSON.stringify(result.velocity)}, dot=${dot}`).toBeLessThan(0);
  });
});

describe("stepLocomotion — 점프", () => {
  it("지면에서 점프하면 상승 속도가 붙고 공중 상태가 된다", () => {
    // Arrange
    const state = makeState({ grounded: true });

    // Act
    const result = stepLocomotion(state, makeInput({ jump: true }), FRAME, 0);

    // Assert
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeCloseTo(
      JUMP_VELOCITY,
      12,
    );
    expect(result.grounded, `grounded was: ${result.grounded}`).toBe(false);
    expect(result.landingImpact, `landingImpact was: ${result.landingImpact}`).toBe(0);
  });

  it("코요테 타임이 끝나고 공중 점프도 소진했으면 점프가 발동하지 않는다", () => {
    // Arrange — 지면을 떠난 지 오래됐고 이단 점프도 이미 썼다.
    // 이단 점프 도입 전에는 코요테 만료만으로 충분했지만, 이제 두 조건이 모두
    // 막혀야 낙하가 이어진다.
    const state = makeState({
      position: { x: 0, y: 5, z: 0 },
      velocity: { x: 0, y: -2, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
      airJumpsUsed: AIR_JUMP_COUNT,
    });

    // Act
    const result = stepLocomotion(state, makeInput({ jump: true }), FRAME, 0);

    // Assert — 다시 뛰지 않고 자동 활강 중력을 받으며 계속 떨어져야 한다
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeCloseTo(
      -2 - GRAVITY * GLIDE.gravityScale * FRAME,
      12,
    );
  });

  it("코요테 타임 안이면 이미 공중이어도 점프가 발동한다", () => {
    // Arrange — 모서리에서 막 떨어진 직후
    const state = makeState({
      position: { x: 0, y: 1.5, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
      grounded: false,
      coyoteRemaining: COYOTE_TIME_SECONDS - FRAME,
    });

    // Act
    const result = stepLocomotion(state, makeInput({ jump: true }), FRAME, 0);

    // Assert
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeCloseTo(
      JUMP_VELOCITY,
      12,
    );
    expect(result.coyoteRemaining, `coyoteRemaining was: ${result.coyoteRemaining}`).toBe(0);
  });

  it("코요테 타임이 dt만큼 줄어 0이 되는 프레임에는 점프가 막힌다", () => {
    // Arrange — 유예가 이번 프레임에 정확히 소진된다
    const state = makeState({
      position: { x: 0, y: 1.5, z: 0 },
      velocity: { x: 0, y: -1, z: 0 },
      grounded: false,
      coyoteRemaining: FRAME / 2,
      // 공중 점프가 남아 있으면 그쪽이 발동하므로 코요테 경계만 보려면 소진시킨다.
      airJumpsUsed: AIR_JUMP_COUNT,
    });

    // Act
    const result = stepLocomotion(state, makeInput({ jump: true }), FRAME, 0);

    // Assert
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeLessThan(0);
  });

  it("점프 버퍼가 착지 직전에 누른 입력을 살려 착지 프레임에 점프시킨다", () => {
    // Arrange — 낙하 중, 코요테는 이미 만료
    const falling = makeState({
      position: { x: 0, y: 0.05, z: 0 },
      velocity: { x: 0, y: -5, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
      // 공중 점프가 남아 있으면 버퍼 입력을 그쪽이 가져간다. 버퍼 자체를
      // 검증하려면 소진된 상태여야 한다.
      airJumpsUsed: AIR_JUMP_COUNT,
    });

    // Act — 착지 전 프레임에만 점프를 누르고, 착지 프레임에는 손을 뗀다
    const landed = stepLocomotion(falling, makeInput({ jump: true }), FRAME, 0);
    const afterLanding = stepLocomotion(landed, makeInput({ jump: false }), FRAME, 0);

    // Assert
    expect(landed.grounded, `landed.grounded was: ${landed.grounded}`).toBe(true);
    expect(
      landed.jumpBufferRemaining,
      `jumpBufferRemaining was: ${landed.jumpBufferRemaining}`,
    ).toBeCloseTo(JUMP_BUFFER_SECONDS, 12);
    expect(afterLanding.velocity.y, `velocity.y was: ${afterLanding.velocity.y}`).toBeCloseTo(
      JUMP_VELOCITY,
      12,
    );
  });

  it("버퍼 유효 시간이 지난 뒤 착지하면 점프가 살아나지 않는다", () => {
    // Arrange — 버퍼가 이미 만료된 채로 착지 직전
    const falling = makeState({
      position: { x: 0, y: 0.05, z: 0 },
      velocity: { x: 0, y: -5, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
      jumpBufferRemaining: 0,
    });

    // Act
    const landed = stepLocomotion(falling, makeInput(), FRAME, 0);
    const afterLanding = stepLocomotion(landed, makeInput(), FRAME, 0);

    // Assert — 위로 튀면 안 된다
    expect(
      afterLanding.velocity.y,
      `velocity.y was: ${afterLanding.velocity.y}`,
    ).toBeLessThanOrEqual(0);
    expect(afterLanding.grounded, `grounded was: ${afterLanding.grounded}`).toBe(true);
  });

  it("공중에서는 방향 전환이 지상보다 느리다 (AIR_CONTROL)", () => {
    // Arrange — 같은 조건에서 지상/공중만 다르게 둔다
    const base = { velocity: { x: 0, y: 0, z: 3 }, facing: 0 };
    const onGround = makeState({ ...base, grounded: true });
    const inAir = makeState({
      ...base,
      position: { x: 0, y: 6, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
    });
    const input = makeInput({ moveX: 1, moveZ: 0 });

    // Act
    const groundResult = stepLocomotion(onGround, input, FRAME, 0);
    const airResult = stepLocomotion(inAir, input, FRAME, 0);

    // Assert
    expect(
      Math.abs(airResult.facing),
      `air=${airResult.facing}, ground=${groundResult.facing}`,
    ).toBeLessThan(Math.abs(groundResult.facing));
    expect(AIR_CONTROL, `AIR_CONTROL was: ${AIR_CONTROL}`).toBeLessThan(1);
  });
});

describe("stepLocomotion — 착지", () => {
  it("착지 프레임에 landingImpact가 낙하 속도로 채워진다", () => {
    // Arrange
    const state = makeState({
      position: { x: 0, y: 0.1, z: 0 },
      velocity: { x: 0, y: -8, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
    });

    // Act
    const result = stepLocomotion(state, makeInput(), FRAME, 0);

    // Assert
    expect(result.grounded, `grounded was: ${result.grounded}`).toBe(true);
    expect(result.landingImpact, `landingImpact was: ${result.landingImpact}`).toBeCloseTo(
      8 + GRAVITY * FRAME,
      12,
    );
    expect(result.position.y, `position.y was: ${result.position.y}`).toBe(0);
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBe(0);
  });

  it("지상에 계속 서 있는 동안 landingImpact는 0이다", () => {
    // Arrange — 이미 착지한 상태에서 그냥 서 있기
    const state = makeState({ grounded: true });

    // Act
    const result = run(state, makeInput(), 30);

    // Assert — 매 프레임 중력으로 지면에 눌리지만 착지 충격은 아니다
    expect(result.landingImpact, `landingImpact was: ${result.landingImpact}`).toBe(0);
    expect(result.grounded, `grounded was: ${result.grounded}`).toBe(true);
  });

  it("착지 충격은 낙하 속도가 클수록 크다", () => {
    // Arrange
    const makeFaller = (fallSpeed: number) =>
      makeState({
        position: { x: 0, y: 0.01, z: 0 },
        velocity: { x: 0, y: -fallSpeed, z: 0 },
        grounded: false,
        coyoteRemaining: 0,
      });

    // Act
    const soft = stepLocomotion(makeFaller(3), makeInput(), FRAME, 0);
    const hard = stepLocomotion(makeFaller(18), makeInput(), FRAME, 0);

    // Assert
    expect(
      hard.landingImpact,
      `soft=${soft.landingImpact}, hard=${hard.landingImpact}`,
    ).toBeGreaterThan(soft.landingImpact);
  });

  it("groundHeight가 0이 아니어도 그 높이에서 착지한다", () => {
    // Arrange — 옥상 같은 높은 지면
    const state = makeState({
      position: { x: 0, y: 12.05, z: 0 },
      velocity: { x: 0, y: -6, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
    });

    // Act
    const result = stepLocomotion(state, makeInput(), FRAME, 12);

    // Assert
    expect(result.position.y, `position.y was: ${result.position.y}`).toBe(12);
    expect(result.grounded, `grounded was: ${result.grounded}`).toBe(true);
  });

  it("착지하면 코요테 타임이 가득 채워진다", () => {
    // Arrange
    const state = makeState({
      position: { x: 0, y: 0.01, z: 0 },
      velocity: { x: 0, y: -4, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
    });

    // Act
    const result = stepLocomotion(state, makeInput(), FRAME, 0);

    // Assert
    expect(result.coyoteRemaining, `coyoteRemaining was: ${result.coyoteRemaining}`).toBe(
      COYOTE_TIME_SECONDS,
    );
  });
});

describe("resolveHorizontalCollisions", () => {
  const box: Aabb = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, top: 5 };
  const radius = 0.5;

  it("상자에서 충분히 떨어져 있으면 위치를 바꾸지 않는다", () => {
    // Arrange
    const position: Vec3 = { x: 5, y: 0, z: 5 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(position);
  });

  it("면에 파고들면 반지름만큼 밖으로 밀려난다", () => {
    // Arrange — +x 면을 0.2m 파고든 상태
    const position: Vec3 = { x: 1.3, y: 0, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    expect(result.x, `result was: ${JSON.stringify(result)}`).toBeCloseTo(box.maxX + radius, 12);
    expect(result.z, `result.z was: ${result.z}`).toBeCloseTo(0, 12);
  });

  it("모서리에 파고들면 대각선으로 밀려나 정확히 반지름만큼 떨어진다", () => {
    // Arrange
    const corner: Aabb = { minX: 0, maxX: 2, minZ: 0, maxZ: 2, top: 5 };
    const position: Vec3 = { x: -0.2, y: 0, z: -0.2 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [corner]);

    // Assert
    const distance = Math.hypot(result.x - corner.minX, result.z - corner.minZ);
    expect(distance, `result was: ${JSON.stringify(result)}`).toBeCloseTo(radius, 12);
  });

  it("중심이 상자 안에 완전히 들어가도 가장 가까운 면으로 빠져나온다", () => {
    // Arrange — 중심이 +x 면에 가장 가깝다
    const position: Vec3 = { x: 0.4, y: 0, z: 0.1 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert — 0으로 나누기(NaN)나 제자리 고착 없이 밖으로 나와야 한다
    expect(result.x, `result was: ${JSON.stringify(result)}`).toBeCloseTo(box.maxX + radius, 12);
    expect(Number.isFinite(result.x) && Number.isFinite(result.z)).toBe(true);
  });

  it("상자 정중앙에 갇혀도 밖으로 빠져나온다", () => {
    // Arrange — 네 면까지 거리가 모두 같은 최악의 경우
    const position: Vec3 = { x: 0, y: 0, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    const isOutside =
      result.x <= box.minX - radius + 1e-9 ||
      result.x >= box.maxX + radius - 1e-9 ||
      result.z <= box.minZ - radius + 1e-9 ||
      result.z >= box.maxZ + radius - 1e-9;
    expect(isOutside, `result was: ${JSON.stringify(result)}`).toBe(true);
  });

  it("position.y가 상자 top 이상이면 통과시킨다 (옥상 위)", () => {
    // Arrange — 상자 한가운데지만 옥상 높이에 있다
    const position: Vec3 = { x: 0, y: box.top, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(position);
  });

  it("top보다 살짝 낮으면 다시 충돌 판정을 받는다", () => {
    // Arrange
    const position: Vec3 = { x: 0, y: box.top - 0.01, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).not.toEqual(position);
  });

  it("y 좌표는 절대 바꾸지 않는다", () => {
    // Arrange
    const position: Vec3 = { x: 1.3, y: 2.75, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, [box]);

    // Assert
    expect(result.y, `result.y was: ${result.y}`).toBe(2.75);
  });

  it("상자가 없으면 입력 위치를 그대로 돌려준다", () => {
    // Arrange
    const position: Vec3 = { x: 3, y: 1, z: -4 };

    // Act
    const result = resolveHorizontalCollisions(position, radius, []);

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(position);
  });

  it("여러 상자를 차례로 해소해도 어떤 상자와도 겹치지 않는다", () => {
    // Arrange — 좁은 골목 양쪽 벽
    const walls: Aabb[] = [
      { minX: -3, maxX: -0.6, minZ: -5, maxZ: 5, top: 8 },
      { minX: 0.6, maxX: 3, minZ: -5, maxZ: 5, top: 8 },
    ];
    const position: Vec3 = { x: -0.7, y: 0, z: 0 };

    // Act
    const result = resolveHorizontalCollisions(position, 0.2, walls);

    // Assert
    for (const wall of walls) {
      const dx = result.x - Math.min(Math.max(result.x, wall.minX), wall.maxX);
      const dz = result.z - Math.min(Math.max(result.z, wall.minZ), wall.maxZ);
      expect(
        Math.hypot(dx, dz),
        `result was: ${JSON.stringify(result)}, wall=${JSON.stringify(wall)}`,
      ).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
  });
});

describe("clampToBounds", () => {
  it("경계 안이면 그대로 둔다", () => {
    // Arrange
    const position: Vec3 = { x: 3, y: 1.2, z: -4 };

    // Act
    const result = clampToBounds(position, 10, 0.42);

    // Assert
    expect(result, `result was: ${JSON.stringify(result)}`).toEqual(position);
  });

  it("경계 밖이면 반지름만큼 안쪽으로 가둔다", () => {
    // Arrange
    const position: Vec3 = { x: 50, y: 1.2, z: -50 };

    // Act
    const result = clampToBounds(position, 10, 0.42);

    // Assert
    expect(result.x, `result was: ${JSON.stringify(result)}`).toBeCloseTo(9.58, 12);
    expect(result.z, `result was: ${JSON.stringify(result)}`).toBeCloseTo(-9.58, 12);
  });

  it("y는 건드리지 않는다", () => {
    // Arrange
    const position: Vec3 = { x: 50, y: 7.5, z: 0 };

    // Act
    const result = clampToBounds(position, 10, 0.42);

    // Assert
    expect(result.y, `result.y was: ${result.y}`).toBe(7.5);
  });
});

describe("stepLocomotion — 도깨비 능력: 이단 점프", () => {
  it("공중에서 한 번 더 점프할 수 있다", () => {
    // Arrange — 코요테 타임이 끝난 명백한 공중 상태
    const airborne = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: -6, z: 0 },
      position: { x: 0, y: 8, z: 0 },
    });

    // Act
    const result = stepLocomotion(airborne, makeInput({ jump: true }), FRAME, 0);

    // Assert — 하강 속도를 덮어써야 얼마나 떨어지던 중이든 같은 높이로 올라간다
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeGreaterThan(0);
    expect(result.airJumpsUsed, `airJumpsUsed was: ${result.airJumpsUsed}`).toBe(1);
  });

  it("이단 점프는 첫 점프보다 낮다", () => {
    // 같으면 두 번째가 더 높이 올라가 지붕 높이를 예측할 수 없다
    expect(AIR_JUMP_VELOCITY, `AIR_JUMP_VELOCITY=${AIR_JUMP_VELOCITY}`).toBeLessThan(JUMP_VELOCITY);
  });

  it("허용 횟수를 넘겨 점프할 수 없다", () => {
    // Arrange — 이미 다 쓴 상태
    const spent = makeState({
      grounded: false,
      coyoteRemaining: 0,
      airJumpsUsed: AIR_JUMP_COUNT,
      velocity: { x: 0, y: -6, z: 0 },
      position: { x: 0, y: 8, z: 0 },
    });

    // Act
    const result = stepLocomotion(spent, makeInput({ jump: true }), FRAME, 0);

    // Assert — 무한 점프로 도시를 날아다니면 안 된다
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeLessThan(0);
  });

  it("착지하면 다시 쓸 수 있다", () => {
    // Arrange — 다 쓴 채로 지면에 닿는다
    const landing = makeState({
      grounded: false,
      airJumpsUsed: AIR_JUMP_COUNT,
      velocity: { x: 0, y: -4, z: 0 },
      position: { x: 0, y: 0.01, z: 0 },
    });

    // Act
    const result = stepLocomotion(landing, makeInput(), FRAME, 0);

    // Assert
    expect(result.grounded, `grounded was: ${result.grounded}`).toBe(true);
    expect(result.airJumpsUsed, `airJumpsUsed was: ${result.airJumpsUsed}`).toBe(0);
  });
});

describe("stepLocomotion — 도깨비 능력: 활강", () => {
  it("낙하 중 이단 점프를 누른 프레임에는 우산을 펼치지 않는다", () => {
    // Arrange — 첫 점프 정점 뒤, 아직 공중 점프를 쓰지 않은 상태
    const falling = makeState({
      position: { x: 0, y: 4, z: 0 },
      velocity: { x: 0, y: -3, z: 0 },
      grounded: false,
      coyoteRemaining: 0,
      airJumpsUsed: 0,
    });

    // Act — 스페이스를 눌러 이단 점프를 발동한다
    const result = stepLocomotion(falling, makeInput({ jump: true, jumpHeld: true }), FRAME, 0);

    // Assert — 상승 속도는 붙지만, 하강 전까지 우산은 닫혀 있어야 한다
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBe(AIR_JUMP_VELOCITY);
    expect(result.gliding, `gliding was: ${result.gliding}`).toBe(false);
  });

  it("이단 점프를 쓴 뒤에는 키를 놓아도 하강하며 자동으로 활강한다", () => {
    // Given — 두 번째 점프를 이미 썼고 정점에서 내려오기 시작했다
    const afterAirJump = makeState({
      grounded: false,
      coyoteRemaining: 0,
      airJumpsUsed: 1,
      velocity: { x: 0, y: -3, z: 0 },
      position: { x: 0, y: 10, z: 0 },
    });

    // When — 점프 키에서는 손을 뗀 상태다
    const result = stepLocomotion(afterAirJump, makeInput({ jumpHeld: false }), FRAME, 0);

    // Then
    expect(result.gliding, `gliding was: ${result.gliding}`).toBe(true);
  });

  it("떨어지는 중에 점프를 잡고 있으면 활강한다", () => {
    // Arrange
    const falling = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: -3, z: 0 },
      position: { x: 0, y: 10, z: 0 },
    });

    // Act
    const result = stepLocomotion(falling, makeInput({ jumpHeld: true }), FRAME, 0);

    // Assert
    expect(result.gliding, `gliding was: ${result.gliding}`).toBe(true);
  });

  it("상승 중에는 활강이 시작되지 않는다", () => {
    // 점프하자마자 활강이 걸리면 점프가 뜨는 느낌을 잃는다
    const rising = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: 6, z: 0 },
      position: { x: 0, y: 4, z: 0 },
    });

    const result = stepLocomotion(rising, makeInput({ jumpHeld: true }), FRAME, 0);
    expect(result.gliding, `gliding was: ${result.gliding}`).toBe(false);
  });

  it("활강 중에는 더 천천히 떨어진다", () => {
    // Arrange — 같은 상태에서 잡은 경우와 놓은 경우를 비교한다
    const falling = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: -3, z: 0 },
      position: { x: 0, y: 30, z: 0 },
    });

    // Act
    const glided = run(falling, makeInput({ jumpHeld: true }), 60);
    const dropped = run(falling, makeInput(), 60);

    // Assert
    expect(
      glided.position.y,
      `glide=${glided.position.y}, drop=${dropped.position.y}`,
    ).toBeGreaterThan(dropped.position.y);
  });

  it("오래 활강해도 하강 속도가 상한을 넘지 않는다", () => {
    // 중력만 줄이면 오래 떨어질수록 결국 빨라진다
    const falling = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: -3, z: 0 },
      position: { x: 0, y: 400, z: 0 },
    });

    const result = run(falling, makeInput({ jumpHeld: true }), 600);
    expect(result.velocity.y, `velocity.y was: ${result.velocity.y}`).toBeGreaterThanOrEqual(
      -GLIDE.maxFallSpeed - 1e-6,
    );
  });

  it("착지하면 활강이 꺼진다", () => {
    const landing = makeState({
      grounded: false,
      coyoteRemaining: 0,
      velocity: { x: 0, y: -3, z: 0 },
      position: { x: 0, y: 0.01, z: 0 },
    });

    const result = stepLocomotion(landing, makeInput({ jumpHeld: true }), FRAME, 0);
    expect(result.gliding, `gliding was: ${result.gliding}`).toBe(false);
  });
});

describe("findGrappleTarget", () => {
  const anchors = [
    { x: 0, y: 5.4, z: 10 }, // 정면
    { x: 0, y: 5.4, z: -10 }, // 등 뒤
    { x: 30, y: 5.4, z: 0 }, // 사거리 밖
    { x: 0, y: 0.2, z: 8 }, // 발밑 높이
  ];

  it("정면 원뿔 안의 지점을 고른다", () => {
    // facing 0은 +z를 향한다
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, 0, anchors);
    expect(target, `target was: ${JSON.stringify(target)}`).toEqual({ x: 0, y: 5.4, z: 10 });
  });

  it("등 뒤는 고르지 않는다", () => {
    // 거리만으로 고르면 방향이 튄다
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, 0, [anchors[1]]);
    expect(target).toBeNull();
  });

  it("사거리 밖은 고르지 않는다", () => {
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, Math.PI / 2, [anchors[2]]);
    expect(target).toBeNull();
  });

  it("플레이어보다 낮은 지점은 고르지 않는다", () => {
    // 끌려가며 땅에 박힌다
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, 0, [anchors[3]]);
    expect(target).toBeNull();
  });

  it("너무 가까운 지점은 고르지 않는다", () => {
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, 0, [{ x: 0, y: 5, z: 1 }]);
    expect(target).toBeNull();
  });

  it("후보가 여럿이면 가장 가까운 것을 고른다", () => {
    const target = findGrappleTarget({ x: 0, y: 0, z: 0 }, 0, [
      { x: 0, y: 6, z: 20 },
      { x: 0, y: 6, z: 8 },
    ]);
    expect(target?.z, `z was: ${target?.z}`).toBe(8);
  });
});

describe("stepLocomotion — 그래플", () => {
  const anchor = { x: 0, y: 8, z: 12 };

  it("요청하면 걸린다", () => {
    const result = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);
    expect(result.grapple, `grapple was: ${JSON.stringify(result.grapple)}`).toEqual(anchor);
  });

  it("대상이 없으면 걸리지 않는다", () => {
    const result = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, []);
    expect(result.grapple).toBeNull();
  });

  it("걸린 뒤에는 지점 쪽으로 끌려간다", () => {
    // Arrange
    let state = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);
    const before = Math.hypot(anchor.x - state.position.x, anchor.z - state.position.z);

    // Act
    state = stepLocomotion(state, makeInput(), FRAME, 0, [anchor]);

    // Assert
    const after = Math.hypot(anchor.x - state.position.x, anchor.z - state.position.z);
    expect(after, `before=${before}, after=${after}`).toBeLessThan(before);
  });

  it("끌려가는 동안에는 중력에 떨어지지 않는다", () => {
    // 위쪽 지점으로 걸었으면 올라가야 한다
    let state = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);
    const startY = state.position.y;
    for (let i = 0; i < 10; i += 1) {
      state = stepLocomotion(state, makeInput(), FRAME, 0, [anchor]);
    }
    expect(state.position.y, `y was: ${state.position.y}`).toBeGreaterThan(startY);
  });

  it("도착하면 자동으로 놓고 대기가 걸린다", () => {
    let state = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);
    for (let i = 0; i < 200 && state.grapple; i += 1) {
      state = stepLocomotion(state, makeInput(), FRAME, 0, [anchor]);
    }
    expect(state.grapple, "released").toBeNull();
    expect(state.grappleCooldown, `cooldown was: ${state.grappleCooldown}`).toBeGreaterThan(0);
  });

  it("점프로 중간에 취소할 수 있다", () => {
    let state = stepLocomotion(makeState(), makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);
    state = stepLocomotion(state, makeInput(), FRAME, 0, [anchor]);
    state = stepLocomotion(state, makeInput({ jump: true }), FRAME, 0, [anchor]);
    expect(state.grapple, "cancelled").toBeNull();
  });

  it("대기 중에는 다시 걸리지 않는다", () => {
    // Arrange — 방금 놓은 상태
    const justReleased = makeState({ grappleCooldown: 0.4 });

    // Act
    const result = stepLocomotion(justReleased, makeInput({ grappleRequested: true }), FRAME, 0, [
      anchor,
    ]);

    // Assert
    expect(result.grapple, "still cooling down").toBeNull();
  });
});

describe("이동 상태가 화면으로 나가는가", () => {
  /*
   * 캐릭터 자세·발소리·지도·카메라 흔들림이 전부 이 여덟 칸에서 온다. 프레임
   * 루프 안에서 손으로 적을 때는 **한 줄을 지워도 아무도 몰랐다.**
   *
   * 증상이 곧바로 눈에 띄는 것들인데도 그랬다:
   *   - `mode`가 안 나가면 **달려도 걷는 자세**로 보이고 발소리도 걷기로 난다.
   *   - `grounded`가 안 나가면 땅에 서서 공중 자세를 하거나 그 반대가 된다.
   *   - `x`·`z`가 안 나가면 **지도의 내 점이 안 움직인다.**
   *   - `landingImpact`가 안 나가면 아무리 높이 떨어져도 카메라가 안 흔들린다.
   *
   * 초기값은 **기대값과 다르게** 둔다. 0·false로 시작하면 안 채운 칸이
   * 채운 것처럼 보인다 — 여정 화면에서 그렇게 두 칸을 놓쳤다.
   */
  function unset(): MotionView {
    return {
      speed: -1,
      mode: "walk",
      grounded: false,
      gliding: true,
      landingImpact: -1,
      x: -999,
      z: -999,
      facing: -999,
      viewYaw: 0,
    };
  }

  it("여덟 칸이 모두 채워진다", () => {
    const state: LocomotionState = {
      ...createLocomotionState({ x: 12, y: 0, z: -8 }),
      facing: 1.25,
      grounded: true,
      gliding: false,
      landingImpact: 6.5,
    };
    const view = unset();
    projectMotionView(view, state, 7.4, "run", 0);

    expect(view.speed, "속도가 안 나갔다").toBe(7.4);
    expect(view.mode, "이동 방식이 안 나갔다 — 달려도 걷는 자세가 된다").toBe("run");
    expect(view.grounded, "접지가 안 나갔다").toBe(true);
    expect(view.gliding, "활강이 안 나갔다").toBe(false);
    expect(view.landingImpact, "착지 충격이 안 나갔다 — 카메라가 안 흔들린다").toBe(6.5);
    expect(view.x, "지도의 내 점이 안 움직인다").toBeCloseTo(12, 6);
    expect(view.z, "지도의 내 점이 안 움직인다").toBeCloseTo(-8, 6);
    expect(view.facing, "바라보는 방향이 안 나갔다").toBeCloseTo(1.25, 6);
  });

  it("걷기와 달리기가 구분돼 나간다 — 같으면 자세도 소리도 하나가 된다", () => {
    const state = createLocomotionState({ x: 0, y: 0, z: 0 });
    const walking = unset();
    const running = unset();

    projectMotionView(walking, state, 2, "walk", 0);
    projectMotionView(running, state, 7.4, "run", 0);

    expect(walking.mode).toBe("walk");
    expect(running.mode).toBe("run");
    expect(running.speed, "속도도 같이 갈려야 한다").toBeGreaterThan(walking.speed);
  });

  it("움직이면 자리가 따라간다 — 한 번만 채우면 지도가 멈춘다", () => {
    const view = unset();
    projectMotionView(view, createLocomotionState({ x: 0, y: 0, z: 0 }), 0, "walk", 0);
    const before = { x: view.x, z: view.z };

    projectMotionView(view, createLocomotionState({ x: 30, y: 0, z: 40 }), 5, "run", 0);
    expect(view.x, `x ${before.x} → ${view.x}`).not.toBe(before.x);
    expect(view.z, `z ${before.z} → ${view.z}`).not.toBe(before.z);
  });
});

describe("걸 대상 없이 그래플을 눌렀을 때", () => {
  /*
   * 사거리 안에 걸 곳이 없는데 `G`를 누르면 **아무 일도 없어야 한다.**
   *
   * 그 판정을 지워 보니 아무 검사가 몰랐다. 없는 대상에 걸린 것으로 처리되면
   * `grounded`가 꺼지므로 — **빈 하늘에 G를 누른 것만으로 땅에서 떨어진다.**
   * 걸린 줄 알았는데 줄도 없이 떨어지는 그림이고, 왜 그런지 알 방법이 없다.
   */
  const NOWHERE: GrappleAnchor[] = [];
  // `findGrappleTarget` 검사가 쓰는 것과 같은 모양: 정면(+z)·사거리 안·머리 위
  const REACHABLE: GrappleAnchor[] = [{ x: 0, y: 5.4, z: 10 }];

  it("걸 곳이 없으면 땅에 그대로 서 있는다", () => {
    const before = createLocomotionState({ x: 0, y: 0, z: 0 });
    const after = stepLocomotion(
      { ...before, grounded: true },
      makeInput({ grappleRequested: true }),
      1 / 60,
      0,
      NOWHERE,
    );

    expect(after.grapple, "없는 대상에 걸렸다").toBeNull();
    expect(after.grounded, "빈 하늘에 걸어서 땅에서 떨어졌다").toBe(true);
  });

  it("걸 곳이 있으면 걸린다 — 이 검사가 늘 참이 되지 않게", () => {
    const after = stepLocomotion(
      createLocomotionState({ x: 0, y: 0, z: 0 }),
      makeInput({ grappleRequested: true }),
      1 / 60,
      0,
      REACHABLE,
    );

    expect(after.grapple, "걸 곳이 있는데 안 걸렸다").not.toBeNull();
  });
});

describe("진행 방향을 무엇으로 잡는가", () => {
  /*
   * 비교 방향 훑기에서 나왔다. `speed > 0.05`를 뒤집으면 **달리는 동안에는
   * 바라보는 방향을 쓰고, 멈췄을 때만 속도를 본다** — 정확히 거꾸로다.
   *
   * 증상: 관성으로 미끄러지는 동안 몸이 진행 방향을 안 따라가고, 멈춘 순간
   * 엉뚱하게 홱 돌아본다. 「달리면 그쪽을 본다」는 기본 감각이 무너진다.
   */
  it("미끄러지는 동안 몸이 진행 방향을 따라간다", () => {
    // 입력 없이 +x로 미끄러지는 상태
    const sliding = {
      ...createLocomotionState({ x: 0, y: 0, z: 0 }),
      velocity: { x: 6, y: 0, z: 0 },
      facing: Math.PI, // 진행 방향(+x = PI/2)과 다른 쪽을 보고 있다
      grounded: true,
    };

    const after = stepLocomotion(sliding, makeInput(), 1 / 60, 0, []);

    // +x로 가고 있으므로 facing이 PI/2 쪽으로 와야 한다
    const toVelocity = Math.abs(after.facing - Math.PI / 2);
    const toOld = Math.abs(after.facing - Math.PI);
    expect(
      toVelocity,
      `facing ${after.facing} (진행 ${Math.PI / 2}, 이전 ${Math.PI})`,
    ).toBeLessThan(toOld);
  });

  it("멈춰 있으면 보던 방향을 지킨다 — 정지 중에 방향이 튀면 안 된다", () => {
    const still = {
      ...createLocomotionState({ x: 0, y: 0, z: 0 }),
      velocity: { x: 0, y: 0, z: 0 },
      facing: 1.23,
      grounded: true,
    };

    const after = stepLocomotion(still, makeInput(), 1 / 60, 0, []);
    expect(after.facing, `멈췄는데 ${after.facing}로 돌았다`).toBeCloseTo(1.23, 6);
  });
});

describe("이동 상태의 칸을 검사가 다 보는가", () => {
  /*
   * 「진행 방향」 버그가 살던 자리다. 자리·속도는 재고 있었는데 **바라보는
   * 방향은 안 봐서** 판정이 뒤집혀도 통과했다.
   *
   * 채워진 칸을 실제로 다 읽는지 센다(`tests/support/readsAll.ts`).
   */
  it("한 걸음 뒤 화면이 읽는 칸을 다 본다", () => {
    const view = watchReads<MotionView>({
      speed: -1,
      mode: "walk",
      grounded: false,
      gliding: true,
      landingImpact: -1,
      x: -999,
      z: -999,
      facing: -999,
      viewYaw: 0,
    });

    const state = {
      ...createLocomotionState({ x: 4, y: 0, z: -2 }),
      facing: 0.8,
      grounded: true,
      gliding: false,
      landingImpact: 3.2,
    };
    projectMotionView(view.watched, state, 5.5, "run", 0);

    expect(view.watched.speed, "속도").toBe(5.5);
    expect(view.watched.mode, "이동 방식").toBe("run");
    expect(view.watched.grounded, "접지").toBe(true);
    expect(view.watched.gliding, "활강").toBe(false);
    expect(view.watched.landingImpact, "착지 충격").toBe(3.2);
    expect(view.watched.x, "자리 x").toBeCloseTo(4, 6);
    expect(view.watched.z, "자리 z").toBeCloseTo(-2, 6);
    expect(view.watched.facing, "몸이 향한 방향").toBeCloseTo(0.8, 6);
    /*
     * 화면이 보는 방향. 몸이 향한 쪽과 **다른 값**이어야 한다 — 둘이 같으면
     * 제자리에서 시점만 돌렸을 때 지도가 안 도는 버그가 돌아온다.
     */
    expect(view.watched.viewYaw, "화면이 보는 방향").toBeCloseTo(0, 6);

    expect(view.unreadFields(), "아무도 안 보는 칸이 있다").toEqual([]);
  });
});
