/**
 * 보스전 도깨비 소환 — 순수 시뮬레이션.
 *
 * TRAILER_FEATURE_ANALYSIS 「3.5 도깨비 소환과 협동」과 「3.6 대형 적과 보스전」이
 * 근거다. 저쪽에서 읽은 조건은 넷이다 — **여러 도깨비가 한 전투에 참여**하고,
 * **도깨비별로 다른 형태의 공격**을 하고, 플레이어 주변이 아니라 **적과 직접
 * 부딪히며**, 표현은 무겁지 않고 **장난감·색종이처럼 과장된다.**
 *
 * 그래서 「능력 하나를 더 좋게 만드는 버프」로 만들지 않았다. 도깨비마다 **역할이
 * 다르고**, 만난 도깨비가 많을수록 전투가 달라진다 — 수집이 곧 전력이 되어야
 * 도감이 카드 모으기가 아니라 동료가 된다(저 문서의 마지막 문장이 그 말이다).
 *
 * three.js를 모른다. 궤도 좌표까지만 계산해 넘기고, 그리는 일과 파티클은 렌더가
 * 맡는다 — `bossSim`·`combatSim`과 같은 규칙이다.
 */

import { BOSS } from "@/game/combat/bossSim";
import type { DokebiId } from "@/game/dokebi/roster";

export const SUMMON = {
  /**
   * 소환이 유지되는 시간(초).
   *
   * 보스 한 주기(예고 1.1 + 내려침 0.18 + 빈틈 1.6)가 약 3초다. 12초면 **네
   * 주기**를 함께 싸운다 — 두 주기로 줄이면 소환이 「한 번 터뜨리는 폭탄」이
   * 되어 협동이 아니라 소모품이 된다.
   */
  durationSeconds: 12,
  /**
   * 다시 부를 수 있을 때까지(초). 지속과 **겹쳐서** 센다.
   *
   * 26초면 소환이 꺼진 뒤 14초를 혼자 싸운다. 혼자인 구간이 없으면 보스전이
   * 통째로 소환 시간이 되고, 그러면 부르는 순간의 무게가 사라진다.
   */
  cooldownSeconds: 26,
  /**
   * 부를 수 있는 거리(m).
   *
   * 보스 인지 반경(22m)보다 넓다. **보스가 나를 본 뒤에야 부를 수 있으면**
   * 이미 쫓기는 중이라 부를 여유가 없다 — 마주치기 직전에 준비하는 편이 맞다.
   */
  callRadius: 26,
  /** 도깨비가 보스 둘레를 도는 반지름(m). 내려침 반경(6.2m) 안쪽이라 위험을 함께 진다 */
  orbitRadius: 5.4,
  /** 도는 속도(rad/s) */
  orbitSpeed: 1.1,
  /** 한 도깨비가 능력을 쓰는 간격(초) */
  strikeIntervalSeconds: 1.6,
  /** 「먼 불빛」 한 방의 피해. 보스 체력이 12이니 12초 동안 일곱 번쯤 들어간다 */
  burstDamage: 1,
  /** 「물무늬」 한 번의 회복량. 플레이어 최대 체력이 5다 */
  mendHeal: 0.5,
} as const;

/**
 * 도깨비가 전투에서 맡는 역할.
 *
 * **새로 지어내지 않고 각자의 능력에서 그대로 끌어왔다.** 「연기로 몸을 감춘다」는
 * 도깨비가 전투에서 갑자기 불을 뿜으면 도감의 설명과 화면이 따로 논다.
 */
export type SummonRole =
  /** 빛으로 약한 자리를 드러낸다 — 보스가 더 빨리 비틀거린다 */
  | "mark"
  /** 연기로 시선을 끈다 — 보스가 플레이어 대신 이쪽을 쫓는다 */
  | "lure"
  /** 물무늬로 상처를 씻는다 — 플레이어를 회복시킨다 */
  | "mend"
  /** 멀리까지 번지는 빛 — 직접 피해를 준다 */
  | "burst";

