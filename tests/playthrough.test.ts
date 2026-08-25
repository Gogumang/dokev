import { describe, expect, it } from "vitest";

import { LOCOMOTION } from "@/game/config/tuning";
import { PLAYER_RADIUS } from "@/game/config/tuning";
import {
  clampToBounds,
  createLocomotionState,
  resolveHorizontalCollisions,
  stepLocomotion,
  type MoveInput,
} from "@/game/player/locomotion";
import { createQuestProgress, currentStep, stepQuest } from "@/game/quest/questRunner";
import { BOSS_QUEST, FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 대본대로 플레이해 보는 통합 검증.
 *
 * 지금까지의 테스트는 전부 **함수 하나씩**을 봤다. 함수가 각각 옳아도 맞물려
 * 돌지 않으면 게임은 진행되지 않는다 — 이동이 만드는 신호를 퀘스트가 못 읽거나,
 * 단계가 넘어가지 않거나, 목표에 닿아도 판정이 안 되는 종류다.
 *
 * 렌더 없이 순수 모듈만 60fps로 돌린다. 실제 조작감은 알 수 없지만
 * **"진행이 되는가"**는 여기서 확인된다.
 */

const FRAME = 1 / 60;
const layout = buildCityLayout();

function input(overrides: Partial<MoveInput> = {}): MoveInput {
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

/**
 * 정해진 입력으로 seconds초 동안 움직인다.
 *
 * **씬과 같은 순서로 돌린다.** `stepLocomotion` 뒤에 충돌 해결과 경계 클램프가
 * 붙는다(PlayerRig가 그렇게 한다). 이 셋을 함께 돌리지 않으면 통합 검증이
 * 아니라 함수 하나를 다시 보는 것에 지나지 않는다 — 실제로 클램프를 빼먹었더니
 * 1분 만에 월드 밖 887m까지 나갔다.
 */
function play(seconds: number, move: MoveInput) {
  let state = createLocomotionState(layout.spawn);
  const frames = Math.round(seconds / FRAME);

  for (let i = 0; i < frames; i += 1) {
    const stepped = stepLocomotion(state, move, FRAME, 0);
    state = {
      ...stepped,
      position: clampToBounds(
        resolveHorizontalCollisions(stepped.position, PLAYER_RADIUS, layout.colliders),
        layout.halfExtent,
        PLAYER_RADIUS,
      ),
    };
  }
  return state;
}

/** 스폰에서 얼마나 멀어졌는지 */
function traveled(state: ReturnType<typeof createLocomotionState>): number {
  return Math.hypot(state.position.x - layout.spawn.x, state.position.z - layout.spawn.z);
}

describe("이동이 실제로 일어나는가", () => {
  it("전진 입력은 카메라 반대쪽(-z)으로 간다", () => {
    /*
     * yaw 0에서 카메라는 플레이어의 **+z 쪽**에 선다(cameraRig.orbitDirection).
     * 카메라가 뒤에 있으므로 플레이어가 보는 앞은 -z다.
     *
     * 이 부호가 뒤집혀 W가 카메라 쪽으로 가던 버그가 실제로 있었다. 규약을
     * 여기 못 박아 둔다 — 카메라와 이동은 서로 반대편에서 같은 축을 쓴다.
     */
    const state = play(1, input({ moveZ: 1 }));
    expect(state.position.z, `z=${state.position.z.toFixed(2)}`).toBeLessThan(layout.spawn.z - 1);
  });

  it("달리면 걷기보다 멀리 간다", () => {
    const walked = traveled(play(2, input({ moveZ: 1 })));
    const ran = traveled(play(2, input({ moveZ: 1, run: true })));
    expect(ran, `walk=${walked.toFixed(1)}, run=${ran.toFixed(1)}`).toBeGreaterThan(walked);
  });

  it("보드가 달리기보다 빠르다", () => {
    const ran = traveled(play(4, input({ moveZ: 1, run: true })));
    const board = traveled(play(4, input({ moveZ: 1, vehicle: "skateboard" as const })));
    expect(board, `run=${ran.toFixed(1)}, board=${board.toFixed(1)}`).toBeGreaterThan(ran);
  });

  it("2초면 달리기 최고 속도에 닿는다", () => {
    /*
     * 가속이 너무 느리면 짧은 골목에서는 최고 속도를 쓸 수 없다 —
     * 속도 단계를 만들어 둔 의미가 없어진다.
     */
    const state = play(2, input({ moveZ: 1, run: true }));
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    expect(speed, `speed=${speed.toFixed(2)}`).toBeGreaterThan(LOCOMOTION.run.maxSpeed * 0.9);
  });

  it("월드 밖으로 나가지 않는다", () => {
    // 한 방향으로 1분을 달려도 경계 안에 남아야 한다
    const state = play(60, input({ moveZ: 1, vehicle: "skateboard" as const }));
    expect(Math.abs(state.position.z), `z=${state.position.z.toFixed(1)}`).toBeLessThanOrEqual(
      layout.halfExtent + 1,
    );
  });

  it("오래 달려도 벽 안에 끼지 않는다", () => {
    /*
     * 충돌 해결과 경계 클램프가 순서대로 걸린다. 클램프가 플레이어를 벽
     * 안쪽으로 밀어 넣으면 갇힌다 — 두 보정이 서로를 무효로 만드는 경우다.
     */
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.7, 0.7],
    ]) {
      const state = play(30, input({ moveX: x, moveZ: z, vehicle: "skateboard" as const }));
      const stuck = layout.colliders.filter(
        (box) =>
          state.position.x > box.minX &&
          state.position.x < box.maxX &&
          state.position.z > box.minZ &&
          state.position.z < box.maxZ,
      );
      expect(
        stuck.length,
        `direction (${x}, ${z}) ended inside ${stuck.length} colliders at (${state.position.x.toFixed(1)}, ${state.position.z.toFixed(1)})`,
      ).toBe(0);
    }
  });
});

