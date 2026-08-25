import { describe, expect, it } from "vitest";

import { BOSS, BOSS_HOME } from "@/game/combat/bossSim";
import { BOSS_POINTER, bossPointerFrame } from "@/game/systems/bossPointer";

/*
 * 대장이 어느 쪽에 있는지 알리는 화살표.
 *
 * DESIGN_GUIDE 「월드 안내」의 「화면 밖 중요 대상에는 방향 표시」. 그전까지
 * 안내는 미니맵의 삼각형 하나였고, 퀘스트 힌트마저 그 표식을 가리켰다.
 */

/** 화면은 원점에서 +z(월드 yaw 0)를 보고 있다 */
function at(bossX: number, bossZ: number, alive = true) {
  return bossPointerFrame({ playerX: 0, playerZ: 0, viewYaw: 0, bossX, bossZ, alive });
}

describe("어느 쪽을 가리키는가", () => {
  it("오른쪽에 있으면 오른쪽으로 치우친다", () => {
    // Given / When — 정면(+z)을 보는 중에 대장이 +x에 있다
    const frame = at(40, 0);

    // Then
    expect(frame.offsetX).toBeGreaterThan(0);
    expect(frame.bearing).toBeCloseTo(Math.PI / 2, 3);
  });

  it("뒤에 있으면 아래로 내려간다", () => {
    const frame = at(0, -40);

    expect(frame.offsetY).toBeGreaterThan(0);
    expect(frame.ahead).toBe(false);
  });

  it("돌아서면 방향도 함께 돈다", () => {
    /*
     * 화살표가 **월드 기준**으로 굳어 있으면, 제자리에서 시점만 돌렸을 때
     * 화면과 어긋난 곳을 계속 가리킨다. 실제로 그랬다 — 몸이 향한 쪽으로
     * 돌고 있어서 제자리에서 시점만 돌리면 화살표가 안 움직였다.
     */
    const looking = bossPointerFrame({
      playerX: 0,
      playerZ: 0,
      viewYaw: Math.PI / 2,
      bossX: 40,
      bossZ: 0,
      alive: true,
    });

    expect(Math.abs(looking.bearing)).toBeLessThan(Math.abs(at(40, 0).bearing));
  });
});

describe("언제 뜨는가", () => {
  it("멀면 뜨지 않는다", () => {
    // 도시 반대편의 것이 늘 떠 있으면 줄이려던 상시 표시를 하나 더 만드는 셈이다
    expect(at(0, BOSS_POINTER.showRadius + 10).visible).toBe(false);
  });

  it("옆이나 뒤에 있으면 뜬다", () => {
    expect(at(30, 0).visible).toBe(true);
    expect(at(0, -30).visible).toBe(true);
  });

  it("정면에 가까이 있으면 뜨지 않는다", () => {
    /*
     * 그때는 대장이 화면에 실제로 보이고, 같은 자리를 체력 막대가 쓴다 —
     * 겹쳐 놓으면 둘 다 못 읽는다.
     */
    const frame = at(0, BOSS.aggroRadius - 4);

    expect(frame.ahead).toBe(true);
    expect(frame.visible).toBe(false);
  });

  it("정면이어도 멀면 뜬다", () => {
    // 60m 앞의 대장은 건물 사이의 점이다. 거리와 함께 알려 줄 값어치가 있다
    expect(at(0, 60).visible).toBe(true);
  });

  it("누워 있으면 가리키지 않는다", () => {
    /*
     * 넘어뜨린 뒤에도 계속 가리키면 없는 것을 쫓게 된다 — 미니맵이 표식을
     * 지우는 것과 같은 규칙이다.
     */
    expect(at(30, 0, false).visible).toBe(false);
  });
});

describe("거리를 실제로 잰다", () => {
  it("세워 둔 자리에 서면 0이다", () => {
    const frame = bossPointerFrame({
      playerX: BOSS_HOME.x,
      playerZ: BOSS_HOME.z,
      viewYaw: 0,
      bossX: BOSS_HOME.x,
      bossZ: BOSS_HOME.z,
      alive: true,
    });

    expect(frame.distance).toBe(0);
  });

  it("화살표가 화면 밖으로 나가지 않는다", () => {
    // 비율이 1을 넘으면 가장자리 밖이라 아예 안 보인다
    for (const angle of [0, 0.7, 1.9, 3.0, -2.2]) {
      const frame = at(Math.sin(angle) * 40, Math.cos(angle) * 40);
      expect(Math.abs(frame.offsetX), `${angle}rad`).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.offsetY), `${angle}rad`).toBeLessThanOrEqual(1);
    }
  });
});
