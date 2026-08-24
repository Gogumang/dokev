/**
 * 블록아웃 도시 배치 — 순수 데이터 생성.
 *
 * PROJECT_PLAN 「구조 원칙」의 "데이터와 렌더링 코드 분리", "월드는 구역 단위로
 * 로딩·해제 가능" 원칙을 배치에도 적용한다. 이 모듈은 three.js를 모르고,
 * 렌더러는 이 모듈의 결과만 인스턴싱한다.
 *
 * 지금은 한 번에 전부 생성하지만 blockIndex를 남겨 두었으므로, 구역 스트리밍이
 * 필요해지면 blockIndex로 필터링하는 것만으로 부분 로딩이 가능하다.
 */

import { createSeededRandom } from "@/game/core/mathx";
import type { Aabb, Vec3 } from "@/game/player/locomotion";
import { terrainHeight } from "@/game/world/terrain";
import type { DetailInstance } from "@/game/world/cityDetails";
import { buildMarket } from "@/game/world/market";
import { buildNatureAnchors } from "@/game/world/natureAnchors";
import { addCrosswalks, addStreetLights, type StreetGrid } from "@/game/world/streetFurniture";
import { buildPark, type TreeExclusion } from "@/game/world/park";
import { buildNeon } from "@/game/world/neon";
import { buildUndergrowth } from "@/game/world/undergrowth";
import {
  COURTYARD_DOORWAY,
  COURTYARD_SPAWN_CLEAR_RADIUS,
  COURTYARD_WALL_EDGES,
  courtyardSpawnZ,
} from "@/game/world/courtyard";
import { buildOldTown } from "@/game/world/oldTown";
import { buildHillside } from "@/game/world/hillside";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";

export interface BoxInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  /** 팔레트 인덱스. 색상 값 자체를 데이터에 박지 않는다 */
  tone: number;
  /** 소속 구역. 향후 구역 단위 로딩/해제의 키 */
  blockIndex: number;
  /** y축 회전(rad). 간판처럼 벽면에 붙는 요소가 쓴다. 없으면 0 */
  rotationY?: number;
  /**
   * 아래로 더 파묻는 깊이(m). 없으면 0.
   *
   * 지형이 기울면 축 정렬 상자는 **낮은 쪽 모서리가 뜬다.** 건물 바닥이
   * 1m 넘게 공중에 뜨는 자리가 실제로 생긴다(경사 10%에 11m 필지). 위쪽은
   * 그대로 두고 아래로만 늘려 파묻는다 — 렌더가 `applyInstances`에서 적용한다.
   *
   * `height`는 **지면 위로 보이는 높이**라는 뜻을 유지한다. 여기에 파묻는
   * 깊이를 섞으면 옥상 난간·간판이 그만큼 위로 밀린다.
   */
  sink?: number;
}

