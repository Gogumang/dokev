/**
 * 도깨비 동료 — 추적 로직 (순수 함수).
 *
 * TRAILER_FEATURE_ANALYSIS 3.5절: 도깨비는 도감 속 수집물이 아니라 월드에서
 * 함께 움직이는 동료다. 그래서 첫 도깨비에 필요한 것은 카드 UI가 아니라
 * **옆에 붙어 다니는 움직임**이다.
 *
 * three.js와 React에 의존하지 않는다. 렌더러 없이 테스트할 수 있어야 한다.
 */

import { clamp, damp, lerp, rotateToward } from "@/game/core/mathx";
import type { Vec3 } from "@/game/player/locomotion";

/**
 * 첫 도깨비 「초롱」.
 *
 * 전통 도깨비의 뿔 달린 형상을 따라가지 않는다 (TRAILER 2절). 기능을 먼저
 * 정하고 실루엣을 붙였다 — 탐색을 돕는 지원형이므로 등불과 부적을 섞은,
 * 작고 둥글며 떠 있는 형태다. 어두운 골목에서 눈에 띄어야 하므로 스스로 빛난다.
 */
export const CHORONG = {
  name: "초롱",
  /** 한 줄 소개 — 도감과 대화에서 재사용한다 */
  tagline: "골목을 밝히며 앞서 가는 작은 불빛",
  personality: "호기심이 많고 성급하다. 플레이어가 멈추면 먼저 두리번거린다.",
  ability: "주변에 숨은 흔적을 잠깐 빛나게 한다",
  /** 몸통 기본 색 */
  bodyColor: "#ffd27a",
  /** 고리와 꼬리 불꽃 색 */
  accentColor: "#2fd4c4",
} as const;

export const COMPANION_TUNING = {
  /** 플레이어 뒤·옆으로 떨어져 있는 기본 거리 */
  followDistance: 2.1,
  /** 플레이어 기준 옆으로 비껴 있는 각도(rad). 정확히 뒤에 있으면 카메라에 가린다 */
  sideAngle: 0.85,
  /** 기본 높이 */
  hoverHeight: 1.7,
  /** 목표 지점을 따라잡는 속도. 낮을수록 뒤늦게 따라와 생물처럼 보인다 */
  followLambda: 3.4,
  /** 유지 가능한 최고 속도. 플레이어 보드 최고속(15.5)보다 빨라야 따라잡는다 */
  maxSpeed: 19,
  /** 이 거리 이상 벌어지면 순간이동으로 복구한다 */
  teleportDistance: 42,
  /** 위아래로 떠다니는 진폭(m) */
  bobAmplitude: 0.16,
  /** 떠다니는 주기(초) */
  bobPeriod: 2.3,
  /** 정지 상태에서 플레이어 주위를 도는 각속도(rad/s) */
  idleOrbitRate: 0.45,
  /** 이 속도 이상이면 "달리는 중"으로 보고 뒤로 처지며 기울어진다 */
  runSpeedReference: 7.4,
  /** 최고 속도에서 추가로 벌어지는 거리 */
  trailDistanceBonus: 1.5,
  /** 최고 속도에서 앞으로 기우는 각도(rad) */
  maxLean: 0.5,
  /** 방향 전환 각속도 */
  turnRate: 7,

  /* --- 여럿이 따라다닐 때의 자리 --- */
  /**
   * 뒤 자리로 갈수록 벌어지는 각도(rad).
   *
   * 실루엣 폭(고리 지름 약 1.13m)을 `followDistance`에서 본 호의 길이로
   * 넘겨야 둘로 보인다. 0.35였을 때는 1.02m라 고리가 겹쳤다.
   */
  slotAngleStep: 0.5,
  /** 뒤 자리로 갈수록 멀어지는 거리(m). 각도만 벌리면 부채꼴로 늘어선다 */
  slotDistanceStep: 0.6,

  /* --- 소환·해제 --- */
  /** 나타나고 사라지는 데 걸리는 시간(초). 즉시 사라지면 버그처럼 보인다 */
  fadeSeconds: 0.35,

  /* --- 능력 「반딧불」 --- */
  /** 능력 지속 시간(초) */
  abilitySeconds: 4,
  /** 재사용 대기(초). 없으면 계속 켜 두게 되어 능력이 아니라 기본 상태가 된다 */
  abilityCooldownSeconds: 8,
  /** 능력 중 빛의 배율 */
  abilityLightScale: 3.2,
} as const;