describe("첫 여정이 진행되는가", () => {
  /** 이동 상태에서 퀘스트가 읽는 신호를 만든다 */
  function signalsFrom(state: ReturnType<typeof createLocomotionState>, extra = {}) {
    return {
      position: state.position,
      speed: Math.hypot(state.velocity.x, state.velocity.z),
      gliding: state.gliding,
      onBoard: false,
      defeatedTotal: 0,
      bossDefeated: false,
      cluesFound: 99,
      ...extra,
    };
  }

  it("달리기 단계가 실제로 통과된다", () => {
    /*
     * 첫 단계는 "7m/s로 달리기"다. 달리기 최고 속도가 7.4이므로 아슬아슬한데,
     * 가속 중에 판정이 되는지는 돌려 봐야 안다.
     */
    let locomotion = createLocomotionState(layout.spawn);
    let progress = createQuestProgress(signalsFrom(locomotion));
    const move = input({ moveZ: 1, run: true });

    for (let i = 0; i < 60 * 5; i += 1) {
      locomotion = stepLocomotion(locomotion, move, FRAME, 0);
      progress = stepQuest(FIRST_RUN_QUEST, progress, signalsFrom(locomotion), FRAME);
      if (progress.stepIndex > 0) break;
    }

    expect(progress.stepIndex, "달리기만으로 첫 단계를 넘지 못했다").toBeGreaterThan(0);
  });

  it("한 프레임에 여러 단계를 건너뛰지 않는다", () => {
    /*
     * 모든 조건을 동시에 만족시켜도 한 번에 하나씩만 넘어가야 한다 —
     * 무엇을 해냈는지 읽을 시간이 필요하다.
     */
    let locomotion = createLocomotionState(layout.spawn);
    const progress = createQuestProgress(signalsFrom(locomotion));
    const move = input({ moveZ: 1, run: true, vehicle: "skateboard" as const });

    locomotion = stepLocomotion(locomotion, move, FRAME, 0);
    const everything = signalsFrom(locomotion, {
      speed: 99,
      onBoard: true,
      defeatedTotal: 99,
      gliding: true,
    });
    const after = stepQuest(FIRST_RUN_QUEST, progress, everything, FRAME);

    expect(after.stepIndex, `index=${after.stepIndex}`).toBeLessThanOrEqual(1);
  });

  it("가만히 있으면 진행되지 않는다", () => {
    // 아무것도 안 했는데 진행되면 목표가 목표가 아니다
    let locomotion = createLocomotionState(layout.spawn);
    let progress = createQuestProgress(signalsFrom(locomotion));

    for (let i = 0; i < 60 * 10; i += 1) {
      locomotion = stepLocomotion(locomotion, input(), FRAME, 0);
      progress = stepQuest(FIRST_RUN_QUEST, progress, signalsFrom(locomotion), FRAME);
    }

    expect(progress.stepIndex).toBe(0);
    expect(progress.completed).toBe(false);
  });

  it("모든 단계에 도달할 수 있다", () => {
    /*
     * 신호를 직접 만들어 각 단계를 통과시킨다. 이동으로 전부 재현하려면
     * 5분짜리 테스트가 되고, 여기서 보려는 것은 **단계가 끝까지 이어지는가**다.
     */
    let locomotion = createLocomotionState(layout.spawn);
    let progress = createQuestProgress(signalsFrom(locomotion));
    const destination = FIRST_RUN_QUEST.steps.find((s) => s.objective.kind === "reach");
    const target = destination?.objective.kind === "reach" ? destination.objective : null;

    for (let i = 0; i < 60 * 30 && !progress.completed; i += 1) {
      locomotion = stepLocomotion(locomotion, input(), FRAME, 0);
      const step = currentStep(FIRST_RUN_QUEST, progress);
      const kind = step?.objective.kind;

      progress = stepQuest(
        FIRST_RUN_QUEST,
        progress,
        signalsFrom(locomotion, {
          speed: kind === "reachSpeed" ? 99 : 0,
          onBoard: kind === "board",
          defeatedTotal: kind === "defeat" ? 99 : 0,
          gliding: kind === "glide",
          position:
            kind === "reach" && target ? { x: target.x, y: 0, z: target.z } : locomotion.position,
        }),
        FRAME,
      );
    }

    expect(progress.completed, `stopped at step ${progress.stepIndex}`).toBe(true);
  });
});

