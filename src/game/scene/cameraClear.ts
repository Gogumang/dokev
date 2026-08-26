/**
 * 카메라를 지형·건물 밖으로 내보낸다 — 한 점을 제자리에서 고친다.
 *
 * 두 곳에서 같은 일을 한다: 한 번은 **목표 자리**에, 한 번은 눅여 따라간 뒤
 * **실제로 그려질 자리**에. 목표에만 걸었더니 그리로 가는 0.3~0.5초 동안
 * 카메라가 벽 안에 있었다 — 도시를 7m 격자로 훑으며 제자리 회전을 시켜
 * 재 보니 134,600프레임 중 590(0.44%)이 건물 안이었고 가장 깊은 곳이
 * 0.89m다. 서서 찍으면 안 나오고 **시점을 돌려야** 나오는 종류라 여태
 * 안 보였다(`tests/cameraOcclusion.test.ts`).
 *
 * 같은 일을 두 번 적지 않으려고 여기로 뗐다. 갈라지면 목표와 그려질 자리가
 * 서로 다른 규칙으로 밀려나고, 그러면 카메라가 매 프레임 두 자리 사이에서
 * 떤다.
 */

import { CAMERA_COLLIDER_RADIUS, CAMERA_GROUND_CLEARANCE } from "@/game/config/tuning";
import { resolveHorizontalCollisions, type Aabb, type Vec3 } from "@/game/player/locomotion";
import { surfaceHeight } from "@/game/world/sidewalks";

/**
 * 지면 여유를 지키고 건물 밖으로 밀어낸 자리를 돌려준다.
 *
 * **지면이 먼저다.** 밀어낸 뒤에 높이를 고치면 옆으로 빠져나온 자리의
 * 지면 높이를 안 본 채로 끝난다.
 *
 * 밀어내기는 플레이어와 **같은 함수**를 쓴다(`resolveHorizontalCollisions`).
 * 카메라만 따로 쓰는 식을 새로 두면 두 판정이 갈라지고, 그러면 플레이어는
 * 못 들어가는 자리에 카메라만 들어가는 자리가 생긴다.
 *
 * 넘겨받은 것을 고치지 않고 돌려준다 — 밀어내기와 같은 모양이라, 부르는
 * 쪽에서 「어느 자리에 거는가」가 한눈에 보인다.
 */
export function clearedCameraPoint(point: Vec3, colliders: readonly Aabb[]): Vec3 {
  const ground = surfaceHeight(point.x, point.z) + CAMERA_GROUND_CLEARANCE;
  const y = Math.max(point.y, ground);
  const out = resolveHorizontalCollisions(point, CAMERA_COLLIDER_RADIUS, colliders);
  return { x: out.x, y, z: out.z };
}