/** 감정 표현. 렌더가 이 값으로 표정과 자세를 고른다. */
export type CompanionMood = "idle" | "follow" | "rush" | "airborne";

export interface CompanionState {
  position: Vec3;
  velocity: Vec3;
  /** 바라보는 방향(yaw) */
  facing: number;
  /** 떠다니는 위상. 시간에 비례해 진행한다 */
  bobPhase: number;
  /** 정지 시 플레이어 주위를 도는 각도 */
  orbitAngle: number;
  mood: CompanionMood;
  /** 속도에 따라 앞으로 기우는 정도(rad) */
  lean: number;
  /**
   * 존재감 0~1. 소환되면 1로, 해제되면 0으로 부드럽게 간다.
   * 렌더가 크기와 빛에 곱해 쓴다 — 즉시 사라지면 버그처럼 보인다.
   */
  presence: number;
  /** 능력이 켜져 있는 남은 시간(초). 0이면 꺼짐 */
  abilityRemaining: number;
  /** 재사용까지 남은 시간(초). 0이면 사용 가능 */
  abilityCooldown: number;
  /** 마지막으로 반응한 요청 번호 */
  seenAbilityRequest: number;
}

/** 동료가 참조하는 플레이어 상태. GameScene이 매 프레임 채워 넣는다. */
/**
 * 플레이어가 동료에게 내리는 명령.
 *
 * 소환 여부는 유지 상태(토글), 능력은 눌림 이벤트다. 능력을 유지 상태로 두면
 * 키를 누르고 있는 동안 재발동이 반복된다.
 */
export interface CompanionCommand {
  summoned: boolean;
  /** 이번 프레임에 능력이 요청됐는지. 읽는 쪽이 소비한다 */
  /**
   * 능력 요청 횟수. 누를 때마다 1씩 는다.
   *
   * 불리언 플래그였을 때는 **먼저 그려진 동료 하나가 소비**해 버려, 여럿이
   * 따라다니면 나머지는 능력을 쓰지 못했다. 카운터는 모두가 같은 요청을
   * 정확히 한 번씩 볼 수 있다.
   */
  abilityRequests: number;
}

export interface CompanionTarget {
  position: Vec3;
  /** 수평 속도(m/s) */
  speed: number;
  /** 진행 방향(yaw) */
  facing: number;
  grounded: boolean;
}

export function createCompanionState(
  playerPosition: Vec3,
  /**
   * 몇 번째 자리인가.
   *
   * 없으면 0번 자리에서 시작한다 — 예전에는 **자리와 무관하게 늘 0번**이었고,
   * 그래서 동료가 둘 이상이면 한 점에 쌓인 채 시작해 첫 1초 동안 흩어졌다.
   * `?see=party`가 「자리 배치」를 보러 가는 지점인데 정작 그 배치가 없었다.
   */
  slot = 0,
  formationScale = 1,
): CompanionState {
  const angle = slotAngle(slot);
  const distance = slotDistance(slot) * formationScale;
  return {
    position: {
      x: playerPosition.x - Math.sin(angle) * distance,
      y: playerPosition.y + COMPANION_TUNING.hoverHeight,
      z: playerPosition.z - Math.cos(angle) * distance,
    },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    bobPhase: 0,
    /*
     * 궤도 각도도 자리에서 시작한다.
     *
     * 0으로 두면 **제자리에 서 있는 동안 넷이 한 점으로 모였다** — 멈춰
     * 있을 때의 목표는 이 각도 하나로만 정해지는데 모두 같은 값에서 같은
     * 속도로 돌았기 때문이다(자리 0과 1은 거리까지 같아 정확히 겹쳤다).
     * 각도 차는 회전 중에도 보존되므로 시작값만 벌려 주면 된다.
     *
     * `PI`를 더하는 것은 두 식의 기준이 반대라서다 — 위 좌표는 플레이어에서
     * **빼고**, 목표는 **더한다**. 맞추지 않으면 시작하자마자 넷이 반 바퀴를
     * 돌아 반대편으로 넘어가고, 그 도중에 서로 스쳐 한 덩어리로 보인다.
     */
    orbitAngle: Math.PI + angle,
    mood: "idle",
    lean: 0,
    // 처음에는 이미 소환된 상태로 시작한다 — 빈 화면에서 시작하면 존재를 모른다.
    presence: 1,
    abilityRemaining: 0,
    abilityCooldown: 0,
    seenAbilityRequest: 0,
  };
}

