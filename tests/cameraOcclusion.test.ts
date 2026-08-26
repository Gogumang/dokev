import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CAMERA } from "@/game/config/tuning";
import type { Aabb } from "@/game/player/locomotion";
import { createCameraFrame, recordCameraFrame } from "@/game/scene/cameraFrame";
import { findCameraDistance } from "@/game/scene/cameraRig";
import type { LookState } from "@/game/scene/lookControl";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 건물 쪽으로 시점을 돌리면 화면이 가려지던 문제.
 *
 * 벽 회피는 **있었다.** `findCameraDistance`가 구간을 훑어 카메라를 당겨 오고,
 * 그래도 벽 안이면 `resolveHorizontalCollisions`가 밀어냈다. 그런데 둘 다
 * **목표 자리(`desired`)에만** 걸려 있었고, 화면에 그려지는 것은 그 목표를
 * 향해 눅여 따라가는 `state.position`이었다 — 목표는 안전한데 보이는 자리는
 * 아니었다.
 *
 * `followLambda`가 6.5라 시정수가 0.15초, 95%까지 0.46초다. 시점을 건물
 * 쪽으로 돌리는 그 반 초 동안 카메라가 벽 **안**에 있었다.
 *
 * 화면을 봐야만 보이는 종류라 검사로 못 박는다: **여러 프레임을 돌리면서
 * 매 프레임 그려질 자리가 상자 밖인지** 본다. 한 프레임만 재면 예전 코드도
 * 통과한다(눅기 전이라 아직 목표에 안 갔다).
 */

/** 플레이어 바로 옆에 세운 벽 한 장 */
function wallAt(minX: number, maxX: number, minZ: number, maxZ: number): Aabb {
  return { minX, maxX, minZ, maxZ, top: 12 };
}

function insideAny(point: THREE.Vector3, boxes: readonly Aabb[]): Aabb | undefined {
  return boxes.find(
    (box) =>
      point.y < box.top &&
      point.x > box.minX &&
      point.x < box.maxX &&
      point.z > box.minZ &&
      point.z < box.maxZ,
  );
}

function look(yaw: number): LookState {
  return { yaw, pitch: CAMERA.pitchStart, photoDistance: 6, sinceLookSeconds: 0 };
}

function frameInput(colliders: readonly Aabb[], overrides: Record<string, unknown> = {}) {
  return {
    tuning: CAMERA,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    speed: 0,
    mode: "walk" as const,
    photoMode: false,
    finish01: 0,
    shake: 0,
    colliders,
    enemyBlips: new Float32Array(0),
    enemyBlipCount: 0,
    bossEngaged: false,
    characterFade: { value: 0 },
    dt: 1 / 60,
    ...overrides,
  };
}

