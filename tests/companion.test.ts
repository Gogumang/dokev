import { describe, expect, it } from "vitest";

import { bothWays, describeSplit } from "./support/bothWays";

import { readCode } from "./support/source";

import { COMPANION_BODY } from "@/game/dokebi/companionBody";
import { DOKEBI_ORDER } from "@/game/dokebi/roster";
import type { Vec3 } from "@/game/player/locomotion";

import {
  bobOffset,
  companionFormationScale,
  slotAngle,
  COMPANION_TUNING,
  createCompanionState,
  distanceToTarget,
  stepCompanion,
  type CompanionState,
  type CompanionTarget,
  canUseAbility,
  isAbilityActive,
  showsOnMap,
  type CompanionCommand,
} from "@/game/dokebi/companionMotion";
import {
  projectCompanionEffects,
  projectCompanionTarget,
  resetCompanionEffects,
  type CompanionEffects,
} from "@/game/dokebi/companionProjection";

const FRAME = 1 / 60;

function makeTarget(overrides: Partial<CompanionTarget> = {}): CompanionTarget {
  return {
    position: { x: 0, y: 0, z: 0 },
    speed: 0,
    facing: 0,
    grounded: true,
    ...overrides,
  };
}

/** frames 번 반복해 정상 상태에 가깝게 만든다. */
function run(state: CompanionState, target: CompanionTarget, frames: number): CompanionState {
  let current = state;
  for (let i = 0; i < frames; i += 1) {
    current = stepCompanion(current, target, FRAME);
  }
  return current;
}

/**
 * 눈에 보이는 폭.
 *
 * 손으로 `0.68`(몸통 지름)을 적어 두었더니 **고리를 빼먹었다** — 고리가
 * 몸보다 넓어서, 검사를 통과하고도 화면에서는 겹쳐 보였다. 치수에서 유도한다.
 */
const SILHOUETTE_WIDTH = (COMPANION_BODY.ringRadius + COMPANION_BODY.ringThickness) * 2;

/** 자리들이 실제로 서 있는 지점끼리 가장 가까운 거리 */
function tightestGap(spots: readonly Vec3[]): { gap: number; pair: string } {
  let gap = Infinity;
  let pair = "";
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
      if (d < gap) {
        gap = d;
        pair = `${i}-${j}`;
      }
    }
  }
  return { gap, pair };
}

describe("createCompanionState", () => {
  it("좁은 세로 화면일수록 동료 대열이 안쪽으로 모인다", () => {
    expect(companionFormationScale(375)).toBeLessThan(companionFormationScale(768));
    expect(companionFormationScale(768)).toBeLessThan(companionFormationScale(1280));
    expect(companionFormationScale(1280)).toBe(1);
  });

  it("생성 직후에도 플레이어 근처에 있다", () => {
    // Arrange
    const target = makeTarget({ position: { x: 40, y: 0, z: -25 } });

    // Act
    const state = createCompanionState(target.position);

    // Assert — 원점에서 날아오지 않고 처음부터 옆에 있어야 한다
    const distance = distanceToTarget(state, target);
    expect(distance, `distance was: ${distance}`).toBeLessThan(
      COMPANION_TUNING.followDistance + 0.5,
    );
  });

  it("자리마다 다른 지점에서 시작한다", () => {
    /*
     * 자리를 무시하고 늘 0번 각도를 쓰고 있었다. 그래서 넷이 **한 점에 쌓인 채**
     * 시작해 첫 1초 동안 흩어졌다 — `?see=party`가 자리 배치를 보러 가는
     * 지점인데 정작 첫 화면에는 배치가 없었다.
     */
    // Arrange
    const target = makeTarget({ position: { x: 40, y: 0, z: -25 } });

    // Act
    const spots = DOKEBI_ORDER.map((_, index) => createCompanionState(target.position, index));

    // Assert — 가장 가까운 쌍도 실루엣보다 벌어져야 둘로 보인다
    const { gap, pair } = tightestGap(spots.map((s) => s.position));
    expect(gap, `자리 ${pair}이 ${gap.toFixed(2)}m로 가장 가깝다`).toBeGreaterThan(
      SILHOUETTE_WIDTH,
    );
  });

  it("제자리에 서 있어도 자리가 유지된다", () => {
    /*
     * 멈춰 있을 때의 목표는 궤도 각도 하나로만 정해지는데, 그 각도가 **모두
     * 0에서 출발해 같은 속도로** 돌았다. 그래서 3초만 서 있으면 넷이 두
     * 덩어리로 합쳐졌다 — 자리 0과 1은 거리까지 같아 정확히 0.00m였다.
     * 시작 위치만 벌려 놓은 앞의 검사로는 이것이 잡히지 않는다.
     */
    // Arrange
    const target = makeTarget();
    let states = DOKEBI_ORDER.map((_, index) => createCompanionState(target.position, index));

    // Act — 3초 동안 가만히 서 있는다. **매 프레임** 본다: 시작 위치와 정지
    // 궤도의 기준이 어긋났을 때는 넷이 반 바퀴를 도는 도중에만 스쳤고,
    // 끝값만 보는 검사는 그 순간을 통째로 놓쳤다.
    let worst = { gap: Infinity, pair: "", frame: 0 };
    for (let frame = 0; frame < 180; frame += 1) {
      states = states.map((state, index) =>
        stepCompanion(state, target, FRAME, undefined, undefined, index),
      );
      const now = tightestGap(states.map((state) => state.position));
      if (now.gap < worst.gap) worst = { ...now, frame };
    }

    // Assert
    expect(
      worst.gap,
      `${worst.frame}번째 프레임에 자리 ${worst.pair}이 ${worst.gap.toFixed(2)}m까지 붙는다`,
    ).toBeGreaterThan(SILHOUETTE_WIDTH);
  });

  it("달리고 꺾어도 자리가 유지된다", () => {
    /*
     * 「모퉁이에서 한 덩어리가 되는가」는 사람에게 물어보려던 것인데, 목표
     * 지점이 순수 계산이라 여기서 답할 수 있다. 급회전은 안쪽 자리와 바깥
     * 자리의 이동 거리가 가장 크게 벌어지는 경우다.
     */
    // Arrange — 달리면서 초당 3.5rad로 꺾는다
    const TURN_RATE = 3.5;
    const speed = COMPANION_TUNING.runSpeedReference;
    const spot = { x: 0, y: 0, z: 0 };
    let facing = 0;
    let states = DOKEBI_ORDER.map((_, index) => createCompanionState(spot, index));

    // Act
    let worst = { gap: Infinity, pair: "", frame: 0 };
    for (let frame = 0; frame < 300; frame += 1) {
      facing += TURN_RATE * FRAME;
      spot.x += Math.sin(facing) * speed * FRAME;
      spot.z += Math.cos(facing) * speed * FRAME;
      const target = makeTarget({ position: { ...spot }, speed, facing });
      states = states.map((state, index) =>
        stepCompanion(state, target, FRAME, undefined, undefined, index),
      );
      // 처음 1초는 대열을 잡는 구간이라 뺀다
      if (frame < 60) continue;
      const now = tightestGap(states.map((state) => state.position));
      if (now.gap < worst.gap) worst = { ...now, frame };
    }

    // Assert
    expect(
      worst.gap,
      `${worst.frame}번째 프레임에 자리 ${worst.pair}이 ${worst.gap.toFixed(2)}m까지 붙는다`,
    ).toBeGreaterThan(SILHOUETTE_WIDTH);
  });

  it("자리를 안 주면 0번 자리에서 시작한다", () => {
    // 동료가 하나뿐인 예전 호출부의 위치를 바꾸지 않는다
    const origin = { x: 3, y: 0, z: 5 };
    expect(createCompanionState(origin).position).toEqual(createCompanionState(origin, 0).position);
  });
});

