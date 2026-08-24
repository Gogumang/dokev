import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { CROWD, crowdReaction, fleeDirection } from "@/game/world/crowdLayout";

/*
 * 군중이 반응하는가.
 *
 * 원작 도시가 「살아 있다」고 읽히는 이유는 사람 **수**가 아니라 반응이다
 * (DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접 확인한 것 (2026-08-24)」).
 * 우리 보행자는 옆에서 로봇과 싸워도 앞만 보고 걸었다.
 */
describe("무엇에 반응하는가", () => {
  it("아무도 없고 조용하면 반응이 없다", () => {
    expect(crowdReaction(40, 40, 0, 0, 0)).toBe("none");
  });

  it("가까이 지나가면 쳐다본다", () => {
    expect(crowdReaction(2, 0, 0, 0, 0)).toBe("glance");
  });

  it("멀면 쳐다보지 않는다 — 온 동네가 나를 보면 그건 배경이 아니라 무대다", () => {
    expect(crowdReaction(CROWD.glanceRadius + 1, 0, 0, 0, 0)).toBe("none");
  });

  it("전투가 붙으면 물러선다", () => {
    expect(crowdReaction(3, 0, 0, 0, 1)).toBe("flee");
  });

  it("전투가 먼저다 — 로봇이 코앞인데 구경하고 있으면 반응이 아니다", () => {
    // 같은 자리에서 압력만 올려 본다. 「쳐다봄」이 「물러섬」으로 바뀌어야 한다
    expect(crowdReaction(2, 0, 0, 0, 0)).toBe("glance");
    expect(crowdReaction(2, 0, 0, 0, 1)).toBe("flee");
  });

  it("멀리서 벌어지는 전투에는 움직이지 않는다", () => {
    expect(crowdReaction(CROWD.fleeRadius + 2, 0, 0, 0, 1)).toBe("none");
  });

  it("약한 기척으로는 물러서지 않는다 — 온 동네가 흔들리면 소란이다", () => {
    const faint = CROWD.fleeThreshold / 2;
    expect(crowdReaction(3, 0, 0, 0, faint), `압력 ${faint}`).toBe("glance");
  });

  it("물러서는 거리가 쳐다보는 거리보다 넓다", () => {
    // 전투는 더 멀리서도 느껴져야 한다. 반대면 「보다가 갑자기 도망」이 된다
    expect(CROWD.fleeRadius, `${CROWD.fleeRadius} vs ${CROWD.glanceRadius}`).toBeGreaterThan(
      CROWD.glanceRadius,
    );
  });
});

describe("어느 쪽으로 물러서는가", () => {
  it("멀어지는 쪽을 고른다", () => {
    /*
     * 트랙 위를 도는 사람이라 아무 데로나 갈 수 없다. 방향을 안 고르면 절반은
     * **전투 쪽으로 뛰어든다** — 그건 도망이 아니라 결함으로 보인다.
     */
    // 보행자는 +z 쪽에 있고 플레이어는 원점. 접선이 +z면 그대로 가야 멀어진다
    expect(fleeDirection(0, 5, 0, 0, 0)).toBe(1);
    // 접선이 -z(π)면 반대로 가야 멀어진다
    expect(fleeDirection(0, 5, 0, 0, Math.PI)).toBe(-1);
  });

  it("옆으로 난 트랙에서도 고른다", () => {
    // 보행자가 +x에 있고 접선이 +x(π/2)면 그대로가 멀어지는 쪽이다
    expect(fleeDirection(5, 0, 0, 0, Math.PI / 2)).toBe(1);
    expect(fleeDirection(5, 0, 0, 0, -Math.PI / 2)).toBe(-1);
  });

  it("겹쳐 서 있어도 방향을 정한다 — 멈춰 서면 그 자리에서 맞는다", () => {
    const direction = fleeDirection(0, 0, 0, 0, 0);
    expect([1, -1], `방향이 ${direction}`).toContain(direction);
  });

  it("빨라진다 — 걸음 그대로면 물러서는 것으로 안 보인다", () => {
    expect(CROWD.fleeSpeedScale, `${CROWD.fleeSpeedScale}배`).toBeGreaterThan(1);
  });
});

describe("화면이 실제로 반응하는가", () => {
  it("군중 렌더가 반응 규칙을 읽는다", () => {
    // 규칙만 있고 부르는 곳이 없으면 화면에서는 아무 일도 일어나지 않는다
    const crowd = readCode("src/game/world/Crowd.tsx");
    expect(crowd, "군중이 반응 규칙을 안 읽는다").toMatch(/crowdReaction\(/);
    expect(crowd, "물러설 방향을 안 고른다").toMatch(/fleeDirection\(/);
  });
});
