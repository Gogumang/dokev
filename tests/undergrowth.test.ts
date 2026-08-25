import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { UNDERGROWTH_PALETTE } from "@/game/world/cityPalettes";
import { zoneAt } from "@/game/world/districts";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";

/*
 * 발밑 잡초.
 *
 * 나무를 심고 잔디를 깔았는데도 자연 구역 바닥이 매끈한 초록 판이었다.
 * 나무는 머리 위에 있고 잔디는 무늬라, 발밑에는 아무것도 없었다 — 그러면
 * **달릴 때 속도가 느껴지지 않는다.** 지나가는 것이 없으면 지나가고 있다는
 * 감각도 없다.
 */

const layout = buildCityLayout();
const items = layout.undergrowth;

describe("어디에 나는가", () => {
  it("자연 구역에만 난다", () => {
    expect(layout.undergrowth.length, "잡초가 하나도 없다").toBeGreaterThan(100);

    const strays = layout.undergrowth.filter((piece) => isUrbanBlock(piece.blockIndex));
    expect(strays.length, `도시 구역의 잡초 ${strays.length}개`).toBe(0);
  });

  it("숲·공원·옛 마을·해안 모두에 난다", () => {
    /*
     * 하나라도 비면 그 구역만 예전처럼 매끈한 바닥으로 남는다. 「전체 수가
     * 많다」로는 못 잡는다 — 숲에만 잔뜩 나도 통과한다.
     */
    const covered = new Set(layout.undergrowth.map((p) => zoneForBlock(p.blockIndex).id));
    for (const id of ["forest", "park", "shrine", "coast"] as const) {
      expect(covered.has(id), `${id}에 잡초가 없다`).toBe(true);
    }
  });

  it("구역마다 섞임이 다르다", () => {
    /*
     * 같은 물건을 밀도만 달리해 뿌리면 「초록이 짙은 공원」이지 숲이 아니다.
     * 해안은 바위·마른 풀이 대부분이고 공원은 꽃이 많아야 한다.
     */
    const shareOf = (zone: string, tones: readonly number[]) => {
      const inZone = layout.undergrowth.filter((p) => zoneForBlock(p.blockIndex).id === zone);
      expect(inZone.length, `${zone}에 잡초가 없다`).toBeGreaterThan(0);
      return inZone.filter((p) => tones.includes(p.tone)).length / inZone.length;
    };

    // 팔레트 순서: 0 짙은 잎, 1 옅은 잎, 2 바위, 3·4 꽃, 5 마른 풀
    const forestLeaf = shareOf("forest", [0, 1]);
    const coastLeaf = shareOf("coast", [0, 1]);
    expect(
      forestLeaf,
      `숲 잎 비율 ${(forestLeaf * 100).toFixed(0)}% vs 해안 ${(coastLeaf * 100).toFixed(0)}%`,
    ).toBeGreaterThan(coastLeaf);

    const parkFlower = shareOf("park", [3, 4]);
    const forestFlower = shareOf("forest", [3, 4]);
    expect(
      parkFlower,
      `공원 꽃 비율 ${(parkFlower * 100).toFixed(0)}% vs 숲 ${(forestFlower * 100).toFixed(0)}%`,
    ).toBeGreaterThan(forestFlower);
  });
});

describe("자리가 맞는가", () => {
  it("건물 안에서 자라지 않는다", () => {
    const stuck: string[] = [];
    for (const piece of layout.undergrowth) {
      const hit = layout.buildings.find(
        (b) =>
          b.blockIndex === piece.blockIndex &&
          Math.abs(piece.x - b.x) < b.width / 2 &&
          Math.abs(piece.z - b.z) < b.depth / 2,
      );
      if (hit) stuck.push(`(${piece.x.toFixed(1)}, ${piece.z.toFixed(1)})`);
    }
    expect(stuck.slice(0, 5), `건물 안의 잡초 ${stuck.length}개`).toEqual([]);
  });

  it("연못과 놀이터를 피한다", () => {
    // 수면 위의 덤불은 물에 심은 화분이다
    const wet = layout.undergrowth.filter((piece) =>
      layout.treeExclusions.some(
        (spot) => Math.hypot(spot.x - piece.x, spot.z - piece.z) < spot.radius,
      ),
    );
    expect(wet.length, `비워 둔 자리의 잡초 ${wet.length}개`).toBe(0);
  });

  it("구역 밖으로 삐져나오지 않는다", () => {
    const half = CITY.blockSize / 2;
    for (const piece of layout.undergrowth) {
      const { cx, cz } = blockCenter(piece.blockIndex);
      expect(Math.abs(piece.x - cx), `x ${piece.x}`).toBeLessThan(half);
      expect(Math.abs(piece.z - cz), `z ${piece.z}`).toBeLessThan(half);
    }
  });

  it("땅에 묻혀 있다 — 잔디 위에 얹혀 있지 않다", () => {
    /*
     * 둥근 덩어리는 아래쪽이 좁아 지면과 닿는 자리가 점이 된다. 파묻지
     * 않으면 공에 가까운 것이 잔디 위에 **얹혀** 보이고, 비탈에서는 아예 뜬다.
     */
    for (const piece of layout.undergrowth) {
      expect(
        piece.sink ?? 0,
        `(${piece.x.toFixed(1)}, ${piece.z.toFixed(1)}) 파묻기`,
      ).toBeGreaterThan(0);
    }
  });

  it("무릎 아래에 머문다", () => {
    /*
     * 이름이 「발밑」이다. 사람 키를 넘으면 덤불이 아니라 나무이고, 3인칭
     * 카메라가 어깨 너머라 시야를 막는다.
     */
    for (const piece of layout.undergrowth) {
      expect(piece.height, `높이 ${piece.height.toFixed(2)}m`).toBeLessThan(1.5);
      expect(piece.height, `높이 ${piece.height.toFixed(2)}m`).toBeGreaterThan(0.15);
    }
  });

  it("종류마다 키가 다르다", () => {
    /*
     * 셋이 같은 높이면 색만 다른 같은 물건이 흩어진 것으로 보인다.
     * 덤불은 무릎, 바위는 정강이, 꽃과 마른 풀은 발목이다.
     */
    const meanHeight = (tones: readonly number[]) => {
      const picked = layout.undergrowth.filter((p) => tones.includes(p.tone));
      expect(picked.length, `tone ${tones.join(",")} 없음`).toBeGreaterThan(0);
      return picked.reduce((sum, p) => sum + p.height, 0) / picked.length;
    };

    const bush = meanHeight([0, 1]);
    const flower = meanHeight([3, 4]);
    expect(bush, `덤불 ${bush.toFixed(2)}m vs 꽃 ${flower.toFixed(2)}m`).toBeGreaterThan(
      flower * 1.5,
    );
  });
});

