import { readCode } from "./support/source";

import { colorDistance } from "@/game/core/color";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BOSS_HOME } from "@/game/combat/bossSim";

import {
  BLIP_FLOAT_COUNT,
  projectEnemyBlips,
  type BlipLink,
  BLOCK_CELL_METERS,
  blockCells,
  clampToRing,
  collectBlips,
  isOnMap,
  fullMapScale,
  mapDistance,
  MAX_BLIPS,
  MINIMAP,
  ROAD_CENTERS,
  roadsInRange,
  toCanvasPixel,
  toFullMapPixel,
  toMapPoint,
  WORLD_SPAN_METERS,
} from "@/game/systems/minimap";
import { CITY } from "@/game/world/cityLayout";
import { blockIndexFromPosition } from "@/game/world/streaming";
import { ZONES } from "@/game/world/zones";

describe("toMapPoint", () => {
  it("정면을 보면 앞쪽이 위로 온다", () => {
    // yaw 0 = +z 방향. 앞에 있는 것이 지도 위(+v)로 와야 한다.
    const point = toMapPoint(0, 10, 0, 0, 0);
    expect(point.u, `u was: ${point.u}`).toBeCloseTo(0, 6);
    expect(point.v, `v was: ${point.v}`).toBeCloseTo(10, 6);
  });

  it("오른쪽에 있는 것은 오른쪽에 그린다", () => {
    const point = toMapPoint(10, 0, 0, 0, 0);
    expect(point.u).toBeCloseTo(10, 6);
    expect(point.v).toBeCloseTo(0, 6);
  });

  it("몸을 돌리면 지도가 같이 돈다", () => {
    // +x를 보고 있으면 +x에 있는 것이 위로 와야 한다
    const point = toMapPoint(10, 0, 0, 0, Math.PI / 2);
    expect(point.u, `u was: ${point.u}`).toBeCloseTo(0, 6);
    expect(point.v, `v was: ${point.v}`).toBeCloseTo(10, 6);
  });

  it("회전해도 거리는 변하지 않는다", () => {
    // 회전 행렬이 틀리면 여기서 깨진다
    for (const yaw of [0, 0.7, 2.4, -1.9]) {
      const point = toMapPoint(12, -5, 3, 4, yaw);
      expect(mapDistance(point), `yaw ${yaw}`).toBeCloseTo(Math.hypot(12 - 3, -5 - 4), 6);
    }
  });

  it("제자리에 서 있으면 중심이다", () => {
    const point = toMapPoint(30, -40, 30, -40, 1.2);
    expect(mapDistance(point)).toBeCloseTo(0, 6);
  });
});

describe("clampToRing", () => {
  it("안쪽 점은 그대로 둔다", () => {
    const point = { u: 3, v: 4 };
    expect(clampToRing(point, 10)).toBe(point);
  });

  it("바깥 점은 테두리에 붙인다", () => {
    // 잘라 버리면 "목표가 어디에도 없다"로 보인다
    const clamped = clampToRing({ u: 300, v: 0 }, 10);
    expect(mapDistance(clamped), `distance was: ${mapDistance(clamped)}`).toBeCloseTo(10, 6);
  });

  it("방향을 유지한다", () => {
    const clamped = clampToRing({ u: 30, v: 40 }, 10);
    expect(clamped.u / clamped.v).toBeCloseTo(30 / 40, 6);
  });

  it("중심에 겹치면 위쪽으로 둔다", () => {
    // 0으로 나누면 NaN이 되고 표식이 사라진다
    const clamped = clampToRing({ u: 0, v: 0 }, 10);
    expect(Number.isFinite(clamped.u) && Number.isFinite(clamped.v)).toBe(true);
  });
});

describe("isOnMap", () => {
  it("반지름 안팎을 가른다", () => {
    expect(isOnMap({ u: 0, v: 79 }, 80)).toBe(true);
    expect(isOnMap({ u: 0, v: 81 }, 80)).toBe(false);
  });
});