export interface CityLayout {
  buildings: BoxInstance[];
  /**
   * 높은 건물 위에 한 단 올라앉는 좁은 볼륨(계단식 후퇴).
   *
   * `buildings`와 나눠 두는 이유는 렌더가 아니라 **디테일** 때문이다.
   * `cityDetails`가 건물 하나마다 1층 상가·간판·차양을 붙이는데, 옥탑을
   * 건물 목록에 섞으면 지면에 상가 띠가 하나 더 생기고 공중에 간판이 뜬다.
   *
   * 파사드 텍스처는 건물과 같은 것을 쓰므로 렌더에서는 같은 묶음에 들어간다 —
   * 드로우콜은 늘지 않는다.
   */
  setbacks: BoxInstance[];
  /** 가로등 기둥, 화단 등 반복 소품 */
  props: BoxInstance[];
  /** 횡단보도 줄무늬 — 바닥에 살짝 띄운 얇은 판 */
  crosswalks: BoxInstance[];
  /**
   * 가로등 갓. 기둥(props)과 나눠 두는 이유는 밤에 이것만 빛나야 하기 때문이다.
   * 기둥까지 발광시키면 도시에 형광 막대가 늘어선다.
   */
  streetLamps: BoxInstance[];
  /**
   * 자연 구역의 선돌 — 숲·해안·옛 마을에서 그래플을 걸 지점.
   *
   * 가로등을 자연 구역에서 걷어내면(`isUrban`) 그래플 사거리(24m) 밖이 생겨
   * **숲에서 이동이 막힌다.** 그래서 걷어내기 전에 걸 것을 먼저 세운다.
   * 상자가 아니라 둥근 덩어리로 그린다 — 각진 바위는 건물처럼 보인다.
   */
  rocks: BoxInstance[];
  /** 옛 마을의 돌담 — 눈높이에 있어 그 구역의 인상을 만든다 */
  stoneWalls: BoxInstance[];
  /** 홍살문 기둥과 보 */
  gates: BoxInstance[];
  /**
   * 담 아래 나무 화분과 철쭉.
   *
   * 잡초(`undergrowth`)와 나누어 둔다 — 저쪽 팔레트에는 나무 색이 없고,
   * 톤 번호를 두 팔레트에 걸쳐 쓰면 한쪽을 고칠 때 다른 쪽이 조용히 어긋난다.
   */
  wallPlanters: BoxInstance[];
  /** 담에 붙는 식물 — 화분의 철쭉과 담을 타고 넘는 담쟁이. 둥근 덩어리라 묶음이 따로다 */
  wallGreens: BoxInstance[];
  /**
   * 언덕 주택가의 골목 계단 디딤판.
   *
   * 지형을 20cm 단위로 끊어 그린 것이다. **충돌체를 주지 않는다** — 지면과
   * 최대 10cm밖에 안 벌어지는데, 충돌체를 주면 `resolveHorizontalCollisions`가
   * 단 높이를 「넘어설 수 없는 벽」으로 읽어(그 함수에는 계단 오르기가 없다)
   * 골목이 통째로 막힌다.
   */
  alleySteps: BoxInstance[];
  /** 골목 난간 — 계단 실루엣은 디딤판보다 이쪽이 먼저 읽힌다 */
  alleyRails: BoxInstance[];
  /** 노을 시장의 도로 위 천막 — 머리 위를 덮어야 시장이 된다 */
  marketCanopies: BoxInstance[];
  /** 좌판 상판·물건·기둥·차양 */
  marketStalls: BoxInstance[];
  /**
   * 너른 공원의 연못 수면.
   *
   * 테두리와 나눠 둔다 — 수면은 물결이 흐르는 텍스처를 쓰고 테두리는 단색이다
   * (`park.ParkParts` 주석).
   */
  pondWater: BoxInstance[];
  /** 연못 돌 테두리 */
  pondRim: BoxInstance[];
  /** 미끄럼틀·그네·시소·모래밭. 기울어지는 조각이 있어 `DetailInstance`다 */
  playground: DetailInstance[];
  /** 산책로 포석 */
  parkPaths: BoxInstance[];
  /**
   * 번화가 건물을 두르는 네온 관.
   *
   * 밤에만 켜지므로 렌더가 `nightGlow`로 색을 섞는다 — 배치는 어디에 있는지만 안다.
   */
  neon: BoxInstance[];
  /**
   * 자연 구역 발밑의 덤불·바위·들꽃.
   *
   * 나무는 머리 위에 있고 잔디는 무늬라, 이것이 없으면 **달릴 때 속도가
   * 느껴지지 않는다** — 지나가는 것이 없으면 지나가고 있다는 감각도 없다.
   */
  undergrowth: BoxInstance[];
  /**
   * 나무를 심으면 안 되는 자리.
   *
   * 배치가 렌더가 아니라 **다른 배치**에게 하는 말이다. 나무는 `cityDetails`가
   * 나중에 심는데, 연못과 놀이터는 여기서 놓으므로 그대로 두면 **물 위에 나무가
   * 서고 미끄럼틀에 나무가 박힌다.**
   */
  treeExclusions: TreeExclusion[];
  /**
   * 놀이터 한복판 좌표(`park.playSpots`).
   *
   * 군중이 여기 모여 논다. 배치가 정한 자리를 그대로 흘려보낸다 — 좌표를
   * 두 곳에 적으면 아이들이 미끄럼틀 옆 잔디에서 논다.
   */
  playSpots: { x: number; z: number }[];
  /**
   * 그래플을 걸 수 있는 높은 지점.
   *
   * 예전에는 `props`에서 `tone === 0 && height > 4`로 **추려 냈다.** 색과 높이로
   * 「이건 전봇대겠지」를 추측하는 것이라, 같은 색의 소품을 하나 더 놓는 순간
   * 조용히 걸리는 대상이 되고, 자연 구역에 다른 모양의 앵커를 세우면 반대로
   * 조용히 빠진다. 무엇이 앵커인지는 **놓는 쪽이 말해야 한다.**
   *
   * y는 담지 않는다 — 그 자리의 지면 높이를 더해야 하는데, 그 덧셈은 쓰는
   * 쪽(`PlayerRig`)이 이미 하고 있고 두 곳에서 하면 어긋난다.
   */
  grappleAnchors: GrappleAnchorSpec[];
  colliders: Aabb[];
  /** 월드 정사각형의 절반 크기 */
  halfExtent: number;
  spawn: Vec3;
}

