/**
 * 포토 모드 포즈 — 순수 데이터.
 *
 * 포토 모드에서는 시뮬레이션이 멈춰 있어(dt=0) 캐릭터가 마지막 자세 그대로
 * 굳는다. 달리다 멈추면 어정쩡한 걸음 중간에서 정지한 사진이 나온다.
 * 포즈를 고를 수 있으면 같은 장소에서 다른 사진이 나온다.
 *
 * 리그의 한계를 그대로 받아들인다 — 팔다리는 어깨/골반에서 x·z축으로만
 * 돈다. 손가락이나 표정은 없다. 그래서 실루엣만으로 읽히는 포즈만 만든다.
 */

export type PhotoPoseId = "natural" | "wave" | "cheer" | "ready";

export interface PhotoPose {
  id: PhotoPoseId;
  /** 버튼에 그대로 쓰는 이름 */
  name: string;
  /** 어깨 앞뒤 회전(rad). 음수가 앞으로 드는 방향이다 */
  leftArmX: number;
  rightArmX: number;
  /** 어깨 좌우 벌림(rad). 몸통에서 팔을 떼어 실루엣을 만든다 */
  leftArmZ: number;
  rightArmZ: number;
  leftLegX: number;
  rightLegX: number;
  /** 상체 기울기(rad) */
  lean: number;
  /** 고개 기울기(rad) */
  headTilt: number;
}

export const PHOTO_POSES: Record<PhotoPoseId, PhotoPose> = {
  natural: {
    id: "natural",
    name: "자연스럽게",
    leftArmX: 0,
    rightArmX: 0,
    // 완전히 0이면 팔이 몸통에 파묻혀 실루엣이 통나무가 된다.
    leftArmZ: 0.12,
    rightArmZ: -0.12,
    leftLegX: 0,
    rightLegX: 0,
    lean: 0,
    headTilt: 0,
  },
  wave: {
    id: "wave",
    name: "인사",
    // 한쪽 팔만 든다. 양쪽을 들면 인사가 아니라 만세가 된다.
    leftArmX: 0.1,
    rightArmX: -2.5,
    leftArmZ: 0.14,
    rightArmZ: -0.45,
    leftLegX: 0.05,
    rightLegX: -0.05,
    lean: -0.05,
    headTilt: 0.08,
  },
  cheer: {
    id: "cheer",
    name: "만세",
    leftArmX: -2.85,
    rightArmX: -2.85,
    leftArmZ: 0.3,
    rightArmZ: -0.3,
    leftLegX: 0.18,
    rightLegX: -0.18,
    // 뒤로 살짝 젖혀야 위를 향한 팔과 이어진다.
    lean: -0.12,
    headTilt: -0.16,
  },
  ready: {
    id: "ready",
    name: "출발 자세",
    // 팔을 뒤로 빼고 몸을 앞으로 숙인다 — 달려 나가기 직전이다.
    leftArmX: 0.9,
    rightArmX: -0.7,
    leftArmZ: 0.1,
    rightArmZ: -0.1,
    leftLegX: -0.45,
    rightLegX: 0.35,
    lean: 0.34,
    headTilt: -0.2,
  },
};

export const PHOTO_POSE_ORDER: readonly PhotoPoseId[] = ["natural", "wave", "cheer", "ready"];

export const DEFAULT_PHOTO_POSE: PhotoPoseId = "natural";

export function nextPhotoPose(id: PhotoPoseId): PhotoPoseId {
  const index = PHOTO_POSE_ORDER.indexOf(id);
  if (index < 0) return DEFAULT_PHOTO_POSE;
  return PHOTO_POSE_ORDER[(index + 1) % PHOTO_POSE_ORDER.length];
}

export function photoPosePreset(id: string): PhotoPose {
  return Object.hasOwn(PHOTO_POSES, id)
    ? PHOTO_POSES[id as PhotoPoseId]
    : PHOTO_POSES[DEFAULT_PHOTO_POSE];
}
