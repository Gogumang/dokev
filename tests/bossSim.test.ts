import { describe, expect, it } from "vitest";

import { bothWays, describeSplit } from "./support/bothWays";

import {
  BOSS,
  bossHealthRatio,
  createBoss,
  damageBoss,
  isEngaged,
  isSlamActive,
  isVulnerable,
  projectBossView,
  recordBossHit,
  recordSlamStart,
  type BossHitLink,
  type BossView,
  slamHits,
  stepBoss,
  type BossState,
} from "@/game/combat/bossSim";
import { COMBAT_TUNING } from "@/game/combat/combatSim";
import { WEAPONS } from "@/game/combat/weapons";
import { LOCOMOTION } from "@/game/config/tuning";

function at(overrides: Partial<BossState> = {}): BossState {
  return { ...createBoss(0, 0), ...overrides };
}

describe("단계 전이", () => {
  it("멀면 가만히 있는다", () => {
    const boss = stepBoss(at(), 0, BOSS.aggroRadius + 5, 0.1);
    expect(boss.phase).toBe("idle");
  });

  it("인지하면 다가온다", () => {
    const boss = stepBoss(at(), 0, 12, 0.2);
    expect(boss.phase).toBe("chase");
    expect(boss.z, `z=${boss.z}`).toBeGreaterThan(0);
  });

  it("사거리에 들면 예고한다", () => {
    const boss = stepBoss(at(), 0, BOSS.slamRange - 0.5, 0.1);
    expect(boss.phase).toBe("windup");
    expect(boss.timer).toBe(BOSS.windupSeconds);
  });

  it("예고 → 충격 → 빈틈 순서로 간다", () => {
    let boss = at({ phase: "windup", timer: BOSS.windupSeconds });
    boss = stepBoss(boss, 0, 2, BOSS.windupSeconds + 0.01);
    expect(boss.phase, "예고 뒤에 충격이 와야 한다").toBe("slam");

    boss = stepBoss(boss, 0, 2, BOSS.slamSeconds + 0.01);
    expect(boss.phase, "충격 뒤에 빈틈이 와야 한다").toBe("recover");

    boss = stepBoss(boss, 0, 2, BOSS.recoverSeconds + 0.01);
    expect(boss.phase).toBe("chase");
  });

  it("예고 중에는 따라 돌지 않는다", () => {
    // 따라 돌면 피할 방향이 없다
    const boss = at({ phase: "windup", timer: 0.5, facing: 0 });
    const next = stepBoss(boss, 20, 0, 0.1);
    expect(next.facing).toBe(boss.facing);
  });

  it("예고가 일반 로봇의 공격보다 길다", () => {
    /*
     * 보스의 내용은 체력이 아니라 리듬이다. 예고가 일반 로봇의 준비 시간과
     * 같으면 피할 시간이 없어 그냥 두꺼운 로봇이 된다.
     */
    expect(BOSS.windupSeconds, `boss=${BOSS.windupSeconds}`).toBeGreaterThan(
      WEAPONS.bat.timing.windupSeconds * 5,
    );
  });
});

describe("충격", () => {
  it("사거리보다 넓게 퍼진다", () => {
    // 붙어 있을 때만 맞으면 뒤로 물러설 이유가 없다
    expect(BOSS.slamRadius).toBeGreaterThan(BOSS.slamRange);
  });

  it("충격 중에만 닿는다", () => {
    expect(slamHits(at({ phase: "slam", timer: 0.1 }), 0, 1)).toBe(true);
    expect(slamHits(at({ phase: "windup", timer: 0.1 }), 0, 1)).toBe(false);
    expect(isSlamActive(at({ phase: "recover" }))).toBe(false);
  });

  it("닿는 반경이 예고 링과 정확히 같다", () => {
    /*
     * 링은 플레이어에게 한 **약속**이다 — 「이 안에 있으면 맞는다」. 판정이
     * 링보다 넓으면 「링 밖인데 맞았다」가 되고, 좁으면 링을 믿고 도망친
     * 사람이 손해를 본다. 공정성 문제라 방향을 가리지 않는다.
     *
     * 기존 검사는 `slamRadius + 1`에서 안 맞는 것만 봤다 — **넓어지는 것만**
     * 잡고 좁아지는 것은 놓친다. 실제 경계를 재서 상수와 맞춘다.
     */
    const state = at({ phase: "slam" });
    let edge = 0;
    for (let d = 0; d <= BOSS.slamRadius * 2; d += 0.02) {
      if (slamHits(state, 0, d)) edge = d;
    }
    expect(edge, `닿는 경계 ${edge.toFixed(2)}m 대 링 ${BOSS.slamRadius}m`).toBeGreaterThan(
      BOSS.slamRadius - 0.03,
    );
    expect(edge, `닿는 경계 ${edge.toFixed(2)}m 대 링 ${BOSS.slamRadius}m`).toBeLessThanOrEqual(
      BOSS.slamRadius,
    );
  });

  it("반경 밖은 안전하다", () => {
    expect(slamHits(at({ phase: "slam" }), 0, BOSS.slamRadius + 1)).toBe(false);
  });
});

