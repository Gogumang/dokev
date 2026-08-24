import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createEmbers,
  EMBER,
  emberAlive,
  emberFade,
  releaseEmber,
  stepEmbers,
} from "@/game/combat/emberRelease";
import { ENEMY_BODY } from "@/game/combat/enemyBody";
import { BOSS_BODY } from "@/game/combat/bossBody";

/*
 * 로봇에서 빠져나가는 빛.
 *
 * 우리 로봇은 이유 없이 서 있었다 — 도깨비도 있고 로봇도 있는데 **둘을 잇는
 * 문장이 하나도 없었다.** 가슴의 점 하나와 그것이 떠오르는 한 장면이 그 자리를
 * 메운다.
 *
 * 이 검사가 지키는 핵심은 **색종이와 구분되는가**다. 같이 흩어지면 잔해가 되고,
 * 잔해는 아무 말도 하지 않는다.
 */
describe("빛을 놓아 준다", () => {
  it("처음에는 아무것도 떠 있지 않다", () => {
    const pool = createEmbers();
    expect(pool.filter(emberAlive), "가만히 있는데 빛이 떠 있다").toEqual([]);
  });

  it("눕히면 그 자리에서 하나 떠오른다", () => {
    const pool = createEmbers();
    releaseEmber(pool, 3, -4);

    const live = pool.filter(emberAlive);
    expect(live.length, "빛이 안 나왔다").toBe(1);
    expect([live[0].x, live[0].z], "엉뚱한 자리에서 나왔다").toEqual([3, -4]);
    expect(live[0].y, "바닥에서 나왔다 — 가슴에서 나와야 한다").toBe(EMBER.spawnHeight);
  });

  it("곧게 위로만 간다 — 흩어지면 색종이와 구분되지 않는다", () => {
    const pool = createEmbers();
    releaseEmber(pool, 0, 0);
    const before = { ...pool.find(emberAlive)! };

    stepEmbers(pool, 0.2);
    const after = pool.find(emberAlive)!;

    expect(after.y, `${before.y} → ${after.y}`).toBeGreaterThan(before.y);
    expect([after.x, after.z], "옆으로 흘렀다").toEqual([before.x, before.z]);
  });

  it("걸음보다 느리게 오른다 — 빠르면 튕겨 나간 것으로 보인다", () => {
    expect(EMBER.riseSpeed, `${EMBER.riseSpeed}m/s`).toBeLessThan(3.2);
  });

  it("수명이 다하면 꺼진다", () => {
    const pool = createEmbers();
    releaseEmber(pool, 0, 0);

    for (let t = 0; t < EMBER.lifeSeconds + 0.2; t += 1 / 60) stepEmbers(pool, 1 / 60);
    expect(pool.filter(emberAlive), "영영 떠 있다").toEqual([]);
  });

  it("꺼진 빛은 진하기가 0이다 — 그리는 쪽이 따로 판정하지 않아도 된다", () => {
    const pool = createEmbers();
    expect(emberFade(pool[0])).toBe(0);

    releaseEmber(pool, 0, 0);
    expect(emberFade(pool[0]), "막 나온 빛이 흐리다").toBeCloseTo(1, 5);
  });

  it("잦아든다 — 툭 꺼지면 사라진 자리가 눈에 남는다", () => {
    const pool = createEmbers();
    releaseEmber(pool, 0, 0);
    const first = emberFade(pool[0]);
    stepEmbers(pool, EMBER.lifeSeconds * 0.5);
    expect(emberFade(pool[0]), `${first} → ${emberFade(pool[0])}`).toBeLessThan(first);
  });
});

describe("풀이 넘칠 때", () => {
  it("상한을 넘지 않는다", () => {
    const pool = createEmbers();
    for (let i = 0; i < EMBER.poolSize * 3; i += 1) releaseEmber(pool, i, 0);
    expect(pool.length, `${pool.length}개`).toBe(EMBER.poolSize);
  });

  it("방금 눕힌 로봇의 빛이 반드시 나온다", () => {
    /*
     * 빈자리가 없다고 새 빛을 버리면 **연속 처치에서 마지막 한 방만 조용하다.**
     * 가장 오래된 것을 밀어낸다.
     */
    const pool = createEmbers();
    for (let i = 0; i < EMBER.poolSize; i += 1) releaseEmber(pool, i, 0);
    releaseEmber(pool, 99, 99);

    const latest = pool.find((ember) => ember.x === 99 && ember.z === 99);
    expect(latest, "마지막 처치의 빛이 버려졌다").toBeDefined();
    expect(emberAlive(latest!), "나오자마자 꺼져 있다").toBe(true);
  });
});

describe("모든 적에게 가슴의 점이 있는가", () => {
  it("치수가 정해져 있다", () => {
    // 값이 없으면 그릴 것도 없다. 대장만 빠지면 규칙이 대장에게는 없는 셈이 된다
    expect(ENEMY_BODY.coreRadius, "일반 로봇에 점이 없다").toBeGreaterThan(0);
    expect(BOSS_BODY.coreRadius, "대장에 점이 없다").toBeGreaterThan(0);
  });

  it("대장의 점이 더 크다 — 몸 크기에 맞아야 같은 조형으로 읽힌다", () => {
    expect(BOSS_BODY.coreRadius, `대장 ${BOSS_BODY.coreRadius} vs 로봇 ${ENEMY_BODY.coreRadius}`).toBeGreaterThan(
      ENEMY_BODY.coreRadius,
    );
  });

  it("점이 몸을 덮지 않는다 — 크면 로봇이 아니라 등불로 보인다", () => {
    expect(ENEMY_BODY.coreRadius * 2, "로봇 몸통보다 크다").toBeLessThan(ENEMY_BODY.bodyWidth);
    expect(BOSS_BODY.coreRadius * 2, "대장 몸통보다 크다").toBeLessThan(BOSS_BODY.bodyWidth);
  });

  it("화면이 실제로 그린다 — 만들어 두고 안 그리면 없는 것과 같다", () => {
    /*
     * 이 저장소에서 여러 번 겪은 실패다. 두 렌더가 각자의 치수를 읽는지 본다.
     */
    expect(readFileSync("src/game/combat/Enemies.tsx", "utf8"), "로봇이 점을 안 그린다").toMatch(
      /ENEMY_BODY\.coreRadius/,
    );
    expect(readFileSync("src/game/combat/Boss.tsx", "utf8"), "대장이 점을 안 그린다").toMatch(
      /BOSS_BODY\.coreRadius/,
    );
  });

  it("쓰러질 때 빛을 놓아 주는 쪽이 있다", () => {
    // 규칙만 있고 부르는 곳이 없으면 화면에서는 아무 일도 일어나지 않는다
    expect(readFileSync("src/game/combat/Enemies.tsx", "utf8"), "아무도 releaseEmber를 안 부른다").toMatch(
      /releaseEmber\(/,
    );
  });
});
