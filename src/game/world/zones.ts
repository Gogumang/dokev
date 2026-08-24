/**
 * 구역 지도 — 도시를 성격이 다른 여덟 동네로 나눈다.
 *
 * 예전 `districts.ts`는 격자 중심에서의 거리(고리)로 성격을 정했다. 그래서
 * **어느 방향으로 달려도 같은 순서**로 같은 것이 나왔다 — 광장, 번화가,
 * 변두리. 이름은 셋이었지만 건물을 만드는 규칙은 하나뿐이라 화면은 끝까지
 * 같은 상자 밭이었다.
 *
 * 참고 트레일러의 월드가 넓게 느껴지는 이유는 크기가 아니라 **방향마다 다른
 * 것이 나오기 때문**이다. 북쪽은 기와지붕, 서쪽은 골목 주택가, 동쪽은 바다,
 * 남쪽은 시장이다. 그래서 고리를 버리고 **손으로 그린 지도**를 쓴다.
 *
 * 절차적 생성으로 지도를 뽑지 않는다. 36칸짜리 지도는 사람이 직접 그리는
 * 편이 낫다 — 노이즈로 뽑으면 숲 한 칸이 바다 한복판에 떨어지고, 그걸 막는
 * 규칙을 쌓다 보면 결국 손으로 그린 것보다 복잡해진다.
 *
 * three를 모른다. 배치·렌더·오디오·지도가 전부 여기서 성격을 받아 간다.
 *
 * **이 파일은 아무것도 import하지 않는다. 그대로 두라.**
 *
 * `cityLayout`이 건물 규칙을 받으려고 여기를 부른다. 그런데 여기서 `cityLayout`을
 * (직접이든 `streaming`을 거쳐서든) 부르면 순환이 된다 — 그리고 `streaming`은
 * 모듈 최상단에서 `CITY.blockSize`를 읽으므로, 순환이 생긴 순간 그 값이
 * undefined가 되어 **검사 103개 중 49개가 한꺼번에 죽는다.** 실제로 그렇게 했다가
 * 겪었다. 격자 한 변도 `CITY.gridSize`를 빌리지 않고 지도 자체에서 센다.
 *
 * 좌표로 구역을 찾는 일(`zoneAt`)은 `districts.ts`에 있다 — 그쪽은
 * `cityLayout`이 부르지 않으므로 `streaming`을 안전하게 쓸 수 있다.
 */

export type ZoneId =
  | "plaza"
  | "downtown"
  | "market"
  | "residential"
  | "shrine"
  | "park"
  | "forest"
  | "coast";

/** 그 구역 바닥이 무엇으로 덮이는지. 지면 색과 발소리가 이걸 따라간다. */
export type GroundKind = "asphalt" | "stone" | "grass" | "sand" | "dirt";

/**
 * 나무의 종류.
 *
 * 밀도만 구역마다 달리했더니 **숲이 「가로수를 촘촘히 심은 공원」**으로 보였다.
 * 같은 모양이 수만 늘어난 것이라 그렇다. 실루엣이 갈려야 다른 곳에 온 것이 된다.
 *
 * - `broadleaf` 둥근 수관. 가로수·공원의 활엽수.
 * - `conifer` 원뿔을 두 단 쌓는다. 숲과 옛 마을의 침엽수 — 위로 뾰족해 숲이 높아 보인다.
 * - `palm` 긴 기둥 위에 납작하고 넓은 잎. 해안에만.
 */
export type TreeSpecies = "broadleaf" | "conifer" | "palm";

/**
 * 그 구역에 건물을 어떻게 세우는지.
 *
 * 층수·필지 크기·빈 필지 비율을 구역마다 다르게 두는 것이 이 파일의 요점이다.
 * 값 하나가 아니라 **조합**이 동네의 인상을 만든다 — 낮고 촘촘하면 골목,
 * 높고 성기면 도심, 낮고 성기면 시골이다.
 */
