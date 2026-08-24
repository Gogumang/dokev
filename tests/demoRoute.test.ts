/**
 * 1분 30초 시연 코스가 **실제로 가능한가.**
 *
 * 대본을 문서로만 적으면 지형·배치를 만질 때마다 조용히 틀린 글이 된다.
 * 「자전거로 12초에 200m를 간다」 같은 대본은 읽어서는 알 수 없고, 찍어
 * 보고 나서야 안다 — 그때는 이미 카메라를 세워 둔 뒤다.
 */

import { describe, expect, it } from "vitest";

import { LOCOMOTION, isVehicle } from "@/game/config/tuning";
import {
  beatAt,
  beatSpeed,
  buildDemoRoute,
  demoSpawn,
  DEMO_PACE,
  DEMO_SECONDS,
  DEMO_TOPICS,
} from "@/game/systems/demoRoute";
import { buildCityLayout } from "@/game/world/cityLayout";
import { isOverWater, shoreLanding } from "@/game/world/waterRide";

const layout = buildCityLayout();
const BEATS = buildDemoRoute(layout);

describe("대본의 짜임", () => {
  it("1분 30초 안에 끝난다", () => {
    const last = BEATS[BEATS.length - 1];
    expect(last.at, `마지막 장면이 ${last.at}초에 시작한다`).toBeLessThan(DEMO_SECONDS);
  });

  it("시간이 앞으로만 간다", () => {
    for (let i = 1; i < BEATS.length; i += 1) {
      expect(BEATS[i].at, `${i}번 장면이 앞 장면보다 이르다`).toBeGreaterThan(BEATS[i - 1].at);
    }
  });

  it("한 장면이 너무 길거나 짧지 않다", () => {
    /*
     * 4초 미만이면 무엇을 봤는지 알 수 없고, 15초를 넘으면 시연이 늘어진다.
     * 마지막 장면은 남은 시간을 다 쓴다.
     */
    for (let i = 0; i < BEATS.length; i += 1) {
      const end = i + 1 < BEATS.length ? BEATS[i + 1].at : DEMO_SECONDS;
      const span = end - BEATS[i].at;
      expect(span, `「${BEATS[i].title}」이 ${span}초`).toBeGreaterThanOrEqual(4);
      expect(span, `「${BEATS[i].title}」이 ${span}초`).toBeLessThanOrEqual(15);
    }
  });

  it("보여 줄 것을 하나도 빠뜨리지 않는다", () => {
    /*
     * 기능을 만들고 대본에 넣는 것을 잊으면 **그 기능은 시연 영상에 없다.**
     * 목록을 두는 이유가 이것이다.
     */
    const shown = new Set(BEATS.flatMap((beat) => beat.topics));
    for (const topic of DEMO_TOPICS) {
      expect(shown.has(topic), `「${topic}」을 보여 주는 장면이 없다`).toBe(true);
    }
  });

  it("장면마다 무엇을 보여 주는지 적혀 있다", () => {
    for (const beat of BEATS) {
      expect(beat.topics.length, `「${beat.title}」에 주제가 없다`).toBeGreaterThan(0);
      expect(beat.title.length).toBeGreaterThan(0);
    }
  });
});

describe("실제로 갈 수 있는가", () => {
  it("구간마다 주어진 시간 안에 도착한다", () => {
    /*
     * 최고 속도로 직선을 달릴 수는 없다 — 붙는 데 시간이 걸리고, 길이 휘고,
     * 사람이 조작한다. 최고 속도의 80%까지만 실제로 낸다고 본다.
     */
    for (let i = 0; i < BEATS.length; i += 1) {
      const needed = beatSpeed(BEATS, i);
      const possible = LOCOMOTION[BEATS[i].mode].maxSpeed * DEMO_PACE;
      expect(
        needed,
        `「${BEATS[i].title}」: ${BEATS[i].mode}로 ${needed.toFixed(1)}m/s가 필요한데 ${possible.toFixed(1)}m/s까지만 난다`,
      ).toBeLessThanOrEqual(possible);
    }
  });

  it("걸어서 가는 구간이 달리기 속도를 넘지 않는다", () => {
    // 「두 발」로 적어 놓고 탈것 속도가 필요하면 대본이 거짓말이다
    for (let i = 0; i < BEATS.length; i += 1) {
      if (isVehicle(BEATS[i].mode)) continue;
      expect(beatSpeed(BEATS, i)).toBeLessThanOrEqual(LOCOMOTION.run.maxSpeed * DEMO_PACE);
    }
  });
});

