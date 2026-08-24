/**
 * 플레이어 이동 계산 — 순수 함수.
 *
 * three.js나 React에 의존하지 않는다. 렌더러 없이 테스트할 수 있어야 한다는
 * 제약이, 결과적으로 이동 감각을 수치로 반복 조율할 수 있게 해준다.
 *
 * 좌표계: three.js 기본과 동일하게 y가 위, -z가 정면.
 */

import {
  AIR_CONTROL,
  AIR_JUMP_COUNT,
  AIR_JUMP_VELOCITY,
  COYOTE_TIME_SECONDS,
  GLIDE,
  GRAPPLE,
  GRAVITY,
  JUMP_BUFFER_SECONDS,
  JUMP_VELOCITY,
  LOCOMOTION,
  TURN_BRAKE,
  type LocomotionMode,
  type VehicleKind,
} from "@/game/config/tuning";
import { clamp, rotateToward, shortestAngleDelta } from "@/game/core/mathx";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LocomotionState {
  position: Vec3;
  /** 수평 속도는 x/z, 수직 속도는 y */
  velocity: Vec3;
  /** 캐릭터가 바라보는 방향(yaw). 진행 방향과 분리해 두면 정지 시 방향이 튀지 않는다 */
  facing: number;
  grounded: boolean;
  /** 지면을 떠난 뒤 남은 점프 유예 시간 */
  coyoteRemaining: number;
  /** 미리 눌린 점프 입력의 남은 유효 시간 */
  jumpBufferRemaining: number;
  /**
   * 이번 스텝에서 착지한 경우의 충돌 속도(m/s). 착지하지 않았으면 0.
   * 카메라가 이 값을 읽어 흔들림 세기를 정하고, 읽은 쪽에서 소비한다.
   */
  landingImpact: number;
  /** 지면을 떠난 뒤 사용한 추가 점프 횟수. 착지하면 0으로 돌아간다 */
  airJumpsUsed: number;
  /** 이번 프레임에 활강 중인지. 렌더와 사운드가 읽는다 */
  gliding: boolean;
  /** 걸려 있는 그래플 지점. 없으면 null */
  grapple: GrappleAnchor | null;
  /** 그래플을 잡고 있은 시간(초) */
  grappleHeldSeconds: number;
  /** 다시 걸 수 있을 때까지 남은 시간(초) */
  grappleCooldown: number;
}

/** 그래플을 걸 수 있는 지점. 가로등 꼭대기와 전깃줄이 후보다 */
export interface GrappleAnchor {
  x: number;
  y: number;
  z: number;
}

export interface MoveInput {
  /** 카메라 기준 좌우 (-1..1) */
  moveX: number;
  /** 카메라 기준 전후 (-1..1, +1이 전진) */
  moveZ: number;
  jump: boolean;
  /** 점프 키를 누르고 있는지. 활강 판정에 쓴다 */
  jumpHeld: boolean;
  /** 이번 프레임에 그래플이 요청됐는지 */
  grappleRequested: boolean;
  run: boolean;
  /** 타고 있는 것. 두 발로 다니면 null */
  vehicle: VehicleKind | null;
  /** 카메라의 yaw. 입력을 월드 방향으로 바꾸는 기준이 된다 */
  cameraYaw: number;
  /**
   * 이동 속도 배율. 자판기 음료 같은 일시 효과가 올린다.
   *
   * 없으면 1로 본다 — 이 필드를 모르는 기존 호출부의 동작을 바꾸지 않는다.
   */
  speedScale?: number;
}

export function createLocomotionState(position: Vec3): LocomotionState {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    grounded: true,
    coyoteRemaining: 0,
    jumpBufferRemaining: 0,
    landingImpact: 0,
    airJumpsUsed: 0,
    gliding: false,
    grapple: null,
    grappleHeldSeconds: 0,
    grappleCooldown: 0,
  };
}

/**
 * 정면 원뿔 안에서 가장 가까운 그래플 지점을 찾는다.
 *
 * 거리만으로 고르면 등 뒤나 옆의 기둥이 잡혀 방향이 튄다. 화면이 향한 쪽만
 * 후보로 두어야 "저기 걸겠다"는 의도와 결과가 일치한다.
 */
