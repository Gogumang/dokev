/**
 * 인도와 갓길에 까는 것들 — 점자블록과 배수구.
 *
 * 도시를 「실제 한국처럼」 보이게 하는 것은 건물의 실루엣이 아니다. 한국 거리
 * 사진에서 건물은 대부분 밋밋한 직육면체이고, 한국처럼 보이게 하는 것은 그
 * 위와 발밑에 붙은 것들이다. **노란 점자블록**은 그중에서도 다른 나라 거리와
 * 가장 확실하게 갈리는 표시다.
 *
 * `cityDetails.ts`가 800줄 상한에 닿아 따로 뒀다. 상한이 「이것이 도시 세부와
 * 다른 책임인가」를 묻게 했고, 답은 그렇다였다 — 여기 있는 것은 전부 **바닥에
 * 평평하게 눕는 것**이고, 건물에서 파생되지 않고 구역 좌표에서만 나온다.
 *
 * 색 인덱스(tone)는 받아서 쓴다. 여기서 숫자를 직접 적으면 `cityDetails`의
 * `ROAD_MARK_TONE`과 조용히 어긋난다 — 팔레트가 밀리면 점자블록이 흰색이 된다.
 */

import { createSeededRandom } from "@/game/core/mathx";
import { blockCenter, CITY } from "@/game/world/cityLayout";
import { CURB_EDGE } from "@/game/world/sidewalks";

import type { DetailInstance } from "@/game/world/cityDetails";
import { isUrbanBlock } from "@/game/world/zones";

/** 바닥에 눕는 판의 두께(m). 깔린 면 위로 이만큼 솟는다 */
const PLATE_THICKNESS = 0.04;

/**
 * 점자블록이 연석에서 안쪽으로 들어온 거리(m).
 *
 * 실제 보도에서는 연석에서 한 걸음쯤 떨어져 깔린다. 연석에 딱 붙이면 차도로
 * 안내하는 꼴이고, 너무 안쪽이면 건물 벽에 먹힌다.
 */
const GUIDEWAY_INSET = 0.9;

/** 점자블록 띠의 폭(m). 실제 규격(30cm 블록) 두 줄에 해당한다 */
const GUIDEWAY_WIDTH = 0.6;

/**
 * 배수구(빗물받이)가 연석 **바깥**으로 나간 거리(m).
 *
 * 갓길 물길에 놓인다 — 인도 위에 올려 두면 사람이 밟고 다니는 자리가 된다.
 */
const DRAIN_OUTSET = 0.5;

const DRAIN_LENGTH = 0.9;
const DRAIN_WIDTH = 0.42;

/**
 * 한 변에 놓는 빗물받이 수.
 *
 * 실제 간격(10m 남짓)이라면 변마다 서넛이지만 하나로 줄였다 — 바닥 평판은
 * 화면 인스턴스 예산에서 가장 비싼 축이 아닌데도 **개수로는 가장 빨리 는다**
 * (구역이 36개라 하나 늘릴 때마다 36개가 는다). 눈에 띄는 것은 「있다」이지
 * 「몇 개」가 아니다.
 */
const DRAINS_PER_SIDE = 1;

/** 구역 하나 곁 도로에 놓는 맨홀 뚜껑 수 */
const COVERS_PER_BLOCK = 2;

/** 맨홀 뚜껑 한 변(m) */
const COVER_SIZE = 0.8;

const GROUND_SEED = 40317;

/** 네 변의 바깥 방향. 0=북(+Z), 시계 방향 */
const SIDES = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;

/**
 * 구역 둘레를 도는 닫힌 테두리 네 조각.
 *
 * 남북 두 줄은 끝까지 뻗고, 동서 두 줄은 **그 폭만큼 짧게** 끊는다. 넷 다
 * 끝까지 뻗으면 모서리에서 두 띠가 같은 높이로 겹쳐 z-fighting이 생긴다 —
 * 걸을 때 노란 네모가 깜빡인다. 짧게 끊는 쪽을 두어야 모서리가 정확히 한
 * 번만 덮인다.
 */
function ringPieces(
  radius: number,
  width: number,
): { dx: number; dz: number; w: number; d: number }[] {
  const full = radius * 2;
  /*
   * 가로 줄의 **안쪽 모서리**까지만 뻗는다. 폭을 양쪽에서 한 번씩 두 번 빼면
   * 모서리마다 반 폭씩 벌어져 길잡이가 네 토막으로 끊긴다 — 실제로 그렇게
   * 썼다가 검사에 걸렸다.
   */
  const short = full - width;

  return [
    { dx: 0, dz: radius, w: full, d: width },
    { dx: 0, dz: -radius, w: full, d: width },
    { dx: radius, dz: 0, w: width, d: short },
    { dx: -radius, dz: 0, w: width, d: short },
  ];
}