/**
 * 도깨비 → 역할.
 *
 * `roster`에 두지 않는다. 저쪽은 도감과 동료 동행이 쓰는 정본이고, 여기 값은
 * **보스전에서만** 뜻이 있다. 섞어 두면 도감에 전투 용어가 새어 나온다.
 */
const ROLE_BY_DOKEBI: Record<DokebiId, SummonRole> = {
  chorong: "mark",
  geueum: "lure",
  mulbineul: "mend",
  jajeong: "burst",
};

export function roleForDokebi(id: DokebiId): SummonRole {
  return ROLE_BY_DOKEBI[id];
}

export type SummonPhase = "ready" | "active" | "cooling";

export interface SummonMember {
  id: DokebiId;
  role: SummonRole;
  /** 궤도 위 각도(rad) */
  angle: number;
  /** 다음 능력까지 남은 시간(초) */
  strikeIn: number;
}

export interface SummonState {
  phase: SummonPhase;
  /** 현재 단계가 끝나기까지 남은 시간(초) */
  timer: number;
  members: readonly SummonMember[];
}

/** 화면에 터뜨릴 한 방 */
export interface SummonBurst {
  id: DokebiId;
  role: SummonRole;
  x: number;
  z: number;
}

/**
 * 한 프레임에 일어난 일.
 *
 * 상태와 **결과를 나눠서** 돌려준다. 보스 체력이나 플레이어 체력을 이 안에서
 * 직접 깎으면 시뮬레이션이 둘을 다 알아야 하고, 그러면 검사에서 보스를 통째로
 * 조립해야 이 파일 한 줄을 확인할 수 있다.
 */
export interface SummonTick {
  state: SummonState;
  /** 이번 프레임에 보스에게 들어간 피해 */
  damage: number;
  /** 이번 프레임에 플레이어가 회복한 양 */
  heal: number;
  /** 보스 경직 누적에 더할 타격 수 */
  markHits: number;
  /**
   * 보스가 대신 노릴 자리. 없으면 플레이어를 노린다.
   *
   * 「유인」 도깨비가 나와 있는 동안만 값이 있다. 좌표까지 여기서 주는 이유는
   * 그 자리가 궤도 위라서다 — 부르는 쪽이 각도를 다시 계산하면 두 곳이 어긋난다.
   */
  lureAt: { x: number; z: number } | null;
  /** 이번 프레임에 터진 연출. 렌더가 파티클로 옮긴다 */
  bursts: readonly SummonBurst[];
}

export function createSummon(): SummonState {
  return { phase: "ready", timer: 0, members: [] };
}

/**
 * 지금 부를 수 있는가.
 *
 * 셋을 모두 만족해야 한다 — 쿨다운이 끝났고, 보스가 부를 거리 안에 있고,
 * **만난 도깨비가 하나라도 있어야** 한다. 마지막 조건이 없으면 아무도 나오지
 * 않는 소환이 쿨다운만 먹는다.
 */
export function canSummon(
  state: SummonState,
  bossDistance: number,
  met: readonly DokebiId[],
): boolean {
  return state.phase === "ready" && bossDistance <= SUMMON.callRadius && met.length > 0;
}

/**
 * 만난 도깨비를 **전부** 부른다.
 *
 * 하나만 고르게 하지 않는다. 저 문서가 말하는 「여러 동료가 한 전투에 참여」가
 * 이것이고, 고르게 만들면 결국 가장 센 하나만 쓰이면서 나머지는 도감 안에 남는다.
 *
 * 시작 각도를 고르게 벌린다. 같은 자리에서 출발하면 넷이 한 덩어리로 붙어 돌아
 * 「여러 마리」로 보이지 않는다.
 */
