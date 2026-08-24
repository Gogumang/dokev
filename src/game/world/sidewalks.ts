/**
 * 인도 판 배치.
 *
 * 화면 안(useMemo)에 두었을 때는 **좌표가 틀려도 값으로 잴 데가 없었다** —
 * 정본(`blockCenter`)을 검사로 묶어 두어도 화면 쪽에서 딴 값을 쓰면 통과했다.
 * 이 저장소에서 가장 자주 나온 결함 모양이라 밖으로 뺀다.
 *
 * `cityDetails`에 두려다 그 파일이 800줄 상한을 넘어 따로 뒀다 — 상한이
 * 「이 판은 도시 세부와 다른 책임인가」를 묻게 했고, 답은 그렇다였다.
 */

import { blockCenter, CITY } from "@/game/world/cityLayout";
import type { DetailInstance } from "@/game/world/cityDetails";
import { terrainHeight } from "@/game/world/terrain";
import { isUrbanBlock } from "@/game/world/zones";

/**
 * 인도 판 한 변의 길이(m).
 *
 * 구역보다 조금 크게 잡아 도로와 맞물린다. 이 값이 화면 쪽(`City.tsx`) 안에
 * 있었는데, **바닥에 무엇을 놓든 연석이 어디인지 알아야 한다** — 식을 두 번
 * 쓰면 점자블록이 인도 밖 허공에 뜨고도 아무도 모른다. 정본을 여기 둔다.
 */
export const SIDEWALK_SLAB_SIZE = CITY.blockSize + 4;

/**
 * 구역 중심에서 연석(인도가 끝나고 도로가 시작하는 선)까지의 거리(m).
 *
 * `cityDetails`의 `SIDEWALK_EDGE`와 **다르다** — 그것은 노면 표시가 쓰는
 * 경계이고, 판이 그보다 넓어서 **눈에 보이는 턱**은 여기다.
 */
export const CURB_EDGE = SIDEWALK_SLAB_SIZE / 2;

/**
 * 인도 격자 한 칸의 크기(m).
 *
 * 지면(`GroundSurfaces.GROUND_CELL_METERS`)은 4m인데 여기는 더 잘다. 인도는
 * 사람이 그 위를 걷는 면이라 도로보다 가까이서 보이고, 무엇보다 **연석이
 * 이 격자를 따라간다** — 칸이 크면 연석이 지형에서 뜬다.
 */
const SIDEWALK_CELL_METERS = 2.4;

/**
 * 인도 가장자리를 아래로 늘려 도로에 파묻는 깊이(m).
 *
 * 면 한 장은 종잇장이라 옆에서 보면 사라진다. 도로 쪽 가장자리에 치마를
 * 둘러 두께가 보이게 한다. 지형이 요철이라 넉넉히 잡아 파묻는다.
 */
const SKIRT_DEPTH = 1.2;

/**
 * 그 자리에 사람이 딛는 면의 높이(m).
 *
 * **지형이 아니라 인도 위다.** 도시 구역에는 지면보다 16cm 올라온 판이
 * 깔려 있는데, 플레이어만 그 아래 지형 높이를 딛고 있었다 — 보행자는
 * `crowdLayout.groundY`로 판 위에 서고, 플레이어는 `terrainHeight`를 그대로
 * 썼다. 같은 보도에서 **지나가는 사람보다 16cm 낮게** 걷고, 신발이 포장에
 * 파묻힌다.
 *
 * 연석에서 16cm가 한 번에 바뀐다. 실제 보도가 그렇고, 이동 코드는 지면
 * 높이를 매 프레임 다시 읽으므로 턱을 오르내리는 것으로 보인다.
 */
export function surfaceHeight(x: number, z: number): number {
  const ground = terrainHeight(x, z);
  return onSidewalk(x, z) ? ground + CITY.sidewalkHeight : ground;
}

/** 그 자리가 인도 판 위인가. 판은 도시 구역마다 한 장, 구역보다 조금 크다 */
function onSidewalk(x: number, z: number): boolean {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const offset = (CITY.gridSize - 1) / 2;
  const col = Math.round(x / pitch + offset);
  const row = Math.round(z / pitch + offset);
  if (col < 0 || col >= CITY.gridSize || row < 0 || row >= CITY.gridSize) return false;

  const index = row * CITY.gridSize + col;
  if (!isUrbanBlock(index)) return false;

  const { cx, cz } = blockCenter(index);
  const half = SIDEWALK_SLAB_SIZE / 2;
  return Math.abs(x - cx) <= half && Math.abs(z - cz) <= half;
}

