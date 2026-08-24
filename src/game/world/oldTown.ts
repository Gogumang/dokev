/**
 * 옛 마을 — 돌담과 홍살문.
 *
 * 「옛 마을」이라는 이름과 「기와지붕과 돌담이 남은 자리」라는 부제를 붙여 놓고,
 * 실제로는 **낮은 상자가 성기게 선 동네**였다. 층수와 공터 비율만 다르니
 * 「건물이 낮은 변두리」로 보였다.
 *
 * 담과 문이 이 구역을 만든다. 지붕은 얹는 것이라 멀리서만 보이지만, **담은
 * 눈높이에 있어 걷는 내내 보인다** — 골목이 담으로 둘러싸이는 순간 다른
 * 동네가 된다.
 *
 * `cityLayout`을 **값으로** import하지 않는다. 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 이미 겪었다
 * (`zones.ts` 주석). 필요한 좌표는 인자로 받고, 타입만 가져온다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { BoxInstance } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

/** 담을 두를 구역 하나. `cityLayout`이 좌표를 계산해 넘긴다 */
export interface OldTownBlock {
  blockIndex: number;
  cx: number;
  cz: number;
  /** 그 구역의 집. 담이 집을 뚫지 않도록 자리를 비켜 준다 */
  buildings: readonly BoxInstance[];
  /**
   * 바깥을 향한 변들. 각 원소는 구역 중심에서 그 변으로 가는 방향이다.
   *
   * **이웃도 옛 마을인 변은 빼고 넘긴다.** 마을 안쪽 경계에까지 문을 세우면
   * 마을을 가로지를 때마다 문을 지나게 되어 이정표가 아니라 관문이 된다.
   * 반대로 바깥을 향한 변에는 전부 세워야 한다 — 어느 방향에서 올라와도
   * 문을 지나 들어오게.
   */
  openSides: readonly { dx: number; dz: number }[];
  /**
   * 이 구역만 다르게 쓸 문턱 폭(m). 없으면 `WALL.doorway`.
   *
   * 시작 마당 때문에 열어 둔다. 마을 구역은 지나가는 곳이라 5.2m면 충분하지만
   * **시작 지점은 사방으로 나가는 자리다** — 같은 폭으로 두었더니 목적지가
   * 대각선에 있을 때 담 모서리에 걸려 빠져나가지 못했다(`playthrough` 검사
   * 두 건이 여기서 죽었다). 넓히면 담은 네 모서리에만 남고 가운데가 트인다.
   */
  doorway?: number;
  /**
   * 담을 세울 변. 없으면 네 변 전부.
   *
   * 마을은 담으로 둘러싸인 곳이 맞지만 **시작 마당은 그러면 안 된다.** 네 변을
   * 두르면 모서리가 생기고, 목적지가 대각선에 있을 때 거기 끼여 빠져나가지
   * 못한다 — 문턱을 12m까지 넓혀도 결과가 한 자리도 안 바뀌었다. 갇히는 자리는
   * 변 가운데가 아니라 **모서리**였다.
   *
   * 참고 장면의 담도 마당을 두르지 않는다. 골목 한쪽을 따라 이어지고 반대편은
   * 트여 있다. 한 변만 세우면 눈높이의 기와담장은 그대로 남고 모서리는 생기지
   * 않는다.
   */
  edges?: readonly { dx: number; dz: number }[];
}