/*
 * 철쭉.
 *
 * 벚꽃은 머리 위에 있어 올려다볼 때만 보인다. 참고하는 트레일러 화면의 분홍은
 * **절반이 눈높이**에 있다 — 담 아래를 채운 철쭉 무더기다.
 */
describe("철쭉", () => {
  /** 팔레트에서 철쭉 두 색의 시작 번호 (`undergrowth.TONE`) */
  const AZALEA_TONE_START = 6;
  const azaleas = items.filter((item) => item.tone >= AZALEA_TONE_START);

  it("실제로 핀다", () => {
    expect(azaleas.length, `철쭉 ${azaleas.length}덩어리`).toBeGreaterThan(30);
  });

  it("무더기로 난다 — 분홍 공 하나가 아니다", () => {
    /*
     * 하나로 두면 잔디에 분홍 공이 놓인 것으로 보인다. 겹쳐 놓아야 윤곽이
     * 울퉁불퉁해져 꽃덤불이 된다. 「이웃이 있는가」로 잰다.
     */
    const lonely = azaleas.filter(
      (a) => !azaleas.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 1.6),
    );
    expect(lonely.length, `혼자 있는 철쭉 ${lonely.length}덩어리`).toBe(0);
  });

  it("눈높이 아래에서 옆으로 번진다", () => {
    /*
     * 위로 서면 꽃나무 묘목이 된다. 담 아래를 메우려면 낮고 넓어야 한다 —
     * 폭이 높이보다 확실히 커야 한다.
     */
    for (const bush of azaleas) {
      expect(bush.height, `높이 ${bush.height.toFixed(2)}m — 묘목처럼 섰다`).toBeLessThan(1.4);
      expect(
        bush.width / bush.height,
        `폭/높이 ${(bush.width / bush.height).toFixed(2)}`,
      ).toBeGreaterThan(1.3);
    }
  });

  it("들꽃보다 크다 — 같은 크기면 색만 다른 같은 물건이다", () => {
    const flowers = items.filter((item) => item.tone === 3 || item.tone === 4);
    expect(flowers.length, "들꽃이 없다").toBeGreaterThan(0);
    const widestFlower = Math.max(...flowers.map((f) => f.width));
    const narrowestAzalea = Math.min(...azaleas.map((a) => a.width));
    expect(
      narrowestAzalea,
      `가장 작은 철쭉 ${narrowestAzalea.toFixed(2)} vs 가장 큰 들꽃 ${widestFlower.toFixed(2)}`,
    ).toBeGreaterThan(widestFlower);
  });

  it("옛 마을에 가장 많다 — 돌담 아래가 그 그림이다", () => {
    const shareIn = (zone: string) => {
      const here = items.filter((item) => zoneAt(item.x, item.z).id === zone);
      if (here.length === 0) return 0;
      return here.filter((item) => item.tone >= AZALEA_TONE_START).length / here.length;
    };
    expect(shareIn("shrine"), `옛 마을 ${(shareIn("shrine") * 100).toFixed(0)}%`).toBeGreaterThan(
      shareIn("forest"),
    );
    expect(shareIn("shrine")).toBeGreaterThan(shareIn("coast"));
  });

  it("팔레트가 톤 수와 맞는다", () => {
    // 어긋나면 철쭉이 바위색이 되는데 배치 값은 멀쩡해서 코드로는 안 보인다
    const source = readFileSync("src/game/world/undergrowth.ts", "utf8");
    const block = /const TONE = \{([\s\S]*?)\} as const;/.exec(source);
    expect(
      block,
      "undergrowth.ts의 TONE을 못 읽었다 — 검사가 아무것도 안 보고 있다",
    ).not.toBeNull();
    if (!block) return;

    const tones = (block[1].match(/\w+:\s*\d/g) ?? []).length;
    expect(UNDERGROWTH_PALETTE.length, `색 ${UNDERGROWTH_PALETTE.length}개 / 톤 ${tones}개`).toBe(
      tones,
    );
  });
});
