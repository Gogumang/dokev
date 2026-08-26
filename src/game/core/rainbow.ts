/**
 * 어린이 상상 색 — 이펙트가 함께 쓰는 색상환.
 *
 * 세계관이 「아이들의 세상에서는 문제가 도깨비의 모습으로 보인다」이면,
 * **내가 일으키는 일도 아이의 눈으로 보여야 한다.** 그런데 이펙트마다 색이
 * 따로 놀았다 — 화살은 하늘색, 참격은 옥색, 색종이는 금색, 갈고리는 청록.
 * 각자 예쁜 색이지만 **한 사람이 낸 것으로 안 읽힌다.**
 *
 * 색상환 하나를 정하고 이펙트가 전부 그 위를 돈다. 무엇을 하든 무지개가
 * 나온다는 것이 이 게임에서 「나」의 서명이 된다.
 *
 * 팔레트에 걸린 제약 세 가지. 예쁜 색을 고른 것이 아니라 **이 셋을 통과하는
 * 색을 고른 것**이고, `tests/rainbow.test.ts`가 그것을 지킨다:
 *
 * 1. **네 시간대 하늘에서 다 보인다.** 색종이도 화살도 하늘을 배경으로 뜬다.
 * 2. **적 탄(`#ff2f6a`)과 헷갈리지 않는다.** 빨강을 주홍 쪽으로 민 이유가
 *    이것이다 — 정통 빨강은 파랑 채널이 적 탄과 붙어 색거리가 60 밑으로
 *    떨어진다. 내 이펙트가 「피해야 할 것」으로 읽히면 그건 고장이다.
 * 3. **동료 도깨비 몸색과 떨어진다.** 옆에 붙어 다니는 것들이라 겹치면
 *    누가 낸 빛인지 모른다.
 *
 * three.js를 모른다 — 색 문자열만 돌려주고, 재질에 얹는 일은 그리는 쪽이다.
 */

/**
 * 빨 · 주 · 노 · 초 · 파 · 보.
 *
 * 여섯인 이유: 색상환을 한 바퀴 도는 최소 수이면서, 화살 자국이 **두 바퀴**로
 * 열두 마디를 채울 수 있다(`ARROW_TRAIL.segments`).
 */
export const RAINBOW: readonly string[] = [
  "#ff4b1a",
  "#ff8c12",
  "#ffd91f",
  "#35d94a",
  "#3a5cff",
  "#b44cff",
];

/**
 * 아무 정수나 색상환 안으로 감는다.
 *
 * 음수도 감는다 — 시간을 거슬러 세는 자리(꼬리 쪽 마디)에서 실제로 음수가
 * 들어온다. 유한하지 않으면 0으로 떨어진다: 색 하나 때문에 인스턴스가
 * 통째로 사라지는 것보다, 첫 색으로 그려지는 편이 낫다.
 */
export function rainbowIndex(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const size = RAINBOW.length;
  return ((Math.floor(step) % size) + size) % size;
}

/** 그 자리의 색 */
export function rainbowAt(step: number): string {
  return RAINBOW[rainbowIndex(step)];
}

/**
 * 시간에 따라 흐르는 자리.
 *
 * 고정된 색은 **줄무늬**로 보이고 흐르는 색은 **빛이 지나간 자국**으로 보인다.
 * 그 차이가 이 함수 하나다.
 *
 * @param seconds 흐름을 재는 시간(초). 탄의 남은 수명이든 경과 시간이든 된다
 * @param cyclesPerSecond 초당 몇 바퀴 도는가
 * @param offset 시작 자리를 미는 값. 마디마다 다른 색을 주는 데 쓴다
 */
export function rainbowFlow(seconds: number, cyclesPerSecond: number, offset = 0): number {
  return rainbowIndex(offset + seconds * cyclesPerSecond * RAINBOW.length);
}