describe("피해", () => {
  it("때리면 체력이 준다", () => {
    const hit = damageBoss(at());
    expect(hit.state.hp).toBe(BOSS.maxHp - 1);
    expect(bossHealthRatio(hit.state)).toBeLessThan(1);
  });

  it("연속으로 때리면 비틀거린다", () => {
    let boss = at({ phase: "chase" });
    for (let i = 0; i < BOSS.staggerHits; i += 1) boss = damageBoss(boss).state;
    expect(boss.phase, `phase=${boss.phase}`).toBe("stagger");
  });

  it("예고 중에는 비틀거리게 만들 수 없다", () => {
    /*
     * 그러면 예고를 보고 때리는 것이 항상 정답이 되어 피할 이유가 사라진다.
     */
    let boss = at({ phase: "windup", timer: 1 });
    for (let i = 0; i < BOSS.staggerHits + 2; i += 1) boss = damageBoss(boss).state;
    expect(boss.phase, `phase=${boss.phase}`).toBe("windup");
    expect(boss.hp).toBeLessThan(BOSS.maxHp);
  });

  it("체력이 다하면 쓰러진다", () => {
    let boss = at({ phase: "chase", hp: 1 });
    const hit = damageBoss(boss);
    boss = hit.state;
    expect(hit.downed).toBe(true);
    expect(boss.phase).toBe("down");
    expect(isVulnerable(boss), "쓰러진 뒤에는 때릴 수 없다").toBe(false);
  });

  it("쓰러지면 시간이 지나 제자리에서 다시 선다", () => {
    let boss = at({ phase: "down", timer: BOSS.downSeconds, x: 30, z: 30, homeX: 5, homeZ: 5 });
    boss = stepBoss(boss, 0, 0, BOSS.downSeconds + 0.1);
    expect(boss.phase).toBe("idle");
    expect(boss.hp).toBe(BOSS.maxHp);
    expect(boss.x, "쓰러진 자리가 아니라 제자리로 돌아가야 한다").toBe(5);
  });

  it("일반 로봇보다 훨씬 두껍다", () => {
    expect(BOSS.maxHp).toBeGreaterThan(COMBAT_TUNING.maxHp * 4);
  });
});

describe("교전 표시", () => {
  it("가까우면 막대를 띄운다", () => {
    expect(isEngaged(at(), 0, 5)).toBe(true);
  });

  it("멀면 띄우지 않는다", () => {
    // 도시 어딘가에 보스가 있다는 사실을 상시 알려 줄 이유가 없다
    expect(isEngaged(at(), 0, BOSS.aggroRadius + 5)).toBe(false);
  });

  it("쓰러져 있으면 띄우지 않는다", () => {
    expect(isEngaged(at({ phase: "down" }), 0, 3)).toBe(false);
  });
});

