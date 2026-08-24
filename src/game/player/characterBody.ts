/**
 * 플레이어 몸 치수.
 *
 * 원래는 `Character.tsx`의 지오메트리 생성부에 숫자로 박혀 있었다 —
 * `new THREE.CapsuleGeometry(0.19, 0.3, 4, 12)`처럼. 그래서 **검사할 대상이
 * 없었고**, 실제로 값을 아홉 배로 늘려도 모든 검사가 통과했다.
 *
 * 보행자(`PED_BODY`)는 이미 이렇게 이름 붙여 두었다. 같은 자리에 같은 방식을
 * 쓴다 — 이름이 붙으면 비례를 확인할 수 있고, 무엇보다 `0.19`가 무엇인지
 * 읽을 수 있게 된다.
 *
 * 값은 옮기기만 했다. 하나도 바꾸지 않았다.
 */

export const PLAYER_BODY = {
  /** 머리 반지름 */
  headRadius: 0.2,
  /** 머리카락. 머리보다 조금 커야 감싼 것으로 보인다 */
  hairRadius: 0.215,
  /** 몸통 캡슐의 반지름과 원통 길이 */
  torsoRadius: 0.19,
  torsoLength: 0.3,
  armRadius: 0.062,
  armLength: 0.3,
  legRadius: 0.075,
  legLength: 0.3,
  /** 신발 상자 (가로·높이·앞뒤) */
  shoeWidth: 0.15,
  shoeHeight: 0.1,
  shoeDepth: 0.24,
  /** 가방 */
  bagWidth: 0.26,
  bagHeight: 0.3,
  bagDepth: 0.14,
  /** 보드 상판. 앞뒤가 길어야 올라선 것으로 보인다 */
  deckWidth: 0.34,
  deckHeight: 0.045,
  deckLength: 1.15,
  /** 트럭(바퀴 축) */
  truckWidth: 0.26,
  truckHeight: 0.1,
  truckDepth: 0.09,
  wheelRadius: 0.06,
  wheelWidth: 0.05,
} as const;

/**
 * 타는 것들의 치수(m).
 *
 * 캐릭터 몸과 같은 이유로 여기 모은다 — 형상 생성자에 숫자를 그대로 적으면
 * **무엇을 재는 값인지 이름이 없어** 고칠 때 무엇이 같이 움직여야 하는지
 * 알 수 없다. 검사가 `new THREE.…Geometry(0.…)`를 잡는다.
 *
 * 보드 치수는 위 `PLAYER_BODY`에 이미 있다 — 원래 캐릭터 안에 있던 것이라
 * 거기서 자랐고, 옮기면 이름만 흩어진다.
 */
export const VEHICLE_BODY = {
  /** 킥보드 발판 — 보드보다 좁고 짧다 */
  plateWidth: 0.2,
  plateHeight: 0.05,
  plateLength: 0.82,
  /** 기둥·안장 기둥이 함께 쓰는 가는 막대. 높이는 배율로 줄여 쓴다 */
  postSide: 0.05,
  postHeight: 1,
  /** 손잡이 */
  barWidth: 0.52,
  barThickness: 0.045,
  /** 자전거 바퀴 — 킥보드 바퀴보다 다섯 배 크다 */
  bikeWheelRadius: 0.33,
  bikeWheelWidth: 0.05,
  /** 자전거 가로대 */
  bikeBarSide: 0.05,
  bikeBarLength: 0.86,
  /** 안장 */
  saddleWidth: 0.14,
  saddleHeight: 0.06,
  saddleDepth: 0.26,
  /*
   * 장난감 자동차 — 아이가 들어가 앉는 크기다. 실루엣이 「자동차」로 읽히려면
   * 폭보다 길이가 확실히 길어야 한다.
   */
  carWidth: 0.86,
  carHeight: 0.42,
  carLength: 1.35,
  carWheelRadius: 0.19,
  carWheelWidth: 0.11,
  /*
   * 조랑말 — 제주 조랑말은 어깨높이가 1.1m 안팎이라 아이가 올라탈 수 있다.
   * 다리를 굵고 짧게 두어 말이 아니라 **조랑말**로 보이게 한다.
   */
  ponyBodyWidth: 0.52,
  ponyBodyHeight: 0.56,
  ponyBodyLength: 1.25,
  ponyLegSide: 0.16,
  ponyLegHeight: 0.62,
  ponyNeckSide: 0.26,
  ponyNeckHeight: 0.5,
  ponyHeadWidth: 0.24,
  ponyHeadHeight: 0.26,
  ponyHeadLength: 0.42,
  /*
   * 제트스키 — 물에 뜨는 것이라 바퀴가 없다. 몸통이 바닥에서 시작한다.
   *
   * 길이 1.95m는 다른 탈것보다 확실히 길다(자전거 1.7m 남짓). 실루엣이
   * 갈려야 물 위의 점 하나가 무엇인지 멀리서도 읽힌다.
   */
  skiHullWidth: 0.62,
  skiHullHeight: 0.4,
  skiHullLength: 1.95,
  /** 뱃머리 — 앞으로 갈수록 좁고 낮다. 한 칸으로 흉내 낸다 */
  skiBowWidth: 0.38,
  skiBowHeight: 0.22,
  skiBowLength: 0.5,
  /** 안장 — 뒤쪽에 얹혀 앉는 자리를 만든다 */
  skiSeatWidth: 0.44,
  skiSeatHeight: 0.24,
  skiSeatLength: 0.8,
  /** 손잡이 기둥과 가로대 */
  skiPostSide: 0.16,
  skiPostHeight: 0.34,
  skiBarWidth: 0.5,
  skiBarThickness: 0.06,
} as const;