export function findGrappleTarget(
  position: Vec3,
  facing: number,
  anchors: readonly GrappleAnchor[],
): GrappleAnchor | null {
  let best: GrappleAnchor | null = null;
  let bestDistance = Infinity;

  for (const anchor of anchors) {
    const dx = anchor.x - position.x;
    const dz = anchor.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < GRAPPLE.minRange || distance > GRAPPLE.maxRange) continue;
    // 아래쪽 지점은 걸어도 의미가 없다 — 끌려가며 땅에 박힌다.
    if (anchor.y <= position.y + 1) continue;

    let delta = Math.atan2(dx, dz) - facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) > GRAPPLE.maxAngle) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = anchor;
    }
  }
  return best;
}

/**
 * 진행 방향과 입력 방향이 벌어졌을 때 목표 속도에 걸리는 배율(0~1).
 *
 * 이것이 없으면 정반대를 눌러도 최고 속도가 유지되어, 몸이 도는 동안 크게
 * 밀려난다 — 화면에서는 "돌지 않고 뒤로 간다"로 보인다 (TURN_BRAKE 주석).
 *
 * 각도만 받는다. 탈것 종류를 모르는 편이 낫다 — 종류마다 다른 것은 각속도고,
 * 그 차이는 이 배율과 곱해져 저절로 반영된다.
 */
export function turnBrakeScale(angleDifference: number): number {
  const excess = Math.abs(angleDifference) - TURN_BRAKE.startAngle;
  if (excess <= 0) return 1;

  const span = Math.PI - TURN_BRAKE.startAngle;
  const t = Math.min(1, excess / span);
  return 1 - (1 - TURN_BRAKE.minScale) * t;
}

export function resolveMode(input: MoveInput): LocomotionMode {
  // 타고 있으면 그 탈것이 곧 모드다 — 종류마다 수치가 다르다
  if (input.vehicle) return input.vehicle;
  if (input.run) return "run";
  return "walk";
}

export function horizontalSpeed(velocity: Vec3): number {
  return Math.hypot(velocity.x, velocity.z);
}

/**
 * 한 프레임의 이동을 계산한다.
 *
 * 입력 상태를 변경하지 않고 새 상태를 돌려준다 (coding-style: 불변성).
 * dt는 호출자가 미리 상한을 걸어 전달한다 — 탭 복귀 직후의 거대한 dt로
 * 플레이어가 벽을 통과하는 것을 막기 위함이다.
 */