describe("도로", () => {
  it("격자보다 한 줄 많다 — 가장자리 도로가 빠지지 않아야 한다", () => {
    expect(ROAD_CENTERS.length).toBe(CITY.gridSize + 1);
  });

  it("도로가 구역 중심과 겹치지 않는다", () => {
    /*
     * 반 칸이 어긋나 도로 좌표가 구역 중심을 가리킨 적이 있다. 그 결과
     * 미니맵이 건물 한가운데로 도로를 그리고, 도깨비 자리가 건물 안에 박혔다.
     */
    const pitch = CITY.blockSize + CITY.roadWidth;
    const offset = (CITY.gridSize - 1) / 2;
    const blockCenters = Array.from({ length: CITY.gridSize }, (_, c) => (c - offset) * pitch);

    for (const road of ROAD_CENTERS) {
      for (const block of blockCenters) {
        expect(
          Math.abs(road - block),
          `road ${road} sits on block center ${block}`,
        ).toBeGreaterThan(CITY.blockSize / 2);
      }
    }
  });

  it("도로가 두 구역 중심의 한가운데다", () => {
    const pitch = CITY.blockSize + CITY.roadWidth;
    const offset = (CITY.gridSize - 1) / 2;
    // 첫 구역 중심 바로 앞 도로는 그 중심에서 반 칸 뒤에 있어야 한다
    expect(ROAD_CENTERS[1]).toBeCloseTo((0 - offset) * pitch + pitch / 2, 6);
  });

  it("도로 간격이 구역 간격과 같다", () => {
    const pitch = CITY.blockSize + CITY.roadWidth;
    for (let i = 1; i < ROAD_CENTERS.length; i += 1) {
      expect(ROAD_CENTERS[i] - ROAD_CENTERS[i - 1], `gap at ${i}`).toBeCloseTo(pitch, 6);
    }
  });

  it("멀리 있는 도로는 걸러 낸다", () => {
    const near = roadsInRange(0, 20);
    expect(near.length, `near: ${near.join(",")}`).toBeLessThan(ROAD_CENTERS.length);
  });

  it("가까운 도로는 하나도 빠뜨리지 않는다", () => {
    // 빠지면 지도에 길이 끊겨 보인다
    const all = roadsInRange(0, 999);
    expect(all).toEqual([...ROAD_CENTERS]);
  });

  it("회전해도 모서리까지 덮는다", () => {
    // 지도가 도는 만큼 대각선 방향이 더 멀리 보인다
    const pitch = CITY.blockSize + CITY.roadWidth;
    const range = pitch * 1.1;
    const covered = roadsInRange(ROAD_CENTERS[2], range);
    expect(covered, `covered: ${covered.join(",")}`).toContain(ROAD_CENTERS[1]);
    expect(covered).toContain(ROAD_CENTERS[3]);
  });
});

describe("collectBlips", () => {
  const buffer = new Float32Array(BLIP_FLOAT_COUNT);

  it("가까운 것만 담는다", () => {
    const sources = [
      { x: 5, z: 0 },
      { x: 500, z: 0 },
    ];
    const count = collectBlips(sources, 0, 0, buffer, 80);

    expect(count, `count was: ${count}`).toBe(1);
    expect(buffer[0]).toBe(5);
    expect(buffer[1]).toBe(0);
  });

  it("월드 좌표를 그대로 담는다", () => {
    // 회전은 그리는 쪽에서 한다. 여기서 돌리면 두 번 돈다.
    collectBlips([{ x: 12, z: -7 }], 10, -10, buffer, 80);
    expect(buffer[0]).toBe(12);
    expect(buffer[1]).toBe(-7);
  });

  it("상한을 넘지 않는다", () => {
    // 넘치면 버퍼 밖으로 쓰거나 점이 뭉쳐 아무 정보도 안 된다
    const many = Array.from({ length: MAX_BLIPS + 20 }, (_, i) => ({ x: i * 0.1, z: 0 }));
    expect(collectBlips(many, 0, 0, buffer, 80)).toBe(MAX_BLIPS);
  });

  it("회전 모서리까지 덮는다", () => {
    // 반경 80의 대각선(약 113m)에 있는 것도 지도 모서리에는 보인다
    const count = collectBlips([{ x: 80, z: 80 }], 0, 0, buffer, 80);
    expect(count, "대각선 표식이 빠졌다").toBe(1);
  });

  it("비어 있으면 0을 돌려준다", () => {
    expect(collectBlips([], 0, 0, buffer, 80)).toBe(0);
  });

  it("버퍼를 새로 만들지 않는다", () => {
    // 매 프레임 새 배열을 만들면 GC가 프레임을 먹는다
    const before = buffer;
    collectBlips([{ x: 1, z: 1 }], 0, 0, buffer, 80);
    expect(buffer).toBe(before);
  });
});