/** 그래플을 걸 지점 하나. 높이는 지면 위 상대값이다 */
export interface GrappleAnchorSpec {
  x: number;
  z: number;
  /** 지면에서 걸 지점까지의 높이(m) */
  height: number;
}

export const BUILDING_TONE_COUNT = 6;

/**
 * 건물 한 변의 최소 길이(m).
 *
 * 이보다 좁은 필지는 건너뛴다. 구역마다 필지 수를 다르게 두면서 생긴 제약이다 —
 * 시장은 한 구역을 5필지로 쪼개고, 거기서 여백(inset)을 빼면 한 변이 5m 아래로
 * 내려간다. 0 아래로 내려가면 상자가 뒤집혀 벽이 사라지고 충돌체가 통과된다.
 *
 * 3m는 「사람 하나가 들어가는 가게」의 하한이다. 그보다 작으면 건물이 아니라
 * 기둥으로 보인다.
 */
const MIN_FOOTPRINT = 3;

/**
 * 계단식 후퇴 수치.
 *
 * 「몇 층부터, 얼마나 좁혀, 얼마나 높이」를 한곳에 모은다. 배치 코드 안에
 * 흩어 두면 실루엣을 조정할 때마다 루프를 뒤져야 한다.
 */
const SETBACK = {
  /** 이 높이(m) 이상인 건물에만 올린다 */
  minBaseHeight: 15,
  /** 그중 몇 채에 올릴지(0~1). 전부에 올리면 도시가 같은 리듬으로 반복된다 */
  chance: 0.55,
  /** 아래층 대비 폭·깊이 비율 */
  minShrink: 0.45,
  maxShrink: 0.72,
  /** 아래층 높이 대비 옥탑 높이 */
  minHeightRatio: 0.16,
  heightRatioSpread: 0.22,
} as const;

/**
 * 한 변의 구역 수. 아래 plazaBlockIndex 계산에 필요해 상수로 먼저 뺀다.
 */
const GRID_SIZE = 6;

export const CITY = {
  /**
   * 한 변의 구역 수.
   *
   * 스트리밍(streaming.ts)이 멀리 있는 구역을 걸러 주므로 넓혀도 화면에
   * 올라가는 인스턴스 수는 보이는 구역분으로 일정하다.
   */
  gridSize: GRID_SIZE,
  /** 건물이 들어서는 구역 한 변의 길이(m) */
  blockSize: 34,
  /** 도로 폭(m). 스케이트보드 최고 속도에서 회전 반경이 확보되어야 한다 */
  roadWidth: 13,
  /**
   * 광장으로 비워 둘 구역 — 격자 **안쪽** 한 칸.
   *
   * 상수로 박아 두면 gridSize를 바꿀 때 따라오지 않는다. 실제로 4x4 기준의
   * 5번을 6x6에서 그대로 쓰다가 스폰 지점이 지도 모서리로 밀려났고,
   * 시야의 절반이 월드 밖이라 스트리밍이 9구역밖에 못 띄웠다.
   */
  plazaBlockIndex: Math.floor(GRID_SIZE / 2) * GRID_SIZE + Math.floor(GRID_SIZE / 2),
  /**
   * 인도 상판 두께(m).
   *
   * 렌더(City.tsx의 Sidewalks)와 보행자 발 높이(crowdLayout)가 같은 값을
   * 써야 한다. 예전에는 양쪽에 0.16을 따로 적고 주석으로만 연결했는데,
   * 도로 좌표가 그런 식으로 어긋난 적이 있어 여기로 올렸다.
   */
  sidewalkHeight: 0.16,
  streetLightSpacing: 17,
  seed: 20260816,
} as const;

/** 구역 중심 간 거리 */
const blockPitch = CITY.blockSize + CITY.roadWidth;

/**
 * 도로 중심선 좌표 (x축·z축 공통).
 *
 * **구역 중심이 아니라 그 사이의 한가운데다.** 구역 중심에서 반 칸(pitch/2)
 * 옮긴 자리가 도로다. 이 반 칸을 빠뜨리면 "도로"라고 부르는 좌표가 실제로는
 * 건물 한복판을 가리킨다 — 실제로 그렇게 틀렸고, 도깨비 자리가 건물 안에
 * 박히고 미니맵이 건물을 가로질러 도로를 그렸다.
 *
 * 격자 바깥쪽 한 줄까지 포함한다. 도시 가장자리를 두르는 도로가 있다.
 */
export const ROAD_CENTERS: readonly number[] = Array.from(
  { length: CITY.gridSize + 1 },
  (_, i) => (i - 1 - (CITY.gridSize - 1) / 2) * blockPitch + blockPitch / 2,
);

