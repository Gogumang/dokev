import { describe, expect, it } from "vitest";

import { burstConfetti, CONFETTI, createConfetti } from "@/game/combat/vfxPaint";
import { RAINBOW, rainbowIndex } from "@/game/core/rainbow";
import { createSeededRandom } from "@/game/core/mathx";

/*
 * 타격 색종이 — 순수 부분.
 *
 * `Enemies.tsx` 안에 있던 것을 떼어 내면서 **검사가 안 따라왔다.** 컴포넌트
 * 안에 있을 때는 잴 데가 없어서 안 쟀던 것이고, 밖으로 나온 지금은 잴 수
 * 있다 — 이 저장소가 배선을 떼어 낼 때마다 하는 일이다.
 *
 * 그리는 일(`paintConfetti`·`paintEmbers`)은 three가 필요해 여기서 안 본다.
 * 자리를 정하는 규칙만 본다.
 */

describe("색종이 풀", () => {
  it("꺼진 채로 시작한다", () => {
    // 살아 있는 채로 시작하면 판에 들어서자마자 색종이가 떠 있다
    const pool = createConfetti();
    expect(pool.length).toBe(CONFETTI.poolSize);
    expect(pool.every((particle) => particle.life <= 0)).toBe(true);
  });

  it("풀이 한 번의 타격보다 넉넉하다", () => {
    // 한 번에 풀을 다 쓰면 연타할 때 앞의 색종이가 통째로 사라진다
    expect(CONFETTI.poolSize).toBeGreaterThan(CONFETTI.perHit * 4);
  });
});

describe("터뜨리기", () => {
  const random = () => 0.5;

  it("한 번에 정해진 수만큼 살아난다", () => {
    const pool = createConfetti();
    burstConfetti(pool, 0, 1, 2, 3, random);
    expect(pool.filter((particle) => particle.life > 0).length).toBe(CONFETTI.perHit);
  });

  it("맞은 자리에서 나온다", () => {
    const pool = createConfetti();
    burstConfetti(pool, 0, 1, 2, 3, random);
    const live = pool.filter((particle) => particle.life > 0);
    for (const particle of live) {
      expect([particle.x, particle.y, particle.z]).toEqual([1, 2, 3]);
    }
  });

  it("위로 튄다 — 아래로 꺼지면 바닥에 묻힌다", () => {
    const pool = createConfetti();
    burstConfetti(pool, 0, 0, 1, 0, createSeededRandom(7));
    for (const particle of pool.filter((item) => item.life > 0)) {
      expect(particle.vy, `vy ${particle.vy}`).toBeGreaterThan(0);
    }
  });

  it("사방으로 흩어진다 — 한 방향으로 뭉치면 분수가 된다", () => {
    const pool = createConfetti();
    burstConfetti(pool, 0, 0, 1, 0, createSeededRandom(11));
    const live = pool.filter((particle) => particle.life > 0);
    const angles = live.map((particle) => Math.atan2(particle.vx, particle.vz));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread, `${spread.toFixed(2)}rad 안에 다 모였다`).toBeGreaterThan(Math.PI);
  });

  it("커서가 다음 자리를 돌려준다", () => {
    const pool = createConfetti();
    const next = burstConfetti(pool, 0, 0, 0, 0, random);
    expect(next).toBe(CONFETTI.perHit);
  });

  it("풀 끝에서 앞으로 감긴다 — 넘치면 없는 칸을 만진다", () => {
    const pool = createConfetti();
    const start = CONFETTI.poolSize - 3;
    const next = burstConfetti(pool, start, 0, 0, 0, random);
    expect(next).toBe((start + CONFETTI.perHit) % CONFETTI.poolSize);
    expect(next, "감기지 않았다").toBeLessThan(CONFETTI.poolSize);
    // 감긴 뒤의 앞칸도 살아나야 한다
    expect(pool[0].life, "감긴 자리가 안 살아났다").toBeGreaterThan(0);
  });
});

describe("색이 타격마다 밀리는가", () => {
  /*
   * 색은 **칸 번호**에서 나온다(`paintConfetti`). 한 번 때리면 열넷이 연달아
   * 나가는데, 열넷이 여섯으로 안 나눠떨어지므로 다음 타격은 색 배열이 밀린
   * 채로 시작한다 — 같은 자리를 두 번 때려도 같은 무지개가 두 번 나오지
   * 않는다는 주석의 근거가 이것이다. 주장을 값으로 못 박는다.
   */
  it("한 번의 타격이 여섯 색을 다 쓴다", () => {
    // 열넷이면 여섯을 두 바퀴 넘게 돈다 — 한 무더기가 무지개로 읽힌다
    expect(CONFETTI.perHit).toBeGreaterThan(RAINBOW.length);
    const used = new Set(Array.from({ length: CONFETTI.perHit }, (_, i) => rainbowIndex(i)));
    expect(used.size).toBe(RAINBOW.length);
  });

  it("다음 타격은 색이 밀린 채로 시작한다", () => {
    // 나눠떨어지면 매번 같은 자리에서 시작해 두 무더기가 똑같아진다
    expect(CONFETTI.perHit % RAINBOW.length, "열넷이 여섯으로 나눠떨어진다").not.toBe(0);
  });
});

describe("색이 도는 속도", () => {
  it("사는 동안 한 바퀴를 못 넘긴다", () => {
    /*
     * 0.9초를 살고 0.8바퀴/초로 돈다 — 0.72바퀴다. 한 바퀴를 넘기면 같은
     * 조각이 같은 색으로 되돌아와 「돌고 있다」가 안 읽힌다.
     */
    const turns = CONFETTI.lifeSeconds * CONFETTI.flowPerSecond;
    expect(turns, `${turns.toFixed(2)}바퀴`).toBeLessThan(1);
    expect(turns, `${turns.toFixed(2)}바퀴 — 너무 느려 고정으로 보인다`).toBeGreaterThan(0.5);
  });
});
