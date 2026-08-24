/**
 * 언덕 주택가 — 골목 계단과 난간.
 *
 * 여덟 구역 가운데 이 동네만 전용 작업을 한 번도 받지 못했다. 이름은 「언덕
 * 주택가」, 부제는 「좁은 골목과 옥상 물탱크」인데, 실제로 다른 것은 층수와
 * 필지 수뿐이었다 — 화면에서는 **번화가를 낮게 줄인 것**으로 보인다.
 * 옥상 물탱크는 이미 도시 전체에 올라가 있으니(`cityDetails`), 비어 있는 쪽은
 * 「좁은 골목」이다.
 *
 * 지형은 손대지 않는다. `terrain.ts`가 지면의 정본이고 배치·충돌·렌더가 전부
 * 거기에 매여 있어서, 여기서 땅을 계단처럼 깎으면 그 세 가지가 갈라진다.
 * 대신 **비탈을 읽어 계단으로 그린다**: 골목 바닥을 20cm 단위로 끊어 놓으면
 * 완만한 비탈이 「참 몇 미터 + 한 단」의 계단길이 된다. 실제 달동네 계단길이
 * 그 모양이다 — 층계참이 길고 단이 드문드문 있다.
 *
 * `cityLayout`을 **값으로** import하지 않는다. 그쪽이 이 파일을 부르므로 순환이
 * 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 이미 겪었다
 * (`zones.ts` 주석). 치수는 인자로 받고 타입만 가져온다.
 */

import type { BoxInstance } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

/** 계단을 놓을 구역 하나. `cityLayout`이 좌표와 그 구역 집을 계산해 넘긴다 */
export interface HillsideBlock {
  blockIndex: number;
  cx: number;
  cz: number;
  /**
   * 그 구역의 집.
   *
   * 골목이 **어디인지를 집이 정한다.** 필지 수를 여기서 다시 계산하면
   * `cityLayout`의 공터 규칙(`gapChance`)과 어긋나서, 집이 없는 자리에
   * 골목이 생기고 집이 있는 자리를 계단이 뚫는다.
   */
  buildings: readonly BoxInstance[];
}

export interface HillsideParts {
  /** 골목 바닥 디딤판 — 20cm 단위로 끊긴다 */
  steps: BoxInstance[];
  /** 난간 기둥과 가로대 */
  rails: BoxInstance[];
}

/** 팔레트 인덱스 — 렌더의 `HILLSIDE_PALETTE`와 순서를 맞춘다 */
const TONE = { stone: 0, stoneDark: 1, rail: 2 } as const;

