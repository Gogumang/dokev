/**
 * 화살이 남기는 무지개 자국 — 순수 계산.
 *
 * 활이 시작 무기이자 주력이 되면서(`WEAPON_ORDER`), 35m를 나는 그 궤적이
 * 화면에서 가장 오래 보이는 것이 됐다. 지금은 팔면체 하나가 지나갈 뿐이라
 * **쏜 것이 어디로 갔는지**가 안 읽힌다 — 특히 도시 블록 건너까지 닿을 때.
 *
 * 이미지 에셋을 쓰지 않는다(DESIGN_GUIDE 「모션」의 월드 절차형 VFX). 화살 뒤에
 * 마디를 몇 개 세우고 색상환을 따라 돌리면 리본이 된다.
 *
 * three를 모른다. 여기서 나오는 것은 **자리와 색**뿐이고, 그리는 일은 밖이다 —
 * 그래야 「무지개가 화살 뒤에 있는가」를 화면 없이 잴 수 있다.
 */

export const ARROW_TRAIL = {
  /**
   * 마디 수.
   *
   * 색 여섯의 **두 바퀴**다. 여섯 마디로 만들었더니 리본이 1.9m라 22m/s로
   * 나는 화살 뒤에서 **점 하나**로 보였다 — 화면에서 재 보고 늘렸다. 늘리면
   * 인스턴스가 탄 수만큼 곱해진다(열두 발 × 열둘 = 144).
   */
  segments: 12,
  /** 마디 사이 간격(m). 화살 속도(22m/s)에서 끊겨 보이지 않을 만큼 촘촘하다 */
  spacingMeters: 0.55,
  /** 첫 마디의 크기 배율. 화살(반지름 0.22m)보다 크게 잡아야 리본으로 읽힌다 */
  headScale: 1.6,
  /** 마지막 마디의 크기 배율 */
  tailScale: 0.25,
  /** 첫 마디의 불투명도 */
  headOpacity: 1,
  /**
   * 색이 흐르는 속도(바퀴/초).
   *
   * 0이면 마디마다 색이 고정돼 **줄무늬 막대**가 된다. 흘러야 「빛이 지나간
   * 자국」으로 읽힌다.
   */
  flowPerSecond: 2.4,
} as const;

/** 색상환을 도는 여섯 색. 채도를 낮춰 도시 팔레트 위에서 튀지 않게 한다 */
export const RAINBOW: readonly string[] = [
  "#ff6b6b",
  "#ffa94d",
  "#ffe066",
  "#69db7c",
  "#4dabf7",
  "#b197fc",
];

/** 마디 하나가 그려질 자리와 모습 */
export interface TrailSegment {
  /** 화살 기준 뒤쪽으로 물러난 거리(m). 그리는 쪽이 진행 방향에 곱해 쓴다 */
  readonly back: number;
  readonly scale: number;
  readonly opacity: number;
  /** `RAINBOW`의 몇 번째 색인가 */
  readonly colorIndex: number;
}

/**
 * 마디 하나를 계산한다.
 *
 * @param index 0이 화살에 가장 가까운 마디
 * @param life 그 화살의 남은 수명(초). 색이 이 값을 따라 흐른다
 * @param reducedMotion 저감 모션이면 색을 고정한다 — 흐르는 색은 어지럼의 원인이다
 */
export function trailSegment(index: number, life: number, reducedMotion: boolean): TrailSegment {
  const t = ARROW_TRAIL.segments <= 1 ? 0 : index / (ARROW_TRAIL.segments - 1);

  /*
   * 색은 **뒤로 갈수록** 다음 색이고, 시간이 지나면 전체가 한 칸씩 민다.
   * 저감 모션에서는 시간 항을 뺀다 — 자리는 그대로라 리본은 여전히 무지개다.
   */
  const flow = reducedMotion ? 0 : Math.floor(life * ARROW_TRAIL.flowPerSecond * RAINBOW.length);
  const colorIndex = (((index + flow) % RAINBOW.length) + RAINBOW.length) % RAINBOW.length;

  return {
    back: ARROW_TRAIL.spacingMeters * (index + 1),
    scale: ARROW_TRAIL.headScale + (ARROW_TRAIL.tailScale - ARROW_TRAIL.headScale) * t,
    // 꼬리는 완전히 사라진다 — 남아 있으면 리본이 아니라 막대다
    opacity: ARROW_TRAIL.headOpacity * (1 - t),
    colorIndex,
  };
}

/** 그리는 쪽이 잡아 둬야 하는 인스턴스 수 */
export function trailInstanceCount(maxBolts: number): number {
  return maxBolts * ARROW_TRAIL.segments;
}