/**
 * 그 자리가 차도인가.
 *
 * **구역 색이 도로까지 칠하고 있었다.** 지면은 `zoneAt`으로만 갈랐는데 그
 * 함수는 도로 좌표를 가장 가까운 구역으로 접는다 — 그래서 옛 마을 옆 도로는
 * 흙, 숲 옆 도로는 잔디가 되었다. 화면에서는 **도로가 아예 없었다**: 차선만
 * 흙바닥 위에 떠 있고 아스팔트가 한 뼘도 안 보였다.
 *
 * 도로는 구역의 성격이 아니라 **도시가 깐 것**이다. 인도·연석과 같은 이유로
 * 따로 칠한다.
 *
 * 다만 자연 구역 사이의 도로까지 아스팔트로 칠하지는 않는다 — 숲을 가로지르는
 * 아스팔트 띠는 이 저장소가 `isUrban`으로 이미 한 번 걷어낸 모양이다
 * (가로등·연석·차선). 맞닿은 구역 중 **하나라도 도시면** 도시가 깐 길로 본다.
 */
export function isRoadSurface(x: number, z: number): boolean {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const offset = (CITY.gridSize - 1) / 2;
  const col = x / pitch + offset;
  const row = z / pitch + offset;
  const half = CITY.blockSize / 2;

  const insideX = Math.abs(col - Math.round(col)) * pitch <= half;
  const insideZ = Math.abs(row - Math.round(row)) * pitch <= half;
  if (insideX && insideZ) return false;

  const clamp = (value: number) => Math.max(0, Math.min(CITY.gridSize - 1, value));
  for (const c of [clamp(Math.floor(col)), clamp(Math.ceil(col))]) {
    for (const r of [clamp(Math.floor(row)), clamp(Math.ceil(row))]) {
      if (isUrbanBlock(r * CITY.gridSize + c)) return true;
    }
  }
  return false;
}

/**
 * 노란 점자블록.
 *
 * 구역마다 둘레를 한 바퀴 돈다. 모서리에서 끊기지 않고 이어지는 것이 중요한데,
 * 실제 보도에서도 그것이 **연속된 길잡이**라서 뜻이 있는 것이다.
 *
 * @param tone `ROAD_MARK_TONE.yellow`
 */
/**
 * 점자블록 한 도막의 길이(m).
 *
 * 예전에는 한 변이 도막 하나(38m)였다. 상자 하나에는 그 중심의 지형 높이가
 * **한 번만** 더해지므로, 인도를 지형을 따라가는 면으로 바꾸자 노란 띠만
 * 평평하게 남아 비탈에서 인도를 뚫고 나오거나 허공에 떴다. 잘게 쪼개면
 * 도막마다 자기 자리의 지형을 받는다.
 */
const GUIDEWAY_SEGMENT = 2.4;

export function buildTactileGuideways(tone: number): DetailInstance[] {
  const radius = CURB_EDGE - GUIDEWAY_INSET;
  const y = CITY.sidewalkHeight + PLATE_THICKNESS / 2;

  const plates: DetailInstance[] = [];
  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    // 점자블록은 인도 위에 깔린다. 인도가 없는 구역에 깔면 풀밭에 노란 띠가 뜬다
    if (!isUrbanBlock(index)) continue;
    const { cx, cz } = blockCenter(index);
    for (const piece of ringPieces(radius, GUIDEWAY_WIDTH)) {
      // 긴 쪽을 따라 쪼갠다 — 짧은 쪽(띠의 폭)은 그대로 둔다
      const alongX = piece.w > piece.d;
      const length = alongX ? piece.w : piece.d;
      const steps = Math.max(1, Math.round(length / GUIDEWAY_SEGMENT));
      const step = length / steps;

      for (let i = 0; i < steps; i += 1) {
        const along = -length / 2 + step * (i + 0.5);
        plates.push({
          x: cx + piece.dx + (alongX ? along : 0),
          y,
          z: cz + piece.dz + (alongX ? 0 : along),
          width: alongX ? step : piece.w,
          height: PLATE_THICKNESS,
          depth: alongX ? piece.d : step,
          tone,
          blockIndex: index,
        });
      }
    }
  }
  return plates;
}

/**
 * 빗물받이와 맨홀 뚜껑.
 *
 * 둘 다 도로 높이(0)에 눕는다 — 인도는 턱이 있어 그 위에 놓으면 떠 보인다.
 * 빗물받이는 연석을 따라 규칙적으로, 맨홀은 차도 안쪽에 흩어 놓는다. 규칙적인
 * 것과 흩어진 것이 **같이 있어야** 바닥이 사람 손으로 놓인 것처럼 보인다.
 *
 * @param tone `ROAD_MARK_TONE.darkMetal`
 */