const STAIR = {
  /**
   * 한 단의 높이(m).
   *
   * 처음에 20cm로 두었다가 화면에서 **한 단도 안 보였다.** 폭 1.8m짜리
   * 골목을 어깨 너머 카메라로 내려다보면 20cm는 포장 이음매와 구분되지
   * 않는다. 실제 계단(15~18cm)에 가깝다는 것은 여기서 아무 의미가 없었다 —
   * 보이지 않으면 없는 것이다.
   *
   * 30cm면 단 하나가 사람 정강이 높이라 옆면이 그림자를 만든다. 그 대신
   * 단 수가 줄어드는데(`maxRise`를 30cm로 나눈 만큼), 「낮은 단 여럿」보다
   * 「뚜렷한 단 둘」이 계단으로 읽힌다.
   */
  riser: 0.3,
  /** 디딤판 하나의 길이(m). 짧을수록 비탈을 곱게 따라가지만 인스턴스가 늘어난다 */
  tread: 2.0,
  /** 디딤판 두께(m). 단 높이보다 두꺼워야 단이 진 자리에 옆면이 보인다 */
  slab: 0.34,
  /**
   * 아래로 늘리는 깊이(m).
   *
   * 디딤판은 인도 상판 **위에** 앉는데, 위로 올라간 단은 그만큼 판에서
   * 떠오른다. 최대 상승분(`maxRise`)보다 깊게 늘려야 어느 단이든 아래가
   * 판에 닿아 **한 덩어리로 쌓인 계단**으로 보인다. 얕으면 위쪽 단이
   * 공중에 뜬 널빤지가 된다.
   */
  sink: 1.4,
  /** 집 벽에서 디딤판까지 띄우는 거리(m) */
  margin: 0.14,
  /**
   * 골목으로 칠 최소 폭(m).
   *
   * 이보다 좁으면 사람이 못 지나가는 틈이라 골목이 아니다. 플레이어 지름
   * (0.84m)에 여유를 얹은 값이다.
   */
  minWidth: 1.0,
  /** 계단이 구역 가장자리에서 멈추는 거리(m). 인도까지 나가면 도로를 침범한다 */
  edgeInset: 1.0,
  /**
   * 가장 낮은 디딤판을 인도 상판보다 얼마나 띄울지(m).
   *
   * 0으로 두면 판과 같은 높이라 이음매에서 z-파이팅이 난다. 8cm면 판 위에
   * 얹힌 것이 보이면서 발에 걸리는 느낌은 안 준다.
   */
  baseLift: 0.08,
  /**
   * 골목이 올라갈 수 있는 최대 높이(m).
   *
   * **여기에 이 기능의 가장 아픈 제약이 있다.** 디딤판에는 충돌체를 주지
   * 않는다(`cityLayout.alleySteps` 주석) — 주면 `resolveHorizontalCollisions`가
   * 단을 벽으로 읽어 폭 1.8m짜리 골목이 통째로 막힌다. 충돌체가 없으니
   * 플레이어는 계단을 **뚫고** 걷는다. 그 어긋남이 눈에 띄지 않을 만큼만
   * 올린다 — 0.6m면 세 단이고, 걸어 들어가도 무릎 아래다.
   *
   * 지형 낙차(구역당 1.1~3.8m)를 그대로 쓰면 골목 한쪽 끝이 2m 넘게 떠서,
   * 도로에서 보면 골목 어귀에 축대가 서 있는 것으로 보인다. 그런데 축대를
   * 받쳐 줄 것이 없다 — 구역 안 지면은 평평한 판 한 장이다.
   */
  maxRise: 0.6,
} as const;

const RAIL = {
  /** 기둥 굵기(m). 가늘면 멀리서 사라진다 — 8cm짜리 첫 판은 바닥 선으로 보였다 */
  post: 0.14,
  /** 가로대 굵기(m) */
  bar: 0.12,
  /** 디딤판 위로 올라오는 높이(m). 한국 골목 난간이 대략 이 높이다 */
  height: 0.92,
  /**
   * 집 벽에서 난간 중심까지(m).
   *
   * **플레이어 반지름(0.42m)보다 가깝게 붙인다.** 그러면 난간은 집 충돌체가
   * 이미 막아 둔 띠 안에 서므로 충돌체를 주지 않아도 통과되지 않는다.
   * 좁은 골목에 충돌체를 하나 더 놓으면 지나갈 수 없게 되기 십상이다 —
   * 여기 골목은 벽 사이가 1.8m 남짓이라 여유가 1m가 안 된다.
   */
  wallGap: 0.22,
  /** 기둥을 몇 디딤판마다 세울지. 매 판마다 세우면 난간이 아니라 울타리가 된다 */
  postEvery: 2,
} as const;

/**
 * 달리는 축. 골목이 x로 뻗는지 z로 뻗는지에 따라 폭·깊이가 뒤바뀐다.
 *
 * 두 축을 각각 쓰면 같은 코드가 두 벌이 되고, 한쪽만 고치는 사고가 난다.
 */
interface RunAxis {
  /** 골목을 따라가는 좌표 */
  along: (item: { x: number; z: number }) => number;
  /** 골목을 가로지르는 좌표 */
  cross: (item: { x: number; z: number }) => number;
  /** 골목을 따라가는 방향의 크기 */
  alongSpan: (item: BoxInstance) => number;
  /** 골목을 가로지르는 방향의 크기 */
  crossSpan: (item: BoxInstance) => number;
  point: (along: number, cross: number) => { x: number; z: number };
  /** 골목을 따라 뻗는 상자의 (width, depth) */
  size: (alongSize: number, crossSize: number) => { width: number; depth: number };
}

