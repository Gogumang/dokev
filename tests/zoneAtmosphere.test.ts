import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { QUALITY_PRESETS } from "@/game/systems/quality";
import { ZONES, type ZoneId } from "@/game/world/zones";

/*
 * 구역별 공기.
 *
 * 건물과 나무를 갈라 놓아도 **공기가 같으면 같은 날씨의 같은 도시**다. 숲은
 * 이름이 「안개 숲」인데 번화가와 똑같이 맑았고, 해안은 「윤슬」이라면서 시야가
 * 도심과 같았다.
 *
 * 화면에서만 보이는 값이라 검사가 잡기 어렵다. 그래서 **관계**를 잰다 —
 * 「숲이 도심보다 짙다」, 「어떤 품질에서도 안개가 꺼지지 않는다」처럼.
 */

const moods = Object.values(ZONES).map((zone) => ({ id: zone.id, ...zone.mood }));

describe("구역별 안개", () => {
  it("이름이 말하는 대로 짙고 옅다", () => {
    /*
     * 숫자를 베끼지 않고 **구역끼리 비교**한다. 값을 통째로 바꿔도 서로의
     * 관계가 남아 있으면 화면의 뜻은 유지된다.
     */
    const forest = ZONES.forest.mood;
    const downtown = ZONES.downtown.mood;
    const coast = ZONES.coast.mood;

    expect(
      forest.fogFarScale,
      `안개 숲(${forest.fogFarScale})이 번화가(${downtown.fogFarScale})보다 트여 있다`,
    ).toBeLessThan(downtown.fogFarScale);

    expect(
      coast.fogFarScale,
      `해안(${coast.fogFarScale})이 번화가(${downtown.fogFarScale})보다 답답하다`,
    ).toBeGreaterThan(downtown.fogFarScale);
  });

  it("짙게 만들 때 시작과 끝을 함께 당긴다", () => {
    /*
     * 시작만 당기고 끝을 그대로 두면 **안개가 옅게 길게** 깔린다 — 짙어지는
     * 게 아니라 뿌옇게 늘어난다. 1보다 작은 구역은 둘 다 작아야 한다.
     */
    for (const mood of moods) {
      if (mood.fogNearScale >= 1) continue;
      expect(
        mood.fogFarScale,
        `${mood.id}: near ${mood.fogNearScale}인데 far ${mood.fogFarScale}`,
      ).toBeLessThan(1);
    }
  });

  it("어떤 품질에서도 안개가 뒤집히지 않는다", () => {
    /*
     * `near >= far`면 three가 안개를 **통째로 꺼 버린다** — 가장 짙어야 할
     * 숲이 가장 맑아지는, 부호 하나 뒤집힌 종류의 결함이다. 컴포넌트가
     * 최소 간격으로 막고 있지만, 프리셋 자체가 뒤집히지 않는지 먼저 본다.
     */
    for (const quality of Object.values(QUALITY_PRESETS)) {
      for (const mood of moods) {
        const near = quality.fogNear * mood.fogNearScale;
        const far = quality.fogFar * mood.fogFarScale;
        expect(near, `${mood.id} @ near ${near.toFixed(1)} / far ${far.toFixed(1)}`).toBeLessThan(
          far,
        );
      }
    }
  });

  it("색조가 시간대를 이기지 않는다", () => {
    /*
     * 구역은 시간대 **위에 얹히는** 것이다. 섞는 세기가 크면 밤에도 낮의
     * 구역 색이 남아, 시간대를 넷 만들어 둔 의미가 사라진다.
     */
    for (const mood of moods) {
      expect(mood.tintStrength, `${mood.id} 색조 세기 ${mood.tintStrength}`).toBeGreaterThan(0);
      expect(mood.tintStrength, `${mood.id} 색조 세기 ${mood.tintStrength}`).toBeLessThanOrEqual(
        0.35,
      );
    }
  });

  it("모든 구역이 공기를 갖는다", () => {
    // 하나라도 빠지면 그 구역만 조용히 광장의 공기를 쓴다
    for (const id of Object.keys(ZONES) as ZoneId[]) {
      expect(ZONES[id].mood, `${id}에 mood가 없다`).toBeDefined();
      expect(ZONES[id].mood.tint, `${id} 색조`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("배선", () => {
  const scene = readCode("src/game/scene/GameScene.tsx");
  const atmosphere = readCode("src/game/world/ZoneAtmosphere.tsx");

  it("씬이 실제로 걸어 둔다", () => {
    /*
     * 이 저장소에서 가장 흔했던 결함은 「값은 맞는데 화면에 안 나온다」였다.
     * 구역마다 공기를 적어 두고 컴포넌트를 만들어도, 씬에 걸지 않으면
     * 검사는 전부 통과하고 화면만 예전 그대로다.
     */
    expect(scene, "GameScene이 ZoneAtmosphere를 걸지 않는다").toContain("<ZoneAtmosphere");
  });

  it("매 프레임 setState를 하지 않는다", () => {
    // 구역이 바뀔 때마다 리렌더하면 씬 전체가 다시 조립된다
    expect(atmosphere).not.toMatch(/useState|setState/);
    expect(atmosphere, "useFrame에서 고치지 않는다").toContain("useFrame");
  });

  it("안개가 뒤집히지 않게 막아 둔다", () => {
    // 숲은 시작을 0.46배까지 당긴다 — 품질에 따라 끝을 앞지를 수 있다
    expect(atmosphere, "최소 간격이 없다").toContain("MIN_FOG_SPAN");
    expect(atmosphere).toMatch(/Math\.max\(state\.far, state\.near \+ MIN_FOG_SPAN\)/);
  });
});