describe("toCanvasPixel", () => {
  it("중심은 캔버스 한가운데다", () => {
    const pixel = toCanvasPixel({ u: 0, v: 0 });
    expect(pixel.x).toBeCloseTo(MINIMAP.sizePx / 2, 6);
    expect(pixel.y).toBeCloseTo(MINIMAP.sizePx / 2, 6);
  });

  it("위쪽(+v)이 캔버스에서는 작은 y다", () => {
    // 캔버스는 아래가 +y다. 부호를 놓치면 지도가 위아래로 뒤집힌다.
    const pixel = toCanvasPixel({ u: 0, v: 40 });
    expect(pixel.y, `y was: ${pixel.y}`).toBeLessThan(MINIMAP.sizePx / 2);
  });

  it("반지름 끝이 캔버스 가장자리다", () => {
    const pixel = toCanvasPixel({ u: MINIMAP.rangeMeters, v: 0 });
    expect(pixel.x, `x was: ${pixel.x}`).toBeCloseTo(MINIMAP.sizePx, 6);
  });
});

describe("전체 지도", () => {
  const SIZE = 400;

  it("도시 한 변이 격자에서 유도된다", () => {
    expect(WORLD_SPAN_METERS).toBe(CITY.gridSize * (CITY.blockSize + CITY.roadWidth));
  });

  it("월드 원점이 캔버스 한가운데다", () => {
    const pixel = toFullMapPixel(0, 0, SIZE);
    expect(pixel.x).toBeCloseTo(SIZE / 2, 6);
    expect(pixel.y).toBeCloseTo(SIZE / 2, 6);
  });

  it("+z가 위쪽이다", () => {
    // 부호를 놓치면 지도가 남북으로 뒤집혀 목표가 반대로 보인다
    const north = toFullMapPixel(0, 50, SIZE);
    expect(north.y, `y was: ${north.y}`).toBeLessThan(SIZE / 2);
  });

  it("도시 모서리가 캔버스 안에 들어온다", () => {
    // 여백이 없으면 모서리 구역이 테두리에 붙어 잘려 보인다
    const half = WORLD_SPAN_METERS / 2;
    for (const [x, z] of [
      [half, half],
      [-half, -half],
      [half, -half],
      [-half, half],
    ]) {
      const pixel = toFullMapPixel(x, z, SIZE);
      expect(pixel.x, `x was: ${pixel.x}`).toBeGreaterThan(0);
      expect(pixel.x).toBeLessThan(SIZE);
      expect(pixel.y, `y was: ${pixel.y}`).toBeGreaterThan(0);
      expect(pixel.y).toBeLessThan(SIZE);
    }
  });

  it("배율이 캔버스 크기에 비례한다", () => {
    expect(fullMapScale(SIZE * 2)).toBeCloseTo(fullMapScale(SIZE) * 2, 9);
  });

  it("구역 수와 인덱싱이 도시와 같다", () => {
    // 순서가 어긋나면 구역 색이 엉뚱한 칸에 칠해진다
    const cells = blockCells();
    expect(cells.length).toBe(CITY.gridSize * CITY.gridSize);
    expect(cells.map((cell) => cell.index)).toEqual(cells.map((_, i) => i));
  });

  it("구역 중심이 좌표에서 되돌려 계산한 구역과 맞는다", () => {
    // 이 두 계산이 어긋나면 색과 실제 구역이 어긋난다
    for (const cell of blockCells()) {
      expect(blockIndexFromPosition(cell.x, cell.z), `cell ${cell.index}`).toBe(cell.index);
    }
  });

  it("구역 칸 크기가 격자 간격과 같다", () => {
    // 작으면 도로가 두 배로 넓어 보인다
    expect(BLOCK_CELL_METERS).toBe(CITY.blockSize + CITY.roadWidth);
  });
});

