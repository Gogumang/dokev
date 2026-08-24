import { describe, expect, it } from "vitest";

import { buildCityLayout, BUILDING_TONE_COUNT, CITY, blockCenter } from "@/game/world/cityLayout";
import { districtAt, districtForBlock, DISTRICTS, zoneAt, type DistrictId } from "@/game/world/districts";
import { BLOCK_COUNT } from "@/game/world/streaming";
import { ZONE_GRID_SIZE, ZONE_MAP, ZONES, zoneForBlock, type ZoneId } from "@/game/world/zones";

describe("ZONE_MAP", () => {
  it("격자 한 변이 도시 격자와 같다", () => {
    // zones.ts는 순환을 피하려고 CITY를 안 본다. 둘이 갈라지면 좌표와 이름이
    // 통째로 어긋나므로 여기서 붙들어 둔다.
    expect(ZONE_GRID_SIZE, `zones=${ZONE_GRID_SIZE}, city=${CITY.gridSize}`).toBe(CITY.gridSize);
  });

  it("격자를 빈틈없이 덮는다", () => {
    // 한 칸이라도 모자라면 그 자리에서 undefined를 색인해 이름 읽는 쪽이 터진다
    expect(ZONE_MAP.length, `map had ${ZONE_MAP.length} cells`).toBe(BLOCK_COUNT);
  });

  it("광장이 스폰 구역 번호와 같은 자리에 있다", () => {
    // 배치 코드가 plazaBlockIndex를 따로 쓴다. 지도에서 그 칸이 광장이 아니면
    // 첫 화면이 건물 한복판이 된다.
    expect(ZONE_MAP[CITY.plazaBlockIndex]).toBe("plaza");
  });

  it("광장은 한 칸뿐이다", () => {
    // 광장이 넓어지면 시작 지점이 텅 빈 벌판이 된다. 번화가가 감싸야 한다.
    const plazaCells = ZONE_MAP.filter((id) => id === "plaza");
    expect(plazaCells.length, `plaza cells: ${plazaCells.length}`).toBe(1);
  });

  it("모든 성격이 도시 어딘가에 존재한다", () => {
    // 하나라도 비면 만들어 둔 화음 진행과 건물 규칙이 영영 안 쓰인다
    const found = new Set<ZoneId>(ZONE_MAP);
    for (const id of Object.keys(ZONES) as ZoneId[]) {
      expect(found.has(id), `${id} was missing from the map`).toBe(true);
    }
  });
});

