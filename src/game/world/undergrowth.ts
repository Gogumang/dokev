/**
 * 덤불·바위·들꽃 — 자연 구역의 발밑.
 *
 * 나무를 심고 잔디를 깔았는데도 자연 구역 바닥이 **매끈한 초록 판**이었다.
 * 나무는 머리 위에 있고 잔디는 무늬라, 발밑에는 아무것도 없었다.
 *
 * 실제로 숲을 걸을 때 눈에 들어오는 것의 대부분은 나무가 아니라 **무릎
 * 아래**다 — 덤불, 튀어나온 바위, 마른 풀포기. 그게 없으면 달릴 때 속도가
 * 느껴지지 않는다: 지나가는 것이 없으면 지나가고 있다는 감각도 없다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다
 * (`zones.ts` 주석). 치수는 인자로 받고 타입만 가져온다.
 */

import type { BoxInstance } from "@/game/world/cityLayout";
import type { TreeExclusion } from "@/game/world/park";
import type { ZoneId } from "@/game/world/zones";

export interface UndergrowthBlock {
  blockIndex: number;
  zoneId: ZoneId;
  cx: number;
  cz: number;
  /** 그 구역 건물. 벽 안에 덤불이 나면 건물이 반쯤 파묻힌 것으로 보인다 */
  buildings: readonly BoxInstance[];
}

/** 팔레트 인덱스 — 렌더의 `UNDERGROWTH_PALETTE` 순서와 반드시 같아야 한다 */
const TONE = {
  leafDark: 0,
  leafLight: 1,
  rock: 2,
  flowerWarm: 3,
  flowerCool: 4,
  dryGrass: 5,
  azaleaLight: 6,
  azaleaDeep: 7,
} as const;

type Kind = "bush" | "rock" | "flower" | "dry" | "azalea";

/** 비율을 훑는 순서 — `pick`과 `MIX`가 같은 목록을 봐야 한다 */
const KINDS = ["bush", "rock", "flower", "dry", "azalea"] as const;

/**
 * 철쭉 한 무더기의 덩어리 수.
 *
 * 하나로 두면 분홍 공 하나다. 실제 철쭉은 **무더기**로 피고, 참고 화면에서
 * 담 아래를 채우는 것도 덩어리 하나가 아니라 한 무더기다. 겹쳐 놓아야
 * 윤곽이 울퉁불퉁해져 꽃덤불로 읽힌다(나무 수관과 같은 이유).
 */
const AZALEA_LOBES = 4;

/**
 * 철쭉 무더기가 중심에서 뻗는 최대 거리(m).
 *
 * 무더기는 곁덩어리가 밖으로 흩어지므로 **중심만 검사하면 모자란다.**
 * 실제로 연못 자리를 비워 두었는데 곁덩어리 하나가 물 위로 삐져나갔고,
 * `undergrowth` 검사가 잡았다 — 다른 것들은 폭이 1.5m를 넘지 않아 그동안
 * 중심 검사만으로 충분했다.
 */
const AZALEA_REACH = 1.9;

/**
 * 구역마다 무엇이 얼마나 나는지.
 *
 * `weights`는 **누적이 아니라 비율**이다. 숲은 덤불이 절반 넘고, 해안은
 * 바위와 마른 풀이 대부분이다 — 같은 물건을 밀도만 달리해 뿌리면 「초록이
 * 짙은 공원」이지 숲이 아니다.
 *
 * `perBlock`은 구역 하나에 뿌리는 수다. 저사양 시야(5x5 구역)에서 인스턴스
 * 상한(4,000)을 넘지 않도록 잡았다 — 숲 60개면 25구역이 전부 숲이어도
 * 1,500개다.
 */
const MIX: Record<string, { perBlock: number; weights: Record<Kind, number> }> = {
  forest: {
    perBlock: 60,
    weights: { bush: 0.5, rock: 0.22, flower: 0.04, dry: 0.18, azalea: 0.06 },
  },
  park: { perBlock: 44, weights: { bush: 0.3, rock: 0.08, flower: 0.34, dry: 0.1, azalea: 0.18 } },
  /*
   * 옛 마을에 가장 많이 둔다.
   *
   * 벚꽃은 머리 위에 있어 올려다볼 때만 보인다. 참고 화면의 분홍은 절반이
   * **눈높이**에 있다 — 담 아래를 채운 철쭉 무더기다. 이 구역에는 돌담이
   * 있으므로 그 그림이 그대로 나온다.
   */
  shrine: {
    perBlock: 30,
    weights: { bush: 0.12, rock: 0.34, flower: 0.04, dry: 0.22, azalea: 0.28 },
  },
  coast: {
    perBlock: 26,
    weights: { bush: 0.06, rock: 0.48, flower: 0.02, dry: 0.42, azalea: 0.02 },
  },
};

