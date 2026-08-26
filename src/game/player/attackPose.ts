/**
 * 공격 자세 — 순수 함수.
 *
 * 공격 판정은 3단계(준비·판정·후딜)인데 캐릭터는 계속 서 있거나 달리는
 * 자세였다. 소리는 나고 색종이는 튀는데 정작 **휘두르는 동작이 없었다.**
 *
 * 포토 포즈·감정 표현과 같은 모양을 돌려준다. 리그가 포즈를 적용하는 코드를
 * 이미 갖고 있다.
 */

import { swingSeconds, WEAPONS, type Weapon } from "@/game/combat/weapons";
import type { PhotoPose } from "@/game/player/photoPose";

/**
 * 휘두르기 경과 시간에 따른 자세.
 *
 * 준비 구간에 팔을 뒤로 당기고, 판정 구간에 앞으로 내지르고, 후딜에 천천히
 * 돌아온다. **판정이 살아 있는 순간에 팔이 가장 앞에 있어야** 눈과 규칙이
 * 맞는다 — 어긋나면 "맞았는데 안 맞은 것처럼" 보인다.
 *
 * 무기를 받는다. 망치는 방망이보다 준비가 네 배 길어서, 한 벌의 길이로
 * 둘을 그리면 **느린 무기가 이미 다 휘두른 자세로 서서 기다린다.**
 */
export function attackPose(elapsedSeconds: number, weapon: Weapon = WEAPONS.bow): PhotoPose {
  const t = Math.max(0, Math.min(swingSeconds(weapon), elapsedSeconds));
  const windupEnd = weapon.timing.windupSeconds;
  const activeEnd = windupEnd + weapon.timing.activeSeconds;

  // -1(뒤로 당김) ~ 1(앞으로 내지름)
  let swing: number;
  if (t < windupEnd) {
    // 준비 — 짧고 빠르게 당긴다.
    swing = -(t / windupEnd);
  } else if (t < activeEnd) {
    /*
     * 판정 — 앞쪽 30% 안에 다 휘두르고 나머지는 뻗은 채 유지한다.
     *
     * 판정 구간 전체에 걸쳐 천천히 지나가면, 판정이 켜진 첫 프레임에 맞은
     * 적이 **아직 뒤에 있는 팔**에 맞은 것으로 보인다. 판정이 살아 있는 동안은
     * 팔이 앞에 있어야 눈과 규칙이 맞는다.
     */
    const sweep = weapon.timing.activeSeconds * 0.3;
    const into = t - windupEnd;
    swing = into >= sweep ? 1 : -1 + (into / sweep) * 2;
  } else {
    // 후딜 — 앞에서 제자리로 천천히 돌아온다.
    swing = 1 - (t - activeEnd) / weapon.timing.recoverySeconds;
  }

  return {
    id: "natural",
    name: "공격",
    // 오른팔이 휘두른다. 왼팔은 균형을 잡느라 반대로 조금 움직인다.
    rightArmX: -swing * 1.9,
    leftArmX: swing * 0.5,
    rightArmZ: -0.25,
    leftArmZ: 0.3,
    // 다리는 앞뒤로 버틴다. 그대로 두면 상체만 도는 인형처럼 보인다.
    leftLegX: -swing * 0.25,
    rightLegX: swing * 0.2,
    lean: swing * 0.22,
    headTilt: -swing * 0.12,
  };
}