describe("구역 성격", () => {
  it("이름과 부제가 비어 있지 않다", () => {
    for (const district of Object.values(DISTRICTS)) {
      expect(district.name.length, `${district.id} name`).toBeGreaterThan(0);
      expect(district.subtitle.length, `${district.id} subtitle`).toBeGreaterThan(0);
    }
  });

  it("이름이 서로 겹치지 않는다", () => {
    // 같은 이름이 둘이면 배너가 떠도 어디로 왔는지 알 수 없다
    const names = Object.values(DISTRICTS).map((d) => d.name);
    expect(new Set(names).size, `names: ${names.join(" / ")}`).toBe(names.length);
  });

  it("건물 규칙이 뒤집혀 있지 않다", () => {
    for (const zone of Object.values(ZONES)) {
      const { minLots, maxLots, minHeight, maxHeight, gapChance, tones } = zone.build;
      expect(minLots, `${zone.id} lots`).toBeLessThanOrEqual(maxLots);
      expect(minLots, `${zone.id} minLots`).toBeGreaterThan(0);
      expect(minHeight, `${zone.id} height`).toBeLessThanOrEqual(maxHeight);
      expect(minHeight, `${zone.id} minHeight`).toBeGreaterThan(0);
      expect(gapChance, `${zone.id} gapChance`).toBeGreaterThanOrEqual(0);
      expect(gapChance, `${zone.id} gapChance`).toBeLessThanOrEqual(1);
      expect(tones.length, `${zone.id} tones`).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone, `${zone.id} tone ${tone}`).toBeLessThan(BUILDING_TONE_COUNT);
        expect(tone, `${zone.id} tone ${tone}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("방향마다 다른 것이 나온다", () => {
  /*
   * 이 지도를 손으로 그린 이유가 여기 있다.
   *
   * 예전 고리 모델은 방향을 구분하지 못했다 — 북쪽 끝과 남쪽 끝이 같은 고리라
   * 같은 동네였다. "어디로 달려도 같다"가 화면에서 가장 크게 느껴진 결함이고,
   * 그걸 막는 성질을 검사로 박아 둔다. 지도를 고치다 한 방향을 번화가로
   * 덮어 버리면 여기서 잡힌다.
   */
  const size = CITY.gridSize;
  const plazaCol = CITY.plazaBlockIndex % size;
  const plazaRow = Math.floor(CITY.plazaBlockIndex / size);

  const RAYS: Record<string, { dCol: number; dRow: number }> = {
    북: { dCol: 0, dRow: -1 },
    남: { dCol: 0, dRow: 1 },
    서: { dCol: -1, dRow: 0 },
    동: { dCol: 1, dRow: 0 },
  };

  it("네 방향이 두 구역 안에 서로 다른 동네에 닿는다", () => {
    const reached = new Map<string, ZoneId>();

    for (const [label, ray] of Object.entries(RAYS)) {
      let found: ZoneId | undefined;
      // 두 칸까지만 본다. 세 칸을 지나야 바뀌면 그 전에 방향을 되돌린다.
      for (let step = 1; step <= 2; step += 1) {
        const col = plazaCol + ray.dCol * step;
        const row = plazaRow + ray.dRow * step;
        if (col < 0 || col >= size || row < 0 || row >= size) break;
        const id = ZONE_MAP[row * size + col];
        if (id !== "downtown" && id !== "plaza") {
          found = id;
          break;
        }
      }
      expect(found, `${label}쪽 두 칸 안에 번화가 말고 다른 동네가 없다`).toBeDefined();
      reached.set(label, found as ZoneId);
    }

    // 네 방향이 서로 다른 곳에 닿아야 "방향마다 다르다"가 성립한다
    const ids = [...reached.values()];
    expect(new Set(ids).size, `닿은 곳: ${[...reached].map(([k, v]) => `${k}=${v}`).join(", ")}`).toBe(
      ids.length,
    );
  });
});

describe("zoneAt / districtAt", () => {
  it("스폰 지점은 광장이다", () => {
    // 첫 화면에 뜨는 배너와 첫 소절의 화음이 여기서 갈린다
    const spawn = buildCityLayout().spawn;
    expect(zoneAt(spawn.x, spawn.z).id, `spawn (${spawn.x}, ${spawn.z})`).toBe("plaza");
  });

  it("구역 중심 좌표가 지도와 같은 칸을 가리킨다", () => {
    // 좌표 → 번호 변환(streaming)과 지도 색인이 어긋나면 배너 이름과 실제로
    // 서 있는 동네가 달라진다. 화면에서만 보이고 코드로는 안 보이는 어긋남이다.
    for (let i = 0; i < BLOCK_COUNT; i += 1) {
      const { cx, cz } = blockCenter(i);
      expect(zoneAt(cx, cz).id, `block ${i} at (${cx}, ${cz})`).toBe(ZONE_MAP[i]);
    }
  });

  it("월드 밖 좌표에서도 터지지 않는다", () => {
    const far = (CITY.blockSize + CITY.roadWidth) * CITY.gridSize * 4;
    for (const [x, z] of [
      [far, far],
      [-far, -far],
      [far, -far],
      [-far, far],
      [Number.NaN, Number.NaN],
    ]) {
      const zone = zoneAt(x, z);
      expect(zone, `at (${x}, ${z})`).toBeDefined();
      expect(zone.name.length, `at (${x}, ${z})`).toBeGreaterThan(0);
    }
  });

  it("서쪽 밖으로 나가도 동쪽 끝으로 감기지 않는다", () => {
    /*
     * 번호만 잘랐다가 겪은 함정이다. 격자 왼쪽 밖은 열이 -1이라 번호가
     * `row*6 - 1` — 윗줄 오른쪽 끝 칸이 된다. 서쪽으로 걸어 나갔는데 갑자기
     * 해안 이름이 뜬다. 행과 열을 따로 잘라야 막힌다.
     */
    const pitch = CITY.blockSize + CITY.roadWidth;
    const { cz } = blockCenter(CITY.plazaBlockIndex);
    const outsideWest = -pitch * CITY.gridSize;

    expect(zoneAt(outsideWest, cz).id).toBe(ZONE_MAP[Math.floor(CITY.plazaBlockIndex / CITY.gridSize) * CITY.gridSize]);
  });

  it("이름표가 지도와 같은 성격을 돌려준다", () => {
    // districts.ts는 zones.ts의 이름만 옮기는 통로다. 둘이 갈라지면
    // HUD에 뜨는 이름과 건물 규칙이 다른 동네의 것이 된다.
    for (let i = 0; i < BLOCK_COUNT; i += 1) {
      const label: DistrictId = districtForBlock(i).id;
      expect(label, `block ${i}`).toBe(zoneForBlock(i).id);
      expect(districtForBlock(i).name).toBe(ZONES[zoneForBlock(i).id].name);
    }
  });

  it("좌표로 물어도 이름표와 지도가 같다", () => {
    const { cx, cz } = blockCenter(0);
    expect(districtAt(cx, cz).id).toBe(zoneAt(cx, cz).id);
  });
});
