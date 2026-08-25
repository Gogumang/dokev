import { describe, expect, it } from "vitest";

import {
  bodyBob,
  createPoseState,
  limbPose,
  POSE_TUNING,
  resolveAnimation,
  squashScale,
  stepPose,
  type PoseInput,
  type PoseState,
} from "@/game/player/characterPose";

const FRAME = 1 / 60;

function makeInput(overrides: Partial<PoseInput> = {}): PoseInput {
  return {
    speed: 0,
    grounded: true,
    onBoard: false,
    gliding: false,
    landingImpact: 0,
    ...overrides,
  };
}

function run(state: PoseState, input: PoseInput, frames: number): PoseState {
  let current = state;
  for (let i = 0; i < frames; i += 1) {
    current = stepPose(current, input, FRAME);
  }
  return current;
}

describe("resolveAnimation", () => {
  it("멈춰 있으면 idle", () => {
    expect(resolveAnimation(makeInput())).toBe("idle");
  });

  it("천천히 움직이면 walk", () => {
    expect(resolveAnimation(makeInput({ speed: 2 }))).toBe("walk");
  });

  it("빠르면 run", () => {
    expect(resolveAnimation(makeInput({ speed: POSE_TUNING.runSpeed + 1 }))).toBe("run");
  });

  it("보드를 타면 속도와 무관하게 board", () => {
    expect(resolveAnimation(makeInput({ speed: 12, onBoard: true }))).toBe("board");
  });

  it("공중에 뜨면 보드를 타고 있어도 air가 우선한다", () => {
    // 공중 판정이 먼저 와야 점프 중에 보드 자세로 굳지 않는다
    const animation = resolveAnimation(makeInput({ speed: 12, onBoard: true, grounded: false }));
    expect(animation, `animation was: ${animation}`).toBe("air");
  });
});

describe("stepPose — 걸음 위상", () => {
  it("위상은 시간이 아니라 이동 거리에 비례한다", () => {
    // Arrange — 같은 거리를 다른 속도로 이동시킨다
    const slow = makeInput({ speed: 2 });
    const fast = makeInput({ speed: 4 });

    // Act — 느린 쪽을 두 배 오래 돌리면 이동 거리가 같아진다
    const slowResult = run(createPoseState(), slow, 120);
    const fastResult = run(createPoseState(), fast, 60);

    // Assert — 거리가 같으면 위상도 같아야 발이 미끄러지지 않는다
    expect(slowResult.phase, `slow=${slowResult.phase}, fast=${fastResult.phase}`).toBeCloseTo(
      fastResult.phase,
      5,
    );
  });

  it("멈춰 있으면 위상이 진행하지 않는다", () => {
    const result = run(createPoseState(), makeInput(), 60);
    expect(result.phase, `phase was: ${result.phase}`).toBe(0);
  });
});

describe("stepPose — 착지 스쿼시", () => {
  it("착지하면 즉시 웅크린다", () => {
    // Arrange
    const state = createPoseState();

    // Act
    const result = stepPose(
      state,
      makeInput({ landingImpact: POSE_TUNING.landReferenceSpeed }),
      FRAME,
    );

    // Assert — 한 프레임 만에 최대치에 도달해야 착지가 단단해 보인다
    expect(result.squash, `squash was: ${result.squash}`).toBeCloseTo(POSE_TUNING.maxSquash, 5);
  });

  it("착지 충격이 클수록 더 웅크린다", () => {
    const light = stepPose(createPoseState(), makeInput({ landingImpact: 4 }), FRAME);
    const heavy = stepPose(createPoseState(), makeInput({ landingImpact: 14 }), FRAME);
    expect(heavy.squash, `light=${light.squash}, heavy=${heavy.squash}`).toBeGreaterThan(
      light.squash,
    );
  });

  it("스쿼시는 시간이 지나면 풀린다", () => {
    // Arrange
    const landed = stepPose(createPoseState(), makeInput({ landingImpact: 14 }), FRAME);

    // Act — 이후 프레임에는 충격이 없다
    const recovered = run(landed, makeInput(), 90);

    // Assert
    expect(recovered.squash, `squash was: ${recovered.squash}`).toBeLessThan(0.01);
  });

  it("스쿼시는 상한을 넘지 않는다", () => {
    // 낙하 속도가 기준을 크게 넘어도 캐릭터가 납작해지면 안 된다
    const result = stepPose(createPoseState(), makeInput({ landingImpact: 999 }), FRAME);
    expect(result.squash, `squash was: ${result.squash}`).toBeLessThanOrEqual(
      POSE_TUNING.maxSquash + 1e-9,
    );
  });
});

