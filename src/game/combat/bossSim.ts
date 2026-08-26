/**
 * 미니 보스 「고물 대장」 — 순수 시뮬.
 *
 * TRAILER_FEATURE_ANALYSIS 「6.2 두 번째 단계 후보」의 마지막 미구현 항목이다.
 *
 * 일반 로봇과 다른 점은 체력이 아니라 **리듬**이다. 체력만 늘리면 같은 싸움이
 * 길어질 뿐이다. 크게 휘두르기 전에 예고 동작이 있고, 그 뒤에 빈틈이 생긴다 —
 * 피하고 때리는 박자를 배우는 것이 이 싸움의 내용이다.
 *
 * three.js에 의존하지 않는다.
 */

import { blockCenter } from "@/game/world/cityLayout";
import { SITE_BLOCK_INDEX } from "@/game/world/zones";

export const BOSS = {
  /** 최대 체력. 일반 로봇(2)보다 훨씬 두껍다 */
  maxHp: 12,
  /** 인지 반경(m) */
  aggroRadius: 22,
  /** 이 거리 안으로 들어오면 내려친다 */
  slamRange: 4.6,
  /** 내려친 충격이 닿는 반경(m). 사거리보다 넓다 — 붙어 있으면 못 피한다 */
  slamRadius: 6.2,
  /** 예고 시간(초). 길어야 피할 수 있다 */
  windupSeconds: 1.1,
  /** 충격 판정이 살아 있는 시간(초) */
  slamSeconds: 0.18,
  /** 내려친 뒤 빈틈(초). 이때가 때릴 시간이다 */
  recoverSeconds: 1.6,
  /** 이동 속도(m/s). 느려야 거리를 벌 수 있다 */
  speed: 2.2,
  turnRate: 1.8,
  /** 이만큼 연속으로 맞으면 비틀거린다 */
  staggerHits: 3,
  /** 비틀거리는 시간(초) */
  staggerSeconds: 2.2,
  /** 쓰러진 뒤 다시 일어나기까지(초). 일반 로봇보다 훨씬 길다 */
  downSeconds: 25,
} as const;

/**
 * 보스가 서 있는 자리 — **공사장 한복판.**
 *
 * 도로 교차로에 세워 두었었다. 교차로는 13×13m인데 `slamRadius`가 6.2m라
 * **물러설 자리가 없었다** — 예고를 보고 피하는 것이 이 싸움의 전부인데,
 * 사방이 건물이면 예고 링은 장식이 된다. 이제 건물을 세우지 않는 블록
 * 하나(34m)의 한가운데에 선다(`ZONES.site`).
 *
 * 좌표를 손으로 적지 않는다. 구역이 옮겨 가면 대장도 따라가야 하고, 두 곳에
 * 적으면 표식과 실제 위치가 어긋나 지도를 보고 찾아간 사람이 빈 터에 선다.
 */
const SITE_CENTER = blockCenter(SITE_BLOCK_INDEX);
export const BOSS_HOME = { x: SITE_CENTER.cx, z: SITE_CENTER.cz } as const;

export type BossPhase = "idle" | "chase" | "windup" | "slam" | "recover" | "stagger" | "down";

export interface BossState {
  x: number;
  z: number;
  facing: number;
  phase: BossPhase;
  hp: number;
  /** 현재 단계가 끝나기까지 남은 시간(초) */
  timer: number;
  /** 비틀거림까지 남은 타격 수 */
  hitsUntilStagger: number;
  /** 걸음 흔들림 위상 */
  bobPhase: number;
  homeX: number;
  homeZ: number;
}

export function createBoss(x: number, z: number): BossState {
  return {
    x,
    z,
    facing: 0,
    phase: "idle",
    hp: BOSS.maxHp,
    timer: 0,
    hitsUntilStagger: BOSS.staggerHits,
    bobPhase: 0,
    homeX: x,
    homeZ: z,
  };
}

function shortestDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * 한 프레임 진행한다.
 *
 * 단계 순서가 곧 규칙이다 — 예고 중에는 돌지 않고(피할 방향을 고정해 준다),
 * 빈틈에는 반격하지 않는다(때릴 시간을 준다).
 */
export function stepBoss(
  state: BossState,
  playerX: number,
  playerZ: number,
  dt: number,
): BossState {
  const timer = state.timer - dt;
  const dx = playerX - state.x;
  const dz = playerZ - state.z;
  const distance = Math.hypot(dx, dz);

  if (state.phase === "down") {
    if (timer > 0) return { ...state, timer };
    return { ...createBoss(state.homeX, state.homeZ) };
  }

  if (state.phase === "stagger" || state.phase === "recover") {
    if (timer > 0) return { ...state, timer };
    return { ...state, phase: "chase", timer: 0, hitsUntilStagger: BOSS.staggerHits };
  }

  if (state.phase === "windup") {
    // 예고 중에는 방향을 고정한다. 따라 돌면 피할 방향이 없다.
    if (timer > 0) return { ...state, timer };
    return { ...state, phase: "slam", timer: BOSS.slamSeconds };
  }

  if (state.phase === "slam") {
    if (timer > 0) return { ...state, timer };
    return { ...state, phase: "recover", timer: BOSS.recoverSeconds };
  }

  if (distance > BOSS.aggroRadius) {
    return { ...state, phase: "idle", timer: 0, bobPhase: state.bobPhase + dt * 1.2 };
  }

  const facing =
    state.facing +
    Math.max(
      -BOSS.turnRate * dt,
      Math.min(BOSS.turnRate * dt, shortestDelta(state.facing, Math.atan2(dx, dz))),
    );

  if (distance <= BOSS.slamRange) {
    return { ...state, facing, phase: "windup", timer: BOSS.windupSeconds };
  }

  const step = BOSS.speed * dt;
  return {
    ...state,
    x: state.x + (dx / distance) * step,
    z: state.z + (dz / distance) * step,
    facing,
    phase: "chase",
    timer: 0,
    bobPhase: state.bobPhase + dt * 4,
  };
}