export interface OldTownParts {
  /** 돌담 — 낮고 긴 상자. 눈높이에 있어 이 구역의 인상을 만든다 */
  walls: BoxInstance[];
  /** 홍살문 기둥과 보. 붉은 칠이라 담·지붕과 색이 갈린다 */
  gates: BoxInstance[];
  /**
   * 담 아래 나무 화분과 그 위의 철쭉.
   *
   * 참고 사진에서 담장 아래를 채우는 것이 이것이다. 철쭉은 이미 자연 구역에
   * 흩어 뿌리고 있었지만(`undergrowth`), **흩어진 것과 줄지어 놓인 것은 다른
   * 물건이다** — 담을 따라 늘어서야 「사람이 가꾼 골목」으로 보인다.
   *
   * 잡초 묶음에 섞지 않고 따로 둔다. 저쪽 팔레트에는 나무 색이 없고, 톤
   * 번호를 두 팔레트에 걸쳐 쓰면 한쪽을 고칠 때 다른 쪽이 조용히 어긋난다.
   */
  planters: BoxInstance[];
  /**
   * 담에 붙는 식물 — 화분의 철쭉과 담을 타고 넘는 담쟁이.
   *
   * 나무 상자와 **묶음을 나눈다.** 한 묶음에 두었더니 꽃도 상자로 그려졌다 —
   * 잡초의 철쭉은 둥근데(`shape="blob"`) 화분 꽃만 각져서, 4m 거리에서
   * **납작한 판**으로 읽혔다. 도형이 다르면 인스턴스 묶음이 갈리는 것이 이
   * 저장소의 규칙이고(수관·침엽수가 그렇다), 그러면 팔레트도 따로 가야 한다.
   *
   * 철쭉과 담쟁이를 한 묶음에 둔다 — 둘 다 담에 붙는 둥근 덩어리라 도형이
   * 같다. 색만 톤으로 갈린다.
   */
  wallGreens: BoxInstance[];
  colliders: Aabb[];
}

/**
 * 돌담 수치.
 *
 * 높이가 중요하다. 1.3m는 **어른 가슴, 아이 머리 위**다 — 넘어다보이지 않으므로
 * 골목이 골목으로 읽히고, 그렇다고 2m처럼 답답하지도 않다. 3인칭 카메라가
 * 어깨 너머라 담이 더 높으면 화면이 담으로 막힌다.
 */
/**
 * 담을 세 켜로 쌓는다 — 기단·몸통·기와 갓.
 *
 * 상자 하나로 두었을 때는 **회색 띠**였다. 참고 사진의 한옥 담장이 담장으로
 * 보이는 이유는 재질이 아니라 **켜의 대비**다: 어두운 막돌 기단, 밝은 전돌
 * 몸통, 그 위에 다시 어두운 기와가 처마처럼 밖으로 나온다. 세 켜의 밝기가
 * 어두움-밝음-어두움으로 갈리면서 눈이 「쌓아 올린 것」으로 읽는다.
 *
 * 기와 갓은 몸통보다 **넓다.** 처마가 밖으로 나와야 그 아래 그림자가 생기고,
 * 그 그림자가 담을 두껍게 만든다 — 같은 폭으로 얹으면 색만 다른 띠가 하나
 * 더 생길 뿐이다.
 *
 * 전체 높이는 1.55m로 잡는다. 예전 1.3m보다 조금 높지만 2m를 넘기지 않는다 —
 * 3인칭 카메라가 어깨 너머라 그보다 높으면 화면이 담으로 막힌다.
 */
const COURSE = {
  /** 막돌 기단 — 땅에 닿는 켜 */
  footing: { height: 0.28, widen: 0.14 },
  /** 전돌 몸통 */
  body: { height: 1.05 },
  /**
   * 기와 갓 — 처마가 밖으로 나온다.
   *
   * 처음에 0.22m 두께에 0.3m 내밈으로 두었더니 화면에서 **담 위에 그은 검은
   * 선**으로 보였다. 참고 사진의 기와는 두껍고, 무엇보다 그 아래 그림자가
   * 굵다 — 담을 두껍게 만드는 것은 기와 자체가 아니라 **처마 그늘**이다.
   *
   * 두께를 반쯤 키우고 내밈을 더 늘린다. 담 전체가 1.67m가 되는데, 3인칭
   * 카메라를 막는 선(1.8m)은 아직 넘지 않는다.
   */
  cap: { height: 0.34, widen: 0.44 },
} as const;

