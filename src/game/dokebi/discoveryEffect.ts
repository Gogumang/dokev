/**
 * 도깨비를 만나는 순간의 연출 곡선 — 순수 함수.
 *
 * 지금까지는 만나는 즉시 자리가 사라졌다. 화면에서 지워지는 것으로 만남을
 * 표현한 셈이라, 가장 공들여 찾아간 순간이 가장 밋밋했다.
 *
 * 곡선만 여기서 계산하고 그리는 일은 Shrine이 한다 — three 없이 검증하기 위해서다.
 */

/** 사라지는 데 걸리는 시간(초) */
export const DISSOLVE_SECONDS = 1.4;

export interface DissolveState {
  /** 구슬 크기 배율 */
  orbScale: number;
  /** 구슬이 떠오르는 높이(m) */
  orbLift: number;
  /** 빛기둥 투명도 배율 0~1 */
  beamFade: number;
  /** 돌무더기 투명도 배율 0~1 */
  baseFade: number;
  /** 연출이 끝났는지 */
  done: boolean;
}

/**
 * 경과 시간으로 연출 상태를 구한다.
 *
 * 구슬은 **커지면서 떠오르고**, 빛기둥은 먼저 꺼진다. 순서를 어긋나게 둔 이유:
 * 셋이 동시에 사라지면 "꺼졌다"로 보이고, 구슬만 남아 떠오르면 "따라왔다"로
 * 읽힌다. 같은 1.4초라도 무엇이 마지막에 남느냐가 인상을 정한다.
 */
export function dissolveState(elapsedSeconds: number): DissolveState {
  const t = Math.max(0, Math.min(1, elapsedSeconds / DISSOLVE_SECONDS));

  // 빛기둥은 앞쪽 60%에서 다 꺼진다.
  const beamFade = Math.max(0, 1 - t / 0.6);
  // 돌무더기는 그보다 조금 늦게, 끝까지 남지는 않는다.
  const baseFade = Math.max(0, 1 - t / 0.85);

  return {
    // 커지다가 마지막에 급히 사라진다 — 부풀었다 터지는 인상.
    orbScale: t < 0.8 ? 1 + t * 1.6 : Math.max(0, (1 - t) * 12.8),
    orbLift: t * t * 3.2,
    beamFade,
    baseFade,
    done: elapsedSeconds >= DISSOLVE_SECONDS,
  };
}

/* ------------------------------------------------------------------ *
 * 흩어지는 빛 알갱이
 *
 * 구슬 하나만 떠오르면 조용하다. 알갱이가 함께 퍼져야 "무언가 풀려났다"로
 * 읽힌다. Enemies의 색종이와 같은 방식이지만, 여기서는 개수가 고정이고
 * 수명이 연출과 같으므로 풀을 돌리지 않고 위치를 계산해서 쓴다.
 * ------------------------------------------------------------------ */

/** 알갱이 수. 늘리면 화면이 지저분해지고 줄이면 눈에 안 띈다 */
export const MOTE_COUNT = 18;

export interface MotePosition {
  x: number;
  y: number;
  z: number;
  /** 0이면 사라진 것 */
  scale: number;
}

/**
 * 알갱이 하나의 위치를 구한다.
 *
 * 난수를 쓰지 않는다 — 인덱스로 방향을 흩어 두면 매번 같은 모양이 나오고,
 * 그래야 연출을 눈으로 검토할 수 있다. 같은 이유로 대사도 카운터로 고른다.
 */
export function motePosition(index: number, elapsedSeconds: number): MotePosition {
  const t = Math.max(0, Math.min(1, elapsedSeconds / DISSOLVE_SECONDS));

  // 황금각으로 흩는다. 등간격이면 바퀴살처럼 보이고, 난수면 뭉친다.
  const angle = index * 2.399963;
  // 위로 갈수록 좁아지는 원뿔. 층을 나눠 같은 높이에 몰리지 않게 한다.
  const tilt = 0.35 + ((index % 3) / 3) * 0.5;

  const spread = t * 2.6 * tilt;
  const rise = t * (1.4 + (index % 5) * 0.35);

  return {
    x: Math.sin(angle) * spread,
    y: 0.9 + rise,
    z: Math.cos(angle) * spread,
    // 끝에서 급히 사라진다. 서서히 줄면 잔상이 지저분하다.
    scale: t > 0.75 ? Math.max(0, (1 - t) * 4) : 1,
  };
}

/* ------------------------------------------------------------------ *
 * 카메라 숨
 *
 * 만난 순간을 카메라로도 표시한다. 위치나 각도를 건드리지 않고 **시야각만**
 * 잠깐 넓혔다 되돌린다 — 조작 중에 카메라가 움직이면 그건 연출이 아니라
 * 조작을 빼앗는 것이다. 시야각은 손에서 감각을 빼앗지 않는다.
 * ------------------------------------------------------------------ */

/** 카메라 숨이 이어지는 시간(초). 소멸 연출보다 짧다 — 먼저 끝나야 여운이 남는다 */
export const FOV_PULSE_SECONDS = 0.9;

/** 최대로 넓어지는 각도(도) */
const FOV_PULSE_DEGREES = 5.5;

/**
 * 경과 시간에 따라 더할 시야각(도).
 *
 * 빠르게 열리고 천천히 닫힌다. 반대로 하면 "놀랐다"가 아니라 "줌 아웃"이 된다.
 */
export function fovPulse(elapsedSeconds: number): number {
  if (elapsedSeconds < 0 || elapsedSeconds >= FOV_PULSE_SECONDS) return 0;

  const t = elapsedSeconds / FOV_PULSE_SECONDS;
  // 앞 20%에서 최대까지 열고, 나머지 80%에 걸쳐 닫는다.
  const shape = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
  return FOV_PULSE_DEGREES * shape;
}

/**
 * 빛기둥의 불투명도.
 *
 * 0.11 ± 0.04였다. 22m 앞에 서서 노을·밤 양쪽으로 봤지만 **아무것도 보이지
 * 않았다** — 가산 합성이라 밝은 거리 위에 더해지는 양이 거의 없었다.
 * 「골목에서 보이는 신호」가 존재 자체를 알리지 못했다.
 *
 * 숨쉬는 폭은 밑바닥의 4분의 1을 넘기지 않는다. 폭이 크면 신호가 아니라
 * 경고등처럼 보인다 — 문제는 흔들림이 아니라 밝기였다.
 */
export const BEAM_BASE_OPACITY = 0.28;
export const BEAM_BREATH_AMPLITUDE = 0.06;
/** 숨쉬기 주기(rad/s). 느려야 신호로 읽힌다 */
const BEAM_BREATH_SPEED = 0.9;

export function beamOpacity(elapsedSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return BEAM_BASE_OPACITY + BEAM_BREATH_AMPLITUDE / 3;
  return BEAM_BASE_OPACITY + Math.sin(elapsedSeconds * BEAM_BREATH_SPEED) * BEAM_BREATH_AMPLITUDE;
}
