/**
 * 도깨비 자리 치수.
 *
 * `Shrine.tsx`에 숫자로 박혀 있던 것을 옮긴다. 돌탑처럼 아래가 넓고 위로
 * 갈수록 좁아지는 형태라, **층끼리의 관계**가 곧 모양이다 — 한 층만 만지면
 * 탑이 아니라 기둥이 된다.
 *
 * 빛기둥 높이(`BEAM_HEIGHT`)는 `Shrine.tsx`가 다른 계산에도 쓰므로 그대로 둔다.
 *
 * 값은 옮기기만 했다.
 */

export const SHRINE_BODY = {
  /** 아래 층 — 위/아래 반지름과 두께 */
  baseTopRadius: 1.1,
  baseBottomRadius: 1.3,
  baseHeight: 0.3,
  middleTopRadius: 0.75,
  middleBottomRadius: 0.95,
  middleHeight: 0.28,
  topTopRadius: 0.42,
  topBottomRadius: 0.62,
  topHeight: 0.26,
  /** 꼭대기 구슬 */
  orbRadius: 0.34,
  /** 떠다니는 빛 알갱이 */
  moteRadius: 0.09,
  /** 빛기둥의 위/아래 반지름 */
  beamTopRadius: 0.55,
  beamBottomRadius: 0.75,
} as const;
