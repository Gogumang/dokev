/**
 * 나무 — 가로수와 구역 나무.
 *
 * `cityDetails.ts`가 800줄 상한을 넘어 떼어 냈다. 이 묶음은 다른 디테일과
 * 성격이 다르다: 나머지는 건물이나 도로에 **붙는** 장식인데, 나무는 빈자리에
 * **스스로 서는** 것이라 「이미 뭐가 있는가」를 알아야 한다. 그 중복 방지
 * 로직(planter)이 이 파일의 절반이다.
 *
 * 배치 데이터만 만든다. 실제 상자 모양과 색은 `City.tsx`가 인스턴싱한다.
 *
 * `cityDetails`에서 **타입만** 가져온다. 값을 가져오면 순환이 되고, 이 저장소는
 * 그 순환 하나로 검사 49개가 한꺼번에 죽는 걸 이미 겪었다(`zones.ts` 주석).
 * 인도 가장자리 좌표(`SIDEWALK_EDGE`)를 import하지 않고 인자로 받는 이유가 이것이다.
 */

import { blockCenter, CITY, type BoxInstance, type CityLayout } from "@/game/world/cityLayout";
import type { CityDetails } from "@/game/world/cityDetails";
import { blockIndexFromPosition } from "@/game/world/streaming";
import { zoneForBlock, type Zone } from "@/game/world/zones";

/**
 * 구역 중심 간 거리(m).
 *
 * `cityDetails`에도 같은 줄이 있다. 베낀 것이 아니라 **순환을 피한 대가**다 —
 * 저쪽에서 값을 import하면 이 파일이 다시 `cityDetails`를 부르게 된다.
 * `CITY`에서 직접 유도하므로 도시 격자를 고치면 양쪽이 함께 따라온다.
 */
const blockPitch = CITY.blockSize + CITY.roadWidth;

/**
 * 수관 덩어리 수.
 *
 * 셋이 가장 보기 좋았지만 **인스턴스 예산에 걸렸다** — 저사양(반경 2) 최악
 * 지점이 4,055개가 되어 상한 4,000을 넘었다(`tests/perfBudget.test.ts`).
 * 그 상한은 그림자도 못 켜는 기기와의 약속이라, 보기 좋다고 올릴 값이 아니다.
 *
 * 둘이면 「큰 덩어리 + 어긋난 작은 덩어리」라 윤곽이 한 번은 꺾인다. 상자
 * 하나였을 때의 「막대 위에 얹힌 초록 상자」에서는 확실히 벗어난다.
 */
const CROWN_LOBES = 2;

/**
 * 수관 팔레트의 시작 번호 — 렌더의 `CROWN_PALETTE`와 순서를 맞춘다.
 *
 * 계열마다 두 색씩이다. 한 계열이 한 색이면 나무가 전부 같은 초록(또는 같은
 * 분홍)이 되어 숲이 벽지처럼 보인다.
 */
const CROWN_TONE = { leaf: 0, blossom: 2 } as const;

/**
 * 그 자리가 꽃나무인지 정할 0~1 값 — **좌표에서 뽑는다.**
 *
 * `random()`을 한 번 더 부르면 될 일이지만, 그러면 **씨앗 순서가 밀린다.**
 * 이 생성기 뒤에 오는 것들(좌판·발밑 잡초·네온)이 전부 다른 수를 받아 도시가
 * 통째로 다시 배치된다. 실제로 그렇게 했다가 나무 한 그루가 소품 위로 옮겨
 * 앉았고, `worldConsistency`가 그걸 잡았다 — 색을 하나 더한 변경이 배치를
 * 건드리면 안 된다.
 *
 * 좌표 해시는 재현성을 깨지 않는다(같은 자리면 늘 같은 값). 「난수는
 * `createSeededRandom`만」이라는 규칙이 지키려는 것이 재현성이고, 이 함수는
 * 난수가 아니라 **자리의 성질**이다.
 */
