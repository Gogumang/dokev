import { describe, expect, it } from "vitest";

import { BOSS, BOSS_HOME } from "@/game/combat/bossSim";
import { COMBAT_TUNING, createEnemies } from "@/game/combat/combatSim";
import { LOCOMOTION } from "@/game/config/tuning";
import { DOKEBI, DOKEBI_ORDER, DISCOVERY_RADIUS } from "@/game/dokebi/roster";
import { findGrappleTarget, type Aabb } from "@/game/player/locomotion";
import { CLUES, CLUE_RADIUS } from "@/game/quest/clues";
import { FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { blockCells } from "@/game/systems/minimap";
import { VENDING } from "@/game/systems/vending";
import { buildCityDetails } from "@/game/world/cityDetails";
import { blockCenter, buildCityLayout, CITY, ROAD_CENTERS } from "@/game/world/cityLayout";
import { SITE_BLOCK_INDEX } from "@/game/world/zones";
import { courtyardSpawnZ } from "@/game/world/courtyard";
import { buildPedestrians, CROWD } from "@/game/world/crowdLayout";
import { roadCenters, TRAFFIC } from "@/game/world/trafficLayout";
import { zoneAt } from "@/game/world/districts";

/*
 * 배치 정합성 — 화면 없이 확인할 수 있는 것들.
 *
 * 이 프로젝트는 3D 화면을 한 번도 눈으로 확인하지 않은 채 만들어졌다. "교차로는
 * 반드시 비어 있다", "스폰은 광장 한가운데다" 같은 말은 전부 **코드를 읽고 낸
 * 추론**이었다. 좌표 계산이 서로 어긋나면 캐릭터가 벽에 끼거나 목표에 닿을 수
 * 없는데, 그건 정적 타입이 잡아 주지 않는다.
 *
 * 여기서 그 추론들을 실제 배치 데이터와 대조한다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);

/** 그 지점이 어떤 충돌체 안에 있는지. margin만큼 넓혀서 본다 */
function blockedBy(x: number, z: number, margin: number): Aabb[] {
  return layout.colliders.filter(
    (box) =>
      x >= box.minX - margin &&
      x <= box.maxX + margin &&
      z >= box.minZ - margin &&
      z <= box.maxZ + margin,
  );
}

function describeBox(box: Aabb): string {
  return `[${box.minX.toFixed(1)}~${box.maxX.toFixed(1)}, ${box.minZ.toFixed(1)}~${box.maxZ.toFixed(1)}]`;
}

describe("스폰 지점", () => {
  it("충돌체 안이 아니다", () => {
    // 벽 안에서 시작하면 첫 프레임에 밖으로 밀려나거나 갇힌다
    const blocking = blockedBy(layout.spawn.x, layout.spawn.z, 0.5);
    expect(blocking.length, `spawn blocked by ${blocking.map(describeBox).join(", ")}`).toBe(0);
  });

  it("월드 경계 안이다", () => {
    expect(Math.abs(layout.spawn.x)).toBeLessThan(layout.halfExtent);
    expect(Math.abs(layout.spawn.z)).toBeLessThan(layout.halfExtent);
  });
});

describe("도깨비가 기다리는 자리", () => {
  const homes = DOKEBI_ORDER.map((id) => DOKEBI[id]).filter((spirit) => spirit.home !== null);

  it("찾아가야 하는 도깨비는 모두 자리가 있다", () => {
    /*
     * 개수를 박아 두지 않는다 — 도깨비가 늘 때마다 관계없는 숫자를 고치면
     * 고치는 김에 의미가 흐려진다. 규칙은 「초롱만 자리가 없다」이다.
     */
    const withoutHome = DOKEBI_ORDER.filter((id) => DOKEBI[id].home === null);
    expect(withoutHome, "자리 없는 도깨비가 초롱만이 아니다").toEqual(["chorong"]);
    expect(homes.length, `homes: ${homes.map((s) => s.id).join(",")}`).toBe(
      DOKEBI_ORDER.length - 1,
    );
  });

  it("충돌체 안이 아니다 — 교차로라는 주장의 실제 검증", () => {
    /*
     * roster.ts는 "도로가 만나는 점은 반드시 비어 있다"고 적어 두었다.
     * 그 주장을 배치 데이터로 확인한다. 틀리면 표식만 보이고 닿을 수 없는
     * 자리가 된다.
     */
    for (const spirit of homes) {
      const home = spirit.home;
      if (!home) continue;
      const blocking = blockedBy(home.x, home.z, 1.5);
      expect(
        blocking.length,
        `${spirit.id} at (${home.x.toFixed(1)}, ${home.z.toFixed(1)}) blocked by ${blocking
          .map(describeBox)
          .join(", ")}`,
      ).toBe(0);
    }
  });

  it("만남 반경 안에 벽이 없다", () => {
    // 반경 안이 벽으로 막혀 있으면 표식까지 갈 수 없다
    for (const spirit of homes) {
      const home = spirit.home;
      if (!home) continue;
      for (const [dx, dz] of [
        [DISCOVERY_RADIUS * 0.6, 0],
        [-DISCOVERY_RADIUS * 0.6, 0],
        [0, DISCOVERY_RADIUS * 0.6],
        [0, -DISCOVERY_RADIUS * 0.6],
      ]) {
        const blocking = blockedBy(home.x + dx, home.z + dz, 0);
        expect(
          blocking.length,
          `${spirit.id} + (${dx.toFixed(1)}, ${dz.toFixed(1)}) blocked by ${blocking
            .map(describeBox)
            .join(", ")}`,
        ).toBe(0);
      }
    }
  });

  it("스폰에서 걸어서 닿는다", () => {
    // 자리가 비어 있어도 사방이 막힌 안뜰이면 갈 수 없다
    for (const spirit of homes) {
      const home = spirit.home;
      if (!home) continue;
      expect(
        walkableFrom(layout.spawn.x, layout.spawn.z, home.x, home.z, DISCOVERY_RADIUS),
        `cannot walk from spawn to ${spirit.id}`,
      ).toBe(true);
    }
  });

  it("월드 경계 안이다", () => {
    for (const spirit of homes) {
      const home = spirit.home;
      if (!home) continue;
      expect(Math.abs(home.x), `${spirit.id}.x`).toBeLessThan(layout.halfExtent);
      expect(Math.abs(home.z), `${spirit.id}.z`).toBeLessThan(layout.halfExtent);
    }
  });
});

describe("퀘스트 목표", () => {
  const reach = FIRST_RUN_QUEST.steps
    .map((step) => step.objective)
    .find((objective) => objective.kind === "reach");

  it("도달 목표가 있다", () => {
    expect(reach, "첫 퀘스트에 도달 단계가 사라졌다").toBeDefined();
  });

  it("월드 경계 안이다", () => {
    if (reach?.kind !== "reach") return;
    expect(Math.abs(reach.x), `x=${reach.x}`).toBeLessThan(layout.halfExtent);
    expect(Math.abs(reach.z), `z=${reach.z}`).toBeLessThan(layout.halfExtent);
  });

  it("스폰에서 충분히 멀다", () => {
    // 가까우면 걸어서 끝나 버려 이동 능력을 쓸 이유가 없다 (questContent의 의도)
    if (reach?.kind !== "reach") return;
    const distance = Math.hypot(reach.x - layout.spawn.x, reach.z - layout.spawn.z);
    expect(distance, `distance was: ${distance.toFixed(1)}m`).toBeGreaterThan(100);
  });

  it("반경 안에 설 수 있는 자리가 있다", () => {
    /*
     * 목적지는 구역 중심이고 구역 중심에는 건물이 선다. 반경 안이 전부
     * 건물이면 이 단계는 영영 끝나지 않는다 — 정적 타입으로는 절대 안 잡힌다.
     */
    if (reach?.kind !== "reach") return;

    const free = sampleFreePoints(reach.x, reach.z, reach.radius);
    expect(
      free.length,
      `no free spot within ${reach.radius}m of (${reach.x.toFixed(1)}, ${reach.z.toFixed(1)})`,
    ).toBeGreaterThan(0);
  });

  it("그 자리가 도로에서 걸어서 닿는다", () => {
    /*
     * 반경 안이 비어 있어도 사방이 건물로 둘러싸인 안뜰이면 들어갈 수 없다.
     * 1m 격자로 실제로 걸어가 본다.
     */
    if (reach?.kind !== "reach") return;

    const reachable = walkableFrom(layout.spawn.x, layout.spawn.z, reach.x, reach.z, reach.radius);
    expect(reachable, `cannot walk from spawn to within ${reach.radius}m of the destination`).toBe(
      true,
    );
  });

  it("도달 반경이 목표를 덮는다", () => {
    // 반경이 너무 작으면 좌표 위에 정확히 서야 해서 통과가 안 된다
    if (reach?.kind !== "reach") return;
    expect(reach.radius).toBeGreaterThan(5);
  });
});

describe("적 배치", () => {
  /** 씬이 넘기는 것과 같은 판정. 벽에 딱 붙는 것도 막는다 */
  const isBlocked = (x: number, z: number) => blockedBy(x, z, 1.2).length > 0;
  /*
   * 씬이 넘기는 것과 **같은 예약 구역**도 준다.
   *
   * 예전에는 이 인자가 없었고, 스폰 근처가 비는 것은 우연이었다 — 도시 배치를
   * 건드리자(옥탑 충돌체가 늘면서 표본 순서가 밀렸다) 로봇 하나가 스폰 8m
   * 안으로 들어왔다. 우연에 기대던 검사가 실제로 깨진 것이다.
   */
  const reserved = {
    x: layout.spawn.x,
    z: layout.spawn.z,
    radius: COMBAT_TUNING.spawnClearanceRadius,
  };
  const enemies = createEnemies(24, layout.halfExtent, undefined, isBlocked, reserved);

  it("전부 월드 경계 안이다", () => {
    for (const enemy of enemies) {
      expect(Math.abs(enemy.x), `enemy at x=${enemy.x}`).toBeLessThan(layout.halfExtent);
      expect(Math.abs(enemy.z), `enemy at z=${enemy.z}`).toBeLessThan(layout.halfExtent);
    }
  });

  it("건물 안에서 생기지 않는다", () => {
    /*
     * 무작위 좌표라 건물 안에 박힐 수 있다. 그 로봇은 때릴 수도 없고
     * 다가올 수도 없어 퀘스트의 "3기 처치"를 영영 못 채우게 만들 수 있다.
     */
    const stuck = enemies.filter((enemy) => blockedBy(enemy.x, enemy.z, 0).length > 0);
    expect(
      stuck.length,
      `${stuck.length}/${enemies.length} enemies inside colliders: ${stuck
        .map((e) => `(${e.x.toFixed(1)}, ${e.z.toFixed(1)})`)
        .join(" ")}`,
    ).toBe(0);
  });

  it("판정을 주지 않으면 예전처럼 아무 데나 생긴다", () => {
    /*
     * 기본값이 바뀌지 않았음을 고정한다. 판정은 선택 인자이고, 이걸 넘기지
     * 않는 호출부(테스트 등)는 예전 동작 그대로다.
     */
    const loose = createEnemies(24, layout.halfExtent);
    const stuck = loose.filter((enemy) => blockedBy(enemy.x, enemy.z, 0).length > 0);
    expect(stuck.length, `${stuck.length}/24 stuck without the predicate`).toBeGreaterThan(0);
  });

  it("스폰 지점에 붙어 있지 않다", () => {
    // 시작하자마자 둘러싸이면 조작을 배우기 전에 쓰러진다
    const tooClose = enemies.filter(
      (enemy) =>
        Math.hypot(enemy.x - layout.spawn.x, enemy.z - layout.spawn.z) <
        COMBAT_TUNING.spawnClearanceRadius,
    );
    expect(
      tooClose.length,
      `${tooClose.length} enemies within ${COMBAT_TUNING.spawnClearanceRadius}m of spawn`,
    ).toBe(0);
  });
});

describe("도시 배치", () => {
  it("구역 수가 격자와 맞는다", () => {
    expect(layout.buildings.length, "건물이 하나도 없다").toBeGreaterThan(0);
    expect(layout.colliders.length).toBeGreaterThan(layout.buildings.length);
  });

  it("모든 건물이 월드 경계 안이다", () => {
    for (const building of layout.buildings) {
      expect(Math.abs(building.x) + building.width / 2).toBeLessThanOrEqual(
        layout.halfExtent + CITY.blockSize,
      );
    }
  });

  it("충돌체의 최소·최대가 뒤집히지 않았다", () => {
    // 뒤집히면 그 상자는 어떤 지점도 포함하지 않아 조용히 통과된다
    for (const box of layout.colliders) {
      expect(box.maxX, `box ${describeBox(box)}`).toBeGreaterThan(box.minX);
      expect(box.maxZ, `box ${describeBox(box)}`).toBeGreaterThan(box.minZ);
    }
  });
});

describe("도로 좌표를 유도하는 곳이 서로 맞는가", () => {
  it("교통이 쓰는 도로 중심선이 정본의 부분집합이다", () => {
    /*
     * trafficLayout은 자기 공식으로 도로 좌표를 만든다. 이 대조가 없으면
     * 한쪽만 고쳐도 아무도 모른다 — 실제로 roster와 minimap이 반 칸 어긋난 채
     * 오래 굴러갔다.
     */
    for (const center of roadCenters()) {
      const matched = ROAD_CENTERS.some((canonical) => Math.abs(canonical - center) < 1e-6);
      expect(matched, `traffic road ${center} not in ${ROAD_CENTERS.join(",")}`).toBe(true);
    }
  });

  it("차선이 도로 폭 안에 있다", () => {
    // 넘으면 차가 인도에 올라타거나 건물을 스친다
    const halfRoad = CITY.roadWidth / 2;
    const outermost = TRAFFIC.laneOffset + TRAFFIC.bodyWidth / 2;
    expect(outermost, `lane edge ${outermost} vs half road ${halfRoad}`).toBeLessThan(halfRoad);
  });

  it("차선 중심에 충돌체가 없다", () => {
    // 도로 좌표가 어긋나면 차가 건물 속을 달린다
    for (const center of roadCenters()) {
      for (const offset of [-TRAFFIC.laneOffset, TRAFFIC.laneOffset]) {
        const lane = center + offset;
        const blocking = blockedBy(lane, 0, 0);
        expect(
          blocking.length,
          `lane ${lane} blocked by ${blocking.map(describeBox).join(", ")}`,
        ).toBe(0);
      }
    }
  });
});

describe("가로등", () => {
  const poles = layout.props.filter((prop) => prop.height > 5 && prop.width < 0.5);

  it("가로등을 실제로 찾았다", () => {
    // 거르는 조건이 낡으면 빈 목록이 되고, 아래 두 검사가 아무것도 안 보며 통과한다
    expect(poles.length, `찾은 기둥 ${poles.length}개`).toBeGreaterThan(10);
  });

  it("건물 안에 서 있지 않다", () => {
    // 기둥은 자기 충돌체를 갖고 있으므로 그것 하나만 걸려야 한다
    /*
     * **앞 40개만 보고 있었다.** 384개 중 40개면 열에 하나다 — 그래서
     * 교차로에서 겹쳐 선 기둥 둘이 오래 남아 있었다. 전부 본다(빠르다).
     */
    const overlapping = poles
      .map((pole) => ({ pole, hits: blockedBy(pole.x, pole.z, 0).length }))
      .filter((entry) => entry.hits !== 1)
      .map((entry) => `(${entry.pole.x.toFixed(1)}, ${entry.pole.z.toFixed(1)}) ${entry.hits}개`);

    expect(
      overlapping.slice(0, 5),
      `자기 것 아닌 충돌체에 걸린 기둥 ${overlapping.length}개`,
    ).toEqual([]);
  });

  it("도로 폭 안에 있다", () => {
    // 도로 밖이면 인도나 건물에 박힌다
    const halfRoad = CITY.roadWidth / 2;
    for (const pole of poles) {
      const nearestRoadX = nearestRoad(pole.x);
      const nearestRoadZ = nearestRoad(pole.z);
      const onRoad =
        Math.abs(pole.x - nearestRoadX) <= halfRoad || Math.abs(pole.z - nearestRoadZ) <= halfRoad;
      expect(onRoad, `pole at (${pole.x.toFixed(1)}, ${pole.z.toFixed(1)}) is off-road`).toBe(true);
    }
  });
});

describe("가로수", () => {
  /*
   * 가로수는 **개수만 세고 자리는 아무도 안 보고 있었다**(`perfBudget`이
   * 인스턴스 수를 셀 뿐이다). 같은 부류에서 이미 「적 42%가 건물 안」과
   * 「도로 좌표 반 칸」이 났다 — 지금 멀쩡한 것을 확인했으니 고정해 둔다.
   *
   * 수관은 폭이 2.4~3.5m라 기둥만 보면 안 된다. 눈에 보이는 것은 수관이다.
   */
  const trunks = details.treeTrunks;
  /*
   * 수관은 두 묶음이다 — 둥근 것(활엽수·야자)과 원뿔(침엽수). 도형이 다르면
   * 인스턴스 묶음이 갈리기 때문이다. 「벽을 파고드는가」처럼 **보이는 것**을
   * 재는 검사는 둘을 합쳐 봐야 한다. 한쪽만 보면 숲의 침엽수가 통째로 검사
   * 밖에 있게 된다.
   */
  const crowns = [...details.treeCrowns, ...details.treeCones];

  /** 두 상자가 xz 평면에서 겹치는 깊이(m). 0이면 안 겹친다 */
  function overlap(
    a: { x: number; z: number; width: number; depth: number },
    b: { x: number; z: number; width: number; depth: number },
  ): number {
    const dx = (a.width + b.width) / 2 - Math.abs(a.x - b.x);
    const dz = (a.depth + b.depth) / 2 - Math.abs(a.z - b.z);
    return dx > 0 && dz > 0 ? Math.min(dx, dz) : 0;
  }

  it("나무를 실제로 심었다", () => {
    expect(trunks.length, `기둥 ${trunks.length}개`).toBeGreaterThan(20);

    /*
     * 수관은 나무마다 여러 덩어리다.
     *
     * 예전에는 1:1이었다 — 상자 하나가 막대 위에 얹혀 있었고, 3인칭 카메라가
     * 인도 높이라 그 거리를 늘 지나간다. 덩어리를 어긋나게 겹쳐 윤곽을 꺾는다.
     * 나무마다 같은 수여야 한다(하나만 빠진 나무가 생기면 그 나무만 상자다).
     *
     * 종류가 셋이 되면서 **전체를 한 번에 나눌 수 없다** — 활엽수는 덩어리 둘,
     * 야자는 잎 셋이라 합계가 기둥 수로 안 나뉜다. 종류별로 나눠 센다.
     * 「전부 합쳐 나누어떨어진다」로 두면 활엽수 하나가 야자로 잘못 만들어져도
     * 합계가 우연히 맞아 지나갈 수 있다.
     */
    const speciesOf = (item: { x: number; z: number }) => zoneAt(item.x, item.z).treeSpecies;
    const seen = new Set(trunks.map(speciesOf));
    expect(seen.size, `심은 종류 ${[...seen].join(",")}`).toBeGreaterThan(1);

    for (const species of seen) {
      const stems = trunks.filter((trunk) => speciesOf(trunk) === species);
      const pieces = crowns.filter((crown) => speciesOf(crown) === species);
      const per = pieces.length / stems.length;

      expect(
        Number.isInteger(per),
        `${species}: 수관 ${pieces.length} / 기둥 ${stems.length} = ${per}`,
      ).toBe(true);
      expect(per, `${species}는 수관이 나무마다 하나뿐이다`).toBeGreaterThan(1);
    }
  });

  it("침엽수와 활엽수가 둘 다 있다", () => {
    /*
     * 종류를 갈라 놓고 한쪽이 0이면 화면은 예전 그대로다 — 이 저장소에서
     * 가장 흔했던 「값은 맞는데 화면에 안 나온다」의 모양이다.
     */
    expect(details.treeCones.length, "침엽수가 하나도 없다").toBeGreaterThan(20);
    expect(details.treeCrowns.length, "둥근 수관이 하나도 없다").toBeGreaterThan(20);
  });

  it("수관이 건물을 파고들지 않는다", () => {
    const stuck = crowns
      .map((crown) => {
        const hit = layout.buildings.find((building) => overlap(crown, building) > 0.05);
        return hit ? `(${crown.x.toFixed(1)}, ${crown.z.toFixed(1)})` : null;
      })
      .filter(Boolean);
    expect(stuck.slice(0, 5), `건물에 박힌 수관 ${stuck.length}개`).toEqual([]);
  });

  it("같은 자리에 두 번 심지 않는다", () => {
    /*
     * 가로줄과 세로줄을 각각 심으므로 **교차로에서 같은 좌표가 두 번** 나올
     * 수 있다. 그러면 한 그루가 두 겹으로 겹쳐 짙게 보이고 인스턴스만 낭비된다.
     *
     * 수관이 스치는 것까지 막지는 않는다 — 처음엔 그렇게 썼다가 두 쌍이
     * 걸렸는데, 보러 가 보니 **나뭇잎이 맞닿는 정상적인 가로수**였다.
     * 기둥 사이 거리로 본다.
     */
    let closest = Infinity;
    let where = "";
    for (let i = 0; i < trunks.length; i += 1) {
      for (let j = i + 1; j < trunks.length; j += 1) {
        const gap = Math.hypot(trunks[i].x - trunks[j].x, trunks[i].z - trunks[j].z);
        if (gap < closest) {
          closest = gap;
          where = `(${trunks[i].x.toFixed(1)}, ${trunks[i].z.toFixed(1)})`;
        }
      }
    }
    expect(closest, `${where} 근처에서 ${closest.toFixed(2)}m까지 붙는다`).toBeGreaterThan(1.5);
  });

  it("가로등·소품과 같은 자리에 서지 않는다", () => {
    const clash = trunks
      .map((trunk) => {
        const hit = layout.props.find((prop) => Math.hypot(trunk.x - prop.x, trunk.z - prop.z) < 1);
        return hit ? `(${trunk.x.toFixed(1)}, ${trunk.z.toFixed(1)})` : null;
      })
      .filter(Boolean);
    expect(clash.slice(0, 5), `소품과 겹친 나무 ${clash.length}그루`).toEqual([]);
  });
});

describe("거리 소품", () => {
  /*
   * `streetProps`(386줄)·`streetExtras`(315줄)는 검사가 **한 번도 언급하지
   * 않은** 생성기였다. 가로수와 같은 부류이고, 이 프로젝트에는 「적 42%가
   * 건물 안」이라는 전례가 있다.
   *
   * **회전을 반드시 반영해야 한다.** 처음에 축 정렬로 재고 「포장마차 48개
   * 중 9개가 건물에 묻혔다」고 결론 낼 뻔했다 — 소품은 `rotationY`로 도로를
   * 향해 돌아 있어서, 2.6×1.1 상판이 90° 돌면 월드 축에서는 1.1×2.6이다.
   * 회전을 넣으니 1m 넘게 파고든 것이 하나도 없었다.
   */
  const PROPS = [
    ["소품", details.streetFixtures],
    ["패널", details.propPanels],
  ] as const;

  /** 90도 배수로 돌아 있는 상자의 월드 축 크기 */
  function extents(item: { width: number; depth: number; rotationY?: number }) {
    const turned = Math.abs(Math.sin(item.rotationY ?? 0)) > 0.5;
    return turned
      ? { width: item.depth, depth: item.width }
      : { width: item.width, depth: item.depth };
  }

  function intoBuilding(item: {
    x: number;
    z: number;
    width: number;
    depth: number;
    rotationY?: number;
  }): number {
    const size = extents(item);
    let worst = 0;
    for (const building of layout.buildings) {
      const dx = (size.width + building.width) / 2 - Math.abs(item.x - building.x);
      const dz = (size.depth + building.depth) / 2 - Math.abs(item.z - building.z);
      if (dx > 0 && dz > 0) worst = Math.max(worst, Math.min(dx, dz));
    }
    return worst;
  }

  it("소품을 실제로 만들었다", () => {
    for (const [name, items] of PROPS) {
      expect(items.length, `${name} ${items.length}개`).toBeGreaterThan(100);
    }
  });

  it("건물 안에 묻히지 않는다", () => {
    /*
     * 벽에 붙는 것은 정상이다(간판·에어컨). 「붙었다」와 「묻혔다」를 가르는
     * 선을 1m로 둔다 — 지금 가장 깊은 것이 0.54m다.
     */
    for (const [name, items] of PROPS) {
      const buried = items
        .map((item) => ({ item, depth: intoBuilding(item) }))
        .filter((hit) => hit.depth > 1)
        .map(
          (hit) => `(${hit.item.x.toFixed(1)}, ${hit.item.z.toFixed(1)}) ${hit.depth.toFixed(2)}m`,
        );
      expect(buried.slice(0, 5), `${name} 중 묻힌 것 ${buried.length}개`).toEqual([]);
    }
  });

  it("회전을 실제로 쓰고 있다", () => {
    // 전부 0이면 위 검사는 축 정렬로 재는 셈이고, 그러면 거짓 경보가 난다
    const turned = details.streetFixtures.filter(
      (item) => Math.abs(Math.sin(item.rotationY ?? 0)) > 0.5,
    );
    expect(turned.length, `돌아 있는 소품 ${turned.length}개`).toBeGreaterThan(50);
  });
});

describe("보행자 트랙", () => {
  it("건물 바깥면보다 바깥이다", () => {
    /*
     * crowdLayout의 주석이 "건물 바깥면은 경계선 안쪽(최대 16.5)"이라고
     * 단언한다. 실제 배치에서 확인한다 — 틀리면 보행자가 벽을 통과한다.
     */
    const offset = (CITY.gridSize - 1) / 2;
    const pitch = CITY.blockSize + CITY.roadWidth;
    let worstReach = 0;

    for (const building of layout.buildings) {
      const col = Math.round(building.x / pitch + offset);
      const row = Math.round(building.z / pitch + offset);
      const cx = (col - offset) * pitch;
      const cz = (row - offset) * pitch;
      worstReach = Math.max(
        worstReach,
        Math.abs(building.x - cx) + building.width / 2,
        Math.abs(building.z - cz) + building.depth / 2,
      );
    }

    expect(
      CROWD.innerTrackRadius,
      `buildings reach ${worstReach.toFixed(2)}m from block center`,
    ).toBeGreaterThan(worstReach);
  });

  it("바깥 트랙이 안쪽 트랙보다 바깥이다", () => {
    expect(CROWD.outerTrackRadius).toBeGreaterThan(CROWD.innerTrackRadius);
  });
});

/** 좌표에서 가장 가까운 도로 중심선 */
function nearestRoad(value: number): number {
  let best = ROAD_CENTERS[0];
  for (const center of ROAD_CENTERS) {
    if (Math.abs(center - value) < Math.abs(best - value)) best = center;
  }
  return best;
}

describe("도로 폭과 회전 반경", () => {
  it("보드 최고 속도의 회전 반경이 도로 폭 안에 들어온다", () => {
    /*
     * cityLayout이 "도로 폭은 스케이트보드 최고 속도에서 회전 반경이
     * 확보되어야 한다"고 단언한다. 실제 수치로 확인한다.
     *
     * 등속 원운동에서 반경 = 속도 / 각속도다. 이 반경이 도로 폭의 절반보다
     * 크면 최고 속도로 코너를 돌 때 반드시 인도나 건물로 나간다.
     */
    const radius = LOCOMOTION.skateboard.maxSpeed / LOCOMOTION.skateboard.turnRate;
    expect(
      radius,
      `board turn radius ${radius.toFixed(1)}m vs road width ${CITY.roadWidth}m`,
    ).toBeLessThan(CITY.roadWidth);
  });

  it("달리기는 도로 폭 절반 안에서 돈다", () => {
    // 달리기는 골목에서도 자유로워야 한다
    const radius = LOCOMOTION.run.maxSpeed / LOCOMOTION.run.turnRate;
    expect(radius, `run turn radius ${radius.toFixed(2)}m`).toBeLessThan(CITY.roadWidth / 2);
  });

  it("걷기가 가장 작게 돈다", () => {
    // 느릴수록 작게 돌아야 조작이 예측 가능하다
    const walk = LOCOMOTION.walk.maxSpeed / LOCOMOTION.walk.turnRate;
    const run = LOCOMOTION.run.maxSpeed / LOCOMOTION.run.turnRate;
    const board = LOCOMOTION.skateboard.maxSpeed / LOCOMOTION.skateboard.turnRate;
    expect(walk, `walk=${walk.toFixed(2)}, run=${run.toFixed(2)}`).toBeLessThan(run);
    expect(run, `run=${run.toFixed(2)}, board=${board.toFixed(2)}`).toBeLessThan(board);
  });
});

/** 목표 반경 안에서 벽이 아닌 지점들을 1m 간격으로 훑는다 */
function sampleFreePoints(cx: number, cz: number, radius: number): { x: number; z: number }[] {
  const free: { x: number; z: number }[] = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.hypot(dx, dz) > radius) continue;
      if (blockedBy(cx + dx, cz + dz, 0.4).length === 0) free.push({ x: cx + dx, z: cz + dz });
    }
  }
  return free;
}