/**
 * 건물·연못·놀이터에서 띄우는 여백(m).
 *
 * 덤불은 나무보다 훨씬 작으므로 나무만큼 띄울 이유가 없다. 다만 **0이면 벽에
 * 반쯤 박힌 덤불**이 생기는데, 작아서 눈에 안 띄는 게 아니라 오히려 벽에
 * 얼룩처럼 붙어 보인다.
 */
const CLEARANCE = 1.1;

/** 구역 가장자리에서 띄우는 여백(m). 인도·도로로 삐져나오면 도시가 지저분해진다 */
const EDGE_INSET = 2.6;

/**
 * 자연 구역 바닥에 덤불·바위·들꽃을 뿌린다.
 *
 * 겹침을 막는 격자 해시를 쓰지 않는다 — 나무(`trees.ts`)와 달리 이쪽은
 * **겹쳐도 된다.** 덤불 두 무더기가 붙으면 큰 덤불 하나로 보이지, 나무처럼
 * 같은 자리에 두 그루가 선 것으로 보이지 않는다.
 */
export function buildUndergrowth(
  blocks: readonly UndergrowthBlock[],
  blockSize: number,
  exclusions: readonly TreeExclusion[],
  random: () => number,
): BoxInstance[] {
  const items: BoxInstance[] = [];
  const half = blockSize / 2 - EDGE_INSET;

  for (const block of blocks) {
    const mix = MIX[block.zoneId];
    if (!mix) continue;

    for (let i = 0; i < mix.perBlock; i += 1) {
      const x = block.cx + (random() - 0.5) * 2 * half;
      const z = block.cz + (random() - 0.5) * 2 * half;

      const insideBuilding = block.buildings.some(
        (b) =>
          Math.abs(x - b.x) < b.width / 2 + CLEARANCE &&
          Math.abs(z - b.z) < b.depth / 2 + CLEARANCE,
      );
      if (insideBuilding) continue;

      // 연못 수면 위에 덤불이 나면 물에 심은 화분이 된다
      const excluded = exclusions.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spot.radius);
      if (excluded) continue;

      const kind = pick(mix.weights, random());
      /*
       * 무더기는 넓다 — 중심이 통과해도 곁덩어리가 물이나 미끄럼틀 위로
       * 나갈 수 있다. 그 폭만큼 다시 본다.
       */
      if (kind === "azalea" && !hasRoom(x, z, block, exclusions, AZALEA_REACH)) continue;

      push(items, block.blockIndex, x, z, kind, random);
    }
  }

  return items;
}

/** 그 자리에 `reach`만큼 더 넓게 자리가 있는가 */
function hasRoom(
  x: number,
  z: number,
  block: UndergrowthBlock,
  exclusions: readonly { x: number; z: number; radius: number }[],
  reach: number,
): boolean {
  const intoBuilding = block.buildings.some(
    (b) =>
      Math.abs(x - b.x) < b.width / 2 + CLEARANCE + reach &&
      Math.abs(z - b.z) < b.depth / 2 + CLEARANCE + reach,
  );
  if (intoBuilding) return false;

  return !exclusions.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spot.radius + reach);
}

/** 비율대로 하나 고른다. 누적해 가며 넘어서는 지점이 답이다 */
function pick(weights: Record<Kind, number>, roll: number): Kind {
  let running = 0;
  for (const kind of KINDS) {
    running += weights[kind];
    if (roll < running) return kind;
  }
  // 비율 합이 1에 조금 못 미쳐도 마지막으로 떨어지게 둔다
  return "dry";
}

