/**
 * 인도 위에 서는 소품 — 절차적 배치.
 *
 * cityDetails가 "건물에 붙는 것"을 맡고, 이 파일은 "바닥에 서는 것"을 맡는다.
 * 자판기, 버스정류장, 포장마차, 쓰레기통, 화분, 콘, 입간판.
 *
 * 이것들이 도시를 사람 사는 곳으로 만든다. 건물만 있으면 조감도이고,
 * 인도에 물건이 놓여 있어야 걸어 다닐 수 있는 거리로 읽힌다.
 *
 * 모든 결과는 CityDetails의 기존 레이어(streetFixtures / propPanels / awnings /
 * signsHorizontal)에 합류한다. 새 레이어를 만들지 않는 이유는 드로우콜 때문이다 —
 * 같은 재질로 그릴 수 있는 것은 같은 인스턴스 묶음에 넣는다.
 */

import { AWNING_STRIPE_METERS, PROP_CELL_INDEX } from "@/game/world/cityContent";
import {
  FIXTURE_TONE,
  SIDEWALK_EDGE,
  type CityDetails,
  type DetailInstance,
} from "@/game/world/cityDetails";
import { CITY } from "@/game/world/cityLayout";
import { isUrbanBlock, zoneForBlock } from "@/game/world/zones";

const blockPitch = CITY.blockSize + CITY.roadWidth;

/*
 * 인도 상판 높이.
 *
 * 값을 다시 적지 않는다 — `CITY.sidewalkHeight`가 정본이고, 거기에 「예전에
 * 양쪽에 0.16을 따로 적었다가 어긋난 적이 있어 여기로 올렸다」고 적혀 있다.
 * 소품 배치가 그 정리에서 빠져 있었다: 정본이 바뀌면 소품만 공중에 뜨거나
 * 보도에 파묻힌다.
 */
const SIDEWALK_TOP = CITY.sidewalkHeight;
/** 소품을 놓을 후보 지점 간격(m). 촘촘하면 인스턴스가 폭발하고, 멀면 휑하다. */
const PROP_SPACING = 11;
/** 인도 안쪽 여백. 벽에 딱 붙이면 간판·차양과 겹친다. */
const INNER_INSET = 1.5;

/** 소품 종류별 등장 확률. 누적 합이 1보다 작아 나머지는 빈 자리로 남는다. */
const PROP_WEIGHTS = {
  vendingMachine: 0.2,
  busStop: 0.1,
  foodStall: 0.1,
  trashBin: 0.16,
  planter: 0.2,
  standingSign: 0.14,
  cones: 0.1,
} as const;

/**
 * 한 지점의 배치 정보.
 *
 * angle은 소품이 **도로를 향하는** 방향이다. 자판기 앞면이 건물 벽을 보고 있으면
 * 아무리 잘 그려도 보이지 않는다.
 */
interface Slot {
  x: number;
  z: number;
  angle: number;
  blockIndex: number;
}

function pushBox(
  target: DetailInstance[],
  slot: Slot,
  box: {
    dx?: number;
    dz?: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    tone: number;
    cell?: number;
    tiltX?: number;
    uvRepeatX?: number;
  },
): void {
  // 로컬 오프셋을 소품이 바라보는 방향 기준으로 회전시켜 월드 좌표로 옮긴다.
  const sin = Math.sin(slot.angle);
  const cos = Math.cos(slot.angle);
  const dx = box.dx ?? 0;
  const dz = box.dz ?? 0;

  target.push({
    x: slot.x + dx * cos + dz * sin,
    y: box.y,
    z: slot.z - dx * sin + dz * cos,
    width: box.width,
    height: box.height,
    depth: box.depth,
    tone: box.tone,
    blockIndex: slot.blockIndex,
    rotationY: slot.angle,
    cell: box.cell,
    tiltX: box.tiltX,
    uvRepeatX: box.uvRepeatX,
  });
}

/**
 * 자판기.
 *
 * 몸통 상자 + 앞면 패널(아틀라스 셀). 패널을 몸통보다 아주 조금 앞에 두어야
 * z-fighting이 나지 않는다.
 */
function addVendingMachine(details: CityDetails, slot: Slot, random: () => number): void {
  const width = 1.1;
  const height = 1.9;
  const depth = 0.75;

  // 상호작용이 읽을 좌표. 렌더와 같은 자리에서 채워야 어긋나지 않는다.
  details.vendingMachines.push({ x: slot.x, z: slot.z });

  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + height / 2,
    width,
    height,
    depth,
    tone: FIXTURE_TONE.darkMetal,
  });

  const cells = [
    PROP_CELL_INDEX.drinkVendor,
    PROP_CELL_INDEX.coffeeVendor,
    PROP_CELL_INDEX.snackVendor,
  ];
  pushBox(details.propPanels, slot, {
    dz: depth / 2 + 0.03,
    y: SIDEWALK_TOP + height / 2 + 0.1,
    width: width * 0.9,
    height: height * 0.8,
    depth: 0.06,
    tone: 0,
    cell: cells[Math.floor(random() * cells.length)],
  });
}