export interface BuildRule {
  /** 한 구역을 몇 x 몇 필지로 나눌지. 클수록 건물이 작고 촘촘해진다 */
  minLots: number;
  maxLots: number;
  /**
   * 건물 높이(m) 범위.
   *
   * 최소값은 파사드 한 칸(`FACADE_CELL_HEIGHT`, 3.2m)보다 커야 한다. 낮으면
   * 층 반복 배율이 1로 잘려 **창문 한 줄이 벽 전체로 늘어난다** — 정자나
   * 원두막이 아니라 거대한 창문 한 장으로 보인다. `textureConstants` 검사가
   * 지킨다.
   */
  minHeight: number;
  maxHeight: number;
  /** 필지를 비울 확률(0~1). 높으면 마당과 공터가 생긴다 */
  gapChance: number;
  /**
   * 쓸 파사드 톤 번호들.
   *
   * 톤을 구역마다 갈라 두면 창문 무늬와 벽 색이 함께 바뀐다. 같은 톤을
   * 전부가 나눠 쓰면 높이만 다른 같은 건물이 된다.
   */
  tones: readonly number[];
}

/**
 * 그 구역의 공기.
 *
 * 건물과 나무를 갈라 놓아도 **공기가 같으면 같은 날씨의 같은 도시**다. 숲은
 * 이름이 「안개 숲」인데 번화가와 똑같이 맑았고, 해안은 「윤슬」이라면서
 * 시야가 도심과 같았다.
 *
 * 시간대(`timeOfDay`)를 대체하지 않는다. **곱하고 섞는다** — 여명·한낮·노을·
 * 밤이 정한 색과 거리에 구역이 얼마간 얹히는 방식이라, 시간대를 바꿔도
 * 구역의 성격이 남는다.
 */
export interface ZoneMood {
  /**
   * 안개가 시작하는 거리의 배율. 1보다 작으면 가까이서부터 뿌옇다.
   *
   * 이것만 낮추고 `fogFarScale`을 그대로 두면 **안개가 옅게 길게 깔린다** —
   * 짙은 안개를 만들려면 시작과 끝을 함께 당겨야 한다.
   */
  fogNearScale: number;
  /** 안개가 완전히 덮는 거리의 배율. 1보다 크면 멀리까지 트인다 */
  fogFarScale: number;
  /** 안개·하늘에 섞을 색 */
  tint: string;
  /**
   * 섞는 세기(0~1).
   *
   * 0.35를 넘기면 시간대가 정한 색이 지워져 **밤에도 낮의 구역 색**이 남는다.
   * 구역은 시간대 위에 얹히는 것이지 시간대를 이기는 것이 아니다.
   */
  tintStrength: number;
}