export function buildDrainCovers(tone: number): DetailInstance[] {
  const random = createSeededRandom(GROUND_SEED);
  const radius = CURB_EDGE + DRAIN_OUTSET;
  const y = PLATE_THICKNESS / 2;

  const plates: DetailInstance[] = [];
  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    /*
     * 빗물받이는 **연석을 따라** 놓인다. 자연 구역에는 연석이 없으므로 그대로
     * 두면 기준선 없는 쇠판만 풀밭에 흩어진다 — 숲 한복판의 맨홀 뚜껑이
     * 구역을 나눈 뒤에도 남아 있던 가장 큰 위화감이었다.
     */
    if (!isUrbanBlock(index)) continue;
    const { cx, cz } = blockCenter(index);

    for (const angle of SIDES) {
      const nx = Math.round(Math.sin(angle));
      const nz = Math.round(Math.cos(angle));
      // 변을 따라 흐르는 방향은 바깥 방향을 90도 돌린 것이다
      const ax = nz;
      const az = -nx;

      for (let i = 0; i < DRAINS_PER_SIDE; i += 1) {
        // 변 안쪽에 고르게 — 모서리에 붙으면 교차로 한복판에 놓인다
        const t = ((i + 1) / (DRAINS_PER_SIDE + 1) - 0.5) * radius * 1.4;
        plates.push({
          x: cx + nx * radius + ax * t,
          y,
          z: cz + nz * radius + az * t,
          width: ax !== 0 ? DRAIN_LENGTH : DRAIN_WIDTH,
          height: PLATE_THICKNESS,
          depth: ax !== 0 ? DRAIN_WIDTH : DRAIN_LENGTH,
          tone,
          blockIndex: index,
        });
      }
    }

    for (let i = 0; i < COVERS_PER_BLOCK; i += 1) {
      /*
       * 차도 위 — 연석 바깥에서 도로 한가운데까지. 반대편 구역까지 넘어가면
       * 그 구역이 안 보일 때 뚜껑만 남아 공중에 뜬 것처럼 보인다.
       */
      const reach = CURB_EDGE + 1.2 + random() * (CITY.roadWidth / 2 - 2);
      const side = random() < 0.5 ? 1 : -1;
      const along = (random() - 0.5) * CITY.blockSize * 0.8;
      const vertical = random() < 0.5;

      plates.push({
        x: cx + (vertical ? side * reach : along),
        y,
        z: cz + (vertical ? along : side * reach),
        width: COVER_SIZE,
        height: PLATE_THICKNESS,
        depth: COVER_SIZE,
        tone,
        blockIndex: index,
      });
    }
  }
  return plates;
}

/* ------------------------------------------------------------------ *
 * 차로 색칠
 *
 * 한국 도로를 다른 나라 도로와 가장 빠르게 갈라놓는 것은 차선의 **모양**이
 * 아니라 **색**이다. 갓길에 깔린 붉은 자전거도로와 파란 버스전용차로는
 * 위성사진에서도 한국이 보이게 한다.
 * ------------------------------------------------------------------ */

/** 도로 중심선에서 자전거도로 한가운데까지(m). 연석 바로 안쪽이다 */
/**
 * 도로 중심에서 갓길선까지(m).
 *
 * 연석(도로 폭의 절반)보다 한 뼘 안쪽이다. 연석에 딱 붙이면 인도 판과 겹쳐
 * z-파이팅이 나고, 너무 안쪽이면 차선처럼 보인다.
 */
const EDGE_LINE_OFFSET = CITY.roadWidth / 2 - 0.9;
/** 갓길선 굵기(m). 차선 점선보다 굵어야 「가장자리」로 읽힌다 */
const EDGE_LINE_WIDTH = 0.22;


/** 도로 중심선에서 버스전용차로 경계선까지(m). 중앙 황색 복선 바로 바깥이다 */

/**
 * 갓길선 한 토막의 길이(m).
 *
 * 18m였다. 「이어진 띠라 짧게 끊을 이유가 없다」고 적어 두었는데, **지형이
 * 있는 한 이유가 있다** — 상자 하나에는 그 중심의 지형 높이가 한 번만
 * 더해지므로, 18m짜리 띠는 비탈에서 한쪽 끝이 1m 가까이 떠오른다. 화면에서
 * 실제로 **노란 선이 허공에 걸려 있었다.**
 *
 * 4.5m면 이 지형(마루 88m)에서 양 끝 오차가 5cm 아래다. 인스턴스는 네 배가
 * 되지만 갓길선은 스트리밍하지 않는 한 묶음이라 드로우콜은 그대로다.
 */