/**
 * 버스정류장.
 *
 * 기둥 둘 + 지붕 + 노선도 패널. 지붕을 천막 레이어(awnings)에 넣으면 같은
 * 재질로 묶여 드로우콜이 늘지 않는다.
 */
function addBusStop(details: CityDetails, slot: Slot): void {
  const width = 3.4;
  const postHeight = 2.5;

  for (const side of [-1, 1]) {
    pushBox(details.streetFixtures, slot, {
      dx: (side * width) / 2,
      y: SIDEWALK_TOP + postHeight / 2,
      width: 0.14,
      height: postHeight,
      depth: 0.14,
      tone: FIXTURE_TONE.darkMetal,
    });
  }

  pushBox(details.awnings, slot, {
    y: SIDEWALK_TOP + postHeight + 0.06,
    width: width + 0.5,
    height: 0.12,
    depth: 1.5,
    tone: 3,
    uvRepeatX: Math.round((width + 0.5) / AWNING_STRIPE_METERS),
  });

  pushBox(details.propPanels, slot, {
    dx: -width / 2 + 0.6,
    y: SIDEWALK_TOP + 1.35,
    width: 1.0,
    height: 1.5,
    depth: 0.08,
    tone: 0,
    cell: PROP_CELL_INDEX.busRouteMap,
  });
}

/**
 * 포장마차.
 *
 * 나무 매대 + 주황 천막. 천막이 살짝 기울어야 천처럼 보인다 — 수평이면 판자다.
 */
function addFoodStall(details: CityDetails, slot: Slot): void {
  const width = 2.6;
  const counterHeight = 1.0;

  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + counterHeight / 2,
    width,
    height: counterHeight,
    depth: 1.1,
    tone: FIXTURE_TONE.wood,
  });

  for (const side of [-1, 1]) {
    pushBox(details.streetFixtures, slot, {
      dx: (side * width) / 2,
      y: SIDEWALK_TOP + 1.1,
      width: 0.09,
      height: 2.2,
      depth: 0.09,
      tone: FIXTURE_TONE.darkMetal,
    });
  }

  pushBox(details.awnings, slot, {
    y: SIDEWALK_TOP + 2.2,
    width: width + 0.7,
    height: 0.12,
    depth: 1.7,
    tone: 0,
    tiltX: 0.2,
    uvRepeatX: Math.round((width + 0.7) / AWNING_STRIPE_METERS),
  });
}

function addTrashBin(details: CityDetails, slot: Slot): void {
  const height = 0.95;
  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + height / 2,
    width: 0.6,
    height,
    depth: 0.6,
    tone: FIXTURE_TONE.plasticGreen,
  });
  // 뚜껑을 살짝 넓게 얹으면 통이 그냥 상자로 보이지 않는다.
  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + height + 0.04,
    width: 0.68,
    height: 0.08,
    depth: 0.68,
    tone: FIXTURE_TONE.darkMetal,
  });
}

function addPlanter(details: CityDetails, slot: Slot, random: () => number): void {
  const size = 0.9 + random() * 0.4;
  const boxHeight = 0.55;

  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + boxHeight / 2,
    width: size,
    height: boxHeight,
    depth: size,
    tone: FIXTURE_TONE.concrete,
  });
  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + boxHeight + size * 0.35,
    width: size * 0.95,
    height: size * 0.8,
    depth: size * 0.95,
    tone: FIXTURE_TONE.foliage,
  });
}

/** 입간판 — 인도에 세워 두는 A형 간판. 벽 간판과 같은 아틀라스를 쓴다. */
function addStandingSign(
  details: CityDetails,
  slot: Slot,
  random: () => number,
  brandCount: number,
): void {
  const height = 1.2;
  pushBox(details.signsHorizontal, slot, {
    y: SIDEWALK_TOP + height / 2 + 0.1,
    width: 0.8,
    height,
    depth: 0.1,
    tone: 0,
    cell: Math.floor(random() * brandCount),
    tiltX: 0.12,
  });
  pushBox(details.streetFixtures, slot, {
    y: SIDEWALK_TOP + 0.05,
    width: 0.85,
    height: 0.1,
    depth: 0.5,
    tone: FIXTURE_TONE.darkMetal,
  });
}

function addCones(details: CityDetails, slot: Slot, random: () => number): void {
  const count = 2 + Math.floor(random() * 2);
  for (let i = 0; i < count; i += 1) {
    pushBox(details.streetFixtures, slot, {
      dx: (i - (count - 1) / 2) * 0.7,
      y: SIDEWALK_TOP + 0.3,
      width: 0.34,
      height: 0.6,
      depth: 0.34,
      tone: FIXTURE_TONE.cone,
    });
  }
}