/** 담 전체 높이(m) — 충돌체와 검사가 이 값을 쓴다 */
export const WALL_TOTAL_HEIGHT = COURSE.footing.height + COURSE.body.height + COURSE.cap.height;

const WALL = {
  height: 1.3,
  thickness: 0.55,
  /**
   * 구역 가장자리에서 담까지 들여놓는 거리(m).
   *
   * 예전에는 「구역 중심에서 4.2m」였다. 34m짜리 구역 한복판에 **8.4m짜리
   * 작은 담장**이 서 있었던 셈이라, 「구역을 두른다」고 적어 놓고 실제로는
   * 마당 담이었다 — 구역 가장자리로 들어오면 담을 만나지도 않았다.
   *
   * 지금은 가장자리에서 재고 들여놓는다. 1.2m면 인도(구역 반 폭 + 1m) 안쪽에
   * 머물면서 최대한 바깥을 두른다.
   */
  edgeInset: 1.2,
  /**
   * 한 변 가운데를 비우는 폭(m).
   *
   * 사방이 막히면 그 구역에 들어갈 수 없다. 플레이어 반지름의 네 배로 둔다 —
   * 보드를 탄 채로도 통과해야 하고, 좁으면 벽에 끼인 것처럼 느껴진다.
   */
  doorway: 5.2,
  /**
   * 담 한 도막의 길이(m).
   *
   * 변 하나를 긴 도막 둘로 놓다가 잘게 쪼갰다. 담이 구역 가장자리로 나가면서
   * **집과 겹치는 자리가 생겼는데**, 도막이 길면 한 번 겹칠 때 변의 절반이
   * 통째로 사라진다. 짧게 쪼개면 집이 있는 자리만 비고 나머지는 이어진다 —
   * 실제 마을에서도 담은 집과 집 사이를 메운다.
   */
  segment: 2.6,
  /** 집에서 띄우는 여백(m). 벽에 딱 붙으면 담인지 집 벽인지 구분이 안 된다 */
  houseGap: 0.7,
} as const;

/**
 * 홍살문 수치.
 *
 * 담보다 훨씬 높아야 **멀리서 보이는 이정표**가 된다. 담이 1.3m이므로 4.6m면
 * 세 배가 넘어 실루엣에서 확실히 튄다.
 */
const GATE = {
  postWidth: 0.46,
  height: 4.6,
  /** 두 기둥 사이 간격(m). 문턱은 담의 트인 폭과 같아야 어색하지 않다 */
  span: WALL.doorway,
  /** 위쪽 보 두께(m) */
  beamThickness: 0.34,
  /** 아래 보가 위 보에서 떨어진 거리(m). 홍살문은 보가 둘이다 */
  beamGap: 0.72,
} as const;

/**
 * 담 아래 화분 수치.
 *
 * 담 도막마다 놓지 않는다 — 줄줄이 놓으면 화분이 아니라 **울타리**가 되고,
 * 담이 그 뒤로 가려진다. 참고 사진에서도 화분은 담을 따라 **띄엄띄엄** 있고
 * 그 사이로 담이 보인다.
 */
const PLANTER = {
  /** 담을 따라가는 길이(m) */
  length: 1.15,
  /** 담에서 바깥으로 나오는 깊이(m) */
  depth: 0.52,
  /** 나무 상자 높이(m) */
  height: 0.42,
  /** 몇 도막마다 하나씩 놓을지 */
  every: 3,
  /** 상자 위에 얹는 꽃 덩어리 수. 하나면 분홍 공, 셋이면 무더기다 */
  lobes: 2,
} as const;

/** 담 색 팔레트 인덱스 — 렌더의 `OLD_TOWN_PALETTE`와 순서를 맞춘다 */
const TONE = {
  stone: 0,
  stoneDark: 1,
  gateRed: 2,
  gateBeam: 3,
  brick: 4,
  roofTile: 5,
  footing: 6,
} as const;