function resolveMood(target: CompanionTarget): CompanionMood {
  if (!target.grounded) return "airborne";
  if (target.speed > COMPANION_TUNING.runSpeedReference) return "rush";
  if (target.speed > 0.4) return "follow";
  return "idle";
}

/**
 * 동료가 있어야 할 지점을 구한다.
 *
 * 정지 중에는 플레이어 주위를 천천히 돌고, 움직일 때는 진행 방향 뒤·옆에 붙는다.
 * 빠를수록 더 뒤로 처지게 두는데, 이것이 "따라오느라 애쓰는" 인상을 만든다.
 * 항상 같은 거리를 유지하면 끈에 매달린 물체처럼 보인다.
 */
/**
 * 자리 번호에 따른 각도 오프셋.
 *
 * 홀수 번호는 반대편으로 보낸다 — 같은 쪽에 줄 세우면 뒤쪽 동료가 앞
 * 동료에 완전히 가린다.
 */
/**
 * 쉬는 동안 공전만으로 나는 속도(m/s).
 *
 * 가장 가까운 자리 기준이다 — 뒤쪽 자리는 더 멀어 더 빠르지만, 「멈춰 있다」의
 * 기준은 가장 안쪽이 정하는 편이 안전하다(문턱이 낮아야 갈래가 살아 있다).
 */
const IDLE_ORBIT_SPEED = COMPANION_TUNING.idleOrbitRate * COMPANION_TUNING.followDistance;

export function slotAngle(slot: number): number {
  const sign = slot % 2 === 0 ? 1 : -1;
  return (
    COMPANION_TUNING.sideAngle * sign + Math.floor(slot / 2) * COMPANION_TUNING.slotAngleStep * sign
  );
}

/**
 * 자리 번호에 따른 기본 거리.
 *
 * 각도와 짝이다 — 한쪽만 쓰면 자리가 어긋난다. 실제로 시작 위치가 각도만
 * 쓰고 거리를 빼먹어, 첫 프레임에 앞뒤로 밀려나는 움직임이 있었다.
 */
function slotDistance(slot: number): number {
  return COMPANION_TUNING.followDistance + Math.floor(slot / 2) * COMPANION_TUNING.slotDistanceStep;
}

export function companionFormationScale(viewportWidth: number): number {
  const compact = 0.35;
  const progress = clamp((viewportWidth - 360) / (900 - 360), 0, 1);
  return lerp(compact, 1, progress);
}

function desiredPosition(
  state: CompanionState,
  target: CompanionTarget,
  slot: number,
  formationScale: number,
): Vec3 {
  const speedRatio = clamp(target.speed / COMPANION_TUNING.runSpeedReference, 0, 1);
  // 뒤 자리일수록 조금 더 멀리 선다. 같은 거리면 옆으로만 벌어져 줄처럼 보인다.
  const distance =
    (slotDistance(slot) + COMPANION_TUNING.trailDistanceBonus * speedRatio) * formationScale;

  // 정지 중에는 궤도 각도를, 움직일 때는 진행 방향 기준 각도를 쓴다.
  const angle =
    state.mood === "idle" ? state.orbitAngle : target.facing + Math.PI + slotAngle(slot);

  return {
    x: target.position.x + Math.sin(angle) * distance,
    y: target.position.y + COMPANION_TUNING.hoverHeight,
    z: target.position.z + Math.cos(angle) * distance,
  };
}

/**
 * 한 프레임의 동료 이동을 계산한다.
 *
 * 입력 상태를 바꾸지 않고 새 상태를 돌려준다 (coding-style: 불변성).
 */
/** 능력의 시간 규칙. 도깨비마다 다르다 */
export interface AbilityTiming {
  durationSeconds: number;
  cooldownSeconds: number;
}

/** 기본 시간 — 도깨비를 넘기지 않는 호출부(기존 테스트 등)가 쓴다 */
const DEFAULT_ABILITY_TIMING: AbilityTiming = {
  durationSeconds: COMPANION_TUNING.abilitySeconds,
  cooldownSeconds: COMPANION_TUNING.abilityCooldownSeconds,
};