const ALONG_X: RunAxis = {
  along: (item) => item.x,
  cross: (item) => item.z,
  alongSpan: (item) => item.width,
  crossSpan: (item) => item.depth,
  point: (along, cross) => ({ x: along, z: cross }),
  size: (alongSize, crossSize) => ({ width: alongSize, depth: crossSize }),
};

const ALONG_Z: RunAxis = {
  along: (item) => item.z,
  cross: (item) => item.x,
  alongSpan: (item) => item.depth,
  crossSpan: (item) => item.width,
  point: (along, cross) => ({ x: cross, z: along }),
  size: (alongSize, crossSize) => ({ width: crossSize, depth: alongSize }),
};

/**
 * 그 자리의 비탈을 단 높이로 끊은 값(m). **아직 절대 높이가 아니다.**
 *
 * 이름을 `stepLevel`로 지었다가 `resourceRelease` 검사에 걸렸다 — 그 검사는
 * `step*(` 모양을 **시간을 적분하는 시뮬레이션**으로 읽고 프레임 상한을
 * 쓰는지 본다. 순수 계산 함수가 그 이름을 가져가면 안 된다.
 *
 * 지형을 그대로 쓰지 않고 **골목 단위로 다시 기준을 잡는다**(`rebase`).
 * 도시 구역에는 평평한 인도 상판이 한 장 깔려 있어서(`sidewalks.ts`),
 * 구역 안에서 보이는 바닥은 지형이 아니라 그 판이다. 지형에 맞춰 놓았더니
 * 계단이 판 아래로 통째로 묻혀 **화면에 한 장도 안 나왔다.** 검사는 전부
 * 통과하고 있었다 — 지형을 기준으로 쟀기 때문이다.
 */
function terrainStep(x: number, z: number): number {
  return Math.round(terrainHeight(x, z) / STAIR.riser) * STAIR.riser;
}

/**
 * 골목 하나의 단 높이를 **인도 상판 위로** 옮긴다.
 *
 * 가장 낮은 단이 판에 앉고, 나머지는 거기서 비탈만큼 올라간다. 올라가는
 * 양은 `maxRise`에서 잘린다 — 잘린 위쪽은 층계참이 되어, 실제 계단길이
 * 그렇듯 「몇 단 오르고 평평해지는」 모양이 된다.
 */
function rebase(raw: number, lowest: number, sidewalkTop: number): number {
  const rise = Math.min(raw - lowest, STAIR.maxRise);
  return sidewalkTop + STAIR.baseLift + rise;
}

/**
 * 배치 데이터의 y — 「구역 판 기준 높이」를 「평지 기준 y」로 바꾼다.
 *
 * **인도 상판은 구역마다 상자 하나라 평평하다.** 상자 하나에는 지형 높이가
 * 한 번만 더해지므로(`projectInstances`), 판 윗면은 구역 안 어디서나
 * `지형(구역중심) + sidewalkTop`이다. 반면 디딤판은 상자가 여럿이라 각자
 * **자기 자리의** 지형을 받는다 — 그대로 두면 판은 평평한데 계단만 비탈을
 * 타서, 한쪽 끝이 판을 뚫고 들어간다.
 *
 * 그래서 자리마다 지형 차이를 빼 준다. 결과적으로 계단도 판처럼 평평한
 * 바닥 위에 앉는다.
 */
function flatY(level: number, blockGround: number, x: number, z: number): number {
  return blockGround + level - terrainHeight(x, z);
}

/**
 * 골목 후보 — 이웃한 집 줄 사이의 한가운데.
 *
 * 필지 수를 계산하지 않고 **놓인 집에서 되짚는다.** 공터가 생기면 줄이
 * 사라지는데, 필지 수로 계산하면 없는 줄 사이에 골목을 놓게 된다.
 */