/**
 * 구역 중심 좌표.
 *
 * 이 도시에서 「몇 번째 구역」을 좌표로 바꾸는 **정본**이다. 같은 식이 소스
 * 열세 곳에 복제돼 있었고, 하나씩 뒤집어 보니 두 곳은 아무도 안 보고 있었다 —
 * 어긋나면 보행자가 건물 속을 걷고 보도블록이 도로 위에 깔린다.
 *
 * 새로 구역 좌표가 필요하면 식을 다시 쓰지 말고 이것을 부른다.
 */
export function blockCenter(index: number): { cx: number; cz: number } {
  const col = index % CITY.gridSize;
  const row = Math.floor(index / CITY.gridSize);
  const offset = (CITY.gridSize - 1) / 2;
  return {
    cx: (col - offset) * blockPitch,
    cz: (row - offset) * blockPitch,
  };
}

/**
 * 좌표 → 구역 번호. `blockCenter`의 역함수다.
 *
 * `streaming.blockIndexFromPosition`이 같은 일을 한다. 그쪽을 부르지 않는 이유는
 * **순환** 때문이다 — `streaming`은 모듈 최상단에서 `CITY`를 읽으므로, 여기서
 * import하는 순간 `CITY`가 undefined가 되어 도시 전체가 무너진다(`zones.ts` 주석).
 *
 * 그래서 식이 둘이 되었다. 이 저장소가 가장 아파한 종류의 중복이라 검사로
 * 묶어 두는데, **이 함수를 직접 부르는 검사는 두지 않았다.** 내부 도우미를
 * 드러내는 대신 결과로 잰다 — 「가로등이 자연 구역에 서지 않는다」를
 * `streaming`의 식으로 확인하면, 두 식이 갈라지는 순간 그 검사가 깨진다
 * (`cityLayout.test.ts`). 화면에 나타나는 증상으로 재는 편이 낫다.
 *
 * 도로 위 좌표도 가장 가까운 구역으로 접는다 — 가로등은 도로에 서기 때문에
 * 접지 않으면 어느 구역인지 답이 없다.
 */
function blockIndexAt(x: number, z: number): number {
  const offset = (CITY.gridSize - 1) / 2;
  const fold = (value: number) => Math.max(0, Math.min(CITY.gridSize - 1, value));
  const col = fold(Math.round(x / blockPitch + offset));
  const row = fold(Math.round(z / blockPitch + offset));
  return row * CITY.gridSize + col;
}

/**
 * 도시 배치를 만든다.
 *
 * 시드가 고정이라 새로고침해도 같은 도시가 나온다. 성능을 프레임 단위로
 * 비교해야 하는데 배치가 매번 달라지면 측정값을 비교할 수 없기 때문이다.
 */
