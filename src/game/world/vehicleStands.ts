/**
 * 거리에 세워진 탈것 — 공유 킥보드와 자전거.
 *
 * 실제 한국 거리에서 인도 한쪽에 줄지어 서 있는 그것들이다. 다가가서 타고,
 * 내리면 두고 간다. 스케이트보드는 여기 없다 — 그건 들고 다니는 내 것이라
 * 어디서든 꺼낸다(`CARRIED_VEHICLE`).
 *
 * 자리를 고르는 일과 **가까운지 재는 일**을 한 파일에 둔다. 두 곳에서 각자
 * 계산하면 화면에 보이는 자리와 탈 수 있는 자리가 어긋난다 — 이 저장소에서
 * 도로 좌표가 정확히 그렇게 반 칸 어긋난 적이 있다.
 */

import {
  PASTURE_VEHICLES,
  SHORE_VEHICLES,
  STAND_VEHICLES,
  VEHICLE_KINDS,
  type VehicleKind,
} from "@/game/config/tuning";
import { blockCenter, CITY } from "@/game/world/cityLayout";
import { isUrbanBlock } from "@/game/world/zones";
import { terrainHeight } from "@/game/world/terrain";
import { CURB_EDGE } from "@/game/world/sidewalks";
import { shoreFacing, shoreLanding } from "@/game/world/waterRide";

import type { DetailInstance } from "@/game/world/cityDetails";

/**
 * 거치대 한 자리.
 *
 * `cell`은 `VEHICLE_KINDS`의 색인이다 — 무엇이 세워져 있는지가 곧 무엇을
 * 타게 되는지라, 화면과 판정이 같은 숫자를 본다.
 */
export interface VehicleStand {
  x: number;
  z: number;
  /** `VEHICLE_KINDS`의 색인 */
  cell: number;
  /** 세워진 방향(rad). 벽을 등지고 선다 */
  rotationY: number;
  blockIndex: number;
}

/**
 * 탈 수 있는 거리(m).
 *
 * 너무 좁으면 눈앞에 두고도 못 타서 「고장 났나」 싶고, 너무 넓으면 길 건너
 * 자전거를 탄다. 한 걸음 반쯤이 적당하다.
 */
export const STAND_REACH = 3.2;

/** 연석에서 안쪽으로 들어온 거리(m). 점자블록보다 더 안쪽, 건물 앞이다 */
const STAND_INSET = 2.4;

/** 한 자리에 몇 대가 줄지어 서는지 */
const ROW_COUNT = 3;

/** 자연 구역 한 칸에 서 있는 조랑말 수. 떼로 두면 목장이 된다 */
const PASTURE_COUNT = 2;

/** 구역 한복판에서 이만큼 벌려 세운다(m). 나무와 겹치지 않을 만큼만 */
const PASTURE_RADIUS = 9;

/**
 * 물가에 대어 둔 제트스키 수.
 *
 * 부두 하나에 둘. 하나면 「그 자리에 있는 것」이고 둘이면 「대어 둔 것」으로
 * 읽힌다 — 셋 이상은 대여점이 되어 동네 풍경에서 벗어난다.
 */
const SHORE_COUNT = 2;

/** 부두 옆으로 벌려 대는 간격(m) */
const SHORE_PITCH = 2.6;



/** 줄지어 선 간격(m) */
const ROW_PITCH = 0.75;

/** 네 변의 바깥 방향. 0=북(+Z), 시계 방향 */
const SIDES = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;

/**
 * 거치대를 깐다.
 *
 * 구역마다 두 변에 하나씩 — 킥보드 줄과 자전거 줄. **네 변에 다 두지
 * 않는다**: 어디를 봐도 있으면 「거리에 세워진 것」이 아니라 배경 무늬가 된다.
 * 대신 어느 구역에서든 한 블록 안에 둘 다 있으므로 찾아 헤매지도 않는다.
 *
 * 구역 번호로 변을 고른다 — 난수를 쓰지 않아도 이웃한 구역끼리 다른 변에
 * 서고, 저장·복원과 무관하게 늘 같은 자리다.
 */