describe("보스 표식", () => {
  it("지도가 씬과 같은 좌표를 쓴다", () => {
    /*
     * 표식과 실제 위치가 어긋나면 지도를 보고 찾아간 사람이 빈 교차로에
     * 선다. 좌표는 bossSim이 정본이다.
     *
     * **`BOSS_HOME`을 요구하던 검사였다.** 그 상수는 대장을 처음 세운 자리이고,
     * 대장은 인지 반경 안에서 플레이어를 쫓아 움직인다 — 두 지도가 상수를
     * 그리는 동안 표식은 제자리에 남아 있었다. 검사가 그 어긋남을 지키고 있었던
     * 셈이라, 이제 **매 프레임 흘러오는 자리**(`BossView.x`/`z`)를 요구한다.
     */
    const source = readFileSync("src/components/hud/Minimap.tsx", "utf8");
    const full = readFileSync("src/game/systems/cityMapPaint.ts", "utf8");

    for (const [name, text] of [
      ["미니맵", source],
      ["전체 지도", full],
    ] as const) {
      expect(text, `${name}이 대장의 지금 자리를 안 쓴다`).toContain("boss.x");
      expect(text, `${name}이 대장의 지금 자리를 안 쓴다`).toContain("boss.z");
      expect(text, `${name}이 세워 둔 자리를 그린다`).not.toMatch(/BOSS_HOME\.[xz]/);
    }
  });

  it("보스가 지도 어디에도 없지 않다", () => {
    // 만들어 두고 알려 주지 않으면 없는 것과 같다
    const point = toMapPoint(BOSS_HOME.x, BOSS_HOME.z, BOSS_HOME.x, BOSS_HOME.z, 0);
    expect(mapDistance(point)).toBe(0);
  });
});