export interface Zone {
  id: ZoneId;
  /** 진입할 때 화면에 띄우는 이름 */
  name: string;
  /** 한 줄 부제 — 이름만으로는 성격이 전달되지 않는다 */
  subtitle: string;
  ground: GroundKind;
  build: BuildRule;
  /**
   * 지면에 섞는 색. 지면 격자의 정점 색으로 들어간다.
   *
   * 텍스처를 구역마다 따로 굽지 않는 이유: 지면은 월드 한 장짜리 면이라
   * 텍스처를 바꾸려면 면을 쪼개야 하고, 그러면 이음매마다 솔기가 보인다.
   * 정점 색은 칸 사이에서 자연히 섞여 경계가 부드럽다.
   */
  groundColor: string;
  /**
   * 지도(CityMap)에서 이 구역을 칠하는 색.
   *
   * 여덟 색이 **서로도, 지도 바탕에서도** 떨어져 있어야 한다. 구역이 셋이던
   * 시절에는 색조가 비슷해도 넘어갔지만, 여덟이 되면 이웃한 색조끼리 붙어
   * 「어느 구역인가」를 지도가 답하지 못한다. 실제로 시장(주황)과 옛 마을
   * (황토)이 합성 후 12밖에 안 떨어져 있었다 — 기준은 40이다.
   *
   * 그래서 채도 높은 색조를 여덟 방향으로 벌려 둔다. 검사가 28쌍을 전부 잰다.
   */
  mapColor: string;
  /**
   * 1000㎡당 나무 그루 수. 0이면 심지 않는다.
   *
   * 숲과 공원을 도심과 가르는 가장 큰 요소다. 건물 규칙만 바꾸면 「건물이
   * 없는 도심」이지 숲이 아니다.
   */
  treeDensity: number;
  /** 그 구역에 심는 나무의 종류 */
  treeSpecies: TreeSpecies;
  /**
   * 나무 크기 배율. 1이 가로수 기준이다.
   *
   * 종류만 갈라서는 부족하다 — 숲의 나무가 주택가 가로수와 키가 같으면 숲이
   * 낮아 보이고, 위를 올려다볼 일이 없어 숲 안에 있다는 느낌이 안 난다.
   */
  treeScale: number;
  /**
   * 그 구역의 활엽수 중 **꽃나무**의 비율(0~1).
   *
   * 참고하는 트레일러 화면의 색을 만드는 것은 초록이 아니라 **분홍**이다 —
   * 벚꽃과 철쭉이 화면의 절반을 차지한다. 나무를 초록 한 가지로만 두면
   * 계절이 하나뿐인 월드가 되고, 구역을 아무리 갈라도 「초록 나무가 몇 그루냐」로만
   * 달라진다.
   *
   * 침엽수·야자에는 적용되지 않는다(`trees.pushTree`). 소나무에 벚꽃이 피면
   * 나무가 아니라 오류로 보인다.
   */
  blossomChance: number;
  /** 그 구역의 공기 — 안개 거리와 색조 */
  mood: ZoneMood;
}

/**
 * 구역별 성격.
 *
 * 이름은 전부 우리말로 짓는다 — 화면에 그대로 뜬다.
 */