export function stepLocomotion(
  state: LocomotionState,
  input: MoveInput,
  dt: number,
  groundHeight: number,
  anchors: readonly GrappleAnchor[] = [],
): LocomotionState {
  /*
   * 그래플이 걸려 있으면 일반 이동 계산을 건너뛴다.
   *
   * 중력·가속·마찰을 그대로 두고 당기는 힘만 더하면 값들이 서로 싸워서
   * 튜닝이 불가능해진다. 끌려가는 동안은 별도의 규칙을 쓰는 편이 예측 가능하다.
   */
  const grappleStep = stepGrapple(state, input, dt, anchors);
  if (grappleStep) return grappleStep;

  const mode = resolveMode(input);
  const tuning = LOCOMOTION[mode];

  // 입력을 월드 방향으로 변환. 카메라 yaw 기준이라 화면에서 본 대로 움직인다.
  const inputMagnitude = clamp(Math.hypot(input.moveX, input.moveZ), 0, 1);
  const sin = Math.sin(input.cameraYaw);
  const cos = Math.cos(input.cameraYaw);
  /*
   * 카메라는 플레이어 기준 (sin yaw, cos yaw) 방향에 놓인다(GameScene 참조).
   * 따라서 화면상 "앞"은 그 반대인 -(sin yaw, cos yaw)이고,
   * 오른쪽은 (cos yaw, -sin yaw)다.
   *
   *   world = moveX * (cos, -sin) + moveZ * (-sin, -cos)
   *
   * z 성분의 부호를 빠뜨리면 W가 카메라 쪽으로 다가온다. 실제로 겪은 버그다.
   */
  const worldX = input.moveX * cos - input.moveZ * sin;
  const worldZ = -(input.moveX * sin + input.moveZ * cos);

  /*
   * 활강 판정.
   *
   * 상승 중에는 걸리지 않는다 — 점프하자마자 활강이 시작되면 점프가 뜨는
   * 느낌을 잃는다. 충분히 떨어지기 시작한 뒤부터 점프 키를 잡고 있으면 켜진다.
   */
  const gliding =
    !state.grounded && input.jumpHeld && state.velocity.y < -GLIDE.minFallSpeed;

  const airFactor = state.grounded ? 1 : AIR_CONTROL * (gliding ? GLIDE.airControlScale : 1);
  let speed = horizontalSpeed(state.velocity);
  // 속도가 거의 0이면 진행 방향을 알 수 없으므로 바라보는 방향을 기준으로 삼는다.
  let heading = speed > 0.05 ? Math.atan2(state.velocity.x, state.velocity.z) : state.facing;

  if (inputMagnitude > 0.001) {
    const desiredHeading = Math.atan2(worldX, worldZ);
    /*
     * 감속 판정은 **회전하기 전** 방향으로 잰다. 회전 뒤 값으로 재면 이번
     * 프레임에 이미 좁혀진 각도가 나와, 빠른 탈것일수록 브레이크가 덜 걸린다.
     */
    const turnAway = Math.abs(shortestAngleDelta(heading, desiredHeading));
    const brakeScale = turnBrakeScale(turnAway);
    /*
     * 브레이크가 걸린 만큼 제자리 선회도 빨라진다.
     *
     * 순서가 중요하다 — 감속 배율을 **회전보다 먼저** 구해야 이번 프레임의
     * 회전에 그 값을 쓸 수 있다. 뒤에 두면 한 프레임 늦게 반영된다.
     */
    const brakeStrength = (1 - brakeScale) / (1 - TURN_BRAKE.minScale);
    /*
     * 각도가 아니라 **속도**를 기준으로 올린다.
     *
     * 처음에는 꺾인 각도에 비례해 올렸다. 그런데 도는 동안 각도가 저절로
     * 좁아져서 부스트도 같이 사라진다 — 반전의 후반부가 다시 느려져 보드가
     * 0.88초를 미끄러졌다.
     *
     * 속도 기준이면 그런 일이 없다. 브레이크가 속도를 떨어뜨리면 그만큼 계속
     * 빨리 돌고, 다 돌아 속도가 붙으면 저절로 원래 둔함으로 돌아온다.
     * 실제로도 그렇다 — 서 있는 자전거는 핸들이 자유롭고 달리는 자전거는 아니다.
     */
    const speedRatio = Math.min(1, speed / tuning.maxSpeed);
    const turnRate = tuning.turnRate * (1 + TURN_BRAKE.pivotBoost * (1 - speedRatio));
    heading = rotateToward(heading, desiredHeading, turnRate * airFactor * dt);

    // 배율은 목표 속도에만 건다. 가속도까지 올리면 조작감이 통째로 달라진다.
    const targetSpeed = tuning.maxSpeed * inputMagnitude * (input.speedScale ?? 1) * brakeScale;

    /*
     * 꺾어서 느려질 때는 탈것의 감속도 대신 제동력을 쓴다.
     *
     * 꺾지 않을 때(brakeStrength 0)는 탈것의 감속도 그대로다 — 속도 배율이
     * 내려가서 목표가 낮아진 경우까지 세게 세우면 안 된다.
     */
    const slowdown = Math.max(tuning.decel, TURN_BRAKE.decel * brakeStrength);

    /*
     * 목표보다 빠르면 **감속도로** 줄인다.
     *
     * 예전에는 `Math.min(speed + accel*dt, target)`이라 목표가 낮아지는 순간
     * 속도가 그 값으로 즉시 떨어졌다 — 시속 65km로 달리다 방향을 꺾으면 한
     * 프레임 만에 멈춘 것처럼 보인다. 크게 꺾을 때 목표 속도를 낮추는 지금은
     * 그 경로를 매번 지나므로 반드시 이어져야 한다.
     */
    speed =
      speed > targetSpeed
        ? Math.max(targetSpeed, speed - slowdown * airFactor * dt)
        : Math.min(speed + tuning.accel * airFactor * dt, targetSpeed);
  } else {
    speed = Math.max(0, speed - tuning.decel * airFactor * dt);
  }

  const gravity = gliding ? GRAVITY * GLIDE.gravityScale : GRAVITY;
  const velocity: Vec3 = {
    x: Math.sin(heading) * speed,
    y: state.velocity.y - gravity * dt,
    z: Math.cos(heading) * speed,
  };

  // 활강 중에는 하강 속도에 상한을 둔다. 중력만 줄이면 오래 떨어질수록 결국 빨라진다.
  if (gliding && velocity.y < -GLIDE.maxFallSpeed) {
    velocity.y = -GLIDE.maxFallSpeed;
  }

  // 점프 버퍼와 코요테 타임을 먼저 갱신한 뒤 점프 가능 여부를 판정한다.
  let jumpBufferRemaining = input.jump
    ? JUMP_BUFFER_SECONDS
    : Math.max(0, state.jumpBufferRemaining - dt);
  let coyoteRemaining = state.grounded
    ? COYOTE_TIME_SECONDS
    : Math.max(0, state.coyoteRemaining - dt);

  let airJumpsUsed = state.grounded ? 0 : state.airJumpsUsed;

  if (jumpBufferRemaining > 0 && coyoteRemaining > 0) {
    velocity.y = JUMP_VELOCITY;
    jumpBufferRemaining = 0;
    coyoteRemaining = 0;
  } else if (jumpBufferRemaining > 0 && airJumpsUsed < AIR_JUMP_COUNT) {
    /*
     * 이단 점프.
     *
     * 하강 속도를 남겨 두지 않고 새 속도로 덮어쓴다. 그래야 얼마나 떨어지던
     * 중이었든 같은 높이만큼 다시 올라가 예측이 가능하다.
     */
    velocity.y = AIR_JUMP_VELOCITY;
    airJumpsUsed += 1;
    jumpBufferRemaining = 0;
  }

  const position: Vec3 = {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
    z: state.position.z + velocity.z * dt,
  };

  let grounded = false;
  let landingImpact = 0;
  if (position.y <= groundHeight) {
    // 하강 중에 지면을 만난 경우에만 착지로 본다. 상승 중이면 점프 직후다.
    if (velocity.y < 0) {
      landingImpact = state.grounded ? 0 : -velocity.y;
    }
    position.y = groundHeight;
    velocity.y = 0;
    grounded = true;
  }

  return {
    position,
    velocity,
    facing: speed > 0.05 ? heading : state.facing,
    grounded,
    coyoteRemaining: grounded ? COYOTE_TIME_SECONDS : coyoteRemaining,
    jumpBufferRemaining,
    landingImpact,
    airJumpsUsed: grounded ? 0 : airJumpsUsed,
    // 착지하는 순간의 활강은 의미가 없다. 렌더가 착지 자세와 겹쳐 보이지 않게 한다.
    gliding: gliding && !grounded,
    grapple: null,
    grappleHeldSeconds: 0,
    grappleCooldown: Math.max(0, state.grappleCooldown - dt),
  };
}

