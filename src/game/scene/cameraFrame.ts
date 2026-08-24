/**
 * 카메라 한 프레임 — 궤도 추적, 벽·지형 회피, 마무리 클로즈업, 시야각.
 *
 * 규칙이 여덟 개쯤 겹쳐 있다: 속도로 멀어지고, 전투에서 물러나고, 언덕에서
 * 열리고, 탈것에서 낮아지고, 건물에 막히면 당겨지고, 그래도 벽 안이면
 * 밀려나고, 대장을 눕히면 얼굴로 붙고, 착지하면 흔들린다. 순서가 곧
 * 정확성이라(밀어내기 **뒤에** 클로즈업을 섞어야 벽을 통과하지 않는다)
 * 프레임 루프에 늘어놓으면 그 순서가 코드로 드러나지 않는다.
 *
 * 값을 정하는 계산은 `cameraRig`에 있고 여기는 **조립**이다. three.js를
 * 아는 것은 여기까지다.
 */

import * as THREE from "three";

import { combatPressure } from "@/game/combat/combatLink";
import {
  CAMERA,
  CAMERA_COLLIDER_RADIUS,
  CAMERA_GROUND_CLEARANCE,
  CHARACTER_FADE,
  isVehicle,
  RUN_CAMERA,
  PLAYER_HEIGHT,
  type LocomotionMode,
} from "@/game/config/tuning";
import { damp, lerp } from "@/game/core/mathx";
import { fovPulse, FOV_PULSE_SECONDS } from "@/game/dokebi/discoveryEffect";
import { resolveHorizontalCollisions, type Aabb, type Vec3 } from "@/game/player/locomotion";
import {
  characterAlpha,
  findCameraDistance,
  followDistance,
  followFov,
  followHeight,
  lookAheadDistance,
  orbitDirection,
  speedRatio,
  stepFollowYaw,
  type CameraTuning,
} from "@/game/scene/cameraRig";
import { faceShot, FINISHER } from "@/game/scene/finisher";
import type { LookState } from "@/game/scene/lookControl";
import { surfaceHeight } from "@/game/world/sidewalks";

/** 프레임을 넘어 살아남는 카메라 상태 */
export interface CameraFrameState {
  /** 눅인 전투 압력. 날것으로 쓰면 카메라가 튄다 */
  combatEase: number;
  /** 도깨비를 처음 만났을 때의 시야각 펄스 경과(초). 없으면 null */
  discoveryPulseSeconds: number | null;
  /** 첫 프레임에 지연 없이 붙이기 위한 깃발 */
  initialized: boolean;
  position: THREE.Vector3;
  lookTarget: THREE.Vector3;
  /** 프레임마다 재사용하는 임시 벡터. 매번 만들면 GC가 튄다 */
  scratch: {
    direction: THREE.Vector3;
    playerHead: THREE.Vector3;
    desired: THREE.Vector3;
  };
}

export function createCameraFrame(): CameraFrameState {
  return {
    combatEase: 0,
    discoveryPulseSeconds: null,
    initialized: false,
    position: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    scratch: {
      direction: new THREE.Vector3(),
      playerHead: new THREE.Vector3(),
      desired: new THREE.Vector3(),
    },
  };
}

export interface CameraFrameInput {
  tuning: CameraTuning;
  position: Vec3;
  velocity: Vec3;
  facing: number;
  speed: number;
  mode: LocomotionMode;
  photoMode: boolean;
  /** 마무리 연출의 세기 0~1 */
  finish01: number;
  /** 착지 흔들림 진폭(m) */
  shake: number;
  colliders: readonly Aabb[];
  enemyBlips: Float32Array;
  enemyBlipCount: number;
  bossEngaged: boolean;
  /** 카메라가 가까울 때 캐릭터를 지우는 값. 셰이더가 읽는다 */
  characterFade: { value: number };
  dt: number;
}

/**
 * 카메라를 이번 프레임 자리로 옮긴다. **제자리에서 고친다.**
 */
