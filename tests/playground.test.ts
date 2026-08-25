/**
 * 놀이터에서 노는 사람들.
 *
 * 미끄럼틀과 그네를 세워 놓고 **아무도 놀지 않았다.** 놀이기구만 있는
 * 놀이터는 놀이터가 아니라 조형물이다 — 원작 트레일러에서 동네가 살아
 * 있어 보이는 몫의 하나가 「누가 무엇을 하고 있는 자리」이고, 우리 공원은
 * 사람이 지나가기만 하는 잔디였다.
 */

import { describe, expect, it } from "vitest";

import { buildPlaygroundKids, CROWD, PLAYGROUND } from "@/game/world/crowdLayout";
import { buildCityLayout } from "@/game/world/cityLayout";

const layout = buildCityLayout();
const SPOTS = layout.playSpots;
const KIDS = buildPlaygroundKids(SPOTS, CROWD.maxPedestrians);

describe("놀이터 자리", () => {
  it("공원마다 하나씩 있다", () => {
    // 자리가 없으면 아이들 목록이 통째로 비고, 화면은 예전 그대로다
    expect(SPOTS.length, `놀이터 ${SPOTS.length}곳`).toBeGreaterThan(0);
  });

  it("놀이기구가 실제로 서 있는 자리다", () => {
    /*
     * 좌표를 두 곳에서 각자 구하면 아이들이 **미끄럼틀 옆 잔디**에서 논다.
     * 배치(`park`)가 놀이기구를 놓은 자리를 그대로 흘려보내는지 본다.
     */
    for (const spot of SPOTS) {
      const near = layout.playground.filter(
        (part) => Math.hypot(part.x - spot.x, part.z - spot.z) < 8,
      );
      expect(
        near.length,
        `(${spot.x.toFixed(0)}, ${spot.z.toFixed(0)})에 놀이기구가 없다`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("노는 사람들", () => {
  it("놀이터마다 여럿이 논다 — 혼자면 형제, 여럿이면 놀이터다", () => {
    expect(KIDS.length).toBe(SPOTS.length * PLAYGROUND.kidsPerSpot);
    expect(PLAYGROUND.kidsPerSpot).toBeGreaterThan(2);
  });

  it("전부 `play`다", () => {
    for (const kid of KIDS) expect(kid.activity).toBe("play");
  });

  it("놀이터를 둘러선다 — 한 점에 겹치지 않는다", () => {
    const first = KIDS.slice(0, PLAYGROUND.kidsPerSpot);
    const positions = new Set(first.map((kid) => kid.startU));
    expect(positions.size, `자리 ${[...positions].join(", ")}`).toBe(first.length);
  });

  it("놀이기구를 밟고 서지 않는다 — 반지름이 기구 밖이다", () => {
    /*
     * 미끄럼틀은 놀이터 중심에서 3.4m를 뻗는다(`PLAY.slideRun`). 그 안쪽에
     * 세우면 몸이 기구를 뚫는다.
     */
    expect(PLAYGROUND.ringRadius).toBeGreaterThan(3.4);
  });

  it("나아가지 않는다 — 속도가 0이다", () => {
    // 노는 사람이 트랙을 돌면 놀이터 둘레를 도는 행진이 된다
    for (const kid of KIDS) expect(kid.speed).toBe(0);
  });

  it("안쪽을 본다", () => {
    /*
     * 직사각 트랙의 접선에서 -90도가 네 구간 모두 중심 쪽이다. 반대로 두면
     * 넷이 등을 맞대고 바깥을 보는 그림이 된다.
     */
    for (const kid of KIDS) expect(kid.yawOffset).toBeCloseTo(-Math.PI / 2, 6);
  });

  it("각자 다른 박자로 뛴다 — 같이 뛰면 군무다", () => {
    const phases = new Set(KIDS.map((kid) => kid.startPhase));
    expect(phases.size, `위상 ${phases.size}개 / ${KIDS.length}명`).toBe(KIDS.length);
  });

  it("걷기보다 빠르게 뛴다 — 느리면 뛰는 것으로 안 보인다", () => {
    expect(PLAYGROUND.hopRate).toBeGreaterThan(CROWD.maxSpeed);
    expect(
      PLAYGROUND.hopScale,
      "폴짝임이 걷기 흔들림과 같으면 그냥 서 있는 것이다",
    ).toBeGreaterThan(1.5);
  });

  it("예산을 넘기지 않는다 — 저사양에서 놀이터가 도시를 잡아먹지 않게", () => {
    expect(buildPlaygroundKids(SPOTS, 3).length).toBe(3);
    expect(buildPlaygroundKids(SPOTS, 0).length).toBe(0);
  });
});

describe("배선", () => {
  it("씬이 놀이터 자리를 실제로 넘긴다", async () => {
    // 목록만 만들고 안 넘기면 아무도 놀지 않는다 — 이 저장소에서 가장 흔한 결함 모양이다
    const { readFileSync } = await import("node:fs");
    const scene = readFileSync("src/game/scene/GameScene.tsx", "utf8");
    expect(scene, "놀이터 자리를 안 넘긴다").toMatch(/playSpots=\{layout\.playSpots\}/);

    const crowd = readFileSync("src/game/world/Crowd.tsx", "utf8");
    expect(crowd, "아이들을 안 만든다").toContain("buildPlaygroundKids(");
    expect(crowd, "폴짝이지 않는다").toContain("PLAYGROUND.hopRate");
  });
});