describe("stepCompanion — 추적", () => {
  it("멀리 떨어뜨려 놓으면 플레이어 쪽으로 다가온다", () => {
    // Arrange
    const target = makeTarget();
    const far: CompanionState = {
      ...createCompanionState(target.position),
      position: { x: 12, y: 1.7, z: 12 },
    };
    const before = distanceToTarget(far, target);

    // Act
    const after = run(far, target, 30);

    // Assert
    const distance = distanceToTarget(after, target);
    expect(distance, `before=${before}, after=${distance}`).toBeLessThan(before);
  });

  it("충분히 지나면 따라다니는 거리로 수렴한다", () => {
    // Arrange
    const target = makeTarget();
    const state = createCompanionState(target.position);

    // Act — 정지 상태에서는 궤도를 돌므로 거리만 검사한다
    const settled = run(state, target, 600);

    // Assert
    const distance = distanceToTarget(settled, target);
    expect(distance, `distance was: ${distance}`).toBeGreaterThan(
      COMPANION_TUNING.followDistance - 0.6,
    );
    expect(distance, `distance was: ${distance}`).toBeLessThan(
      COMPANION_TUNING.followDistance + 0.6,
    );
  });

  it("플레이어가 빠를수록 더 뒤로 처진다", () => {
    // Arrange
    const slow = makeTarget({ speed: 0.5 });
    const fast = makeTarget({ speed: COMPANION_TUNING.runSpeedReference });

    // Act
    const slowSettled = run(createCompanionState(slow.position), slow, 400);
    const fastSettled = run(createCompanionState(fast.position), fast, 400);

    // Assert — 따라오느라 애쓰는 인상이 이 차이에서 나온다
    const slowDistance = distanceToTarget(slowSettled, slow);
    const fastDistance = distanceToTarget(fastSettled, fast);
    expect(fastDistance, `slow=${slowDistance}, fast=${fastDistance}`).toBeGreaterThan(
      slowDistance,
    );
  });

  it("아주 멀어지면 순간이동으로 붙는다", () => {
    // Arrange — 맵 반대편에서 날아오는 그림을 막기 위한 안전장치
    const target = makeTarget();
    const stray: CompanionState = {
      ...createCompanionState(target.position),
      position: { x: COMPANION_TUNING.teleportDistance + 20, y: 1.7, z: 0 },
    };

    // Act
    const result = stepCompanion(stray, target, FRAME);

    // Assert
    const distance = distanceToTarget(result, target);
    expect(distance, `distance was: ${distance}`).toBeLessThan(COMPANION_TUNING.followDistance + 2);
    expect(result.velocity.x, `velocity was: ${JSON.stringify(result.velocity)}`).toBe(0);
  });

  it("한 프레임에 최고 속도를 넘겨 이동하지 않는다", () => {
    // Arrange — 순간이동 임계 바로 아래에 두어 최대한 빠르게 따라붙게 한다
    const target = makeTarget();
    const stray: CompanionState = {
      ...createCompanionState(target.position),
      position: { x: COMPANION_TUNING.teleportDistance - 1, y: 1.7, z: 0 },
    };

    // Act
    const result = stepCompanion(stray, target, FRAME);

    // Assert
    const horizontal = Math.hypot(result.velocity.x, result.velocity.z);
    expect(horizontal, `horizontal speed was: ${horizontal}`).toBeLessThanOrEqual(
      COMPANION_TUNING.maxSpeed + 1e-6,
    );
  });
});