describe("자리가 배치와 맞는가", () => {
  it("광장에서 시작한다", () => {
    expect(BEATS[0].x).toBeCloseTo(layout.spawn.x, 6);
    expect(BEATS[0].z).toBeCloseTo(layout.spawn.z, 6);
  });

  it("놀이터 장면이 실제 놀이터다", () => {
    /*
     * 좌표를 손으로 적으면 놀이터가 다른 구역에 생길 때 대본만 옛 자리에
     * 남는다 — 카메라를 빈 잔디에 세우게 된다.
     */
    const beat = BEATS.find((entry) => entry.topics.includes("놀이터"));
    expect(beat, "놀이터 장면이 없다").toBeDefined();
    const match = layout.playSpots.some(
      (spot) => Math.hypot(spot.x - (beat?.x ?? 0), spot.z - (beat?.z ?? 0)) < 1,
    );
    expect(match, `(${beat?.x}, ${beat?.z})에 놀이터가 없다`).toBe(true);
  });

  it("제트스키를 타는 자리가 실제 물가다", () => {
    const landing = shoreLanding(layout.halfExtent);
    const beat = BEATS.find((entry) => entry.keys?.includes("타기"));
    expect(beat, "갈아타는 장면이 없다").toBeDefined();
    expect(Math.hypot((beat?.x ?? 0) - landing.x, (beat?.z ?? 0) - landing.z)).toBeLessThan(1);
  });

  it("바다 장면이 정말 물 위다", () => {
    /*
     * 뭍이면 「뭍 탈것은 여기 못 온다」가 거짓말이 된다. 경계 밖인지 본다.
     */
    const sea = BEATS.filter((beat) => beat.mode === "jetski");
    expect(sea.length, "제트스키로 이동하는 장면이 없다").toBeGreaterThan(0);
    expect(
      isOverWater(sea[0].x, sea[0].z, layout.halfExtent),
      `(${sea[0].x}, ${sea[0].z})는 뭍이다`,
    ).toBe(true);
  });

  it("모든 자리가 월드 안이다", () => {
    // 제트스키만 경계 밖으로 나간다. 나머지가 밖에 있으면 갈 수 없는 자리다
    for (const beat of BEATS) {
      const outside = isOverWater(beat.x, beat.z, layout.halfExtent);
      if (outside) {
        expect(beat.mode, `(${beat.x}, ${beat.z})에 ${beat.mode}로 서 있다`).toBe("jetski");
        expect(Math.max(Math.abs(beat.x), Math.abs(beat.z))).toBeLessThan(layout.halfExtent + 60);
      }
    }
  });
});

describe("화면 안내가 읽는 값", () => {
  it("시각으로 지금 장면을 찾는다", () => {
    for (const beat of BEATS) {
      expect(beatAt(BEATS, beat.at), `${beat.at}초`).toBe(beat);
      expect(beatAt(BEATS, beat.at + 0.5), `${beat.at + 0.5}초`).toBe(beat);
    }
  });

  it("시작 전이면 첫 장면이다 — 안내가 비어 있지 않다", () => {
    expect(beatAt(BEATS, -5)).toBe(BEATS[0]);
    expect(beatAt(BEATS, 0)).toBe(BEATS[0]);
  });

  it("끝난 뒤에는 마지막 장면에 머문다", () => {
    expect(beatAt(BEATS, DEMO_SECONDS + 30)).toBe(BEATS[BEATS.length - 1]);
  });

  it("시작 자리가 코스의 첫 장면이다", () => {
    /*
     * 확인 지점 표에 좌표를 적으면 광장이 옮겨 갈 때 대본과 시작 자리가
     * 갈라진다 — 안내는 「광장에서 출발」이라는데 화면은 골목이다.
     */
    const spawn = demoSpawn(layout);
    expect(spawn.x).toBeCloseTo(BEATS[0].x, 6);
    expect(spawn.z).toBeCloseTo(BEATS[0].z, 6);
    expect(spawn.y).toBe(layout.spawn.y);
  });

  it("씬이 안내를 실제로 띄운다", async () => {
    // 만들어 두고 안 그리면 화면에는 아무것도 없다
    const { readFileSync } = await import("node:fs");
    const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");
    expect(client, "안내를 그리지 않는다").toContain("<DemoGuide");
    expect(client, "시연 지점에서만 뜨는 조건이 없다").toMatch(/scenario\?\.id === "demo"/);
  });
});