export const ZONES: Record<ZoneId, Zone> = {
  plaza: {
    id: "plaza",
    name: "달빛 광장",
    subtitle: "모든 길이 여기서 시작한다",
    ground: "stone",
    groundColor: "#b9b2a4",
    mapColor: "#f2d98a",
    treeDensity: 2,
    treeSpecies: "broadleaf",
    treeScale: 1.0,
    /* 광장은 첫 화면이다 — 여기 색이 월드의 첫인상을 정한다 */
    blossomChance: 0.55,
    mood: { fogNearScale: 1, fogFarScale: 1, tint: "#ffe6c4", tintStrength: 0.10 },
    build: { minLots: 2, maxLots: 2, minHeight: 6, maxHeight: 10, gapChance: 1, tones: [0] },
  },
  downtown: {
    id: "downtown",
    name: "번화가",
    subtitle: "간판이 가장 밝은 곳",
    ground: "asphalt",
    groundColor: "#6f6d72",
    mapColor: "#e05a3c",
    treeDensity: 1,
    treeSpecies: "broadleaf",
    treeScale: 1.0,
    blossomChance: 0.35,
    mood: { fogNearScale: 0.92, fogFarScale: 0.94, tint: "#cfd8e8", tintStrength: 0.16 },
    build: { minLots: 2, maxLots: 3, minHeight: 16, maxHeight: 34, gapChance: 0.08, tones: [0, 1, 2] },
  },
  market: {
    id: "market",
    name: "노을 시장",
    subtitle: "천막 아래로 골목이 이어진다",
    ground: "stone",
    groundColor: "#8e8073",
    mapColor: "#a86ad0",
    treeDensity: 0,
    treeSpecies: "broadleaf",
    treeScale: 0.9,
    blossomChance: 0.3,
    mood: { fogNearScale: 0.9, fogFarScale: 0.9, tint: "#ffcf9a", tintStrength: 0.24 },
    build: { minLots: 4, maxLots: 5, minHeight: 4, maxHeight: 8, gapChance: 0.3, tones: [3, 4] },
  },
  residential: {
    id: "residential",
    name: "언덕 주택가",
    subtitle: "좁은 골목과 옥상 물탱크",
    ground: "asphalt",
    groundColor: "#7d7873",
    mapColor: "#b0a24e",
    treeDensity: 3,
    treeSpecies: "broadleaf",
    treeScale: 1.1,
    /* 골목마다 담 너머로 가지가 넘어오는 동네 */
    blossomChance: 0.5,
    mood: { fogNearScale: 1, fogFarScale: 1, tint: "#e4dcd2", tintStrength: 0.12 },
    build: { minLots: 3, maxLots: 4, minHeight: 5, maxHeight: 12, gapChance: 0.18, tones: [3, 4, 5] },
  },
  shrine: {
    id: "shrine",
    name: "옛 마을",
    subtitle: "기와지붕과 돌담이 남은 자리",
    /*
     * 흙바닥이었다. 「옛 마을」이니 흙이 맞겠거니 했는데, 참고 사진의 한옥
     * 골목 바닥은 **밝은 회백색 포장**이다 — 그 밝기가 담장의 검은 기와와
     * 대비를 만들고, 화면 전체를 들어 올린다. 갈색 흙 위에 회색 담을 세우면
     * 밝은 것이 하나도 없어 화면이 통째로 가라앉는다.
     */
    ground: "stone",
    groundColor: "#ddd6c8",
    mapColor: "#8a5a3c",
    treeDensity: 6,
    treeSpecies: "conifer",
    treeScale: 1.5,
    /* 옛 마을 — 기와지붕 위로 넘어오는 가지가 이 구역의 그림이다 */
    blossomChance: 0.65,
    mood: { fogNearScale: 0.72, fogFarScale: 0.78, tint: "#d8cdb4", tintStrength: 0.26 },
    build: { minLots: 2, maxLots: 3, minHeight: 4, maxHeight: 7, gapChance: 0.42, tones: [4, 5] },
  },
  park: {
    id: "park",
    name: "너른 공원",
    subtitle: "잔디밭과 놀이터",
    ground: "grass",
    groundColor: "#6f9c52",
    mapColor: "#5fbf5a",
    treeDensity: 12,
    treeSpecies: "broadleaf",
    treeScale: 1.35,
    blossomChance: 0.6,
    mood: { fogNearScale: 1.08, fogFarScale: 1.12, tint: "#dff0d0", tintStrength: 0.16 },
    build: { minLots: 2, maxLots: 2, minHeight: 3.4, maxHeight: 5, gapChance: 0.82, tones: [5] },
  },
  forest: {
    id: "forest",
    name: "안개 숲",
    subtitle: "나무가 하늘을 가린다",
    ground: "grass",
    groundColor: "#4d7a44",
    mapColor: "#1f5c33",
    treeDensity: 22,
    treeSpecies: "conifer",
    treeScale: 2.0,
    /* 숲은 초록이 정체성이다. 아주 드물게만 섞어 단조로움만 깬다 */
    blossomChance: 0.08,
    mood: { fogNearScale: 0.46, fogFarScale: 0.6, tint: "#b9cdc4", tintStrength: 0.34 },
    build: { minLots: 2, maxLots: 2, minHeight: 3.4, maxHeight: 5, gapChance: 0.93, tones: [5] },
  },
  coast: {
    id: "coast",
    name: "윤슬 해안",
    subtitle: "모래밭 너머로 물이 반짝인다",
    ground: "sand",
    groundColor: "#d8c79b",
    mapColor: "#46b4d8",
    treeDensity: 4,
    treeSpecies: "palm",
    treeScale: 1.6,
    /* 야자수 사이에 벚나무가 서면 계절이 아니라 오류로 보인다 */
    blossomChance: 0,
    mood: { fogNearScale: 1.2, fogFarScale: 1.35, tint: "#cfe8f2", tintStrength: 0.22 },
    build: { minLots: 2, maxLots: 2, minHeight: 4, maxHeight: 8, gapChance: 0.68, tones: [4] },
  },
};