export function buildCityLayout(): CityLayout {
  const random = createSeededRandom(CITY.seed);
  const buildings: BoxInstance[] = [];
  const setbacks: BoxInstance[] = [];
  const props: BoxInstance[] = [];
  const crosswalks: BoxInstance[] = [];
  const streetLamps: BoxInstance[] = [];
  const rocks: BoxInstance[] = [];
  const stoneWalls: BoxInstance[] = [];
  const gates: BoxInstance[] = [];
  const wallPlanters: BoxInstance[] = [];
  const wallGreens: BoxInstance[] = [];
  const alleySteps: BoxInstance[] = [];
  const alleyRails: BoxInstance[] = [];
  const marketCanopies: BoxInstance[] = [];
  const marketStalls: BoxInstance[] = [];
  const pondWater: BoxInstance[] = [];
  const pondRim: BoxInstance[] = [];
  const playground: DetailInstance[] = [];
  const parkPaths: BoxInstance[] = [];
  const undergrowth: BoxInstance[] = [];
  const neon: BoxInstance[] = [];
  const treeExclusions: TreeExclusion[] = [];
  const grappleAnchors: GrappleAnchorSpec[] = [];
  const colliders: Aabb[] = [];

  const totalBlocks = CITY.gridSize * CITY.gridSize;
  const halfExtent = (CITY.gridSize * blockPitch) / 2;

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const { cx, cz } = blockCenter(blockIndex);

    if (blockIndex === CITY.plazaBlockIndex) {
      addPlaza(props, colliders, cx, cz, blockIndex, random);
      continue;
    }

    /*
     * 구역 성격에 따라 필지를 나눈다.
     *
     * 예전에는 모든 구역이 같은 식이었다 — 2~3필지, 높이 7~26m, 빈 필지 14%.
     * 값이 하나뿐이면 이름을 아무리 붙여도 동네가 갈라지지 않는다. 숲이
     * 「나무가 있는 도심」이 아니라 숲으로 보이려면 필지 수·높이·공터 비율이
     * 함께 움직여야 한다.
     */
    const rule = zoneForBlock(blockIndex).build;
    const lots = rule.minLots + Math.floor(random() * (rule.maxLots - rule.minLots + 1));
    const lotSize = CITY.blockSize / lots;

    for (let lx = 0; lx < lots; lx += 1) {
      for (let lz = 0; lz < lots; lz += 1) {
        // 일부 필지는 비워 골목과 시야를 만든다. 비율이 구역 성격을 좌우한다.
        if (random() < rule.gapChance) continue;

        const inset = 1.1 + random() * 1.4;
        const width = lotSize - inset;
        const depth = lotSize - inset;
        /*
         * 폭이 음수가 되면 건물이 뒤집힌다.
         *
         * 시장은 한 구역을 5필지까지 쪼개므로 필지 한 변이 6.8m다. 여기서
         * inset이 2.5까지 나오면 4.3m — 아직 양수지만, 필지 수를 더 늘리면
         * 곧 음수가 된다. 뒤집힌 상자는 안쪽 면만 그려져 **벽이 사라진 것처럼**
         * 보이고, 충돌체는 min/max가 뒤바뀌어 통과된다.
         */
        if (width < MIN_FOOTPRINT || depth < MIN_FOOTPRINT) continue;

        const height = rule.minHeight + random() * (rule.maxHeight - rule.minHeight);

        const x = cx - CITY.blockSize / 2 + lotSize * (lx + 0.5);
        const z = cz - CITY.blockSize / 2 + lotSize * (lz + 0.5);

        const tone = rule.tones[Math.floor(random() * rule.tones.length)] % BUILDING_TONE_COUNT;

        buildings.push({
          x,
          y: height / 2,
          z,
          width,
          height,
          depth,
          tone,
          blockIndex,
          sink: footprintSink(x, z, width, depth),
        });

        colliders.push({
          minX: x - width / 2,
          maxX: x + width / 2,
          minZ: z - depth / 2,
          maxZ: z + depth / 2,
          // 옥상 높이는 그 자리의 지면 높이 위다 — 평지 기준으로 두면 언덕 위
          // 건물의 옥상이 지면 아래로 내려간다
          top: terrainHeight(x, z) + height,
        });

        addSetback(setbacks, colliders, { x, y: height / 2, z, width, height, depth, tone, blockIndex }, random);
      }
    }
  }

  /*
   * 세우는 순서가 뜻을 갖는다. **걸 것을 먼저 세우고 가로등을 걷어낸다** —
   * 반대로 하면 그 사이 상태에서 숲이 통째로 사거리 밖이 된다.
   */
  const natureBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter((index) => !isUrbanBlock(index))
    .map((index) => ({ blockIndex: index, ...blockCenter(index) }));
  const anchors = buildNatureAnchors(natureBlocks, CITY.blockSize, random);
  rocks.push(...anchors.rocks);
  colliders.push(...anchors.colliders);
  grappleAnchors.push(...anchors.grappleAnchors);

  /*
   * 옛 마을의 담과 문.
   *
   * 좌표는 여기서 계산해 넘긴다 — `oldTown`이 `cityLayout`을 값으로 가져오면
   * 순환이 되고, 그 순환 하나로 검사가 무더기로 죽는다(`zones.ts` 주석).
   */
  /*
   * 구역별 건물 묶음.
   *
   * 옛 마을 담과 시장 좌판이 둘 다 「집을 뚫지 않기」를 확인해야 해서 한 번만
   * 만들어 나눠 쓴다. 건물은 자기 구역을 벗어나지 않으므로 구역별로 나누면 된다.
   */
  const buildingsByBlock = new Map<number, BoxInstance[]>();
  for (const building of buildings) {
    const bucket = buildingsByBlock.get(building.blockIndex);
    if (bucket) bucket.push(building);
    else buildingsByBlock.set(building.blockIndex, [building]);
  }

  const isShrine = (index: number) => zoneForBlock(index).id === "shrine";

  /**
   * 담을 두를 구역 — 옛 마을 + 시작 광장.
   *
   * 광장을 넣은 이유는 **첫 화면** 때문이다. 참고하는 트레일러 장면은 기와담장이
   * 눈높이를 채우고 그 너머로 현대 건물이 서 있는 골목인데, 시작 지점이 담 없는
   * 상가 광장이라 첫 화면에 간판만 여덟 개가 들어왔다. 담을 두르면 같은 자리에서
   * 마당 → 문 → 번화가 순으로 보인다.
   *
   * 광장을 옛 마을로 **옮기지는** 않는다. 옛 마을은 전부 지도 위쪽 가장자리에 있어
   * 스폰을 그리로 보내면 시야의 절반이 월드 밖이 된다 — `CITY.plazaBlockIndex`
   * 주석에 적힌 그 사고다. 자리는 격자 중앙에 두고 담만 가져온다.
   */
  const isWalledCourtyard = (index: number) => isShrine(index) || index === CITY.plazaBlockIndex;

  /**
   * 그 변의 이웃 구역 번호. 격자 밖이면 -1.
   *
   * **행이 넘어가는 것을 막아야 한다** — 한 줄의 오른쪽 끝에서 `index + 1`은
   * 다음 줄의 왼쪽 끝이다. 시장 천막에서 같은 함정을 이미 만났다.
   */
  const neighbour = (index: number, dx: number, dz: number) => {
    const col = (index % CITY.gridSize) + dx;
    const row = Math.floor(index / CITY.gridSize) + dz;
    if (col < 0 || col >= CITY.gridSize || row < 0 || row >= CITY.gridSize) return -1;
    return row * CITY.gridSize + col;
  };

  const oldTownBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter(isWalledCourtyard)
    .map((index) => ({
      blockIndex: index,
      ...blockCenter(index),
      buildings: buildingsByBlock.get(index) ?? [],
      /*
       * 시작 마당은 담을 **한 변에만** 세우고 문턱도 넓힌다.
       *
       * 마을 구역은 담으로 둘러싸인 곳이 맞지만 시작 지점은 사방으로 나가는
       * 자리다. 네 변을 둘렀더니 목적지가 대각선에 있는 여정 두 개가 담 모서리에
       * 끼여 끝까지 못 갔다 — 문턱만 12m로 넓혔을 때 결과가 한 자리도 바뀌지
       * 않았으니, 막은 것은 변 가운데가 아니라 모서리였다.
       *
       * 참고 장면의 담도 마당을 두르지 않는다. 골목 한쪽을 따라 이어지고 반대편은
       * 트여 있다. 북쪽 한 변이면 눈높이의 기와담장은 그대로 보이면서 모서리가
       * 생기지 않는다.
       */
      doorway: index === CITY.plazaBlockIndex ? COURTYARD_DOORWAY : undefined,
      edges: index === CITY.plazaBlockIndex ? COURTYARD_WALL_EDGES : undefined,
      /*
       * 바깥을 향한 변에만 문을 세운다. 마을 안쪽 경계까지 세우면 마을을
       * 가로지를 때마다 문을 지나게 되어 이정표가 아니라 관문이 된다.
       */
      openSides: [
        { dx: 0, dz: 1 },
        { dx: 0, dz: -1 },
        { dx: 1, dz: 0 },
        { dx: -1, dz: 0 },
      ].filter((side) => {
        const next = neighbour(index, side.dx, side.dz);
        return next < 0 || !isWalledCourtyard(next);
      }),
    }));
  const oldTown = buildOldTown(oldTownBlocks, CITY.blockSize, random);
  stoneWalls.push(...oldTown.walls);
  gates.push(...oldTown.gates);
  wallPlanters.push(...oldTown.planters);
  wallGreens.push(...oldTown.wallGreens);
  colliders.push(...oldTown.colliders);

  /*
   * 언덕 주택가의 골목 계단.
   *
   * 골목이 어디인지는 **놓인 집이 정한다** — 필지 수로 다시 계산하면 공터
   * 규칙(`gapChance`)과 어긋나 집이 없는 자리에 골목이 생긴다. 그래서 여기서도
   * `buildingsByBlock`을 나눠 쓴다.
   */
  const hillsideBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter((index) => zoneForBlock(index).id === "residential")
    .map((index) => ({
      blockIndex: index,
      ...blockCenter(index),
      buildings: buildingsByBlock.get(index) ?? [],
    }));
  const hillside = buildHillside(hillsideBlocks, CITY.blockSize, CITY.sidewalkHeight);
  alleySteps.push(...hillside.steps);
  alleyRails.push(...hillside.rails);

  /*
   * 노을 시장의 천막과 좌판.
   *
   * 좌판이 집을 파고들지 않으려면 그 구역 건물을 알아야 한다 —
   * 위에서 만든 `buildingsByBlock`을 옛 마을 담과 나눠 쓴다.
   */
  const isMarket = (index: number) => zoneForBlock(index).id === "market";
  const marketBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter(isMarket)
    .map((index) => ({
      blockIndex: index,
      ...blockCenter(index),
      /*
       * 동쪽 이웃이 시장인가.
       *
       * **행이 넘어가는 것을 막아야 한다** — 한 줄의 오른쪽 끝(열 5)에서
       * `index + 1`은 다음 줄의 왼쪽 끝이다. 거기까지 시장이면 도로가 아니라
       * 월드를 가로질러 천막이 걸린다.
       */
      hasEastNeighbour:
        index % CITY.gridSize < CITY.gridSize - 1 && isMarket(index + 1),
      buildings: buildingsByBlock.get(index) ?? [],
    }));

  const market = buildMarket(marketBlocks, CITY.blockSize, CITY.roadWidth, random);
  marketCanopies.push(...market.canopies);
  marketStalls.push(...market.stalls);
  colliders.push(...market.colliders);

  const parkBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter((index) => zoneForBlock(index).id === "park")
    .map((index) => ({ blockIndex: index, ...blockCenter(index) }));
  const park = buildPark(parkBlocks);
  pondWater.push(...park.pondWater);
  pondRim.push(...park.pondRim);
  playground.push(...park.playground);
  parkPaths.push(...park.paths);
  colliders.push(...park.colliders);
  treeExclusions.push(...park.treeExclusions);

  /*
   * 발밑 잡초는 **맨 마지막**이다. 연못·놀이터 자리를 알아야 그 위를 피할 수
   * 있는데, 그 자리는 바로 위에서 정해진다.
   */
  const undergrowthBlocks = Array.from({ length: totalBlocks }, (_, index) => index)
    .filter((index) => !isUrbanBlock(index))
    .map((index) => ({
      blockIndex: index,
      zoneId: zoneForBlock(index).id,
      ...blockCenter(index),
      buildings: buildingsByBlock.get(index) ?? [],
    }));
  undergrowth.push(
    ...buildUndergrowth(undergrowthBlocks, CITY.blockSize, treeExclusions, random),
  );

  neon.push(
    ...buildNeon(buildings.filter((building) => zoneForBlock(building.blockIndex).id === "downtown")),
  );
  /*
   * 도로를 따라 놓이는 것들은 격자 치수와 구역 판정을 인자로 받는다
   * (`streetFurniture` 주석 — 순환을 피한 대가다).
   */
  const streetGrid: StreetGrid = {
    gridSize: CITY.gridSize,
    blockSize: CITY.blockSize,
    roadWidth: CITY.roadWidth,
    streetLightSpacing: CITY.streetLightSpacing,
    blockPitch,
    isUrbanAt: (x, z) => isUrbanBlock(blockIndexAt(x, z)),
    isUrbanBlock,
  };

  addStreetLights(props, colliders, streetLamps, grappleAnchors, halfExtent, streetGrid);
  addCrosswalks(crosswalks, halfExtent, streetGrid);

  const plaza = blockCenter(CITY.plazaBlockIndex);

  return {
    buildings,
    setbacks,
    props,
    crosswalks,
    streetLamps,
    rocks,
    stoneWalls,
    wallPlanters,
    wallGreens,
    alleySteps,
    alleyRails,
    gates,
    marketCanopies,
    marketStalls,
    pondWater,
    pondRim,
    playground,
    parkPaths,
    undergrowth,
    neon,
    treeExclusions,
    playSpots: park.playSpots,
    grappleAnchors,
    colliders,
    halfExtent,
    // 광장 한가운데에서 시작한다. 첫 화면이 벽을 보고 있으면 안 된다.
    spawn: { x: plaza.cx, y: 0, z: courtyardSpawnZ(plaza.cz, CITY.blockSize) },
  };
}