function alleyLines(coords: readonly number[]): number[] {
  const unique = [...new Set(coords.map((value) => Math.round(value * 100) / 100))].sort(
    (a, b) => a - b,
  );
  const lines: number[] = [];
  for (let i = 1; i < unique.length; i += 1) lines.push((unique[i - 1] + unique[i]) / 2);
  return lines;
}

/** 그 자리의 골목 — 빈 폭과, 난간을 붙일 벽 */
interface Gap {
  /** 실제로 빈 자리의 한가운데 */
  center: number;
  /** 빈 폭(m) */
  width: number;
  /**
   * 난간을 붙일 벽의 안쪽 면. 붙일 데가 없으면 null.
   *
   * **디딤판 전체를 덮는 집만** 벽으로 친다. 모서리만 스치는 집을 벽으로
   * 쓰면 난간이 집이 끝난 자리까지 이어져 **허공에 뜬 철봉**이 된다 —
   * 그 자리는 플레이어가 걸어 들어갈 수 있어서 난간을 통과한다.
   * 검사가 이걸 잡았다(`hillside.test.ts` 「집이 이미 막아 둔 띠 안에 선다」).
   */
  wall: number | null;
}

/** 그 자리에서 집과 집 사이가 얼마나 비어 있는가. 한쪽이라도 집이 없으면 null */
function gapAt(
  buildings: readonly BoxInstance[],
  axis: RunAxis,
  along: number,
  line: number,
): Gap | null {
  let below = -Infinity;
  let above = Infinity;
  /** 디딤판을 통째로 덮는 집 중 가장 안쪽 면 */
  let covering = -Infinity;

  for (const house of buildings) {
    const distance = Math.abs(axis.along(house) - along);
    const reach = axis.alongSpan(house) / 2;
    // 디딤판이 지나가는 구간에 걸치는 집만 본다
    if (distance > reach + STAIR.tread / 2) continue;

    const center = axis.cross(house);
    const half = axis.crossSpan(house) / 2;
    if (center >= line) {
      above = Math.min(above, center - half);
      continue;
    }

    below = Math.max(below, center + half);
    if (distance + STAIR.tread / 2 <= reach) covering = Math.max(covering, center + half);
  }

  /*
   * **양쪽에 집이 있어야 골목이다.** 한쪽이 비면 그건 골목이 아니라 마당이고,
   * 거기 난간을 세우면 허허벌판에 철봉이 선다. 구역 끝(도로에 면한 자리)이
   * 자연스럽게 걸러지는 것도 이 조건 덕이다.
   */
  if (!Number.isFinite(below) || !Number.isFinite(above)) return null;

  const width = above - below - STAIR.margin * 2;
  if (width < STAIR.minWidth) return null;

  return {
    // 이름뿐인 한가운데가 아니라 **실제로 빈 자리**의 한가운데에 놓는다
    center: (below + above) / 2,
    width,
    /*
     * 덮는 집이 가장 안쪽 집이기도 해야 한다. 그렇지 않으면 그 사이에 더
     * 가까운 집이 모서리를 들이밀고 있다는 뜻이라, 거기 난간을 세우면
     * 그 집을 파고든다.
     */
    wall: covering >= below - 1e-6 ? below : null,
  };
}

/**
 * 언덕 주택가 구역에 골목 계단과 난간을 놓는다.
 *
 * 골목이 뻗는 방향은 **비탈이 정한다** — 구역을 가로지르는 두 방향 중 더
 * 많이 떨어지는 쪽으로 놓아야 계단이 계단으로 보인다. 반대로 놓으면 등고선을
 * 따라가는 평평한 길이 되어 단이 한 개도 안 생긴다.
 */
