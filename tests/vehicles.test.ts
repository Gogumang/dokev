import { describe, expect, it } from "vitest";

import { bothWays, describeSplit } from "./support/bothWays";

import {
  CARRIED_VEHICLE,
  PASTURE_VEHICLES,
  isVehicle,
  LOCOMOTION,
  STAND_VEHICLES,
  VEHICLE_KINDS,
  VEHICLE_TOP_SPEED,
  type LocomotionMode,
  type VehicleKind,
} from "@/game/config/tuning";
import { clipFor, freezes, CLIP, type ClipInput } from "@/game/player/characterClips";
import { createEmoteState } from "@/game/player/emote";
import { resolveMode, type MoveInput } from "@/game/player/locomotion";
import { blockCenter, CITY } from "@/game/world/cityLayout";
import { isUrbanBlock } from "@/game/world/zones";
import { terrainHeight } from "@/game/world/terrain";
import { CURB_EDGE } from "@/game/world/sidewalks";
import {
  buildStandBoxes,
  buildVehicleStands,
  standInReach,
  STAND_REACH,
} from "@/game/world/vehicleStands";

/*
 * 탈것 — 킥보드·자전거·스케이트보드.
 *
 * 오래 「보드」 하나였다. 셋으로 나눈 이유는 모양이 아니라 **손맛**이라, 셋이
 * 실제로 다르게 움직이는지가 이 파일의 첫 질문이다. 수치를 복사해 두고 이름만
 * 셋이면 아무도 눈치채지 못한 채 하나짜리로 남는다.
 */

const stands = buildVehicleStands();

function moving(overrides: Partial<MoveInput> = {}): MoveInput {
  return {
    moveX: 0,
    moveZ: 1,
    jump: false,
    jumpHeld: false,
    grappleRequested: false,
    run: false,
    vehicle: null,
    cameraYaw: 0,
    ...overrides,
  };
}

function riding(mode: ClipInput["mode"]): ClipInput {
  return {
    mode,
    speed: 9,
    grounded: true,
    gliding: false,
    attackElapsed: null,
    emote: createEmoteState(),
    downed: false,
  };
}

describe("탈것이 실제로 다른가", () => {
  it("다섯 종류다 — 거치대 셋, 들고 다니는 것 하나, 풀밭 하나", () => {
    expect(VEHICLE_KINDS.length, `탈것: ${VEHICLE_KINDS.join(", ")}`).toBe(5);
  });

  it("최고 속도가 전부 다르다 — 같으면 이름만 여럿이다", () => {
    const speeds = VEHICLE_KINDS.map((kind) => LOCOMOTION[kind].maxSpeed);
    expect(new Set(speeds).size, `최고 속도: ${speeds.join(", ")}`).toBe(VEHICLE_KINDS.length);
  });

  it("회전과 감속도 갈린다 — 속도만 다르면 같은 것을 배속한 것이다", () => {
    const turns = VEHICLE_KINDS.map((kind) => LOCOMOTION[kind].turnRate);
    const decels = VEHICLE_KINDS.map((kind) => LOCOMOTION[kind].decel);
    expect(new Set(turns).size, `회전: ${turns.join(", ")}`).toBe(VEHICLE_KINDS.length);
    expect(new Set(decels).size, `감속: ${decels.join(", ")}`).toBe(VEHICLE_KINDS.length);
  });

  it("살아 있는 것은 제일 느리고 잘 선다", () => {
    /*
     * 조랑말이 기계보다 빠르면 「짐승을 탄다」는 감각이 사라지고 그냥 빠른
     * 탈것이 하나 더 있는 것이 된다. 대신 스스로 발을 짚으므로 감속은 세다.
     */
    const speeds = VEHICLE_KINDS.map((kind) => LOCOMOTION[kind].maxSpeed);
    expect(LOCOMOTION.pony.maxSpeed, `속도들: ${speeds.join(", ")}`).toBe(Math.min(...speeds));
    expect(
      LOCOMOTION.pony.decel,
      `조랑말 감속 ${LOCOMOTION.pony.decel} vs 보드 ${LOCOMOTION.skateboard.decel}`,
    ).toBeGreaterThan(LOCOMOTION.skateboard.decel);
  });

  it("킥보드가 가장 민첩하고 자전거가 가장 빠르다", () => {
    /*
     * 성격을 값으로 못 박는다. 튜닝하다 보면 「빠르고 민첩한」 하나로 수렴하기
     * 쉬운데, 그러면 나머지 둘을 고를 이유가 사라진다.
     */
    const fastest = VEHICLE_KINDS.reduce((a, b) =>
      LOCOMOTION[a].maxSpeed > LOCOMOTION[b].maxSpeed ? a : b,
    );
    const nimblest = VEHICLE_KINDS.reduce((a, b) =>
      LOCOMOTION[a].turnRate > LOCOMOTION[b].turnRate ? a : b,
    );
    expect(fastest, `가장 빠른 것: ${fastest}`).toBe("bike");
    expect(nimblest, `가장 민첩한 것: ${nimblest}`).toBe("kickboard");
    expect(fastest, "가장 빠른 것이 가장 민첩하기까지 하면 나머지를 탈 이유가 없다").not.toBe(
      nimblest,
    );
  });

  it("전부 두 발보다 빠르다 — 느리면 아무도 안 탄다", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(LOCOMOTION[kind].maxSpeed, `${kind}`).toBeGreaterThan(LOCOMOTION.run.maxSpeed);
    }
  });

  it("가장 빠른 값이 실제 최고치다 — 낡으면 바람이 진작 최대가 된다", () => {
    expect(VEHICLE_TOP_SPEED).toBe(Math.max(...VEHICLE_KINDS.map((k) => LOCOMOTION[k].maxSpeed)));
  });

  it("두 발과 탈것이 갈린다", () => {
    const modes: LocomotionMode[] = ["walk", "run", ...VEHICLE_KINDS];
    expect(bothWays(modes, isVehicle), describeSplit(modes, isVehicle)).toBe(true);
  });
});