export function buildVehicleStands(halfExtent: number): VehicleStand[] {
  const radius = CURB_EDGE - STAND_INSET;
  const stands: VehicleStand[] = [];

  /*
   * 물가의 제트스키 — 경계에서 **지형이 가장 낮은 곳**에 대어 둔다.
   *
   * 거치대(인도)도 목장(풀밭)도 아닌 셋째 자리다. 좌표를 손으로 적지 않고
   * 찾는 이유는 `shoreLanding` 주석에 있다 — 적어 두면 언덕 수치를 만질
   * 때마다 제트스키가 절벽 위나 바닷속으로 간다.
   */
  const landing = shoreLanding(halfExtent);
  const alongX = Math.abs(landing.x) > Math.abs(landing.z);
  SHORE_VEHICLES.forEach((kind, slot) => {
    for (let i = 0; i < SHORE_COUNT; i += 1) {
      const offset = (i - (SHORE_COUNT - 1) / 2) * SHORE_PITCH + slot * SHORE_PITCH * SHORE_COUNT;
      stands.push({
        // 물가를 **따라** 벌려 세운다 — 바다 쪽으로 벌리면 하나가 물에 잠긴다
        x: landing.x + (alongX ? 0 : offset),
        z: landing.z + (alongX ? offset : 0),
        cell: VEHICLE_KINDS.indexOf(kind),
        // 뱃머리가 바다를 본다 — 타면 곧장 나갈 방향이다
        rotationY: shoreFacing(landing.x, landing.z),
        blockIndex: -1,
      });
    }
  });

  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    /*
     * **도시 구역에만 세운다.**
     *
     * 해안을 달려 보다 **모래밭에 거치대가 줄지어 선 것**을 봤다. 숲·공원도
     * 마찬가지였다. 이 저장소가 가로등·연석·차선·점자블록에서 이미 한 번씩
     * 걷어낸 모양인데(`zones.isUrban` 주석), 거치대만 관문이 없었다.
     *
     * 자리 자체가 애초에 **연석 기준**(`CURB_EDGE - STAND_INSET`)이다 —
     * 연석이 없는 구역에서는 기준선조차 없는 자리에 놓고 있었다.
     *
     * 자연 구역에서 탈 것이 사라지지만, 도시 구역이 스무 칸이고 자연 구역은
     * 전부 그 가장자리에 붙어 있어 한두 칸(47~94m)만 나오면 만난다. 숲에서
     * 이동이 막히던 그래플과는 경우가 다르다 — 저쪽은 **대안이 없어서**
     * 선돌을 먼저 세웠고, 이쪽은 걸어 나오면 된다.
     */
    const { cx, cz } = blockCenter(index);

    /*
     * 자연 구역에는 **거치대 대신 조랑말**이 선다.
     *
     * 예전에는 여기서 그냥 건너뛰었고, 그래서 숲·공원·해안에는 탈 것이 아예
     * 없었다("걸어 나오면 된다"고 적어 두었다). 이제는 그 자리에 어울리는 것을
     * 둔다 — 풀밭에 풀 뜯는 것이 서 있는 편이 빈 들판보다 낫고, 트레일러에서
     * 아이가 타는 짐승이 하는 일이 정확히 그것이다.
     *
     * 연석 기준(`CURB_EDGE`)을 쓰지 않는다. 연석이 없는 구역이라 기준선이
     * 없다 — 구역 한복판에서 조금 벌려 세운다.
     */
    if (!isUrbanBlock(index)) {
      PASTURE_VEHICLES.forEach((kind, slot) => {
        for (let i = 0; i < PASTURE_COUNT; i += 1) {
          const angle = ((index + slot * 2 + i * 3) % SIDES.length) * (Math.PI / 2);
          stands.push({
            x: cx + Math.sin(angle) * PASTURE_RADIUS,
            z: cz + Math.cos(angle) * PASTURE_RADIUS,
            cell: VEHICLE_KINDS.indexOf(kind),
            // 바깥을 보고 선다 — 풀을 뜯는 쪽이 구역 안쪽이 된다
            rotationY: angle,
            blockIndex: index,
          });
        }
      });
      continue;
    }

    STAND_VEHICLES.forEach((kind, slot) => {
      // 구역마다 다른 변에서 시작해 도시 전체가 같은 무늬로 보이지 않게 한다
      const angle = SIDES[(index + slot * 2) % SIDES.length];
      const nx = Math.round(Math.sin(angle));
      const nz = Math.round(Math.cos(angle));
      // 변을 따라 흐르는 방향은 바깥 방향을 90도 돌린 것이다
      const ax = nz;
      const az = -nx;

      for (let i = 0; i < ROW_COUNT; i += 1) {
        const t = (i - (ROW_COUNT - 1) / 2) * ROW_PITCH;
        stands.push({
          x: cx + nx * radius + ax * t,
          z: cz + nz * radius + az * t,
          cell: VEHICLE_KINDS.indexOf(kind),
          // 벽을 등지고 선다 — 손잡이가 길 쪽을 본다
          rotationY: angle,
          blockIndex: index,
        });
      }
    });
  }

  return stands;
}

