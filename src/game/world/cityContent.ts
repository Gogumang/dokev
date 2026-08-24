/**
 * 간판 콘텐츠 — 업종명, 문구, 배색.
 *
 * 렌더링 코드와 분리한다 (PROJECT_PLAN 「구조 원칙」). 이 파일은 three.js도 캔버스도
 * 모른다. 배치 코드(cityDetails/streetProps)는 여기의 개수만 알면 되고,
 * 텍스처 코드(atlasTextures)는 여기의 문자열을 그리기만 한다.
 *
 * 업종을 추가하려면 SHOP_BRANDS에 한 줄을 더하면 된다. 다만 아틀라스 격자
 * (atlasTextures의 columns × rows)를 넘기면 그려지지 않는 칸이 생긴다.
 */

/** 간판 배색. 채도 높은 바탕 + 대비 큰 글씨가 노을 역광에서도 읽힌다. */
export interface SignScheme {
  bg: string;
  text: string;
  /** 테두리·띠 색. 간판 가장자리에 한 줄만 넣어도 "판때기"에서 벗어난다 */
  trim: string;
}

export const SIGN_SCHEMES: readonly SignScheme[] = [
  { bg: "#d62828", text: "#fff8ec", trim: "#ffd23f" },
  { bg: "#1b4fa0", text: "#ffffff", trim: "#7fd4ff" },
  { bg: "#f4f1e8", text: "#22314f", trim: "#d62828" },
  { bg: "#f7b500", text: "#2a1f14", trim: "#ffffff" },
  { bg: "#2b1e3f", text: "#ff5fa2", trim: "#7fd4ff" },
  { bg: "#0f7a4a", text: "#fff8ec", trim: "#ffd23f" },
  { bg: "#f8f6ef", text: "#0f7a4a", trim: "#0f7a4a" },
  { bg: "#151a2e", text: "#4dd0ff", trim: "#ff5fa2" },
];

/**
 * 업종 목록.
 *
 * `long`은 벽면 가로 간판, `short`는 옆으로 튀어나온 세로 간판에 쓴다. 세로
 * 간판은 글자를 한 자씩 쌓으므로 4자를 넘으면 글자가 급격히 작아진다.
 */
export interface ShopBrand {
  long: string;
  short: string;
  /** SIGN_SCHEMES 인덱스 */
  scheme: number;
}

export const SHOP_BRANDS: readonly ShopBrand[] = [
  { long: "김밥천국", short: "김밥", scheme: 0 },
  { long: "24시 편의점", short: "편의점", scheme: 1 },
  { long: "행복 공인중개사", short: "부동산", scheme: 2 },
  { long: "예쁨 미용실", short: "미용실", scheme: 3 },
  { long: "노래연습장", short: "노래방", scheme: 4 },
  { long: "가마솥 치킨", short: "치킨", scheme: 5 },
  { long: "온누리약국", short: "약국", scheme: 6 },
  { long: "PC방 게임존", short: "PC방", scheme: 7 },
  { long: "크린 세탁소", short: "세탁", scheme: 1 },
  { long: "엄마손 분식", short: "분식", scheme: 0 },
  { long: "왕대박 곱창", short: "곱창", scheme: 3 },
  { long: "우리동네 호프", short: "호프", scheme: 4 },
  { long: "24시 순대국밥", short: "국밥", scheme: 5 },
  { long: "코인 빨래방", short: "빨래방", scheme: 2 },
  { long: "참존안경", short: "안경", scheme: 6 },
  { long: "태권도 체육관", short: "태권도", scheme: 1 },
];

/** 현수막 문구. 개업·모집·임대 — 골목에 실제로 걸려 있는 것들. */
export const BANNER_TEXTS: readonly string[] = [
  "신장개업",
  "전 품목 대할인",
  "회원 모집중",
  "임대 문의",
  "오늘 개업 · 감사 행사",
  "원생 모집",
  "주차 가능",
  "24시간 영업",
];

/** 현수막 바탕은 흰 천에 붉은/파란 글씨가 압도적으로 많다. */
export const BANNER_SCHEMES: readonly SignScheme[] = [
  { bg: "#f6f3e9", text: "#c62828", trim: "#1b4fa0" },
  { bg: "#f6f3e9", text: "#1b4fa0", trim: "#c62828" },
  { bg: "#c62828", text: "#fff8ec", trim: "#ffd23f" },
  { bg: "#1b4fa0", text: "#fff8ec", trim: "#7fd4ff" },
];

/** 소품 패널 아틀라스의 셀 인덱스. 배치 코드가 이 이름으로 셀을 고른다. */
export const PROP_CELL_INDEX = {
  drinkVendor: 0,
  coffeeVendor: 1,
  acGrill: 2,
  busRouteMap: 3,
  storeDoor: 4,
  shutter: 5,
  snackVendor: 6,
  noticeBoard: 7,
} as const;

/** 소품 패널 셀 개수. 아틀라스 격자(4×2)와 반드시 일치해야 한다. */
export const PROP_CELL_COUNT = 8;

/**
 * 차양 줄무늬 한 쌍(밝은 줄 + 어두운 줄)이 덮는 거리(m).
 *
 * 줄무늬를 그리는 쪽(textures.ts)과 폭에 맞춰 반복 횟수를 계산하는 쪽
 * (cityDetails)이 같은 값을 써야 한다. 어긋나면 좁은 가게와 넓은 가게의 줄
 * 굵기가 달라진다.
 */
export const AWNING_STRIPE_METERS = 0.5;