/**
 * 출발점에서 목표 반경 안까지 걸어갈 수 있는지 1m 격자 BFS로 확인한다.
 *
 * 정확한 이동 판정이 아니라 **연결성**만 본다. 반경 안이 비어 있어도 사방이
 * 막힌 안뜰이면 도달할 수 없고, 그건 좌표만 봐서는 알 수 없다.
 */
function walkableFrom(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
): boolean {
  const CELL = 1;
  const limit = layout.halfExtent;
  const key = (x: number, z: number) => `${x},${z}`;

  const start = { x: Math.round(fromX), z: Math.round(fromZ) };
  const seen = new Set<string>([key(start.x, start.z)]);
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (Math.hypot(current.x - toX, current.z - toZ) <= radius) return true;

    for (const [dx, dz] of [
      [CELL, 0],
      [-CELL, 0],
      [0, CELL],
      [0, -CELL],
    ]) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (Math.abs(nx) > limit || Math.abs(nz) > limit) continue;
      const id = key(nx, nz);
      if (seen.has(id)) continue;
      seen.add(id);
      // 캐릭터 반지름만큼 여유를 둔다. 딱 맞게 통과하는 틈은 실제로 못 지나간다.
      if (blockedBy(nx, nz, 0.45).length > 0) continue;
      queue.push({ x: nx, z: nz });
    }
  }
  return false;
}