/**
 * 그래플 한 프레임.
 *
 * 걸려 있지 않고 요청도 없으면 null을 돌려 일반 이동에 맡긴다.
 * 걸려 있는 동안은 중력을 무시하고 지점 쪽으로 일정 속도로 끌려간다.
 */
function stepGrapple(
  state: LocomotionState,
  input: MoveInput,
  dt: number,
  anchors: readonly GrappleAnchor[],
): LocomotionState | null {
  // 새로 거는 경우
  if (!state.grapple) {
    if (!input.grappleRequested || state.grappleCooldown > 0) return null;
    const target = findGrappleTarget(state.position, state.facing, anchors);
    if (!target) return null;
    return {
      ...state,
      grapple: target,
      grappleHeldSeconds: 0,
      gliding: false,
      grounded: false,
      landingImpact: 0,
    };
  }

  const anchor = state.grapple;
  const dx = anchor.x - state.position.x;
  const dy = anchor.y - state.position.y;
  const dz = anchor.z - state.position.z;
  const distance = Math.hypot(dx, dy, dz);
  const held = state.grappleHeldSeconds + dt;

  // 도착했거나, 점프로 취소했거나, 안전장치 시간을 넘겼으면 놓는다.
  const release =
    distance <= GRAPPLE.arriveDistance || input.jump || held >= GRAPPLE.maxHoldSeconds;

  if (release) {
    // 놓는 순간의 속도를 유지하고 살짝 키운다 — 여기서 탄력이 나온다.
    return {
      ...state,
      velocity: {
        x: state.velocity.x * GRAPPLE.releaseBoost,
        y: state.velocity.y * GRAPPLE.releaseBoost,
        z: state.velocity.z * GRAPPLE.releaseBoost,
      },
      grapple: null,
      grappleHeldSeconds: 0,
      grappleCooldown: GRAPPLE.cooldownSeconds,
      grounded: false,
      landingImpact: 0,
    };
  }

  const velocity: Vec3 = {
    x: (dx / distance) * GRAPPLE.pullSpeed,
    y: (dy / distance) * GRAPPLE.pullSpeed,
    z: (dz / distance) * GRAPPLE.pullSpeed,
  };

  return {
    ...state,
    position: {
      x: state.position.x + velocity.x * dt,
      y: state.position.y + velocity.y * dt,
      z: state.position.z + velocity.z * dt,
    },
    velocity,
    // 끌려가는 방향을 본다.
    facing: Math.atan2(velocity.x, velocity.z),
    grounded: false,
    gliding: false,
    landingImpact: 0,
    grappleHeldSeconds: held,
    grappleCooldown: 0,
    airJumpsUsed: 0,
  };
}

