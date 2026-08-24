import { describe, expect, it } from "vitest";

import { swingSeconds, WEAPONS } from "@/game/combat/weapons";
import { swingTrail } from "@/game/player/swingTrail";

/*
 * 휘두른 자국.
 *
 * 트레일러 프레임에서 참격은 **불꽃이 아니라 넓적한 붓자국**이고, 여러 색이
 * 휘감긴다(DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접 확인한 것 (2026-08-24)」).
 * 우리 타격은 색종이가 튀는 것뿐이라 **무엇이 지나갔는지**가 화면에 남지 않았다.
 *
 * 자국은 판정과 같은 규칙을 써야 한다. 눈에 보이는 궤적이 실제 부채꼴보다
 * 넓으면 「분명 닿았는데 안 맞았다」가 생긴다 — 이 저장소가 자세에서 이미 한 번
 * 겪은 종류다.
 */
const BAT = WEAPONS.bat;
const HAMMER = WEAPONS.hammer;
const POPGUN = WEAPONS.popgun;

describe("언제 보이는가", () => {
  it("안 휘두르면 없다", () => {
    expect(swingTrail(null, BAT).opacity).toBe(0);
  });

  it("준비 구간에는 없다 — 들어 올리는 중에 자국이 남으면 안 된다", () => {
    const trail = swingTrail(BAT.timing.windupSeconds * 0.5, BAT);
    expect(trail.opacity, `준비 중 ${trail.opacity}`).toBe(0);
  });

  it("판정이 살아 있는 동안 가장 진하다", () => {
    const active = swingTrail(BAT.timing.windupSeconds + BAT.timing.activeSeconds * 0.5, BAT);
    const recovering = swingTrail(swingSeconds(BAT) * 0.9, BAT);
    expect(active.opacity, `판정 ${active.opacity} vs 후딜 ${recovering.opacity}`).toBeGreaterThan(
      recovering.opacity,
    );
  });

  it("휘두르기가 끝나면 사라진다", () => {
    expect(swingTrail(swingSeconds(BAT), BAT).opacity).toBeCloseTo(0, 5);
    expect(swingTrail(swingSeconds(BAT) * 3, BAT).opacity).toBe(0);
  });

  it("진하기가 0과 1 사이다", () => {
    for (let t = 0; t <= swingSeconds(HAMMER); t += 0.01) {
      const { opacity } = swingTrail(t, HAMMER);
      expect(opacity, `t=${t.toFixed(2)}에서 ${opacity}`).toBeGreaterThanOrEqual(0);
      expect(opacity, `t=${t.toFixed(2)}에서 ${opacity}`).toBeLessThanOrEqual(1);
    }
  });

  it("원거리 무기는 자국을 남기지 않는다 — 탄이 이미 보인다", () => {
    for (let t = 0; t <= swingSeconds(POPGUN); t += 0.02) {
      expect(swingTrail(t, POPGUN).opacity, `t=${t.toFixed(2)}`).toBe(0);
    }
  });
});

describe("어디를 지나가는가", () => {
  it("판정 구간 동안 한쪽에서 반대쪽으로 쓸어 간다", () => {
    const start = swingTrail(BAT.timing.windupSeconds + 0.001, BAT);
    const end = swingTrail(BAT.timing.windupSeconds + BAT.timing.activeSeconds, BAT);
    expect(start.centerAngle, `시작 ${start.centerAngle}`).toBeLessThan(0);
    expect(end.centerAngle, `끝 ${end.centerAngle}`).toBeGreaterThan(0);
  });

  it("되돌아가지 않는다 — 왔다 갔다 하면 휘두른 것으로 안 보인다", () => {
    let previous = -Infinity;
    const from = BAT.timing.windupSeconds;
    const to = from + BAT.timing.activeSeconds;
    for (let t = from; t <= to; t += 0.005) {
      const { centerAngle } = swingTrail(t, BAT);
      expect(centerAngle, `t=${t.toFixed(3)}에서 뒤로 갔다`).toBeGreaterThanOrEqual(previous);
      previous = centerAngle;
    }
  });

  it("판정 부채꼴을 벗어나지 않는다 — 넓으면 「닿았는데 안 맞았다」가 된다", () => {
    for (const weapon of [BAT, HAMMER]) {
      for (let t = 0; t <= swingSeconds(weapon); t += 0.01) {
        const trail = swingTrail(t, weapon);
        if (trail.opacity === 0) continue;
        const edge = Math.abs(trail.centerAngle) + trail.halfWidth;
        expect(edge, `${weapon.id} t=${t.toFixed(2)}: 끝 ${edge} > 부채꼴 ${weapon.halfAngle}`).toBeLessThanOrEqual(
          weapon.halfAngle + 1e-6,
        );
      }
    }
  });

  it("망치 자국이 방망이보다 넓다 — 무기가 다르면 자국도 달라야 한다", () => {
    const bat = swingTrail(BAT.timing.windupSeconds + BAT.timing.activeSeconds * 0.5, BAT);
    const hammer = swingTrail(
      HAMMER.timing.windupSeconds + HAMMER.timing.activeSeconds * 0.5,
      HAMMER,
    );
    expect(hammer.halfWidth, `망치 ${hammer.halfWidth} vs 방망이 ${bat.halfWidth}`).toBeGreaterThan(
      bat.halfWidth,
    );
  });
});