const LANE_SEGMENT = 4.5;

/** 도로 축(중심선) 좌표들 */
function roadAxes(halfExtent: number): number[] {
  const offset = (CITY.gridSize - 1) / 2;
  const fromBlock = CITY.blockSize / 2 + CITY.roadWidth / 2;
  const axes: number[] = [];
  for (let g = 0; g < CITY.gridSize; g += 1) {
    const axis = (g - offset) * (CITY.blockSize + CITY.roadWidth) + fromBlock;
    if (Math.abs(axis) <= halfExtent) axes.push(axis);
  }
  return axes;
}

/** 교차로 안쪽인지. 가로질러 칠하면 좌회전 차선이 막힌 것처럼 보인다 */
function insideIntersection(position: number, axes: readonly number[]): boolean {
  const half = CITY.roadWidth / 2 + 1.2;
  return axes.some((axis) => Math.abs(position - axis) < half);
}

/**
 * 그 자리에서 가장 가까운 구역 번호.
 *
 * **이것이 있어야 차로 색칠을 스트리밍할 수 있다.** 기존 노면 표시는 구역
 * 번호가 없어 도시 전체를 늘 그리는데, 여기 것은 양이 많아 그렇게 두면
 * 항상 그리는 수가 상한을 넘는다.
 */
function nearestBlock(x: number, z: number): number {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const offset = (CITY.gridSize - 1) / 2;
  const cell = (value: number) =>
    Math.min(CITY.gridSize - 1, Math.max(0, Math.round(value / pitch + offset)));
  return cell(z) * CITY.gridSize + cell(x);
}

/**
 * 갓길 백색 실선.
 *
 * 오래 **자전거도로(빨강)와 버스전용차로(파랑)**를 도로 전체에 칠했다. 서울
 * 도심에 실제로 있는 것이라 근거는 있었지만, 화면에서는 아스팔트가 아니라
 * **색칠한 도면**으로 보였다 — 도로가 현실성 없다는 지적의 큰 몫이 이것이었다.
 * 참고하는 트레일러의 도로도 민 아스팔트에 황색 중앙선과 흰 선뿐이다.
 *
 * 대신 갓길선을 긋는다. 연석 안쪽으로 한 뼘 들어온 흰 실선 하나가 도로의 폭을
 * 규정하고, 차선(점선)·중앙선(황색 복선)과 함께 「차도」로 읽히게 한다.
 *
 * @param whiteTone `ROAD_MARK_TONE.white`
 */
export function buildRoadLanes(halfExtent: number, whiteTone: number): DetailInstance[] {
  const axes = roadAxes(halfExtent);
  const y = PLATE_THICKNESS / 2;
  const lanes: DetailInstance[] = [];

  const push = (x: number, z: number, alongX: boolean) => {
    /*
     * 자연 구역 위에는 긋지 않는다.
     *
     * 차선은 발광하지 않지만 **조명을 받지 않게(unlit) 그리므로** 어떤 빛
     * 아래서도 흰색 그대로다. 잔디밭 위에 그으면 풀밭을 가로지르는 형광 띠가
     * 되어, 숲에서 가장 먼저 눈에 띄는 도시 흔적이 된다.
     */
    if (!isUrbanBlock(nearestBlock(x, z))) return;

    lanes.push({
      x,
      y,
      z,
      width: alongX ? LANE_SEGMENT : EDGE_LINE_WIDTH,
      height: PLATE_THICKNESS,
      depth: alongX ? EDGE_LINE_WIDTH : LANE_SEGMENT,
      tone: whiteTone,
      blockIndex: nearestBlock(x, z),
    });
  };

  for (const axis of axes) {
    for (let t = -halfExtent; t < halfExtent; t += LANE_SEGMENT) {
      const center = t + LANE_SEGMENT / 2;
      if (insideIntersection(center, axes)) continue;

      for (const side of [1, -1]) {
        const offset = axis + side * EDGE_LINE_OFFSET;
        /*
         * 월드 밖으로 나가는 선은 긋지 않는다.
         *
         * 가장 바깥 도로는 축이 이미 경계 가까이에 있어, 갓길선을 반 폭
         * 밖으로 밀면 지면 밖 허공에 뜬다. 예전 자전거도로는 축에서 4m라
         * 우연히 안쪽이었을 뿐이다.
         */
        if (Math.abs(offset) > halfExtent) continue;

        // 세로 도로 — 축이 x, 선이 z를 따라 흐른다
        push(offset, center, false);
        // 가로 도로 — 축이 z, 선이 x를 따라 흐른다
        push(center, offset, true);
      }
    }
  }

  return lanes;
}