/** 지금 충격 판정이 살아 있는지 */
export function isSlamActive(state: BossState): boolean {
  return state.phase === "slam";
}

/** 내려친 충격이 플레이어에게 닿는지 */
export function slamHits(state: BossState, playerX: number, playerZ: number): boolean {
  if (!isSlamActive(state)) return false;
  return Math.hypot(playerX - state.x, playerZ - state.z) <= BOSS.slamRadius;
}

/** 지금 때릴 수 있는 상태인지. 쓰러져 있으면 그만 때린다 */
export function isVulnerable(state: BossState): boolean {
  return state.phase !== "down";
}

export interface BossHit {
  state: BossState;
  /** 이번 타격으로 쓰러졌는지 */
  downed: boolean;
  /** 이번 타격으로 비틀거리기 시작했는지 */
  staggered: boolean;
}

/**
 * 한 대 때린다.
 *
 * 예고와 충격 중에는 비틀거리게 만들 수 없다 — 그러면 예고를 보고 때리는 것이
 * 항상 정답이 되어 피할 이유가 사라진다.
 */
export function damageBoss(state: BossState, amount = 1): BossHit {
  if (!isVulnerable(state)) return { state, downed: false, staggered: false };

  const hp = Math.max(0, state.hp - amount);
  if (hp <= 0) {
    return {
      state: { ...state, hp, phase: "down", timer: BOSS.downSeconds },
      downed: true,
      staggered: false,
    };
  }

  const canStagger = state.phase !== "windup" && state.phase !== "slam";
  const hitsUntilStagger = canStagger ? state.hitsUntilStagger - 1 : state.hitsUntilStagger;

  if (canStagger && hitsUntilStagger <= 0) {
    return {
      state: {
        ...state,
        hp,
        phase: "stagger",
        timer: BOSS.staggerSeconds,
        hitsUntilStagger: BOSS.staggerHits,
      },
      downed: false,
      staggered: true,
    };
  }

  return { state: { ...state, hp, hitsUntilStagger }, downed: false, staggered: false };
}

/** 체력 비율 0~1. HUD 막대가 쓴다 */
export function bossHealthRatio(state: BossState): number {
  return Math.max(0, Math.min(1, state.hp / BOSS.maxHp));
}

/** HUD에 체력 막대를 띄울지. 멀리 있으면 띄우지 않는다 */
export function isEngaged(state: BossState, playerX: number, playerZ: number): boolean {
  if (state.phase === "down") return false;
  return Math.hypot(playerX - state.x, playerZ - state.z) <= BOSS.aggroRadius;
}

/** HUD와 성능 패널이 읽는 대장 상태 */
export interface BossView {
  engaged: boolean;
  healthRatio: number;
  telegraph: boolean;
  distance: number;
  phase: BossPhase; // 화면이 이 값으로 동작을 고른다 — `string`이면 오타가 통과한다
  /**
   * 지금 서 있는 자리.
   *
   * 지도 둘과 화살표가 `BOSS_HOME`(처음 세운 자리)을 그리고 있었다 — 대장은
   * 인지 반경 안에서 플레이어를 쫓아 움직이므로, 표식만 제자리에 남아 **지도가
   * 가리킨 곳에 대장이 없었다.** 좌표를 두 번 적지 않기 위해 여기로 흘린다.
   */
  x: number;
  z: number;
}

/**
 * 화면이 들고 다닐 빈 상태를 만든다.
 *
 * 칸 목록을 `PlayClient`에 손으로 적어 두었더니 여기 칸이 늘어도 따라오지
 * 않았다 — 좌표를 더할 때 실제로 그랬다. 처음 값도 정본이 정한다.
 */
export function createBossView(): BossView {
  return {
    engaged: false,
    healthRatio: 1,
    telegraph: false,
    distance: Number.POSITIVE_INFINITY,
    phase: "idle",
    // 씬이 붙기 전에는 세워 둔 자리를 쓴다 — 0,0이면 지도가 도시 한가운데를 가리킨다
    x: BOSS_HOME.x,
    z: BOSS_HOME.z,
  };
}

