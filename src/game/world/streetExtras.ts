/**
 * 거리 소품 보강 — 에어간판, 도로 횡단 현수막, 길가 실외기, 동네 게시판.
 *
 * streetProps.ts가 인도 후보 지점을 균등하게 훑으며 자판기·정류장·화분 같은
 * "어디에나 있는 것"을 놓는다면, 이 파일은 **놓이는 자리가 정해져 있는 것**을
 * 맡는다. 에어간판은 상가 앞 인도 모서리에, 횡단 현수막은 도로 위에, 게시판은
 * 구역 모퉁이에 선다. 후보 지점 확률 표에 섞으면 이 규칙이 사라진다.
 *
 * 새 인스턴스 배열을 만들지 않는다 — 전부 CityDetails의 기존 레이어에 합류하므로
 * 소품 종류가 늘어도 드로우콜은 그대로다.
 */

import { BANNER_TEXTS, PROP_CELL_INDEX } from "@/game/world/cityContent";
import { FIXTURE_TONE, type CityDetails, type DetailInstance } from "@/game/world/cityDetails";
import { CITY } from "@/game/world/cityLayout";
import { isUrbanBlock } from "@/game/world/zones";

const blockPitch = CITY.blockSize + CITY.roadWidth;
const gridOffset = (CITY.gridSize - 1) / 2;

/*
 * 인도 상판 높이.
 *
 * 값을 다시 적지 않는다 — `CITY.sidewalkHeight`가 정본이고, 거기에 「예전에
 * 양쪽에 0.16을 따로 적었다가 어긋난 적이 있어 여기로 올렸다」고 적혀 있다.
 * 소품 배치가 그 정리에서 빠져 있었다: 정본이 바뀌면 소품만 공중에 뜨거나
 * 보도에 파묻힌다.
 */
const SIDEWALK_TOP = CITY.sidewalkHeight;
/**
 * 소품을 놓는 모퉁이 좌표 (두 축 모두 이 값).
 *
 * 인도 위에서 소품이 들어갈 수 있는 띠는 생각보다 좁다. 구역 중심에서 잰
 * 점유 구간은 이렇다:
 *   건물 ~16.25 / 보행자 안쪽 트랙 16.89~17.31 / 보행자 바깥 트랙 17.69~18.11 /
 *   인도 상판 끝 19.0
 * 즉 쓸 수 있는 빈 띠는 17.31~17.69(0.38m)와 18.11~19.0(0.89m)뿐이다.
 * 앞의 것은 어떤 소품도 못 들어가므로 **연석 쪽 0.89m 띠**를 쓴다.
 *
 * 그리고 반드시 **모퉁이 대각**에 놓아야 한다. 변 한가운데의 연석 띠는 폭이
 * 0.89m뿐이지만, 모퉁이 바깥(x>18.11 이면서 z>18.11)은 보행자 궤도가 꺾여
 * 들어가므로 두 축 모두 비어 있는 주머니가 된다.
 */
const CORNER_LANE = CITY.blockSize / 2 + 1.6;
/**
 * 소품 발자국의 로컬 반폭 상한(m).
 *
 * CORNER_LANE(18.6)에서 이 값을 빼면 18.15로, 보행자 바깥 트랙의 바깥 면
 * 18.11보다 크다. 이 상한을 넘기는 소품을 추가하면 보행자를 관통한다.
 */
const CORNER_FOOTPRINT_LIMIT = 0.4;
/**
 * 모퉁이 소품이 가질 수 있는 최대 폭.
 *
 * 상수로 두는 것만으로는 지켜지지 않아 실제 치수를 여기서 유도한다. 소품을
 * 추가할 때 이 값을 쓰면 보행자 관통과 연석 이탈이 구조적으로 막힌다.
 */
const CORNER_MAX_WIDTH = CORNER_FOOTPRINT_LIMIT * 2;

/** 도로 횡단 현수막 높이. 전깃줄(4.6m)보다 낮게 걸어 서로 겹치지 않게 한다 */
const CROSS_BANNER_Y = 4.15;
/** 에어간판 마디 하나의 길이 */
const DANCER_SEGMENT_HEIGHT = 1.3;

/** 소품이 서는 지점. angle은 소품이 도로를 바라보는 방향이다. */
interface Site {
  x: number;
  z: number;
  angle: number;
  blockIndex: number;
}

/**
 * 로컬 좌표를 월드로 옮겨 배열에 넣는다.
 *
 * 소품 조각은 전부 "도로를 바라보는 로컬 좌표"로 적는다. 조각마다 삼각함수를
 * 다시 쓰면 소품 하나 추가할 때마다 부호를 틀린다.
 */
