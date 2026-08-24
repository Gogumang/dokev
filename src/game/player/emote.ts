/**
 * 감정 표현 — 플레이 중의 동작.
 *
 * TRAILER_FEATURE_ANALYSIS 「6.2 두 번째 단계 후보」의 "감정 표현"이다.
 * 춤 하나만으로는 얇아 셋을 둔다.
 *
 * **키를 늘리지 않는다.** 누를 때마다 다음 동작으로 넘어간다 — 표현마다 키를
 * 하나씩 주면 터치 버튼도 그만큼 늘고, 한 손 엄지 범위를 넘긴다.
 *
 * **포토 포즈와 같은 모양을 돌려준다.** 캐릭터 리그가 포즈를 적용하는 코드를
 * 이미 갖고 있으므로, 별도 경로를 만들면 같은 일을 두 번 하게 된다.
 * 다른 점은 시간에 따라 값이 변한다는 것뿐이다.
 */

import type { PhotoPose } from "@/game/player/photoPose";

/** 이 속도 이상으로 움직이면 동작이 끊긴다(m/s) */
const CANCEL_SPEED = 0.6;

/** 박자(Hz). BGM의 96BPM(1.6Hz)에 맞춘다 — 음악과 어긋나면 혼자 노는 것처럼 보인다 */
const BEAT_HZ = 1.6;

export interface Emote {
  id: string;
  /** 화면에 띄우는 이름 */
  name: string;
  /** 한 번에 걸리는 시간(초) */
  seconds: number;
  /** 경과 시간에 따른 자세 */
  poseAt: (elapsedSeconds: number) => PhotoPose;
}

function basePose(overrides: Partial<PhotoPose>): PhotoPose {
  return {
    id: "natural",
    name: "감정 표현",
    leftArmX: 0,
    rightArmX: 0,
    leftArmZ: 0.12,
    rightArmZ: -0.12,
    leftLegX: 0,
    rightLegX: 0,
    lean: 0,
    headTilt: 0,
    ...overrides,
  };
}

export const EMOTES: readonly Emote[] = [
  {
    id: "dance",
    name: "춤",
    seconds: 3.4,
    poseAt: (t) => {
      const beat = t * BEAT_HZ;
      const swing = Math.sin(beat * Math.PI);
      // 두 박에 한 번 팔을 바꾼다. 매 박마다면 허둥대고, 네 박이면 스트레칭이다.
      const alternate = Math.sin(beat * Math.PI * 0.5);
      return basePose({
        leftArmX: -1.5 + alternate * 1.1,
        rightArmX: -1.5 - alternate * 1.1,
        leftArmZ: 0.45 + swing * 0.15,
        rightArmZ: -0.45 + swing * 0.15,
        leftLegX: swing * 0.28,
        rightLegX: -swing * 0.28,
        lean: swing * 0.12,
        headTilt: -alternate * 0.18,
      });
    },
  },
  {
    id: "wave",
    name: "손 흔들기",
    seconds: 2.2,
    poseAt: (t) => {
      // 한쪽 팔만 든다. 양쪽을 흔들면 인사가 아니라 구조 요청이다.
      const wave = Math.sin(t * Math.PI * 3.2);
      return basePose({
        rightArmX: -2.5,
        rightArmZ: -0.5 - wave * 0.35,
        leftArmZ: 0.14,
        lean: -0.04,
        headTilt: 0.08,
      });
    },
  },
  {
    id: "sit",
    name: "앉기",
    seconds: 3.0,
    poseAt: (t) => {
      // 앉는 데 0.4초, 나머지는 앉아 있는다. 앉자마자 일어나면 넘어진 것처럼 보인다.
      const settle = Math.min(1, t / 0.4);
      return basePose({
        leftArmX: 0.35 * settle,
        rightArmX: 0.35 * settle,
        leftArmZ: 0.3 * settle + 0.12,
        rightArmZ: -0.3 * settle - 0.12,
        // 무릎을 앞으로 접는다. 두 다리가 같은 방향이라 앉은 자세로 읽힌다.
        leftLegX: -1.15 * settle,
        rightLegX: -1.15 * settle,
        lean: 0.22 * settle,
        headTilt: -0.1 * settle,
      });
    },
  },
];

export interface EmoteState {
  /** EMOTES의 인덱스 */
  index: number;
  /** 시작 후 지난 시간(초). null이면 아무 동작도 하지 않는다 */
  elapsed: number | null;
}

export function createEmoteState(): EmoteState {
  return { index: 0, elapsed: null };
}

export function isEmoting(state: EmoteState): boolean {
  return state.elapsed !== null;
}

/** 지금 하고 있는 동작. 없으면 null */
export function currentEmote(state: EmoteState): Emote | null {
  return state.elapsed === null ? null : EMOTES[state.index];
}

/**
 * 동작을 한 프레임 진행한다.
 *
 * 움직이거나 공중에 뜨면 즉시 끊는다 — 조작을 막지 않는 것이 감정 표현보다
 * 우선이다. 동작이 끝날 때까지 못 움직이면 그건 연출이 아니라 고장이다.
 */
export function stepEmote(
  state: EmoteState,
  dt: number,
  options: { requested: boolean; speed: number; grounded: boolean },
): EmoteState {
  const moving = options.speed > CANCEL_SPEED || !options.grounded;

  if (state.elapsed === null) {
    // 뛰면서 시작할 수는 없다. 멈춰야 표현이다.
    if (options.requested && !moving) return { index: state.index, elapsed: 0 };
    return state;
  }

  if (moving) return { index: state.index, elapsed: null };

  // 하는 중에 다시 누르면 다음 동작으로 넘어간다.
  if (options.requested) {
    return { index: (state.index + 1) % EMOTES.length, elapsed: 0 };
  }

  const next = state.elapsed + dt;
  if (next < EMOTES[state.index].seconds) return { index: state.index, elapsed: next };

  // 끝나면 다음 동작을 예약해 둔다. 같은 것만 반복하면 셋을 만든 의미가 없다.
  return { index: (state.index + 1) % EMOTES.length, elapsed: null };
}

/** 지금 적용할 자세. 아무 동작도 안 하면 null */
export function emotePose(state: EmoteState): PhotoPose | null {
  if (state.elapsed === null) return null;
  return EMOTES[state.index].poseAt(state.elapsed);
}

/**
 * 지금 감정 표현에 맞는 대사 상황.
 *
 * 셋 다 「dance」를 쓰고 있었다 — 앉았는데 「박자 맞네」라고 하면 동료가
 * 이쪽을 보고 있지 않다는 뜻이 된다. 모르는 동작이면 춤으로 떨어진다:
 * 말이 없는 것보다 어긋난 말이라도 하는 편이 낫다.
 */
export function emoteCue(index: number): "dance" | "wave" | "sit" {
  const id = EMOTES[index]?.id;
  if (id === "wave" || id === "sit") return id;
  return "dance";
}