/** 화면이 그대로 쓸 수 있는 면 데이터. three를 모르는 채로 만든다 */
export interface SurfaceMesh {
  positions: number[];
  uvs: number[];
  indices: number[];
}

/**
 * 인도 면 — **지형을 따라간다.**
 *
 * 예전에는 구역마다 38m짜리 상자 하나였다. 상자 하나에는 그 중심의 지형
 * 높이가 **한 번만** 더해지므로(`projectInstances`), 판은 구역 안에서 완전히
 * 평평했다. 그런데 그 아래 지형은 한 구역 안에서 ±2m씩 오르내린다.
 *
 * 결과는 화면에서 바로 보였다: 구역 가장자리에서 인도가 **2.76m 공중에 떠서**
 * 회색 벽처럼 걸리고, 건물들이 그 위에 얹힌 받침대처럼 보였다. 반대쪽
 * 가장자리에서는 땅에 파묻혀 포장이 사라졌다. 플레이어는 지형 위를 걸으므로
 * 뜨는 쪽에서는 **인도 아래를 걸었다.**
 *
 * 상자를 잘게 쪼개는 방법도 있었지만 구역마다 백 개가 넘게 필요하다 —
 * 인스턴스 예산이 감당하지 못한다. 면 하나로 만들면 드로우콜도 하나다.
 *
 * @param size 판 한 변의 길이(m). 구역보다 조금 크게 잡아 도로와 맞물린다.
 * @param tileMeters 포장 무늬가 몇 미터마다 반복되는지. UV를 **월드 좌표로**
 *   깔아야 구역 사이에서 무늬가 이어진다.
 */
export function buildSidewalkSurface(size: number, tileMeters: number): SurfaceMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cells = Math.max(1, Math.round(size / SIDEWALK_CELL_METERS));
  const step = size / cells;
  const top = CITY.sidewalkHeight;

  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    // 숲·공원·해안·옛 마을에는 보도블록을 깔지 않는다 (zones.isUrban 주석)
    if (!isUrbanBlock(index)) continue;
    // 좌표는 정본에서 받는다 — 식을 다시 쓰면 도시와 반 칸 어긋나도 아무도 모른다
    const { cx, cz } = blockCenter(index);
    const base = positions.length / 3;

    for (let row = 0; row <= cells; row += 1) {
      for (let col = 0; col <= cells; col += 1) {
        const x = cx - size / 2 + col * step;
        const z = cz - size / 2 + row * step;
        positions.push(x, terrainHeight(x, z) + top, z);
        uvs.push(x / tileMeters, z / tileMeters);
      }
    }

    for (let row = 0; row < cells; row += 1) {
      for (let col = 0; col < cells; col += 1) {
        const a = base + row * (cells + 1) + col;
        const b = a + 1;
        const c = a + cells + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    pushSkirt(positions, uvs, indices, cx, cz, size, cells, step, tileMeters);
  }

  return { positions, uvs, indices };
}

