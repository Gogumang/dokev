import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { colorDistance, contrastRatio } from "@/game/core/color";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import { APPEARANCE_ORDER, APPEARANCES } from "@/game/player/appearance";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

/*
 * 월드 색이 배경과 구분되는가.
 *
 * 코드 곳곳에 "멀리서도 알아야 한다", "실루엣이 묻히면 안 된다"는 주석을
 * 달아 두었지만 값을 재 본 적이 없다. 색 대비는 눈으로 어림잡기 가장 어렵고,
 * 이 프로젝트는 그 눈조차 쓰지 못했다.
 *
 * WCAG 비율이 아니라 색 거리를 쓰는 이유: 3D 안의 물체는 조명을 받아 밝기가
 * 계속 변한다. 밝기 대비만 보면 "낮에는 보이고 밤에는 안 보인다"가 통과한다.
 */

const SKIES = Object.values(TIME_OF_DAY).map((preset) => ({ id: preset.id, sky: preset.sky }));

describe("도깨비", () => {
  it("모든 시간대 하늘에서 몸 색이 구분된다", () => {
    /*
     * 동료는 공중에 떠 있어 하늘을 배경으로 보이는 시간이 길다. 하늘색과
     * 가까우면 어디 있는지 놓친다.
     */
    for (const spirit of Object.values(DOKEBI)) {
      for (const { id, sky } of SKIES) {
        const distance = colorDistance(spirit.bodyColor, sky);
        expect(
          distance,
          `${spirit.id} (${spirit.bodyColor}) vs ${id} sky (${sky}): ${distance.toFixed(0)}`,
        ).toBeGreaterThan(40);
      }
    }
  });

  it("서로의 몸 색이 확실히 다르다", () => {
    // 셋이 함께 다니므로 색으로 누가 누구인지 알아야 한다
    const spirits = Object.values(DOKEBI);
    for (let i = 0; i < spirits.length; i += 1) {
      for (let j = i + 1; j < spirits.length; j += 1) {
        const distance = colorDistance(spirits[i].bodyColor, spirits[j].bodyColor);
        expect(
          distance,
          `${spirits[i].id} vs ${spirits[j].id}: ${distance.toFixed(0)}`,
        ).toBeGreaterThan(70);
      }
    }
  });

  it("몸 색과 강조 색이 구분된다", () => {
    // 고리와 꼬리가 몸통에 묻히면 실루엣이 공 하나가 된다
    for (const spirit of Object.values(DOKEBI)) {
      expect(colorDistance(spirit.bodyColor, spirit.accentColor), `${spirit.id}`).toBeGreaterThan(
        70,
      );
    }
  });
});

describe("적", () => {
  /* Enemies.tsx / Boss.tsx가 쓰는 값들 */
  const CHASER = "#b9c0c8";
  const GUNNER = "#c98a3a";
  const BOSS_BODY = "#8a8394";
  const TELEGRAPH = "#ff8a3d";

  it("사수와 근접형이 서로 구분된다", () => {
    /*
     * Enemies.tsx가 "멀리서도 저건 쏜다를 알아야 피할 수 있다"고 적어 두었다.
     * 두 색이 비슷하면 그 주장이 성립하지 않는다.
     */
    const distance = colorDistance(CHASER, GUNNER);
    expect(distance, `chaser ${CHASER} vs gunner ${GUNNER}: ${distance.toFixed(0)}`).toBeGreaterThan(
      70,
    );
  });

  it("보스가 일반 적과 구분된다", () => {
    expect(colorDistance(BOSS_BODY, CHASER)).toBeGreaterThan(30);
  });

  it("예고 색이 평상시 색과 확실히 다르다", () => {
    // 예고를 놓치면 보스전이 성립하지 않는다
    const distance = colorDistance(BOSS_BODY, TELEGRAPH);
    expect(distance, `normal ${BOSS_BODY} vs telegraph ${TELEGRAPH}`).toBeGreaterThan(100);
  });

  it("적 색이 모든 하늘과 구분된다", () => {
    for (const color of [CHASER, GUNNER, BOSS_BODY]) {
      for (const { id, sky } of SKIES) {
        expect(colorDistance(color, sky), `${color} vs ${id} sky`).toBeGreaterThan(30);
      }
    }
  });
});