describe("흔적 자리", () => {
  /*
   * 흔적 검사는 「막히지 않았다」까지만 봤다 — **걸어서 닿는지는 아무도 안
   * 봤다.** 사방이 건물로 둘러싸인 안뜰이면 막히지 않았어도 들어갈 수 없고,
   * 그러면 첫 여정이 영영 끝나지 않는다.
   *
   * 퀘스트 목적지에서 이미 같은 검사를 하고 있다(반복 초기에 실제로 걸렸던
   * 부류다). 흔적 단계는 나중에 붙어서 그 검사를 못 받았다.
   *
   * 완주 시뮬레이션도 도움이 안 된다 — `cluesFound: 99`로 이 단계를 통째로
   * 건너뛴다(계산이 아니라 위치 문제라 시뮬레이션으로는 못 본다).
   */
  it("모두 스폰에서 걸어서 닿는다", () => {
    const unreachable = CLUES.filter(
      (clue) => !walkableFrom(layout.spawn.x, layout.spawn.z, clue.x, clue.z, CLUE_RADIUS),
    ).map((clue) => `${clue.id} (${clue.x.toFixed(0)}, ${clue.z.toFixed(0)})`);

    expect(unreachable, `걸어서 못 가는 흔적: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("도깨비 자리도 걸어서 닿는다", () => {
    /*
     * 같은 이유로 함께 본다 — 자리가 안뜰에 있으면 「찾아갈 자리가 생겼다」는
     * 알림이 갈 수 없는 곳을 가리킨다.
     *
     * 자판기 80대도 재 봤고 전부 닿았다. 다만 80번의 격자 탐색은 느려서
     * 검사로는 두지 않았다 — 한 번 확인한 것으로 족하다고 판단했다.
     */
    const unreachable = DOKEBI_ORDER.flatMap((id) => {
      const home = DOKEBI[id].home;
      if (!home) return [];
      return walkableFrom(layout.spawn.x, layout.spawn.z, home.x, home.z, 3) ? [] : [id];
    });
    expect(unreachable, `걸어서 못 가는 자리: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("조사 반경 안에 설 자리가 있다", () => {
    // 반경 안이 전부 건물이면 옆에 서 있어도 `T`가 아무 일도 하지 않는다
    for (const clue of CLUES) {
      const free = sampleFreePoints(clue.x, clue.z, CLUE_RADIUS);
      expect(free.length, `${clue.id} 반경 ${CLUE_RADIUS}m 안이 전부 막혔다`).toBeGreaterThan(0);
    }
  });
});

describe("그래플", () => {
  /*
   * 씬이 만드는 것과 같은 방식으로 지점을 뽑는다. 이 필터가 어긋나면
   * 그래플이 아무것도 못 걸고, 능력 하나가 조용히 죽는다.
   */
  const anchors = layout.props
    .filter((prop) => prop.tone === 0 && prop.height > 4)
    .map((prop) => ({ x: prop.x, y: prop.height, z: prop.z }));

  it("걸 수 있는 지점이 존재한다", () => {
    expect(anchors.length, "가로등 필터가 아무것도 못 골랐다").toBeGreaterThan(50);
  });

  it("모든 지점이 플레이어 키보다 높다", () => {
    // 낮은 지점은 findGrappleTarget이 전부 걸러 낸다 — 그러면 목록만 있고 못 건다
    for (const anchor of anchors) {
      expect(anchor.y, `anchor y=${anchor.y}`).toBeGreaterThan(2);
    }
  });

  it("스폰 근처에서 방향만 맞으면 걸린다", () => {
    /*
     * 시작하자마자 쓸 수 없으면 조작표에 있는 능력을 배울 기회가 없다.
     * 사방을 훑어 한 방향이라도 걸리는지 본다.
     */
    const position = { x: layout.spawn.x, y: 0, z: layout.spawn.z };
    const hit = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).some(
      (facing) => findGrappleTarget(position, facing, anchors) !== null,
    );
    expect(hit, "no grapple target in any direction from spawn").toBe(true);
  });

  it("사거리 밖은 걸리지 않는다", () => {
    // 월드 밖에서 부르면 null이어야 한다. 아니면 사거리 판정이 죽은 것이다
    const far = { x: layout.halfExtent * 4, y: 0, z: layout.halfExtent * 4 };
    expect(findGrappleTarget(far, 0, anchors)).toBeNull();
  });
});

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
    const blocking = blockedBy(home.x, home.z, 2);
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
    expect(walkableFrom(layout.spawn.x, layout.spawn.z, home.x, home.z, 6)).toBe(true);
  });
});

