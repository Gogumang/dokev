/**
 * 전투가 밖으로 내보내는 것들.
 *
 * `combatSim`은 **싸움을 굴리고**, 여기는 그 결과를 화면·소리·여정으로 **넘긴다.**
 * 갈라 둔 이유는 두 가지다:
 *
 * 1. 이 옮기는 줄들이 프레임 루프 안에 있을 때 **지워도 아무도 몰랐다.** 밖으로
 *    빼야 값으로 잴 수 있고, 이름 규칙(`project`/`record`/`consume`)이 배선까지
 *    지켜 준다.
 * 2. 다 모으니 `combatSim`이 800줄 상한을 넘었다. 상한이 「이건 다른 책임인가」를
 *    대신 물어 줬고, 답은 그렇다였다.
 */

import { attackElapsed, type AttackState, type EnemyState } from "@/game/combat/combatSim";
import type { PlayerCombatState } from "@/game/combat/playerCombat";
import type { Weapon } from "@/game/combat/weapons";

/** HUD가 읽는 플레이어 활력 — 하트와 쓰러짐 표시가 여기서 온다 */
export interface PlayerVitals {
  playerHp: number;
  playerDowned: boolean;
}

/**
 * 플레이어 상태를 화면이 읽는 모양으로 옮긴다.
 *
 * 화면 안(프레임 루프)에서 손으로 적을 때는 **지워도 아무도 몰랐다.** 두 칸뿐인데
 * 화면에서 가장 눈에 띄는 둘이다: 하트가 안 줄면 맞은 줄 모르고, 쓰러짐이
 * 안 나가면 **쓰러졌는데 화면은 멀쩡하다.**
 *
 * 제자리에서 채운다 — 새 객체를 만들면 HUD가 들고 있던 것과 갈라진다.
 */
export function projectPlayerVitals(link: PlayerVitals, state: PlayerCombatState): void {
  link.playerHp = state.hp;
  link.playerDowned = state.downed;
}

/** 프레임 사이를 건너는 한 번짜리 신호들 */
export interface CombatSignals {
  /** 이번 프레임에 공격을 눌렀는가 */
  attackQueued: boolean;
  /** 이번 프레임에 대장의 충격을 맞았는가 */
  bossSlamHit: boolean;
  /**
   * 부른 도깨비가 쌓아 둔 회복량.
   *
   * 불리언이 아니라 **누적값**이다. 소환된 물비늘이 능력을 쓰는 순간과 전투가
   * 체력을 계산하는 순간이 같은 프레임이라는 보장이 없어서, 한 번 켜고 끄는
   * 신호로 두면 프레임이 어긋날 때 회복이 통째로 사라진다.
   */
  summonHeal: number;
}

/**
 * 공격 요청을 **한 번만** 꺼내 쓴다.
 *
 * 누른 쪽(`PlayerRig`)과 쓰는 쪽(`Enemies`)이 다른 컴포넌트라 신호를 공유
 * 객체로 넘긴다. 꺼내면서 비우지 않으면 **한 번 누른 공격이 매 프레임 다시
 * 나간다** — 가만히 서서 계속 휘두르는 그림이 되고, 그건 조작이 아니다.
 *
 * 입력 큐(`consumeJump`·`consumeGrapple`)와 같은 규칙이다. 거기서 큐를 비우지
 * 않는 결함을 찾고 나서, 같은 모양이 여기에도 있는 것을 보고 함께 막았다.
 */
export function consumeAttack(signals: CombatSignals): boolean {
  if (!signals.attackQueued) return false;
  signals.attackQueued = false;
  return true;
}

/**
 * 대장의 충격을 **한 번만** 꺼내 쓴다.
 *
 * 안 비우면 한 번 맞은 충격이 **매 프레임 다시 들어와** 무적 시간이 끝나는
 * 족족 또 맞는다 — 대장 앞에서 아무것도 못 하고 쓰러진다.
 */
export function consumeSlam(signals: CombatSignals): boolean {
  if (!signals.bossSlamHit) return false;
  signals.bossSlamHit = false;
  return true;
}

