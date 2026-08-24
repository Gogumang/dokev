import { describe, expect, it } from "vitest";

import {
  attackElapsed,
  createAttackState,
  isAttackActive,
  stepAttack,
} from "@/game/combat/combatSim";
import { swingSeconds, WEAPONS } from "@/game/combat/weapons";
import { attackPose } from "@/game/player/attackPose";

/** 방망이 한 번의 휘두르기 길이(초). 무기마다 다르므로 어느 것인지 밝혀 둔다 */
const BAT_SWING = swingSeconds(WEAPONS.bat);

describe("attackElapsed", () => {
  it("쉬고 있으면 null", () => {
    expect(attackElapsed(createAttackState())).toBeNull();
  });

  it("휘두르는 내내 시간이 늘어난다", () => {
    /*
     * 단계가 넘어갈 때 값이 뒤로 튀면 팔이 되감긴다.
     */
    let state = stepAttack(createAttackState(), true, 0);
    let previous = attackElapsed(state) ?? 0;

    for (let i = 0; i < 40; i += 1) {
      state = stepAttack(state, false, 0.01);
      const now = attackElapsed(state);
      if (now === null) break;
      expect(now, `step ${i}: ${previous} → ${now}`).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = now;
    }
  });

  it("전체 길이가 세 단계의 합이다", () => {
    expect(BAT_SWING).toBeCloseTo(
      WEAPONS.bat.timing.windupSeconds + WEAPONS.bat.timing.activeSeconds + WEAPONS.bat.timing.recoverySeconds,
      9,
    );
  });
});

describe("attackPose", () => {
  const windupEnd = WEAPONS.bat.timing.windupSeconds;
  const activeEnd = windupEnd + WEAPONS.bat.timing.activeSeconds;

  it("준비 구간에서 팔을 뒤로 당긴다", () => {
    const ready = attackPose(0);
    const pulled = attackPose(windupEnd * 0.9);
    // 오른팔이 뒤로 가면 rightArmX가 커진다(양수 = 뒤)
    expect(pulled.rightArmX, `ready=${ready.rightArmX}, pulled=${pulled.rightArmX}`).toBeGreaterThan(
      ready.rightArmX,
    );
  });

  it("판정이 끝나는 순간 팔이 가장 앞에 있다", () => {
    /*
     * 눈과 규칙이 어긋나면 "맞았는데 안 맞은 것처럼" 보인다. 판정 구간의
     * 끝에서 최대로 뻗어야 한다.
     */
    const atEnd = attackPose(activeEnd);
    const before = attackPose(windupEnd);
    const after = attackPose(activeEnd + WEAPONS.bat.timing.recoverySeconds * 0.5);

    expect(atEnd.rightArmX, `end=${atEnd.rightArmX}`).toBeLessThan(before.rightArmX);
    expect(atEnd.rightArmX, `end=${atEnd.rightArmX}, after=${after.rightArmX}`).toBeLessThan(
      after.rightArmX,
    );
  });

  it("후딜이 끝나면 제자리로 돌아온다", () => {
    const done = attackPose(BAT_SWING);
    expect(done.rightArmX, `rightArmX=${done.rightArmX}`).toBeCloseTo(0, 6);
    expect(done.lean).toBeCloseTo(0, 6);
  });

  it("두 팔이 반대로 움직인다", () => {
    // 같이 나가면 휘두르는 게 아니라 미는 동작이다
    const pose = attackPose(activeEnd);
    expect(pose.leftArmX * pose.rightArmX, `left=${pose.leftArmX}`).toBeLessThan(0);
  });

  it("다리도 함께 버틴다", () => {
    // 상체만 돌면 인형처럼 보인다
    const pose = attackPose(activeEnd);
    expect(Math.abs(pose.leftLegX)).toBeGreaterThan(0.05);
    expect(pose.leftLegX * pose.rightLegX, "두 다리가 같은 방향이다").toBeLessThan(0);
  });

  it("팔이 몸통을 통과하지 않는다", () => {
    for (let t = 0; t <= BAT_SWING; t += 0.01) {
      const pose = attackPose(t);
      expect(Math.abs(pose.rightArmX), `t=${t.toFixed(2)}`).toBeLessThan(Math.PI);
    }
  });

  it("범위를 벗어난 시간도 안전하다", () => {
    // 프레임이 밀려 큰 dt가 들어와도 자세가 뒤집히면 안 된다
    expect(attackPose(-1).rightArmX).toBeCloseTo(0, 6);
    expect(attackPose(BAT_SWING * 3).rightArmX).toBeCloseTo(0, 6);
  });

  it("판정이 살아 있는 동안 대부분 팔이 앞에 있다", () => {
    /*
     * 판정 구간 전체에 천천히 휘두르면, 판정이 켜진 첫 프레임에 맞은 적이
     * 아직 뒤에 있는 팔에 맞은 것으로 보인다. 앞쪽 30% 안에 다 휘두르므로
     * 대부분의 시간 동안 팔이 앞에 있어야 한다.
     */
    let state = stepAttack(createAttackState(), true, 0);
    let forward = 0;
    let samples = 0;

    for (let i = 0; i < 60; i += 1) {
      state = stepAttack(state, false, 0.01);
      if (!isAttackActive(state)) continue;
      const elapsed = attackElapsed(state);
      if (elapsed === null) continue;
      samples += 1;
      if (attackPose(elapsed).rightArmX < 0) forward += 1;
    }

    expect(samples, "판정 구간을 한 번도 관측하지 못했다").toBeGreaterThan(3);
    expect(forward / samples, `${forward}/${samples} frames forward`).toBeGreaterThan(0.6);
  });

  it("판정 중반부터는 완전히 뻗어 있다", () => {
    const midway = attackPose(windupEnd + WEAPONS.bat.timing.activeSeconds * 0.5);
    const atEnd = attackPose(activeEnd);
    expect(midway.rightArmX, `midway=${midway.rightArmX}`).toBeLessThan(0);
    expect(atEnd.rightArmX).toBeCloseTo(midway.rightArmX, 6);
  });
});