describe("조용히 비는 것이 없는가", () => {
  /*
   * 생성기가 아무것도 만들지 않아도 화면은 뜬다. 간판 없는 도시, 자판기 없는
   * 골목은 "그렇게 만든 것"과 구분되지 않는다 — 퀘스트 단계에 대사를
   * 빠뜨렸을 때와 같은 종류의 결함이다.
   *
   * 비어도 되는 레이어는 없다. 하나라도 0이면 그 생성기가 죽은 것이다.
   */
  /*
   * 스무 개를 손으로 적어 두었었다. 새 레이어를 하나 더하면 그것은 **비어
   * 있어도 통과한다** — 죽은 생성기를 잡으려는 검사가 정작 새 생성기를
   * 안 본다. 두 객체에서 배열인 것을 그대로 훑는다.
   */
  const layers: Record<string, readonly unknown[]> = Object.fromEntries(
    [...Object.entries(layout), ...Object.entries(details)].filter(
      (entry): entry is [string, readonly unknown[]] => Array.isArray(entry[1]),
    ),
  );

  it("레이어를 손으로 적지 않고 찾아냈다", () => {
    // 훑기가 망가지면 빈 목록이 되고, 아래 검사는 통과하면서 아무것도 안 본다
    expect(
      Object.keys(layers).length,
      `찾은 레이어 ${Object.keys(layers).length}개`,
    ).toBeGreaterThan(15);
  });

  it("모든 레이어에 무언가 들어 있다", () => {
    const empty = Object.entries(layers)
      .filter(([, items]) => items.length === 0)
      .map(([name]) => name);
    expect(empty, `empty layers: ${empty.join(", ")}`).toEqual([]);
  });

  it("간판이 건물 수에 비해 터무니없이 적지 않다", () => {
    // 하나만 나와도 위 검사는 통과한다. 생성기가 반쯤 죽은 경우를 잡는다.
    const signs = details.signsHorizontal.length + details.signsVertical.length;
    expect(signs, `${signs} signs for ${layout.buildings.length} buildings`).toBeGreaterThan(
      layout.buildings.length * 0.2,
    );
  });
});

