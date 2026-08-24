import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "@/game/config/tuning";
import {
  clampToBounds,
  createLocomotionState,
  resolveHorizontalCollisions,
  stepLocomotion,
  type LocomotionState,
  type MoveInput,
} from "@/game/player/locomotion";
import { buildCityLayout, CITY } from "@/game/world/cityLayout";
import { surfaceHeight } from "@/game/world/sidewalks";

/*
 * 실제 바닥 위를 달려 본다.
 *
 * `playthrough`의 시뮬레이션은 **평지에서만** 돌고 있었다 —
 * `stepLocomotion(state, move, FRAME, 0)`, 지면 높이가 늘 0이다. 그래서 지형이
 * 들어오고(±2m), 인도 턱이 생기고(16cm), 그 위를 걷도록 발 높이를 바꿔도
 * **움직이면서 무슨 일이 나는지는 아무도 보지 않았다.**
 *
 * 백로그의 마지막 항목이 「사람이 한 판 해 보는 것」인데, 사람이 아니어도
 * 여기까지는 갈 수 있다: 씬과 같은 순서로 실제 지면 높이를 먹여 가며 돌리고,
 * 사람이 알아챌 종류의 사고(땅에 빠짐·공중에 뜸·벽에 낌·턱에서 튐)를 잰다.
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

interface Trace {
  end: LocomotionState;
  /** 매 프레임의 (발 높이 − 그 자리 지면 높이) */
  gaps: number[];
  /** 한 프레임 사이에 지면 높이가 뛴 양 */
  jumps: number[];
  traveled: number;
}

/**
 * 씬과 같은 순서로 돌린다 — `stepLocomotion` → 충돌 해결 → 경계 클램프.
 *
 * **지면 높이를 매 프레임 그 자리에서 다시 읽는다.** `PlayerRig`가 그렇게 하고,
 * 이 검사의 요점이 바로 그 값이 움직이는 동안 어떻게 변하느냐다.
 */
function walk(from: { x: number; y: number; z: number }, move: MoveInput, seconds: number): Trace {
  let state = createLocomotionState({ ...from, y: surfaceHeight(from.x, from.z) });
  const gaps: number[] = [];
  const jumps: number[] = [];
  let previousGround = surfaceHeight(state.position.x, state.position.z);

  for (let i = 0; i < Math.round(seconds / FRAME); i += 1) {
    const ground = surfaceHeight(state.position.x, state.position.z);
    const stepped = stepLocomotion(state, move, FRAME, ground);
    state = {
      ...stepped,
      position: clampToBounds(
        resolveHorizontalCollisions(stepped.position, PLAYER_RADIUS, layout.colliders),
        layout.halfExtent,
        PLAYER_RADIUS,
      ),
    };

    const here = surfaceHeight(state.position.x, state.position.z);
    gaps.push(state.position.y - here);
    jumps.push(Math.abs(here - previousGround));
    previousGround = here;
  }

  return {
    end: state,
    gaps,
    jumps,
    traveled: Math.hypot(state.position.x - from.x, state.position.z - from.z),
  };
}

/** 여덟 방향. 한 방향만 재면 그쪽에 우연히 트인 길이 있었을 뿐일 수 있다 */
const HEADINGS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4).map((angle) => ({
  angle,
  move: input({ moveX: Math.sin(angle), moveZ: Math.cos(angle), run: true }),
}));