/**
 * 인도 가장자리를 따라 후보 지점을 만든다.
 *
 * 도로 쪽 가장자리에서 안쪽으로 조금 들어온 선 위에 놓는다. 실제 거리에서
 * 자판기와 정류장이 차도와 건물 사이에 서 있는 위치다.
 */
function collectSlots(halfExtent: number): Slot[] {
  const slots: Slot[] = [];
  const offset = (CITY.gridSize - 1) / 2;
  const edge = SIDEWALK_EDGE - INNER_INSET;

  for (let index = 0; index < CITY.gridSize * CITY.gridSize; index += 1) {
    const cx = ((index % CITY.gridSize) - offset) * blockPitch;
    const cz = (Math.floor(index / CITY.gridSize) - offset) * blockPitch;

    for (let t = -edge + 3; t <= edge - 3; t += PROP_SPACING) {
      // 구역의 네 변. angle은 소품이 도로를 향하는 방향이다.
      slots.push({ x: cx + t, z: cz + edge, angle: 0, blockIndex: index });
      slots.push({ x: cx + t, z: cz - edge, angle: Math.PI, blockIndex: index });
      slots.push({ x: cx + edge, z: cz + t, angle: Math.PI / 2, blockIndex: index });
      slots.push({ x: cx - edge, z: cz + t, angle: -Math.PI / 2, blockIndex: index });
    }
  }

  // 월드 밖으로 새는 지점은 버린다.
  return slots.filter((slot) => Math.abs(slot.x) < halfExtent && Math.abs(slot.z) < halfExtent);
}

/**
 * 인도 소품을 배치한다.
 *
 * 모든 후보 지점을 채우면 거리가 창고가 된다. 확률로 걸러 절반 가까이는 비운다 —
 * 빈 곳이 있어야 채워진 곳이 눈에 들어온다.
 */
export function addStreetProps(
  details: CityDetails,
  halfExtent: number,
  random: () => number,
  brandCount = 8,
): void {
  for (const slot of collectSlots(halfExtent)) {
    /*
     * 옛 마을에는 자판기도 놓지 않는다.
     *
     * 담을 구역 가장자리로 내보내면서 자판기가 담 **안에 박혔다**(`worldConsistency`가
     * 잡았다). 자리를 비켜 놓을 수도 있지만, 애초에 돌담과 홍살문을 세운 마을에
     * 자판기가 붙어 있는 것이 1번 항목에서 걷어낸 바로 그 모양이다.
     */
    if (zoneForBlock(slot.blockIndex).id === "shrine") continue;

    const roll = random();
    let threshold = 0;

    threshold += PROP_WEIGHTS.vendingMachine;
    if (roll < threshold) {
      addVendingMachine(details, slot, random);
      continue;
    }

    /*
     * 나머지 자연 구역에는 **자판기까지만** 놓는다.
     *
     * 정류장·포장마차·쓰레기통·콘은 도시가 놓은 것이라 숲에 서 있으면 나무를
     * 아무리 심어도 「나무를 심은 길거리」로 보인다. 그래서 걷어냈는데, 전부
     * 걷어냈더니 **먼 쪽에 회복 수단이 사라졌다** — 자판기 음료가 유일한
     * 회복이라 숲·해안까지 나가면 돌아올 방법이 없어진다(`vending` 검사가 잡았다).
     *
     * 자판기만 남기는 것은 타협이 아니라 맞는 답이기도 하다. 등산로 초입과
     * 해수욕장에는 실제로 자판기가 있다.
     */
    if (!isUrbanBlock(slot.blockIndex)) continue;

    threshold += PROP_WEIGHTS.busStop;
    if (roll < threshold) {
      addBusStop(details, slot);
      continue;
    }

    threshold += PROP_WEIGHTS.foodStall;
    if (roll < threshold) {
      addFoodStall(details, slot);
      continue;
    }

    threshold += PROP_WEIGHTS.trashBin;
    if (roll < threshold) {
      addTrashBin(details, slot);
      continue;
    }

    threshold += PROP_WEIGHTS.planter;
    if (roll < threshold) {
      addPlanter(details, slot, random);
      continue;
    }

    threshold += PROP_WEIGHTS.standingSign;
    if (roll < threshold) {
      addStandingSign(details, slot, random, brandCount);
      continue;
    }

    threshold += PROP_WEIGHTS.cones;
    if (roll < threshold) {
      addCones(details, slot, random);
    }
    /*
     * 「나머지는 비워 둔다」고 적혀 있었지만 **비는 자리가 없다** — 가중치
     * 합이 정확히 1이라 마지막 갈래가 남은 것을 전부 받는다. 자리마다
     * 무언가가 선다.
     *
     * 빈 자리를 두고 싶으면 합을 1보다 작게 만들면 된다(그러면 이 줄 아래로
     * 떨어지는 굴림이 생긴다). 지금 그렇게 하지 않은 것은 **화면을 보고
     * 정할 일**이라서다 — 거리가 빽빽한지 허전한지는 사람이 답한다.
     */
  }
}
