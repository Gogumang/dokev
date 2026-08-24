import { describe, expect, it } from "vitest";

import { createEmoteState, EMOTES, stepEmote } from "@/game/player/emote";
import { createSeededRandom } from "@/game/core/mathx";
import { GRAPPLE, LOCOMOTION, PLAYER_RADIUS } from "@/game/config/tuning";
import {
  clampToBounds,
  createLocomotionState,
  resolveHorizontalCollisions,
  stepLocomotion,
  type MoveInput,
} from "@/game/player/locomotion";
import { createQuestProgress, stepQuest } from "@/game/quest/questRunner";
import { FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { createVendingState, speedScale, stepVending } from "@/game/systems/vending";
import { buildCityLayout } from "@/game/world/cityLayout";
import { districtAt } from "@/game/world/districts";

/*
 * 무작위 조작으로 오래 돌리기.
 *
 * 대본 시뮬레이션(반복 91·92)은 **내가 상상한 경로**만 지나간다. 실제
 * 사용자는 아무 버튼이나 동시에 누르고, 벽에 대고 달리고, 공중에서 보드를
 * 켠다 — 그런 조합에서 상태가 깨지는지는 대본으로 알 수 없다.
 *
 * 시드를 고정한 난수를 쓴다. 실패하면 같은 시드로 그대로 재현된다 —
 * 재현할 수 없는 실패는 고칠 수 없다.
 */

const FRAME = 1 / 60;
const layout = buildCityLayout();
const anchors = layout.props
  .filter((prop) => prop.tone === 0 && prop.height > 4)
  .map((prop) => ({ x: prop.x, y: prop.height, z: prop.z }));

/** 한 판을 무작위로 돌리고 마지막 상태와 관찰값을 돌려준다 */
function fuzz(seed: number, seconds: number) {
  const random = createSeededRandom(seed);
  let locomotion = createLocomotionState(layout.spawn);
  let quest = createQuestProgress(signals(locomotion));
  let emote = createEmoteState();
  let vending = createVendingState();

  let maxSpeed = 0;
  let minStepIndex = 0;
  // 수직 축 관측 — 바닥을 뚫거나 영원히 떠 있는 것은 되돌릴 방법이 없다
  let minY = Number.POSITIVE_INFINITY;
  let groundedFrames = 0;
  const districts = new Set<string>();

  // 입력은 몇 프레임씩 유지한다 — 매 프레임 바뀌면 아무 데도 못 간다
  let held: MoveInput = randomInput(random);
  let holdFrames = 0;

  for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
    if (holdFrames <= 0) {
      held = randomInput(random);
      holdFrames = 6 + Math.floor(random() * 40);
    }
    holdFrames -= 1;

    if (locomotion.position.y < minY) minY = locomotion.position.y;
    if (locomotion.grounded) groundedFrames += 1;

    const move: MoveInput = { ...held, speedScale: speedScale(vending) };
    const stepped = stepLocomotion(locomotion, move, FRAME, 0, anchors);
    locomotion = {
      ...stepped,
      position: clampToBounds(
        resolveHorizontalCollisions(stepped.position, PLAYER_RADIUS, layout.colliders),
        layout.halfExtent,
        PLAYER_RADIUS,
      ),
    };

    vending = stepVending(vending, FRAME);
    emote = stepEmote(emote, FRAME, {
      requested: random() < 0.01,
      speed: Math.hypot(locomotion.velocity.x, locomotion.velocity.z),
      grounded: locomotion.grounded,
    });

    const before = quest.stepIndex;
    quest = stepQuest(FIRST_RUN_QUEST, quest, signals(locomotion), FRAME);
    minStepIndex = Math.min(before, quest.stepIndex, minStepIndex === 0 ? before : minStepIndex);

    maxSpeed = Math.max(maxSpeed, Math.hypot(locomotion.velocity.x, locomotion.velocity.z));
    districts.add(districtAt(locomotion.position.x, locomotion.position.z).id);

    assertFinite(locomotion, i, seed);
  }

  return { locomotion, quest, emote, maxSpeed, districts, minY, groundedFrames };
}

function randomInput(random: () => number): MoveInput {
  return {
    moveX: random() * 2 - 1,
    moveZ: random() * 2 - 1,
    jump: random() < 0.1,
    jumpHeld: random() < 0.3,
    grappleRequested: random() < 0.05,
    run: random() < 0.5,
    vehicle: random() < 0.3 ? "skateboard" : null,
    cameraYaw: random() * Math.PI * 2,
  };
}

function signals(state: ReturnType<typeof createLocomotionState>) {
  return {
    position: state.position,
    speed: Math.hypot(state.velocity.x, state.velocity.z),
    gliding: state.gliding,
    onBoard: false,
    defeatedTotal: 0,
    bossDefeated: false,
    cluesFound: 0,
  };
}

/** NaN은 한 번 생기면 모든 계산에 번진다. 생긴 프레임에서 잡아야 원인을 안다 */
function assertFinite(state: ReturnType<typeof createLocomotionState>, frame: number, seed: number) {
  for (const [name, value] of [
    ["x", state.position.x],
    ["y", state.position.y],
    ["z", state.position.z],
    ["vx", state.velocity.x],
    ["vy", state.velocity.y],
    ["vz", state.velocity.z],
    ["facing", state.facing],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`seed ${seed}, frame ${frame}: ${name} = ${value}`);
    }
  }
}