describe("예고를 보고 실제로 피할 수 있는가", () => {
  /*
   * 「예고가 길다」만 재고 있었다. 그런데 피할 수 있느냐는 예고 시간 하나로
   * 정해지지 않는다 — **충격 반경이 사거리보다 얼마나 넓은지**, 그리고 예고
   * 중에 보스가 다가오는지가 함께 정한다.
   *
   * 활강 목표가 그랬듯(2초인데 최대 1.92초) 숫자 하나만 보면 벽인 줄 모른다.
   */
  const escapeDistance = BOSS.slamRadius - BOSS.slamRange;
  const needed = escapeDistance / BOSS.windupSeconds;

  it("예고 중에는 다가오지 않는다", () => {
    /*
     * 다가오면 벌어야 할 거리가 늘어난다. 예고 1.1초 동안 2.2m/s로 붙으면
     * 2.42m가 더 필요해져 **걸어서는 못 피한다** — 규칙이 조용히 그렇게
     * 바뀌는 것을 막는다.
     */
    const boss = at({ phase: "windup", timer: BOSS.windupSeconds, x: 0, z: 0 });
    const after = stepBoss(boss, 0, BOSS.slamRange, 0.1);
    expect(after.phase, "예고가 유지되지 않았다").toBe("windup");
    expect(Math.hypot(after.x - boss.x, after.z - boss.z), "예고 중에 움직였다").toBeLessThan(1e-6);
  });

  it("사거리에서는 걷기만 해도 벗어난다", () => {
    /*
     * 사거리(4.6m)에서 예고가 시작되고 충격은 6.2m까지 닿는다. 즉 1.6m를
     * 1.1초 안에 벌면 된다 — 걷는 속도로도 여유가 있어야 한다.
     */
    expect(needed, `초당 ${needed.toFixed(2)}m 필요, 걷기는 ${LOCOMOTION.walk.maxSpeed}`).toBeLessThan(
      LOCOMOTION.walk.maxSpeed * 0.7,
    );
  });

  it("붙어 있어도 달리면 벗어난다", () => {
    /*
     * 「붙어 있으면 못 피한다」고 적어 두었지만, 달려도 못 피하면 그건
     * 설계가 아니라 함정이다. 가장 나쁜 자리(거리 0)에서도 달리기로는
     * 반경을 벗어날 수 있어야 한다.
     */
    const worst = BOSS.slamRadius / BOSS.windupSeconds;
    expect(
      worst,
      `초당 ${worst.toFixed(2)}m 필요, 달리기는 ${LOCOMOTION.run.maxSpeed}`,
    ).toBeLessThan(LOCOMOTION.run.maxSpeed);
  });

  it("빈틈이 때릴 만큼 길다", () => {
    // 빈틈이 예고보다 짧으면 반격할 틈 없이 다음 예고가 온다
    expect(BOSS.recoverSeconds, `빈틈 ${BOSS.recoverSeconds}초`).toBeGreaterThan(
      BOSS.windupSeconds,
    );
  });
});

describe("모든 단계에 닿을 수 있는가", () => {
  /*
   * 단계를 일곱 개 선언해 두었다. 그중 하나라도 도달할 수 없으면 그건 죽은
   * 코드이거나 전이가 끊긴 것이고, 둘 다 화면에서는 「가만히 있는 보스」로만
   * 보인다.
   *
   * 조건식을 읽어 추론하지 않고 실제로 돌려서 확인한다.
   */
  const DECLARED: BossState["phase"][] = [
    "idle",
    "chase",
    "windup",
    "slam",
    "recover",
    "stagger",
    "down",
  ];

  it("선언한 단계를 모두 지나간다", () => {
    const seen = new Set<string>();
    let boss = createBoss(0, 0);

    /*
     * 거리를 훑는다. 한 자리에 서 있으면 인지 밖(idle)이나 사거리 안(windup)
     * 한쪽만 나온다 — 쫓아오는 구간은 그 사이에만 있다.
     */
    for (let i = 0; i < 60 * 400; i += 1) {
      const pz = 1 + ((i / 20) % 30);
      boss = stepBoss(boss, 0, pz, 1 / 60);
      // 가끔 때린다 — 비틀거림과 쓰러짐은 맞아야 나온다
      if (i % 23 === 0) boss = damageBoss(boss, 1).state;
      seen.add(boss.phase);
    }

    const missing = DECLARED.filter((phase) => !seen.has(phase));
    expect(missing, `닿지 못한 단계: ${missing.join(", ")}`).toEqual([]);
  });

  it("어느 단계에서도 갇히지 않는다", () => {
    /*
     * 한 단계에 머문 채 영영 나오지 못하면 보스가 굳는다. 각 단계에서
     * 시작해 충분히 돌린 뒤 다른 단계로 넘어갔는지 본다.
     */
    for (const phase of DECLARED) {
      let boss = at({ phase, timer: BOSS.windupSeconds });
      let moved = false;
      for (let i = 0; i < 60 * 60 && !moved; i += 1) {
        boss = stepBoss(boss, 0, 10, 1 / 60);
        if (boss.phase !== phase) moved = true;
      }
      expect(moved, `${phase}에서 빠져나오지 못한다`).toBe(true);
    }
  });
});

