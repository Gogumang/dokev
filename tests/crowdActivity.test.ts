import { describe, expect, it } from "vitest";

import {
  buildPedestrians,
  buildPlaygroundKids,
  crowdCountFor,
  CROWD,
  PEDESTRIAN_ACTIVITIES,
} from "@/game/world/crowdLayout";
import { buildCityLayout } from "@/game/world/cityLayout";
import { TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

/*
 * 군중은 **수**가 아니라 **행동의 종류**로 살아 있다.
 *
 * 트레일러 프레임에서 나온 규칙이다(DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접
 * 확인한 것 (2026-08-24)」). 원작 낮 거리에는 사람이 5~10명 있는데 **걷기만
 * 반복하는 인물이 사실상 없다** — 한 화면에 걷기·앉기·서서 대화·계단 오르기가
 * 동시에 있다. 반대로 밤에는 인물이 1명으로 뚝 떨어진다.
 *
 * 우리는 낮이든 밤이든 전원이 같은 걸음으로 트랙을 돌았다. 그래서 **밀도를
 * 올려도 이 인상이 나오지 않았다.**
 */
/**
 * 화면에 실제로 서 있는 사람 전부.
 *
 * 거리 보행자와 **놀이터 아이들**을 합친 것이 씬이 만드는 목록이다
 * (`Crowd.tsx`). 한쪽만 보면 「목록에만 있고 아무도 하지 않는 행동」 검사가
 * 조용히 비켜 간다 — `play`가 정확히 그랬다.
 */
const SPECS = [
  ...buildPlaygroundKids(buildCityLayout().playSpots, CROWD.maxPedestrians),
  ...buildPedestrians(CROWD.maxPedestrians),
];

/** 거리 보행자만 — 트랙을 도는 규칙은 이쪽에만 해당한다 */
const STREET_SPECS = buildPedestrians(CROWD.maxPedestrians);

describe("행동의 종류", () => {
  it("걷기 하나가 아니다", () => {
    const kinds = new Set(SPECS.map((spec) => spec.activity));
    expect(kinds.size, `행동 종류: ${[...kinds].join(", ")}`).toBeGreaterThan(1);
  });

  it("정본에 적힌 행동이 실제로 다 나온다", () => {
    // 목록에만 있고 아무도 하지 않는 행동은 없는 것과 같다
    const kinds = new Set(SPECS.map((spec) => spec.activity));
    for (const activity of PEDESTRIAN_ACTIVITIES) {
      expect(kinds.has(activity), `${activity}를 하는 사람이 없다`).toBe(true);
    }
  });

  it("절반 이상은 걷는다 — 다 앉아 있으면 도시가 멈춘다", () => {
    // 거리 기준이다. 놀이터는 원래 아무도 안 걷는 자리다
    const walking = STREET_SPECS.filter((spec) => spec.activity === "walk").length;
    expect(
      walking / STREET_SPECS.length,
      `걷는 사람 ${walking}/${STREET_SPECS.length}`,
    ).toBeGreaterThan(0.5);
  });

  it("한 구역 안에서도 행동이 갈린다", () => {
    /*
     * 도시 전체로 종류가 여럿이어도 **한 화면에 한 종류만** 있으면 인상은
     * 그대로다. 프레임에서 본 것은 한 프레임 안의 다양성이었다.
     */
    const byBlock = new Map<string, Set<string>>();
    for (const spec of SPECS) {
      const key = `${spec.cx},${spec.cz}`;
      const seen = byBlock.get(key) ?? new Set<string>();
      seen.add(spec.activity);
      byBlock.set(key, seen);
    }
    const mixed = [...byBlock.values()].filter((kinds) => kinds.size > 1).length;
    expect(mixed, `행동이 섞인 구역 ${mixed}개 / ${byBlock.size}개`).toBeGreaterThan(0);
  });

  it("대화는 혼자 하지 않는다", () => {
    /*
     * 마주 볼 상대가 없으면 허공에 대고 서 있는 사람이 된다. 짝은 같은 구역에
     * 있어야 한다 — 도시 반대편을 보고 이야기할 수는 없다.
     */
    const byBlock = new Map<string, number>();
    for (const spec of SPECS) {
      if (spec.activity !== "talk") continue;
      const key = `${spec.cx},${spec.cz}`;
      byBlock.set(key, (byBlock.get(key) ?? 0) + 1);
    }
    expect(byBlock.size, "대화하는 사람이 아무도 없다").toBeGreaterThan(0);
    for (const [block, count] of byBlock) {
      expect(count % 2, `구역 ${block}에 대화 인원이 ${count}명 — 짝이 안 맞는다`).toBe(0);
    }
  });

  it("같은 시드면 행동도 같다 — 판마다 바뀌면 성능 비교가 무의미하다", () => {
    // 두 목록 **각각** 확인한다. 합쳐서 비교하면 한쪽이 흔들려도 못 잡는다
    expect(buildPedestrians(CROWD.maxPedestrians).map((spec) => spec.activity)).toEqual(
      STREET_SPECS.map((spec) => spec.activity),
    );

    const spots = buildCityLayout().playSpots;
    expect(buildPlaygroundKids(spots, CROWD.maxPedestrians)).toEqual(
      buildPlaygroundKids(spots, CROWD.maxPedestrians),
    );
  });
});

describe("밤에는 거리가 비는가", () => {
  it("밤이 한낮보다 적다", () => {
    const noon = crowdCountFor(SPECS.length, "noon");
    const night = crowdCountFor(SPECS.length, "night");
    expect(night, `한낮 ${noon}명 vs 밤 ${night}명`).toBeLessThan(noon);
  });

  it("한낮에는 전부 나온다", () => {
    expect(crowdCountFor(SPECS.length, "noon")).toBe(SPECS.length);
  });

  it("밤에도 아주 비지는 않는다 — 유령 도시가 되면 그건 다른 게임이다", () => {
    const night = crowdCountFor(SPECS.length, "night");
    expect(night, `밤 ${night}명`).toBeGreaterThan(0);
  });

  it("모든 시간대에서 수가 정해진다", () => {
    // 새 시간대를 추가하고 여기를 빠뜨리면 그 시간대에 군중이 사라지거나 넘친다
    for (const id of TIME_OF_DAY_ORDER) {
      const count = crowdCountFor(SPECS.length, id);
      expect(count, `${id}: ${count}`).toBeGreaterThan(0);
      expect(count, `${id}: ${count} > ${SPECS.length}`).toBeLessThanOrEqual(SPECS.length);
    }
  });

  it("0명이 들어오면 0명이 나온다 — 저사양에서 군중이 없을 수 있다", () => {
    for (const id of TIME_OF_DAY_ORDER) {
      expect(crowdCountFor(0, id), `${id}`).toBe(0);
    }
  });
});