describe("squashScale", () => {
  it("세로로 줄면 가로로 늘어난다", () => {
    // Arrange
    const squashed: PoseState = { ...createPoseState(), squash: POSE_TUNING.maxSquash };

    // Act
    const scale = squashScale(squashed);

    // Assert — 부피가 유지되어야 찌그러진 느낌이 산다
    expect(scale.y, `scale was: ${JSON.stringify(scale)}`).toBeLessThan(1);
    expect(scale.x, `scale was: ${JSON.stringify(scale)}`).toBeGreaterThan(1);
  });

  it("스쿼시가 없으면 원래 크기다", () => {
    const scale = squashScale(createPoseState());
    expect(scale, `scale was: ${JSON.stringify(scale)}`).toEqual({ x: 1, y: 1, z: 1 });
  });
});

describe("limbPose", () => {
  it("팔과 다리는 반대 위상으로 흔들린다", () => {
    // Arrange — 스윙이 최대에 가깝도록 충분히 달리게 한다
    const running = run(createPoseState(), makeInput({ speed: 7 }), 200);

    // Act
    const limbs = limbPose(running);

    // Assert — 왼팔과 왼다리가 같은 방향이면 걸음이 아니라 행진이 된다
    expect(
      limbs.leftArm * limbs.leftLeg,
      `limbs were: ${JSON.stringify(limbs)}`,
    ).toBeLessThanOrEqual(0);
    expect(
      limbs.leftArm * limbs.rightArm,
      `limbs were: ${JSON.stringify(limbs)}`,
    ).toBeLessThanOrEqual(0);
  });

  it("달릴 때가 걸을 때보다 크게 흔들린다", () => {
    // Arrange — 진폭이 수렴하도록 충분히 돌린다
    const walking = run(createPoseState(), makeInput({ speed: 2 }), 300);
    const running = run(createPoseState(), makeInput({ speed: 7.4 }), 300);

    // Assert — 걷기와 달리기가 같은 폭이면 속도 차이가 몸으로 읽히지 않는다
    expect(
      running.swingAmount,
      `walk=${walking.swingAmount}, run=${running.swingAmount}`,
    ).toBeGreaterThan(walking.swingAmount);
  });

  it("공중에서는 위상과 무관하게 고정 자세를 취한다", () => {
    // Arrange — 위상이 다른 두 상태를 만든다
    const a: PoseState = { ...createPoseState(), animation: "air", phase: 0 };
    const b: PoseState = { ...createPoseState(), animation: "air", phase: 3.7 };

    // Assert
    expect(limbPose(a)).toEqual(limbPose(b));
  });
});

describe("bodyBob", () => {
  it("정지 중에도 숨쉬기로 아주 조금 움직인다", () => {
    // Arrange — 마네킹처럼 굳어 있으면 안 된다
    let state = createPoseState();
    let moved = false;

    // Act
    for (let i = 0; i < 200; i += 1) {
      state = stepPose(state, makeInput(), FRAME);
      if (Math.abs(bodyBob(state)) > 1e-4) moved = true;
    }

    // Assert
    expect(moved, `breathPhase was: ${state.breathPhase}`).toBe(true);
  });

  it("걸을 때 오르내림이 상한을 넘지 않는다", () => {
    let state = createPoseState();
    for (let i = 0; i < 400; i += 1) {
      state = stepPose(state, makeInput({ speed: 7.4 }), FRAME);
      const bob = bodyBob(state);
      expect(bob, `bob was: ${bob}`).toBeLessThanOrEqual(POSE_TUNING.maxBobHeight + 1e-9);
      expect(bob, `bob was: ${bob}`).toBeGreaterThanOrEqual(0);
    }
  });
});