describe("단계가 정해진 시간만큼 지속되는가", () => {
  /*
   * 네 단계가 똑같은 줄(`if (timer > 0) return { ...state, timer };`)로 시간을
   * 센다. 넷을 하나씩 「타이머를 0으로 굳힌다」로 바꿔 보니 **셋이 통과했다** —
   * 시간이 안 흐르면 그 단계는 한 프레임 만에 끝난다.
   *
   * 무엇이 아픈지가 단계마다 다르다:
   *   - `windup` — 예고가 한 프레임만 보인다. **피할 시간이 없다.** 보스전에서
   *     읽고 반응하는 재미가 통째로 사라지는데, 화면에는 여전히 링이 뜬다.
   *   - `slam` — 내려찍기가 순간에 끝나 맞았는지도 모른다.
   *   - `down` — 눕힌 대장이 곧바로 다시 선다. 이긴 실감이 없다.
   *
   * 「단계가 바뀌는가」가 아니라 **「얼마나 머무르는가」**를 잰다. 전이만 보면
   * 시간이 0이어도 통과한다 — 실제로 그렇게 통과했다.
   */
  /** 그 단계에 머문 시간(초). 다음 단계로 넘어갈 때까지 돌린다 */
  function dwell(start: BossState, playerX: number, playerZ: number): number {
    const FRAME = 1 / 60;
    let state = start;
    for (let i = 0; i < 60 * 40; i += 1) {
      const next = stepBoss(state, playerX, playerZ, FRAME);
      if (next.phase !== start.phase) return (i + 1) * FRAME;
      state = next;
    }
    return Number.POSITIVE_INFINITY;
  }

  const PHASES: Array<[string, BossState["phase"], number, string]> = [
    ["예고", "windup", BOSS.windupSeconds, "피할 시간이 없다"],
    ["내려찍기", "slam", BOSS.slamSeconds, "맞았는지도 모른다"],
    ["기절", "stagger", BOSS.staggerSeconds, "반격할 틈이 없다"],
    ["회복", "recover", BOSS.recoverSeconds, "쉴 틈 없이 다시 온다"],
  ];

  it.each(PHASES)("%s는 %s초만큼 머문다 — 짧으면 %s", (_name, phase, seconds) => {
    // 사거리 안에 서 있는 사람 — 단계가 끝나면 바로 다음으로 넘어간다
    const held = dwell(at({ phase, timer: seconds }), 0, BOSS.slamRange - 1);
    expect(held, `${phase} 지속 ${held}초 (기대 ${seconds}초)`).toBeGreaterThan(seconds * 0.8);
  });

  it("눕힌 대장은 한참 누워 있는다 — 곧바로 서면 이긴 실감이 없다", () => {
    const held = dwell(at({ phase: "down", timer: BOSS.downSeconds }), 0, 0);
    // 25초는 돌리기 아까우므로 「적어도 몇 초는」으로 본다. 0 굳힘은 여기서 걸린다
    expect(held, `기상까지 ${held}초`).toBeGreaterThan(5);
  });
});