function blossomAt(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * 나무 사이 최소 간격(m).
 *
 * 가로줄·세로줄을 각각 심으므로 **교차로에서 두 그루가 1.3m까지 붙는다.**
 * 겹쳐 심긴 나무는 짙은 덩어리로 보이고 인스턴스만 먹는다. 가로등이 같은
 * 이유로 이미 중복 방지를 하고 있다(`addStreetLights`의 `taken`).
 *
 * 1.8m는 수관(2.4~3.5m)이 서로 스치되 기둥은 갈라져 보이는 거리다. 잎이
 * 맞닿는 것까지 막으면 가로수길이 성겨진다 — 실제로 그렇게 좁혔다가 되돌렸다.
 */
const TREE_MIN_GAP = 1.8;

/**
 * 이미 심은 자리를 기억해 겹침을 막는다.
 *
 * 전부와 거리를 재면 O(n²)다. 숲이 들어오면서 그루 수가 수백으로 늘어 그
 * 방식은 못 쓴다 — 격자 칸에 나눠 담고 이웃 아홉 칸만 본다.
 *
 * 칸 크기를 최소 간격과 같게 두는 것이 핵심이다. 그래야 간격 안에 들어오는
 * 점이 반드시 이웃 아홉 칸 중 하나에 있다 — 칸이 더 작으면 두 칸 건너의
 * 이웃을 놓친다.
 */
export function createTreePlanter() {
  const cells = new Map<string, { x: number; z: number }[]>();
  const key = (cx: number, cz: number) => `${cx},${cz}`;

  return {
    /** 심을 수 있으면 자리를 등록하고 true. 이미 가까운 나무가 있으면 false. */
    tryPlant(x: number, z: number): boolean {
      const cx = Math.floor(x / TREE_MIN_GAP);
      const cz = Math.floor(z / TREE_MIN_GAP);

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = cells.get(key(cx + dx, cz + dz));
          if (!bucket) continue;
          for (const spot of bucket) {
            if (Math.hypot(spot.x - x, spot.z - z) < TREE_MIN_GAP) return false;
          }
        }
      }

      const home = key(cx, cz);
      const bucket = cells.get(home);
      if (bucket) bucket.push({ x, z });
      else cells.set(home, [{ x, z }]);
      return true;
    },
  };
}

export type TreePlanter = ReturnType<typeof createTreePlanter>;

/**
 * 수관이 벽에서 띄우는 여백을 배율로 환산한다.
 *
 * 가장 멀리 뻗는 것은 야자 잎이다: 중심에서 `crownSize * 0.42`만큼 나가고 잎
 * 자체가 `crownSize * 1.05` 폭이라 반쪽까지 더하면 `crownSize * 0.945`다.
 * `crownSize`의 최대가 `3.5 * treeScale`이므로 3.4배가 그 값을 덮는다.
 */
const WALL_MARGIN_PER_SCALE = 3.4;

/**
 * 그 자리에 심어도 수관이 벽을 파고들지 않는지.
 *
 * **가로수도 이 검사를 거쳐야 한다.** 한동안 구역 나무만 확인했는데, 나무를
 * 구역별로 키우자마자 해안의 야자가 길가 건물에 박혔다 — 배율 1일 때는 인도
 * 폭 안에 들어와서 우연히 괜찮았을 뿐이다.
 *
 * 그 구역 건물만 본다. 건물은 자기 구역을 벗어나지 않으므로 도시 전체를
 * 훑을 이유가 없다.
 */
function clearsBuildings(
  buildings: readonly BoxInstance[],
  x: number,
  z: number,
  scale: number,
): boolean {
  const margin = WALL_MARGIN_PER_SCALE * scale;
  return !buildings.some(
    (b) => Math.abs(x - b.x) < b.width / 2 + margin && Math.abs(z - b.z) < b.depth / 2 + margin,
  );
}

/**
 * 비워 달라고 표시된 자리를 피하는지.
 *
 * 수관 반지름까지 더해서 잰다 — 기둥만 비켜서면 잎이 물 위로 뻗는다.
 */
function clearsExclusions(
  exclusions: readonly { x: number; z: number; radius: number }[],
  x: number,
  z: number,
  scale: number,
): boolean {
  const crown = WALL_MARGIN_PER_SCALE * scale;
  return !exclusions.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spot.radius + crown);
}

/** 구역 번호 → 그 구역 건물들. 매 나무마다 전체를 훑지 않으려고 한 번만 만든다 */
function groupBuildingsByBlock(layout: CityLayout): Map<number, BoxInstance[]> {
  const byBlock = new Map<number, BoxInstance[]>();
  for (const building of layout.buildings) {
    const bucket = byBlock.get(building.blockIndex);
    if (bucket) bucket.push(building);
    else byBlock.set(building.blockIndex, [building]);
  }
  return byBlock;
}

