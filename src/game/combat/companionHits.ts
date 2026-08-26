/**
 * 동료가 친 자리를 **로봇과 대장에게 나눠 먹인다** — 그림 없는 판정만.
 *
 * 동료 쪽은 자리만 적는다(`recordCompanionStrike`). 어디를 쳤는지는 하나인데
 * 맞을 것은 둘이라(적 목록은 전투 안에, 대장은 보스 쪽에) 그 나눔이 어디에도
 * 자리가 없었다. `Enemies.tsx`에 그냥 늘어놓으니 **자리를 두 번 꺼내는 실수**가
 * 바로 나왔다 — 앞에서 비우고 뒤에서 빈 목록을 받아 대장은 영영 안 맞는다.
 *
 * 꺼내는 일 자체는 여기로 안 가져온다. 한 번짜리 신호를 꺼내는 함수는
 * **프레임 루프가 있는 파일에서** 불려야 한다는 규칙이 있고(`stateBoundaries`),
 * 여기로 옮기면 그 검사가 배선이 끊긴 것과 구별하지 못한다.
 *
 * 색종이와 소리는 부르는 쪽 몫이다 — 이 파일은 three.js도 React도 모른다.
 */

import { resolveCompanionStrikes, type EnemyState } from "@/game/combat/combatSim";
import type { BossBoltLink } from "@/game/combat/bossSim";
import { companionBossDamage, COMPANION_STRIKE } from "@/game/dokebi/companionStrike";

/**
 * 동료 타격이 대장에 대해 알아야 하는 것.
 *
 * `summonAtBoss`가 `bossSim`이 아니라 여기 있는 이유: 저 깃발은 대장의 상태가
 * 아니라 **소환과 동료 타격 사이의 약속**이다. 대장 쪽에 두면 대장이 우리 편
 * 두 시스템의 사정을 알아야 한다.
 */
export interface CompanionBossLink extends BossBoltLink {
  /** 도깨비가 대장 쪽에 나가 있는가(소환 중). 나가 있으면 곁에서는 안 때린다 */
  summonAtBoss: boolean;
}

export interface CompanionHits {
  /** 이번 프레임에 맞은 로봇들. 제자리에서 이미 고쳐졌다 */
  struck: EnemyState[];
  /** 대장에게 들어간 피해. 이미 `bossBoltDamage`에 실어 두었다 */
  bossDamage: number;
}

/**
 * 동료의 타격을 한 프레임 처리한다.
 *
 * 대장 피해는 탄과 **같은 통로**(`bossBoltDamage`)로 넣는다 — 대장 쪽이 한
 * 프레임 치를 한 번에 꺼내 비틀거림도 한 번만 센다. 따로 통로를 내면 같은
 * 프레임에 두 번 맞은 것으로 세어 대장이 계속 비틀거린다.
 */
export function recordCompanionHits(
  link: CompanionBossLink,
  /** 동료가 이번 프레임에 친 자리. 꺼내는 것은 프레임 루프 쪽 몫이다 */
  spots: readonly { x: number; z: number }[],
  enemies: EnemyState[],
  /** 대장 몸 반지름(m). 몸이 커서 중심까지 닿을 필요가 없다 */
  bossRadius: number,
): CompanionHits {
  const struck = resolveCompanionStrikes(
    enemies,
    spots,
    COMPANION_STRIKE.reachMeters,
    COMPANION_STRIKE.damage,
    COMPANION_STRIKE.knockbackScale,
  );

  /*
   * 도깨비가 대장 쪽에 나가 있으면(`summonAtBoss`) 여기서는 안 넣는다.
   *
   * 같은 넷이 대장 둘레에서 역할을 쓰는 중이다. 양쪽에서 다 때리면 화면에
   * 보이는 것보다 두 배로 깎이고, 12 체력이 3~4초에 사라진다 — 예고를 보고
   * 피하는 것이 이 싸움의 전부인데 피할 싸움 자체가 없어진다.
   */
  const bossDamage =
    link.bossHittable && !link.summonAtBoss
      ? companionBossDamage(spots, link.bossX, link.bossZ, bossRadius)
      : 0;
  link.bossBoltDamage += bossDamage;

  return { struck, bossDamage };
}