/** 나무 상자 색 — 렌더의 `PLANTER_PALETTE`와 순서를 맞춘다 */
const PLANTER_TONE = { wood: 0, woodDark: 1 } as const;

/** 담에 붙는 식물 색 — 렌더의 `WALL_GREEN_PALETTE`와 순서를 맞춘다 */
const GREEN_TONE = { blossomLight: 0, blossomDeep: 1, ivyLight: 2, ivyDeep: 3 } as const;

/**
 * 담쟁이 — 담을 타고 넘어 바깥으로 늘어진다.
 *
 * 참고 사진에서 기와 담장 위를 덮고 있는 것이 이것이다. 담이 돌과 기와만으로
 * 되어 있으면 **새로 쌓은 담**으로 보인다 — 「오래 남은 자리」라는 이 구역의
 * 부제를 만드는 것은 담 자체가 아니라 그 위에 자란 것이다.
 *
 * 담 도막마다 두지 않는다. 화분과 **엇갈리게** 놓아야 담을 따라 무언가가
 * 계속 바뀐다 — 같은 자리에 겹쳐 두면 그 자리만 무성하고 나머지는 맨 담이다.
 */
const IVY = {
  /** 몇 도막마다 하나씩. 화분(3)과 서로소라 겹치는 자리가 드물다 */
  every: 4,
  /** 덩어리 수 */
  lobes: 3,
  /** 갓 위로 얼마나 솟는지(m) */
  rise: 0.18,
} as const;

/**
 * 옛 마을 구역에 담과 문을 세운다.
 *
 * 담은 네 변에 각각 **두 도막**으로 놓는다. 한 도막으로 두르면 들어갈 수
 * 없고, 네 변을 다 트면 담이 아니라 흩어진 돌덩이가 된다.
 */
/**
 * 구역 중심에서 담까지(m).
 *
 * 내보내는 이유는 **스폰이 담 앞에 서야** 하기 때문이다. 시작 지점을 담에서
 * 몇 미터 떨어뜨릴지 정하려면 담이 어디 서는지를 알아야 하는데, 그 거리를
 * `cityLayout` 쪽에 숫자로 다시 적으면 `WALL.edgeInset`을 고칠 때 한쪽만
 * 움직여 스폰이 담을 뚫거나 멀어진다.
 */
export function wallReach(blockSize: number): number {
  return blockSize / 2 - WALL.edgeInset;
}