/**
 * 구역 안쪽을 나무로 채운다.
 *
 * 가로수(`addStreetTrees`)는 도로를 따라서만 심는다. 그것만으로는 숲이
 * 「나무가 늘어선 도로」가 되지 어디를 봐도 나무인 숲이 되지 않는다. 필지를
 * 거의 다 비워 둔 구역(숲 93%, 공원 82%)의 빈자리를 여기서 메운다.
 *
 * 건물 안에는 심지 않는다. 그 구역 건물만 검사하면 충분하다 — 건물은 자기
 * 구역을 벗어나지 않으므로 도시 전체를 훑을 이유가 없다.
 */
export function addZoneTrees(
  details: CityDetails,
  layout: CityLayout,
  planter: TreePlanter,
  random: () => number,
): void {
  /** 구역 가장자리에서 띄우는 여백(m). 인도와 가로수 자리를 침범하지 않는다 */
  const EDGE_INSET = 2.4;
  /** 한 그루당 몇 번까지 자리를 다시 뽑을지. 빽빽할수록 실패가 잦다 */
  const TRIES_PER_TREE = 4;

  const half = CITY.blockSize / 2 - EDGE_INSET;
  const area = CITY.blockSize * CITY.blockSize;

  const byBlock = groupBuildingsByBlock(layout);

  const totalBlocks = CITY.gridSize * CITY.gridSize;
  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const zone = zoneForBlock(blockIndex);
    if (zone.treeDensity <= 0) continue;

    const wanted = Math.round((zone.treeDensity * area) / 1000);
    const { cx, cz } = blockCenter(blockIndex);
    const buildings = byBlock.get(blockIndex) ?? [];

    for (let planted = 0; planted < wanted; planted += 1) {
      for (let attempt = 0; attempt < TRIES_PER_TREE; attempt += 1) {
        const x = cx + (random() - 0.5) * 2 * half;
        const z = cz + (random() - 0.5) * 2 * half;

        if (!clearsBuildings(buildings, x, z, zone.treeScale)) continue;
        /*
         * 연못·놀이터 자리는 배치가 미리 비워 달라고 말해 둔 곳이다
         * (`layout.treeExclusions`). 없으면 **물 위에 나무가 서고 미끄럼틀에
         * 나무가 박힌다** — 공원에 나무를 촘촘히 심어 두었으므로 반드시 걸린다.
         */
        if (!clearsExclusions(layout.treeExclusions, x, z, zone.treeScale)) continue;
        if (!planter.tryPlant(x, z)) continue;

        pushTree(details, x, z, zone, random, blockIndex);
        break;
      }
    }
  }
}

/**
 * 나무 한 그루를 배치 데이터로 만든다.
 *
 * 종류를 **인자로 받는다.** `blockIndex`로 구역을 되짚지 않는 이유는 가로수의
 * `blockIndex`가 구역 번호가 아니라 **도로 축 번호**이기 때문이다
 * (`addStreetTrees`가 `g`를 넘긴다). 그걸로 구역을 찾으면 엉뚱한 종류가 나온다.
 */
function pushTree(
  details: CityDetails,
  x: number,
  z: number,
  zone: Zone,
  random: () => number,
  blockIndex: number,
): void {
  const scale = zone.treeScale;
  const trunkHeight = (2.2 + random() * 0.8) * scale;
  const crownSize = (2.4 + random() * 1.1) * scale;

  details.treeTrunks.push({
    x,
    y: trunkHeight / 2,
    z,
    /*
     * 기둥 굵기는 키를 그대로 따라가지 않는다.
     *
     * 배율을 그대로 곱하면 숲의 9m 나무가 굵기 0.7m가 되어 **전봇대**처럼
     * 보인다. 실제 나무는 키가 두 배여도 굵기는 그만큼 늘지 않는다 —
     * 제곱근으로 눌러 준다.
     */
    width: 0.34 * Math.sqrt(scale),
    height: trunkHeight,
    depth: 0.34 * Math.sqrt(scale),
    tone: 0,
    blockIndex,
  });

  /*
   * 꽃나무인지 **먼저** 정한다. 구역의 종류보다 앞선다 — 벚나무는 활엽수라,
   * 침엽수 구역(옛 마을)에도 벚나무가 서면 소나무 사이에 분홍이 섞인다.
   * 참고 화면에서 기와담 위로 넘어온 가지가 바로 그것이다.
   *
   * 「소나무에 분홍 잎」이 아니라 「소나무 사이의 벚나무」다. 종류를 바꾸지
   * 않고 색만 바꾸면 전자가 되어 오류로 보인다.
   */
  if (blossomAt(x, z) < zone.blossomChance) {
    pushBroadleafCrown(
      details,
      x,
      z,
      trunkHeight,
      crownSize,
      random,
      blockIndex,
      CROWN_TONE.blossom,
    );
    return;
  }
  if (zone.treeSpecies === "conifer") {
    pushConiferCrown(details, x, z, trunkHeight, crownSize, random, blockIndex);
    return;
  }
  if (zone.treeSpecies === "palm") {
    pushPalmCrown(details, x, z, trunkHeight, crownSize, random, blockIndex);
    return;
  }
  pushBroadleafCrown(details, x, z, trunkHeight, crownSize, random, blockIndex, CROWN_TONE.leaf);
}

