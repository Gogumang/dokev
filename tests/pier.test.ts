import { describe, expect, it } from "vitest";

import { buildCityLayout } from "@/game/world/cityLayout";
import { buildPier, PIER, pierDeckY, pierStartX, pierTip } from "@/game/world/pier";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";

/*
 * 해안의 부두.
 *
 * 낚시를 하려면 **물가에 설 자리**가 먼저 있어야 한다. 배치를 손으로 적어 두면
 * 지형이 바뀔 때 부두가 육지 한복판이나 먼바다에 서 있게 되는데, 그건 화면을
 * 봐야만 안다 — 이 저장소가 도깨비 자리와 거치대에서 이미 두 번 겪은 종류다.
 */
const layout = buildCityLayout();

describe("어디에 서 있는가", () => {
  it("도시 안에서 시작해 물 쪽으로 나간다", () => {
    const start = pierStartX(layout.halfExtent);
    const tip = pierTip(layout.halfExtent);
    expect(start, `시작 ${start}, 도시 끝 ${layout.halfExtent}`).toBeLessThan(layout.halfExtent);
    expect(tip.x, `끝 ${tip.x}`).toBeGreaterThan(layout.halfExtent);
  });

  it("끝이 물 위다 — 육지에 선 부두는 다리다", () => {
    /*
     * **지형 높이로 재지 않는다.** 이 세계의 물은 지형이 낮아서 생긴 것이 아니라
     * 도시 가장자리 바깥에 깔린 수면이다(`Sea.tsx`의 고리) — 지형은 어디서나
     * 수면보다 위다. 처음에 높이로 쟀다가 「물에 안 닿는다」로 걸렸다.
     */
    expect(pierTip(layout.halfExtent).x, "부두 끝이 물에 안 닿는다").toBeGreaterThan(
      layout.halfExtent,
    );
  });

  it("데크가 수면 위에 있다", () => {
    const deck = pierDeckY(layout.halfExtent);
    expect(deck, `데크 ${deck}, 수면 ${SEA_LEVEL}`).toBeGreaterThan(SEA_LEVEL);
  });

  it("데크가 땅에 묻히지 않는다", () => {
    /*
     * 이 해안은 모래밭이 아니라 **절벽**이다 — 지형은 어디서나 수면보다 위고
     * 물은 도시 가장자리 바깥에서 시작한다. 수면 기준으로 데크를 놓으면
     * 육지 쪽 끝이 땅속에 묻힌다. 실제로 그렇게 만들었다가 여기서 걸렸다.
     */
    const start = pierStartX(layout.halfExtent);
    const deck = pierDeckY(layout.halfExtent);
    expect(
      deck,
      `데크 ${deck.toFixed(2)}, 땅 ${terrainHeight(start, 0).toFixed(2)}`,
    ).toBeGreaterThan(terrainHeight(start, 0));
  });
});

describe("무엇으로 만들어졌는가", () => {
  const boxes = buildPier(layout.halfExtent);

  it("널판이 이어져 있다 — 사이가 벌어지면 걸어 나갈 수 없다", () => {
    const planks = boxes
      .filter((box) => box.height === PIER.plankThickness)
      .sort((a, b) => a.x - b.x);

    expect(planks.length, `널판 ${planks.length}장`).toBe(PIER.plankCount);
    for (let i = 1; i < planks.length; i += 1) {
      const gap = planks[i].x - planks[i - 1].x - PIER.plankLength;
      expect(Math.abs(gap), `${i}번째에서 ${gap.toFixed(2)}m 벌어졌다`).toBeLessThan(0.01);
    }
  });

  it("받치는 기둥이 있다 — 없으면 널판이 공중에 뜬 것으로 보인다", () => {
    const posts = boxes.filter((box) => box.width === PIER.postSide);
    expect(posts.length, "기둥이 없다").toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.y, "기둥이 데크 위에 있다").toBeLessThan(pierDeckY(layout.halfExtent));
    }
  });

  it("두 번 만들어도 같다", () => {
    expect(buildPier(layout.halfExtent)).toEqual(boxes);
  });

  it("널판이 물 위를 지난다 — 육지에만 있으면 낚시할 자리가 없다", () => {
    // 물은 도시 가장자리 바깥에서 시작한다(`Sea.tsx`의 고리)
    const overWater = boxes.filter(
      (box) => box.height === PIER.plankThickness && box.x > layout.halfExtent,
    );
    expect(overWater.length, `물 위 널판 ${overWater.length}장`).toBeGreaterThan(1);
  });

  it("기둥이 물까지 내려간다 — 짧으면 널판이 허공에 뜬 것으로 보인다", () => {
    const posts = boxes.filter((box) => box.width === PIER.postSide);
    for (const post of posts) {
      const bottom = post.y - post.height / 2;
      expect(bottom, `기둥 밑이 ${bottom.toFixed(2)}`).toBeLessThan(SEA_LEVEL);
    }
  });
});