export function buildOldTown(
  blocks: readonly OldTownBlock[],
  blockSize: number,
  random: () => number,
): OldTownParts {
  const walls: BoxInstance[] = [];
  const gates: BoxInstance[] = [];
  const planters: BoxInstance[] = [];
  const wallGreens: BoxInstance[] = [];
  const colliders: Aabb[] = [];

  for (const block of blocks) {
    const reach = wallReach(blockSize);
    const doorway = block.doorway ?? WALL.doorway;
    /** 그 변에 담을 세우는가. `edges`가 없으면 네 변 전부 세운다 */
    const hasEdge = (dx: number, dz: number) =>
      !block.edges || block.edges.some((edge) => edge.dx === dx && edge.dz === dz);

    /*
     * 네 변을 짧은 도막으로 메운다.
     *
     * 가운데는 트고(문턱), 집이 서 있는 자리는 건너뛴다. 그래서 담이 집과
     * 집 사이를 잇는 모양이 된다 — 한국 마을 담이 실제로 그렇다.
     */
    for (const side of [-1, 1]) {
      let index = 0;
      for (let along = -reach + WALL.segment / 2; along < reach; along += WALL.segment) {
        index += 1;
        if (Math.abs(along) < doorway / 2) continue;

        const withPlanter = index % PLANTER.every === 0;
        const withIvy = index % IVY.every === 0;

        // z 방향으로 뻗는 변 (구역의 좌·우)
        const sideWall =
          hasEdge(side, 0) &&
          pushWall(
            walls,
            colliders,
            block,
            block.cx + side * reach,
            block.cz + along,
            WALL.thickness,
            WALL.segment,
            random,
          );
        /*
         * **담이 실제로 선 자리에만 놓는다.**
         *
         * 처음에는 도막 번호만 보고 놓았는데, 집에 막혀 담을 건너뛴 자리에도
         * 화분이 섰다 — 담 없는 허공에 화분이 줄지어 있는 셈이다. 화분은
         * 담에 기대는 물건이라 담이 없으면 놓을 이유가 없다.
         */
        if (withIvy && sideWall) {
          pushIvy(wallGreens, block.cx + side * reach, block.cz + along,
            { dx: side, dz: 0 }, block.blockIndex, random);
        }
        if (withPlanter && sideWall) {
          // 담 바깥쪽에 놓는다 — 안쪽은 집 마당이라 지나가며 볼 일이 없다
          pushPlanter(planters, wallGreens, block.cx + side * (reach + WALL.thickness / 2),
            block.cz + along, { dx: side, dz: 0 }, block.blockIndex, random);
        }
        // x 방향으로 뻗는 변 (구역의 위·아래)
        const endWall =
          hasEdge(0, side) &&
          pushWall(
            walls,
            colliders,
            block,
            block.cx + along,
            block.cz + side * reach,
            WALL.segment,
            WALL.thickness,
            random,
          );
        if (withIvy && endWall) {
          pushIvy(wallGreens, block.cx + along, block.cz + side * reach,
            { dx: 0, dz: side }, block.blockIndex, random);
        }
        if (withPlanter && endWall) {
          pushPlanter(planters, wallGreens, block.cx + along,
            block.cz + side * (reach + WALL.thickness / 2), { dx: 0, dz: side }, block.blockIndex, random);
        }
      }
    }

    for (const side of block.openSides) {
        pushGate(gates, colliders, block, side, reach);
    }
  }

  return { walls, gates, planters, wallGreens, colliders };
}

/**
 * 담 바깥에 붙는 화분 하나 — 나무 상자와 그 위의 철쭉 무더기.
 *
 * **충돌체를 주지 않는다.** 담이 이미 바로 뒤에 있어 플레이어가 그 자리에
 * 들어올 수 없다 — 담 충돌체가 화분 폭(0.52m)보다 넓게 밀어내므로, 하나 더
 * 놓아 봐야 막는 것이 없고 골목만 좁아진다.
 *
 * @param out 담에서 바깥으로 나가는 방향. 화분이 그쪽으로 튀어나온다
 */
function pushPlanter(
  planters: BoxInstance[],
  blossoms: BoxInstance[],
  x: number,
  z: number,
  out: { dx: number; dz: number },
  blockIndex: number,
  random: () => number,
): void {
  const alongX = out.dz !== 0;
  const width = alongX ? PLANTER.length : PLANTER.depth;
  const depth = alongX ? PLANTER.depth : PLANTER.length;
  // 상자 절반만큼 담에서 떼어 놓아야 담에 파묻히지 않는다
  const cx = x + out.dx * (PLANTER.depth / 2);
  const cz = z + out.dz * (PLANTER.depth / 2);

  planters.push({
    x: cx,
    y: PLANTER.height / 2,
    z: cz,
    width,
    height: PLANTER.height,
    depth,
    tone: random() < 0.6 ? PLANTER_TONE.wood : PLANTER_TONE.woodDark,
    blockIndex,
    // 비탈에서 낮은 쪽 모서리가 뜬다 — 담과 같은 이유로 아래로 늘린다
    sink: 0.4,
  });

  for (let lobe = 0; lobe < PLANTER.lobes; lobe += 1) {
    const size = 0.46 + random() * 0.24;
    /*
     * 꽃 무더기는 상자 **폭보다 넓게** 퍼진다. 상자 안에 얌전히 들어가면
     * 화분이 아니라 뚜껑 덮인 나무 상자로 보인다 — 실제 화분의 꽃은 테두리
     * 밖으로 흘러넘친다.
     */
    const spread = PLANTER.length * 0.32;
    blossoms.push({
      x: cx + (alongX ? (random() - 0.5) * spread * 2 : 0),
      y: PLANTER.height + size * 0.34,
      z: cz + (alongX ? 0 : (random() - 0.5) * spread * 2),
      width: size * 1.25,
      height: size * 0.8,
      depth: size * 1.25,
      tone: random() < 0.6 ? GREEN_TONE.blossomLight : GREEN_TONE.blossomDeep,
      blockIndex,
    });
  }
}

