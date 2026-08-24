import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";
import { SUMMON, isSummoned, stepLinger, wantsSummon } from "@/game/dokebi/summonWindow";

/*
 * 동료는 평소에 없고 전투에만 나온다.
 *
 * 전에는 `summoned: true`로 못 박혀 있어 도시를 내내 따라다녔다. 프레임 기록이
 * 반대를 말한다 — 탐험 컷에는 아이 혼자이고 동료는 전투 장면에만 있다.
 */
describe("동료를 부르는 창", () => {
  it("조용하면 나오지 않는다", () => {
    expect(wantsSummon(0, false)).toBe(false);
    expect(wantsSummon(SUMMON.appearAt - 0.01, false)).toBe(false);
  });

  it("적이 다가오면 나온다", () => {
    expect(wantsSummon(SUMMON.appearAt, false)).toBe(true);
    expect(wantsSummon(1, false)).toBe(true);
  });

  it("나온 뒤에는 더 낮은 압력에서도 남는다 — 경계에서 깜빡이지 않는다", () => {
    /*
     * 이것이 이 모듈의 존재 이유다. 문턱이 하나면 적이 사거리 경계에서 한 걸음
     * 들락날락할 때마다 동료가 사라졌다 나타난다.
     */
    const between = (SUMMON.stayUntil + SUMMON.appearAt) / 2;

    expect(wantsSummon(between, false), `${between}에서 새로 나오면 안 된다`).toBe(false);
    expect(wantsSummon(between, true), `${between}에서 이미 나와 있으면 남아야 한다`).toBe(true);
  });

  it("두 문턱이 실제로 다르다", () => {
    // 같아지면 히스테리시스가 사라지고, 위 검사가 조용히 무의미해진다
    expect(SUMMON.stayUntil).toBeLessThan(SUMMON.appearAt);
  });

  it("충분히 멀어지면 사라진다", () => {
    expect(wantsSummon(SUMMON.stayUntil, true)).toBe(false);
    expect(wantsSummon(0, true)).toBe(false);
  });
});

describe("전투가 끝난 뒤의 여운", () => {
  it("부르는 동안에는 가득 차 있다", () => {
    expect(stepLinger(0, true, 0.016)).toBe(SUMMON.lingerSeconds);
    expect(stepLinger(0.2, true, 0.016)).toBe(SUMMON.lingerSeconds);
  });

  it("부르지 않으면 줄어든다", () => {
    expect(stepLinger(SUMMON.lingerSeconds, false, 0.5)).toBeCloseTo(SUMMON.lingerSeconds - 0.5, 5);
  });

  it("음수로 내려가지 않는다", () => {
    expect(stepLinger(0.1, false, 10)).toBe(0);
  });

  it("마지막 적이 쓰러진 순간에 사라지지 않는다", () => {
    /*
     * 이긴 장면에서 동료가 즉시 증발하면 승리가 아니라 결함으로 보인다.
     * 색종이가 흩어지는 동안 함께 서 있어야 한다.
     */
    let linger = stepLinger(0, true, 0.016);
    expect(isSummoned(false, linger), "전투가 끝나자마자 사라졌다").toBe(true);

    // 여운이 다 흐른 뒤에는 없다
    linger = stepLinger(linger, false, SUMMON.lingerSeconds + 0.01);
    expect(isSummoned(false, linger)).toBe(false);
  });

  it("여운이 1초는 넘는다 — 눈에 남을 만큼", () => {
    expect(SUMMON.lingerSeconds).toBeGreaterThan(1);
  });
});

describe("제품이 이 규칙을 실제로 쓰는가", () => {
  /*
   * 만들어 두고 연결하지 않으면 없는 것과 같다. 이 저장소에서 가장 자주 난
   * 사고라 소스에서 호출 지점을 확인한다.
   */
  it("장면이 summoned를 못 박아 두지 않는다", () => {
    const scene = readCode("src/game/scene/GameScene.tsx");
    expect(scene, "summoned: true로 못 박혀 있다 — 평소에도 따라다닌다").not.toMatch(
      /summoned:\s*true/,
    );
  });

  it("입력을 옮기는 자리가 전투 압력으로 동료를 부른다", () => {
    /*
     * 배선은 `projectCommands`에 있다 — 전에 `C` 키를 그대로 넘기던 바로 그
     * 줄이다. `PlayerRig`가 아닌 이유는 그 파일이 이미 795줄이라, 여기에 넣으면
     * 800줄 규칙에 걸려 다른 것을 쪼개야 하기 때문이다.
     */
    const input = readCode("src/game/systems/input.ts");
    expect(input, "wantsSummon을 부르지 않는다").toContain("wantsSummon");
    expect(input, "여운을 흘려보내지 않는다").toContain("stepLinger");
    expect(input, "결과를 링크에 쓰지 않는다").toContain("isSummoned");

    // 키 입력을 그대로 넘기던 줄이 남아 있으면 「평소에는 없다」가 조용히 깨진다
    expect(input, "아직 키 입력이 동료를 부른다").not.toContain(
      "link.summoned = input.companionSummoned",
    );
  });

  it("프레임 루프가 실제로 그 함수를 부른다", () => {
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    expect(rig, "projectCommands에 전투 압력을 넘기지 않는다").toMatch(
      /projectCommands\([^)]*combatEase/,
    );
  });
});
