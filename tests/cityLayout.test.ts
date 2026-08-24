import { describe, expect, it } from "vitest";

import { PLAYER_RADIUS } from "@/game/config/tuning";
import { clampToBounds, resolveHorizontalCollisions } from "@/game/player/locomotion";
import { BUILDING_TONE_COUNT, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";
import { terrainHeight } from "@/game/world/terrain";

const layout = buildCityLayout();

const allBoxes = () => [...layout.buildings, ...layout.props, ...layout.crosswalks];

describe("buildCityLayout — 재현성", () => {
  it("두 번 호출해도 완전히 같은 도시가 나온다", () => {
    // Arrange & Act
    const first = buildCityLayout();
    const second = buildCityLayout();

    // Assert — 배치가 매번 달라지면 프레임 성능을 비교할 수 없다
    expect(second, `buildings=${first.buildings.length}/${second.buildings.length}`).toEqual(first);
  });

  it("비어 있지 않은 도시를 만든다", () => {
    // Arrange & Act & Assert — 폴백처럼 텅 빈 결과가 조용히 통과하면 안 된다
    expect(layout.buildings.length, `buildings=${layout.buildings.length}`).toBeGreaterThan(20);
    expect(layout.props.length, `props=${layout.props.length}`).toBeGreaterThan(0);
    expect(layout.crosswalks.length, `crosswalks=${layout.crosswalks.length}`).toBeGreaterThan(0);
    expect(layout.colliders.length, `colliders=${layout.colliders.length}`).toBeGreaterThan(20);
  });
});

describe("buildCityLayout — 스폰", () => {
  it("스폰 지점이 어떤 콜라이더 안에도 들어가 있지 않다", () => {
    // Arrange
    const { spawn } = layout;

    // Act & Assert
    for (const box of layout.colliders) {
      const inside =
        spawn.x > box.minX && spawn.x < box.maxX && spawn.z > box.minZ && spawn.z < box.maxZ;
      expect(inside, `spawn=${JSON.stringify(spawn)}, box=${JSON.stringify(box)}`).toBe(false);
    }
  });

  it("스폰 위치에 충돌 해소를 돌려도 위치가 밀려나지 않는다", () => {
    // Arrange — 게임 시작 첫 프레임과 같은 처리 순서
    const { spawn } = layout;

    // Act
    const resolved = clampToBounds(
      resolveHorizontalCollisions(spawn, PLAYER_RADIUS, layout.colliders),
      layout.halfExtent,
      PLAYER_RADIUS,
    );

    // Assert — 스폰하자마자 벽에 끼어 순간이동하는 회귀를 막는다
    expect(resolved.x, `spawn=${JSON.stringify(spawn)}, resolved=${JSON.stringify(resolved)}`)
      .toBeCloseTo(spawn.x, 12);
    expect(resolved.z, `spawn=${JSON.stringify(spawn)}, resolved=${JSON.stringify(resolved)}`)
      .toBeCloseTo(spawn.z, 12);
  });

  it("스폰 지점 주위에 사람이 지나갈 만큼의 여유가 있다", () => {
    // Arrange — 반지름의 4배는 첫 화면에서 시야가 트여 보이기 위한 최소 여유
    const clearance = PLAYER_RADIUS * 4;
    const { spawn } = layout;

    // Act & Assert
    for (const box of layout.colliders) {
      const dx = spawn.x - Math.min(Math.max(spawn.x, box.minX), box.maxX);
      const dz = spawn.z - Math.min(Math.max(spawn.z, box.minZ), box.maxZ);
      expect(
        Math.hypot(dx, dz),
        `spawn=${JSON.stringify(spawn)}, box=${JSON.stringify(box)}`,
      ).toBeGreaterThan(clearance);
    }
  });

  it("스폰은 지면 높이(y=0)에서 시작한다", () => {
    // Arrange & Act & Assert
    expect(layout.spawn.y, `spawn.y was: ${layout.spawn.y}`).toBe(0);
  });

  it("광장 구역에는 건물이 서지 않는다", () => {
    // Arrange & Act
    const inPlaza = layout.buildings.filter((b) => b.blockIndex === CITY.plazaBlockIndex);

    // Assert — 광장이 건물로 채워지면 스폰 여유가 사라진다
    expect(inPlaza.length, `plaza buildings: ${inPlaza.length}`).toBe(0);
  });
});

describe("buildCityLayout — 콜라이더", () => {
  it("모든 콜라이더가 minX<maxX, minZ<maxZ를 만족한다", () => {
    // Arrange & Act & Assert — 뒤집힌 AABB는 clamp가 조용히 잘못된 값을 내놓는다
    for (const box of layout.colliders) {
      expect(box.minX, `box=${JSON.stringify(box)}`).toBeLessThan(box.maxX);
      expect(box.minZ, `box=${JSON.stringify(box)}`).toBeLessThan(box.maxZ);
    }
  });

  it("모든 콜라이더의 top이 그 자리 지면보다 높다", () => {
    /*
     * 예전에는 `top > 0`으로 봤다. 그건 지면이 y=0 평면 한 장이던 시절의
     * 식이다 — 지형이 들어온 뒤로는 골짜기(최대 -8m)에 선 낮은 건물의 옥상이
     * **음수인 게 정상**이다. 실제로 숲의 3.4m 원두막이 -0.52로 걸렸는데,
     * 그건 결함이 아니라 검사의 자가 낡은 것이었다.
     *
     * 막아야 하는 것은 「지면에 선 플레이어가 통과하는 것」이므로, 재야 할
     * 기준은 0이 아니라 **그 자리의 지면 높이**다.
     */
    // Arrange & Act & Assert
    for (const box of layout.colliders) {
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      const ground = terrainHeight(cx, cz);
      expect(box.top - ground, `box=${JSON.stringify(box)} ground=${ground.toFixed(2)}`).toBeGreaterThan(0);
    }
  });

  it("모든 좌표가 유한한 수다", () => {
    // Arrange & Act & Assert
    for (const box of layout.colliders) {
      for (const [key, value] of Object.entries(box)) {
        expect(Number.isFinite(value), `${key}=${value} in ${JSON.stringify(box)}`).toBe(true);
      }
    }
  });

  it("모든 콜라이더가 월드 경계 안에 있다", () => {
    // Arrange
    const limit = layout.halfExtent;

    // Act & Assert — 경계 밖 콜라이더는 도달할 수 없어 순수한 낭비다
    for (const box of layout.colliders) {
      expect(box.minX, `box=${JSON.stringify(box)}, halfExtent=${limit}`).toBeGreaterThanOrEqual(
        -limit,
      );
      expect(box.maxX, `box=${JSON.stringify(box)}, halfExtent=${limit}`).toBeLessThanOrEqual(limit);
      expect(box.minZ, `box=${JSON.stringify(box)}, halfExtent=${limit}`).toBeGreaterThanOrEqual(
        -limit,
      );
      expect(box.maxZ, `box=${JSON.stringify(box)}, halfExtent=${limit}`).toBeLessThanOrEqual(limit);
    }
  });
});

describe("buildCityLayout — 박스 데이터", () => {
  it("모든 박스의 크기가 양수다", () => {
    // Arrange & Act & Assert — 0이나 음수 크기는 인스턴싱에서 뒤집힌 면을 만든다
    for (const box of allBoxes()) {
      expect(box.width, `box=${JSON.stringify(box)}`).toBeGreaterThan(0);
      expect(box.height, `box=${JSON.stringify(box)}`).toBeGreaterThan(0);
      expect(box.depth, `box=${JSON.stringify(box)}`).toBeGreaterThan(0);
    }
  });

  it("건물은 바닥에 놓인다 (y가 높이의 절반)", () => {
    // Arrange & Act & Assert
    for (const building of layout.buildings) {
      expect(building.y, `building=${JSON.stringify(building)}`).toBeCloseTo(
        building.height / 2,
        12,
      );
    }
  });

  it("건물 높이가 그 구역 규칙 안에 있다", () => {
    /*
     * 도시 전체에 하나였던 높이 범위를 구역별로 쪼갰다. 전체 범위만 재면
     * **숲에 34m 빌딩이 서 있어도 통과한다** — 그게 이 검사가 막아야 하는
     * 바로 그 결함이다. 건물이 선 구역의 규칙으로 잰다.
     */
    // Arrange & Act & Assert
    for (const building of layout.buildings) {
      const rule = zoneForBlock(building.blockIndex).build;
      const where = `block ${building.blockIndex}(${zoneForBlock(building.blockIndex).id}) height ${building.height}`;
      expect(building.height, where).toBeGreaterThanOrEqual(rule.minHeight);
      expect(building.height, where).toBeLessThanOrEqual(rule.maxHeight);
    }
  });

  it("구역마다 실제로 다른 높이가 나온다", () => {
    /*
     * 규칙만 갈라 두고 배치가 안 따라가면 화면은 예전 그대로다 — 이 저장소에서
     * 가장 흔했던 「값은 맞는데 화면에 안 나온다」의 모양이다. 번화가 평균이
     * 숲 평균보다 눈에 띄게 높은지로 확인한다.
     */
    const meanFor = (id: string) => {
      const picked = layout.buildings.filter((b) => zoneForBlock(b.blockIndex).id === id);
      expect(picked.length, `${id}에 건물이 하나도 없다`).toBeGreaterThan(0);
      return picked.reduce((sum, b) => sum + b.height, 0) / picked.length;
    };

    const downtown = meanFor("downtown");
    const forest = meanFor("forest");
    expect(downtown, `downtown ${downtown.toFixed(1)}m vs forest ${forest.toFixed(1)}m`).toBeGreaterThan(
      forest * 2,
    );
  });

  it("건물 tone이 팔레트 범위 안의 정수다", () => {
    // Arrange & Act & Assert — 범위를 벗어나면 렌더러에서 undefined 색이 된다
    for (const building of layout.buildings) {
      expect(Number.isInteger(building.tone), `tone was: ${building.tone}`).toBe(true);
      expect(building.tone, `tone was: ${building.tone}`).toBeGreaterThanOrEqual(0);
      expect(building.tone, `tone was: ${building.tone}`).toBeLessThan(BUILDING_TONE_COUNT);
    }
  });

  it("blockIndex가 격자 범위 안에 있다", () => {
    // Arrange
    const totalBlocks = CITY.gridSize * CITY.gridSize;

    // Act & Assert
    for (const box of [...layout.buildings, ...layout.crosswalks]) {
      expect(box.blockIndex, `box=${JSON.stringify(box)}`).toBeGreaterThanOrEqual(0);
      expect(box.blockIndex, `box=${JSON.stringify(box)}`).toBeLessThan(totalBlocks);
    }
  });

  it("횡단보도는 충돌체가 아니다 (바닥 장식)", () => {
    // Arrange & Act — 횡단보도 좌표와 정확히 겹치는 콜라이더가 있으면 밟고 걸린다
    const crosswalkTops = new Set(layout.crosswalks.map((c) => c.height));

    // Assert — 횡단보도 높이(0.04)를 top으로 갖는 콜라이더는 없어야 한다
    for (const box of layout.colliders) {
      expect(crosswalkTops.has(box.top), `box=${JSON.stringify(box)}`).toBe(false);
    }
  });
});

describe("가로등 갓", () => {
  it("기둥마다 갓이 하나씩 있다", () => {
    const layout = buildCityLayout();
    const poles = layout.props.filter((prop) => prop.height > 5 && prop.width < 0.5);

    // 갓이 기둥보다 적으면 불 꺼진 가로등이 섞이고, 많으면 공중에 뜬 등이 생긴다
    expect(
      layout.streetLamps.length,
      `poles=${poles.length}, lamps=${layout.streetLamps.length}`,
    ).toBe(poles.length);
  });

  it("갓이 기둥 꼭대기에 있다", () => {
    const layout = buildCityLayout();
    for (const lamp of layout.streetLamps) {
      expect(lamp.y, `lamp y was: ${lamp.y}`).toBeGreaterThan(5);
    }
  });

  it("갓은 충돌체를 만들지 않는다", () => {
    // 머리 위라 닿지 않는다. 충돌체가 생기면 보드가 허공에서 멈춘다.
    const layout = buildCityLayout();
    const lamp = layout.streetLamps[0];
    const overlapping = layout.colliders.filter(
      (box) => lamp.x >= box.minX && lamp.x <= box.maxX && lamp.z >= box.minZ && lamp.z <= box.maxZ,
    );
    // 기둥 충돌체 하나(같은 x/z)만 있어야 한다
    expect(overlapping.length, `overlapping=${overlapping.length}`).toBe(1);
  });
});

describe("도시가 텅 비거나 넘치지 않는가", () => {
  /*
   * 비교 방향 훑기에서 다섯이 나왔다. 대부분 **무언가가 통째로 사라지는** 자리인데
   * 「하나보다 많다」로만 재고 있어서 전부 통과했다:
   *
   *   - 빈 필지 비율을 뒤집으면 **도시의 86%가 빈 땅**이 된다.
   *   - 광장 화단 반복이 뒤집히면 **화단이 하나도 안 생긴다**(첫 스폰 자리다).
   *   - 횡단보도 줄무늬 경계 판정이 뒤집히면 **줄무늬가 도시 밖에만 생긴다**.
   *
   * 「0보다 많다」는 하나만 있어도 통과한다. **얼마나 있어야 하는지**를 격자
   * 크기에서 유도해 잰다 — 손으로 적으면 격자를 늘릴 때 같이 낡는다.
   */
  const layout = buildCityLayout();
  const blocks = CITY.gridSize * CITY.gridSize;

  it("구역마다 건물이 여러 채 선다 — 도시가 빈 땅이 되면 안 된다", () => {
    const perBlock = layout.buildings.length / blocks;
    expect(perBlock, `구역당 ${perBlock.toFixed(1)}채 (전체 ${layout.buildings.length})`).toBeGreaterThan(
      2,
    );
  });

  it("그렇다고 빈틈 없이 들어차지도 않는다 — 골목과 시야가 남아야 한다", () => {
    // 3x3 필지를 다 채우면 구역당 9채다. 그보다 적어야 골목이 생긴다
    const perBlock = layout.buildings.length / blocks;
    expect(perBlock, `구역당 ${perBlock.toFixed(1)}채`).toBeLessThan(9);
  });

  it("광장에 화단이 있다 — 첫 화면에서 보는 것이다", () => {
    // 광장은 스폰 지점이고 건물 대신 화단이 선다
    const nearSpawn = layout.props.filter(
      (prop) =>
        Math.hypot(prop.x - layout.spawn.x, prop.z - layout.spawn.z) < CITY.blockSize * 0.5,
    );
    expect(nearSpawn.length, `광장 소품 ${nearSpawn.length}개`).toBeGreaterThan(3);
  });

  it("횡단보도 줄무늬가 도시 구역마다 그려진다", () => {
    /*
     * 「0보다 많다」로는 부족했다 — 경계 판정을 뒤집으면 **바깥 구역에만** 줄무늬가
     * 생기는데 그래도 수백 개라 통과한다. 구역당 몇 줄인지로 재야 걸린다.
     *
     * 「구역마다」가 「**도시 구역**마다」가 되었다. 숲·해안은 지면이 잔디·모래로
     * 덮여 차도가 보이지 않으므로, 그 위의 횡단보도는 건널 도로가 없는 흰
     * 줄무늬가 된다. 전체로 나누면 도시 구역의 밀도가 절반으로 희석돼
     * **줄무늬가 절반 사라져도 통과**한다.
     */
    const urbanBlocks = Array.from({ length: blocks }, (_, i) => i).filter(isUrbanBlock);
    const perBlock = layout.crosswalks.length / urbanBlocks.length;
    expect(
      perBlock,
      `도시 구역당 ${perBlock.toFixed(1)}줄 (전체 ${layout.crosswalks.length} / ${urbanBlocks.length}구역)`,
    ).toBeGreaterThan(8);
  });

  it("자연 구역에는 횡단보도가 없다", () => {
    const strays = layout.crosswalks.filter((stripe) => !isUrbanBlock(stripe.blockIndex));
    expect(strays.length, `자연 구역 줄무늬 ${strays.length}개`).toBe(0);
  });

  it("줄무늬가 도시 밖으로 안 나간다", () => {
    const outside = layout.crosswalks.filter(
      (stripe) =>
        Math.abs(stripe.x) > layout.halfExtent || Math.abs(stripe.z) > layout.halfExtent,
    );
    expect(outside.length, `도시 밖 줄무늬 ${outside.length}개`).toBe(0);
  });
});