export function recordCameraFrame(
  camera: THREE.Camera,
  state: CameraFrameState,
  look: LookState,
  input: CameraFrameInput,
): void {
  /* ---------------- 속도 연동 카메라 ---------------- */
  const speed01 = speedRatio(input.speed, CAMERA.fovSpeedReference);

  /*
   * 달리면 카메라가 진행 방향 뒤로 돌아온다.
   *
   * 포토 모드에서는 하지 않는다 — 구도를 잡는 중에 카메라가 스스로 움직이면
   * 사진을 찍을 수가 없다. 시뮬레이션이 멈춰 speed도 0이라 어차피 강도가
   * 0이지만, 의도를 코드에 남긴다.
   */
  if (!input.photoMode) {
    look.yaw = stepFollowYaw(
      look.yaw,
      input.facing,
      speed01,
      look.sinceLookSeconds,
      input.dt,
      RUN_CAMERA,
    );
  }
  state.combatEase = damp(state.combatEase, combatPressure(input.enemyBlips, input.enemyBlipCount, input.position.x, input.position.z, input.bossEngaged, CAMERA.combatRadius), CAMERA.followLambda, input.dt);
  const distance = followDistance(input.tuning, speed01, input.photoMode, look.photoDistance, state.combatEase, input.position.y, isVehicle(input.mode));
  const orbit = orbitDirection(look.yaw, look.pitch);

  state.scratch.direction.set(orbit.x, orbit.y, orbit.z).normalize();

  state.scratch.playerHead.set(
    input.position.x,
    input.position.y + followHeight(input.tuning, speed01, state.combatEase, input.position.y, isVehicle(input.mode)),
    input.position.z,
  );

  const allowedDistance = findCameraDistance(
    state.scratch.playerHead,
    state.scratch.direction,
    distance,
    input.colliders,
  );

  state.scratch.desired.copy(state.scratch.playerHead).addScaledVector(state.scratch.direction, allowedDistance);

  /*
   * 카메라가 언덕을 파고들지 않게 한다.
   *
   * 충돌체는 건물뿐이라 지형은 막아 주지 않는다. 내리막을 등지고 서면
   * 카메라가 뒤쪽 언덕 **속**으로 들어가 화면이 흙빛 한 장이 된다.
   * 지면 위 최소 높이만 지켜 준다 — 시선 방향은 그대로 두므로 구도가
   * 흔들리지 않는다.
   */
  const cameraGround = surfaceHeight(state.scratch.desired.x, state.scratch.desired.z) + CAMERA_GROUND_CLEARANCE;
  if (state.scratch.desired.y < cameraGround) state.scratch.desired.y = cameraGround;

  /*
   * 그래도 벽 안이면 밀어낸다.
   *
   * `findCameraDistance`는 카메라를 당겨 오지만 **최소 거리(1.4m)가 바닥**이라,
   * 벽에 바짝 붙어 서면 그 지점이 벽 안일 수 있다. 달리다 옛 마을 집에
   * 붙었더니 화면이 통째로 벽 내부가 됐다.
   *
   * 플레이어를 밀어내는 것과 **같은 함수**를 쓴다. 카메라만 따로 밀어내는
   * 식을 새로 쓰면 두 판정이 갈라지고, 그러면 플레이어는 못 들어가는 자리에
   * 카메라만 들어가는 자리가 생긴다.
   */
  const cleared = resolveHorizontalCollisions(state.scratch.desired, CAMERA_COLLIDER_RADIUS, input.colliders);
  state.scratch.desired.x = cleared.x;
  state.scratch.desired.z = cleared.z;

  /*
   * 마무리 연출 — 카메라를 아이 얼굴 앞으로 데려간다.
   *
   * 궤도 카메라를 끄고 갈아 끼우지 않는다. **섞는다** — 끄면 연출이
   * 시작·끝나는 두 프레임에 화면이 순간이동하고, 그 두 번이 연출 전체보다
   * 눈에 띈다. 벽 밀어내기·지면 여유는 이미 끝난 뒤라 클로즈업은 그것을
   * 통과할 수 있는데, 얼굴에서 1.5m는 캐릭터가 이미 차지한 자리라
   * 벽에 박힐 여지가 거의 없다.
   */
  if (input.finish01 > 0) {
    const shot = faceShot(
      input.position.x,
      input.position.y,
      input.position.z,
      input.facing,
    );
    state.scratch.desired.x = lerp(state.scratch.desired.x, shot.x, input.finish01);
    state.scratch.desired.y = lerp(state.scratch.desired.y, shot.y, input.finish01);
    state.scratch.desired.z = lerp(state.scratch.desired.z, shot.z, input.finish01);
  }

  if (!state.initialized || input.photoMode) {
    // 포토 모드에서는 지연 없이 붙어야 원하는 구도가 바로 잡힌다.
    state.position.copy(state.scratch.desired);
    state.initialized = true;
  } else {
    state.position.x = damp(
      state.position.x,
      state.scratch.desired.x,
      input.tuning.followLambda,
      input.dt,
    );
    state.position.y = damp(
      state.position.y,
      state.scratch.desired.y,
      input.tuning.followLambda,
      input.dt,
    );
    state.position.z = damp(
      state.position.z,
      state.scratch.desired.z,
      input.tuning.followLambda,
      input.dt,
    );
  }

  /*
   * 카메라가 가까우면 캐릭터를 지운다.
   *
   * 벽에서 밀려난 카메라는 플레이어 쪽으로 당겨져 화면이 **뒤통수로 가득
   * 찬다.** 카메라를 억지로 물리려다 한 번 실패했다(위로 올렸더니 벽면을
   * 정면으로 보게 됐다) — 위치를 옮기는 대신 **가리는 것을 지운다.**
   *
   * 실제로 그려진 자리(`cameraPosition`)로 잰다. 원하는 자리로 재면
   * 부드럽게 따라오는 동안 값이 어긋나 캐릭터가 깜빡인다.
   */
  input.characterFade.value = characterAlpha(
    state.position.distanceTo(state.scratch.playerHead),
    CHARACTER_FADE,
  );

  camera.position.copy(state.position);
  if (input.shake > 0.0005) {
    // 상하로만 흔든다. 좌우로 흔들면 진행 방향이 흔들려 멀미가 심해진다.
    camera.position.y += Math.sin(performance.now() * 0.06) * input.shake;
  }

  // 시선은 진행 방향으로 조금 앞서 나간다 — 빠를수록 더 멀리 본다.
  // 포토 모드에서는 시선 선행을 끈다 — 구도를 잡는데 시선이 미끄러지면 안 된다.
  const lookAhead = lookAheadDistance(input.tuning, speed01, input.photoMode);
  const forwardX = input.speed > 0.1 ? (input.velocity.x / input.speed) * lookAhead : 0;
  const forwardZ = input.speed > 0.1 ? (input.velocity.z / input.speed) * lookAhead : 0;
  state.lookTarget.set(
    input.position.x + forwardX,
    input.position.y + PLAYER_HEIGHT * 0.75,
    input.position.z + forwardZ,
  );
  /*
   * 시선도 같은 비율로 얼굴에 붙인다. 위치만 옮기면 얼굴 옆에 서서
   * 허공을 보게 된다 — 「얼굴이 보인다」가 성립하려면 둘이 같이 가야 한다.
   */
  if (input.finish01 > 0) {
    const eyeY = input.position.y + FINISHER.faceHeight;
    state.lookTarget.set(
      lerp(state.lookTarget.x, input.position.x, input.finish01),
      lerp(state.lookTarget.y, eyeY, input.finish01),
      lerp(state.lookTarget.z, input.position.z, input.finish01),
    );
  }
  camera.lookAt(state.lookTarget);

  const perspective = camera as THREE.PerspectiveCamera;
  /*
   * 포토 모드에서는 숨을 쉬지 않는다 — 구도를 잡는 중에 시야각이 흔들리면
   * 사진이 어긋난다.
   */
  if (state.discoveryPulseSeconds !== null) {
    state.discoveryPulseSeconds += input.dt;
    if (state.discoveryPulseSeconds >= FOV_PULSE_SECONDS) state.discoveryPulseSeconds = null;
  }
  const pulse =
    input.photoMode || state.discoveryPulseSeconds === null ? 0 : fovPulse(state.discoveryPulseSeconds);

  /*
   * 클로즈업에서는 화각을 좁힌다. 원근이 눌려 인물이 배경에서 떨어져
   * 나온다 — 달릴 때의 86도와 극단으로 갈리는 것이 이 연출의 절반이다.
   */
  const targetFov = lerp(
    followFov(input.tuning, speed01, input.photoMode, pulse),
    FINISHER.fovNarrow,
    input.finish01,
  );
  if (Math.abs(perspective.fov - targetFov) > 0.01) {
    perspective.fov = damp(perspective.fov, targetFov, 5.5, input.dt);
    perspective.updateProjectionMatrix();
  }
}