/**
 * 활엽수 수관 — 둥근 덩어리 여럿.
 *
 * 상자 하나였다. 멀리서는 나무로 읽히는데 가까이 가면 **초록 상자가 막대
 * 위에 얹혀 있다.** 3인칭 카메라가 인도 높이라 그 거리를 늘 지나간다.
 *
 * 덩어리를 서로 어긋나게 겹치면 윤곽이 울퉁불퉁해져 잎 덩어리로 읽힌다.
 */
function pushBroadleafCrown(
  details: CityDetails,
  x: number,
  z: number,
  trunkHeight: number,
  crownSize: number,
  random: () => number,
  blockIndex: number,
  /**
   * 수관 색의 시작 번호(`CROWN_TONE`).
   *
   * **나무 한 그루의 덩어리는 전부 같은 계열이어야 한다.** 덩어리마다 따로
   * 뽑으면 한 나무가 반은 초록, 반은 분홍이 되어 나무가 아니라 얼룩으로
   * 보인다 — 그래서 결정은 `pushTree`가 한 번만 하고 여기로 넘겨준다.
   */
  toneBase: number,
): void {
  const centerY = trunkHeight + crownSize / 2 - 0.3;

  for (let lobe = 0; lobe < CROWN_LOBES; lobe += 1) {
    // 첫 덩어리는 가운데 큰 것, 나머지는 작게 흩는다
    const isCore = lobe === 0;
    const size = crownSize * (isCore ? 1 : 0.5 + random() * 0.28);
    const spread = isCore ? 0 : crownSize * 0.34;

    details.treeCrowns.push({
      x: x + (random() - 0.5) * spread * 2,
      y: centerY + (isCore ? 0 : (random() - 0.35) * crownSize * 0.42),
      z: z + (random() - 0.5) * spread * 2,
      width: size,
      height: size * 0.78,
      depth: size,
      tone: toneBase + Math.floor(random() * 2),
      blockIndex,
    });
  }
}

/**
 * 침엽수 수관 — 원뿔 두 단.
 *
 * 한 단이면 고깔이지 나무가 아니다. 아래를 넓게, 위를 좁고 높게 두 단으로
 * 쌓으면 실루엣에 허리가 생겨 전나무로 읽힌다.
 *
 * 위 단이 아래 단 **속에서** 시작해야 한다 — 딱 붙여 쌓으면 이음매에서
 * 두 원뿔이 만나는 자리가 각지게 드러난다.
 */
function pushConiferCrown(
  details: CityDetails,
  x: number,
  z: number,
  trunkHeight: number,
  crownSize: number,
  random: () => number,
  blockIndex: number,
): void {
  const lowerHeight = crownSize * 1.9;
  const lowerY = trunkHeight + lowerHeight / 2 - crownSize * 0.35;

  details.treeCones.push({
    x,
    y: lowerY,
    z,
    width: crownSize * 1.15,
    height: lowerHeight,
    depth: crownSize * 1.15,
    tone: Math.floor(random() * 2),
    blockIndex,
  });

  const upperHeight = lowerHeight * 0.72;
  details.treeCones.push({
    x,
    // 아래 단의 위쪽 60% 지점에서 시작하게 겹친다
    y: lowerY + lowerHeight * 0.34 + upperHeight / 2,
    z,
    width: crownSize * 0.72,
    height: upperHeight,
    depth: crownSize * 0.72,
    tone: Math.floor(random() * 2),
    blockIndex,
  });
}