export function stepCompanion(
  state: CompanionState,
  target: CompanionTarget,
  dt: number,
  command: CompanionCommand = { summoned: true, abilityRequests: 0 },
  ability: AbilityTiming = DEFAULT_ABILITY_TIMING,
  /**
   * 여럿이 따라다닐 때의 자리 번호.
   *
   * 0이면 예전과 같은 자리다. 번호마다 각도와 거리를 조금씩 벌려 서로
   * 겹치지 않게 한다 — 같은 지점을 목표로 삼으면 셋이 한 덩어리로 보인다.
   */
  slot = 0,
  formationScale = 1,
): CompanionState {
  const mood = resolveMood(target);

  /* ---------------- 소환·해제 ---------------- */
  const fadeStep = dt / COMPANION_TUNING.fadeSeconds;
  const presence = clamp(
    command.summoned ? state.presence + fadeStep : state.presence - fadeStep,
    0,
    1,
  );

  /* ---------------- 능력 ---------------- */
  let abilityRemaining = Math.max(0, state.abilityRemaining - dt);
  let abilityCooldown = Math.max(0, state.abilityCooldown - dt);

  /*
   * 새 요청인지 본다. 조건에 걸려 발동하지 못해도 **본 것으로 표시**한다 —
   * 대기 중에 누른 요청이 나중에 저절로 터지면 조작과 결과가 어긋난다.
   */
  const fresh = command.abilityRequests > state.seenAbilityRequest;
  const seenAbilityRequest = fresh ? command.abilityRequests : state.seenAbilityRequest;

  // 해제 중에는 능력을 쓸 수 없다. 안 보이는 동료가 빛을 내면 앞뒤가 안 맞는다.
  if (fresh && command.summoned && abilityRemaining <= 0 && abilityCooldown <= 0) {
    abilityRemaining = ability.durationSeconds;
    // 대기는 능력이 끝난 뒤부터가 아니라 발동 시점부터 센다 — 지속과 겹쳐야
    // 사용자가 "언제 다시 쓸 수 있나"를 한 숫자로 볼 수 있다.
    abilityCooldown = ability.cooldownSeconds;
  }

  /*
   * 자리 번호가 홀수면 반대편으로 보낸다. 같은 쪽에 줄 세우면 뒤쪽 동료가
   * 앞 동료에 완전히 가린다.
   */
  const orbitAngle =
    mood === "idle"
      ? state.orbitAngle + COMPANION_TUNING.idleOrbitRate * dt
      : target.facing + Math.PI + slotAngle(slot);

  const next: CompanionState = { ...state, mood, orbitAngle, seenAbilityRequest };
  const goal = desiredPosition(next, target, slot, formationScale);

  const gap = Math.hypot(
    goal.x - state.position.x,
    goal.y - state.position.y,
    goal.z - state.position.z,
  );

  // 너무 벌어지면 따라잡기를 포기하고 붙여 놓는다. 맵 반대편에서 날아오는
  // 그림보다 옆에 있는 편이 낫다 (탭 복귀·순간이동성 이동 후).
  if (gap > COMPANION_TUNING.teleportDistance) {
    return {
      ...next,
      position: { ...goal },
      velocity: { x: 0, y: 0, z: 0 },
      lean: 0,
      facing: target.facing,
      presence,
      abilityRemaining,
      abilityCooldown,
    };
  }

  const position: Vec3 = {
    x: damp(state.position.x, goal.x, COMPANION_TUNING.followLambda, dt),
    y: damp(state.position.y, goal.y, COMPANION_TUNING.followLambda, dt),
    z: damp(state.position.z, goal.z, COMPANION_TUNING.followLambda, dt),
  };

  // 속도는 실제 이동량에서 역산한다. 별도로 적분하면 damp 결과와 어긋난다.
  const velocity: Vec3 =
    dt > 0
      ? {
          x: (position.x - state.position.x) / dt,
          y: (position.y - state.position.y) / dt,
          z: (position.z - state.position.z) / dt,
        }
      : { ...state.velocity };

  // 최고 속도를 넘기면 잘라낸다. 큰 dt에서 순간이동처럼 튀는 것을 막는다.
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal > COMPANION_TUNING.maxSpeed && dt > 0) {
    const scale = COMPANION_TUNING.maxSpeed / horizontal;
    velocity.x *= scale;
    velocity.z *= scale;
    position.x = state.position.x + velocity.x * dt;
    position.z = state.position.z + velocity.z * dt;
  }

  /*
   * 움직일 때는 진행 방향을, 멈춰 있을 때는 플레이어 쪽을 본다.
   *
   * 문턱이 0.35였을 때는 **뒤쪽 갈래가 영영 안 밟혔다.** 쉬는 동안 동료는
   * 일부러 플레이어 둘레를 도는데(`idleOrbitRate`), 그 공전만으로 속도가
   * 0.9를 넘는다 — 그래서 가만히 서 있어도 동료는 늘 「달리는 중」으로 잡혀
   * **한 번도 이쪽을 보지 않았다.** 비교 방향 훑기가 이 줄을 잡아 줘서 알았다.
   *
   * 그래서 문턱을 **공전 속도에서 유도한다.** 손으로 숫자를 고르면 자리 수나
   * 공전 속도를 조정할 때 같은 일이 조용히 돌아온다.
   */
  const movingFast = Math.hypot(velocity.x, velocity.z) > IDLE_ORBIT_SPEED * 1.4;
  const lookAngle = movingFast
    ? Math.atan2(velocity.x, velocity.z)
    : Math.atan2(target.position.x - position.x, target.position.z - position.z);

  const facing = rotateToward(state.facing, lookAngle, COMPANION_TUNING.turnRate * dt);

  return {
    ...next,
    position,
    velocity,
    facing,
    bobPhase: state.bobPhase + (dt / COMPANION_TUNING.bobPeriod) * Math.PI * 2,
    presence,
    abilityRemaining,
    abilityCooldown,
    lean:
      clamp(Math.hypot(velocity.x, velocity.z) / COMPANION_TUNING.maxSpeed, 0, 1) *
      COMPANION_TUNING.maxLean,
  };
}