describe("목적지까지 실제로 갈 수 있는가", () => {
  /*
   * 기존 「모든 단계에 도달할 수 있다」는 신호를 직접 만들어 통과시킨다 —
   * 단계가 이어지는지는 보지만 **갈 수 있는지는 보지 않는다.** 목적지가
   * 건물 안이거나 막힌 골목 뒤에 있어도 아무도 모른다.
   *
   * 브라우저 자동화로는 시간이 흐르지 않는 것이 확정됐으므로(RALPH_BACKLOG
   * 「브라우저 자동화의 한계」), 이런 검증은 여기서만 할 수 있다.
   *
   * 조종은 단순하다 — 매 프레임 목적지 쪽으로 스틱을 민다. 사람처럼 돌아가지
   * 못하므로, 이 방식으로 닿는다면 사람은 확실히 닿는다.
   */
  function driveTo(target: { x: number; z: number }, seconds: number) {
    let state = createLocomotionState(layout.spawn);
    const frames = Math.round(seconds / FRAME);
    let closest = Number.POSITIVE_INFINITY;

    for (let i = 0; i < frames; i += 1) {
      const dx = target.x - state.position.x;
      const dz = target.z - state.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < closest) closest = distance;

      // yaw 0에서 앞은 -z다 — moveZ는 부호를 뒤집어 넣는다
      const move = input({
        moveX: dx / (distance || 1),
        moveZ: -dz / (distance || 1),
        vehicle: "skateboard" as const,
        run: true,
      });

      const stepped = stepLocomotion(state, move, FRAME, 0);
      state = {
        ...stepped,
        position: clampToBounds(
          resolveHorizontalCollisions(stepped.position, PLAYER_RADIUS, layout.colliders),
          layout.halfExtent,
          PLAYER_RADIUS,
        ),
      };
    }

    return { closest, final: state.position };
  }

  for (const quest of [FIRST_RUN_QUEST, BOSS_QUEST]) {
    for (const step of quest.steps) {
      if (step.objective.kind !== "reach") continue;
      const goal = step.objective;

      it(`「${step.title}」의 목적지에 닿는다`, () => {
        const { closest, final } = driveTo(goal, 90);
        expect(
          closest,
          `90초 동안 최소 거리 ${closest.toFixed(1)}m (목표 ${goal.radius}m), ` +
            `끝난 자리 (${final.x.toFixed(0)}, ${final.z.toFixed(0)})`,
        ).toBeLessThanOrEqual(goal.radius);
      });
    }
  }
});

describe("활강을 배울 수 있는가", () => {
  /*
   * 안내는 「공중에서 한 번 더 뛰면 내려올 때 자동으로 활강한다」고 한다.
   * 여정 단계 이름은 「높은 곳에서 뛰어내려 활강하기」지만, 높은 곳을 못 찾은
   * 사람도 평지 이단 점프로 우산을 보고 규칙을 배울 수 있어야 한다.
   *
   * 반대로 첫 점프만으로 자동 활강하면 모든 점프가 느려진다. 자동 전개를 여는
   * 경계가 이단 점프인지 두 시나리오로 함께 고정한다.
   */
  it("평지 이단 점프 뒤 키를 놓아도 자동 활강이 걸린다", () => {
    let state = createLocomotionState(layout.spawn);
    let glided = false;
    let peak = 0;

    for (let i = 0; i < 60 * 6 && !glided; i += 1) {
      // 5프레임에 뛰고 20프레임에 한 번 더 누른 뒤 바로 놓는다
      const move = input({ jump: i === 5 || i === 20, moveZ: 1 });
      state = stepLocomotion(state, move, FRAME, 0);
      if (state.position.y > peak) peak = state.position.y;
      if (state.gliding) glided = true;
    }

    expect(glided, `최고 높이 ${peak.toFixed(2)}m에서 활강이 안 걸렸다`).toBe(true);
  });

  it("이단 점프를 쓰기 전에는 키를 놓으면 자동 활강하지 않는다", () => {
    let state = createLocomotionState(layout.spawn);
    let glided = false;

    for (let i = 0; i < 60 * 6; i += 1) {
      state = stepLocomotion(state, input({ jump: i === 5, moveZ: 1 }), FRAME, 0);
      if (state.gliding) glided = true;
    }

    expect(glided, "이단 점프 전에 자동 활강했다").toBe(false);
  });
});
