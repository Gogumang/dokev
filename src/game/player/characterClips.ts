/**
 * 지금 상태에 맞는 동작 고르기.
 *
 * 모델이 들고 온 동작은 여섯 개인데(달리기·걷기·공격·쓰러짐·서 있기·기술)
 * 게임의 상태는 그보다 많다 — 공중·활강·보드에는 맞는 동작이 없다. 무엇을
 * 무엇으로 대신할지가 이 파일의 전부다.
 *
 * 컴포넌트 안에 두지 않는 이유는 늘 같다: **화면 안에 있으면 값으로 잴 데가
 * 없다.** 이 세션에 배선이 조용히 끊긴 자리를 여든 곳 넘게 찾았다.
 *
 * 절차적 자세(`characterPose.ts`)와 속도 문턱을 **함께 쓴다** — 따로 두면 같은
 * 속도에서 다른 판단이 나와, 모델을 바꿀 때마다 「걷는 것 같은데 뛰는 소리가
 * 난다」가 생긴다.
 */

import { isVehicle, type LocomotionMode } from "@/game/config/tuning";
import { POSE_TUNING } from "@/game/player/characterPose";
import type { EmoteState } from "@/game/player/emote";

/**
 * 파일에 들어 있는 동작 이름.
 *
 * 원본이 물려준 이름을 그대로 쓴다. **`public/character.glb`와 글자 그대로
 * 맞아야 하는 계약**이고, 어긋나면 재생이 조용히 안 된다 — 검사가 실제 파일의
 * 목록과 **양쪽으로** 대조한다: 여기 적힌 것이 파일에 다 있어야 하고, 파일에
 * 있는데 안 쓰는 것도 없어야 한다(받기만 하고 안 트는 용량이다).
 */
export const CLIP = {
  run: "Running",
  walk: "Walking",
  /** 가드에서 뻗는 잽. 짧아서 휘두르는 길이와 맞는다 */
  attack: "Left_Jab_from_Guard",
  dead: "Knock_Down",
  /** **진짜 서 있는 동작.** 예전 모델에는 없어서 일어서는 동작의 끝 자세로 때웠다 */
  idle: "Idle_15",
  /** 도깨비 능력을 쓸 때. 감정 표현에도 같은 것을 쓴다 */
  skill: "Lunge_Spin_Kick",
} as const;

export type ClipName = (typeof CLIP)[keyof typeof CLIP];

export interface ClipInput {
  /** 지금 이동 방식. 무엇을 타고 있는지가 여기서 갈린다 */
  mode: LocomotionMode;
  /** 수평 속도(m/s) */
  speed: number;
  grounded: boolean;
  gliding: boolean;
  /** 휘두르기 경과 시간(초). 안 휘두르면 null */
  attackElapsed: number | null;
  /** 감정 표현 상태 */
  emote: EmoteState;
  /** 쓰러져 있는지 */
  downed: boolean;
}

/** 걷기 동작이 전제하는 속도(m/s). 재생 속도를 여기에 맞춘다 */
const WALK_REFERENCE = 1.6;

/**
 * 무엇을 재생할지.
 *
 * 순서가 규칙이다 — 위에 있을수록 세다:
 *
 * 1. **쓰러짐**이 가장 세다. 쓰러진 채로 달리는 그림이 나오면 안 된다.
 * 2. **공격**은 이동을 덮는다. 휘두르면서 달려도 팔이 먼저다.
 * 3. **감정 표현**은 멈춰 서 있을 때만 나온다 — 달리다 춤추면 발이 미끄러진다.
 * 4. 나머지는 속도로 가른다.
 *
 * 공중·활강에는 맞는 동작이 없어 달리기를 쓴다. 대신 재생을 멈추는데,
 * 그 판단은 `freezes`가 한다.
 */
export function clipFor(input: ClipInput): ClipName {
  if (input.downed) return CLIP.dead;
  if (input.attackElapsed !== null) return CLIP.attack;

  /*
   * 무언가를 타고 있으면 **서 있는 자세**를 쓴다.
   *
   * 모델에는 타는 동작이 없다. 속도로 고르면 자전거 위에서 전력 질주하는
   * 그림이 나온다 — 발이 페달이 아니라 허공을 구른다. 서 있는 자세를 한
   * 프레임에 세워 두는 편이 훨씬 덜 어색하고, 그 세우는 일은 `freezes`가 한다.
   */
  if (isVehicle(input.mode)) return CLIP.idle;

  const still = input.speed <= POSE_TUNING.idleSpeed;
  if (input.emote.elapsed !== null && still && input.grounded) return CLIP.skill;

  if (!input.grounded) return CLIP.run;
  if (input.speed >= POSE_TUNING.runSpeed) return CLIP.run;
  if (!still) return CLIP.walk;
  return CLIP.idle;
}

/**
 * 재생을 멈출 상황인가.
 *
 * 공중에서는 달리기 자세를 **한 프레임에 세워 둔다.** 발을 계속 구르면 허공에서
 * 헤엄치는 그림이 되는데, 3D 게임에서 가장 흔한 어색함이다.
 *
 * 쓰러짐과 공격은 그 자체가 한 번 끝까지 가야 하는 동작이라 멈추지 않는다 —
 * 공중에서 맞아도 날아가는 동작은 이어져야 한다.
 */
export function freezes(input: ClipInput): boolean {
  if (input.downed || input.attackElapsed !== null) return false;
  // 타는 중에는 서 있는 자세를 세워 둔다 — 굴리면 탈것 위에서 걷는다
  if (isVehicle(input.mode)) return true;
  return !input.grounded;
}

/**
 * 재생 속도 배율.
 *
 * 걷기·달리기는 **실제 이동 속도에 맞춰** 빨라지고 느려져야 한다. 고정 속도로
 * 돌리면 발이 땅과 따로 놀아 미끄러지는 것처럼 보인다.
 *
 * 너무 느리면 정지 화면 같고 너무 빠르면 떨린다 — 0.6~1.8로 묶는다.
 */
export function playbackRate(input: ClipInput): number {
  if (input.downed || input.attackElapsed !== null) return 1;
  if (!input.grounded) return 1;
  if (input.speed <= POSE_TUNING.idleSpeed) return 1;

  const reference = input.speed >= POSE_TUNING.runSpeed ? POSE_TUNING.runSpeed : WALK_REFERENCE;
  return Math.min(1.8, Math.max(0.6, input.speed / reference));
}

/**
 * 마지막 자세에서 멈춰야 하는 동작인가.
 *
 * 「일어서기」는 바닥에서 일어나는 동작이라 **끝 자세만** 서 있는 모습이다.
 * 처음부터 반복하면 가만히 있는 사람이 계속 바닥에서 일어난다 — 처음 붙였을
 * 때 실제로 그렇게 나왔다.
 *
 * 「쓰러짐」도 같다. 반복하면 죽었다 살아나기를 되풀이한다.
 */
export function holdsLastFrame(clip: ClipName): boolean {
  return clip === CLIP.idle || clip === CLIP.dead;
}