describe("자판기", () => {
  const machines = details.vendingMachines;

  it("도시에 실제로 서 있다", () => {
    /*
     * 확률(0.2)로 놓이므로 시드가 바뀌면 0개가 될 수 있다. 그러면 음료
     * 기능은 코드만 남고 조용히 죽는다 — 키를 눌러도 아무 일이 없다.
     */
    expect(machines.length, `${machines.length} vending machines`).toBeGreaterThan(5);
  });

  it("건물 안에 박혀 있지 않다", () => {
    const stuck = machines.filter((machine) => blockedBy(machine.x, machine.z, 0.6).length > 1);
    expect(stuck.length, `${stuck.length}/${machines.length} machines inside colliders`).toBe(0);
  });

  it("적어도 하나는 스폰에서 걸어서 닿는다", () => {
    // 전부 안뜰에 있으면 기능이 있어도 쓸 수 없다
    const reachable = machines.some((machine) =>
      walkableFrom(layout.spawn.x, layout.spawn.z, machine.x, machine.z, VENDING.reachMeters),
    );
    expect(reachable, "no vending machine is walkable from spawn").toBe(true);
  });

  it("두 대가 같은 자리에 겹치지 않는다", () => {
    // 겹치면 하나는 영영 못 쓴다 (가까운 쪽만 잡힌다)
    for (let i = 0; i < machines.length; i += 1) {
      for (let j = i + 1; j < machines.length; j += 1) {
        const gap = Math.hypot(machines[i].x - machines[j].x, machines[i].z - machines[j].z);
        expect(gap, `machines ${i} and ${j} are ${gap.toFixed(2)}m apart`).toBeGreaterThan(1);
      }
    }
  });
});