function place(
  target: DetailInstance[],
  site: Site,
  local: {
    dx?: number;
    dz?: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    tone: number;
    cell?: number;
    tiltZ?: number;
  },
): void {
  const sin = Math.sin(site.angle);
  const cos = Math.cos(site.angle);
  const dx = local.dx ?? 0;
  const dz = local.dz ?? 0;

  target.push({
    x: site.x + dx * cos + dz * sin,
    y: local.y,
    z: site.z - dx * sin + dz * cos,
    width: local.width,
    height: local.height,
    depth: local.depth,
    tone: local.tone,
    blockIndex: site.blockIndex,
    rotationY: site.angle,
    cell: local.cell,
    tiltZ: local.tiltZ,
  });
}

/**
 * 에어간판(풍선간판).
 *
 * 실제로는 바람에 흔들리지만 여기서는 세 마디를 점점 크게 꺾은 정지 포즈로
 * 만든다. 흔들림을 넣으려면 매 프레임 인스턴스 행렬을 다시 써야 해서 인스턴싱의
 * 이점이 사라진다 — 실루엣만으로도 무엇인지 바로 알아본다.
 */
function addAirDancer(details: CityDetails, site: Site, random: () => number): void {
  place(details.streetFixtures, site, {
    y: SIDEWALK_TOP + 0.18,
    width: 0.78,
    height: 0.36,
    depth: 0.78,
    tone: FIXTURE_TONE.darkMetal,
  });

  /*
   * 꺾이는 방향을 좌우로 섞는다. 전부 같은 쪽으로 휘면 복사한 티가 난다.
   *
   * 위 마디는 로컬 x로 최대 0.96까지 뻗어 CORNER_FOOTPRINT_LIMIT을 넘지만,
   * 바닥에서 3.1m 위라 보행자(키 약 1.7m)와 만나지 않는다. 발자국 상한은
   * 사람 높이 안에 있는 부분에만 적용된다.
   */
  const lean = random() < 0.5 ? 1 : -1;
  const segments = [
    { dx: 0.0, tilt: 0.14 },
    { dx: 0.26, tilt: 0.38 },
    { dx: 0.74, tilt: 0.68 },
  ];

  segments.forEach((segment, index) => {
    place(details.streetFixtures, site, {
      dx: lean * segment.dx,
      y: SIDEWALK_TOP + 0.36 + DANCER_SEGMENT_HEIGHT * (index + 0.5),
      width: 0.44,
      height: DANCER_SEGMENT_HEIGHT,
      depth: 0.44,
      tone: index % 2 === 0 ? FIXTURE_TONE.airDancerWarm : FIXTURE_TONE.airDancerCool,
      tiltZ: -lean * segment.tilt,
    });
  });
}

/**
 * 길가 실외기 — 벽에 못 붙인 것은 인도에 그냥 놓인다. 그릴 패널로 정체를 준다.
 *
 * 폭 0.8은 임의로 고른 값이 아니다. 반폭 0.4가 CORNER_FOOTPRINT_LIMIT과 같아,
 * 보행자 바깥 트랙(18.11)도 인도 끝(19.0)도 건드리지 않는 최대 크기다.
 */
function addGroundAcUnit(details: CityDetails, site: Site): void {
  place(details.streetFixtures, site, {
    y: SIDEWALK_TOP + 0.39,
    width: CORNER_MAX_WIDTH,
    height: 0.78,
    depth: 0.52,
    tone: FIXTURE_TONE.lightMetal,
  });
  place(details.propPanels, site, {
    dz: 0.29,
    y: SIDEWALK_TOP + 0.39,
    width: 0.7,
    height: 0.64,
    depth: 0.05,
    tone: 0,
    cell: PROP_CELL_INDEX.acGrill,
  });
}

/**
 * 동네 게시판 — 반상회 공지가 붙은 그 판. 사람이 사는 동네라는 신호다.
 *
 * 실제 게시판보다 좁다. 연석 띠(0.89m)에 들어가야 해서 폭을 0.8로 묶었다.
 * 기둥 간격도 마찬가지 이유로 좁다 — 기둥 바깥 면이 판보다 튀어나오면 안 된다.
 */
function addNoticeBoard(details: CityDetails, site: Site): void {
  for (const side of [-1, 1]) {
    place(details.streetFixtures, site, {
      dx: side * 0.33,
      y: SIDEWALK_TOP + 0.6,
      width: 0.09,
      height: 1.2,
      depth: 0.09,
      tone: FIXTURE_TONE.darkMetal,
    });
  }
  place(details.propPanels, site, {
    y: SIDEWALK_TOP + 1.5,
    width: CORNER_MAX_WIDTH,
    height: 1.1,
    depth: 0.08,
    tone: 0,
    cell: PROP_CELL_INDEX.noticeBoard,
  });
}

