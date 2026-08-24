import { describe, expect, it } from "vitest";

import {
  DEFAULT_PHOTO_POSE,
  nextPhotoPose,
  PHOTO_POSE_ORDER,
  PHOTO_POSES,
  photoPosePreset,
  type PhotoPoseId,
} from "@/game/player/photoPose";

describe("PHOTO_POSES", () => {
  it("순서에 빠진 포즈가 없다", () => {
    const ids = Object.keys(PHOTO_POSES) as PhotoPoseId[];
    expect([...PHOTO_POSE_ORDER].sort()).toEqual([...ids].sort());
  });

  it("이름이 비어 있지 않다", () => {
    for (const pose of Object.values(PHOTO_POSES)) {
      expect(pose.name.length, `${pose.id}`).toBeGreaterThan(0);
    }
  });

  it("모든 각이 한 바퀴를 넘지 않는다", () => {
    // 2PI를 넘으면 팔이 몸통을 통과해 반대편으로 돈다
    for (const pose of Object.values(PHOTO_POSES)) {
      const angles = [
        pose.leftArmX,
        pose.rightArmX,
        pose.leftArmZ,
        pose.rightArmZ,
        pose.leftLegX,
        pose.rightLegX,
        pose.lean,
        pose.headTilt,
      ];
      for (const angle of angles) {
        expect(Math.abs(angle), `${pose.id}: ${angle}`).toBeLessThan(Math.PI);
      }
    }
  });

  it("자연스럽게 포즈에서도 팔이 몸통에 붙지 않는다", () => {
    // 벌림이 0이면 실루엣이 통나무가 된다
    expect(Math.abs(PHOTO_POSES.natural.leftArmZ)).toBeGreaterThan(0);
    expect(Math.abs(PHOTO_POSES.natural.rightArmZ)).toBeGreaterThan(0);
  });

  it("팔 벌림이 좌우 반대 방향이다", () => {
    // 같은 부호면 두 팔이 한쪽으로 쏠린다
    for (const pose of Object.values(PHOTO_POSES)) {
      expect(
        pose.leftArmZ * pose.rightArmZ,
        `${pose.id}: left=${pose.leftArmZ}, right=${pose.rightArmZ}`,
      ).toBeLessThan(0);
    }
  });

  it("인사는 한쪽 팔만 든다", () => {
    // 양쪽을 들면 인사가 아니라 만세가 된다
    const wave = PHOTO_POSES.wave;
    expect(wave.rightArmX, `right=${wave.rightArmX}`).toBeLessThan(-1.5);
    expect(Math.abs(wave.leftArmX), `left=${wave.leftArmX}`).toBeLessThan(0.5);
  });

  it("만세는 두 팔을 모두 든다", () => {
    expect(PHOTO_POSES.cheer.leftArmX).toBeLessThan(-1.5);
    expect(PHOTO_POSES.cheer.rightArmX).toBeLessThan(-1.5);
  });

  it("출발 자세는 앞으로 숙인다", () => {
    expect(PHOTO_POSES.ready.lean, `lean=${PHOTO_POSES.ready.lean}`).toBeGreaterThan(0.2);
  });
});

describe("nextPhotoPose", () => {
  it("한 바퀴 돌면 제자리로 온다", () => {
    let id: PhotoPoseId = DEFAULT_PHOTO_POSE;
    for (let i = 0; i < PHOTO_POSE_ORDER.length; i += 1) id = nextPhotoPose(id);
    expect(id).toBe(DEFAULT_PHOTO_POSE);
  });

  it("모르는 값이면 기본값으로 되돌린다", () => {
    expect(nextPhotoPose("dab" as PhotoPoseId)).toBe(DEFAULT_PHOTO_POSE);
  });
});

describe("photoPosePreset", () => {
  it("아는 id는 그대로 준다", () => {
    expect(photoPosePreset("cheer").id).toBe("cheer");
  });

  it("모르는 id는 기본값", () => {
    expect(photoPosePreset("").id).toBe(DEFAULT_PHOTO_POSE);
  });
});