describe("구역 중심을 유도하는 곳이 서로 맞는가", () => {
  /*
   * 도로 좌표에서 한 것과 같은 대조를 **구역 중심**에도 건다. 위 검사의 주석이
   * 「실제로 roster와 minimap이 반 칸 어긋난 채 오래 굴러갔다」고 적어 두었는데,
   * 정작 그 minimap의 구역 중심 공식은 아무도 안 보고 있었다.
   *
   * `(gridSize - 1) / 2`가 소스 13곳에 복제돼 있다. 하나씩 `gridSize / 2`로
   * 바꿔 보니 **열한 곳은 잡히고 두 곳이 통과했다** — 군중과 지도다. 어긋나면
   * 사람은 이렇게 겪는다: 보행자가 인도가 아니라 건물 속을 걷고, 지도를 보고
   * 찾아간 자리에 아무것도 없다.
   *
   * 공식을 베끼지 않고 **도로 정본과의 관계**로 본다. 구역 중심은 이웃한 두 도로
   * 중심의 한가운데다 — 같은 식을 다시 쓰면 둘 다 틀려도 서로 맞는다고 나온다.
   */
  const HALF_PITCH = (CITY.blockSize + CITY.roadWidth) / 2;

  /** 이웃한 두 도로 중심의 한가운데에 있는가 */
  function betweenRoads(value: number): boolean {
    const left = ROAD_CENTERS.some((road) => Math.abs(road - (value - HALF_PITCH)) < 1e-6);
    const right = ROAD_CENTERS.some((road) => Math.abs(road - (value + HALF_PITCH)) < 1e-6);
    return left && right;
  }

  it("대조에 쓸 도로 정본이 비어 있지 않다", () => {
    // 정본이 비면 어떤 좌표든 통과한다
    expect(ROAD_CENTERS.length, `도로 ${ROAD_CENTERS.length}개`).toBeGreaterThan(3);
  });

  it("지도가 아는 구역 중심이 도로 사이 한가운데다", () => {
    for (const cell of blockCells()) {
      expect(betweenRoads(cell.x), `구역 ${cell.index} x=${cell.x}`).toBe(true);
      expect(betweenRoads(cell.z), `구역 ${cell.index} z=${cell.z}`).toBe(true);
    }
  });

  it("보행자가 도는 구역 중심이 같은 자리다 — 어긋나면 건물 속을 걷는다", () => {
    const walkers = buildPedestrians(CROWD.maxPedestrians);
    expect(walkers.length, "보행자가 없다").toBeGreaterThan(0);
    for (const walker of walkers) {
      expect(betweenRoads(walker.cx), `보행자 cx=${walker.cx}`).toBe(true);
      expect(betweenRoads(walker.cz), `보행자 cz=${walker.cz}`).toBe(true);
    }
  });

  it("첫 스폰이 광장 구역 안에 있다 — 지도와 발밑이 같아야 한다", () => {
    /*
     * 예전에는 「구역 중심과 정확히 같다」였다. 스폰이 담 앞으로 나가면서 더는
     * 중심이 아니지만, **광장 구역 안**이라는 것은 여전히 지켜야 한다 — 벗어나면
     * 시작하자마자 지도가 말하는 동네와 발밑이 다르다.
     */
    const plaza = blockCenter(CITY.plazaBlockIndex);
    const half = CITY.blockSize / 2;

    expect(Math.abs(layout.spawn.x - plaza.cx), `스폰 x=${layout.spawn.x}`).toBeLessThan(half);
    expect(Math.abs(layout.spawn.z - plaza.cz), `스폰 z=${layout.spawn.z}`).toBeLessThan(half);

    const cell = blockCells().find(
      (item) => Math.abs(item.x - plaza.cx) < 1e-6 && Math.abs(item.z - plaza.cz) < 1e-6,
    );
    expect(cell, "지도가 광장 구역을 모른다").toBeDefined();
  });

  it("첫 스폰이 마당 공식과 정확히 같다", () => {
    /*
     * 「구역 안에 있다」만 재면 좌표를 아무 데나 옮겨도 통과한다. 담에서 몇 미터
     * 떨어져야 하는지는 `courtyardSpawnZ` 하나가 정하고, 배치가 그것을 실제로
     * 쓰는지까지 봐야 뜻이 있다.
     */
    const plaza = blockCenter(CITY.plazaBlockIndex);
    const expected = courtyardSpawnZ(plaza.cz, CITY.blockSize);

    expect(layout.spawn.x, `스폰 x=${layout.spawn.x}`).toBeCloseTo(plaza.cx, 6);
    expect(layout.spawn.z, `스폰 z=${layout.spawn.z} / 기대 ${expected}`).toBeCloseTo(expected, 6);
  });

  /*
   * 「시작 지점 둘레가 비어 있다」는 검사를 여기 두려다 걷어냈다. 담은 **일부러**
   * 5m 앞에 세운 것이라 반경으로 재면 그 담이 걸린다. 시작하자마자 막히는지는
   * `terrainWalk`의 「어느 방향으로든 실제로 나아간다」가 이미 재고 있고,
   * 화단이 스폰 옆에 섰을 때 동쪽 3.7m를 잡아낸 것도 그 검사다.
   */
  it("정본(blockCenter)이 도로 사이 한가운데를 돌려준다", () => {
    /*
     * 보도블록이 이 정본을 쓴다. 자기 식을 갖고 있을 때는 반 칸 옮겨도 아무도
     * 몰랐다 — 보도블록이 도로 위에 깔리고 구역 사이가 비는 그림이다.
     */
    for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
      const { cx, cz } = blockCenter(index);
      expect(betweenRoads(cx), `구역 ${index} cx=${cx}`).toBe(true);
      expect(betweenRoads(cz), `구역 ${index} cz=${cz}`).toBe(true);
    }
  });

  it("정본과 지도가 같은 좌표를 말한다", () => {
    // 둘이 갈라지면 화면과 지도가 다른 도시를 그린다
    for (const cell of blockCells()) {
      const canonical = blockCenter(cell.index);
      expect(cell.x, `구역 ${cell.index}`).toBeCloseTo(canonical.cx, 6);
      expect(cell.z, `구역 ${cell.index}`).toBeCloseTo(canonical.cz, 6);
    }
  });
});