/** 광장 — 건물 대신 화단만 둔다. 첫 스폰 지점이라 시야가 열려 있어야 한다. */
function addPlaza(
  props: BoxInstance[],
  colliders: Aabb[],
  cx: number,
  cz: number,
  blockIndex: number,
  random: () => number,
): void {
  /*
   * 화단 고리는 구역 **중심**을 둘러싼다. 그런데 스폰은 담 앞으로 나가 있어서,
   * 고리의 한 짝이 시작 지점 바로 옆에 섰다 — 시작하자마자 동쪽으로 3.7m 가서
   * 막혔고 `terrainWalk` 검사가 그걸 잡았다. 시작 지점 둘레는 비운다.
   */
  const spawnZ = courtyardSpawnZ(cz, CITY.blockSize);

  const planterCount = 6;
  for (let i = 0; i < planterCount; i += 1) {
    const angle = (i / planterCount) * Math.PI * 2;
    const radius = CITY.blockSize * 0.33;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;

    /*
     * **난수를 먼저 뽑고 나서 건너뛴다.**
     *
     * `continue`를 위로 올렸더니 건너뛴 화단이 난수를 소비하지 않아 그 뒤에
     * 생성되는 도시 전체가 통째로 달라졌다 — 건물 높이도 공터 비율도 밀리고
     * 인스턴스가 171개 늘어 예산 검사 셋이 죽었다. 시드 배치에서 조건부
     * `continue`는 난수 소비 뒤에 둔다.
     */
    const size = 2.2 + random() * 0.8;
    if (Math.hypot(x - cx, z - spawnZ) < COURTYARD_SPAWN_CLEAR_RADIUS) continue;

    const height = 0.9;

    props.push({
      x,
      y: height / 2,
      z,
      width: size,
      height,
      depth: size,
      tone: 1,
      blockIndex,
    });
    colliders.push({
      minX: x - size / 2,
      maxX: x + size / 2,
      minZ: z - size / 2,
      maxZ: z + size / 2,
      // 건물과 같이 지면 높이 위다. 평지 기준으로 두면 언덕 위 화단의 윗면이
      // 지면 아래로 내려가 **올라설 수 없는데 막지도 못하는** 상자가 된다.
      top: terrainHeight(x, z) + height,
    });
  }
}

