/**
 * 한 프레임의 플레이어 이동 전체 — 순수 함수.
 *
 * 이동, 벽 밀어내기, 발밑 정착이 **순서대로 붙어 있어야 맞는** 세 단계다.
 * 씬 파일 안 프레임 루프에 늘어놓았을 때는 그 순서가 코드로 드러나지 않았고,
 * 실제로 「지면을 이동 전 자리에서 재고 끝」인 채 오래 굴러갔다 —
 * 오르막에서 땅에 묻히고 내리막에서 덜덜 떨리던 것이 그것이다.
 *
 * three.js도 React도 모른다. 지면 높이는 함수로 받는다 — 도시 인도든 물놀이
 * 배든 「그 자리의 딛는 면」을 아는 쪽이 넘겨주면 된다.
 */

import {
  clampToBounds,
  resolveHorizontalCollisions,
  settleOnGround,
  stepLocomotion,
  type Aabb,
  type GrappleAnchor,
  type LocomotionState,
  type MoveInput,
} from "@/game/player/locomotion";

export interface GroundStepWorld {
  /** 그 자리에서 딛게 되는 면의 높이(m) */
  sampleGround: (x: number, z: number) => number;
  colliders: readonly Aabb[];
  grappleAnchors: readonly GrappleAnchor[];
  /** 플레이어 충돌 반경(m) */
  radius: number;
  /** 이 거리 밖으로 나가지 못한다(m) */
  halfExtent: number;
}

/**
 * 이동 → 벽 밀어내기 → 발밑 정착.
 *
 * 정착을 **맨 뒤에** 두는 것이 핵심이다. 앞의 두 단계가 모두 x/z를 바꾸므로,
 * 이동 전에 잰 높이는 도착한 자리의 높이가 아니다. 비탈에서 그 차이가 곧
 * 「땅을 뚫는」 증상이 된다.
 */
export function stepPlayerOnGround(
  state: LocomotionState,
  input: MoveInput,
  dt: number,
  world: GroundStepWorld,
): LocomotionState {
  const wasGrounded = state.grounded;

  const stepped = stepLocomotion(
    state,
    input,
    dt,
    world.sampleGround(state.position.x, state.position.z),
    world.grappleAnchors,
  );

  const moved = clampToBounds(
    resolveHorizontalCollisions(stepped.position, world.radius, world.colliders),
    world.halfExtent,
    world.radius,
  );

  return settleOnGround(
    { ...stepped, position: moved },
    world.sampleGround(moved.x, moved.z),
    wasGrounded,
    dt,
  );
}