describe("간판이 길 쪽을 보는가", () => {
  /*
   * 비교 방향 훑기에서 **열셋**이 나온 자리다. 대부분 「어느 면에 붙일까」를
   * 정하는 판정인데, 뒤집히면 간판이 **건물 사이 틈이나 구역 안쪽**을 향한다 —
   * 인스턴스 수는 그대로라 성능도 같고 화면만 조용히 비어 보인다.
   *
   * 그 파일 주석이 이미 적어 두었다: 「무작위로 고르면 **절반은 영영 보이지
   * 않는다**. 바깥쪽 면을 고르면 같은 수로 보이는 간판이 두 배가 된다」.
   * 글로만 있던 규칙이다.
   *
   * 면 고르기 함수는 내보내지 않으므로 **결과물의 방향**으로 잰다 — 간판이
   * 구역 중심에서 바깥을 향하는지.
   */
  const details = buildCityDetails(layout);

  /** 그 조각이 구역 중심에서 바깥을 향하는가 */
  function facesOutward(piece: {
    x: number;
    z: number;
    blockIndex: number;
    rotationY?: number;
  }): boolean {
    const { cx, cz } = blockCenter(piece.blockIndex);
    // rotationY는 면의 바깥 방향이다 (0=+Z, PI/2=+X)
    const normalX = Math.sin(piece.rotationY ?? 0);
    const normalZ = Math.cos(piece.rotationY ?? 0);
    return normalX * (piece.x - cx) + normalZ * (piece.z - cz) > 0;
  }

  it.each([
    ["가로 간판", "signsHorizontal"],
    ["세로 간판", "signsVertical"],
    ["차양", "awnings"],
  ] as const)("%s이 바깥을 향한다", (_name, key) => {
    const pieces = details[key];
    expect(pieces.length, `${key}가 없다 — 이 검사가 헛돈다`).toBeGreaterThan(10);

    const inward = pieces.filter((piece) => !facesOutward(piece));
    expect(
      inward.length,
      `${inward.length}/${pieces.length}개가 안쪽을 본다 — 그만큼 영영 안 보인다`,
    ).toBe(0);
  });

  it("길에 더 가까운 면을 쓴다 — 두 면 다 바깥이라 「바깥」만으로는 못 가른다", () => {
    /*
     * 건물이 구역 중심에서 밀려난 방향 중 **더 많이 밀린 축**의 면이 길에 가깝다.
     * 반대 축을 고르면 간판이 건물 사이 좁은 틈을 향한다 — 바깥이긴 하지만
     * 아무도 못 본다. 「바깥을 본다」 검사는 이걸 통과시켰다.
     */
    const wrongAxis = details.signsHorizontal.filter((sign) => {
      const { cx, cz } = blockCenter(sign.blockIndex);
      const alongX = Math.abs(Math.sin(sign.rotationY ?? 0)) > 0.5;
      const dx = Math.abs(sign.x - cx);
      const dz = Math.abs(sign.z - cz);
      // 구역 정중앙 건물은 어느 축도 우세하지 않다 — 규칙 밖이라 뺀다
      if (Math.abs(dx - dz) < 0.5) return false;
      return alongX ? dx < dz : dz < dx;
    });

    expect(
      wrongAxis.length,
      `${wrongAxis.length}/${details.signsHorizontal.length}개가 좁은 틈을 향한다`,
    ).toBe(0);
  });

  it("한 건물이 두 면을 쓰더라도 둘 다 바깥이다", () => {
    // 모서리 필지는 두 면에 붙는다. 하나만 맞아도 통과하면 안 된다
    const byBuilding = new Map<string, number>();
    for (const sign of details.signsHorizontal) {
      const key = `${sign.blockIndex}:${Math.round(sign.x)}:${Math.round(sign.z)}`;
      byBuilding.set(key, (byBuilding.get(key) ?? 0) + 1);
    }
    expect(details.signsHorizontal.every(facesOutward), "안쪽을 보는 간판이 있다").toBe(true);
  });
});