/**
 * 상자 하나의 색 갈래.
 *
 * 불리언(`metal`)이었는데 조랑말이 들어오면서 **셋째가 필요해졌다** — 짐승은
 * 금속도 뼈대 색도 아니다. 참·거짓으로 버티면 말이 자전거 색이 된다.
 */
type PartTone = "metal" | "frame" | "coat";

/** 세워 둔 탈것 한 대가 차지하는 상자들. 종류마다 다르다 */
const PARKED: Record<number, readonly { dx: number; dy: number; dz: number; w: number; h: number; d: number; tone: PartTone }[]> = {
  // 킥보드 — 낮은 발판에 기둥 하나, 그 위 손잡이
  0: [
    { dx: 0, dy: 0.09, dz: -0.05, w: 0.2, h: 0.05, d: 0.8, tone: "frame" },
    { dx: 0, dy: 0.55, dz: 0.34, w: 0.05, h: 0.92, d: 0.05, tone: "metal" },
    { dx: 0, dy: 1.0, dz: 0.34, w: 0.46, h: 0.05, d: 0.05, tone: "metal" },
  ],
  /*
   * 장난감 자동차(3) — 낮고 넓적한 몸에 바퀴 넷. 자전거와 나란히 서 있어도
   * 실루엣으로 구분돼야 한다.
   */
  3: [
    { dx: 0, dy: 0.38, dz: 0, w: 0.86, h: 0.42, d: 1.35, tone: "frame" },
    { dx: 0.34, dy: 0.19, dz: 0.46, w: 0.12, h: 0.38, d: 0.38, tone: "metal" },
    { dx: -0.34, dy: 0.19, dz: 0.46, w: 0.12, h: 0.38, d: 0.38, tone: "metal" },
    { dx: 0.34, dy: 0.19, dz: -0.46, w: 0.12, h: 0.38, d: 0.38, tone: "metal" },
    { dx: -0.34, dy: 0.19, dz: -0.46, w: 0.12, h: 0.38, d: 0.38, tone: "metal" },
  ],
  /*
   * 조랑말(4) — 다리 넷에 몸통, 앞으로 뻗은 목.
   *
   * 세워 둔 모습이라 다리는 가만히 있다. 걷는 것은 타고 있을 때만 보인다
   * (`RiddenVehicle`).
   */
  4: [
    { dx: 0, dy: 0.9, dz: 0, w: 0.52, h: 0.56, d: 1.25, tone: "coat" },
    { dx: 0.18, dy: 0.31, dz: 0.42, w: 0.16, h: 0.62, d: 0.16, tone: "coat" },
    { dx: -0.18, dy: 0.31, dz: 0.42, w: 0.16, h: 0.62, d: 0.16, tone: "coat" },
    { dx: 0.18, dy: 0.31, dz: -0.42, w: 0.16, h: 0.62, d: 0.16, tone: "coat" },
    { dx: -0.18, dy: 0.31, dz: -0.42, w: 0.16, h: 0.62, d: 0.16, tone: "coat" },
    // 갈기가 있는 목만 어둡다 — 몸과 같은 색이면 덩어리 하나로 보인다
    { dx: 0, dy: 1.28, dz: 0.52, w: 0.26, h: 0.5, d: 0.26, tone: "metal" },
    { dx: 0, dy: 1.48, dz: 0.72, w: 0.24, h: 0.26, d: 0.42, tone: "coat" },
  ],
  /*
   * 제트스키(5) — 낮고 긴 선체에 뒤로 솟은 안장, 앞의 손잡이.
   *
   * 다른 것들과 실루엣이 갈리는 지점은 **바닥에 붙어 있다**는 것이다.
   * 바퀴가 없으니 몸통이 지면에서 시작하고, 그래서 옆에서 보면 쐐기다.
   */
  5: [
    { dx: 0, dy: 0.26, dz: 0, w: 0.62, h: 0.4, d: 1.95, tone: "coat" },
    // 뱃머리 — 앞으로 갈수록 좁고 낮다. 한 칸으로 흉내 낸다
    { dx: 0, dy: 0.44, dz: -0.82, w: 0.38, h: 0.22, d: 0.5, tone: "coat" },
    { dx: 0, dy: 0.58, dz: 0.3, w: 0.44, h: 0.24, d: 0.8, tone: "frame" },
    { dx: 0, dy: 0.78, dz: -0.32, w: 0.16, h: 0.34, d: 0.16, tone: "metal" },
    { dx: 0, dy: 0.94, dz: -0.32, w: 0.5, h: 0.06, d: 0.06, tone: "metal" },
  ],
  // 자전거 — 큰 바퀴 둘에 가로대와 손잡이. 옆에서 보면 실루엣이 바로 읽힌다
  1: [
    { dx: 0, dy: 0.32, dz: 0.55, w: 0.05, h: 0.62, d: 0.62, tone: "metal" },
    { dx: 0, dy: 0.32, dz: -0.55, w: 0.05, h: 0.62, d: 0.62, tone: "metal" },
    { dx: 0, dy: 0.6, dz: 0, w: 0.05, h: 0.05, d: 0.86, tone: "frame" },
    { dx: 0, dy: 0.85, dz: 0.5, w: 0.46, h: 0.05, d: 0.05, tone: "metal" },
  ],
};

