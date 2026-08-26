/**
 * 상시 표시를 줄이는 규칙 — 순수 함수.
 *
 * DESIGN_GUIDE 「세계가 먼저, UI는 나중에」는 **「플레이 중 고정 HUD는 현재
 * 목표, 상호작용, 메뉴만 노출한다」**로 정해 두었는데, 화면에는 목표·체력·
 * 무기·속도계·미니맵 다섯이 늘 떠 있었다. 규칙을 적어 두고 지키지 않으면
 * 규칙이 아니라 희망이다.
 *
 * 지우는 대신 **필요한 순간에만 띄운다.** 체력은 다치거나 대장 앞에 섰을 때,
 * 무기는 바꾼 직후, 목표 전문은 목표가 바뀐 직후다 — 나머지 시간에는 도시가
 * 화면을 다 쓴다.
 *
 * 다섯 중 둘은 여기 없다. 속도계는 성능 패널로 갔고, **미니맵은 나중에 통째로
 * 걷어냈다** — 띄울 순간을 고르는 것으로는 부족한 물건이었다. 여기서 그 둘을
 * 찾다가 시간을 버리지 않도록 적어 둔다.
 *
 * 시간은 밖에서 받는다. 여기서 시계를 읽으면 검사가 시간을 못 정한다.
 */

export const HUD_FOCUS = {
  /**
   * 체력이 가득 찬 뒤에도 남겨 두는 시간(초).
   *
   * 회복이 끝나는 순간 칸이 사라지면 **다 찼는지 확인할 틈이 없다.** 마지막
   * 칸이 차는 것을 보고 나서 사라져야 「회복됐다」가 화면에 남는다.
   */
  healthLingerSeconds: 3,
  /** 무기를 바꾼 뒤 이름이 남아 있는 시간(초) */
  weaponSeconds: 2.4,
  /**
   * 목표가 바뀐 뒤 전문(힌트·진행 막대까지)이 펼쳐져 있는 시간(초).
   *
   * 읽고 나면 제목과 진행 수만 남는다. 힌트는 한 번 읽으면 되는 글이고,
   * 다시 필요하면 지도에 같은 내용이 있다.
   */
  questSeconds: 9,
  /**
   * 구역 이름이 화면에 머무는 시간(초).
   *
   * 화면 컴포넌트가 들고 있었다 — 「얼마나 띄우는가」는 모양이 아니라 규칙이고,
   * 낭독기 검사가 이 값들을 서로 견준다(해금이 구역보다 길어야 한다).
   */
  districtBannerSeconds: 3.2,
  /** 해금 알림이 머무는 시간(초). 구역 배너보다 길다 — 처음 보는 이름이다 */
  unlockNoticeSeconds: 5,
} as const;

/**
 * 체력을 지금 보여 줄지.
 *
 * `secondsSinceChange`는 체력이 마지막으로 바뀐 뒤 흐른 시간이다 — 회복이
 * 끝나 가득 찬 직후를 「방금 바뀐 것」으로 보아 잠시 더 띄운다.
 */
export function healthVisible(
  hp: number,
  maxHp: number,
  downed: boolean,
  bossEngaged: boolean,
  secondsSinceChange: number,
): boolean {
  if (downed || bossEngaged) return true;
  if (hp < maxHp) return true;
  return secondsSinceChange < HUD_FOCUS.healthLingerSeconds;
}

/** 무기 이름을 지금 보여 줄지. 바꾼 직후에만 뜬다 */
export function weaponVisible(secondsSinceChange: number): boolean {
  return secondsSinceChange < HUD_FOCUS.weaponSeconds;
}

/** 목표 패널을 전문으로 펼쳐 둘지. 지나면 한 줄로 접힌다 */
export function questExpanded(secondsSinceChange: number): boolean {
  return secondsSinceChange < HUD_FOCUS.questSeconds;
}
