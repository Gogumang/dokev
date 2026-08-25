import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { buildCityLayout } from "@/game/world/cityLayout";
import { zoneForBlock } from "@/game/world/zones";

/*
 * 연못 물결.
 *
 * 연못을 파 놓고 **수면이 멈춰 있었다.** 색만 파란 판이라 「물을 그린 자리」로
 * 보이지 물로 보이지 않았다 — 물은 색이 아니라 **움직임**으로 읽힌다.
 *
 * 바다에 이미 같은 처리가 있으므로 같은 파일(`Sea.tsx`)에 둔다. 물처럼
 * 보이게 하는 것은 공원의 성질이 아니라 물의 성질이고, 두 곳에 같은 코드를
 * 두면 한쪽만 고쳐진다.
 */

const layout = buildCityLayout();

describe("수면과 테두리가 나뉘어 있는가", () => {
  it("수면이 따로 나온다", () => {
    /*
     * 한 묶음에 두고 렌더가 색 번호로 다시 가르면 `TONE` 상수가 렌더까지
     * 새어 나간다. 그리고 색으로 무엇인지 알아내는 방식은 그래플 앵커에서
     * 이미 한 번 데였다.
     */
    expect(layout.pondWater.length, "수면이 없다").toBeGreaterThan(0);
    expect(layout.pondRim.length, "테두리가 없다").toBe(layout.pondWater.length * 4);
  });

  it("둘 다 공원에만 있다", () => {
    for (const piece of [...layout.pondWater, ...layout.pondRim]) {
      expect(zoneForBlock(piece.blockIndex).id, `구역 ${piece.blockIndex}`).toBe("park");
    }
  });

  it("테두리가 수면을 감싼다", () => {
    // 테두리가 수면보다 안쪽이면 물이 테두리를 덮어 「파 놓은 자리」가 안 된다
    for (const water of layout.pondWater) {
      const ring = layout.pondRim.filter(
        (rim) =>
          rim.blockIndex === water.blockIndex &&
          Math.hypot(rim.x - water.x, rim.z - water.z) < water.width,
      );
      expect(ring.length, `수면 (${water.x.toFixed(1)}, ${water.z.toFixed(1)})의 테두리`).toBe(4);

      for (const rim of ring) {
        const outward = Math.max(Math.abs(rim.x - water.x), Math.abs(rim.z - water.z));
        expect(outward, `테두리가 수면 안쪽에 있다`).toBeGreaterThan(water.width / 2 - 0.01);
      }
    }
  });
});

describe("물결 배선", () => {
  const sea = readCode("src/game/world/Sea.tsx");
  const city = readCode("src/game/world/City.tsx");

  it("도시가 실제로 걸어 둔다", () => {
    /*
     * 이 저장소에서 가장 흔했던 결함은 「값은 맞는데 화면에 안 나온다」였다.
     * 배치를 나눠 놓고 렌더를 안 걸면 검사는 전부 통과하고 수면만 사라진다.
     */
    expect(city, "City가 PondWater를 걸지 않는다").toContain("<PondWater");
    expect(city, "테두리를 안 그린다").toContain("pondRim");
  });

  it("연못이 바다와 같은 방식으로 흐른다", () => {
    // 정점을 흔들지 않고 UV만 흘린다 — 격자가 성겨 정점을 움직이면 판이 접힌다
    expect(sea).toContain("POND_WAVE_SPEED");
    expect(sea).toMatch(/map\.offset\.x \+= delta \* POND_WAVE_SPEED/);
  });

  it("연못 결이 바다 결보다 잘다", () => {
    /*
     * 연못은 9m밖에 안 된다. 바다 배율(22m)을 그대로 쓰면 **물결 한 겹이
     * 연못보다 커서** 결이 아예 안 보이고 파란 판이 된다.
     */
    const pond = Number(/const POND_TILE_METERS = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    const water = Number(
      /const WATER_TILE_METERS = ([\d.]+);/.exec(readCode("src/game/world/textures.ts"))?.[1] ??
        NaN,
    );

    expect(Number.isFinite(pond), `연못 타일 ${pond}`).toBe(true);
    expect(Number.isFinite(water), `바다 타일 ${water}`).toBe(true);
    expect(pond, `연못 ${pond}m vs 바다 ${water}m`).toBeLessThan(water);
  });

  it("연못이 바다보다 느리게 흐른다", () => {
    // 고인 물이라 파도가 아니라 잔물결이다. 빠르면 개울처럼 흘러가 보인다
    const pondSpeed = Number(/const POND_WAVE_SPEED = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    const seaSpeed = Number(/const WAVE_SPEED = ([\d.]+);/.exec(sea)?.[1] ?? NaN);

    expect(pondSpeed, `연못 ${pondSpeed} vs 바다 ${seaSpeed}`).toBeLessThan(seaSpeed);
  });

  it("연못 결 크기가 실제 연못 크기와 어긋나지 않는다", () => {
    /*
     * 반복 수를 정하는 데 쓰는 값이라 배치와 갈라져도 화면이 조금 성겨질
     * 뿐이지만, 갈라진 채로 두면 다음 사람이 `POND.size`를 고치고 결이 왜
     * 안 맞는지 찾게 된다.
     */
    const hint = Number(/const POND_SIZE_HINT = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    const actual = layout.pondWater[0]?.width;

    expect(actual, "연못이 없다").toBeDefined();
    expect(hint, `힌트 ${hint} vs 실제 ${actual}`).toBeCloseTo(actual as number, 3);
  });
});
