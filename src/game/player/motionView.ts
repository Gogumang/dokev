/**
 * 이동 상태를 화면이 읽는 모양으로 옮긴다.
 *
 * `locomotion.ts`에서 뗐다 — 저기는 물리를 푸는 곳이고 여기는 **화면에 넘기는
 * 계약**이라, 한 파일에 있으면 「무엇이 시뮬레이션이고 무엇이 표시인가」가
 * 섞인다. 파일 크기 상한이 그 섞임을 먼저 알려 줬다.
 */

import type { LocomotionMode } from "@/game/config/tuning";
import type { LocomotionState } from "@/game/player/locomotion";

/** 캐릭터 자세·소리·성능 패널이 읽는 이동 상태 */
export interface MotionView {
  speed: number;
  mode: LocomotionMode;
  grounded: boolean;
  gliding: boolean;
  landingImpact: number;
  x: number;
  z: number;
  facing: number;
  /** 화면이 보는 방향(rad). 지도와 화살표가 이것으로 돈다 */
  viewYaw: number;
}

/**
 * 이동 상태를 화면이 읽는 모양으로 옮긴다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다.** 여기가 끊기면 증상이 곧바로 눈에 띄는데도 그렇다:
 *
 *   - `mode`가 안 나가면 **달려도 걷는 자세**로 보이고 발소리도 걷기로 난다.
 *   - `grounded`가 안 나가면 땅에 서서 공중 자세를 하거나 그 반대가 된다.
 *   - `x`·`z`가 안 나가면 **지도의 내 점이 안 움직인다.**
 *   - `landingImpact`가 안 나가면 아무리 높이 떨어져도 카메라가 안 흔들린다.
 *
 * 제자리에서 채운다 — 새 객체를 만들면 HUD와 캐릭터가 보던 것과 갈라진다.
 */
export function projectMotionView(
  view: MotionView,
  state: LocomotionState,
  speed: number,
  mode: LocomotionMode,
  /** 화면이 보는 방향(rad). 카메라는 뒤에 앉으므로 부르는 쪽이 반 바퀴를 더한다 */
  viewYaw: number,
): void {
  view.speed = speed;
  view.mode = mode;
  view.grounded = state.grounded;
  view.gliding = state.gliding;
  view.landingImpact = state.landingImpact;
  view.x = state.position.x;
  view.z = state.position.z;
  view.facing = state.facing;
  view.viewYaw = viewYaw;
}