describe("실제 바닥 위를 달린다", () => {
  const traces = HEADINGS.map((heading) => ({
    angle: heading.angle,
    trace: walk(layout.spawn, heading.move, 12),
  }));

  it("어느 방향으로든 실제로 나아간다", () => {
    // 하나라도 제자리면 그 방향이 스폰 근처에서 막혀 있다는 뜻이다
    for (const { angle, trace } of traces) {
      expect(
        trace.traveled,
        `${((angle * 180) / Math.PI).toFixed(0)}°로 ${trace.traveled.toFixed(1)}m`,
      ).toBeGreaterThan(8);
    }
  });

  it("땅에 빠지지 않는다", () => {
    /*
     * 발 높이가 그 자리 지면보다 낮으면 바닥을 뚫고 들어간 것이다.
     *
     * **연석 한 칸만큼은 허용한다.** 씬은 지면 높이를 *움직이기 전* 자리에서
     * 읽고(`PlayerRig`가 그렇게 한다), 그 뒤에 수평으로 옮긴다. 그래서 턱을
     * 올라서는 순간 **한 프레임 동안** 새 자리의 지면보다 턱 높이만큼 낮게
     * 있다가 다음 프레임에 올라선다. 60fps에서 16ms짜리라 화면에서는 안 보인다.
     *
     * 처음에 -0.05로 잡았다가 정확히 인도 두께(-0.158m)에서 걸렸다. 값을
     * 늘린 것이 아니라 **무엇을 재는지 알게 된 것**이라 여기 적어 둔다 —
     * 이보다 더 잠기면 그건 턱이 아니라 진짜로 바닥을 뚫은 것이다.
     */
    for (const { angle, trace } of traces) {
      const worst = Math.min(...trace.gaps);
      expect(
        worst,
        `${((angle * 180) / Math.PI).toFixed(0)}°에서 ${worst.toFixed(3)}m 잠겼다`,
      ).toBeGreaterThan(-(CITY.sidewalkHeight + 0.02));
    }
  });

  it("달리는 내내 공중에 떠 있지 않는다", () => {
    /*
     * 지면을 따라가지 못하면 비탈을 내려갈 때 계속 떠 있게 된다. 「끝에서만」
     * 재면 마지막에 우연히 닿아 있을 수 있으므로 **떠 있던 프레임의 비율**로
     * 잰다. 점프를 누르지 않았으므로 대부분은 붙어 있어야 한다.
     */
    for (const { angle, trace } of traces) {
      const airborne = trace.gaps.filter((gap) => gap > 0.25).length / trace.gaps.length;
      expect(
        airborne,
        `${((angle * 180) / Math.PI).toFixed(0)}°에서 ${(airborne * 100).toFixed(0)}% 떠 있었다`,
      ).toBeLessThan(0.35);
    }
  });

  it("바닥이 한 프레임에 인도 턱보다 크게 뛰지 않는다", () => {
    /*
     * **이 검사가 이번 변경에서 나왔다.**
     *
     * 플레이어가 지형이 아니라 인도 위를 딛게 하면서, 연석에서 지면 높이가
     * 한 번에 16cm 바뀌게 되었다. 실제 보도가 그러니 그 자체는 맞다 — 문제는
     * **그보다 크게 뛰는 자리가 있는가**다. 크게 뛰면 화면에서 캐릭터가
     * 순간이동한 것으로 보인다.
     *
     * 여유를 조금 준다: 비탈에서는 한 프레임(달리기 최고 속도로 20cm 남짓)
     * 사이에도 지형 자체가 몇 cm 바뀐다.
     */
    for (const { angle, trace } of traces) {
      const worst = Math.max(...trace.jumps);
      expect(
        worst,
        `${((angle * 180) / Math.PI).toFixed(0)}°에서 한 프레임에 ${worst.toFixed(3)}m 뛰었다`,
      ).toBeLessThan(CITY.sidewalkHeight + 0.1);
    }
  });

  it("벽 안에서 끝나지 않는다", () => {
    /*
     * 해소기와 **같은 판정**으로 잰다 — 상자에서 가장 가까운 점까지의 거리다.
     *
     * 처음에 사각형에 반지름을 더해 쟀더니 45° 방향이 걸렸는데, 실제로는
     * 모퉁이에서 대각선으로 반지름만큼 떨어진 **멀쩡한 자리**였다. 사각형
     * 판정은 원 판정의 상위집합이라 모퉁이를 잘못 문다. 제품이 쓰는 식과
     * 다른 식으로 재면 이런 거짓 양성이 난다.
     */
    for (const { angle, trace } of traces) {
      const { x, y, z } = trace.end.position;
      const inside = layout.colliders.find((box) => {
        if (y >= box.top) return false;
        const dx = Math.max(box.minX - x, 0, x - box.maxX);
        const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
        return Math.hypot(dx, dz) < PLAYER_RADIUS - 1e-6;
      });
      expect(inside, `${((angle * 180) / Math.PI).toFixed(0)}°로 달려 벽 안에서 멈췄다`).toBeUndefined();
    }
  });
});

describe("보드로 달려도 같다", () => {
  /*
   * 보드는 달리기보다 훨씬 빠르다 — 한 프레임에 더 멀리 가므로 지면 높이가
   * 더 크게 뛴다. 걸어서 멀쩡한 것이 보드에서 깨지는 일이 실제로 잦다.
   */
  const board = input({ moveZ: 1, vehicle: "skateboard", run: true, cameraYaw: 0 });
  const trace = walk(layout.spawn, board, 12);

  it("걷기보다 멀리 간다 — 실제로 보드를 탔는지 먼저 확인한다", () => {
    const onFoot = walk(layout.spawn, input({ moveZ: 1, run: true }), 12);
    expect(trace.traveled, `보드 ${trace.traveled.toFixed(1)}m / 달리기 ${onFoot.traveled.toFixed(1)}m`).toBeGreaterThan(
      onFoot.traveled,
    );
  });

  it("땅에 빠지지 않는다", () => {
    const worst = Math.min(...trace.gaps);
    expect(worst, `${worst.toFixed(3)}m 잠겼다`).toBeGreaterThan(-(CITY.sidewalkHeight + 0.02));
  });

  it("바닥이 한 프레임에 크게 뛰지 않는다", () => {
    // 빠른 만큼 여유를 더 준다 — 한 프레임에 지나는 거리가 길다
    const worst = Math.max(...trace.jumps);
    expect(worst, `한 프레임에 ${worst.toFixed(3)}m 뛰었다`).toBeLessThan(CITY.sidewalkHeight + 0.25);
  });
});