/**
 * 야자 수관 — 납작하고 넓은 잎 덩어리.
 *
 * 잎을 한 장씩 만들지 않는다. 인스턴스가 그루당 여섯 개로 늘어 해안 한 구역만
 * 예산을 다 먹는다. 납작한 덩어리 셋을 **수평으로 벌려** 놓으면 실루엣이
 * 활엽수와 확실히 갈린다 — 옆으로 퍼지고 위가 눌린 모양이다.
 */
function pushPalmCrown(
  details: CityDetails,
  x: number,
  z: number,
  trunkHeight: number,
  crownSize: number,
  random: () => number,
  blockIndex: number,
): void {
  const centerY = trunkHeight + crownSize * 0.16;

  for (let frond = 0; frond < PALM_FRONDS; frond += 1) {
    const angle = (frond / PALM_FRONDS) * Math.PI * 2 + random() * 0.4;
    const reach = crownSize * 0.42;

    details.treeCrowns.push({
      x: x + Math.cos(angle) * reach,
      y: centerY - random() * crownSize * 0.12,
      z: z + Math.sin(angle) * reach,
      width: crownSize * 1.05,
      // 납작하게 눌러야 야자로 읽힌다. 둥글면 그냥 작은 활엽수다
      height: crownSize * 0.26,
      depth: crownSize * 1.05,
      tone: Math.floor(random() * 2),
      blockIndex,
    });
  }
}

/** 야자 잎 덩어리 수. 셋이면 어느 각도에서 봐도 비대칭이 보인다 */
const PALM_FRONDS = 3;

/**
 * 길가 한 자리에 나무를 심어 본다.
 *
 * 종류는 **그 자리의 구역**을 따른다. `g`(도로 축 번호)로 구역을 찾으면 안 된다 —
 * 그것은 구역 번호가 아니다. 좌표로 물어야 숲을 지나는 길가에 활엽수가
 * 한 줄 서는 일이 없다.
 */
function plantStreetTree(
  details: CityDetails,
  layout: CityLayout,
  byBlock: Map<number, BoxInstance[]>,
  planter: TreePlanter,
  x: number,
  z: number,
  random: () => number,
  axisIndex: number,
): void {
  const blockIndex = blockIndexFromPosition(x, z);
  const zone = zoneForBlock(blockIndex);

  if (!clearsBuildings(byBlock.get(blockIndex) ?? [], x, z, zone.treeScale)) return;
  if (!clearsExclusions(layout.treeExclusions, x, z, zone.treeScale)) return;
  if (!planter.tryPlant(x, z)) return;

  pushTree(details, x, z, zone, random, axisIndex);
}

/** 가로수 — 기둥과 수관을 따로 인스턴싱한다. */
export function addStreetTrees(
  details: CityDetails,
  layout: CityLayout,
  /** 인도 바깥 가장자리까지의 거리(m). `cityDetails.SIDEWALK_EDGE`를 받는다 */
  sidewalkEdge: number,
  planter: TreePlanter,
  random: () => number,
): void {
  const halfExtent = layout.halfExtent;
  const byBlock = groupBuildingsByBlock(layout);
  const offset = (CITY.gridSize - 1) / 2;
  const spacing = CITY.streetLightSpacing;

  for (let g = 0; g < CITY.gridSize; g += 1) {
    const axis = (g - offset) * blockPitch;

    for (let t = -halfExtent + 12; t < halfExtent - 12; t += spacing) {
      /*
       * 자리를 절반쯤 비운다.
       *
       * 예전에는 0.4였다. 수관을 덩어리 둘로 나누면서 나무 한 그루의 인스턴스가
       * 2개에서 3개가 되었고, 저사양 인스턴스 상한(4,000)을 넘었다. 그루 수를
       * 줄여 그만큼을 돌려준다 — **덜 심되 심은 나무는 나무처럼 보이는 쪽**을
       * 골랐다. 상한은 그림자도 못 켜는 기기와의 약속이라 올릴 값이 아니다.
       */
      if (random() < 0.52) continue;
      const lane = random() < 0.5 ? 1 : -1;
      /*
       * 교차로에서 가로줄과 세로줄이 서로 1.3m까지 붙는다 — (41.9, 41.0)과
       * (41.0, 41.9)처럼 축을 맞바꾼 짝이 생기기 때문이다. 심기 전에 물어본다.
       */
      const across = axis + lane * (sidewalkEdge + 0.4);
      plantStreetTree(details, layout, byBlock, planter, across, t, random, g);
      plantStreetTree(details, layout, byBlock, planter, t, across, random, g);
    }
  }
}
