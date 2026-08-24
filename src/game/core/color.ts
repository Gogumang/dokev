/**
 * 색 보간 — 순수 함수.
 *
 * three.js의 Color를 쓰지 않는 이유: 조명 세기에 따라 팔레트 문자열을 만들어
 * 넘겨야 하는데, 그 계산이 렌더 밖(테스트 가능한 곳)에 있어야 한다.
 */

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const part = (channel: number) =>
    Math.round(Math.max(0, Math.min(255, channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * 두 색의 거리(0~441). 실루엣이 배경과 구분되는지 재는 데 쓴다.
 *
 * 사람 눈의 민감도를 반영한 공식이 아니다 — 단순 유클리드 거리다. "확실히
 * 다른가"를 가르는 데는 충분하고, 정확한 색 과학이 필요한 곳이 아니다.
 * 파싱에 실패하면 0(구분 안 됨)으로 본다. 모르면 안전한 쪽이다.
 */
export function colorDistance(a: string, b: string): number {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return 0;
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

/**
 * 두 색을 섞는다. t=0이면 from, t=1이면 to.
 *
 * 파싱에 실패하면 from을 그대로 돌려준다 — 색 하나 때문에 화면이 사라지는 것보다
 * 낫다. 색은 보조 데이터다.
 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;

  const ratio = clamp01(t);
  return toHex(
    a.r + (b.r - a.r) * ratio,
    a.g + (b.g - a.g) * ratio,
    a.b + (b.b - a.b) * ratio,
  );
}

/**
 * WCAG 상대 휘도.
 *
 * 단순 밝기 평균이 아니라 채널마다 다른 가중치와 감마 보정을 쓴다 — 사람 눈은
 * 초록에 가장 민감하고 파랑에 둔하다. 이 공식이 접근성 기준의 근거다.
 */
function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * WCAG 명도 대비(1~21).
 *
 * 본문 글자는 4.5, 큰 글자와 의미 있는 도형은 3 이상이어야 AA를 만족한다
 * (DESIGN_GUIDE 「5.3 색상」).
 *
 * 파싱에 실패하면 1(대비 없음)을 돌려준다 — 모르면 실패로 보는 쪽이 안전하다.
 */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return 1;

  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 이미 그 색으로 그려진 그림 위에, **덧칠된 몫만** 곱으로 뽑아낸다.
 *
 * 하늘 돔의 텍스처에는 시간대 색(`preset.sky`)이 이미 구워져 있다. 거기에
 * 구역 색이 섞인 안개 색을 그대로 곱하면 **같은 색이 두 번** 곱해져 하늘이
 * 통째로 어두워지고 채도가 무너진다.
 *
 * 그래서 비율을 쓴다. `target / base`는 「바탕에서 얼마나 밀렸나」이고, 그것만
 * 곱하면 이미 있는 색은 그대로 두고 밀린 몫만 얹힌다. 밀림이 없으면 1이
 * 나와 아무 일도 일어나지 않는다 — 그 점이 이 방식의 안전판이다.
 *
 * @param strength 0이면 그대로, 1이면 안개와 같은 만큼 민다
 */
export function tintRatio(
  base: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  strength: number,
): { r: number; g: number; b: number } {
  return {
    r: channelRatio(base.r, target.r, strength),
    g: channelRatio(base.g, target.g, strength),
    b: channelRatio(base.b, target.b, strength),
  };
}

/**
 * 한 채널의 비율.
 *
 * 바탕이 0에 가까우면 나눗셈이 폭발한다 — 밤 하늘처럼 어두운 색에서 실제로
 * 그렇다. 그럴 때는 **밀지 않는다**(1)로 둔다. 0으로 나눠 무한대가 되면
 * 그 채널만 하얗게 타 버리는데, 화면에서는 「하늘에 색깔 줄이 그였다」로
 * 보이지 원인이 나눗셈이라고는 안 보인다.
 */
function channelRatio(base: number, target: number, strength: number): number {
  if (base < RATIO_FLOOR) return 1;
  const ratio = target / base;
  return clampRatio(1 + (ratio - 1) * strength);
}

/** 이 아래 밝기에서는 비율을 믿지 않는다 */
const RATIO_FLOOR = 0.02;

/**
 * 비율 상하한.
 *
 * 시간대가 바뀌는 순간에는 안개 색이 아직 이전 시간대에서 따라오는 중이라
 * 비율이 잠깐 크게 튄다. 묶어 두지 않으면 그 한두 프레임에 하늘이 번쩍인다.
 */
function clampRatio(value: number): number {
  return Math.min(1.6, Math.max(0.6, value));
}