export function requestSummon(state: SummonState, met: readonly DokebiId[]): SummonState {
  if (met.length === 0) return state;

  const members = met.map((id, index) => ({
    id,
    role: roleForDokebi(id),
    angle: (index / met.length) * Math.PI * 2,
    /*
     * 첫 능력도 간격만큼 기다린다. 0으로 두면 부른 순간 전부 동시에 터져 소환
     * 연출과 겹치고, 그 뒤로도 계속 같은 박자로만 터진다.
     */
    strikeIn: (SUMMON.strikeIntervalSeconds * (index + 1)) / met.length,
  }));

  return { phase: "active", timer: SUMMON.durationSeconds, members };
}

/** 궤도 위 도깨비의 자리 */
export function memberPosition(
  member: SummonMember,
  bossX: number,
  bossZ: number,
): { x: number; z: number } {
  return {
    x: bossX + Math.cos(member.angle) * SUMMON.orbitRadius,
    z: bossZ + Math.sin(member.angle) * SUMMON.orbitRadius,
  };
}

/**
 * 한 프레임 진행.
 *
 * 보스가 쓰러져 있으면 능력이 나가지 않는다 — 누운 것을 계속 때리는 그림은 이
 * 게임의 표현이 아니고(「유쾌하고 과장된」), 쓰러진 25초 동안 피해가 쌓여 다시
 * 일어나자마자 죽는 것도 막는다.
 */
export function stepSummon(
  state: SummonState,
  dt: number,
  boss: { x: number; z: number; down: boolean },
): SummonTick {
  const idle: SummonTick = {
    state,
    damage: 0,
    heal: 0,
    markHits: 0,
    lureAt: null,
    bursts: [],
  };

  if (state.phase === "ready") return idle;

  if (state.phase === "cooling") {
    const timer = state.timer - dt;
    if (timer <= 0) return { ...idle, state: createSummon() };
    return { ...idle, state: { ...state, timer } };
  }

  const timer = state.timer - dt;
  if (timer <= 0) {
    /*
     * 쿨다운은 **부른 시점부터** 센다. 지속이 끝난 뒤부터 세면 실제 간격이
     * 지속 + 쿨다운이 되어, 상수만 보고는 얼마나 자주 부를 수 있는지 알 수 없다.
     */
    return {
      ...idle,
      state: {
        phase: "cooling",
        timer: SUMMON.cooldownSeconds - SUMMON.durationSeconds,
        members: [],
      },
    };
  }

  let damage = 0;
  let heal = 0;
  let markHits = 0;
  let lureAt: { x: number; z: number } | null = null;
  const bursts: SummonBurst[] = [];

  const members = state.members.map((member) => {
    const moved = { ...member, angle: member.angle + SUMMON.orbitSpeed * dt };

    if (moved.role === "lure") lureAt = memberPosition(moved, boss.x, boss.z);

    const strikeIn = moved.strikeIn - dt;
    if (boss.down || strikeIn > 0) return { ...moved, strikeIn };

    const at = memberPosition(moved, boss.x, boss.z);
    bursts.push({ id: moved.id, role: moved.role, x: at.x, z: at.z });

    if (moved.role === "burst") damage += SUMMON.burstDamage;
    if (moved.role === "mend") heal += SUMMON.mendHeal;
    if (moved.role === "mark") markHits += 1;

    return { ...moved, strikeIn: strikeIn + SUMMON.strikeIntervalSeconds };
  });

  return { state: { ...state, timer, members }, damage, heal, markHits, lureAt, bursts };
}

/**
 * 「빛 표식」이 붙었을 때 보스가 비틀거리기까지 필요한 타격 수.
 *
 * 표식을 피해로 바꾸지 않은 이유가 있다. 피해로 주면 초롱이 그냥 약한 자정이
 * 되고 둘을 구분할 이유가 없어진다 — **빈틈을 더 자주 만들어 주는 쪽**이라야
 * 「약한 자리를 드러낸다」는 설명과 화면이 맞는다.
 */
export function staggerHitsWithMark(marked: boolean): number {
  return marked ? Math.max(1, BOSS.staggerHits - 1) : BOSS.staggerHits;
}