/** 현재 위상에서의 떠다니는 높이 오프셋. 렌더가 위치에 더해 쓴다. */
export function bobOffset(state: CompanionState): number {
  return Math.sin(state.bobPhase) * COMPANION_TUNING.bobAmplitude;
}

/**
 * 동료와 플레이어 사이의 거리(m).
 *
 * "따라오고 있는가"를 한 수로 말할 수 있어야 검증할 수 있다. 목표 지점이
 * 아니라 **플레이어까지**의 거리다 — 목표 지점은 계속 움직이므로 그쪽을 재면
 * 항상 0에 가깝게 나와 아무것도 말해 주지 않는다.
 */
export function distanceToTarget(state: CompanionState, target: CompanionTarget): number {
  /*
   * 수평 거리만 잰다. 동료는 항상 일정한 높이에 떠 있으므로 높이를 포함하면
   * "따라오는 거리"에 늘 같은 상수가 섞여 값이 무슨 뜻인지 흐려진다.
   */
  return Math.hypot(state.position.x - target.position.x, state.position.z - target.position.z);
}

/** 능력이 켜져 있는지. 렌더가 빛 세기에 쓴다. */
export function isAbilityActive(state: CompanionState): boolean {
  return state.abilityRemaining > 0;
}

/** 지금 능력을 쓸 수 있는지. HUD가 버튼 활성화에 쓴다. */
export function canUseAbility(state: CompanionState): boolean {
  return state.presence > 0.5 && state.abilityCooldown <= 0;
}

/**
 * 지도에 점으로 찍을지. 미니맵이 쓴다.
 *
 * 부를 때와 보낼 때 동료가 서서히 나타나고 사라지는데, 그 동안 **화면에 거의
 * 안 보이는 동료가 지도에는 또렷한 점으로 남는다.** 지도만 보고 쫓아가면 아무도
 * 없다 — 화면과 지도가 다른 말을 하는 것이다.
 *
 * 문턱이 능력(0.5)보다 낮다: 점은 「저기 있다」만 말하므로 조금 옅어도 맞는
 * 말이지만, 능력 버튼은 눌러서 안 되면 거짓말이 되므로 더 확실할 때만 켠다.
 */
export function showsOnMap(state: CompanionState): boolean {
  return state.presence > 0.35;
}

/** 동료가 화면·플레이어에게 내보내는 칸들 */
export interface CompanionEffects {
  abilityAggroScale: number;
  abilityRegenScale: number;
  companionX: number;
  companionZ: number;
  companionVisible: boolean;
  companionAbilityReady: boolean;
  companionLightRange: number;
}