/**
 * 대장 상태를 화면이 읽는 모양으로 옮긴다.
 *
 * 화면 안(프레임 루프)에서 칸마다 손으로 적을 때는 **한 줄을 지워도 아무도
 * 몰랐다** — 공유 객체에 쓰는 줄 60개를 하나씩 지워 보니 51개가 그랬고, 이 여섯
 * 줄도 거기 있었다.
 *
 * 특히 `telegraph`가 아프다. 예고가 화면에 안 뜨면 **피할 수 있다는 것 자체를
 * 알 수 없다.** 지속 시간은 앞서 막았는데, 그 시간 동안 화면에 나가는 길은
 * 여기 한 줄뿐이었다.
 *
 * 제자리에서 채운다 — 새 객체를 만들면 HUD가 들고 있던 것과 갈라진다.
 */
export function projectBossView(
  view: BossView,
  state: BossState,
  playerX: number,
  playerZ: number,
): void {
  view.engaged = isEngaged(state, playerX, playerZ);
  view.healthRatio = bossHealthRatio(state);
  view.telegraph = state.phase === "windup";
  view.distance = Math.hypot(playerX - state.x, playerZ - state.z);
  view.phase = state.phase;
  view.x = state.x;
  view.z = state.z;
}

/** 대장을 때린 결과가 흘러가는 곳 — 소리·퀘스트·해금이 여기서 읽는다 */
export interface BossHitLink {
  cues: { hits: number; defeats: number; slams: number };
  defeatedTotal: number;
  bossDefeated: boolean;
  /**
   * 대장을 눕힌 **횟수**. 마무리 연출이 늘어난 만큼 발동한다.
   *
   * `bossDefeated`(해금 깃발)로는 셀 수 없다 — 한 번 켜지면 계속 켜져 있어
   * 두 번째 처치를 알 방법이 없다. 대장은 잠시 뒤 되살아나므로 두 번째가
   * 실제로 온다.
   *
   * `cues.defeats`로도 셀 수 없다. 지나가던 로봇도 그 칸을 올리므로,
   * 골목에서 로봇 한 기를 눕힐 때마다 대장 연출이 터진다.
   */
  bossDowns: number;
}

/**
 * 대장을 한 대 때린 것을 기록한다.
 *
 * 화면 안(프레임 루프)에서 손으로 적을 때는 **한 줄을 지워도 아무도 몰랐다.**
 * 네 줄이 각자 다른 곳으로 흘러간다:
 *
 *   - `cues.hits` — 때린 소리. 없으면 **때렸는지 안 때렸는지 귀로 알 수 없다.**
 *   - `cues.defeats` — 눕힌 소리. 마지막 한 방이 시원해야 하는 자리다.
 *   - `defeatedTotal` — 여정의 처치 수.
 *   - `bossDefeated` — **네 번째 도깨비의 해금 조건.** 이것만 빠지면 대장을
 *     눕혀도 아무 일이 없고, 왜 안 열리는지 알 방법이 없다.
 *
 * 누적 처치 수로 세면 지나가던 로봇과 구분되지 않아 `bossDefeated`를 따로 둔다.
 */
export function recordBossHit(link: BossHitLink, downed: boolean): void {
  link.cues.hits += 1;
  if (!downed) return;
  link.cues.defeats += 1;
  link.defeatedTotal += 1;
  link.bossDefeated = true;
  link.bossDowns += 1;
}

/** 대장이 탄에 맞은 자리 */
export interface BossBoltLink {
  bossX: number;
  bossZ: number;
  bossHittable: boolean;
  bossBoltDamage: number;
}

/**
 * 대장이 자기 자리를 알린다.
 *
 * 안 알리면 **딱총 탄이 대장을 통과한다.** 근접은 보스 쪽 코드가 직접
 * 판정하지만 탄은 로봇 쪽에 있어서, 자리를 흘려보내는 이 두 줄이 없으면
 * 원거리만 조용히 통하지 않는다.
 */
export function projectBossPosition(
  link: BossBoltLink,
  at: { x: number; z: number },
  hittable: boolean,
): void {
  link.bossX = at.x;
  link.bossZ = at.z;
  link.bossHittable = hittable;
}

/**
 * 탄이 대장에게 넣은 피해를 **한 번만** 꺼낸다.
 *
 * 비우지 않으면 한 발 맞힌 피해가 매 프레임 다시 들어가 대장이 순식간에
 * 눕는다 — `consumeSlam`과 같은 실패다.
 */
export function consumeBossBoltDamage(link: BossBoltLink): number {
  const damage = link.bossBoltDamage;
  link.bossBoltDamage = 0;
  return damage;
}

/**
 * 내려치기가 시작된 것을 알린다.
 *
 * **판정보다 조금 일러야 피할 수 있다** — 소리가 판정과 같은 프레임에 나면
 * 듣고 나서 피할 시간이 없다. 그래서 단계가 `slam`으로 **바뀌는 순간**만 센다.
 */
export function recordSlamStart(
  link: Pick<BossHitLink, "cues">,
  before: BossState["phase"],
  now: BossState["phase"],
): void {
  if (before === "slam" || now !== "slam") return;
  link.cues.slams += 1;
}
