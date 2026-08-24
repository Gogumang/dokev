import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { GRADE } from "@/game/config/tuning";
import { createFlare, FLARE, recordFlare } from "@/game/scene/screenFlare";
import type { CombatCues } from "@/game/systems/audio/combat";

/*
 * 터질 때만 올린다.
 *
 * 「화려하다」는 채도가 아니라 **낙차**다. 우리는 후처리 채도를 상수로 올려
 * 두어서 늘 화려한 대신 **터질 자리가 없었다**(RALPH_BACKLOG 「6. 평상시 색을
 * 낮추고 터질 때만 올린다」).
 *
 * 백로그가 못 박아 둔 검사가 있다: **평상시와 절정이 같은 값이면 실패로 잡아야
 * 한다.** 그렇지 않으면 누가 상수로 되돌려도 검사가 조용하다.
 */
function cues(over: Partial<CombatCues> = {}): CombatCues {
  return { hits: 0, defeats: 0, hurts: 0, slams: 0, ...over };
}

describe("무엇이 얼마나 터뜨리는가", () => {
  it("가만히 있으면 0이다", () => {
    const flare = createFlare();
    recordFlare(flare, cues(), 1 / 60);
    expect(flare.level, "아무 일도 없는데 터졌다").toBe(0);
  });

  it("눕힌 순간이 가장 크게 터진다", () => {
    const defeat = createFlare();
    recordFlare(defeat, cues({ defeats: 1 }), 0);
    const hit = createFlare();
    recordFlare(hit, cues({ hits: 1 }), 0);

    expect(defeat.level, `처치 ${defeat.level} vs 타격 ${hit.level}`).toBeGreaterThan(hit.level);
  });

  it("때린 것만으로 화면이 밝은 채로 있지 않는다", () => {
    // 타격은 자주 일어난다. 크게 주면 전투 내내 절정이고, 그러면 낙차가 사라진다
    expect(FLARE.hitSurge, `${FLARE.hitSurge}`).toBeLessThan(FLARE.defeatSurge / 2);
  });

  it("누적값이 아니라 **차이**를 본다", () => {
    /*
     * 값 자체를 보면 전투가 길어질수록 화면이 계속 밝아진다. 같은 수치를 두 번
     * 넘기면 두 번째는 아무 일도 아니어야 한다.
     */
    const flare = createFlare();
    recordFlare(flare, cues({ defeats: 1 }), 1 / 60);
    const first = flare.level;
    // 같은 수치를 다시 넘긴다. 새 사건이 아니므로 잦아들기만 해야 한다
    recordFlare(flare, cues({ defeats: 1 }), 1 / 60);
    expect(flare.level, `${first} → ${flare.level}`).toBeLessThan(first);
  });

  it("1을 넘지 않는다 — 넘으면 화면이 하얗게 탄다", () => {
    const flare = createFlare();
    recordFlare(flare, cues({ defeats: 9, slams: 4, hits: 20 }), 0);
    expect(flare.level, `${flare.level}`).toBeLessThanOrEqual(1);
  });

  it("같은 프레임에 터진 것이 깎이지 않는다", () => {
    // 감쇠를 나중에 하면 방금 눕힌 한 방이 프레임 길이에 따라 흐려진다
    const flare = createFlare();
    recordFlare(flare, cues({ defeats: 1 }), 1 / 30);
    expect(flare.level, `${flare.level}`).toBe(FLARE.defeatSurge);
  });
});

describe("돌아오는가", () => {
  it("정해진 시간 안에 평상시로 돌아온다", () => {
    const flare = createFlare();
    recordFlare(flare, cues({ defeats: 1 }), 0);

    let elapsed = 0;
    while (flare.level > 0 && elapsed < 2) {
      recordFlare(flare, cues({ defeats: 1 }), 1 / 60);
      elapsed += 1 / 60;
    }
    expect(elapsed, `${elapsed.toFixed(2)}초 걸렸다`).toBeLessThan(0.6);
    expect(flare.level, "안 돌아왔다").toBe(0);
  });

  it("쉬지 않고 때려도 눌러 붙지 않는다", () => {
    /*
     * 잦아드는 속도가 느리면 값이 1에 붙은 채로 남고, 그러면 **평상시가 절정**이
     * 된다 — 이 항목이 고치려는 상태가 정확히 그것이다.
     *
     * 타격 간격은 실제 조작 속도(방망이 한 번 0.48초)로 잡는다. 매 프레임
     * 때리는 상황을 재면 사람이 할 수 없는 일로 수치를 정하게 된다.
     */
    const flare = createFlare();
    const swingSeconds = 0.48;
    let hits = 0;
    let sinceSwing = 0;

    for (let frame = 0; frame < 300; frame += 1) {
      sinceSwing += 1 / 60;
      if (sinceSwing >= swingSeconds) {
        sinceSwing = 0;
        hits += 1;
      }
      recordFlare(flare, cues({ hits }), 1 / 60);
    }
    expect(flare.level, `쉬지 않고 때리는 중 ${flare.level.toFixed(2)}`).toBeLessThan(0.6);
  });
});

describe("평상시와 절정이 실제로 다른가", () => {
  it("절정이 평상시보다 진하다", () => {
    // 백로그가 요구한 검사. 같으면 상수로 되돌아간 것이고, 그때 조용하면 안 된다
    expect(GRADE.saturationPeak, `${GRADE.saturationPeak} vs ${GRADE.saturationCalm}`).toBeGreaterThan(
      GRADE.saturationCalm,
    );
    expect(GRADE.contrastPeak, `${GRADE.contrastPeak} vs ${GRADE.contrastCalm}`).toBeGreaterThan(
      GRADE.contrastCalm,
    );
  });

  it("평상시가 예전보다 차분하다", () => {
    // 예전 상수는 채도 1.16이었다. 그대로면 「평상시를 낮춘다」가 안 된 것이다
    expect(GRADE.saturationCalm, `${GRADE.saturationCalm}`).toBeLessThan(1.16);
  });

  it("절정도 원색으로 타지 않는다", () => {
    // 낙차를 만들자고 절정을 끝까지 올리면 그때마다 화면이 만화가 된다
    expect(GRADE.saturationPeak, `${GRADE.saturationPeak}`).toBeLessThan(1.6);
  });

  it("후처리가 이 값들을 읽는다", () => {
    const post = readCode("src/game/scene/PostProcessing.tsx");
    expect(post, "후처리가 터짐을 안 읽는다").toMatch(/recordFlare\(/);
    expect(post, "채도가 여전히 상수다").toMatch(/saturationPeak|saturationCalm/);
  });
});