/**
 * 부른 도깨비의 회복을 **한 번만** 꺼내 쓴다.
 *
 * 비우지 않으면 한 번 쌓인 회복이 매 프레임 다시 들어와, 물비늘 하나만 불러도
 * 그 뒤로 영원히 최대 체력이 된다.
 */
export function consumeSummonHeal(signals: CombatSignals): number {
  const heal = signals.summonHeal;
  signals.summonHeal = 0;
  return heal;
}

/** 적을 때린 결과가 흘러가는 곳 — 소리와 여정이 여기서 읽는다 */
export interface EnemyHitLink {
  cues: { hits: number; defeats: number };
  defeatedTotal: number;
}

/**
 * 이번 휘두르기에 맞은 적들을 기록한다.
 *
 * 화면 안(프레임 루프)에서 손으로 적을 때는 **지워도 아무도 몰랐다.**
 * 소리가 안 나면 **때렸는지 안 때렸는지 귀로 알 수 없고**, 처치 수가 안 늘면
 * 여정이 영영 안 끝난다.
 *
 * **부활은 누적에서 빼지 않는다.** 여정은 「몇 번 쓰러뜨렸나」를 묻지
 * 「몇 기가 누워 있나」를 묻지 않는다 — 그래서 이번 타격으로 넘어간 적만 센다.
 *
 * 소리는 저감 모션과 무관하다 — 모션을 줄인다고 귀까지 막을 이유가 없다.
 * (연출을 걸지 말지는 부르는 쪽이 정한다.)
 */
export function recordEnemyHits(link: EnemyHitLink, struck: readonly EnemyState[]): void {
  for (const enemy of struck) {
    link.cues.hits += 1;
    if (enemy.mood !== "down") continue;
    link.cues.defeats += 1;
    link.defeatedTotal += 1;
  }
}

/**
 * 동료가 이번 프레임에 친 자리들.
 *
 * 동료 넷이 **같은 링을 나눠 쓴다**(`GameScene`이 넷 모두에 `playerLink`를
 * 넘긴다). 그래서 「쳤다」를 불리언 하나로 두면 마지막 하나만 남는다 — 적
 * 표식과 같은 방식으로 **쌓아** 둔다.
 *
 * 자리를 담는 이유: 전투 쪽이 그 자리에서 가장 가까운 적을 찾아 때린다.
 * 동료가 적을 직접 고르면 두 시스템이 서로를 알아야 한다.
 */
export interface CompanionStrikeLink {
  /** x, z 쌍이 이어진다 */
  companionStrikes: Float32Array;
  companionStrikeCount: number;
}

/** 동료 넷이 한 프레임에 한 번씩 쳐도 남는 자리 */
const COMPANION_STRIKE_MAX = 8;

/** 표식 버퍼 길이(x, z 한 쌍씩) */
export const COMPANION_STRIKE_FLOATS = COMPANION_STRIKE_MAX * 2;

/**
 * 동료 하나가 친 자리를 적는다.
 *
 * 넘치면 **버린다.** 넷이 도는 판에서 여덟을 넘길 일이 없고, 넘겼다면
 * 주기가 무너진 것이라 한 프레임 더 치는 것이 답이 아니다.
 */
export function recordCompanionStrike(link: CompanionStrikeLink, x: number, z: number): void {
  if (link.companionStrikeCount >= COMPANION_STRIKE_MAX) return;
  const at = link.companionStrikeCount * 2;
  link.companionStrikes[at] = x;
  link.companionStrikes[at + 1] = z;
  link.companionStrikeCount += 1;
}

/**
 * 쌓인 자리를 꺼내고 비운다.
 *
 * **비우는 것이 핵심이다.** 안 비우면 한 번 친 것이 매 프레임 다시 들어가
 * 동료가 초당 예순 번 때린다.
 */
export function consumeCompanionStrikes(link: CompanionStrikeLink): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < link.companionStrikeCount; i += 1) {
    out.push({ x: link.companionStrikes[i * 2], z: link.companionStrikes[i * 2 + 1] });
  }
  link.companionStrikeCount = 0;
  return out;
}