describe("전체 지도 범례가 지도와 맞는가", () => {
  /*
   * 범례가 「네모 하나 = 고물 대장」이라고 적혀 있었다. 그런데 대장과 일반
   * 로봇은 **같은 빨강**이고 구분은 원/삼각형이라는 모양이다 — 지도에 흩어진
   * 빨간 점을 전부 대장으로 읽게 된다. 목표(청록)와 내 화살표(노랑)는 범례에
   * 아예 없었다.
   *
   * 색을 캔버스에 직접 쓰면 범례가 조용히 어긋난다. 표식을 한 곳에서 만들고,
   * 캔버스가 정말 그 상수를 쓰는지 본다.
   */
  /*
   * 범례는 컴포넌트가 그리고, 캔버스는 그림 쪽이 칠한다. 어긋나는지 보려면
   * 둘 다 읽어야 한다 — 전에는 한 파일이라 잘라내기만 하면 됐다.
   */
  const _map = readCode("src/components/hud/CityMap.tsx");
  const draw = readCode("src/game/systems/cityMapPaint.ts");

  it("그리는 코드를 실제로 잘라냈다", () => {
    // 함수 이름이 바뀌면 빈 문자열을 검사하며 통과한다
    expect(draw.length, `잘라낸 길이 ${draw.length}`).toBeGreaterThan(500);
    expect(draw).toContain("ctx.fillStyle");
  });

  it("범례에 없는 색을 캔버스에 직접 쓰지 않는다", () => {
    /*
     * 도깨비 자리만 예외다 — 몸 색을 그대로 쓰므로 고정 상수가 없다.
     * 그쪽은 도감에서 본 색과 같다는 것 자체가 범례 역할을 한다.
     */
    const bare = [...draw.matchAll(/ctx\.fillStyle = "(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]);
    expect(bare, `범례를 거치지 않는 색: ${bare.join(", ")}`).toEqual([]);
  });

  it("범례의 표식이 모두 실제로 그려진다", () => {
    // 안 그리는 것을 범례에 적으면 지도에서 찾다가 못 찾는다
    for (const key of ["target", "enemy", "boss", "player"]) {
      expect(draw, `MARKS.${key}를 그리는 곳이 없다`).toContain(`MARKS.${key}.color`);
    }
  });

  it("적과 대장은 색이 같으므로 모양으로 갈린다", () => {
    /*
     * 색만으로 구분하면 색각 이상에서 무너진다. 실제로 두 표식은 같은 값이라
     * 모양이 유일한 단서다 — 범례 조각도 같은 모양이어야 한다.
     */
    // 표식 상수는 그림 쪽이 정본이고 범례가 그것을 읽는다
    const marks = draw.slice(draw.indexOf("MARKS = {"), draw.indexOf("} as const;"));
    const enemy = /enemy: \{ color: "(#[0-9a-fA-F]{6})", shape: "(\w+)"/.exec(marks);
    const boss = /boss: \{ color: "(#[0-9a-fA-F]{6})", shape: "(\w+)"/.exec(marks);
    expect(enemy, "enemy 표식을 못 읽었다").toBeTruthy();
    expect(boss, "boss 표식을 못 읽었다").toBeTruthy();
    if (!enemy || !boss) return;
    if (enemy[1] === boss[1]) {
      expect(boss[2], `같은 색 ${boss[1]}인데 모양도 같다`).not.toBe(enemy[2]);
    }
  });
});

describe("지도에서 구역이 갈리는가", () => {
  /*
   * 지도를 열어 보고 알았다 — **변두리가 바탕과 거의 구분되지 않았다.**
   * 재 보니 바탕과 34, 번화가와 35로 둘 다 기준(40) 아래였다. 지도의 목적이
   * 「지금 어느 구역인가를 한눈에」인데 셋 중 하나가 안 보이면 절반만 선다.
   *
   * 검사가 아예 없어서 남아 있었다. 구역 색은 **반투명**이므로 원색끼리
   * 비교하면 안 된다 — 바탕 위에 얹은 결과로 재야 실제로 보이는 것과 같다.
   */
  const source = readCode("src/game/systems/cityMapPaint.ts");
  const background = /const MAP_BACKGROUND = "(#[0-9a-f]{6})"/i.exec(source)?.[1] ?? "";
  const alpha = Number(/const DISTRICT_FILL_ALPHA = ([\d.]+);/.exec(source)?.[1] ?? NaN);

  /*
   * 예전에는 이 파일에서 rgba 문자열을 긁어 왔다. 구역 색이 `ZONES`로 옮겨
   * 가면서 **긁을 문자열이 사라졌고, 검사는 "구역 0개"로 통과가 아니라 실패로
   * 떨어져 알려 줬다.** 이제 실제로 쓰이는 값을 그대로 가져온다 — 소스를
   * 긁는 대신 같은 데이터를 읽으므로 색을 바꾸면 검사도 따라온다.
   *
   * 알파만은 여전히 소스에서 읽는다. 그 값은 지도 컴포넌트의 것이지 월드
   * 데이터가 아니고, 여기서 베껴 두면 컴포넌트가 옅게 바뀌어도 검사가 모른다.
   */
  const districts = Object.values(ZONES).map((zone) => ({ id: zone.id, layer: zone.mapColor }));

  /** hex 바탕 위에 hex 칠을 알파로 얹은 결과 */
  function over(base: string, layer: string): string {
    const channel = (offset: number) => {
      const from = Number.parseInt(base.slice(1 + offset, 3 + offset), 16);
      const to = Number.parseInt(layer.slice(1 + offset, 3 + offset), 16);
      return Math.round(from * (1 - alpha) + to * alpha)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${channel(0)}${channel(2)}${channel(4)}`;
  }

  it("바탕색과 불투명도를 실제로 읽었다", () => {
    expect(background, "바탕색을 못 찾았다").toMatch(/^#[0-9a-f]{6}$/i);
    expect(alpha, `알파를 못 찾았다: ${alpha}`).toBeGreaterThan(0);
    expect(alpha, `알파가 1을 넘는다: ${alpha}`).toBeLessThanOrEqual(1);
    expect(districts.length, `찾은 구역 ${districts.length}개`).toBeGreaterThan(2);
  });

  it("구역이 바탕에서 떠오른다", () => {
    for (const district of districts) {
      const mixed = over(background, district.layer);
      const distance = colorDistance(mixed, background);
      expect(distance, `${district.id}(${mixed})가 바탕과 ${distance.toFixed(0)}`).toBeGreaterThan(
        40,
      );
    }
  });

  it("구역끼리도 갈린다", () => {
    // 바탕에서 떠올라도 서로 같으면 「어느 구역인가」를 답하지 못한다
    for (const a of districts) {
      for (const b of districts) {
        if (a.id >= b.id) continue;
        const distance = colorDistance(over(background, a.layer), over(background, b.layer));
        expect(distance, `${a.id} vs ${b.id}: ${distance.toFixed(0)}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("표식 자리가 적 수를 담는가", () => {
  /*
   * `MAX_BLIPS`(24)와 최고 품질의 적 수(24)가 **정확히 같다.** 지금은 맞지만,
   * 적을 늘리는 순간 넘치는 만큼이 지도에서 조용히 사라진다 — `collectBlips`가
   * `if (count >= MAX_BLIPS) break;`로 끊기 때문이다. 예외도 경고도 없다.
   *
   * 간판 아틀라스가 정확히 꽉 차 있던 것과 같은 모양이다(반복 420). 성능을
   * 만지는 사람이 적 수를 올리는 것은 아주 자연스러운 일이라 더 위험하다.
   */
  const source = readCode("src/game/combat/Enemies.tsx");

  it("품질별 적 수를 실제로 읽었다", () => {
    const match = /ENEMY_COUNT_BY_QUALITY = \{([^}]*)\}/.exec(source);
    expect(match, "적 수 표를 못 읽었다").not.toBeNull();
  });

  it("가장 많은 적도 표식 자리 안에 들어간다", () => {
    const match = /ENEMY_COUNT_BY_QUALITY = \{([^}]*)\}/.exec(source);
    const counts = [...(match?.[1] ?? "").matchAll(/:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(counts.length, `읽은 품질 ${counts.length}단계`).toBeGreaterThan(2);

    const most = Math.max(...counts);
    expect(most, `가장 많은 적 ${most}기, 표식 자리 ${MAX_BLIPS}개`).toBeLessThanOrEqual(MAX_BLIPS);
  });

  it("표식 버퍼가 자리 수와 맞는다", () => {
    // 한 자리에 x, z 둘이므로 두 배여야 한다 — 어긋나면 마지막 표식이 잘린다
    expect(BLIP_FLOAT_COUNT, `버퍼 ${BLIP_FLOAT_COUNT}, 자리 ${MAX_BLIPS}`).toBe(MAX_BLIPS * 2);
  });
});

describe("적 표식이 지도로 가는가", () => {
  /*
   * 개수를 안 넘기면 **지도에 적이 하나도 안 뜬다.** 좌표는 버퍼에 들어가 있는데
   * 몇 개를 그릴지 모르니 0개를 그린다 — 값은 맞는데 화면이 비는, 이 저장소에서
   * 가장 자주 나온 모양이다.
   */
  function link(): BlipLink {
    return { enemyBlips: new Float32Array(BLIP_FLOAT_COUNT), enemyBlipCount: -1 };
  }

  it("가까운 적 수가 넘어간다", () => {
    const out = link();
    projectEnemyBlips(
      out,
      [
        { x: 2, z: 0 },
        { x: 0, z: 3 },
      ],
      0,
      0,
    );

    expect(out.enemyBlipCount, "지도에 적이 안 뜬다").toBe(2);
  });

  it("아무도 없으면 0이다 — 옛 개수가 남으면 없는 적이 찍힌다", () => {
    const out = link();
    projectEnemyBlips(out, [{ x: 1, z: 1 }], 0, 0);
    projectEnemyBlips(out, [], 0, 0);

    expect(out.enemyBlipCount, `개수 ${out.enemyBlipCount}`).toBe(0);
  });

  it("버퍼를 갈아 끼우지 않는다 — 매 프레임 새로 만들면 초당 60번 쓰레기다", () => {
    const out = link();
    const held = out.enemyBlips;
    projectEnemyBlips(out, [{ x: 1, z: 1 }], 0, 0);

    expect(out.enemyBlips, "버퍼가 바뀌었다").toBe(held);
    expect(out.enemyBlips[0], "좌표가 안 채워졌다").not.toBe(0);
  });
});

describe("중심에 있는 표식", () => {
  /*
   * 「정확히 중심이면 방향을 정할 수 없다」를 막는 줄이 있었는데, 그 위의
   * 「반경 안이면 그대로」가 이미 중심을 걸러서 **영영 안 밟히는 줄**이었다.
   * 지우고, 대신 **왜 안 밟히는지**를 여기서 못 박는다.
   */
  it("중심의 표식은 그대로 둔다 — 테두리로 밀지 않는다", () => {
    const center = clampToRing({ u: 0, v: 0 });
    expect(center, `중심이 (${center.u}, ${center.v})로 밀렸다`).toEqual({ u: 0, v: 0 });
  });

  it("반경 안은 그대로, 밖은 테두리로", () => {
    const inside = clampToRing({ u: 3, v: 4 }, 10);
    expect(inside, "반경 안인데 밀렸다").toEqual({ u: 3, v: 4 });

    const outside = clampToRing({ u: 30, v: 40 }, 10);
    expect(Math.hypot(outside.u, outside.v), "테두리에 안 붙었다").toBeCloseTo(10, 6);
  });

  it("밖으로 밀린 표식도 방향은 그대로다 — 방향만이라도 남겨야 한다", () => {
    const far = clampToRing({ u: 30, v: 40 }, 10);
    expect(Math.atan2(far.u, far.v), "방향이 바뀌었다").toBeCloseTo(Math.atan2(30, 40), 6);
  });
});
