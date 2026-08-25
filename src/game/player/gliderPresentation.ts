export interface GliderFrame {
  readonly deployment: number;
  readonly visible: boolean;
  readonly openScale: number;
  readonly roll: number;
  readonly bob: number;
}

export const GLIDER_BODY = {
  panelRadius: 0.72,
  ribRadius: 0.012,
  shaftRadius: 0.025,
  shaftHeight: 0.92,
  knobRadius: 0.045,
  gripRadius: 0.09,
  gripThickness: 0.025,
} as const;

/**
 * 펼침·접힘 감쇠계수(1/s).
 *
 * DESIGN_GUIDE 「모션」의 월드 절차형 VFX 표가 **「100ms 안에 펼쳐진다」**로
 * 적어 두었는데, 계수가 10이던 동안 100ms 시점의 펼침은 63%였고 95%까지
 * 300ms가 걸렸다 — 문서와 화면이 세 배 어긋나 있었다. 30이면 100ms에 95%다.
 *
 * 접는 쪽은 그대로 둔다. 활공을 놓는 순간 우산이 튕기듯 사라지면 「내가 놓은
 * 것」이 아니라 「끊긴 것」으로 보인다.
 */
const OPEN_LAMBDA = 30;
const CLOSE_LAMBDA = 12;

export function createGliderFrame(): GliderFrame {
  return { deployment: 0, visible: false, openScale: 0, roll: 0, bob: 0 };
}

export function stepGliderFrame(
  frame: GliderFrame,
  gliding: boolean,
  dt: number,
  elapsed: number,
  reducedMotion: boolean,
): GliderFrame {
  const target = gliding ? 1 : 0;
  const lambda = gliding ? OPEN_LAMBDA : CLOSE_LAMBDA;
  const deployment = reducedMotion
    ? target
    : frame.deployment + (target - frame.deployment) * (1 - Math.exp(-lambda * dt));
  const settled = deployment < 0.0001 ? 0 : deployment;

  return {
    deployment: settled,
    visible: gliding || settled > 0.02,
    openScale: settled,
    roll: reducedMotion ? 0 : Math.sin(elapsed * 2.2) * 0.035 * settled,
    bob: reducedMotion ? 0 : Math.sin(elapsed * 2.8) * 0.025 * settled,
  };
}
