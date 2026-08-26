import { describe, expect, it } from "vitest";

import { BOSS, BOSS_HOME } from "@/game/combat/bossSim";
import { blockCenter, buildCityLayout, CITY } from "@/game/world/cityLayout";
import { SITE_BLOCK_INDEX } from "@/game/world/zones";
import { blockedBy, describeBox, overlapping, walkableFrom } from "./support/world";

/*
 * 대장이 설 자리.
 *
 * `worldConsistency`에서 뗐다 — 저 파일이 검사 상한(1200줄)에 닿았고, 이
 * 덩어리는 **한 가지 질문**이다: 30분을 들여 찾아간 자리가 실제로 싸울 만한
 * 곳인가.
 *
 * 그 질문이 최근에 실제로 「아니오」였다. 대장이 13×13m 교차로에 서 있었고
 * 내려치는 반경이 6.2m였다 — 물러설 자리가 없었다. 검사마저 「도로 교차점
 * 위에 있다」로 그 좁은 자리를 지키고 있었다.
 */

const layout = buildCityLayout();

describe("미니 보스 자리", () => {
  /*
   * 정본에서 읽는다. 씬·미니맵·전체 지도가 모두 이 값을 쓴다 — 좌표를 두
   * 번 적으면 표식과 실제 위치가 어긋나고, 지도를 보고 찾아간 사람이 빈
   * 교차로에 서게 된다.
   */
  const home = BOSS_HOME;

  it("공사장 한가운데다", () => {
    /*
     * **교차로 위에 있는지를 보던 검사였다.** 교차로는 13×13m인데 대장의
     * 내려치는 반경이 6.2m라 물러설 자리가 없었다 — 검사가 그 좁은 자리를
     * 지키고 있었던 셈이다. 이제 건물을 세우지 않는 블록의 한가운데를 본다.
     */
    const center = blockCenter(SITE_BLOCK_INDEX);
    expect(home.x, `boss home x ${home.x}`).toBeCloseTo(center.cx, 6);
    expect(home.z, `boss home z ${home.z}`).toBeCloseTo(center.cz, 6);
  });

  it("물러설 자리에 걸리는 것이 없다", () => {
    /*
     * 넓기만 해서는 부족하다 — 그 안에 바위나 소품이 서 있으면 물러서다
     * 걸리고, 걸린 그 자리에서 맞는다. 예고를 보고 피하는 것이 이 싸움의
     * 전부이므로 **피할 길이 실제로 비어 있어야** 한다.
     *
     * 지금은 0개다. 공사장에 무언가를 세우는 날 이 검사가 먼저 운다.
     */
    const clearance = BOSS.slamRadius + 1.5;
    const blocking = overlapping(layout, home.x, home.z, clearance);
    expect(
      blocking.map(describeBox),
      `물러설 ${clearance.toFixed(1)}m 안에 ${blocking.length}개가 서 있다`,
    ).toEqual([]);
  });

  it("이 검사가 실제로 충돌체를 훑고 있다", () => {
    /*
     * 위 검사를 처음 쓸 때 **상자의 필드 이름을 틀렸다**(`box.x`/`box.width`).
     * `Aabb`는 `minX`·`maxX`라 비교가 통째로 NaN이 됐고, 늘 빈 목록이 나와
     * 조용히 통과했다 — 이 저장소가 가장 자주 겪은 실패 방식이다.
     *
     * 그래서 **잡을 수 있다는 것**을 함께 잰다: 반경을 도시만큼 넓히면
     * 무언가는 걸려야 한다.
     */
    const everything = overlapping(layout, home.x, home.z, layout.halfExtent * 2);
    expect(everything.length, "반경을 도시만큼 넓혔는데도 아무것도 안 걸린다").toBeGreaterThan(0);
  });

  it("물러설 자리가 내려치는 반경보다 넓다", () => {
    /*
     * 예고를 보고 물러서는 것이 이 싸움의 전부다. 블록 반폭이 충격 반경보다
     * 좁으면 벽에 붙어 맞을 수밖에 없다.
     */
    const halfBlock = CITY.blockSize / 2;
    expect(halfBlock, `블록 반폭 ${halfBlock}m vs 충격 ${BOSS.slamRadius}m`).toBeGreaterThan(
      BOSS.slamRadius * 2,
    );
  });

  it("충돌체 안이 아니다", () => {
    const blocking = blockedBy(layout, home.x, home.z, 2);
    expect(blocking.length, `boss home blocked by ${blocking.map(describeBox).join(", ")}`).toBe(0);
  });

  it("월드 경계 안이다", () => {
    expect(Math.abs(home.x)).toBeLessThan(layout.halfExtent);
    expect(Math.abs(home.z)).toBeLessThan(layout.halfExtent);
  });

  it("스폰에서 충분히 멀다", () => {
    // 처음부터 마주치면 조작을 배우기 전에 쓰러진다
    const distance = Math.hypot(home.x - layout.spawn.x, home.z - layout.spawn.z);
    expect(distance, `distance=${distance.toFixed(1)}m`).toBeGreaterThan(60);
  });

  it("걸어서 닿는다", () => {
    expect(walkableFrom(layout, layout.spawn.x, layout.spawn.z, home.x, home.z, 6)).toBe(true);
  });
});
