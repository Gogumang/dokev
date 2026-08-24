/**
 * 포토 모드 색보정 — 순수 데이터.
 *
 * **두 가지 방식이 있고, 둘 다 「보이는 것 = 저장되는 것」을 지킨다.**
 *
 * 1. **색 얹기**(`center`/`edge`) — 카메라 앞에 사각형 하나를 띄운다. 후처리
 *    렌더 패스를 쓰지 않으므로 실패해도 「필터가 안 보인다」로 끝난다(렌더
 *    타깃을 잘못 다루면 화면 전체가 검게 나간다). 사각형은 씬 안에 있으니
 *    `toBlob`으로 저장한 사진에도 그대로 남는다.
 * 2. **톤 바꾸기**(`tone`) — 흑백·대비는 색을 덧칠해서 만들 수 없다. 뒤에 있는
 *    것의 채도를 낮춰야 하기 때문이다. 그래서 CSS `filter`로 화면을 바꾸고,
 *    저장할 때는 `capture.ts`가 **같은 문자열**을 2D 캔버스의 `ctx.filter`에
 *    걸어 한 번 옮겨 담는다.
 *
 * **톤 방식에는 함정이 하나 있다.** CSS `filter`는 어디서나 되지만 2D 캔버스의
 * `ctx.filter`는 그렇지 않다. 지원하지 않는 브라우저에서 그대로 쓰면 화면만
 * 흑백이고 사진은 컬러로 저장된다 — 이 저장소가 `timeOfDay.ts` 첫 줄에 적어 둔
 * 바로 그 사고다. 그래서 **`ctx.filter`가 실제로 먹는지 확인하고, 안 먹으면
 * 톤 항목을 아예 없는 것으로 다룬다.** 되는 척하고 다르게 저장하느니 없다고
 * 말하는 편이 낫다.
 */

export type PhotoFilterId = "none" | "nostalgia" | "cool" | "dream" | "mono" | "vivid";

export interface PhotoFilter {
  id: PhotoFilterId;
  /** 버튼에 그대로 쓰는 이름 */
  name: string;
  /** 화면 가운데에 얹는 색 (rgba) */
  center: string;
  /** 가장자리에 얹는 색. 어둡게 두면 비네트가 된다 */
  edge: string;
  /**
   * 화면 전체의 톤을 바꾸는 CSS `filter` 문자열.
   *
   * 화면(CSS)과 저장(2D 캔버스의 `ctx.filter`)이 **같은 문자열**을 쓴다 —
   * 두 곳에 따로 적으면 한쪽만 바뀌어 보이는 것과 저장되는 것이 갈라진다.
   */
  tone?: string;
}

/** 아무 색도 얹지 않을 때 쓰는 값. 톤 항목은 색을 얹지 않고 톤만 바꾼다 */
const CLEAR = "rgba(0, 0, 0, 0)";

export const PHOTO_FILTERS: Record<PhotoFilterId, PhotoFilter> = {
  none: {
    id: "none",
    name: "필터 없음",
    // 완전 투명. 사각형은 그대로 그리되 아무것도 얹지 않는다.
    center: "rgba(0, 0, 0, 0)",
    edge: "rgba(0, 0, 0, 0)",
  },
  nostalgia: {
    id: "nostalgia",
    name: "노스탤지어",
    center: "rgba(255, 196, 128, 0.14)",
    edge: "rgba(58, 30, 18, 0.5)",
  },
  cool: {
    id: "cool",
    name: "새벽빛",
    center: "rgba(150, 200, 255, 0.12)",
    edge: "rgba(14, 24, 52, 0.42)",
  },
  dream: {
    id: "dream",
    name: "몽환",
    center: "rgba(226, 168, 255, 0.18)",
    edge: "rgba(40, 16, 62, 0.55)",
  },
  mono: {
    id: "mono",
    name: "흑백",
    center: CLEAR,
    edge: CLEAR,
    /*
     * 채도를 완전히 빼면 노을·간판이 전부 회색이 되어 밋밋하다. 대비를 조금
     * 올려 두면 골목의 명암이 살아난다 — 이 도시는 원래 빛으로 읽히는 곳이다.
     */
    tone: "grayscale(1) contrast(1.12)",
  },
  vivid: {
    id: "vivid",
    name: "또렷하게",
    center: CLEAR,
    edge: CLEAR,
    // 색을 얹지 않고 있는 색을 진하게만 한다 — 간판 네온이 이 방식과 잘 맞는다
    tone: "saturate(1.35) contrast(1.1)",
  },
};