function push(
  items: BoxInstance[],
  blockIndex: number,
  x: number,
  z: number,
  kind: Kind,
  random: () => number,
): void {
  /*
   * 철쭉만 무더기다. 한 덩어리로 두면 분홍 공 하나가 잔디에 놓인 것으로
   * 보인다 — 겹쳐 놓아야 꽃덤불이 된다.
   */
  if (kind === "azalea") {
    for (let lobe = 0; lobe < AZALEA_LOBES; lobe += 1) {
      const isCore = lobe === 0;
      const shape = SHAPES.azalea(random);
      const size = isCore ? 1 : 0.55 + random() * 0.35;
      const spread = isCore ? 0 : shape.width * 0.6;
      pushBlob(
        items,
        blockIndex,
        x + (random() - 0.5) * spread * 2,
        z + (random() - 0.5) * spread * 2,
        {
          ...shape,
          width: shape.width * size,
          height: shape.height * size,
          depth: shape.depth * size,
        },
      );
    }
    return;
  }

  pushBlob(items, blockIndex, x, z, SHAPES[kind](random));
}

function pushBlob(
  items: BoxInstance[],
  blockIndex: number,
  x: number,
  z: number,
  shape: { width: number; height: number; depth: number; tone: number },
): void {
  items.push({
    x,
    y: shape.height / 2,
    z,
    width: shape.width,
    height: shape.height,
    depth: shape.depth,
    tone: shape.tone,
    blockIndex,
    /*
     * 땅에 파묻는다.
     *
     * 둥근 덩어리는 아래쪽이 좁아 지면과 닿는 자리가 점이 된다 — 파묻지
     * 않으면 **공에 가까운 것이 잔디 위에 얹혀** 있는 것으로 보인다.
     * 비탈에서 뜨는 것도 같이 막힌다.
     */
    sink: shape.height * 0.45,
  });
}

/**
 * 종류별 크기와 색.
 *
 * 높이가 성격을 정한다. 덤불은 무릎(0.6~1.1m), 바위는 정강이(0.35~0.8m),
 * 들꽃과 마른 풀은 발목(0.25~0.5m)이다. 셋이 같은 높이면 색만 다른 같은
 * 물건이 흩어진 것으로 보인다.
 */
const SHAPES: Record<
  Kind,
  (random: () => number) => {
    width: number;
    height: number;
    depth: number;
    tone: number;
  }
> = {
  bush: (random) => {
    const size = 0.75 + random() * 0.7;
    return {
      width: size,
      // 옆으로 퍼지게 눌러야 덤불이지, 둥글면 작은 나무가 된다
      height: size * (0.7 + random() * 0.25),
      depth: size * (0.82 + random() * 0.3),
      tone: random() < 0.55 ? TONE.leafDark : TONE.leafLight,
    };
  },
  rock: (random) => {
    const size = 0.5 + random() * 0.65;
    return {
      width: size,
      height: size * (0.6 + random() * 0.3),
      // 앞뒤로 다르게 — 정사각 단면은 어느 각도에서 봐도 같아 공처럼 보인다
      depth: size * (0.7 + random() * 0.5),
      tone: TONE.rock,
    };
  },
  flower: (random) => {
    const size = 0.28 + random() * 0.22;
    return {
      width: size,
      height: size * (1 + random() * 0.5),
      depth: size,
      tone: random() < 0.5 ? TONE.flowerWarm : TONE.flowerCool,
    };
  },
  /**
   * 철쭉 — 낮고 **넓다.**
   *
   * 덤불(0.75~1.45m 폭)보다 넓고 낮게 잡는다. 실제 철쭉이 그렇기도 하고,
   * 무엇보다 **눈높이 아래에서 옆으로 번져야** 담 아래를 메운 것으로 보인다.
   * 위로 서면 꽃나무 묘목이 된다.
   */
  azalea: (random) => {
    const size = 1.15 + random() * 0.6;
    return {
      width: size,
      height: size * (0.52 + random() * 0.18),
      depth: size * (0.85 + random() * 0.35),
      tone: random() < 0.6 ? TONE.azaleaLight : TONE.azaleaDeep,
    };
  },
  dry: (random) => {
    const size = 0.34 + random() * 0.3;
    return {
      // 마른 풀포기는 위로 선다 — 넓적하면 바위와 구분이 안 된다
      width: size * 0.7,
      height: size * (1.3 + random() * 0.6),
      depth: size * 0.7,
      tone: TONE.dryGrass,
    };
  },
};