/* ------------------------------------------------------------------ */
/* 충돌                                                                 */
/* ------------------------------------------------------------------ */

/** 축 정렬 사각기둥. top은 옥상 위를 지나갈 때 통과 판정에 쓴다. */
export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

/**
 * 원(반지름 radius)과 AABB 목록의 수평 충돌을 해소한다.
 *
 * 침투가 가장 얕은 축으로 밀어내는 방식이라 모서리에서 미세하게 미끄러지지만,
 * 블록아웃 검증 단계에서는 물리 엔진을 넣는 것보다 이 쪽이 가볍고 예측 가능하다.
 * Rapier 도입은 경사·탑승·래그돌이 필요해지는 시점으로 미룬다 (YAGNI).
 */
export function resolveHorizontalCollisions(
  position: Vec3,
  radius: number,
  boxes: readonly Aabb[],
): Vec3 {
  let { x, z } = position;

  for (const box of boxes) {
    if (position.y >= box.top) continue;

    const closestX = clamp(x, box.minX, box.maxX);
    const closestZ = clamp(z, box.minZ, box.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    const distanceSquared = dx * dx + dz * dz;

    if (distanceSquared >= radius * radius) continue;

    if (distanceSquared > 1e-8) {
      // 상자 바깥(모서리 포함)에 있는 경우 — 가장 가까운 점에서 밀어낸다.
      const distance = Math.sqrt(distanceSquared);
      const push = radius - distance;
      x += (dx / distance) * push;
      z += (dz / distance) * push;
      continue;
    }

    // 중심이 상자 안에 들어간 경우 — 가장 가까운 면으로 빼낸다.
    const toLeft = x - box.minX;
    const toRight = box.maxX - x;
    const toBack = z - box.minZ;
    const toFront = box.maxZ - z;
    const minimum = Math.min(toLeft, toRight, toBack, toFront);

    if (minimum === toLeft) x = box.minX - radius;
    else if (minimum === toRight) x = box.maxX + radius;
    else if (minimum === toBack) z = box.minZ - radius;
    else z = box.maxZ + radius;
  }

  return { x, y: position.y, z };
}

/* ------------------------------------------------------------------ */
/* 지면 정착                                                            */
/* ------------------------------------------------------------------ */

/**
 * 걷는 중에 지면을 놓치지 않고 따라 내려가는 최대 낙차(m).
 *
 * 인도 연석이 16cm다. 그보다 넉넉해야 연석을 내려설 때마다 공중 판정이
 * 되지 않는다. 대신 너무 키우면 **일부러 뛰어내린 턱에서도 발이 붙어**
 * 내려가는 느낌이 사라진다.
 */
const GROUND_SNAP_BASE = 0.24;

/**
 * 속도에 비례해 늘어나는 몫.
 *
 * 낙차는 「그 프레임에 지나간 수평 거리 × 비탈 기울기」다. 기울기 상한은
 * 지형 세 겹을 합쳐 0.14 남짓이고, 여기에 여유 배수를 곱한다. 고정값
 * 하나로 두면 걷기에 맞춘 값이 자전거 속도에서 모자라고(내리막마다 뜬다),
 * 자전거에 맞춘 값은 걷기에서 과하다(턱에서 안 떨어진다).
 */
const GROUND_SNAP_PER_METER = 0.75;

/**
 * 이동이 **끝난 자리**에서 지면을 다시 재고 발을 붙인다.
 *
 * `stepLocomotion`은 이동 전 위치의 지면 높이를 받는다. 한 프레임 어긋나는
 * 정도는 걸음 속도에서 몇 cm라 눈에 띄지 않지만, 두 가지가 겹치면 화면에서
 * 곧바로 보인다:
 *
 *   - 수평 충돌 보정이 몸을 **옆으로 더 밀어낸다.** 밀려간 자리가 언덕
 *     비탈이면 그 자리의 지면은 완전히 다른 높이다 — 벽에 붙어 걷다가
 *     지형 속으로 들어가던 것이 이것이다.
 *   - 탈것 속도(18m/s)에서는 한 프레임에 0.6m를 지나간다. 오르막이면 그만큼
 *     묻히고, 내리막이면 그만큼 떠서 **매 프레임 뜨고 착지하기를 반복한다.**
 *     발소리가 연달아 터지고 카메라가 계속 흔들린다.
 *
 * 그래서 「끌어올리기」와 「따라 내려가기」를 나눠 다룬다. 끌어올리기는 조건이
 * 없다 — 땅속은 어떤 경우에도 있으면 안 되는 자리다. 따라 내려가기는 **직전에
 * 땅에 붙어 있었고 내려가는 중일 때만** 한다. 그러지 않으면 점프한 순간 다시
 * 끌어내려지고, 낙하 중에 지붕을 스칠 때 공중에서 멈춘다.
 */
export function settleOnGround(
  state: LocomotionState,
  /** **이동이 끝난 자리**에서 잰 발밑 높이(m) */
  groundHeight: number,
  /** 이번 프레임 시작 시점에 땅에 붙어 있었는가 */
  wasGrounded: boolean,
  dt: number,
): LocomotionState {
  const gap = state.position.y - groundHeight;

  // 땅속 — 조건 없이 끌어올린다.
  if (gap <= 0) {
    const impact = !wasGrounded && state.velocity.y < 0 ? -state.velocity.y : 0;
    return {
      ...state,
      position: { ...state.position, y: groundHeight },
      velocity: { ...state.velocity, y: 0 },
      grounded: true,
      coyoteRemaining: COYOTE_TIME_SECONDS,
      airJumpsUsed: 0,
      gliding: false,
      landingImpact: Math.max(state.landingImpact, impact),
    };
  }

  /*
   * 발이 땅에서 떨어졌다.
   *
   * `grounded`를 반드시 내려야 한다 — 앞 단계가 켜 둔 값을 그대로 두면
   * **허공에 서서 걷는 자세**가 나오고, 코요테 타임이 끝나지 않아 공중에서
   * 계속 점프할 수 있다.
   */
  const airborne: LocomotionState = { ...state, grounded: false };

  // 이미 떠 있던 몸은 붙잡지 않는다. 올라가는 중이어도 마찬가지다.
  if (!wasGrounded || state.velocity.y > 0) return airborne;

  const horizontal = Math.hypot(state.velocity.x, state.velocity.z);
  const snap = GROUND_SNAP_BASE + horizontal * dt * GROUND_SNAP_PER_METER;
  if (gap > snap) return airborne;

  /*
   * 비탈을 따라 내려간다.
   *
   * 착지 충격을 새로 만들지 않는다 — 땅에서 떨어진 적이 없다. 여기서
   * 충격을 넣으면 내리막을 달리는 내내 카메라가 흔들린다.
   */
  return {
    ...state,
    position: { ...state.position, y: groundHeight },
    velocity: { ...state.velocity, y: 0 },
    grounded: true,
    coyoteRemaining: COYOTE_TIME_SECONDS,
    airJumpsUsed: 0,
    gliding: false,
  };
}

/** 월드 경계 밖으로 나가지 못하게 가둔다. */
export function clampToBounds(position: Vec3, halfExtent: number, radius: number): Vec3 {
  const limit = halfExtent - radius;
  return {
    x: clamp(position.x, -limit, limit),
    y: position.y,
    z: clamp(position.z, -limit, limit),
  };
}

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
): void {
  view.speed = speed;
  view.mode = mode;
  view.grounded = state.grounded;
  view.gliding = state.gliding;
  view.landingImpact = state.landingImpact;
  view.x = state.position.x;
  view.z = state.position.z;
  view.facing = state.facing;
}