/**
 * 동료 하나가 공유 효과 객체에 자기 몫을 얹는다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다.** 여기 걸린 것이 지도 점·흔적을 밝히는 범위·능력 버튼이다.
 *
 * 두 가지 규칙이 이 함수의 이유다:
 *
 * 1. **덮어쓰지 않고 합친다.** 동료가 여럿이면 마지막에 쓴 하나만 남아 나머지
 *    능력이 사라진다. 인지 반경은 가장 낮은 값, 회복은 가장 높은 값을 쓴다.
 * 2. **지도와 능력 버튼은 맨 앞 동료만** 쓴다. 셋이 겹쳐 있어 점 세 개는 뭉쳐
 *    보이고, 뒤따르는 도깨비 상태로 버튼이 바뀌면 헷갈린다.
 *
 * 매 프레임 기본값으로 되돌리는 일은 PlayerRig가 한다(이 함수보다 먼저 돈다).
 */
export function projectCompanionEffects(
  effects: CompanionEffects,
  state: CompanionState,
  ability: { aggroScale: number; regenScale: number },
  /** 몇 번째 자리인가. 0이 맨 앞이다 */
  slot: number,
  /** 능력이 켜져 있고 아직 사라지지 않았는가 */
  applies: boolean,
  /** 흔적을 드러내는 반경(m) */
  lightRange: number,
): void {
  if (applies) {
    effects.abilityAggroScale = Math.min(effects.abilityAggroScale, ability.aggroScale);
    effects.abilityRegenScale = Math.max(effects.abilityRegenScale, ability.regenScale);
  }

  if (slot !== 0) return;

  effects.companionX = state.position.x;
  effects.companionZ = state.position.z;
  effects.companionVisible = showsOnMap(state);
  effects.companionAbilityReady = canUseAbility(state);
  /*
   * 흔적을 드러내는 범위. **능력이 켜져 있을 때만** 값이 실린다 — 평소 빛(9m)으로도
   * 드러나면 「잠깐 빛나게 한다」가 아니라 늘 보이는 것이 된다. 사라지는 중에는
   * 0이다: 안 보이는 동료가 흔적을 밝히면 앞뒤가 안 맞는다.
   */
  effects.companionLightRange = applies ? lightRange : 0;
}

/**
 * 동료가 읽어 갈 플레이어 상태를 옮긴다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다.** 여기가 끊기면 동료가 이상하게 군다:
 *
 *   - 자리가 안 나가면 **동료가 첫 자리에 멈춰 서서 안 따라온다.**
 *   - `speed`가 안 나가면 늘 걷는 속도로 판단해 달릴 때 뒤처진다.
 *   - `facing`이 안 나가면 대열이 플레이어 등 뒤가 아니라 엉뚱한 쪽에 선다.
 *   - `grounded`가 안 나가면 점프해도 동료가 따라 뜨지 않는다.
 *
 * **객체를 교체하지 않고 칸만 옮긴다** — `position`까지 갈아 끼우면 동료가
 * 들고 있던 참조와 갈라진다.
 */
export function projectCompanionTarget(
  target: CompanionTarget,
  position: Vec3,
  speed: number,
  facing: number,
  grounded: boolean,
): void {
  target.position.x = position.x;
  target.position.y = position.y;
  target.position.z = position.z;
  target.speed = speed;
  target.facing = facing;
  target.grounded = grounded;
}

/**
 * 동료 능력 효과를 매 프레임 되돌린다.
 *
 * `projectCompanionEffects`의 **짝**이다. 저쪽은 동료마다 자기 몫을 얹기만 하고
 * (덮어쓰지 않고 합친다), 되돌리는 일은 그보다 **먼저 도는 곳**이 한 번 한다.
 *
 * 되돌리는 곳이 없으면 **능력이 한 번 걸린 뒤 영영 안 풀린다** — 인지 반경이
 * 줄어든 채로 남고, 능력이 끝나도 흔적이 계속 밝다. 화면에는 아무 표시가 없어
 * 「원래 이런 게임인가」 싶게 된다.
 *
 * 순서가 뒤바뀌면 반대로 **능력이 걸려도 즉시 지워진다.** 프레임 순서 자체는
 * `tests/resourceRelease.test.ts`가 지킨다 — 여기서는 되돌리는 값이 맞는지만 본다.
 */
export function resetCompanionEffects(effects: CompanionEffects): void {
  effects.abilityAggroScale = 1;
  effects.abilityRegenScale = 1;
  effects.companionLightRange = 0;
}
