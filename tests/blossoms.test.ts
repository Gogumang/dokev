import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildCityDetails } from "@/game/world/cityDetails";
import { buildCityLayout } from "@/game/world/cityLayout";
import { CROWN_PALETTE } from "@/game/world/cityPalettes";
import { zoneAt } from "@/game/world/districts";
import { ZONES, type ZoneId } from "@/game/world/zones";

/*
 * 벚꽃.
 *
 * 사람이 도깨비 트레일러 화면을 보여 주며 「이거처럼 만들어봐」라고 했다.
 * 그 화면의 색을 만드는 것은 초록이 아니라 **분홍**이다 — 벚꽃과 철쭉이
 * 화면의 절반을 차지한다. 이쪽 나무는 초록 한 가지뿐이라 구역을 아무리
 * 갈라도 「초록 나무가 몇 그루냐」로만 달랐다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);

/** 잎 색 두 개 다음이 꽃 색 두 개다 (`trees.CROWN_TONE`) */
const BLOSSOM_TONE_START = 2;
const isBlossom = (crown: { tone: number }) => crown.tone >= BLOSSOM_TONE_START;

const crowns = details.treeCrowns;

/** 활엽수 한 그루가 내놓는 둥근 덩어리 수 */
const BROADLEAF_LOBES = 2;

/**
 * 꽃나무 비율 — **나무 수로 잰다.**
 *
 * 수관 수로 재면 안 된다. 침엽수는 원뿔(`treeCones`)로 따로 나가므로, 숲의
 * 둥근 수관은 벚나무의 것뿐이라 **비율이 100%로 나온다.** 처음에 그렇게
 * 재고 「숲이 통째로 분홍이다」로 읽을 뻔했다 — 실제로는 스무 그루 중 한
 * 그루였다.
 */
function blossomShare(id?: ZoneId): number {
  const inZone = <T extends { x: number; z: number }>(items: readonly T[]) =>
    id ? items.filter((item) => zoneAt(item.x, item.z).id === id) : items;

  const stems = inZone(details.treeTrunks).length;
  if (stems === 0) return 0;
  return inZone(crowns).filter(isBlossom).length / BROADLEAF_LOBES / stems;
}