describe("보스가 일반 로봇과 구분되는가", () => {
  /*
   * `Boss.tsx`는 "일반 로봇과 같은 부품을 쓰되 **크기와 색으로** 구분한다"고
   * 적어 두었다. 주석이 사실인지 재 봤더니 몸통 색거리 92.9, 머리 70.8로
   * 실제로 구분된다.
   *
   * 다만 이건 조용히 깨진다 — 누가 로봇 색만 조금 어둡게 바꾸면 보스는
   * 그냥 큰 로봇이 되고, 주석은 그대로 남는다. 화면을 볼 수 없으니 못 알아챈다.
   */
  const BOSS_BODY = "#8a8394";
  const ENEMY_BODY = "#b9c0c8";
  const BOSS_HEAD = "#6f6a7d";
  const ENEMY_HEAD = "#8f9aa6";

  it("소스에 적힌 색이 실제 값과 같다", () => {
    // 아래 비교가 의미를 가지려면 값이 소스에서 온 것이어야 한다
    const boss = readFileSync("src/game/combat/Boss.tsx", "utf8");
    const enemies = readFileSync("src/game/combat/Enemies.tsx", "utf8");
    expect(boss).toContain(`normal: "${BOSS_BODY}"`);
    expect(enemies).toContain(`ALIVE_COLOR = "${ENEMY_BODY}"`);
  });

  it("몸통 색이 눈에 띄게 다르다", () => {
    const distance = colorDistance(BOSS_BODY, ENEMY_BODY);
    expect(distance, `색거리 ${distance.toFixed(1)}`).toBeGreaterThan(40);
  });

  it("머리 색도 함께 다르다", () => {
    // 몸통만 다르면 멀리서 실루엣으로는 구분되지 않는다
    const distance = colorDistance(BOSS_HEAD, ENEMY_HEAD);
    expect(distance, `색거리 ${distance.toFixed(1)}`).toBeGreaterThan(30);
  });

  it("보스가 더 어둡다 — 큰 놈이 더 밝으면 위협으로 안 읽힌다", () => {
    /*
     * 밝기를 직접 비교하고 싶지만 `relativeLuminance`는 내보내지 않는다.
     * 흰색과의 명암비로 대신한다 — 어두울수록 흰색과의 대비가 크다.
     */
    const bossVsWhite = contrastRatio(BOSS_BODY, "#ffffff");
    const enemyVsWhite = contrastRatio(ENEMY_BODY, "#ffffff");
    expect(
      bossVsWhite,
      `보스 ${bossVsWhite.toFixed(2)}, 로봇 ${enemyVsWhite.toFixed(2)}`,
    ).toBeGreaterThan(enemyVsWhite);
  });
});

