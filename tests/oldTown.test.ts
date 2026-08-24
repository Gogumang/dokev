import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "@/game/config/tuning";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import {
  OLD_TOWN_PALETTE,
  CROWN_PALETTE,
  WALL_GREEN_PALETTE,
  PLANTER_PALETTE,
  UNDERGROWTH_PALETTE,
} from "@/game/world/cityPalettes";
import { WALL_TOTAL_HEIGHT } from "@/game/world/oldTown";
import { buildHanokRoofs, buildRoofs } from "@/game/world/roofs";
import { terrainHeight } from "@/game/world/terrain";
import { ZONE_MAP, zoneForBlock } from "@/game/world/zones";

/*
 * 옛 마을.
 *
 * 이름과 부제(「기와지붕과 돌담이 남은 자리」)를 붙여 놓고 실제로는 낮은 상자가
 * 성기게 선 동네였다. 층수와 공터 비율만 다르니 「건물이 낮은 변두리」였다.
 *
 * 담이 이 구역을 만든다. 지붕은 얹는 것이라 멀리서만 보이지만 **담은 눈높이에
 * 있어 걷는 내내 보인다.**
 */

const layout = buildCityLayout();
const shrineBlocks = ZONE_MAP.map((id, index) => ({ id, index })).filter((b) => b.id === "shrine");

/**
 * 구역 중심에서 담·문까지의 거리(m) — **배치 데이터에서 되짚는다.**
 *
 * 숫자를 베끼면 담을 옮길 때마다 검사도 같이 고쳐야 하고, 고치는 걸 잊으면
 * 검사가 옛 자리를 재면서 조용히 통과한다. 실제로 놓인 담이 어디 있는지를
 * 읽어 그걸 기준으로 삼는다.
 */
const wallReach = Math.max(
  ...layout.stoneWalls.map((wall) => {
    const { cx, cz } = blockCenter(wall.blockIndex);
    return Math.max(Math.abs(wall.x - cx), Math.abs(wall.z - cz));
  }),
);