/**
 * 도로를 따라 가로등을 세운다.
 *
 * 얇고 높은 기둥은 속도감의 기준점이 된다. 빠르게 지나갈 때 옆으로 흘러가는
 * 수직선이 없으면 아무리 빨라도 느리게 느껴진다.
 */
/**
 * 높은 건물 위에 한 단 좁혀 올린다.
 *
 * 필지가 전부 직육면체 하나라 도시 실루엣이 톱니 없는 상자 밭이었다. 실제
 * 한국 도심에서도 일정 높이 위는 사선 제한(일조권)으로 뒤로 물러나고, 옥탑방·
 * 계단실이 한 단 더 올라앉는다. 그 한 단이 실루엣을 만든다.
 *
 * 낮은 건물에는 붙이지 않는다 — 3층짜리 위에 옥탑을 얹으면 건물이 아니라
 * 상자 두 개로 보인다.
 */
/**
 * 필지가 기울어 있을 때 건물을 얼마나 더 파묻어야 하는지(m).
 *
 * 네 모서리 중 가장 낮은 지점까지 내린다. 중심 높이만 보고 세우면 비탈
 * 아래쪽 모서리가 뜨고, 그 틈으로 도시 반대편이 보인다.
 *
 * 여유를 조금 더한다 — 모서리 사이(변의 한가운데)가 더 낮은 경우가 있고,
 * 그때 생기는 틈은 아주 얇아서 **화면에서 깜빡이는 선**으로만 보인다.
 */
