import { describe, expect, it } from "vitest";

import { GRAPPLE } from "@/game/config/tuning";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";

/**
 * 그래플 사거리 안에 걸 것이 있는가.
 *
 * `worldConsistency`에서 떼어 냈다 — 그 파일이 1200줄 상한에 닿았고, 상한이
 * 「이 묶음은 다른 책임인가」를 묻게 했다. 답은 그렇다였다: 나머지는 배치가
 * 서로 맞는지를 보는데, 이 묶음은 **이동이 막히지 않는지**를 본다.
 *
 * 자연 구역에서 가로등을 걷어내고 선돌을 세우면서 한 번 막혔던 자리다.
 */
describe("어디서든 그래플을 걸 수 있는가", () => {
  /*
   * 퀘스트 안내가 「G (가로등을 보고)」라고 말한다. 가로등이 드문 곳에 서면
   * 그 말이 거짓이 된다 — 눌러도 아무 일이 없고, 사람은 자기가 잘못한 줄 안다.
   *
   * 재 보니 가로등 384개, 무작위 200곳 어디서도 사거리(24m) 안에 있다.
   * 최악이 18.9m다.
   */
  const layout = buildCityLayout();

  /** 시드 난수 — 프로젝트 규칙상 Math.random을 쓰지 않는다 */
  function seeded(seed: number): number {
    return ((seed * 9301 + 49297) % 233280) / 233280;
  }

  /*
   * 재는 대상이 가로등에서 **그래플 앵커 목록**으로 바뀌었다.
   *
   * 자연 구역에서 가로등을 걷어내고 선돌을 세웠다. 계속 `streetLamps`를 재면
   * 숲이 통째로 사거리 밖으로 보이는데 **실제로는 걸린다** — 검사가 제품이
   * 쓰는 것과 다른 것을 재고 있었던 셈이다. 그래플이 실제로 읽는 목록을 잰다.
   */
  function nearestAnchor(x: number, z: number): number {
    return Math.min(
      ...layout.grappleAnchors.map((anchor) => Math.hypot(anchor.x - x, anchor.z - z)),
    );
  }

  it("도시 어디에 서도 사거리 안에 걸 것이 있다", () => {
    const failures: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const x = (seeded(i * 7 + 1) - 0.5) * layout.halfExtent * 1.6;
      const z = (seeded(i * 13 + 5) - 0.5) * layout.halfExtent * 1.6;
      const distance = nearestAnchor(x, z);
      if (distance > GRAPPLE.maxRange) {
        failures.push(`(${x.toFixed(0)}, ${z.toFixed(0)}) 최근접 ${distance.toFixed(1)}m`);
      }
    }
    expect(failures, `사거리 밖:\n${failures.slice(0, 5).join("\n")}`).toEqual([]);
  });

  it("스폰 바로 앞에도 있다", () => {
    // 첫 판에서 그래플을 배우려면 시작하자마자 걸 대상이 보여야 한다
    const distance = nearestAnchor(layout.spawn.x, layout.spawn.z);
    expect(distance, `스폰에서 ${distance.toFixed(1)}m`).toBeLessThan(GRAPPLE.maxRange);
  });

  it("사거리가 앵커 간격보다 넉넉하다", () => {
    /*
     * 사거리를 줄이거나 앵커를 솎아 내면 위 검사가 먼저 걸린다. 다만
     * 「왜 24m인가」는 배치에서 나온 값이라는 것을 여기서 남긴다.
     */
    expect(
      layout.grappleAnchors.length,
      `앵커 ${layout.grappleAnchors.length}개`,
    ).toBeGreaterThan(100);
  });

  it("자연 구역에도 걸 것이 있다", () => {
    /*
     * 「도시 어디에 서도」는 표본 200점이라 숲 한 칸이 통째로 비어도 운이
     * 좋으면 지나간다. 자연 구역마다 하나 이상 있는지를 따로 못 박는다 —
     * 없으면 그 숲에서 이동이 막힌다.
     */
    const natureBlocks = Array.from(
      { length: CITY.gridSize * CITY.gridSize },
      (_, i) => i,
    ).filter((i) => !isUrbanBlock(i));

    for (const blockIndex of natureBlocks) {
      const { cx, cz } = blockCenter(blockIndex);
      const distance = nearestAnchor(cx, cz);
      expect(
        distance,
        `${zoneForBlock(blockIndex).id} 구역 ${blockIndex} 중심에서 ${distance.toFixed(1)}m`,
      ).toBeLessThanOrEqual(GRAPPLE.maxRange);
    }
  });
});