/**
 * 세워 둔 탈것을 상자로 편다.
 *
 * 색은 인덱스로 받는다 — 여기서 숫자를 적으면 화면 쪽 팔레트가 밀릴 때
 * 자전거가 초록색이 된다.
 */
export function buildStandBoxes(
  stands: readonly VehicleStand[],
  metalTone: number,
  frameTone: number,
  /** 짐승 털색. 금속·뼈대 어느 쪽도 아니어서 따로 받는다 */
  coatTone: number,
): DetailInstance[] {
  const boxes: DetailInstance[] = [];

  for (const stand of stands) {
    const parts = PARKED[stand.cell];
    // 목록에 없는 종류는 조용히 건너뛴다 — 상자 없는 자리가 남는 편이 낫다
    if (!parts) continue;

    const sin = Math.sin(stand.rotationY);
    const cos = Math.cos(stand.rotationY);

    for (const part of parts) {
      boxes.push({
        x: stand.x + part.dx * cos + part.dz * sin,
        /*
         * 바닥 높이. 인도가 있는 도시 구역은 상판 위, 풀밭은 **지형 위**다.
         * 인도 높이를 그대로 쓰면 언덕에 선 조랑말이 땅에 묻히거나 뜬다.
         */
        y:
          (isUrbanBlock(stand.blockIndex)
            ? CITY.sidewalkHeight
            : terrainHeight(stand.x, stand.z)) + part.dy,
        z: stand.z - part.dx * sin + part.dz * cos,
        // 돌린 각도가 90도의 배수라 폭·깊이도 함께 바꿔 준다
        width: Math.abs(cos) > 0.5 ? part.w : part.d,
        height: part.h,
        depth: Math.abs(cos) > 0.5 ? part.d : part.w,
        tone: part.tone === "metal" ? metalTone : part.tone === "coat" ? coatTone : frameTone,
        blockIndex: stand.blockIndex,
        rotationY: stand.rotationY,
      });
    }
  }

  return boxes;
}

/**
 * 지금 자리에서 탈 수 있는 것.
 *
 * 반경 밖이면 null이다. **가장 가까운 것 하나만** 본다 — 킥보드와 자전거가
 * 겹쳐 있을 때 무엇을 탈지 헷갈리면 안 된다.
 */
export function standInReach(
  stands: readonly VehicleStand[],
  x: number,
  z: number,
): VehicleKind | null {
  let bestCell = -1;
  let bestDistance = STAND_REACH * STAND_REACH;

  for (const stand of stands) {
    const dx = stand.x - x;
    const dz = stand.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCell = stand.cell;
    }
  }

  return bestCell < 0 ? null : (VEHICLE_KINDS[bestCell] ?? null);
}