describe("날아오는 탄이 보이는가", () => {
  /*
   * 주황이던 탄이 **노을 하늘과 색거리 52**였다. 노을은 기본 시간대다 —
   * 기본 상태에서 원거리 공격이 하늘에 묻혔다.
   *
   * 피할 수 없는 공격은 어려운 것이 아니라 고장 난 것이다. 탄은 배경 어디에
   * 놓여도, 아군 어느 색 옆에 있어도 구분돼야 한다.
   */
  const BOLT = readFileSync("src/game/combat/Enemies.tsx", "utf8").match(
    /const BOLT_COLOR = "(#[0-9a-f]{6})"/i,
  )?.[1];

  it("색이 상수로 잡혀 있다", () => {
    // 인라인으로 박혀 있으면 이 검사가 대상을 찾지 못한다
    expect(BOLT, "BOLT_COLOR 상수를 찾지 못했다").toBeDefined();
  });

  it("네 시간대 하늘 어디서도 묻히지 않는다", () => {
    for (const id of TIME_OF_DAY_ORDER) {
      const sky = TIME_OF_DAY[id].sky;
      const distance = colorDistance(BOLT ?? "", sky);
      expect(distance, `${TIME_OF_DAY[id].name} 하늘 ${sky}과 색거리 ${distance.toFixed(0)}`).toBeGreaterThan(80);
    }
  });

  it("색종이도 하늘을 배경으로 보인다", () => {
    /*
     * 처치 색종이는 위로 튀어 오르므로 하늘이 배경이 된다. 탄과 같은 기준으로
     * 본다 — 다만 위험 신호가 아니라 보상이라 조금 더 느슨해도 된다.
     */
    const confetti = "#ffd23f";
    for (const id of TIME_OF_DAY_ORDER) {
      const distance = colorDistance(confetti, TIME_OF_DAY[id].sky);
      expect(distance, `${TIME_OF_DAY[id].name} 하늘과 ${distance.toFixed(0)}`).toBeGreaterThan(60);
    }
  });

  it("바닥에 그리는 신호는 바닥과 대조한다", () => {
    /*
     * 보스 예고 링을 하늘과 비교했더니 64가 나와 위험해 보였지만, 링은 **바닥에만**
     * 그려진다 — 하늘을 배경으로 놓일 일이 없다. 비교 대상을 잘못 고르면
     * 멀쩡한 것을 고치게 된다.
     */
    const ring = "#ff6b4a";
    for (const ground of ["#6c4637", "#887984", "#1b1125"]) {
      const distance = colorDistance(ring, ground);
      expect(distance, `바닥 ${ground}과 ${distance.toFixed(0)}`).toBeGreaterThan(80);
    }
  });

  it("피격 플래시는 로봇 몸색과 대조한다", () => {
    // 플래시의 일은 "맞았다"를 알리는 것이다 — 기준은 하늘이 아니라 원래 몸색이다
    const distance = colorDistance("#ff8a3d", "#b9c0c8");
    expect(distance, `로봇 몸색과 ${distance.toFixed(0)}`).toBeGreaterThan(120);
  });

  it("아군과 헷갈리지 않는다", () => {
    // 동료 빛과 같은 색이면 위험 신호가 아니라 장식으로 읽힌다
    for (const id of DOKEBI_ORDER) {
      const distance = colorDistance(BOLT ?? "", DOKEBI[id].bodyColor);
      expect(distance, `${DOKEBI[id].name}과 색거리 ${distance.toFixed(0)}`).toBeGreaterThan(80);
    }
  });
});

describe("플레이어와 동료가 구분되는가", () => {
  /*
   * 동료는 늘 옆에 붙어 다닌다. 예전에 둘 다 보라색이라 색거리 41이었고,
   * 「누가 나인지 모르겠다」로 고쳤다 — 그런데 그 뒤로 **외형이 넷, 도깨비가
   * 넷**이 되었는데 조합을 확인하는 것이 없다.
   *
   * 기준은 41 위다. 그때 그 값이 안 된다고 판단했으므로 그보다 낮아지면
   * 같은 문제가 돌아온 것이다.
   */
  const MIN_DISTANCE = 50;

  it("모든 조합이 기준을 넘는다", () => {
    const close: string[] = [];
    for (const look of APPEARANCE_ORDER) {
      for (const id of DOKEBI_ORDER) {
        const distance = colorDistance(APPEARANCES[look].hoodie, DOKEBI[id].bodyColor);
        if (distance <= MIN_DISTANCE) {
          close.push(`${look}(${APPEARANCES[look].hoodie}) vs ${id}(${DOKEBI[id].bodyColor}): ${distance.toFixed(0)}`);
        }
      }
    }
    expect(close, `가까운 조합:\n${close.join("\n")}`).toEqual([]);
  });

  it("외형끼리도 서로 구분된다", () => {
    // 고르는 화면에서 둘이 같아 보이면 선택지가 아니라 장식이 된다
    for (const a of APPEARANCE_ORDER) {
      for (const b of APPEARANCE_ORDER) {
        if (a >= b) continue;
        const distance = colorDistance(APPEARANCES[a].hoodie, APPEARANCES[b].hoodie);
        expect(distance, `${a} vs ${b}: ${distance.toFixed(0)}`).toBeGreaterThan(MIN_DISTANCE);
      }
    }
  });
});
