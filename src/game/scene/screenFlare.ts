/**
 * 터지는 순간의 색 — 순수 계산.
 *
 * 「화려하다」는 채도가 아니라 **낙차**다. 우리는 후처리의 채도·대비를 상수로
 * 올려 두었고(1.16), 그래서 늘 화려한 대신 **터질 자리가 남지 않았다.**
 * 프레임 관찰도 같은 말을 한다 — 화면이 통째로 원색이 되는 것은 전환 순간뿐이고
 * 평상시 배경은 눌려 있다.
 *
 * 여기서는 **얼마나 터졌는지**만 0~1로 잰다. 그 값을 어떤 색으로 바꿀지는
 * 후처리가 정한다 — 이 파일은 three.js를 모른다.
 */

import type { CombatCues } from "@/game/systems/audio/combat";

export const FLARE = {
  /**
   * 사건별로 올라가는 양.
   *
   * 눕힌 순간이 가장 크다. 때린 것은 자주 일어나므로 작게 둔다 — 크게 주면
   * 전투 내내 화면이 밝은 채로 있고, 그러면 다시 「늘 화려한」 상태가 된다.
   */
  defeatSurge: 1,
  slamSurge: 0.85,
  hurtSurge: 0.6,
  hitSurge: 0.28,
  /**
   * 초당 잦아드는 양.
   *
   * 3.2면 한 번 터진 뒤 약 0.3초에 돌아온다. 느리게 두면 연타할 때 값이 눌러
   * 붙어 **평상시가 절정이 된다.**
   */
  decayPerSecond: 3.2,
} as const;

export interface FlareState {
  /** 지금 얼마나 터져 있는가 (0~1) */
  level: number;
  /** 마지막으로 본 누적 사건 수. 차이만큼만 올린다 */
  seen: CombatCues;
}

export function createFlare(): FlareState {
  return { level: 0, seen: { hits: 0, defeats: 0, hurts: 0, slams: 0 } };
}

/**
 * 이번 프레임의 사건을 **기억에 적고** 잦아든 값을 남긴다.
 *
 * 이름이 `record`로 시작하는 이유: 넘겨받은 상태를 제자리에서 고치기 때문이다.
 * 이 저장소는 그런 함수를 네 동사(project·record·reset·consume)로 묶어 두었고,
 * 검사가 그것을 지킨다 — 배선을 읽을 때 무엇이 바뀌는지 이름에서 보여야 한다.
 *
 * 누적 카운터의 **차이**만 본다. 값 자체를 보면 전투가 길어질수록 화면이
 * 계속 밝아진다.
 */
export function recordFlare(state: FlareState, cues: CombatCues, dt: number): void {
  const surge =
    (cues.defeats - state.seen.defeats) * FLARE.defeatSurge +
    (cues.slams - state.seen.slams) * FLARE.slamSurge +
    (cues.hurts - state.seen.hurts) * FLARE.hurtSurge +
    (cues.hits - state.seen.hits) * FLARE.hitSurge;

  state.seen.hits = cues.hits;
  state.seen.defeats = cues.defeats;
  state.seen.hurts = cues.hurts;
  state.seen.slams = cues.slams;

  // 잦아든 뒤에 이번 사건을 얹는다. 순서가 반대면 같은 프레임에 터진 것이 깎인다
  const decayed = Math.max(0, state.level - FLARE.decayPerSecond * dt);
  state.level = Math.min(1, decayed + Math.max(0, surge));
}
