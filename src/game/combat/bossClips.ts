/**
 * 대장의 단계에 맞는 동작 고르기 — 순수 함수.
 *
 * 플레이어(`characterClips.ts`)와 같은 자리다: **파일 속 이름과 글자 그대로
 * 맞아야 하는 계약**이고, 어긋나면 재생이 조용히 안 된다 — 예외도 오류도 없이
 * 대장이 굳은 채로 미끄러진다.
 *
 * 플레이어와 다른 점: 여기서는 고를 것이 **단계 하나**뿐이다. 속도·접지·감정을
 * 볼 필요가 없다 — 시뮬레이션(`bossSim`)이 이미 일곱 단계로 정리해 준다.
 */

import type { BossPhase } from "@/game/combat/bossSim";

/**
 * 파일에 들어 있는 동작 이름.
 *
 * 일곱 단계에 일곱 동작이다. 원본에는 `Running`도 있었지만 **뺐다** — 대장은
 * 2.2m/s로 움직인다(`BOSS.speed`). 그건 달리기가 아니라 걷기이고, 안 쓰는
 * 동작은 받기만 하고 안 트는 용량이다.
 */
export const BOSS_CLIP = {
  idle: "Idle_03",
  /** 쫓아올 때. 2.2m/s는 걷는 속도다 */
  chase: "Walking",
  /**
   * 예고. 던지려고 팔을 드는 동작이 그대로 「내려친다」의 예고가 된다 —
   * 1.1초 동안 팔이 올라가는 것이 **피할 때를 아는** 유일한 단서다.
   */
  windup: "baseball_pitching",
  slam: "Axe_Spin_Attack",
  /** 내려친 뒤 빈틈. 이때가 때릴 시간이다 */
  recover: "Skill_03",
  stagger: "Skill_01",
  down: "falling_down",
} as const;

export type BossClipName = (typeof BOSS_CLIP)[keyof typeof BOSS_CLIP];

/** 지금 단계에 맞는 동작 */
export function bossClipFor(phase: BossPhase): BossClipName {
  return BOSS_CLIP[phase];
}

/**
 * 끝 자세에서 멈추는 동작인지.
 *
 * 쓰러짐은 **한 번만** 재생하고 그 자리에 머물러야 한다. 반복하면 넘어진
 * 대장이 25초 동안 계속 다시 넘어진다.
 */
export function holdsLastFrame(clip: BossClipName): boolean {
  return clip === BOSS_CLIP.down;
}

/**
 * 재생 속도.
 *
 * 예고는 **정확히 `BOSS.windupSeconds` 동안** 팔이 올라가야 한다. 동작이 그보다
 * 길거나 짧으면 그림과 판정이 갈라져서, 팔이 아직 올라가는 중에 맞거나 다
 * 내려친 뒤에 판정이 온다 — 예고의 목적이 통째로 사라진다.
 *
 * @param clipSeconds 동작 자체의 길이(초)
 * @param phaseSeconds 그 단계가 실제로 지속되는 시간(초). 0이면 늘리지 않는다
 */
export function bossPlaybackRate(clipSeconds: number, phaseSeconds: number): number {
  if (clipSeconds <= 0 || phaseSeconds <= 0) return 1;
  return clipSeconds / phaseSeconds;
}