describe("대장 상태가 화면으로 나가는가", () => {
  /*
   * 여섯 줄이 화면 칸을 채우는데, **한 줄을 지워도 아무도 몰랐다.** 공유 객체에
   * 쓰는 줄 60개를 하나씩 지워 보니 51개가 그랬고 이 여섯도 거기 있었다.
   * 프레임 루프 안에 있으면 값으로 잴 데가 없어 밖으로 뺐다.
   *
   * `telegraph`가 특히 아프다. 지속 시간은 위에서 막았지만, **그 시간 동안 화면에
   * 나가는 길은 이 한 줄뿐**이었다 — 예고가 안 뜨면 피할 수 있다는 것 자체를
   * 알 수 없고, 사람 몫의 「보스 링 타이밍과 손맛」 판단도 뜻을 잃는다.
   */
  function emptyView(): BossView {
    return { engaged: false, healthRatio: 0, telegraph: false, distance: 0, phase: "" };
  }

  it("모든 칸이 채워진다 — 하나라도 비면 화면이 옛 값을 계속 보여 준다", () => {
    const view = emptyView();
    projectBossView(view, at({ phase: "windup", hp: BOSS.maxHp / 2 }), 3, 4);

    expect(view.phase, "단계가 안 나갔다").toBe("windup");
    expect(view.telegraph, "예고가 안 나갔다").toBe(true);
    expect(view.healthRatio, "체력이 안 나갔다").toBeCloseTo(0.5, 2);
    expect(view.distance, "거리가 안 나갔다").toBeCloseTo(5, 6);
    expect(view.engaged, "교전 여부가 안 나갔다").toBe(true);
  });

  it("예고 중에만 예고가 켜진다 — 늘 켜져 있으면 경고가 뜻을 잃는다", () => {
    const view = emptyView();
    for (const phase of ["chase", "slam", "recover", "stagger", "idle", "down"] as const) {
      projectBossView(view, at({ phase }), 0, 0);
      expect(view.telegraph, `${phase}인데 예고가 켜졌다`).toBe(false);
    }
    projectBossView(view, at({ phase: "windup" }), 0, 0);
    expect(view.telegraph, "예고 중인데 안 켜졌다").toBe(true);
  });

  it("멀리 있으면 교전이 아니다 — 체력 막대가 계속 떠 있으면 화면을 가린다", () => {
    const view = emptyView();
    projectBossView(view, at({ phase: "idle" }), 500, 500);
    expect(view.engaged, `거리 ${view.distance}`).toBe(false);
  });

  it("같은 객체를 채운다 — 새로 만들면 HUD가 들고 있던 것과 갈라진다", () => {
    const view = emptyView();
    projectBossView(view, at({ phase: "chase" }), 1, 1);
    expect(view.phase).toBe("chase");
  });
});

describe("대장을 때린 것이 기록되는가", () => {
  /*
   * 네 줄이 각자 다른 곳으로 흘러가는데 **하나씩 지워도 아무도 몰랐다.**
   *
   *   - `cues.hits` — 때린 소리. 없으면 **때렸는지 귀로 알 수 없다.**
   *   - `cues.defeats` — 눕힌 소리. 마지막 한 방이 시원해야 하는 자리다.
   *   - `defeatedTotal` — 여정의 처치 수.
   *   - `bossDefeated` — **네 번째 도깨비의 해금 조건.** 이것만 빠지면 대장을
   *     눕혀도 아무 일이 없고, 왜 안 열리는지 알 방법이 없다.
   */
  function blank(): BossHitLink {
    return {
      cues: { hits: 0, defeats: 0, slams: 0 },
      defeatedTotal: 0,
      bossDefeated: false,
    };
  }

  it("때리면 때린 소리만 는다", () => {
    const link = blank();
    recordBossHit(link, false);

    expect(link.cues.hits, "때린 소리가 안 났다").toBe(1);
    expect(link.cues.defeats, "안 눕혔는데 눕힌 소리가 났다").toBe(0);
    expect(link.bossDefeated, "안 눕혔는데 기록됐다").toBe(false);
    expect(link.defeatedTotal, "안 눕혔는데 처치 수가 늘었다").toBe(0);
  });

  it("눕히면 넷이 함께 기록된다 — 하나만 빠져도 아무 일이 없다", () => {
    const link = blank();
    recordBossHit(link, true);

    expect(link.cues.hits, "때린 소리가 안 났다").toBe(1);
    expect(link.cues.defeats, "눕힌 소리가 안 났다").toBe(1);
    expect(link.defeatedTotal, "처치 수가 안 늘었다").toBe(1);
    expect(link.bossDefeated, "네 번째 도깨비가 안 열린다").toBe(true);
  });

  it("여러 대 때려도 눕힌 것은 눕힌 만큼만 센다", () => {
    const link = blank();
    recordBossHit(link, false);
    recordBossHit(link, false);
    recordBossHit(link, true);

    expect(link.cues.hits, `때린 소리 ${link.cues.hits}`).toBe(3);
    expect(link.cues.defeats, `눕힌 소리 ${link.cues.defeats}`).toBe(1);
    expect(link.defeatedTotal, `처치 ${link.defeatedTotal}`).toBe(1);
  });

  it("내려치기는 시작하는 순간에만 알린다 — 매 프레임 울리면 소리가 뭉갠다", () => {
    const link = blank();
    recordSlamStart(link, "windup", "slam");
    expect(link.cues.slams, "시작을 안 알렸다").toBe(1);

    // 내려치는 동안 계속 도는 프레임들
    recordSlamStart(link, "slam", "slam");
    recordSlamStart(link, "slam", "slam");
    expect(link.cues.slams, `${link.cues.slams}번 울렸다`).toBe(1);
  });

  it("내려치지 않을 때는 안 알린다", () => {
    const link = blank();
    recordSlamStart(link, "chase", "windup");
    recordSlamStart(link, "slam", "recover");
    expect(link.cues.slams, "엉뚱한 단계에서 울렸다").toBe(0);
  });
});