describe("거리에 선 것과 들고 다니는 것", () => {
  it("셋을 합치면 전부다 — 어느 쪽에도 없는 탈것은 탈 방법이 없다", () => {
    const reachable = new Set<VehicleKind>([
      ...STAND_VEHICLES,
      ...PASTURE_VEHICLES,
      CARRIED_VEHICLE,
    ]);
    expect([...reachable].sort(), `탈 수 있는 것: ${[...reachable].join(", ")}`).toEqual(
      [...VEHICLE_KINDS].sort(),
    );
  });

  it("들고 다니는 것은 거리에 서지 않는다 — 겹치면 거치대가 무의미하다", () => {
    expect(STAND_VEHICLES).not.toContain(CARRIED_VEHICLE);
  });
});

describe("거치대 자리", () => {
  const ALL_BLOCKS = Array.from({ length: CITY.gridSize * CITY.gridSize }, (_, i) => i);
  const urban = ALL_BLOCKS.filter(isUrbanBlock);
  const natural = ALL_BLOCKS.filter((index) => !isUrbanBlock(index));

  it("도시 구역마다 선다 — 한 구역이라도 비면 그 동네에선 탈 수 없다", () => {
    const covered = new Set(
      stands.filter((stand) => isUrbanBlock(stand.blockIndex)).map((stand) => stand.blockIndex),
    );
    expect(covered.size, `선 구역 ${covered.size}개 / 도시 구역 ${urban.length}개`).toBe(urban.length);
  });

  it("자연 구역마다 조랑말이 있다 — 빈 들판에서는 걸어 나가야 한다", () => {
    /*
     * 예전에는 자연 구역에 탈 것이 아예 없었고 「걸어 나오면 된다」고 적어
     * 두었다. 숲과 해안이 가장 넓은데 거기서만 이동이 두 발로 돌아간다.
     */
    const ponyCell = VEHICLE_KINDS.indexOf("pony");
    const covered = new Set(
      stands.filter((stand) => stand.cell === ponyCell).map((stand) => stand.blockIndex),
    );
    expect(covered.size, `조랑말이 있는 자연 구역 ${covered.size}개 / ${natural.length}개`).toBe(
      natural.length,
    );
  });

  it("자연 구역에는 서지 않는다", () => {
    /*
     * **달려 보고 찾았다.** 해안을 달리다 모래밭에 거치대가 줄지어 선 것을
     * 봤다. 숲·공원도 마찬가지였다 — 이 저장소가 가로등·연석·차선·점자블록에서
     * 이미 한 번씩 걷어낸 모양인데(`zones.isUrban` 주석) 거치대만 관문이 없었다.
     *
     * 자리 자체가 **연석 기준**이라, 연석이 없는 구역에서는 기준선조차 없는
     * 자리에 놓고 있었다.
     */
    const rackCells = STAND_VEHICLES.map((kind) => VEHICLE_KINDS.indexOf(kind));
    const strays = stands.filter(
      (stand) => !isUrbanBlock(stand.blockIndex) && rackCells.includes(stand.cell),
    );
    expect(strays.length, `자연 구역의 거치대 ${strays.length}개`).toBe(0);
  });

  it("조랑말은 도시에 서지 않는다 — 차도 옆에 매어 두는 짐승은 없다", () => {
    const ponyCell = VEHICLE_KINDS.indexOf("pony");
    const inCity = stands.filter(
      (stand) => stand.cell === ponyCell && isUrbanBlock(stand.blockIndex),
    );
    expect(inCity.length, `도시 구역의 조랑말 ${inCity.length}마리`).toBe(0);
  });

  it("자연 구역에서도 한두 칸만 나오면 만난다", () => {
    /*
     * 「어느 구역에서든 찾아 헤매지 않는다」는 약속은 지켜야 한다. 자연
     * 구역이 전부 도시 가장자리에 붙어 있어 성립하는데, 지도를 바꾸면
     * 깨질 수 있으므로 못 박아 둔다.
     *
     * 숲에서 이동이 막히던 그래플과는 경우가 다르다 — 저쪽은 **대안이 없어서**
     * 선돌을 먼저 세웠고, 이쪽은 걸어 나오면 된다.
     */
    const pitch = CITY.blockSize + CITY.roadWidth;
    for (const index of natural) {
      const { cx, cz } = blockCenter(index);
      const nearest = Math.min(
        ...stands.map((stand) => Math.hypot(stand.x - cx, stand.z - cz)),
      );
      expect(
        nearest,
        `구역 ${index}에서 가장 가까운 거치대까지 ${nearest.toFixed(0)}m`,
      ).toBeLessThan(pitch * 2.2);
    }
  });

  it("도시 구역마다 거치대 종류가 다 있다", () => {
    const byBlock = new Map<number, Set<number>>();
    for (const stand of stands) {
      if (!isUrbanBlock(stand.blockIndex)) continue;
      const seen = byBlock.get(stand.blockIndex) ?? new Set<number>();
      seen.add(stand.cell);
      byBlock.set(stand.blockIndex, seen);
    }
    const thin = [...byBlock.entries()].filter(([, kinds]) => kinds.size < STAND_VEHICLES.length);
    expect(thin.length, `한 종류만 있는 구역 ${thin.length}개`).toBe(0);
  });

  it("인도 위에 선다 — 연석 밖이면 차도 한복판이다", () => {
    for (const stand of stands) {
      // 조랑말은 인도가 없는 구역에 있으므로 이 규칙의 대상이 아니다
      if (!isUrbanBlock(stand.blockIndex)) continue;
      const { cx, cz } = blockCenter(stand.blockIndex);
      const local = Math.max(Math.abs(stand.x - cx), Math.abs(stand.z - cz));
      expect(local, `연석 ${CURB_EDGE}에서 ${local}`).toBeLessThan(CURB_EDGE);
    }
  });

  it("도시 전체가 같은 무늬가 아니다 — 네 변에 고루 선다", () => {
    const angles = new Set(stands.map((stand) => stand.rotationY.toFixed(3)));
    expect(angles.size, `쓰인 방향 ${angles.size}가지`).toBeGreaterThan(2);
  });

  it("두 번 만들어도 같다", () => {
    expect(buildVehicleStands()).toEqual(stands);
  });
});