describe("벚꽃이 피는가", () => {
  it("실제로 핀다", () => {
    const blossoms = crowns.filter(isBlossom);
    expect(blossoms.length, `꽃 수관 ${blossoms.length} / 전체 ${crowns.length}`).toBeGreaterThan(20);
  });

  it("초록을 밀어내지는 않는다", () => {
    // 전부 분홍이면 계절이 하나뿐인 것은 마찬가지다 — 방향만 바뀐다
    const share = blossomShare();
    expect(share, `꽃나무 비율 ${(share * 100).toFixed(0)}%`).toBeLessThan(0.6);
  });

  it("한 나무는 한 계열이다 — 반은 초록 반은 분홍인 나무가 없다", () => {
    /*
     * 수관은 나무마다 덩어리 여럿이고 서로 크게 겹친다. 덩어리마다 색을 따로
     * 뽑으면 한 나무가 얼룩이 된다 — 그래서 결정은 `pushTree`가 한 번만 하고
     * `pushBroadleafCrown`에 넘긴다. 그 계약을 여기서 지킨다.
     *
     * 가까이 붙은 두 덩어리는 같은 나무의 것이다. 0.5m는 덩어리 반지름보다
     * 훨씬 작아 다른 나무끼리 걸릴 수 없다.
     */
    const mixed: string[] = [];
    for (let i = 0; i < crowns.length; i += 1) {
      for (let j = i + 1; j < crowns.length; j += 1) {
        const a = crowns[i];
        const b = crowns[j];
        if (Math.hypot(a.x - b.x, a.z - b.z) > 0.5) continue;
        if (isBlossom(a) !== isBlossom(b)) mixed.push(`(${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
      }
    }
    expect(mixed.slice(0, 5), `계열이 섞인 나무 ${mixed.length}그루`).toEqual([]);
  });

  it("꽃 수관 수가 짝수다 — 활엽수는 덩어리 둘씩이다", () => {
    // 홀수면 어느 나무 하나가 덩어리 하나를 다른 계열로 냈다는 뜻이다
    const blossoms = crowns.filter(isBlossom).length;
    expect(blossoms % 2, `꽃 수관 ${blossoms}개`).toBe(0);
  });
});

describe("어디에 피는가", () => {
  /** 그 구역에 심은 나무 중 꽃나무의 비율 */
  const shareIn = (id: ZoneId) => blossomShare(id);

  it("야자 구역에는 한 그루도 없다", () => {
    // 야자수 사이에 벚나무가 서면 계절이 아니라 오류로 보인다
    expect(ZONES.coast.blossomChance, "해안의 꽃나무 비율").toBe(0);
    expect(shareIn("coast"), `해안 꽃 비율 ${shareIn("coast")}`).toBe(0);
  });

  it("숲은 초록이 정체성이다", () => {
    // 숲까지 분홍으로 물들이면 「방향마다 다른 것이 나온다」가 다시 무너진다
    expect(shareIn("forest"), `숲 꽃 비율 ${(shareIn("forest") * 100).toFixed(0)}%`).toBeLessThan(0.25);
  });

  it("구역마다 비율이 다르다 — 한 값으로 전부 칠하지 않는다", () => {
    const values = new Set(Object.values(ZONES).map((zone) => zone.blossomChance));
    expect(values.size, `서로 다른 비율 ${values.size}가지`).toBeGreaterThan(3);
  });

  it("침엽수 구역에도 벚나무가 선다 — 종류를 색으로 바꾸지 않았다", () => {
    /*
     * 벚나무는 활엽수다. 침엽수 구역(옛 마을)에서 「소나무에 분홍 잎」이
     * 되면 오류로 보이고, 「소나무 사이의 벚나무」가 되어야 그림이 된다.
     * 그래서 꽃나무는 구역 종류보다 **먼저** 정해지고 둥근 수관을 쓴다.
     */
    expect(ZONES.shrine.treeSpecies, "옛 마을은 침엽수 구역이다").toBe("conifer");
    const here = crowns.filter((crown) => zoneAt(crown.x, crown.z).id === "shrine");
    expect(here.length, "옛 마을에 둥근 수관이 없다").toBeGreaterThan(0);
    expect(here.every(isBlossom), "옛 마을의 둥근 수관은 전부 벚나무여야 한다").toBe(true);
  });
});

describe("색과 배선", () => {
  /** 사람 눈이 느끼는 밝기(0~1) */
  function luminance(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    return (
      (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255
    );
  }

  it("팔레트가 톤 수와 맞는다", () => {
    // 어긋나면 벚나무가 초록이 되는데 배치 값은 멀쩡해서 코드로는 안 보인다
    const source = readFileSync("src/game/world/trees.ts", "utf8");
    const block = /const CROWN_TONE = \{([\s\S]*?)\} as const;/.exec(source);
    expect(block, "trees.ts의 CROWN_TONE을 못 읽었다 — 검사가 아무것도 안 보고 있다").not.toBeNull();
    if (!block) return;

    const families = (block[1].match(/\w+:\s*\d/g) ?? []).length;
    // 계열마다 두 색씩 — 한 색이면 나무가 전부 같은 초록(또는 분홍)이 된다
    expect(CROWN_PALETTE.length, `색 ${CROWN_PALETTE.length}개 / 계열 ${families}개`).toBe(
      families * 2,
    );
  });

  it("꽃이 잎보다 밝다 — 초록 사이에서 눈에 걸려야 한다", () => {
    const leaf = Math.max(...CROWN_PALETTE.slice(0, 2).map(luminance));
    const blossom = Math.min(...CROWN_PALETTE.slice(2).map(luminance));
    expect(blossom, `꽃 ${blossom.toFixed(2)} vs 잎 ${leaf.toFixed(2)}`).toBeGreaterThan(leaf);
  });

  it("꽃 색이 흰색으로 날아가지 않는다", () => {
    /*
     * 순백에 가까우면 하늘·구름과 붙어 실루엣이 사라진다 — 분홍이 남아 있어야
     * **꽃으로** 읽힌다. 붉은 쪽과 푸른 쪽의 차이로 잰다.
     */
    for (const hex of CROWN_PALETTE.slice(2)) {
      const value = Number.parseInt(hex.slice(1), 16);
      const red = (value >> 16) & 255;
      const blue = value & 255;
      expect(red - blue, `${hex}의 붉은 기 ${red - blue}`).toBeGreaterThan(10);
    }
  });

  it("꽃나무를 정할 때 씨앗을 소비하지 않는다", () => {
    /*
     * **이 검사가 실제 회귀에서 나왔다.**
     *
     * 처음에는 `random() < zone.blossomChance`로 정했다. 그 한 번의 호출이
     * 씨앗 순서를 밀어 뒤따르는 생성기(좌판·잡초·네온)가 전부 다른 수를
     * 받았고, 나무 한 그루가 소품 위로 옮겨 앉아 `worldConsistency`가 잡았다.
     * **색을 더하는 변경이 배치를 건드리면 안 된다.**
     */
    const source = readFileSync("src/game/world/trees.ts", "utf8");
    expect(source, "좌표 해시(blossomAt)를 쓰지 않는다").toContain("blossomAt(");
    expect(source).not.toMatch(/random\(\)\s*<\s*zone\.blossomChance/);
  });
});