/** 휘두르기 진행 시간이 흘러가는 곳 — 캐릭터가 자세를 뽑는 데 쓴다 */
export interface AttackTimingLink {
  attackElapsed: number | null;
}

/**
 * 휘두르기 진행 시간을 밖으로 넘긴다.
 *
 * 캐릭터가 이 값으로 **팔이 어디쯤 갔는지**를 정한다. 안 넘기면 휘두르는 동안
 * 자세가 그대로여서 **때리는 시늉조차 안 한다** — 소리는 나고 적은 날아가는데
 * 캐릭터만 가만히 서 있다.
 *
 * `null`은 「지금 안 휘두른다」는 뜻이다. 0으로 바꾸면 **평소에도 휘두르기
 * 시작 자세**로 서 있게 된다 — 없음과 0은 다르다.
 */
export function projectAttackTiming(
  link: AttackTimingLink,
  attack: AttackState,
  /**
   * 무엇을 쏘는지. 안 넘기면 자세가 **시작 무기 길이로 굳는다** — 활은
   * 준비가 네 배 길어서, 실제로는 아직 들어 올리는 중인데 화면에서는 이미
   * 다 내리친 채로 멈춰 선다.
   */
  weapon: Weapon,
): void {
  link.attackElapsed = attackElapsed(attack, weapon);
}

/** 부활 신호가 오가는 자리 */
export interface RespawnLink {
  respawnRequested: boolean;
}

/**
 * 부활 요청을 **한 번만** 꺼낸다.
 *
 * 전투 쪽은 플레이어의 스폰 지점을 모르므로 신호만 보내고, 자리를 아는 쪽이
 * 받아서 옮긴다. 꺼내면서 비우지 않으면 **매 프레임 스폰 지점으로 끌려가
 * 아예 움직일 수 없다.**
 *
 * 부르는 쪽은 이것을 **이동 계산 앞에서** 해야 한다. 뒤에 두면 한 프레임 동안
 * 죽은 자리에서 조작이 먹는다 — 그 순서는 씬이 지킬 몫이라 여기서 못 잰다.
 */
export function consumeRespawn(link: RespawnLink): boolean {
  if (!link.respawnRequested) return false;
  link.respawnRequested = false;
  return true;
}

/* ------------------------------------------------------------------ *
 * 전투가 얼마나 가까운가
 *
 * `cameraRig`에 있던 계산이다. 카메라만 쓰는 값일 때는 거기가 맞았는데, 군중도
 * 같은 것을 알아야 하게 되면서 **장면 코드를 세계가 import하는** 모양이 됐다.
 * 전투가 밖으로 내보내는 값이므로 이 파일이 제자리다.
 * ------------------------------------------------------------------ */

/**
 * 지금 얼마나 전투 한복판인가 (0~1).
 *
 * 지도에 찍는 적 좌표를 그대로 읽는다 — 전투 쪽에서 이미 매 프레임 채우는
 * 값이라 새 신호를 만들 이유가 없다. 대장은 저 목록에 없어서 따로 받는다.
 *
 * **버퍼 길이가 아니라 개수를 본다.** 표식 버퍼는 고정 길이라 쓰러진 적의
 * 좌표가 뒤에 남는다 — 그것까지 세면 아무도 없는 자리에서 카메라가 물러난다.
 */
export function combatPressure(
  blips: Float32Array,
  count: number,
  playerX: number,
  playerZ: number,
  bossEngaged: boolean,
  radius: number,
): number {
  if (bossEngaged) return 1;

  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const dx = blips[i * 2] - playerX;
    const dz = blips[i * 2 + 1] - playerZ;
    const distance = Math.hypot(dx, dz);
    if (distance < nearest) nearest = distance;
  }

  if (!Number.isFinite(nearest) || nearest >= radius) return 0;
  // 붙을수록 1에 가깝다. 반경 끝에서는 0이라 경계에서 툭 끊기지 않는다
  return 1 - nearest / radius;
}