describe("돌담", () => {
  it("옛 마을 구역마다 담이 있다", () => {
    expect(shrineBlocks.length, "옛 마을 구역이 없다").toBeGreaterThan(0);

    const covered = new Set(layout.stoneWalls.map((wall) => wall.blockIndex));
    for (const block of shrineBlocks) {
      expect(covered.has(block.index), `구역 ${block.index}에 담이 없다`).toBe(true);
    }
  });

  it("옛 마을과 시작 마당 밖에는 담이 없다", () => {
    /*
     * 「있다」만 재면 도시 전체에 담을 둘러도 통과한다. 그러면 옛 마을이
     * 특별하지 않다 — 이 항목이 하려던 일이 통째로 사라진다.
     *
     * 시작 광장을 예외로 넣었다. 첫 화면에 기와담장을 세우려고 담을 그쪽으로도
     * 가져왔다(`cityLayout`의 `isWalledCourtyard`). **두 구역만** 예외다 —
     * 세 번째를 더하려면 그때 이 검사부터 다시 읽어야 한다.
     */
    const strays = layout.stoneWalls.filter(
      (wall) =>
        zoneForBlock(wall.blockIndex).id !== "shrine" && wall.blockIndex !== CITY.plazaBlockIndex,
    );
    expect(strays.length, `옛 마을·시작 마당 밖 담 ${strays.length}개`).toBe(0);
  });

  it("시작 마당에는 담이 마주 보는 두 변에만 선다", () => {
    /*
     * 네 변을 두르면 모서리가 생기고, 목적지가 대각선에 있는 여정이 거기 끼여
     * 끝나지 않는다 — `playthrough` 두 건이 실제로 그렇게 죽었다. 문턱을 12m로
     * 넓혀도 결과가 한 자리도 안 바뀌었으니 막은 것은 변 가운데가 아니라
     * 모서리였다.
     *
     * 「담이 있다」만 재면 그 회귀를 못 잡는다. **몇 변에 섰는지**를 재야 한다.
     */
    const courtyard = layout.stoneWalls.filter((wall) => wall.blockIndex === CITY.plazaBlockIndex);
    expect(courtyard.length, "시작 마당에 담이 없다").toBeGreaterThan(0);

    const { cx, cz } = blockCenter(CITY.plazaBlockIndex);
    // 변을 가르는 기준. 구역 반 폭의 절반이면 담(가장자리)과 안쪽이 섞이지 않는다
    const near = CITY.blockSize / 4;
    const walledEdges = new Set(
      courtyard.map((wall) => {
        if (wall.z - cz < -near) return "north";
        if (wall.z - cz > near) return "south";
        return wall.x - cx < 0 ? "west" : "east";
      }),
    );
    const found = [...walledEdges].sort();
    expect(found, `담이 선 변: ${found.join(", ") || "없음"}`).toEqual(["north", "south"]);

    /*
     * **마주 보는 변인지**까지 재야 뜻이 있다. 「두 변」만 재면 이웃한 두 변으로
     * 바뀌어도 통과하는데, 그러면 사이에 모서리가 생겨 회귀가 그대로 돌아온다.
     */
    const opposite = new Map([
      ["north", "south"],
      ["east", "west"],
    ]);
    const [first, second] = found;
    expect(opposite.get(first), `${first}의 맞은편은 ${second}가 아니다`).toBe(second);
  });

  it("사방이 막혀 있지 않다 — 들어갈 수 있어야 한다", () => {
    /*
     * 담으로 네 변을 다 두르면 그 구역에 **못 들어간다.** 화면에는 멀쩡한
     * 마을이 보이는데 다가가면 벽에 막히는, 눈으로만 아는 종류의 결함이다.
     *
     * 각 변 한가운데에 사람이 지나갈 틈이 있는지로 확인한다.
     */
    for (const block of shrineBlocks) {
      const { cx, cz } = blockCenter(block.index);
      const walls = layout.stoneWalls.filter((wall) => wall.blockIndex === block.index);

      for (const [label, x, z] of [
        ["남", cx, cz + wallReach],
        ["북", cx, cz - wallReach],
        ["동", cx + wallReach, cz],
        ["서", cx - wallReach, cz],
      ] as const) {
        const blocked = walls.some(
          (wall) =>
            Math.abs(wall.x - x) < wall.width / 2 + PLAYER_RADIUS &&
            Math.abs(wall.z - z) < wall.depth / 2 + PLAYER_RADIUS,
        );
        expect(blocked, `구역 ${block.index}의 ${label}쪽 문턱이 막혔다`).toBe(false);
      }
    }
  });

  it("담이 구역을 두른다 — 마당 담이 아니다", () => {
    /*
     * 한동안 「구역 중심에서 4.2m」였다. 34m짜리 구역 한복판에 **8.4m짜리
     * 작은 담장**이 서 있었던 셈이라, 「구역을 두른다」고 적어 놓고 실제로는
     * 마당 담이었다 — 구역 가장자리로 들어오면 담을 만나지도 않았다.
     *
     * 화면으로만 알 수 있는 종류라 오래 남아 있었다. 이제 숫자로 잡는다.
     */
    const half = CITY.blockSize / 2;
    expect(wallReach, `담이 중심에서 ${wallReach.toFixed(1)}m (구역 반 폭 ${half})`).toBeGreaterThan(
      half * 0.8,
    );
    // 인도로 삐져나가면 보행자와 차가 담을 통과한다
    expect(wallReach, `담이 중심에서 ${wallReach.toFixed(1)}m`).toBeLessThan(half);
  });

  it("담이 집을 뚫지 않는다", () => {
    /*
     * 담을 가장자리로 내보내면서 집과 겹치는 자리가 생겼다. 도막을 짧게 쪼개
     * 겹치는 자리만 비운다 — 실제 마을에서도 담은 집과 집 사이를 메운다.
     */
    const stuck: string[] = [];
    for (const wall of layout.stoneWalls) {
      const hit = layout.buildings.find(
        (house) =>
          house.blockIndex === wall.blockIndex &&
          Math.abs(wall.x - house.x) < (wall.width + house.width) / 2 &&
          Math.abs(wall.z - house.z) < (wall.depth + house.depth) / 2,
      );
      if (hit) stuck.push(`(${wall.x.toFixed(1)}, ${wall.z.toFixed(1)})`);
    }
    expect(stuck.slice(0, 5), `집에 박힌 담 ${stuck.length}도막`).toEqual([]);
  });

  it("담이 사람 키보다 낮다", () => {
    /*
     * 3인칭 카메라가 어깨 너머라, 담이 눈높이를 넘으면 골목에서 **화면이
     * 담으로 막힌다.** 넘어다보이지 않되 답답하지도 않은 자리가 있다.
     *
     * 담이 **세 켜**(기단·전돌 몸통·기와 갓)가 되면서 상자 하나의 높이로는
     * 잴 수 없게 됐다 — 그대로 두었더니 기단 하나(0.28m)를 담 높이로 읽고
     * 「너무 낮다」로 걸렸다. 같은 자리에 쌓인 켜를 모아 **쌓인 높이**로 잰다.
     */
    const stacks = new Map<string, number>();
    for (const wall of layout.stoneWalls) {
      const key = `${wall.x.toFixed(2)},${wall.z.toFixed(2)}`;
      stacks.set(key, Math.max(stacks.get(key) ?? 0, wall.y + wall.height / 2));
    }
    expect(stacks.size, "담이 하나도 없다").toBeGreaterThan(10);

    for (const [key, top] of stacks) {
      expect(top, `담 (${key}) 높이 ${top.toFixed(2)}m`).toBeGreaterThan(0.8);
      expect(top, `담 (${key}) 높이 ${top.toFixed(2)}m`).toBeLessThan(1.8);
    }
  });

  it("세 켜의 밝기가 갈린다 — 기단·몸통·기와", () => {
    /*
     * 담이 담으로 보이는 것은 재질이 아니라 **켜의 대비**다. 어두운 기단,
     * 밝은 전돌, 그 위에 다시 어두운 기와. 색이 비슷하면 켜를 셋으로 쌓아
     * 놓고도 화면에서는 회색 띠 하나로 돌아간다.
     */
    const luminance = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return (
        (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255
      );
    };
    const tones = [...new Set(layout.stoneWalls.map((wall) => wall.tone))];
    expect(tones.length, `담에 쓰인 색 ${tones.length}가지`).toBeGreaterThan(2);

    const levels = tones.map((tone) => luminance(OLD_TOWN_PALETTE[tone])).sort((a, b) => a - b);
    expect(
      levels[levels.length - 1] - levels[0],
      `가장 밝은 켜와 어두운 켜의 차이 ${(levels[levels.length - 1] - levels[0]).toFixed(2)}`,
    ).toBeGreaterThan(0.3);
  });

  it("기와 갓이 몸통보다 밖으로 나온다", () => {
    /*
     * 처마가 밖으로 나와야 그 아래 그림자가 생기고, 그 그림자가 담을 두껍게
     * 만든다. 같은 폭으로 얹으면 색만 다른 띠가 하나 더 생길 뿐이다.
     */
    const bySpot = new Map<string, typeof layout.stoneWalls>();
    for (const wall of layout.stoneWalls) {
      const key = `${wall.x.toFixed(2)},${wall.z.toFixed(2)}`;
      bySpot.set(key, [...(bySpot.get(key) ?? []), wall]);
    }

    let checked = 0;
    for (const stack of bySpot.values()) {
      if (stack.length < 3) continue;
      const sorted = [...stack].sort((a, b) => a.y - b.y);
      const body = sorted[1];
      const cap = sorted[sorted.length - 1];
      // 얇은 쪽(담의 두께)으로 잰다 — 긴 쪽은 도막 길이라 켜마다 같다
      const thin = (wall: (typeof stack)[number]) => Math.min(wall.width, wall.depth);
      expect(thin(cap), `갓 ${thin(cap).toFixed(2)} / 몸통 ${thin(body).toFixed(2)}`).toBeGreaterThan(
        thin(body),
      );
      checked += 1;
    }
    expect(checked, "세 켜로 쌓인 담을 하나도 못 찾았다").toBeGreaterThan(10);
  });

  it("담 충돌체가 그 자리 지면 위에 있다", () => {
    // 평지 기준으로 두면 언덕 위 담의 윗면이 지면 아래로 내려간다
    /*
     * 담이 세 켜가 되면서 충돌체 높이가 1.3m에서 `WALL_TOTAL_HEIGHT`로 바뀌었다.
     * **숫자를 베끼지 않는다** — 배치가 내놓는 값을 그대로 기준으로 삼는다.
     */
    const walls = layout.colliders.filter((box) => {
      const height = box.top - terrainHeight((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2);
      return Math.abs(height - WALL_TOTAL_HEIGHT) < 0.01;
    });
    expect(walls.length, "담 충돌체를 못 찾았다").toBeGreaterThan(0);
  });
});

describe("홍살문", () => {
  /**
   * 그 변의 이웃 구역 번호. 격자 밖이면 -1.
   *
   * 배치와 같은 식을 쓴다 — **행이 넘어가지 않게** 열·행을 따로 본다.
   */
  const neighbour = (index: number, dx: number, dz: number) => {
    const col = (index % CITY.gridSize) + dx;
    const row = Math.floor(index / CITY.gridSize) + dz;
    if (col < 0 || col >= CITY.gridSize || row < 0 || row >= CITY.gridSize) return -1;
    return row * CITY.gridSize + col;
  };

  const SIDES = [
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
  ];

  const openSidesOf = (index: number) =>
    SIDES.filter((side) => {
      const next = neighbour(index, side.dx, side.dz);
      return next < 0 || zoneForBlock(next).id !== "shrine";
    });

  it("바깥을 향한 변마다 문이 있다", () => {
    /*
     * 한동안 남쪽 한 곳에만 세웠다. 도시가 남쪽에 있으니 그쪽에서 올라온다고
     * 본 것인데, 숲(북서)과 해안(동)에서 넘어오면 담만 보이고 문은 등 뒤에
     * 있었다 — 마을에 들어와 놓고 들어온 줄을 모른다.
     */
    for (const block of shrineBlocks) {
      const parts = layout.gates.filter((part) => part.blockIndex === block.index);
      const open = openSidesOf(block.index);
      expect(open.length, `구역 ${block.index}에 바깥 변이 없다`).toBeGreaterThan(0);
      // 문 하나가 기둥 둘 + 보 둘 = 넷
      expect(parts.length, `구역 ${block.index}: 문 조각 ${parts.length}, 바깥 변 ${open.length}`).toBe(
        open.length * 4,
      );
    }
  });

  it("마을 안쪽 경계에는 문을 세우지 않는다", () => {
    /*
     * 네 변에 다 세우면 마을을 가로지를 때마다 문을 지나게 되어 이정표가
     * 아니라 관문이 된다. 이웃도 옛 마을인 변에는 없어야 한다.
     */
    for (const block of shrineBlocks) {
      const { cx, cz } = blockCenter(block.index);
      for (const side of SIDES) {
        const next = neighbour(block.index, side.dx, side.dz);
        if (next < 0 || zoneForBlock(next).id !== "shrine") continue;

        const here = layout.gates.filter(
          (part) =>
            part.blockIndex === block.index &&
            Math.abs(part.x - (cx + side.dx * wallReach)) < 3 &&
            Math.abs(part.z - (cz + side.dz * wallReach)) < 3,
        );
        expect(here.length, `구역 ${block.index}의 안쪽 변에 문이 있다`).toBe(0);
      }
    }
  });

  it("동·서 변의 문은 보를 돌려 놓는다", () => {
    /*
     * 돌리지 않으면 보가 벽을 향해 누워 **문이 아니라 판자**로 보인다.
     * 남·북 변은 돌리지 않는다 — 둘 다 돌리면 이번엔 남쪽 문이 눕는다.
     */
    const beams = layout.gates.filter((part) => part.width > 1);
    expect(beams.length, "보를 못 찾았다").toBeGreaterThan(0);

    let turned = 0;
    let straight = 0;
    for (const beam of beams) {
      if (Math.abs(beam.rotationY ?? 0) > 0.01) turned += 1;
      else straight += 1;
    }
    expect(turned, `돌린 보 ${turned}개`).toBeGreaterThan(0);
    expect(straight, `안 돌린 보 ${straight}개`).toBeGreaterThan(0);
  });

  it("문이 담보다 훨씬 높다", () => {
    /*
     * 이정표로 쓰려고 세우는 것이다. 담과 비슷하면 멀리서 안 보이고,
     * 그러면 「문이 있다」는 사실을 걷다가 우연히 알게 된다.
     */
    const tallestWall = Math.max(...layout.stoneWalls.map((wall) => wall.height));
    const gateHeight = Math.max(...layout.gates.map((part) => part.height));
    expect(gateHeight, `문 ${gateHeight}m vs 담 ${tallestWall}m`).toBeGreaterThan(tallestWall * 2.5);
  });

  it("문 사이로 지나갈 수 있다", () => {
    /*
     * 기둥 둘 사이가 좁으면 이정표가 아니라 장애물이다.
     *
     * 문이 변마다 하나씩이므로 **같은 문의 기둥끼리** 재야 한다 — 구역의
     * 기둥을 전부 모아 재면 서로 다른 문의 기둥 사이를 재게 된다.
     */
    for (const block of shrineBlocks) {
      const { cx, cz } = blockCenter(block.index);
      const posts = layout.gates.filter(
        (part) => part.blockIndex === block.index && part.width < 1,
      );
      expect(posts.length, `구역 ${block.index} 기둥 ${posts.length}개`).toBe(
        openSidesOf(block.index).length * 2,
      );

      for (const side of openSidesOf(block.index)) {
        const gateX = cx + side.dx * wallReach;
        const gateZ = cz + side.dz * wallReach;
        const pair = posts
          .filter((post) => Math.hypot(post.x - gateX, post.z - gateZ) < 4)
          .sort((a, b) => a.x - b.x || a.z - b.z);

        expect(pair.length, `구역 ${block.index} (${side.dx}, ${side.dz})쪽 기둥`).toBe(2);
        const gap = Math.hypot(pair[1].x - pair[0].x, pair[1].z - pair[0].z) - pair[0].width;
        expect(gap, `문 폭 ${gap.toFixed(1)}m`).toBeGreaterThan(PLAYER_RADIUS * 4);
      }
    }
  });
});

describe("기와지붕", () => {
  const gable = buildRoofs(layout.buildings);
  const hanok = buildHanokRoofs(layout.buildings);

  it("옛 마을에는 기와만, 다른 곳에는 박공만 얹힌다", () => {
    /*
     * 둘 다 얹히면 같은 건물에 지붕이 두 겹으로 겹친다 — 인스턴스만 늘고
     * 실루엣은 지저분해진다. 위에서 보기 전에는 모른다.
     */
    const gableStrays = gable.filter((roof) => zoneForBlock(roof.blockIndex).id === "shrine");
    const hanokStrays = hanok.filter((roof) => zoneForBlock(roof.blockIndex).id !== "shrine");

    expect(gableStrays.length, `옛 마을의 박공지붕 ${gableStrays.length}개`).toBe(0);
    expect(hanokStrays.length, `옛 마을 밖 기와지붕 ${hanokStrays.length}개`).toBe(0);
  });

  it("기와지붕이 실제로 얹힌다", () => {
    // 한쪽이 0이면 화면은 예전 그대로다
    expect(hanok.length, "기와지붕이 하나도 없다").toBeGreaterThan(3);
    expect(gable.length, "박공지붕이 통째로 사라졌다").toBeGreaterThan(20);
  });

  it("처마가 박공보다 깊다", () => {
    /*
     * **깊은 처마가 한옥 지붕의 전부**다. 얕게 두면 그냥 색이 다른 지붕이라
     * 도형을 갈라 놓은 의미가 없다.
     */
    const eavesOf = (roofs: typeof hanok) => {
      const roof = roofs[0];
      const building = layout.buildings.find(
        (b) => Math.abs(b.x - roof.x) < 0.01 && Math.abs(b.z - roof.z) < 0.01,
      );
      expect(building, "지붕에 짝이 되는 건물이 없다").toBeDefined();
      return (roof.width - (building as { width: number }).width) / 2;
    };

    const hanokEaves = eavesOf(hanok);
    expect(hanokEaves, `기와 처마 ${hanokEaves.toFixed(2)}m`).toBeGreaterThan(0.9);
  });

  it("높은 건물에는 얹지 않는다", () => {
    // 6층 위의 기와는 박공만큼이나 어색하다
    for (const roof of hanok) {
      const building = layout.buildings.find(
        (b) => Math.abs(b.x - roof.x) < 0.01 && Math.abs(b.z - roof.z) < 0.01,
      );
      expect(building!.height, `${building!.height}m 건물에 기와`).toBeLessThan(14);
    }
  });
});

describe("옛 마을이 도시 격자를 벗어나지 않는다", () => {
  it("담과 문이 구역 안에 들어온다", () => {
    // 인도나 도로로 삐져나오면 보행자와 차가 담을 통과한다
    const half = CITY.blockSize / 2;
    for (const part of [...layout.stoneWalls, ...layout.gates]) {
      const { cx, cz } = blockCenter(part.blockIndex);
      expect(Math.abs(part.x - cx), `x ${part.x} vs 구역 중심 ${cx}`).toBeLessThan(half);
      expect(Math.abs(part.z - cz), `z ${part.z} vs 구역 중심 ${cz}`).toBeLessThan(half);
    }
  });
});

/*
 * 담 아래 화분.
 *
 * 참고 사진에서 담장 아래를 채우는 것이 이것이다. 철쭉은 이미 자연 구역에
 * 흩어 뿌리고 있었지만 **흩어진 것과 줄지어 놓인 것은 다른 물건이다** —
 * 담을 따라 늘어서야 「사람이 가꾼 골목」으로 보인다.
 */
describe("담 아래 화분", () => {
  /*
   * 나무 상자와 꽃은 **묶음이 다르다.** 도형이 달라서다 — 상자는 상자,
   * 꽃은 둥근 덩어리다. 한 묶음에 두었을 때는 꽃도 상자로 그려져 4m
   * 거리에서 납작한 판으로 읽혔다.
   */
  const boxes = layout.wallPlanters;
  /** 담에 붙는 식물 묶음에는 철쭉(0·1)과 담쟁이(2·3)가 함께 있다 */
  const IVY_TONE_START = 2;
  const flowers = layout.wallGreens.filter((item) => item.tone < IVY_TONE_START);
  const planters = [...boxes, ...flowers];

  it("실제로 놓인다", () => {
    expect(boxes.length, `화분 ${boxes.length}개`).toBeGreaterThan(8);
    expect(flowers.length, `꽃 ${flowers.length}덩어리`).toBeGreaterThan(boxes.length);
  });

  it("옛 마을과 시작 마당에만 있다", () => {
    /* 화분은 담에 기대는 물건이라 담이 선 구역을 그대로 따라간다 */
    const strays = planters.filter(
      (item) =>
        zoneForBlock(item.blockIndex).id !== "shrine" && item.blockIndex !== CITY.plazaBlockIndex,
    );
    expect(strays.length, `옛 마을·시작 마당 밖의 화분 ${strays.length}개`).toBe(0);
  });

  it("담이 실제로 선 자리에만 놓인다", () => {
    /*
     * **이 검사가 실제 결함에서 나왔다.**
     *
     * 처음에는 담 도막 번호만 보고 놓았는데, 집에 막혀 담을 건너뛴 자리에도
     * 화분이 섰다 — 담 없는 허공에 화분이 줄지어 있는 셈이었다. 화분은 담에
     * 기대는 물건이라 담이 없으면 놓을 이유가 없다.
     */
    for (const box of boxes) {
      const beside = layout.stoneWalls.some(
        (wall) =>
          wall.blockIndex === box.blockIndex && Math.hypot(wall.x - box.x, wall.z - box.z) < 1.2,
      );
      expect(beside, `화분 (${box.x.toFixed(1)}, ${box.z.toFixed(1)}) 옆에 담이 없다`).toBe(true);
    }
  });

  it("담을 가리지 않는다 — 띄엄띄엄 놓인다", () => {
    /*
     * 도막마다 놓으면 화분이 아니라 울타리가 되고 담이 그 뒤로 사라진다.
     * 참고 사진에서도 화분 사이로 담이 보인다.
     */
    const segments = new Set(
      layout.stoneWalls.map((wall) => `${wall.x.toFixed(2)},${wall.z.toFixed(2)}`),
    ).size;
    expect(boxes.length, `화분 ${boxes.length} / 담 도막 ${segments}`).toBeLessThan(segments / 2);
  });

  it("꽃이 상자 위에 얹힌다", () => {
    // 상자 안에 잠기면 나무 상자만 보이고, 너무 높으면 공중에 뜬다
    const boxTop = Math.max(...boxes.map((box) => box.y + box.height / 2));
    for (const flower of flowers) {
      const bottom = flower.y - flower.height / 2;
      expect(bottom, `꽃 아랫면 ${bottom.toFixed(2)} / 상자 윗면 ${boxTop.toFixed(2)}`).toBeLessThan(
        boxTop,
      );
      expect(flower.y, `꽃 높이 ${flower.y.toFixed(2)}m`).toBeGreaterThan(boxTop);
    }
  });

  it("꽃이 상자보다 넓게 흘러넘친다", () => {
    /*
     * 상자 안에 얌전히 들어가면 화분이 아니라 뚜껑 덮인 나무 상자로 보인다.
     * 실제 화분의 꽃은 테두리 밖으로 흘러넘친다.
     */
    const widest = Math.max(...flowers.map((flower) => Math.max(flower.width, flower.depth)));
    const narrowestBox = Math.min(...boxes.map((box) => Math.min(box.width, box.depth)));
    expect(widest, `꽃 ${widest.toFixed(2)} / 상자 짧은 변 ${narrowestBox.toFixed(2)}`).toBeGreaterThan(
      narrowestBox,
    );
  });

  it("City가 실제로 건다", () => {
    // 배치만 만들고 걸지 않으면 검사는 통과하는데 화면에는 아무것도 없다
    const source = readFileSync("src/game/world/City.tsx", "utf8");
    for (const layer of ["wallPlanters", "wallGreens"]) {
      expect(source, `${layer}를 스트리밍하지 않는다`).toContain(`useStreamed(layout.${layer}`);
      expect(source, `${layer}를 그리지 않는다`).toContain(`items={${layer}}`);
    }
    expect(source).toContain("WALL_GREEN_PALETTE");
  });

  it("꽃이 둥근 덩어리로 그려진다", () => {
    /*
     * **이 검사가 화면에서 나왔다.**
     *
     * 나무 상자와 꽃을 한 묶음에 두었더니 꽃도 상자로 그려졌다. 잡초의
     * 철쭉은 `shape="blob"`이라 둥근데 화분 꽃만 각져서, 4m 거리에서
     * **납작한 판**으로 읽혔다 — 화분이 아니라 뚜껑 덮인 상자로 보인다.
     *
     * 배치 값으로는 알 수 없는 종류라 **렌더 쪽을 읽어** 확인한다.
     */
    const source = readFileSync("src/game/world/City.tsx", "utf8");
    const block = /items=\{wallGreens\}[\s\S]{0,240}?\/>/.exec(source);
    expect(block, "planterBlossoms를 그리는 자리를 못 찾았다").not.toBeNull();
    expect(block?.[0], "꽃이 상자로 그려진다").toContain('shape="blob"');
  });

  it("팔레트가 나뉘어도 꽃 색은 잡초의 철쭉과 같다", () => {
    /*
     * 같은 구역에 두 종류의 분홍이 있으면 둘 다 「무슨 꽃인지 모를 것」이
     * 된다. 묶음을 나눈 것은 도형 때문이지 색을 다르게 하려는 것이 아니다.
     */
    for (const hex of WALL_GREEN_PALETTE.slice(0, IVY_TONE_START)) {
      expect(UNDERGROWTH_PALETTE, `화분 꽃 ${hex}가 잡초 철쭉에 없다`).toContain(hex);
    }
  });

  it("팔레트가 톤 수와 맞는다", () => {
    const source = readFileSync("src/game/world/oldTown.ts", "utf8");
    for (const [name, palette] of [
      ["PLANTER_TONE", PLANTER_PALETTE],
      ["GREEN_TONE", WALL_GREEN_PALETTE],
    ] as const) {
      const block = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\} as const;`).exec(source);
      expect(block, `oldTown.ts의 ${name}을 못 읽었다 — 검사가 아무것도 안 보고 있다`).not.toBeNull();
      if (!block) continue;

      const tones = (block[1].match(/\w+:\s*\d/g) ?? []).length;
      expect(palette.length, `${name}: 색 ${palette.length}개 / 톤 ${tones}개`).toBe(tones);
    }
  });
});

/*
 * 담쟁이.
 *
 * 담이 돌과 기와만으로 되어 있으면 **새로 쌓은 담**으로 보인다. 「오래 남은
 * 자리」라는 이 구역의 부제를 만드는 것은 담 자체가 아니라 그 위에 자란 것이다.
 */
describe("담쟁이", () => {
  const IVY_TONE_START = 2;
  const ivy = layout.wallGreens.filter((item) => item.tone >= IVY_TONE_START);

  it("실제로 자란다", () => {
    expect(ivy.length, `담쟁이 ${ivy.length}덩어리`).toBeGreaterThan(10);
  });

  it("담 위에 있다 — 화분 높이가 아니다", () => {
    /*
     * 담 아래에 있으면 철쭉과 구분이 안 된다. 갓 위로 올라와야 「타고 넘은
     * 것」으로 보인다.
     */
    for (const leaf of ivy) {
      expect(leaf.y, `담쟁이 높이 ${leaf.y.toFixed(2)}m / 담 ${WALL_TOTAL_HEIGHT.toFixed(2)}m`).toBeGreaterThan(
        WALL_TOTAL_HEIGHT * 0.6,
      );
    }
  });

  it("담을 타고 넘어 바깥으로 늘어진다", () => {
    /*
     * 담 한가운데에 얌전히 얹으면 화분을 지붕에 올려 둔 것으로 보인다.
     * 담 바깥면 밖으로 나온 덩어리가 있어야 한다.
     */
    let overhanging = 0;
    for (const leaf of ivy) {
      /*
       * **가장 넓은 켜(기와 갓)로 잰다.** 아무 켜나 집으면 몸통(가장 좁다)에
       * 걸려, 갓 위에 얹혀 있을 뿐인 덩어리도 「넘었다」로 세어진다.
       */
      const nearby = layout.stoneWalls.filter(
        (item) =>
          item.blockIndex === leaf.blockIndex &&
          Math.hypot(item.x - leaf.x, item.z - leaf.z) < 1.6,
      );
      if (nearby.length === 0) continue;
      const wall = nearby.reduce((widest, item) =>
        Math.min(item.width, item.depth) > Math.min(widest.width, widest.depth) ? item : widest,
      );
      const outX = Math.abs(leaf.x - wall.x) - wall.width / 2;
      const outZ = Math.abs(leaf.z - wall.z) - wall.depth / 2;
      if (Math.max(outX, outZ) > 0) overhanging += 1;
    }
    expect(overhanging, `담 밖으로 넘은 덩어리 ${overhanging} / ${ivy.length}`).toBeGreaterThan(
      ivy.length * 0.3,
    );
  });

  it("담이 선 자리에만 자란다", () => {
    for (const leaf of ivy) {
      const beside = layout.stoneWalls.some(
        (wall) =>
          wall.blockIndex === leaf.blockIndex && Math.hypot(wall.x - leaf.x, wall.z - leaf.z) < 1.8,
      );
      expect(beside, `담쟁이 (${leaf.x.toFixed(1)}, ${leaf.z.toFixed(1)}) 밑에 담이 없다`).toBe(true);
    }
  });

  it("초록이 수관보다 밝다 — 담 위는 볕을 정면으로 받는다", () => {
    /*
     * 나무 그늘 밑의 잎과 같은 초록으로 두면 담 위에 나무가 얹힌 것으로 보인다.
     */
    const luminance = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return (
        (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255
      );
    };
    const leaf = Math.min(...WALL_GREEN_PALETTE.slice(IVY_TONE_START).map(luminance));
    const crown = Math.max(...CROWN_PALETTE.slice(0, 2).map(luminance));
    expect(leaf, `담쟁이 ${leaf.toFixed(2)} vs 수관 ${crown.toFixed(2)}`).toBeGreaterThan(crown);
  });
});
