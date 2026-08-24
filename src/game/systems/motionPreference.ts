/**
 * 저감 모션을 켤지 판단한다.
 *
 * 신호가 둘이다 — 운영체제 설정(`prefers-reduced-motion`)과 게임 안 설정.
 * **둘 중 하나라도 줄여 달라면 줄인다.** 어느 쪽이든 "흔들림을 줄여 달라"는
 * 같은 요청이고, 한쪽을 이기게 하면 껐는데도 흔들리거나 켰는데도 안 켜진다.
 *
 * 실제로 그런 상태였다. 운영체제 설정이 바뀔 때 `matches`만 그대로 넣어서,
 * 게임에서 켜 둔 저감 모션이 조용히 풀렸다.
 */
export function prefersReducedMotion(inGameSetting: boolean, osSetting: boolean): boolean {
  return inGameSetting || osSetting;
}