export function buildHillside(
  blocks: readonly HillsideBlock[],
  blockSize: number,
  /**
   * 인도 상판 윗면이 지면에서 얼마나 올라와 있는지(m).
   *
   * `CITY.sidewalkHeight`가 정본이다. 여기서 다시 적지 않고 받는다 —
   * `cityLayout`을 값으로 가져오면 순환이 된다(파일 머리 주석).
   */
  sidewalkTop: number,
): HillsideParts {
  const steps: BoxInstance[] = [];
  const rails: BoxInstance[] = [];
  const reach = blockSize / 2 - STAIR.edgeInset;

  for (const block of blocks) {
    const fallX = Math.abs(
      terrainHeight(block.cx + reach, block.cz) - terrainHeight(block.cx - reach, block.cz),
    );
    const fallZ = Math.abs(
      terrainHeight(block.cx, block.cz + reach) - terrainHeight(block.cx, block.cz - reach),
    );
    const axis = fallX >= fallZ ? ALONG_X : ALONG_Z;
    /*
     * 구역 중심을 **축의 눈으로** 읽는다. `axis.point(cx, cz)`로 만들면
     * z축 골목에서 x와 z가 뒤바뀐 자리가 나온다 — 실제로 그렇게 짰다가
     * 세 구역에만 계단이 깔렸다. 나머지 둘은 구역 밖을 훑고 있었다.
     */
    const alongCenter = axis.along({ x: block.cx, z: block.cz });

    for (const line of alleyLines(block.buildings.map(axis.cross))) {
      pushAlley(steps, rails, block, axis, alongCenter, line, reach, sidewalkTop);
    }
  }

  return { steps, rails };
}

/** 디딤판 한 장이 놓일 자리 */
interface Tread {
  along: number;
  at: { x: number; z: number };
  level: number;
  /** 그 골목의 가장 낮은 단에서 몇 미터 올라왔는가. 색을 단마다 가르는 데 쓴다 */
  rise: number;
  gap: Gap;
}

function pushAlley(
  steps: BoxInstance[],
  rails: BoxInstance[],
  block: HillsideBlock,
  axis: RunAxis,
  alongCenter: number,
  line: number,
  reach: number,
  sidewalkTop: number,
): void {
  const treads: Tread[] = [];
  const blockGround = terrainHeight(block.cx, block.cz);

  for (let offset = -reach + STAIR.tread / 2; offset < reach; offset += STAIR.tread) {
    const along = alongCenter + offset;
    const gap = gapAt(block.buildings, axis, along, line);
    if (!gap) continue;

    const at = axis.point(along, gap.center);
    treads.push({ along, at, level: terrainStep(at.x, at.z), rise: 0, gap });
  }

  /*
   * 이 골목에서 가장 낮은 단을 판에 앉힌다. 구역 전체가 아니라 **골목마다**
   * 따로 잡는다 — 구역 기준으로 잡으면 낮은 쪽 골목이 통째로 판에 묻힌다.
   */
  if (!treads.length) return;
  const lowest = Math.min(...treads.map((tread) => tread.level));
  for (const tread of treads) {
    tread.rise = Math.min(tread.level - lowest, STAIR.maxRise);
    tread.level = rebase(tread.level, lowest, sidewalkTop);
  }

  for (const tread of treads) {
    steps.push({
      x: tread.at.x,
      // 윗면이 정확히 그 단 높이에 오도록 뒤집어 푼다 (윗면 = y + 지형 + height/2)
      y: flatY(tread.level, blockGround, tread.at.x, tread.at.z) - STAIR.slab / 2,
      z: tread.at.z,
      ...axis.size(STAIR.tread, tread.gap.width),
      height: STAIR.slab,
      /*
       * 색을 **단마다** 번갈아 준다.
       *
       * 처음에는 두 돌색을 무작위로 섞었다. 그랬더니 같은 단 안에서 색이
       * 튀어 얼룩이 되고, 정작 단이 바뀌는 자리는 색이 같아 넘어가 버렸다 —
       * 무늬가 계단을 **가리고** 있었다. 단마다 갈라 주면 높이 차이가 약해도
       * 색으로 경계가 읽힌다.
       */
      tone: Math.round(tread.rise / STAIR.riser) % 2 === 0 ? TONE.stone : TONE.stoneDark,
      blockIndex: block.blockIndex,
      sink: STAIR.sink,
    });
  }

  pushRails(rails, block, axis, treads, blockGround);
}

