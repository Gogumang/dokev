/**
 * 시점 조작 한 프레임 — 마우스·터치·(포토 모드의) 키보드.
 *
 * 값이 세 개(yaw, pitch, 포토 거리)뿐인데 규칙이 넷이라 프레임 루프 안에서
 * 계속 부피가 커졌다. 여기로 옮기면서 얻는 것은 줄 수가 아니라 **검증
 * 가능성**이다 — "포토 모드에서만 위아래로 더 돌아간다", "손을 뗀 시점을
 * 기억한다" 같은 규칙은 화면을 봐야만 확인되는 것들이었다.
 *
 * three.js를 모른다. 카메라 행렬은 씬이 만든다.
 */

import { CAMERA, PHOTO_CAMERA } from "@/game/config/tuning";
import { clamp } from "@/game/core/mathx";

/** 프레임마다 제자리에서 갱신되는 시점 상태 */
export interface LookState {
  yaw: number;
  pitch: number;
  /** 포토 모드에서 휠로 정한 거리(m) */
  photoDistance: number;
  /**
   * 마지막 수동 조작 뒤 경과 시간(초).
   *
   * 달릴 때의 카메라 되돌림(`stepFollowYaw`)이 이 값을 보고 참는다. 켜고 끄는
   * 깃발이 아니라 시간인 이유: 깃발이면 마우스를 놓는 프레임에 곧바로 되돌림이
   * 시작되어 화면이 홱 돌아간다.
   */
  sinceLookSeconds: number;
}

export interface LookInput {
  /** 이번 프레임의 시점 이동량 */
  look: { x: number; y: number };
  /** 휠 값. 포토 모드에서만 쓴다 */
  zoom: number;
  /** 이동 입력. 포토 모드에서는 카메라를 돌린다 */
  moveX: number;
  moveZ: number;
  photoMode: boolean;
}

/**
 * 이번 프레임의 시점 입력을 상태에 적는다.
 *
 * **제자리에서 고친다** — 새 객체를 만들면 프레임마다 쓰레기가 생기고,
 * 참조를 들고 있는 쪽과 갈라진다. 그래서 이름이 `record…`다(이 저장소에서
 * 넘겨받은 객체를 고치는 함수가 지키는 약속이고, `stateBoundaries` 검사가
 * 이름을 본다).
 */
export function recordLook(state: LookState, input: LookInput, dt: number): void {
  state.yaw -= input.look.x * CAMERA.sensitivity;

  if (input.look.x !== 0 || input.look.y !== 0) state.sinceLookSeconds = 0;
  else state.sinceLookSeconds += dt;

  /*
   * 포토 모드에서는 이동 키가 카메라를 돌린다.
   *
   * 구도는 드래그와 휠로만 잡을 수 있었다 — 키보드만 쓰는 사람은 P로 들어갈
   * 수는 있어도 아무것도 할 수 없었다. 포토 모드에서는 시뮬레이션이 멈춰
   * 이동 키가 하는 일이 없으므로, 그 자리를 카메라에 내준다.
   */
  if (input.photoMode) {
    state.yaw -= input.moveX * PHOTO_CAMERA.keyTurnRate * dt;
    state.pitch += input.moveZ * PHOTO_CAMERA.keyTurnRate * dt;
  }

  // 포토 모드에서는 위아래로 더 크게 돌릴 수 있다 — 올려다보는 구도가 필요하다.
  state.pitch = clamp(
    state.pitch + input.look.y * CAMERA.sensitivity,
    input.photoMode ? PHOTO_CAMERA.pitchMin : CAMERA.pitchMin,
    input.photoMode ? PHOTO_CAMERA.pitchMax : CAMERA.pitchMax,
  );

  if (input.photoMode && input.zoom !== 0) {
    state.photoDistance = clamp(
      state.photoDistance + (input.zoom / 100) * PHOTO_CAMERA.zoomPerNotch,
      PHOTO_CAMERA.minDistance,
      PHOTO_CAMERA.maxDistance,
    );
  }
}