describe("무작위 조작 60초", () => {
  const seeds = [1, 7, 42, 1234, 20260817];

  it("좌표와 속도가 수로 남는다", () => {
    // NaN이 한 번 생기면 캐릭터가 화면에서 사라지고 되돌릴 방법이 없다
    for (const seed of seeds) {
      expect(() => fuzz(seed, 60), `seed ${seed}`).not.toThrow();
    }
  });

  it("월드 밖으로 나가지 않는다", () => {
    for (const seed of seeds) {
      const { locomotion } = fuzz(seed, 60);
      const { x, z } = locomotion.position;
      expect(Math.abs(x), `seed ${seed}: x=${x.toFixed(1)}`).toBeLessThanOrEqual(
        layout.halfExtent + 1,
      );
      expect(Math.abs(z), `seed ${seed}: z=${z.toFixed(1)}`).toBeLessThanOrEqual(
        layout.halfExtent + 1,
      );
    }
  });

  it("벽 안에서 끝나지 않는다", () => {
    /*
     * 그래플까지 섞이면 벽을 통과할 기회가 늘어난다. 마지막에 어디 서 있는지가
     * 곧 "갇혔는가"다.
     */
    for (const seed of seeds) {
      const { locomotion } = fuzz(seed, 60);
      const inside = layout.colliders.filter(
        (box) =>
          locomotion.position.x > box.minX &&
          locomotion.position.x < box.maxX &&
          locomotion.position.z > box.minZ &&
          locomotion.position.z < box.maxZ,
      );
      expect(inside.length, `seed ${seed}: inside ${inside.length} colliders`).toBe(0);
    }
  });

  it("속도가 규정을 넘지 않는다", () => {
    /*
     * 그래플은 순간적으로 더 빠르다. 그것을 감안해도 두 배를 넘으면 어딘가
     * 가속이 중복 적용되고 있다는 뜻이다.
     */
    const ceiling = Math.max(LOCOMOTION.skateboard.maxSpeed, GRAPPLE.pullSpeed) * 2;
    for (const seed of seeds) {
      const { maxSpeed } = fuzz(seed, 60);
      expect(maxSpeed, `seed ${seed}: max=${maxSpeed.toFixed(1)}, ceiling=${ceiling}`).toBeLessThan(
        ceiling,
      );
    }
  });

  it("퀘스트가 뒤로 가지 않는다", () => {
    // 단계가 되돌아가면 이미 한 일을 다시 하게 된다
    for (const seed of seeds) {
      const { quest } = fuzz(seed, 60);
      expect(quest.stepIndex, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(quest.stepIndex).toBeLessThanOrEqual(FIRST_RUN_QUEST.steps.length);
    }
  });

  it("감정 표현 상태가 범위를 벗어나지 않는다", () => {
    // 인덱스가 벗어나면 poseAt이 undefined가 되어 캐릭터가 굳는다
    for (const seed of seeds) {
      const { emote } = fuzz(seed, 60);
      expect(emote.index, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(emote.index).toBeLessThan(EMOTES.length);
    }
  });

  it("60초면 구역을 하나 이상 지난다", () => {
    /*
     * 무작위로 움직여도 60초면 어딘가로는 간다. 한 구역에만 머문다면 이동이
     * 사실상 막혀 있다는 뜻이다.
     */
    const visited = seeds.map((seed) => fuzz(seed, 60).districts.size);
    expect(Math.max(...visited), `visited: ${visited.join(",")}`).toBeGreaterThan(1);
  });
});

describe("수직 축", () => {
  /*
   * 바닥을 뚫고 내려가거나 영원히 공중에 뜨는 것은 **되돌릴 방법이 없는** 상태다.
   * 수평은 경계 클램프가 지켜 주지만 수직은 중력과 충돌만이 지킨다.
   *
   * 그래플·이단 점프·활강·보드가 뒤섞이는 60초에서 한 번도 발을 못 붙이면
   * 조작이 잠긴 것과 같다.
   */
  // 위 묶음의 seeds는 그 안에 있다. 같은 값을 쓰되 여기서 다시 선언한다
  const seeds = [1, 7, 42, 1234, 20260817];

  it("바닥 아래로 내려가지 않는다", () => {
    for (const seed of seeds) {
      const { minY } = fuzz(seed, 60);
      expect(minY, `seed ${seed}: 최저 높이 ${minY.toFixed(2)}m`).toBeGreaterThanOrEqual(-0.5);
    }
  });

  it("60초 동안 땅을 밟는 시간이 있다", () => {
    for (const seed of seeds) {
      const { groundedFrames } = fuzz(seed, 60);
      // 60초 = 3,600프레임. 1%도 못 밟으면 사실상 떠 있는 것이다
      expect(groundedFrames, `seed ${seed}: 접지 ${groundedFrames}프레임`).toBeGreaterThan(36);
    }
  });
});