/**
 * 난간을 얹는다.
 *
 * 가로대는 **같은 벽에 같은 높이로 이어지는 구간마다 한 도막**이다. 디딤판마다
 * 끊으면 층계참에서 한 줄로 보이는데도 인스턴스만 늘어난다. 반대로 구간을
 * 무시하고 길게 이으면 두 가지가 깨진다 — 단이 진 자리를 난간이 **가로질러**
 * 계단을 뚫고 지나가고, 집이 바뀌어 벽이 물러난 자리에서는 벽에서 떨어져
 * 허공에 뜬다.
 *
 * 기둥은 세 판마다 세운다. 매 판마다 세우면 난간이 아니라 울타리가 된다.
 */
function pushRails(
  rails: BoxInstance[],
  block: HillsideBlock,
  axis: RunAxis,
  treads: readonly Tread[],
  blockGround: number,
): void {
  let start = 0;
  while (start < treads.length) {
    const wall = treads[start].gap.wall;
    // 붙일 벽이 없는 자리는 건너뛴다 — 난간은 집을 따라가는 것이다
    if (wall === null) {
      start += 1;
      continue;
    }

    let end = start;
    while (end + 1 < treads.length && continues(treads[end], treads[end + 1], wall)) end += 1;

    pushRailRun(rails, block, axis, treads, start, end, wall, blockGround);
    start = end + 1;
  }
}

/** 다음 디딤판이 같은 난간 도막에 이어지는가 */
function continues(current: Tread, next: Tread, wall: number): boolean {
  return (
    Math.abs(next.level - current.level) < 1e-6 &&
    // 집이 끊어 놓은 자리는 이어 붙이지 않는다 — 빈 구간 위로 난간이 날아간다
    Math.abs(next.along - current.along - STAIR.tread) < 1e-6 &&
    next.gap.wall !== null &&
    Math.abs(next.gap.wall - wall) < 1e-6
  );
}

function pushRailRun(
  rails: BoxInstance[],
  block: HillsideBlock,
  axis: RunAxis,
  treads: readonly Tread[],
  start: number,
  end: number,
  wall: number,
  blockGround: number,
): void {
  const level = treads[start].level;
  const span = (end - start + 1) * STAIR.tread;
  const alongCenter = (treads[start].along + treads[end].along) / 2;
  const side = wall + RAIL.wallGap;

  pushBar(rails, block, axis, alongCenter, side, level, span, blockGround);

  for (let i = start; i <= end; i += RAIL.postEvery) {
    pushBar(rails, block, axis, treads[i].along, side, level, 0, blockGround);
  }
}

/**
 * 난간 조각 하나 — `span`이 0보다 크면 가로대, 0이면 기둥.
 *
 * 골목 한쪽 벽에 붙인다. **플레이어 반지름(0.42m)보다 가깝게** 붙이므로 집
 * 충돌체가 이미 막아 둔 띠 안에 서고, 그래서 충돌체를 주지 않아도 통과되지
 * 않는다. 폭이 1.8m 남짓인 골목에 충돌체를 하나 더 놓으면 지나갈 수 없게
 * 되기 십상이다.
 */
function pushBar(
  rails: BoxInstance[],
  block: HillsideBlock,
  axis: RunAxis,
  along: number,
  cross: number,
  level: number,
  span: number,
  blockGround: number,
): void {
  const spot = axis.point(along, cross);
  const isPost = span <= 0;
  const base = flatY(level, blockGround, spot.x, spot.z);

  rails.push({
    x: spot.x,
    // 가로대는 난간 꼭대기에 눕고, 기둥은 디딤판에서 그 높이까지 선다
    y: base + (isPost ? RAIL.height / 2 : RAIL.height - RAIL.bar / 2),
    z: spot.z,
    ...axis.size(isPost ? RAIL.post : span, isPost ? RAIL.post : RAIL.bar),
    height: isPost ? RAIL.height : RAIL.bar,
    tone: TONE.rail,
    blockIndex: block.blockIndex,
  });
}