describe("stepCompanion — 감정 표현", () => {
  it("멈춰 있으면 idle", () => {
    const result = stepCompanion(createCompanionState({ x: 0, y: 0, z: 0 }), makeTarget(), FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("idle");
  });

  it("걸으면 follow", () => {
    const target = makeTarget({ speed: 3 });
    const result = stepCompanion(createCompanionState(target.position), target, FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("follow");
  });

  it("달리면 rush", () => {
    const target = makeTarget({ speed: COMPANION_TUNING.runSpeedReference + 2 });
    const result = stepCompanion(createCompanionState(target.position), target, FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("rush");
  });

  it("공중에 뜨면 속도와 무관하게 airborne", () => {
    const target = makeTarget({ speed: 0, grounded: false });
    const result = stepCompanion(createCompanionState(target.position), target, FRAME);
    expect(result.mood, `mood was: ${result.mood}`).toBe("airborne");
  });

  it("멈춰 있으면 플레이어 주위를 돈다", () => {
    // Arrange
    const target = makeTarget();
    const state = createCompanionState(target.position);

    // Act
    const after = run(state, target, 120);

    // Assert — 궤도 각도가 진행해야 제자리에 굳어 있지 않다
    expect(after.orbitAngle, `orbitAngle was: ${after.orbitAngle}`).toBeGreaterThan(
      state.orbitAngle,
    );
  });
});

describe("bobOffset", () => {
  it("진폭을 넘지 않는다", () => {
    // Arrange
    const target = makeTarget();
    let state = createCompanionState(target.position);

    // Act & Assert — 한 주기를 넘겨 돌면서 계속 확인한다
    for (let i = 0; i < 400; i += 1) {
      state = stepCompanion(state, target, FRAME);
      const offset = bobOffset(state);
      expect(Math.abs(offset), `offset was: ${offset}`).toBeLessThanOrEqual(
        COMPANION_TUNING.bobAmplitude + 1e-9,
      );
    }
  });
});

function makeCommand(overrides: Partial<CompanionCommand> = {}): CompanionCommand {
  return { summoned: true, abilityRequests: 0, ...overrides };
}

describe("stepCompanion — 소환·해제", () => {
  it("해제하면 존재감이 0으로 줄어든다", () => {
    // Arrange
    const target = makeTarget();
    let state = createCompanionState(target.position);

    // Act — 페이드 시간보다 넉넉히 돌린다
    for (let i = 0; i < 60; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: false }));
    }

    // Assert
    expect(state.presence, `presence was: ${state.presence}`).toBe(0);
  });

  it("다시 부르면 존재감이 1로 돌아온다", () => {
    // Arrange — 사라진 상태에서 시작
    const target = makeTarget();
    let state: CompanionState = { ...createCompanionState(target.position), presence: 0 };

    // Act
    for (let i = 0; i < 60; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: true }));
    }

    // Assert
    expect(state.presence, `presence was: ${state.presence}`).toBe(1);
  });

  it("즉시 사라지지 않는다", () => {
    // 한 프레임에 0이 되면 버그처럼 보인다
    const target = makeTarget();
    const after = stepCompanion(
      createCompanionState(target.position),
      target,
      FRAME,
      makeCommand({ summoned: false }),
    );
    expect(after.presence, `presence was: ${after.presence}`).toBeGreaterThan(0);
    expect(after.presence, `presence was: ${after.presence}`).toBeLessThan(1);
  });

  it("존재감은 0~1을 벗어나지 않는다", () => {
    const target = makeTarget();
    let state = createCompanionState(target.position);
    for (let i = 0; i < 200; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: i % 20 < 10 }));
      expect(state.presence, `presence was: ${state.presence}`).toBeGreaterThanOrEqual(0);
      expect(state.presence, `presence was: ${state.presence}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("stepCompanion — 능력 「반딧불」", () => {
  it("요청하면 켜진다", () => {
    const target = makeTarget();
    const after = stepCompanion(
      createCompanionState(target.position),
      target,
      FRAME,
      makeCommand({ abilityRequests: 1 }),
    );
    expect(isAbilityActive(after), `remaining was: ${after.abilityRemaining}`).toBe(true);
  });

  it("지속 시간이 지나면 꺼진다", () => {
    // Arrange
    const target = makeTarget();
    let state = stepCompanion(
      createCompanionState(target.position),
      target,
      FRAME,
      makeCommand({ abilityRequests: 1 }),
    );

    // Act — 지속 시간보다 오래 돌린다
    for (let i = 0; i < 60 * 6; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand());
    }

    // Assert
    expect(isAbilityActive(state), `remaining was: ${state.abilityRemaining}`).toBe(false);
  });

  it("대기 중에는 다시 켜지지 않는다", () => {
    // Arrange — 한 번 쓰고 지속만 끝난 시점
    const target = makeTarget();
    let state = stepCompanion(
      createCompanionState(target.position),
      target,
      FRAME,
      makeCommand({ abilityRequests: 1 }),
    );
    for (let i = 0; i < 60 * 5; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand());
    }

    // Act — 대기가 남은 상태에서 재요청
    const retried = stepCompanion(state, target, FRAME, makeCommand({ abilityRequests: 1 }));

    // Assert — 대기가 없으면 능력이 아니라 기본 상태가 된다
    expect(isAbilityActive(retried), `remaining was: ${retried.abilityRemaining}`).toBe(false);
  });

  it("해제 상태에서는 능력을 쓸 수 없다", () => {
    // 안 보이는 동료가 빛을 내면 앞뒤가 안 맞는다
    const target = makeTarget();
    const hidden: CompanionState = { ...createCompanionState(target.position), presence: 0 };
    const after = stepCompanion(
      hidden,
      target,
      FRAME,
      makeCommand({ summoned: false, abilityRequests: 1 }),
    );
    expect(isAbilityActive(after), `remaining was: ${after.abilityRemaining}`).toBe(false);
  });

  it("canUseAbility는 해제 중이면 false", () => {
    const hidden: CompanionState = {
      ...createCompanionState({ x: 0, y: 0, z: 0 }),
      presence: 0,
    };
    expect(canUseAbility(hidden)).toBe(false);
  });

  it("충분히 기다리면 다시 쓸 수 있다", () => {
    const target = makeTarget();
    let state = stepCompanion(
      createCompanionState(target.position),
      target,
      FRAME,
      makeCommand({ abilityRequests: 1 }),
    );
    for (let i = 0; i < 60 * 15; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand());
    }
    expect(canUseAbility(state), `cooldown was: ${state.abilityCooldown}`).toBe(true);
  });
});

const SPAWN = { x: 0, y: 0, z: 0 };

describe("여러 동료", () => {
  it("자리마다 각도가 다르다", () => {
    /*
     * 셋만 보고 있었다 — 도깨비가 넷이 된 뒤에도 그대로였다. 자리 수는
     * 도깨비 수만큼 생기므로 **정본에서 가져온다.**
     *
     * 같은 각도면 한 덩어리로 보인다. `?see=party`가 「자리 배치와 색 구분」을
     * 확인하러 가는 지점인데, 그 배치가 실제로 벌어지는지는 여기서 지킨다.
     */
    const slots = DOKEBI_ORDER.map((_, index) => index);
    expect(slots.length, `자리 ${slots.length}개`).toBeGreaterThan(3);

    const angles = slots.map(slotAngle);
    expect(new Set(angles).size, `angles: ${angles.join(",")}`).toBe(slots.length);
  });

  it("모든 자리가 서로 충분히 떨어진다", () => {
    /*
     * 각도가 달라도 값이 가까우면 몸이 겹친다. 동료 지름(0.68m)보다는
     * 벌어져야 둘로 보인다 — 따라오는 거리에서 각도 차이를 호의 길이로 잰다.
     */
    const distance = COMPANION_TUNING.followDistance;
    const diameter = 0.68;

    const angles = DOKEBI_ORDER.map((_, index) => slotAngle(index));
    for (let i = 0; i < angles.length; i += 1) {
      for (let j = i + 1; j < angles.length; j += 1) {
        const gap = Math.abs(angles[i] - angles[j]) * distance;
        expect(gap, `자리 ${i}와 ${j}가 ${gap.toFixed(2)}m 떨어진다`).toBeGreaterThan(diameter);
      }
    }
  });

  it("홀수 자리는 반대편이다", () => {
    // 같은 쪽에 줄 세우면 뒤쪽 동료가 앞 동료에 완전히 가린다
    expect(slotAngle(0) * slotAngle(1), `0=${slotAngle(0)}, 1=${slotAngle(1)}`).toBeLessThan(0);
  });

  it("0번 자리는 예전과 같다", () => {
    // 동료가 하나뿐일 때의 위치를 바꾸지 않는다
    expect(slotAngle(0)).toBe(COMPANION_TUNING.sideAngle);
  });

  it("한 번의 요청에 모두 반응한다", () => {
    /*
     * 불리언 플래그였을 때는 먼저 그려진 동료가 소비해 버려 나머지는
     * 능력을 쓰지 못했다. 카운터는 각자 한 번씩 본다.
     */
    const command = { summoned: true, abilityRequests: 1 };
    const first = stepCompanion(createCompanionState(SPAWN), makeTarget(), 0.1, command);
    const second = stepCompanion(createCompanionState(SPAWN), makeTarget(), 0.1, command);

    expect(isAbilityActive(first), "첫 동료가 발동하지 않았다").toBe(true);
    expect(isAbilityActive(second), "둘째 동료가 발동하지 않았다").toBe(true);
  });

  it("같은 요청에 두 번 반응하지 않는다", () => {
    const command = { summoned: true, abilityRequests: 1 };
    let state = stepCompanion(createCompanionState(SPAWN), makeTarget(), 0.1, command);
    const firstRemaining = state.abilityRemaining;
    state = stepCompanion(state, makeTarget(), 0.1, command);

    // 매 프레임 다시 발동하면 능력이 영원히 지속된다
    expect(state.abilityRemaining, `${firstRemaining} → ${state.abilityRemaining}`).toBeLessThan(
      firstRemaining,
    );
  });

  it("대기 중에 누른 요청이 나중에 터지지 않는다", () => {
    // 조작과 결과가 어긋나면 무엇 때문에 발동했는지 알 수 없다
    let state = stepCompanion(createCompanionState(SPAWN), makeTarget(), 0.1, {
      summoned: true,
      abilityRequests: 1,
    });
    // 능력이 도는 중에 한 번 더 누른다 (대기 때문에 무시되어야 한다)
    state = stepCompanion(state, makeTarget(), 0.1, { summoned: true, abilityRequests: 2 });
    const beforeCooldownEnds = state.abilityRemaining;

    // 능력이 끝나고 대기도 끝난 뒤, 새 요청 없이 진행한다
    for (let i = 0; i < 400; i += 1) {
      state = stepCompanion(state, makeTarget(), 0.1, { summoned: true, abilityRequests: 2 });
    }

    expect(beforeCooldownEnds).toBeGreaterThan(0);
    expect(isAbilityActive(state), "묵혀 둔 요청이 나중에 터졌다").toBe(false);
  });
});

describe("무작위 60초 동안 동료가 붙어 있는가", () => {
  /*
   * 동료 로직에는 순간이동 복구가 있다 — 너무 멀어지면 따라잡는 대신 옆으로
   * 옮겨 붙는다. 그 장치가 있으면 **영원히 뒤처지는 일은 없어야 한다.**
   * 그런데 소환·해제와 능력 발동이 섞이는 순서는 대본으로 다 짚을 수 없다.
   *
   * 사라지거나(좌표 NaN), 화면 밖으로 벌어지거나, 소환 상태가 범위를 벗어나는
   * 것만 잡는다. 자세나 표정은 눈으로 볼 문제다.
   */
  const FRAME = 1 / 60;
  const SEEDS = [5, 23, 777];

  function seeded(seed: number) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };
  }

  for (const seed of SEEDS) {
    it(`seed ${seed}: 붙어 있고 값이 성하다`, () => {
      const random = seeded(seed);
      const player = { x: 0, y: 0, z: 0 };
      let state = createCompanionState(player);
      let summoned = true;
      let requests = 0;
      let worst = 0;

      for (let frame = 0; frame < 60 * 60; frame += 1) {
        // 플레이어가 순간적으로 크게 움직이기도 한다 — 그래플·활강을 흉내 낸다
        const leap = random() < 0.02 ? 12 : 0.35;
        player.x += (random() - 0.5) * leap;
        player.z += (random() - 0.5) * leap;
        player.y = random() < 0.2 ? random() * 6 : 0;

        if (random() < 0.01) summoned = !summoned;
        if (random() < 0.03) requests += 1;

        state = stepCompanion(
          state,
          {
            position: player,
            speed: random() * 14,
            facing: random() * Math.PI * 2,
            grounded: player.y === 0,
          },
          FRAME,
          { summoned, abilityRequests: requests },
        );

        for (const [name, value] of [
          ["x", state.position.x],
          ["y", state.position.y],
          ["z", state.position.z],
          ["presence", state.presence],
        ] as const) {
          expect(Number.isFinite(value), `frame ${frame}: ${name}=${value}`).toBe(true);
        }
        expect(state.presence, `frame ${frame}: presence=${state.presence}`).toBeGreaterThanOrEqual(
          0,
        );
        expect(state.presence, `frame ${frame}: presence=${state.presence}`).toBeLessThanOrEqual(1);

        if (summoned && state.presence > 0.9) {
          const gap = Math.hypot(state.position.x - player.x, state.position.z - player.z);
          if (gap > worst) worst = gap;
        }
      }

      // 순간이동 복구가 있으므로 이 거리를 넘어 벌어진 채로 지낼 수는 없다
      expect(worst, `가장 멀어진 거리 ${worst.toFixed(1)}m`).toBeLessThan(30);
    });
  }
});

describe("능력을 쓸 수 있는지 알려 주는가", () => {
  /*
   * `canUseAbility`에는 「HUD가 버튼 활성화에 쓴다」고 적혀 있었는데 **아무도
   * 쓰지 않았다.** 쿨다운 중에 `E`를 눌러도 아무 일이 없고, 이유를 알 방법이
   * 없었다 — 사람은 기능이 고장 난 줄 안다.
   *
   * 죽은 export 검사는 이걸 못 잡았다: 테스트가 import하고 있으면 「쓰이는
   * 중」으로 센다. 제품 코드에서 죽어도 테스트가 살려 둔다.
   */
  const touch = readCode("src/components/hud/TouchButtons.tsx");

  /*
   * 원래는 `Companion.tsx`가 특정 글자를 담고 있는지로 봤다. 그 코드를
   * `projectCompanionEffects`로 빼자 깨졌는데 — **결함이 아니라 이사**였다.
   * 검사를 따라 옮기면 다음 이사에 또 깨지고, 옮겨 간 자리가 틀려도 모른다.
   * 그래서 **나가는 값**으로 바꿨다.
   */
  function readyFor(state: CompanionState, slot: number): boolean {
    const effects: CompanionEffects = {
      abilityAggroScale: 1,
      abilityRegenScale: 1,
      companionX: 0,
      companionZ: 0,
      companionVisible: false,
      companionAbilityReady: false,
      companionLightRange: 0,
    };
    projectCompanionEffects(effects, state, { aggroScale: 1, regenScale: 1 }, slot, false, 9);
    return effects.companionAbilityReady;
  }

  const SETTLED: CompanionState = {
    ...createCompanionState({ x: 0, y: 0, z: 0 }, 0),
    presence: 1,
    abilityCooldown: 0,
  };

  it("동료가 상태를 밖으로 알린다", () => {
    expect(readyFor(SETTLED, 0), "쓸 수 있는데 버튼이 안 켜진다").toBe(true);
    expect(
      readyFor({ ...SETTLED, abilityCooldown: 5 }, 0),
      "대기 중인데 버튼이 켜져 있다 — 눌러도 안 되는 버튼이 된다",
    ).toBe(false);
  });

  it("맨 앞 동료만 알린다", () => {
    // 뒤따르는 도깨비 상태로 버튼이 바뀌면 무엇을 보고 있는지 알 수 없다
    expect(readyFor(SETTLED, 1), "뒤따르는 동료가 버튼을 켰다").toBe(false);
  });

  it("버튼이 상태를 이름으로 말한다", () => {
    expect(touch).toContain("준비 중");
  });

  it("쿨다운 중에도 눌리기는 한다", () => {
    /*
     * 막아 두면 「왜 안 눌리지」가 되고, 알려 주면 「기다리면 되는구나」가 된다.
     * disabled를 걸지 않는다.
     */
    const at = touch.indexOf("준비 중");
    const around = touch.slice(Math.max(0, at - 300), at + 300);
    expect(around, "쿨다운 중에 버튼을 막았다").not.toContain("disabled");
  });
});

/*
 * 화면과 지도가 같은 말을 하는지.
 *
 * 부를 때·보낼 때 동료는 서서히 나타나고 사라진다. 그 동안 **화면에 거의 안
 * 보이는 동료가 지도에는 또렷한 점으로 남으면** 지도를 보고 쫓아간 사람이
 * 아무도 없는 자리에 선다. 주석은 「없는 동료가 점으로 남으면 안 된다」고 적어
 * 두었는데, 항상 참으로 바꿔 봐도 아무 검사가 몰라서 값으로 뺐다.
 *
 * 문턱 자체를 고정하지 않고 **관계**를 본다: 다 나타났으면 찍히고, 다 사라졌으면
 * 안 찍히고, 점 문턱이 능력 문턱보다 낮다. 숫자를 박으면 조정할 때마다 깨진다.
 */
describe("동료 지도 표시", () => {
  const at = (presence: number): CompanionState => ({
    ...createCompanionState({ x: 0, y: 0, z: 0 }, 0),
    presence,
  });

  it("다 나타났으면 찍는다", () => {
    expect(showsOnMap(at(1))).toBe(true);
  });

  it("다 사라졌으면 안 찍는다 — 없는 동료를 쫓아가게 된다", () => {
    expect(showsOnMap(at(0))).toBe(false);
  });

  it("사라지는 도중 어딘가에서 꺼진다 — 항상 참이면 규칙이 없는 것과 같다", () => {
    const shown = [0, 0.2, 0.4, 0.6, 0.8, 1].filter((p) => showsOnMap(at(p)));
    expect(shown.length, `찍히는 구간: ${shown.join(", ")}`).toBeGreaterThan(0);
    expect(shown.length, `찍히는 구간: ${shown.join(", ")}`).toBeLessThan(6);
  });

  it("점 문턱이 능력 문턱보다 낮다 — 점은 「저기 있다」지만 버튼은 눌러서 돼야 한다", () => {
    // 점은 찍히는데 능력은 아직인 구간이 실제로 있어야 「더 낮다」가 성립한다
    const between = [0.36, 0.4, 0.45, 0.5].filter(
      (p) => showsOnMap(at(p)) && !canUseAbility({ ...at(p), abilityCooldown: 0 }),
    );
    expect(between.length, `점만 찍히는 구간이 없다`).toBeGreaterThan(0);
  });
});

describe("능력과 등장이 시간을 지키는가", () => {
  /*
   * 보스·적에서 찾은 「전이만 보고 지속을 안 본다」를 동료에도 대 봤다. 능력이
   * **닳는 속도**는 잡히는데 두 가지가 뚫려 있었다: 재사용 대기를 0으로 만들어도,
   * 나타나고 사라지는 시간을 없애도 전부 통과했다.
   *
   * 사람이 겪는 모습:
   *   - 대기가 없으면 능력 버튼이 **꺼지지 않는다.** 계속 누르고 있으면 되니
   *     「언제 쓸까」를 고를 이유가 없어지고, 흔적 찾기가 그냥 켜 두는 일이 된다.
   *   - 등장이 즉시면 동료가 **팝 하고 나타났다 사라진다.** 부르고 보내는 것이
   *     연출이 아니라 스위치가 된다.
   *
   * 둘 다 「값이 있는가」가 아니라 **「얼마나 걸리는가」**로 잰다.
   */
  const target = makeTarget();

  /** 능력을 한 번 쓰고, 다시 쓸 수 있을 때까지 걸린 시간(초) */
  function cooldownSeconds(): number {
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    // 소환 상태를 안정시킨다 — presence가 차야 능력을 쓸 수 있다
    state = run(state, target, 120);
    state = stepCompanion(
      state,
      target,
      FRAME,
      makeCommand({ summoned: true, abilityRequests: 1 }),
    );
    expect(state.abilityRemaining, "능력이 켜지지 않았다").toBeGreaterThan(0);

    for (let i = 0; i < 60 * 60; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: true }));
      if (canUseAbility(state)) return (i + 1) * FRAME;
    }
    return Number.POSITIVE_INFINITY;
  }

  it("능력을 쓴 뒤 대기 시간을 채워야 다시 쓸 수 있다 — 없으면 버튼이 꺼지지 않는다", () => {
    const waited = cooldownSeconds();
    const expected = COMPANION_TUNING.abilityCooldownSeconds;
    expect(waited, `대기 ${waited}초 (기대 ${expected}초 이상)`).toBeGreaterThan(expected * 0.8);
  });

  it("보내면 서서히 사라진다 — 즉시면 팝 하고 없어진다", () => {
    let state = run(createCompanionState({ x: 0, y: 0, z: 0 }, 0), target, 120);
    expect(state.presence, "아직 다 나타나지 않았다").toBeGreaterThan(0.9);

    let frames = 0;
    while (state.presence > 0 && frames < 60 * 10) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: false }));
      frames += 1;
    }
    const took = frames * FRAME;
    expect(took, `사라지는 데 ${took}초 (기대 ${COMPANION_TUNING.fadeSeconds}초)`).toBeGreaterThan(
      COMPANION_TUNING.fadeSeconds * 0.8,
    );
  });
});

describe("동료가 화면으로 내보내는 칸", () => {
  /*
   * 지도 점·흔적을 밝히는 범위·능력 버튼이 여기서 나간다. 프레임 루프 안에
   * 있을 때는 **한 줄을 지워도 아무도 몰랐다.**
   *
   * 두 규칙이 이 자리의 핵심이다:
   *   - **덮어쓰지 않고 합친다.** 동료가 여럿이면 마지막 하나만 남아 나머지
   *     능력이 사라진다 — 셋을 데리고 다니는 것이 뜻을 잃는다.
   *   - **지도와 버튼은 맨 앞 동료만.** 셋이 겹쳐 점 세 개는 뭉쳐 보이고,
   *     뒤따르는 도깨비 상태로 버튼이 바뀌면 헷갈린다.
   */
  function blank(): CompanionEffects {
    return {
      abilityAggroScale: 1,
      abilityRegenScale: 1,
      companionX: 0,
      companionZ: 0,
      companionVisible: false,
      companionAbilityReady: false,
      companionLightRange: 0,
    };
  }

  const READY: CompanionState = {
    ...createCompanionState({ x: 0, y: 0, z: 0 }, 0),
    presence: 1,
    position: { x: 7, y: 0, z: -3 },
    abilityCooldown: 0,
  };

  it("맨 앞 동료의 자리가 지도로 나간다", () => {
    const effects = blank();
    projectCompanionEffects(effects, READY, { aggroScale: 1, regenScale: 1 }, 0, false, 9);

    expect(effects.companionX, "x가 안 나갔다").toBeCloseTo(7, 6);
    expect(effects.companionZ, "z가 안 나갔다").toBeCloseTo(-3, 6);
    expect(effects.companionVisible, "점이 안 켜졌다").toBe(true);
  });

  it("뒤따르는 동료는 지도에 안 찍힌다 — 셋이 겹쳐 뭉쳐 보인다", () => {
    const effects = blank();
    projectCompanionEffects(effects, READY, { aggroScale: 1, regenScale: 1 }, 1, false, 9);

    expect(effects.companionX, `뒤 동료가 x를 덮었다: ${effects.companionX}`).toBe(0);
    expect(effects.companionVisible).toBe(false);
  });

  it("능력을 쓸 때만 흔적이 드러난다 — 평소에도 드러나면 「잠깐 빛난다」가 아니다", () => {
    const off = blank();
    projectCompanionEffects(off, READY, { aggroScale: 1, regenScale: 1 }, 0, false, 20);
    expect(off.companionLightRange, "평소에도 흔적이 드러난다").toBe(0);

    const on = blank();
    projectCompanionEffects(on, READY, { aggroScale: 1, regenScale: 1 }, 0, true, 20);
    expect(on.companionLightRange, "능력을 켰는데 안 드러난다").toBe(20);
  });

  it("여럿이면 효과를 합친다 — 덮어쓰면 나머지 능력이 사라진다", () => {
    const effects = blank();
    // 인지 반경은 가장 낮은 값, 회복은 가장 높은 값이 남아야 한다
    projectCompanionEffects(effects, READY, { aggroScale: 0.6, regenScale: 1.4 }, 0, true, 9);
    projectCompanionEffects(effects, READY, { aggroScale: 0.9, regenScale: 1.1 }, 1, true, 9);

    expect(effects.abilityAggroScale, `인지 ${effects.abilityAggroScale}`).toBeCloseTo(0.6, 6);
    expect(effects.abilityRegenScale, `회복 ${effects.abilityRegenScale}`).toBeCloseTo(1.4, 6);
  });

  it("능력이 꺼져 있으면 효과를 안 얹는다", () => {
    const effects = blank();
    projectCompanionEffects(effects, READY, { aggroScale: 0.2, regenScale: 3 }, 0, false, 9);

    expect(effects.abilityAggroScale, "안 켰는데 인지가 줄었다").toBe(1);
    expect(effects.abilityRegenScale, "안 켰는데 회복이 늘었다").toBe(1);
  });
});

describe("동료가 읽어 갈 플레이어 상태", () => {
  /*
   * 동료가 따라오는 근거가 전부 이 여섯 칸이다. 프레임 루프 안에서 손으로 적을
   * 때는 **한 줄을 지워도 아무도 몰랐다.**
   *
   *   - 자리가 안 나가면 **동료가 첫 자리에 멈춰 서서 안 따라온다.**
   *   - `speed`가 안 나가면 늘 걷는 속도로 판단해 달릴 때 뒤처진다.
   *   - `facing`이 안 나가면 대열이 등 뒤가 아니라 엉뚱한 쪽에 선다.
   *   - `grounded`가 안 나가면 점프해도 동료가 따라 뜨지 않는다.
   *
   * 초기값은 기대값과 다르게 둔다 — 0으로 시작하면 안 채운 칸이 채운 것처럼 보인다.
   */
  function stale(): CompanionTarget {
    return { position: { x: -999, y: -999, z: -999 }, speed: -1, facing: -9, grounded: false };
  }

  it("여섯 칸이 모두 옮겨진다", () => {
    const target = stale();
    projectCompanionTarget(target, { x: 3, y: 1, z: -5 }, 7.4, 2.1, true);

    expect(target.position.x, "x가 안 나갔다 — 동료가 안 따라온다").toBeCloseTo(3, 6);
    expect(target.position.y, "y가 안 나갔다").toBeCloseTo(1, 6);
    expect(target.position.z, "z가 안 나갔다 — 동료가 안 따라온다").toBeCloseTo(-5, 6);
    expect(target.speed, "속도가 안 나갔다 — 달릴 때 뒤처진다").toBe(7.4);
    expect(target.facing, "방향이 안 나갔다 — 대열이 엉뚱한 쪽에 선다").toBeCloseTo(2.1, 6);
    expect(target.grounded, "접지가 안 나갔다 — 점프해도 안 따라 뜬다").toBe(true);
  });

  it("자리 객체를 갈아 끼우지 않는다 — 동료가 들고 있던 참조와 갈라진다", () => {
    const target = stale();
    const held = target.position;
    projectCompanionTarget(target, { x: 1, y: 2, z: 3 }, 0, 0, true);
    expect(target.position, "position이 새 객체로 바뀌었다").toBe(held);
  });

  it("옮긴 값으로 동료가 실제로 따라온다", () => {
    // 칸만 채우고 끝나면 뜻이 없다 — 그 값을 받은 동료가 움직이는지까지 본다
    const target = stale();
    projectCompanionTarget(target, { x: 0, y: 0, z: 0 }, 0, 0, true);
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    state = run(state, target, 60);
    const near = Math.hypot(state.position.x, state.position.z);

    projectCompanionTarget(target, { x: 40, y: 0, z: 0 }, 7.4, 0, true);
    state = run(state, target, 180);
    const moved = Math.hypot(state.position.x - 40, state.position.z);

    expect(moved, `멀어진 플레이어까지 남은 거리 ${moved.toFixed(2)}m`).toBeLessThan(near + 6);
    expect(state.position.x, `동료 x=${state.position.x.toFixed(2)}`).toBeGreaterThan(20);
  });
});

describe("능력 효과가 매 프레임 풀리는가", () => {
  /*
   * 합치기(`projectCompanionEffects`)의 **짝**이다. 저쪽은 얹기만 하므로,
   * 되돌리는 곳이 없으면 **능력이 한 번 걸린 뒤 영영 안 풀린다** — 인지 반경이
   * 줄어든 채로 남고 능력이 끝나도 흔적이 계속 밝다. 화면에 표시가 없어
   * 「원래 이런 게임인가」 싶게 된다.
   *
   * 되돌리기 코드가 사라져도 아무도 몰랐다. 프레임 안에서 순서를 전제하는
   * 두 조각 중 **한쪽만 검사가 있으면 다른 쪽이 조용히 사라진다.**
   */
  function boosted(): CompanionEffects {
    return {
      abilityAggroScale: 0.4,
      abilityRegenScale: 2.5,
      companionX: 3,
      companionZ: 4,
      companionVisible: true,
      companionAbilityReady: true,
      companionLightRange: 20,
    };
  }

  it("능력 값이 기본으로 돌아간다", () => {
    const effects = boosted();
    resetCompanionEffects(effects);

    expect(effects.abilityAggroScale, "인지 반경이 줄어든 채 남았다").toBe(1);
    expect(effects.abilityRegenScale, "회복이 빨라진 채 남았다").toBe(1);
    expect(effects.companionLightRange, "능력이 끝나도 흔적이 밝다").toBe(0);
  });

  it("자리와 지도 표시는 건드리지 않는다 — 그건 동료가 매 프레임 다시 쓴다", () => {
    const effects = boosted();
    resetCompanionEffects(effects);

    expect(effects.companionX, "동료 자리가 지워졌다").toBe(3);
    expect(effects.companionZ, "동료 자리가 지워졌다").toBe(4);
  });

  it("되돌린 뒤 합치면 그 프레임 값만 남는다 — 이게 두 조각이 맞물리는 방식이다", () => {
    const effects = boosted();
    const settled: CompanionState = {
      ...createCompanionState({ x: 0, y: 0, z: 0 }, 0),
      presence: 1,
      abilityCooldown: 0,
    };

    // 이번 프레임에는 아무도 능력을 안 켰다
    resetCompanionEffects(effects);
    projectCompanionEffects(effects, settled, { aggroScale: 0.2, regenScale: 5 }, 0, false, 9);

    expect(effects.abilityRegenScale, "지난 프레임 효과가 남았다").toBe(1);
    expect(effects.companionLightRange, "지난 프레임 빛이 남았다").toBe(0);
  });
});

describe("동료 술어가 실제로 갈리는가", () => {
  /*
   * 이 세션에 `showsOnMap`을 「늘 참」으로 바꿔도 통과한 적이 있다(그때 고쳤다).
   * 같은 일이 다시 생기지 않게 **양쪽이 다 나오는지**를 따로 묻는다.
   */
  const PRESENCES = [0, 0.2, 0.34, 0.36, 0.5, 0.7, 1];

  function withPresence(presence: number): CompanionState {
    return { ...createCompanionState({ x: 0, y: 0, z: 0 }, 0), presence, abilityCooldown: 0 };
  }

  it("지도 표시가 나타남 정도에 따라 갈린다", () => {
    const shows = (p: number) => showsOnMap(withPresence(p));
    expect(bothWays(PRESENCES, shows), describeSplit(PRESENCES, shows)).toBe(true);
  });

  it("능력 버튼도 갈린다", () => {
    const ready = (p: number) => canUseAbility(withPresence(p));
    expect(bothWays(PRESENCES, ready), describeSplit(PRESENCES, ready)).toBe(true);
  });

  it("두 문턱이 같지 않다 — 같으면 「점은 찍히는데 아직 못 쓴다」 구간이 없다", () => {
    const onlyDot = PRESENCES.filter(
      (p) => showsOnMap(withPresence(p)) && !canUseAbility(withPresence(p)),
    );
    expect(onlyDot.length, `점만 찍히는 구간: ${onlyDot.join(", ")}`).toBeGreaterThan(0);
  });
});

describe("동료가 어디를 보고 얼마나 빨리 따라오는가", () => {
  /*
   * 비교 방향 훑기에서 넷이 나왔다. 하나는 **플레이어에게서 방금 고친 것과
   * 같은 모양**이다 — 「움직이면 진행 방향, 멈추면 다른 쪽」의 판정이 뒤집히는
   * 것. 「한 곳에서 찾은 결함 모양은 이웃에도 있다」가 또 맞았다.
   */
  const target = makeTarget();

  it("따라 움직이는 동안 진행 방향을 본다", () => {
    // 플레이어가 멀리 있으면 동료는 그쪽으로 달린다
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    const far = makeTarget({ position: { x: 40, y: 0, z: 0 } });
    state = run(state, far, 30);

    // 진행 방향(+x = PI/2)을 보고 있어야 한다
    const toHeading = Math.abs(state.facing - Math.PI / 2);
    expect(toHeading, `facing ${state.facing} (진행 ${Math.PI / 2})`).toBeLessThan(0.8);
  });

  it("멈춰 있으면 플레이어를 본다", () => {
    // 자리에 도착해 멈춘 뒤에는 플레이어 쪽을 봐야 한다
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    state = run(state, target, 240);

    const toPlayer = Math.atan2(
      target.position.x - state.position.x,
      target.position.z - state.position.z,
    );
    const gap = Math.abs(state.facing - toPlayer);
    expect(gap, `facing ${state.facing} / 플레이어 쪽 ${toPlayer}`).toBeLessThan(0.8);
  });

  it("속도를 실제 이동에서 역산한다 — 따로 적분하면 자리와 어긋난다", () => {
    /*
     * 이 검사가 없을 때는 **속도를 아예 안 구해도 통과했다.** 「진행 방향을
     * 본다」로만 재고 있었는데, 플레이어가 앞에 있으면 「플레이어 쪽」과
     * 「진행 방향」이 같아서 **두 갈래가 구분이 안 됐다.**
     */
    const before = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    const far = makeTarget({ position: { x: 40, y: 0, z: 0 } });
    const after = stepCompanion(before, far, FRAME);

    const movedX = (after.position.x - before.position.x) / FRAME;
    const movedZ = (after.position.z - before.position.z) / FRAME;

    expect(Math.hypot(after.velocity.x, after.velocity.z), "속도가 0이다").toBeGreaterThan(0.1);
    expect(after.velocity.x, `속도 ${after.velocity.x} vs 이동 ${movedX}`).toBeCloseTo(movedX, 6);
    expect(after.velocity.z, `속도 ${after.velocity.z} vs 이동 ${movedZ}`).toBeCloseTo(movedZ, 6);
  });

  it("최고 속도를 넘지 않는다 — 넘으면 순간이동처럼 튄다", () => {
    // 큰 간격으로 한 번에 밀면 damp가 큰 거리를 만든다
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    const far = makeTarget({ position: { x: 300, y: 0, z: 0 } });
    state = stepCompanion(state, far, 0.5);

    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    expect(speed, `속도 ${speed} / 최고 ${COMPANION_TUNING.maxSpeed}`).toBeLessThanOrEqual(
      COMPANION_TUNING.maxSpeed + 1e-6,
    );
  });

  it("멈춰 있으면 속도가 0에 가깝다 — 늘 최고 속도면 잘라 내기가 뜻이 없다", () => {
    let state = createCompanionState({ x: 0, y: 0, z: 0 }, 0);
    state = run(state, target, 240);

    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    expect(speed, `멈춘 동료 속도 ${speed}`).toBeLessThan(COMPANION_TUNING.maxSpeed * 0.5);
  });
});

describe("능력을 대기 중에 또 쓸 수 있는가", () => {
  /*
   * 「대기를 채우면 다시 쓸 수 있다」는 재고 있었는데, **대기 중에 눌렀을 때
   * 안 나가는지**는 안 봤다. 조건을 뒤집으면 누를 때마다 나간다 —
   * 대기 자체가 없는 것과 같다.
   */
  const target = makeTarget();

  function pressAbility(state: CompanionState, requests: number): CompanionState {
    return stepCompanion(
      state,
      target,
      FRAME,
      makeCommand({ summoned: true, abilityRequests: requests }),
    );
  }

  it("쓰는 중에 또 누르면 시간이 안 늘어난다", () => {
    let state = run(createCompanionState({ x: 0, y: 0, z: 0 }, 0), target, 120);
    state = pressAbility(state, 1);
    const firstRemaining = state.abilityRemaining;
    expect(firstRemaining, "능력이 안 켜졌다").toBeGreaterThan(0);

    // 조금 흘려보낸 뒤 다시 누른다
    state = stepCompanion(state, target, FRAME, makeCommand({ summoned: true }));
    state = pressAbility(state, 2);

    expect(state.abilityRemaining, `다시 눌러 ${state.abilityRemaining}로 늘었다`).toBeLessThan(
      firstRemaining,
    );
  });

  it("대기 중에 누르면 안 나간다", () => {
    let state = run(createCompanionState({ x: 0, y: 0, z: 0 }, 0), target, 120);
    state = pressAbility(state, 1);

    // 능력이 끝날 때까지 흘려보낸다 (대기는 아직 남는다)
    for (let i = 0; i < 60 * 6; i += 1) {
      state = stepCompanion(state, target, FRAME, makeCommand({ summoned: true }));
    }
    expect(state.abilityRemaining, "능력이 아직 안 끝났다").toBe(0);
    expect(state.abilityCooldown, "대기가 벌써 끝났다").toBeGreaterThan(0);

    state = pressAbility(state, 2);
    expect(state.abilityRemaining, "대기 중인데 또 나갔다").toBe(0);
  });
});