describe("가까이 가면 탈 수 있는가", () => {
  const first = stands[0];

  it("바로 앞에 서면 그것을 탄다", () => {
    expect(standInReach(stands, first.x, first.z)).toBe(VEHICLE_KINDS[first.cell]);
  });

  it("반경 밖이면 아무것도 아니다 — 길 건너 자전거를 타면 안 된다", () => {
    /*
     * 도시 밖 먼 곳에서 잰다. 도시 안에서는 어디에 서도 다른 거치대가 가까워
     * 「반경이 작동하는가」를 재지 못한다.
     */
    const far = CITY.gridSize * (CITY.blockSize + CITY.roadWidth);
    expect(standInReach(stands, far, far)).toBeNull();
  });

  it("반경 안팎이 실제로 갈린다", () => {
    const inside = standInReach([first], first.x + STAND_REACH * 0.5, first.z);
    const outside = standInReach([first], first.x + STAND_REACH * 2, first.z);
    expect(inside, "코앞인데 못 탄다").not.toBeNull();
    expect(outside, `${STAND_REACH * 2}m 떨어졌는데 탄다`).toBeNull();
  });

  it("빈 거리에서는 아무것도 없다", () => {
    expect(standInReach([], 0, 0)).toBeNull();
  });
});

describe("세워 둔 모습", () => {
  const boxes = buildStandBoxes(stands, 1, 3, 5);

  it("자리마다 상자가 선다 — 없으면 탈 수 있는데 안 보인다", () => {
    expect(boxes.length, `상자 ${boxes.length}개 / 자리 ${stands.length}개`).toBeGreaterThan(
      stands.length,
    );
  });

  it("도시 것은 인도 위에 얹힌다 — 바닥에 묻히면 안 보인다", () => {
    for (const box of boxes) {
      if (!isUrbanBlock(box.blockIndex)) continue;
      expect(box.y, `y=${box.y}`).toBeGreaterThan(CITY.sidewalkHeight);
    }
  });

  it("풀밭 것은 지형 위에 얹힌다 — 인도 높이를 쓰면 언덕에 묻힌다", () => {
    /*
     * 자연 구역에는 인도가 없다. 상판 두께를 그대로 더하면 언덕에서는 땅에
     * 묻히고 골짜기에서는 공중에 뜬다 — 어느 쪽이든 화면에서 바로 보인다.
     */
    const ponyBoxes = boxes.filter((box) => !isUrbanBlock(box.blockIndex));
    expect(ponyBoxes.length, "풀밭에 선 것이 하나도 없다").toBeGreaterThan(0);
    for (const box of ponyBoxes) {
      const ground = terrainHeight(box.x, box.z);
      expect(box.y, `y=${box.y}, 지형 ${ground}`).toBeGreaterThan(ground);
    }
  });

  it("넘긴 색만 쓴다 — 숫자를 스스로 정하면 팔레트가 밀릴 때 어긋난다", () => {
    expect(new Set(boxes.map((box) => box.tone))).toEqual(new Set([1, 3, 5]));
  });

  it("짐승은 뼈대 색을 쓰지 않는다 — 말이 자전거 색이면 기계로 보인다", () => {
    const ponyCell = VEHICLE_KINDS.indexOf("pony");
    const ponyBoxes = buildStandBoxes(
      stands.filter((stand) => stand.cell === ponyCell).slice(0, 1),
      1,
      3,
      5,
    );
    expect(ponyBoxes.some((box) => box.tone === 5), "털색을 쓴 상자가 없다").toBe(true);
  });

  it("종류마다 상자 수가 다르다 — 같으면 무엇이 세워졌는지 구분되지 않는다", () => {
    const count = (cell: number) =>
      buildStandBoxes(
        stands.filter((stand) => stand.cell === cell).slice(0, 1),
        1,
        3,
        5,
      ).length;
    expect(count(0), "킥보드 상자가 없다").toBeGreaterThan(0);
    expect(count(1), "자전거 상자가 없다").toBeGreaterThan(0);
    expect(count(0), `킥보드 ${count(0)}개 vs 자전거 ${count(1)}개`).not.toBe(count(1));
  });

  it("모르는 종류는 조용히 건너뛴다 — 상자 없는 자리가 낫다", () => {
    expect(buildStandBoxes([{ ...stands[0], cell: 99 }], 1, 3, 5)).toEqual([]);
  });
});