describe("도로와 옥상이 비지 않는가", () => {
  /*
   * 비교 방향 훑기에서 나왔다. 셋 다 **반복이 아예 안 돌거나 반대로 도는** 자리라
   * 결과가 통째로 사라진다:
   *
   *   - 옥상 실외기 반복 → **옥상이 민둥민둥해진다**(높은 데서 내려다보는 그림이다)
   *   - 차선 점선 반복 → **속도를 읽는 눈금이 없어진다**(달릴 때 체감이 바뀐다)
   *
   * 「0보다 많다」가 아니라 **무엇당 몇 개**로 잰다 — 이 세션에 그 차이로 두 번 놓쳤다.
   */
  const details = buildCityDetails(layout);
  const blocks = CITY.gridSize * CITY.gridSize;

  it("옥상에 물탱크만이 아니라 실외기까지 올라간다", () => {
    /*
     * 처음엔 「구역당 하나 넘게」로 적었다가 **못 잡았다** — 실외기 반복을 죽여도
     * 물탱크·난간이 남아 구역당 8.7개였다. 실외기까지 있어야 13개다.
     *
     * 「무언가 있다」가 아니라 **얼마나 있어야 하는가**를 재야 한다. 이 세션에
     * 개수 검사가 헐렁했던 세 번째 자리다.
     */
    const perBlock = details.rooftops.length / blocks;
    expect(
      perBlock,
      `구역당 ${perBlock.toFixed(1)}개 (전체 ${details.rooftops.length})`,
    ).toBeGreaterThan(10);
  });

  it("도로 표시가 도로마다 그려진다", () => {
    // 도로는 격자당 한 줄씩 가로·세로로 있다
    const perRoad = details.roadMarks.length / (CITY.gridSize * 2);
    expect(
      perRoad,
      `도로당 ${perRoad.toFixed(1)}개 (전체 ${details.roadMarks.length})`,
    ).toBeGreaterThan(20);
  });

  it("도로 표시가 둘레 도로를 넘지 않는다", () => {
    /*
     * 처음엔 `halfExtent`를 넘으면 안 된다고 적었다가 **181개가 걸렸다** — 도시
     * 바깥에 **둘레 도로**가 있어서 거기 표시가 경계 너머에 그려진다. 결함이
     * 아니라 내 가정이 틀렸다.
     *
     * 그래도 「어디까지든 괜찮다」는 아니다 — 둘레 도로 폭만큼만 허용한다.
     */
    const limit = layout.halfExtent + CITY.roadWidth;
    const beyond = details.roadMarks.filter(
      (mark) => Math.abs(mark.x) > limit || Math.abs(mark.z) > limit,
    );
    expect(beyond.length, `둘레 도로 밖 표시 ${beyond.length}개 (한계 ${limit})`).toBe(0);
  });

  /*
   * 못 재는 것 둘 — 결과물에 **신원이 없다**:
   *
   *   - 「갓길 주차가 도로 **양쪽**에 있는가」: 차에 도로 축이 안 실려 있어
   *     세계 좌표만으로는 어느 쪽 갓길인지 모른다.
   *   - 「정지선이 다가오는 차로에 그려지는가」: 표시에 진행 방향이 안 실려 있다.
   *
   * 둘 다 뒤집어 봤고 검사는 통과한다. 재려면 결과물에 축·방향을 실어야 하는데,
   * 그건 **렌더가 안 쓰는 값을 넣는 것**이라 지금은 안 한다. 여기 적어 둔다.
   */
});

describe("전깃줄과 현수막", () => {
  /*
   * 비교 방향 훑기에서 여럿 나왔다. 전깃줄 쪽이 특히 고약하다 —
   * 축 판정을 뒤집으면 **대각선으로 이어져 도시가 그물에 덮이고**, 길이 판정을
   * 뒤집으면 **멀리 떨어진 기둥끼리 이어져** 하늘을 가로지른다. 그 파일 주석이
   * 「대각선으로 이으면 격자처럼 보인다」고 적어 둔 그 사고다.
   *
   * 현수막은 격자 반복이 뒤집히면 **하나도 안 생긴다.**
   */
  const details = buildCityDetails(layout);

  /** 전깃줄 한 가닥씩 (여섯 수가 한 선분) */
  function wireSegments(): Array<{ ax: number; az: number; bx: number; bz: number }> {
    const out: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
    const v = details.wireVertices;
    for (let i = 0; i + 5 < v.length; i += 6) {
      out.push({ ax: v[i], az: v[i + 2], bx: v[i + 3], bz: v[i + 5] });
    }
    return out;
  }

  it("전깃줄이 실제로 걸려 있다", () => {
    expect(wireSegments().length, "전깃줄이 없다").toBeGreaterThan(20);
  });

  it("전깃줄이 축을 따라만 이어진다 — 대각선이면 도시가 그물에 덮인다", () => {
    const diagonal = wireSegments().filter(
      (wire) => Math.abs(wire.ax - wire.bx) > 0.01 && Math.abs(wire.az - wire.bz) > 0.01,
    );
    expect(diagonal.length, `대각선 ${diagonal.length}가닥`).toBe(0);
  });

  it("전깃줄이 이웃한 기둥끼리만 이어진다 — 멀리 이으면 하늘을 가로지른다", () => {
    const limit = CITY.streetLightSpacing * 1.35;
    const tooLong = wireSegments().filter(
      (wire) => Math.hypot(wire.ax - wire.bx, wire.az - wire.bz) > limit + 1e-6,
    );
    expect(tooLong.length, `${limit}m를 넘는 가닥 ${tooLong.length}개`).toBe(0);
  });

  it("현수막이 건물에도 도로 위에도 걸린다", () => {
    /*
     * 「도로당 몇 개」로 썼다가 **또 못 잡았다** — 현수막이 **두 곳에서** 나온다.
     * 건물 벽(높이 6.05)과 도로를 가로지르는 것(4.15)인데, 도로 쪽을 통째로
     * 죽여도 건물 것 40개가 남아 통과했다.
     *
     * 이 세션에 개수 검사가 헐렁했던 **네 번째**다. 매번 「같은 통에 다른 출처가
     * 섞여 있다」였다 — 세는 것만으로는 어느 출처가 죽었는지 모른다.
     */
    const overRoad = details.banners.filter((banner) => banner.y < 5);
    const onWall = details.banners.filter((banner) => banner.y >= 5);

    expect(overRoad.length, "도로를 가로지르는 현수막이 없다").toBeGreaterThan(5);
    expect(onWall.length, "건물 벽 현수막이 없다").toBeGreaterThan(5);
  });
});