describe("대장 술어가 실제로 갈리는가", () => {
  /*
   * 갈래를 하나씩 재는 것만으로는 **늘 같은 값을 돌려주는 함수도 통과한다.**
   * 「양쪽이 다 나오는가」를 따로 묻는다.
   */
  const PHASES: Array<BossState["phase"]> = [
    "idle",
    "chase",
    "windup",
    "slam",
    "recover",
    "stagger",
    "down",
  ];

  it("맞힐 수 있는 단계와 없는 단계가 갈린다", () => {
    const states = PHASES.map((phase) => at({ phase }));
    expect(bothWays(states, isVulnerable), `단계별: ${PHASES.join(", ")}`).toBe(true);
  });

  it("교전 여부가 거리에 따라 갈린다", () => {
    const distances = [0, 5, 20, 60, 200];
    const engaged = (d: number) => isEngaged(at({ phase: "chase" }), d, 0);
    expect(bothWays(distances, engaged), describeSplit(distances, engaged)).toBe(true);
  });

  it("내려찍기 판정이 자리에 따라 갈린다", () => {
    const spots = [0, 1, 3, 8, 30];
    const hit = (d: number) => slamHits(at({ phase: "slam" }), d, 0);
    expect(bothWays(spots, hit), describeSplit(spots, hit)).toBe(true);
  });
});

describe("대장이 몇 대 만에 휘청하는가", () => {
  /*
   * 비교 방향 훑기에서 나왔다. `hitsUntilStagger <= 0`을 `>= 0`으로 뒤집으면
   * **한 대만 때려도 휘청한다** — 「몇 대를 넣어야 빈틈이 생긴다」는 리듬이
   * 통째로 사라지고, 대장이 그냥 샌드백이 된다.
   *
   * 「휘청하기는 하는가」는 이미 재고 있었는데 **몇 대 만인지는 안 봤다.**
   */
  it("정해진 수만큼 때려야 휘청한다", () => {
    let state = at({ phase: "chase" });
    const before = state.hitsUntilStagger;
    expect(before, "휘청까지 필요한 수가 1이면 이 검사가 뜻이 없다").toBeGreaterThan(1);

    // 한 대 못 미치게 때린다
    for (let i = 0; i < before - 1; i += 1) {
      const hit = damageBoss(state);
      state = hit.state;
    }
    expect(state.phase, `${before - 1}대에 벌써 휘청했다`).not.toBe("stagger");

    // 마지막 한 대
    state = damageBoss(state).state;
    expect(state.phase, `${before}대를 때렸는데 안 휘청한다`).toBe("stagger");
  });

  it("예고·내려찍기 중에는 안 휘청한다 — 그때는 때려도 안 멈춘다", () => {
    for (const phase of ["windup", "slam"] as const) {
      let state = at({ phase });
      for (let i = 0; i < 10; i += 1) state = damageBoss(state).state;
      expect(state.phase, `${phase} 중에 휘청했다`).toBe(phase);
    }
  });
});