/**
 * 담 위를 덮는 담쟁이 한 무더기.
 *
 * 갓 위에 얹되 **바깥으로 조금 넘긴다.** 담 한가운데에 얌전히 얹으면 화분을
 * 지붕에 올려 둔 것으로 보인다 — 타고 넘어 늘어져야 담쟁이가 된다.
 */
function pushIvy(
  greens: BoxInstance[],
  x: number,
  z: number,
  out: { dx: number; dz: number },
  blockIndex: number,
  random: () => number,
): void {
  const alongX = out.dz !== 0;
  const top = WALL_TOTAL_HEIGHT;

  for (let lobe = 0; lobe < IVY.lobes; lobe += 1) {
    const size = 0.42 + random() * 0.3;
    // 바깥으로 넘긴 만큼 아래로도 처진다 — 늘어진 것으로 보이게
    /*
     * 갓의 내밈(0.44m)보다 **더 나가야** 담 밖으로 넘은 것으로 보인다.
     * 처음에 그보다 짧게 잡았더니 덩어리 다섯 중 하나만 갓 밖으로 나왔고,
     * 나머지는 갓 위에 얹혀 있어 「지붕에 올려 둔 화분」이었다.
     */
    const over = (0.55 + random() * 0.5) * COURSE.cap.widen * 2;
    const spread = WALL.segment * 0.3;

    greens.push({
      x: x + out.dx * over + (alongX ? (random() - 0.5) * spread * 2 : 0),
      y: top + IVY.rise - over * 0.9,
      z: z + out.dz * over + (alongX ? 0 : (random() - 0.5) * spread * 2),
      width: size * 1.2,
      height: size,
      depth: size * 1.2,
      tone: random() < 0.55 ? GREEN_TONE.ivyLight : GREEN_TONE.ivyDeep,
      blockIndex,
    });
  }
}

function pushWall(
  walls: BoxInstance[],
  colliders: Aabb[],
  block: OldTownBlock,
  x: number,
  z: number,
  width: number,
  depth: number,
  random: () => number,
): boolean {
  /*
   * 집이 서 있는 자리는 건너뛴다. 담이 벽을 뚫으면 집이 반쯤 파묻힌 것으로
   * 보인다 — 담을 가장자리로 내보내면서 생긴 문제다(`edgeInset` 주석).
   */
  const clash = block.buildings.some(
    (house) =>
      Math.abs(x - house.x) < house.width / 2 + width / 2 + WALL.houseGap &&
      Math.abs(z - house.z) < house.depth / 2 + depth / 2 + WALL.houseGap,
  );
  if (clash) return false;

  const course = (
    bottom: number,
    height: number,
    widen: number,
    tone: number,
    /** 비탈에서 낮은 쪽 끝이 뜨는 것을 막는다. 아래 켜만 파묻으면 된다 */
    sink: number,
  ) => {
    walls.push({
      x,
      y: bottom + height / 2,
      z,
      width: width + widen * 2,
      height,
      depth: depth + widen * 2,
      tone,
      blockIndex: block.blockIndex,
      sink,
    });
  };

  const footingTop = COURSE.footing.height;
  const bodyTop = footingTop + COURSE.body.height;

  /*
   * 담은 길다. 비탈에 놓이면 낮은 쪽 끝이 뜨므로 아래로 파묻는다 —
   * 건물의 `footprintSink`와 같은 이유다. **기단만** 파묻으면 된다.
   * 위 켜까지 파묻으면 아래 켜를 삼켜 세 켜가 다시 한 덩어리가 된다.
   */
  course(0, COURSE.footing.height, COURSE.footing.widen, TONE.footing, 0.6);
  // 두 돌색을 섞는다. 한 색이면 담이 아니라 콘크리트 띠로 보인다
  course(footingTop, COURSE.body.height, 0, random() < 0.75 ? TONE.brick : TONE.stone, 0);
  course(bodyTop, COURSE.cap.height, COURSE.cap.widen, TONE.roofTile, 0);

  const reach = Math.max(COURSE.footing.widen, COURSE.cap.widen);
  colliders.push({
    minX: x - width / 2 - reach,
    maxX: x + width / 2 + reach,
    minZ: z - depth / 2 - reach,
    maxZ: z + depth / 2 + reach,
    top: terrainHeight(x, z) + WALL_TOTAL_HEIGHT,
  });

  return true;
}

