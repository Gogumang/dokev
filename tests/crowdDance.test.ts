import { describe, expect, it } from "vitest";

import { CROWD, joinsDance } from "@/game/world/crowdLayout";

/*
 * 춤이 번지는가.
 *
 * 트레일러에서 춤은 혼자 추는 동작이 아니라 **번지는 것**이다. 우리 쪽 춤은
 * 혼자 추고 끝났고, 같은 동작인데 화면 인상이 전혀 달랐던 이유가 이것이다
 * (DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접 확인한 것 (2026-08-24)」의 군중 항목).
 *
 * 다만 Extended 편 프레임에서 **군무는 확인되지 않았다.** 근거는 ONL 트레일러와
 * 뮤직비디오 쪽이라 등급이 「기사」다 — 그래서 반경을 좁게 잡고, 화면에서
 * 인과가 보이는 선(내 주변만)에서 멈춘다.
 */
describe("합류 판정", () => {
  it("춤추지 않으면 아무도 따라 하지 않는다", () => {
    // 손 흔들기·앉기에 시민이 함께 흔들리면 그건 춤이 아니라 고장이다
    expect(joinsDance(1, 1, 0, 0, false, CROWD.danceRadius)).toBe(false);
  });

  it("가까이 있으면 합류한다", () => {
    expect(joinsDance(2, 0, 0, 0, true, CROWD.danceRadius)).toBe(true);
  });

  it("멀면 합류하지 않는다 — 광장이 통째로 흔들리면 내가 시작한 것으로 안 보인다", () => {
    expect(joinsDance(CROWD.danceRadius + 1, 0, 0, 0, true, CROWD.danceRadius)).toBe(false);
  });

  it("경계 안팎이 실제로 갈린다", () => {
    const inside = joinsDance(CROWD.danceRadius - 0.1, 0, 0, 0, true, CROWD.danceRadius);
    const outside = joinsDance(CROWD.danceRadius + 0.1, 0, 0, 0, true, CROWD.danceRadius);
    expect([inside, outside], "경계가 판정을 가르지 않는다").toEqual([true, false]);
  });

  it("멈추면 그 순간 돌아간다 — 상태를 들고 있지 않다", () => {
    const at = { x: 1, z: 1 };
    expect(joinsDance(at.x, at.z, 0, 0, true, CROWD.danceRadius)).toBe(true);
    expect(joinsDance(at.x, at.z, 0, 0, false, CROWD.danceRadius)).toBe(false);
  });
});

describe("반경이 화면과 맞는가", () => {
  it("합류 반경이 컬링 거리보다 훨씬 좁다", () => {
    /*
     * 안 보이는 사람이 춤추는 것은 아무 의미가 없다. 컬링 거리의 절반만
     * 넘어도 「보이지 않는 곳에서 벌어지는 일」을 계산하는 셈이다.
     */
    expect(CROWD.danceRadius, `합류 ${CROWD.danceRadius}m vs 컬링 ${CROWD.cullDistance}m`).toBeLessThan(
      CROWD.cullDistance / 4,
    );
  });

  it("한 구역 안에 머문다 — 옆 동네까지 번지면 인과가 사라진다", () => {
    // 트랙 반지름보다 좁아야 같은 구역 사람들만 반응한다
    expect(CROWD.danceRadius, `${CROWD.danceRadius}m`).toBeLessThan(CROWD.outerTrackRadius);
  });
});