/** 순환 순서. 필터 없음이 처음이라 한 바퀴 돌면 원래대로 돌아온다 */
export const PHOTO_FILTER_ORDER: readonly PhotoFilterId[] = [
  "none",
  "nostalgia",
  "cool",
  "dream",
  "mono",
  "vivid",
];

export const DEFAULT_PHOTO_FILTER: PhotoFilterId = "none";

/** `ctx.filter`가 먹는지 확인할 때 쓰는 값. 실제 톤과 같은 종류를 넣는다 */
const TONE_PROBE = "grayscale(1)";

/**
 * 2D 캔버스가 `ctx.filter`를 실제로 적용하는가.
 *
 * 속성이 있는지만 보면 안 된다 — 값을 넣어도 조용히 `none`으로 남는 구현이
 * 있다. **넣고 다시 읽어서** 확인한다. 브라우저가 없는 곳(테스트·서버)에서는
 * 거짓이다: 확인할 수 없는 것을 된다고 말하지 않는다.
 */
export function supportsCanvasTone(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return false;
    ctx.filter = TONE_PROBE;
    return ctx.filter !== "none" && ctx.filter !== "";
  } catch {
    return false;
  }
}

/*
 * 한 번만 확인하고 기억한다. 브라우저가 도중에 바뀌지 않으므로 매번 캔버스를
 * 만들 이유가 없다. 인자로 받을 수 있게 열어 두어 양쪽 갈래를 시험한다.
 */
let cachedToneSupport: boolean | null = null;
function toneSupported(): boolean {
  cachedToneSupport ??= supportsCanvasTone();
  return cachedToneSupport;
}

/** 고를 수 있는 필터 차례. 톤을 못 쓰면 톤 항목은 아예 없는 것으로 둔다 */
export function photoFilterOrder(allowTone: boolean): readonly PhotoFilterId[] {
  if (allowTone) return PHOTO_FILTER_ORDER;
  return PHOTO_FILTER_ORDER.filter((id) => PHOTO_FILTERS[id].tone === undefined);
}

export function nextPhotoFilter(
  id: PhotoFilterId,
  allowTone: boolean = toneSupported(),
): PhotoFilterId {
  const order = photoFilterOrder(allowTone);
  const index = order.indexOf(id);
  // 모르는 값이면 기본값으로 되돌린다 — 필터 하나 때문에 버튼이 죽으면 안 된다.
  if (index < 0) return DEFAULT_PHOTO_FILTER;
  return order[(index + 1) % order.length];
}

export function photoFilterPreset(id: string, allowTone: boolean = toneSupported()): PhotoFilter {
  const preset = Object.hasOwn(PHOTO_FILTERS, id)
    ? PHOTO_FILTERS[id as PhotoFilterId]
    : PHOTO_FILTERS[DEFAULT_PHOTO_FILTER];
  /*
   * 저장에 톤 항목이 남아 있는데 이 브라우저가 못 쓰는 경우 — **통째로** 기본값을
   * 돌려준다. 톤만 떼고 이름을 남겨 보았더니 버튼에 「흑백」이라 적힌 채 화면은
   * 컬러였다. **버튼이 화면과 다른 말을 하면 안 된다** — 그렇게 두면 사용자는
   * 흑백인 줄 알고 찍고 컬러 사진을 받는다.
   *
   * 저장된 값 자체는 건드리지 않는다. 지원하는 브라우저로 돌아오면 살아난다.
   */
  if (preset.tone !== undefined && !allowTone) return PHOTO_FILTERS[DEFAULT_PHOTO_FILTER];
  return preset;
}

/** 아무것도 얹지 않는 필터인지. 사각형 렌더를 통째로 건너뛰는 데 쓴다 */
export function isTransparentFilter(filter: PhotoFilter): boolean {
  // 톤 항목도 색은 얹지 않는다 — id로 세면 톤을 고른 순간 빈 사각형을 그린다
  return filter.center === CLEAR && filter.edge === CLEAR;
}