describe("타면 무엇이 달라지는가", () => {
  it("타고 있으면 그 탈것이 곧 이동 방식이다", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(resolveMode(moving({ vehicle: kind, run: true })), `${kind}`).toBe(kind);
    }
  });

  it("내리면 두 발로 돌아온다", () => {
    expect(resolveMode(moving({ vehicle: null, run: true }))).toBe("run");
    expect(resolveMode(moving({ vehicle: null }))).toBe("walk");
  });

  it("타는 동안에는 서 있는 자세를 쓴다 — 속도로 고르면 자전거 위에서 질주한다", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(clipFor(riding(kind)), `${kind}`).toBe(CLIP.idle);
    }
    expect(clipFor(riding("run")), "두 발일 때까지 굳으면 안 된다").not.toBe(CLIP.idle);
  });

  it("타는 동안에는 동작을 세워 둔다 — 굴리면 탈것 위에서 걷는다", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(freezes(riding(kind)), `${kind}`).toBe(true);
    }
    expect(freezes(riding("run")), "땅에서 달리는데 굳었다").toBe(false);
  });

  it("타고 있어도 쓰러지면 쓰러짐이 먼저다", () => {
    expect(clipFor({ ...riding("bike"), downed: true })).toBe(CLIP.dead);
  });
});