/**
 * 홍살문 하나 — 기둥 둘과 보 둘.
 *
 * 어느 변에 세우는지를 방향(`dir`)으로 받는다. 문이 향하는 쪽과 직각인
 * 방향(`tangent`)으로 기둥이 벌어지고 보가 걸린다 — 남·북 변이면 x축으로,
 * 동·서 변이면 z축으로. 그래서 상자를 **돌려서** 놓아야 한다: 돌리지 않으면
 * 동쪽 문의 보가 벽을 향해 누워 문이 아니라 판자로 보인다.
 */
function pushGate(
  gates: BoxInstance[],
  colliders: Aabb[],
  block: OldTownBlock,
  dir: { dx: number; dz: number },
  reach: number,
): void {
  const x = block.cx + dir.dx * reach;
  const z = block.cz + dir.dz * reach;
  // 방향을 90도 돌린 것이 문턱이 벌어지는 축이다
  const tangent = { dx: -dir.dz, dz: dir.dx };
  // 동·서 변의 문은 보를 z축으로 눕혀야 한다
  const rotationY = dir.dx !== 0 ? Math.PI / 2 : 0;
  const half = GATE.span / 2;

  for (const side of [-1, 1]) {
    const postX = x + tangent.dx * side * half;
    const postZ = z + tangent.dz * side * half;

    gates.push({
      x: postX,
      y: GATE.height / 2,
      z: postZ,
      width: GATE.postWidth,
      height: GATE.height,
      depth: GATE.postWidth,
      tone: TONE.gateRed,
      blockIndex: block.blockIndex,
      sink: 0.5,
    });

    colliders.push({
      minX: postX - GATE.postWidth / 2,
      maxX: postX + GATE.postWidth / 2,
      minZ: postZ - GATE.postWidth / 2,
      maxZ: postZ + GATE.postWidth / 2,
      top: terrainHeight(postX, postZ) + GATE.height,
    });
  }

  /*
   * 보는 기둥 밖으로 조금 더 나간다.
   *
   * 기둥에 딱 맞추면 「ㅍ」이 아니라 「ㅁ」이 되어 문이 아니라 창틀로 보인다.
   * 실제 홍살문·일주문도 보가 기둥 밖으로 나온다.
   */
  const beamWidth = GATE.span + GATE.postWidth * 3;

  for (const drop of [0, GATE.beamGap]) {
    gates.push({
      x,
      y: GATE.height - GATE.beamThickness / 2 - drop,
      z,
      width: beamWidth,
      height: GATE.beamThickness,
      depth: GATE.postWidth * 1.25,
      tone: TONE.gateBeam,
      blockIndex: block.blockIndex,
      rotationY,
    });
  }
  // 보에는 충돌체를 만들지 않는다 — 머리 위라 닿지 않고, 문을 막으면 안 된다
}