describe("건물 쪽으로 돌아와도 카메라가 벽 안에 들어가지 않는다", () => {
  const layout = buildCityLayout();

  /**
   * 그 점이 어느 충돌체 **안**인가. 안이면 몇 미터나 파고들었는지를 준다.
   *
   * `findCameraDistance`가 두는 여유(0.5m)는 빼고 잰다 — 여유 안쪽은
   * 「가까이 붙었다」이고, 상자 안은 「벽 속에 있다」다.
   */
  function depthInside(point: THREE.Vector3): number {
    let worst = 0;
    for (const box of layout.colliders) {
      if (point.y >= box.top) continue;
      if (point.x <= box.minX || point.x >= box.maxX) continue;
      if (point.z <= box.minZ || point.z >= box.maxZ) continue;
      worst = Math.max(
        worst,
        Math.min(point.x - box.minX, box.maxX - point.x, point.z - box.minZ, box.maxZ - point.z),
      );
    }
    return worst;
  }

  /**
   * 실제로 벽 안이 보이던 자리들.
   *
   * 도시 전체를 7m 격자로 훑으며 제자리 회전을 시켜 찾았다 — 134,600
   * 프레임 중 590프레임(0.44%)에서 카메라가 건물 안에 있었고, 가장 깊은
   * 곳은 **0.89m**였다. 그 자리들 중 깊은 순으로 넷을 남긴다.
   *
   * 전부를 검사에 넣지 않는 이유: 도시 전체 훑기는 3초가 걸린다. 넷이면
   * 같은 것을 잡으면서 0.1초다.
   */
  const BAD_SPOTS = [
    { x: -30, z: -79 },
    { x: -79, z: -79 },
    { x: 19, z: 40 },
    { x: -23, z: -86 },
  ];

  it("벽 안이 보이던 자리에서 한 바퀴를 돌아도 카메라가 밖에 있다", () => {
    const camera = new THREE.PerspectiveCamera();
    let checked = 0;
    const breaches: string[] = [];

    for (const spot of BAD_SPOTS) {
      const state = createCameraFrame();
      const view = look(0);
      for (let frame = 0; frame < 200; frame += 1) {
        // 2초에 한 바퀴 — 손으로 홱 돌리는 정도다
        view.yaw += (Math.PI * 2) / 120;
        recordCameraFrame(
          camera,
          state,
          view,
          frameInput(layout.colliders, { position: { x: spot.x, y: 0, z: spot.z } }),
        );
        checked += 1;
        const depth = depthInside(state.position);
        if (depth > 0)
          breaches.push(`(${spot.x}, ${spot.z}) ${frame}프레임 — ${depth.toFixed(2)}m`);
      }
    }

    expect(checked, "이 검사가 실제로 프레임을 돌렸다").toBe(BAD_SPOTS.length * 200);
    expect(
      breaches.length,
      `카메라가 건물 안에 있던 프레임 ${breaches.length}개:\n${breaches.slice(0, 5).join("\n")}`,
    ).toBe(0);
  });

  it("좁은 벽 앞에 서서 제자리를 지켜도 벽 안이 아니다", () => {
    const colliders = [wallAt(-20, 20, 2, 20)];
    const camera = new THREE.PerspectiveCamera();
    const state = createCameraFrame();
    // 벽을 등지고 선다 — yaw 0이면 카메라가 +z, 곧 벽 쪽이다
    const view = look(0);

    for (let frame = 0; frame < 120; frame += 1) {
      recordCameraFrame(camera, state, view, frameInput(colliders));
    }
    expect(insideAny(state.position, colliders)).toBeUndefined();
  });
});

describe("막힌 거리를 촘촘히 잰다", () => {
  const origin = { x: 0, y: 2, z: 0 };
  const back = { x: 0, y: 0, z: -1 };

  /* 뒤 4.17m에 벽. 여유 0.5m를 빼면 3.67m가 참값이다 — 표본 격자(0.7m)와 엇갈리게 뒀다 */
  const wall = [wallAt(-20, 20, -20, -4.17)];

  it("상자 앞에서 멈춘다", () => {
    expect(findCameraDistance(origin, back, 7, wall)).toBeCloseTo(3.67, 1);
  });

  it("성긴 표본 간격(0.7m)보다 훨씬 정확하다", () => {
    /*
     * 예전에는 「막힌 표본 하나 앞」을 그대로 돌려줘 답이 0.7m 단위로만
     * 나왔다 — 여기서는 3.5m를 내놓아 0.17m를 통째로 양보했고, 시점을
     * 돌리면 그 간격만큼 카메라가 툭툭 끊겨 들어왔다 나갔다.
     */
    const coarse = 3.5;
    const distance = findCameraDistance(origin, back, 7, wall);
    expect(distance, "예전 성긴 값(3.5m)에 머물러 있다").toBeGreaterThan(coarse + 0.1);
    expect(distance, "참값(3.67m)을 넘어가면 벽 안이다").toBeLessThan(3.67);
  });

  it("막을 것이 없으면 요청한 거리를 그대로 준다", () => {
    expect(findCameraDistance(origin, back, 7, [])).toBe(7);
  });

  it("상자 위로 지나가면 안 막힌다 — 낮은 담 너머가 보여야 한다", () => {
    const low: Aabb = { minX: -20, maxX: 20, minZ: -20, maxZ: -4, top: 1 };
    expect(findCameraDistance(origin, back, 7, [low])).toBe(7);
  });
});