/**
 * 6x6 지도. 인덱스는 `row * gridSize + col`이다.
 *
 * 광장은 반드시 `CITY.plazaBlockIndex`(= 21, row 3 col 3) 자리에 와야 한다 —
 * 스폰 지점이라 배치 코드가 그 번호를 따로 쓴다. 검사가 강제한다.
 *
 * 배치의 뜻: 광장을 번화가가 감싸고, 네 방향으로 각각 다른 동네가 열린다.
 *   북(row 0~1)  → 옛 마을·숲
 *   서(col 0~1)  → 주택가·공원
 *   동(col 5)    → 해안
 *   남(row 5)    → 시장
 * 어느 쪽으로 달려도 두 구역 안에 「다른 것」이 나오게 두었다. 세 구역을
 * 지나야 바뀌면 그 전에 방향을 되돌린다.
 */
const MAP_ROWS: readonly (readonly ZoneId[])[] = [
  ["forest", "forest", "forest", "shrine", "shrine", "shrine"],
  ["forest", "park", "park", "shrine", "shrine", "coast"],
  ["residential", "park", "downtown", "downtown", "downtown", "coast"],
  ["residential", "residential", "downtown", "plaza", "downtown", "coast"],
  ["residential", "residential", "downtown", "downtown", "downtown", "coast"],
  ["market", "market", "market", "market", "coast", "coast"],
];

export const ZONE_MAP: readonly ZoneId[] = MAP_ROWS.flat();

/**
 * 격자 한 변의 칸 수.
 *
 * `CITY.gridSize`를 빌리지 않고 지도에서 센다(위 순환 주석 참조). 둘이 갈라지면
 * 좌표와 이름이 어긋나므로 검사가 같은지 확인한다.
 */
export const ZONE_GRID_SIZE = MAP_ROWS.length;

/**
 * 도시 시설물이 놓이는 구역인가.
 *
 * 인도 블록·연석·횡단보도·가로등·맨홀·점자블록은 **도시가 깔아 놓은 것**이다.
 * 숲 한복판에 맨홀 뚜껑이 있으면 그 순간 숲이 아니라 「나무를 심은 도로」가
 * 된다 — 실제로 처음 숲에 서 봤을 때 발밑에 점자블록과 빗물받이가 깔려 있었고,
 * 나무를 아무리 심어도 도시로 보였다.
 *
 * 성격마다 따로 켜고 끄는 스위치를 만들지 않는다. 「도시가 관리하는 땅인가」
 * 하나로 갈리고, 그 이상 쪼개면 새 구역을 더할 때마다 스위치를 여덟 번
 * 켜야 한다.
 */
export function isUrban(id: ZoneId): boolean {
  return id === "plaza" || id === "downtown" || id === "market" || id === "residential";
}

/** 구역 번호에 도시 시설물이 놓이는가. 배치 루프가 한 줄로 거르려고 쓴다. */
export function isUrbanBlock(blockIndex: number): boolean {
  return isUrban(zoneForBlock(blockIndex).id);
}

/** 구역 번호 → 성격. 지도 밖 번호는 가장자리 성격으로 잘라 낸다. */
export function zoneForBlock(blockIndex: number): Zone {
  return ZONES[ZONE_MAP[clampIndex(blockIndex)]];
}

/**
 * 지도 밖 번호를 격자 안으로 접는다.
 *
 * `blockIndexFromPosition`은 월드 밖 좌표에서도 번호를 돌려준다(멀리 나가면
 * 음수나 36 이상). 그대로 색인하면 `undefined`가 나오고, 그러면 이름을 읽는
 * 쪽에서 터진다. 행과 열을 **따로** 잘라야 한다 — 번호만 자르면 왼쪽 밖으로
 * 나간 자리가 윗줄 오른쪽 끝으로 감긴다.
 */
function clampIndex(blockIndex: number): number {
  const size = ZONE_GRID_SIZE;
  const last = size - 1;
  const col = clamp(blockIndex % size, 0, last);
  const row = clamp(Math.floor(blockIndex / size), 0, last);
  return row * size + col;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