/** 판 둘레를 따라 아래로 내리는 치마. 종잇장처럼 보이지 않게 두께를 준다 */
function pushSkirt(
  positions: number[],
  uvs: number[],
  indices: number[],
  cx: number,
  cz: number,
  size: number,
  cells: number,
  step: number,
  tileMeters: number,
): void {
  const half = size / 2;
  const top = CITY.sidewalkHeight;

  /** 둘레를 한 바퀴 도는 점들 — 모서리에서 끊기지 않아야 틈이 안 생긴다 */
  const ring: { x: number; z: number }[] = [];
  for (let i = 0; i < cells; i += 1) ring.push({ x: cx - half + i * step, z: cz - half });
  for (let i = 0; i < cells; i += 1) ring.push({ x: cx + half, z: cz - half + i * step });
  for (let i = 0; i < cells; i += 1) ring.push({ x: cx + half - i * step, z: cz + half });
  for (let i = 0; i < cells; i += 1) ring.push({ x: cx - half, z: cz + half - i * step });

  for (let i = 0; i < ring.length; i += 1) {
    const here = ring[i];
    const next = ring[(i + 1) % ring.length];
    const base = positions.length / 3;
    const hereTop = terrainHeight(here.x, here.z) + top;
    const nextTop = terrainHeight(next.x, next.z) + top;

    positions.push(here.x, hereTop, here.z);
    positions.push(next.x, nextTop, next.z);
    positions.push(here.x, hereTop - SKIRT_DEPTH, here.z);
    positions.push(next.x, nextTop - SKIRT_DEPTH, next.z);
    for (const point of [here, next, here, next]) uvs.push(point.x / tileMeters, point.z / tileMeters);

    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
}

/**
 * 연석 높이(m). 인도 판보다 조금 더 올라와 턱이 눈에 보인다.
 *
 * 인도 판과 같은 높이로 두면 색만 다른 띠가 되어 그림자가 지지 않는다 —
 * 참고 사진에서 도로와 인도를 가르는 것은 색이 아니라 **그 턱의 그림자**다.
 */
const CURB_HEIGHT = CITY.sidewalkHeight + 0.09;

/** 연석 띠의 폭(m) */
const CURB_WIDTH = 0.34;

/**
 * 구역 둘레를 두르는 연석.
 *
 * 인도 판은 한 구역에 큰 판 하나라, 도로와 맞닿는 가장자리가 판의 옆면일 뿐
 * 아무 표시가 없었다. 실제 거리에서 **도로를 도로로 만드는 것은 이 선**이다 —
 * 차도의 폭이 여기서 끝난다는 것을 눈이 먼저 읽는다.
 *
 * 구역마다 네 줄이다. 판보다 살짝 밖으로 내밀어 옆면이 도로에서 보이게 한다.
 */
/**
 * 연석 한 도막의 길이(m).
 *
 * 예전에는 한 변이 **도막 하나**(38m)였다. 상자 하나에는 그 중심의 지형
 * 높이가 한 번만 더해지므로, 연석이 인도와 따로 놀며 비탈에서 한쪽 끝이
 * 떠올랐다 — 인도를 면으로 바꿔 지형을 따라가게 만들어 놓고 연석만 평평하면
 * 고친 자리가 오히려 더 눈에 띈다.
 *
 * 인도 격자와 같은 크기로 잡는다. 도막이 늘어도 인스턴스 하나짜리 드로우콜
 * 하나는 그대로다 — 연석은 스트리밍하지 않고 항상 그린다.
 */
const CURB_SEGMENT = SIDEWALK_CELL_METERS;

export function buildCurbs(size: number): DetailInstance[] {
  const half = size / 2;
  const curbs: DetailInstance[] = [];
  const steps = Math.max(1, Math.round(size / CURB_SEGMENT));
  const step = size / steps;

  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    // 연석은 인도의 테두리다. 인도가 없는 구역에 두르면 땅에 회색 액자만 남는다
    if (!isUrbanBlock(index)) continue;
    const { cx, cz } = blockCenter(index);

    for (let i = 0; i < steps; i += 1) {
      const along = -half + step * (i + 0.5);
      for (const side of [-1, 1]) {
        // z 방향으로 뻗는 두 줄 (구역의 좌·우)
        pushCurb(curbs, index, cx + side * half, cz + along, CURB_WIDTH, step);
        // x 방향으로 뻗는 두 줄 (구역의 위·아래)
        pushCurb(curbs, index, cx + along, cz + side * half, step, CURB_WIDTH);
      }
    }
  }

  return curbs;
}

function pushCurb(
  curbs: DetailInstance[],
  blockIndex: number,
  x: number,
  z: number,
  width: number,
  depth: number,
): void {
  curbs.push({
    x,
    y: CURB_HEIGHT / 2,
    z,
    width,
    height: CURB_HEIGHT,
    depth,
    tone: 0,
    blockIndex,
    /*
     * 비탈에서 도막 사이에 틈이 벌어진다 — 이웃한 두 도막이 서로 다른 지형
     * 높이를 받기 때문이다. 아래로 늘려 파묻으면 그 틈이 땅에 가려진다.
     */
    sink: 0.6,
  });
}