function footprintSink(x: number, z: number, width: number, depth: number): number {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const center = terrainHeight(x, z);

  let lowest = center;
  for (const dx of [-halfWidth, halfWidth]) {
    for (const dz of [-halfDepth, halfDepth]) {
      lowest = Math.min(lowest, terrainHeight(x + dx, z + dz));
    }
  }

  return Math.max(0, center - lowest) + SINK_MARGIN;
}

/** 모서리만 재서 놓치는 만큼의 여유(m) */
const SINK_MARGIN = 0.35;

function addSetback(
  setbacks: BoxInstance[],
  colliders: Aabb[],
  base: BoxInstance,
  random: () => number,
): void {
  if (base.height < SETBACK.minBaseHeight) return;
  if (random() > SETBACK.chance) return;

  const shrink = SETBACK.minShrink + random() * (SETBACK.maxShrink - SETBACK.minShrink);
  const width = base.width * shrink;
  const depth = base.depth * shrink;
  const height = base.height * (SETBACK.minHeightRatio + random() * SETBACK.heightRatioSpread);

  /*
   * 가운데에서 살짝 비켜 세운다.
   *
   * 정확히 가운데면 어느 방향에서 보아도 대칭이라 「한 단 올렸다」가 아니라
   * 「위가 좁아졌다」로 보인다. 남는 여백의 절반까지만 민다 — 그 이상 밀면
   * 아래층 밖으로 나간다.
   */
  const slackX = (base.width - width) / 2;
  const slackZ = (base.depth - depth) / 2;
  const x = base.x + (random() - 0.5) * slackX;
  const z = base.z + (random() - 0.5) * slackZ;

  setbacks.push({
    x,
    y: base.height + height / 2,
    z,
    width,
    height,
    depth,
    tone: base.tone,
    blockIndex: base.blockIndex,
  });

  // 옥상에 올라섰을 때 통과하지 않게 한다. 아래층 안쪽이라 지면 통행에는 영향이 없다
  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    top: terrainHeight(x, z) + base.height + height,
  });
}