/**
 * 구역 네 모퉁이의 배치 지점.
 *
 * 모퉁이는 두 방향 시선이 모두 닿는 자리라 소품 하나가 가장 잘 보인다.
 * 에어간판처럼 키 큰 것을 여기에 세우면 골목 입구가 눈에 띄게 된다.
 *
 * 두 좌표 모두 CORNER_LANE을 쓴다(대각). 변 한가운데에 놓으면 한 축만 비어
 * 있어서 보행자 궤도와 0.1m 차이로 스치지만, 대각 모퉁이는 두 축이 동시에
 * 비어 있는 주머니라 여유가 생긴다.
 *
 * 네 모퉁이가 각각 다른 거리를 바라보게 한다. 전부 같은 방향을 보면 소품
 * 앞면이 한쪽에서만 보이고 반대편 골목에서는 뒤통수만 보인다.
 */
function cornerSites(blockIndex: number): Site[] {
  const cx = ((blockIndex % CITY.gridSize) - gridOffset) * blockPitch;
  const cz = (Math.floor(blockIndex / CITY.gridSize) - gridOffset) * blockPitch;

  return [
    { x: cx + CORNER_LANE, z: cz + CORNER_LANE, angle: 0, blockIndex },
    { x: cx + CORNER_LANE, z: cz - CORNER_LANE, angle: Math.PI / 2, blockIndex },
    { x: cx - CORNER_LANE, z: cz - CORNER_LANE, angle: Math.PI, blockIndex },
    { x: cx - CORNER_LANE, z: cz + CORNER_LANE, angle: -Math.PI / 2, blockIndex },
  ];
}

/**
 * 도로를 가로지르는 현수막.
 *
 * 머리 위를 지나가는 천이 하나 있으면 골목이 훨씬 좁고 빽빽하게 느껴진다.
 * 폭이 도로를 따라 놓이도록 축마다 회전을 다르게 준다 — 90도를 틀리면 현수막이
 * 도로와 나란히 누워 글자가 보이지 않는다.
 */
function addCrossStreetBanners(
  details: CityDetails,
  halfExtent: number,
  random: () => number,
): void {
  const roadCenterFromBlock = CITY.blockSize / 2 + CITY.roadWidth / 2;
  const span = CITY.roadWidth * 0.86;

  for (let g = 0; g < CITY.gridSize; g += 1) {
    const roadAxis = (g - gridOffset) * blockPitch + roadCenterFromBlock;
    if (Math.abs(roadAxis) > halfExtent) continue;

    for (let b = 0; b < CITY.gridSize; b += 1) {
      const along = (b - gridOffset) * blockPitch;
      if (random() > 0.45) continue;

      // 세로 도로 위 — 폭이 X를 따라가고 글자 면이 도로를 마주 본다
      details.banners.push({
        x: roadAxis,
        y: CROSS_BANNER_Y,
        z: along,
        width: span,
        height: 0.85,
        depth: 0.06,
        tone: 0,
        blockIndex: g,
        cell: Math.floor(random() * BANNER_TEXTS.length),
      });

      if (random() > 0.5) continue;

      // 가로 도로 위 — 90도 돌려 폭이 Z를 따라가게 한다
      details.banners.push({
        x: along,
        y: CROSS_BANNER_Y,
        z: roadAxis,
        width: span,
        height: 0.85,
        depth: 0.06,
        tone: 0,
        blockIndex: g,
        rotationY: Math.PI / 2,
        cell: Math.floor(random() * BANNER_TEXTS.length),
      });
    }
  }
}

/**
 * 모퉁이 소품과 횡단 현수막을 배치한다.
 *
 * 구역마다 모퉁이 네 곳 중 일부만 채운다. 네 곳을 다 채우면 모든 골목 입구가
 * 똑같아져서 오히려 인공적으로 보인다.
 */
export function addStreetExtras(
  details: CityDetails,
  halfExtent: number,
  random: () => number,
): void {
  const totalBlocks = CITY.gridSize * CITY.gridSize;

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    // 에어간판·실외기·게시판은 상가가 있어야 성립한다 (streetProps의 같은 이유)
    if (!isUrbanBlock(blockIndex)) continue;

    for (const site of cornerSites(blockIndex)) {
      if (Math.abs(site.x) > halfExtent || Math.abs(site.z) > halfExtent) continue;

      const roll = random();
      if (roll < 0.28) addAirDancer(details, site, random);
      else if (roll < 0.52) addGroundAcUnit(details, site);
      else if (roll < 0.66) addNoticeBoard(details, site);
      // 나머지는 비워 둔다.
    }
  }

  addCrossStreetBanners(details, halfExtent, random);
}
