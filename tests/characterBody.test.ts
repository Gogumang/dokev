import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { PLAYER_HEIGHT } from "@/game/config/tuning";
import { BOSS_BODY } from "@/game/combat/bossBody";
import { ENEMY_BODY } from "@/game/combat/enemyBody";
import { SHRINE_BODY } from "@/game/dokebi/shrineBody";
import { COMPANION_BODY } from "@/game/dokebi/companionBody";
import { PLAYER_BODY } from "@/game/player/characterBody";

/*
 * 플레이어 몸 비례.
 *
 * 치수가 `Character.tsx` 안에 숫자로 박혀 있어 **검사할 대상 자체가 없었다** —
 * 값을 아홉 배로 늘려도 모든 검사가 통과했다. 보행자는 이미 `PED_BODY`로
 * 이름 붙여 두었고, 같은 방식으로 옮긴 뒤 같은 잣대를 댄다.
 *
 * 절대 크기가 아니라 비례로 본다. 캐릭터를 키울 수는 있지만 팔이 몸통보다
 * 굵을 수는 없다.
 */

describe("사람 모양인가", () => {
  it("팔다리가 몸통보다 가늘다", () => {
    expect(PLAYER_BODY.armRadius, "팔").toBeLessThan(PLAYER_BODY.torsoRadius);
    expect(PLAYER_BODY.legRadius, "다리").toBeLessThan(PLAYER_BODY.torsoRadius);
  });

  it("굵기가 길이를 넘지 않는다", () => {
    expect(PLAYER_BODY.armRadius * 2).toBeLessThan(PLAYER_BODY.armLength);
    expect(PLAYER_BODY.legRadius * 2).toBeLessThan(PLAYER_BODY.legLength);
  });

  it("머리카락이 머리를 감싼다", () => {
    /*
     * 같거나 작으면 두피가 머리를 뚫고 나온다 — 값이 아주 가까워서 한쪽만
     * 만지면 조용히 어긋난다.
     */
    expect(PLAYER_BODY.hairRadius, `머리 ${PLAYER_BODY.headRadius}`).toBeGreaterThan(
      PLAYER_BODY.headRadius,
    );
    // 너무 크면 헬멧이 된다
    expect(PLAYER_BODY.hairRadius).toBeLessThan(PLAYER_BODY.headRadius * 1.3);
  });

  it("머리가 몸통보다 크지 않다", () => {
    expect(PLAYER_BODY.headRadius).toBeLessThanOrEqual(PLAYER_BODY.torsoRadius * 1.2);
  });

  it("가방이 등에 붙을 크기다", () => {
    // 몸통보다 넓으면 가방이 사람을 업은 것처럼 보인다
    expect(PLAYER_BODY.bagWidth, `가방 ${PLAYER_BODY.bagWidth}`).toBeLessThan(
      PLAYER_BODY.torsoRadius * 2 * 1.2,
    );
  });

  it("충돌 크기와 그림 크기가 어긋나지 않는다", () => {
    /*
     * 이동·충돌은 `PLAYER_HEIGHT`를 쓰고 그림은 이 치수를 쓴다. 둘이 갈라지면
     * 보이는 것과 부딪히는 것이 달라진다 — 벽에 몸이 반쯤 들어가 보인다.
     */
    const drawn = PLAYER_BODY.legLength + PLAYER_BODY.torsoLength + PLAYER_BODY.headRadius * 2;
    expect(drawn, `그린 키 ${drawn.toFixed(2)}m vs 충돌 ${PLAYER_HEIGHT}m`).toBeGreaterThan(
      PLAYER_HEIGHT * 0.5,
    );
    expect(drawn, `그린 키 ${drawn.toFixed(2)}m vs 충돌 ${PLAYER_HEIGHT}m`).toBeLessThan(
      PLAYER_HEIGHT * 1.5,
    );
  });
});

describe("보드가 탈 만한 모양인가", () => {
  it("앞뒤가 좌우보다 길다", () => {
    // 정사각형이면 보드가 아니라 판자다
    expect(PLAYER_BODY.deckLength, `길이 ${PLAYER_BODY.deckLength}`).toBeGreaterThan(
      PLAYER_BODY.deckWidth * 2,
    );
  });

  it("상판이 얇다", () => {
    expect(PLAYER_BODY.deckHeight).toBeLessThan(PLAYER_BODY.deckWidth / 3);
  });

  it("발이 상판 위에 올라간다", () => {
    // 신발이 상판보다 넓으면 발이 허공에 걸친다
    expect(PLAYER_BODY.shoeWidth, `신발 ${PLAYER_BODY.shoeWidth}`).toBeLessThan(
      PLAYER_BODY.deckWidth,
    );
  });

  it("바퀴가 상판 아래에 들어간다", () => {
    expect(PLAYER_BODY.wheelRadius * 2).toBeLessThan(PLAYER_BODY.deckLength / 4);
  });
});

describe("치수가 한 곳에 모여 있는가", () => {
  it("그리는 쪽이 숫자를 다시 적지 않는다", () => {
    /*
     * 이름을 붙여 놓고 한쪽에 숫자를 남기면 두 값이 갈라진다 — 이 저장소에서
     * 인도 높이가 그렇게 어긋난 적이 있다.
     */
    const source = readCode("src/game/player/Character.tsx");
    const start = source.indexOf("const geometry = useMemo(");
    expect(start, "지오메트리 블록을 못 찾았다").toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf("[],", start));

    // 세그먼트 수(16, 12 같은 정수)는 치수가 아니므로 소수만 본다
    const literals = block.match(/\b0\.\d+/g) ?? [];
    expect(literals, `숫자를 다시 적었다: ${literals.join(", ")}`).toEqual([]);
  });
});

describe("동료가 도깨비 모양인가", () => {
  /*
   * 동료는 늘 옆에 붙어 다녀 플레이어 다음으로 눈에 띈다. 여기도 치수가
   * 숫자로 박혀 있어 검사할 대상이 없었다.
   */
  it("고리가 몸 밖을 돈다", () => {
    /*
     * 안쪽이면 고리가 몸에 파묻혀 아예 안 보인다. 값이 0.34와 0.52로 가까워
     * 한쪽만 만지면 조용히 뒤집힌다.
     */
    expect(
      COMPANION_BODY.ringRadius,
      `고리 ${COMPANION_BODY.ringRadius} vs 몸 ${COMPANION_BODY.bodyRadius}`,
    ).toBeGreaterThan(COMPANION_BODY.bodyRadius);
  });

  it("고리가 가늘다", () => {
    // 두꺼우면 고리가 아니라 도넛이 된다
    expect(COMPANION_BODY.ringThickness).toBeLessThan(COMPANION_BODY.bodyRadius / 3);
  });

  it("눈이 몸보다 훨씬 작다", () => {
    expect(COMPANION_BODY.eyeRadius, "눈").toBeLessThan(COMPANION_BODY.bodyRadius / 3);
  });

  it("불꽃이 받침보다 넓지 않다", () => {
    // 넓으면 받침이 불꽃에 파묻혀 떠 있는 것처럼 보인다
    expect(COMPANION_BODY.flameRadius).toBeLessThanOrEqual(COMPANION_BODY.capBottomRadius);
  });

  it("불꽃이 위로 서 있다", () => {
    // 높이가 반지름보다 작으면 불꽃이 아니라 접시가 된다
    expect(COMPANION_BODY.flameHeight).toBeGreaterThan(COMPANION_BODY.flameRadius);
  });

  it("플레이어 옆에 설 크기다", () => {
    /*
     * 동료가 사람만 해지면 「데리고 다닌다」가 아니라 「둘이 걷는다」가 된다.
     * 몸통 지름이 플레이어 키의 절반을 넘지 않아야 한다.
     */
    const diameter = COMPANION_BODY.bodyRadius * 2;
    expect(diameter, `동료 지름 ${diameter.toFixed(2)}m vs 플레이어 키 ${PLAYER_HEIGHT}m`).toBeLessThan(
      PLAYER_HEIGHT / 2,
    );
  });
});

describe("고물 로봇이 로봇 모양인가", () => {
  /*
   * 전투는 가까이서 보는 자리다. 치수가 숫자로 박혀 있어 검사할 대상이 없었다.
   */
  it("머리가 몸통보다 작다", () => {
    expect(ENEMY_BODY.headWidth, "머리 가로").toBeLessThan(ENEMY_BODY.bodyWidth);
    expect(ENEMY_BODY.headHeight, "머리 높이").toBeLessThan(ENEMY_BODY.bodyHeight);
  });

  it("팔이 몸통보다 가늘다", () => {
    // 굵으면 팔이 아니라 기둥이 된다
    expect(ENEMY_BODY.armWidth, "팔 굵기").toBeLessThan(ENEMY_BODY.bodyWidth / 2);
  });

  it("팔이 몸통만큼 길다", () => {
    // 짧으면 몸통에 파묻혀 흔들려도 안 보인다
    expect(ENEMY_BODY.armHeight, "팔 길이").toBeGreaterThan(ENEMY_BODY.bodyHeight / 2);
  });

  it("색종이가 로봇보다 훨씬 작다", () => {
    // 쓰러질 때 흩어지는 조각이다. 크면 로봇이 쪼개진 것처럼 보인다
    expect(ENEMY_BODY.confettiSize).toBeLessThan(ENEMY_BODY.bodyWidth / 3);
  });

  it("탄이 눈에 보일 만큼은 크다", () => {
    /*
     * 날아오는 것을 보고 피해야 한다. 너무 작으면 「맞았는데 뭐에 맞았지」가
     * 되고, 너무 크면 로봇이 자기만 한 것을 쏜다.
     */
    expect(ENEMY_BODY.boltRadius, "탄 크기").toBeGreaterThan(0.1);
    expect(ENEMY_BODY.boltRadius).toBeLessThan(ENEMY_BODY.bodyWidth / 2);
  });

  it("플레이어와 비슷한 덩치다", () => {
    // 훨씬 작으면 위협으로 안 읽히고, 훨씬 크면 보스와 구분되지 않는다
    const height = ENEMY_BODY.bodyHeight + ENEMY_BODY.headHeight;
    expect(height, `로봇 키 ${height.toFixed(2)}m vs 플레이어 ${PLAYER_HEIGHT}m`).toBeGreaterThan(
      PLAYER_HEIGHT * 0.4,
    );
    expect(height, `로봇 키 ${height.toFixed(2)}m`).toBeLessThan(PLAYER_HEIGHT * 1.3);
  });
});

describe("고물 대장이 큰 놈으로 읽히는가", () => {
  /*
   * 「큰 놈」이라는 인상이 곧 이 적의 정체다. 색·체력·재등장 시간은 이미
   * 관계로 묶어 두었는데 **덩치는 아무도 안 봤다.**
   */
  it("일반 로봇보다 확실히 크다", () => {
    const boss = BOSS_BODY.bodyHeight + BOSS_BODY.headHeight;
    const enemy = ENEMY_BODY.bodyHeight + ENEMY_BODY.headHeight;
    expect(boss, `대장 ${boss.toFixed(2)}m vs 로봇 ${enemy.toFixed(2)}m`).toBeGreaterThan(
      enemy * 1.8,
    );
  });

  it("사람보다 크다", () => {
    // 올려다보지 않으면 보스가 아니다
    expect(BOSS_BODY.bodyHeight, `몸통 ${BOSS_BODY.bodyHeight}m`).toBeGreaterThan(PLAYER_HEIGHT);
  });

  it("팔이 몸통보다 가늘다", () => {
    expect(BOSS_BODY.armWidth).toBeLessThan(BOSS_BODY.bodyWidth / 2);
  });

  it("휘두르는 팔이 길다", () => {
    // 짧으면 내려치는 동작이 몸통 안에서 끝나 예고가 안 읽힌다
    expect(BOSS_BODY.armHeight, `팔 ${BOSS_BODY.armHeight}m`).toBeGreaterThan(
      BOSS_BODY.bodyHeight / 2,
    );
  });

  it("예고 링이 충격 반경과 같다", () => {
    /*
     * 그림과 판정이 갈라지면 「링 밖인데 맞았다」가 된다 — 공정성 문제다.
     * 그래서 링 크기는 몸 치수가 아니라 `BOSS.slamRadius`에서 온다.
     */
    const source = readCode("src/game/combat/Boss.tsx");
    expect(source, "링이 판정과 다른 값을 쓴다").toContain("BOSS.slamRadius * 2");
  });
});

describe("도깨비 자리가 탑 모양인가", () => {
  /*
   * 돌탑처럼 아래가 넓고 위로 갈수록 좁아진다. **층끼리의 관계**가 곧 모양이라
   * 한 층만 만지면 탑이 아니라 기둥이 된다.
   */
  it("위로 갈수록 좁아진다", () => {
    expect(SHRINE_BODY.middleBottomRadius, "가운데").toBeLessThan(SHRINE_BODY.baseBottomRadius);
    expect(SHRINE_BODY.topBottomRadius, "꼭대기").toBeLessThan(SHRINE_BODY.middleBottomRadius);
  });

  it("각 층이 아래가 넓다", () => {
    // 뒤집히면 탑이 아니라 깔때기를 쌓은 모양이 된다
    expect(SHRINE_BODY.baseBottomRadius).toBeGreaterThan(SHRINE_BODY.baseTopRadius);
    expect(SHRINE_BODY.middleBottomRadius).toBeGreaterThan(SHRINE_BODY.middleTopRadius);
    expect(SHRINE_BODY.topBottomRadius).toBeGreaterThan(SHRINE_BODY.topTopRadius);
  });

  it("구슬이 꼭대기 층에 얹힌다", () => {
    // 층보다 크면 탑이 구슬을 이고 있는 것이 아니라 구슬에 꽂힌 것처럼 보인다
    expect(SHRINE_BODY.orbRadius, "구슬").toBeLessThan(SHRINE_BODY.topTopRadius);
  });

  it("빛 알갱이가 구슬보다 훨씬 작다", () => {
    expect(SHRINE_BODY.moteRadius).toBeLessThan(SHRINE_BODY.orbRadius / 2);
  });

  it("빛기둥이 탑을 감싼다", () => {
    // 좁으면 탑 안에서 새어 나오는 것처럼 보이고, 멀리서 못 알아본다
    expect(SHRINE_BODY.beamBottomRadius, "빛기둥 아래").toBeGreaterThan(SHRINE_BODY.topTopRadius);
  });
});

describe("아직 이름이 없는 치수", () => {
  /*
   * 플레이어·보행자·동료는 이름 붙은 상수로 옮겼다. 적·보스·도깨비 자리는
   * **아직 숫자로 박혀 있다** — 눈에 덜 띄는 자리라 여기서 멈췄고, 멈췄다는
   * 사실을 적어 둔다.
   *
   * 이 검사는 「고쳐라」가 아니라 「어디까지 했는지」를 남기는 것이다. 목록이
   * 낡으면(이미 옮겼는데 여기 남아 있으면) 실패해서 갱신하게 만든다.
   */
  const PENDING: string[] = [];

  const DONE = [
    "src/game/player/Character.tsx",
    "src/game/dokebi/Companion.tsx",
    "src/game/combat/Enemies.tsx",
    "src/game/combat/Boss.tsx",
    "src/game/dokebi/Shrine.tsx",
  ];

  function inlineDimensions(path: string): number {
    const source = readCode(path);
    return (source.match(/new THREE\.\w+Geometry\([^)]*\b0\.\d+/g) ?? []).length;
  }

  it("옮긴 파일에는 숫자가 남아 있지 않다", () => {
    for (const path of DONE) {
      expect(inlineDimensions(path), `${path}에 숫자가 남았다`).toBe(0);
    }
  });

  it("남은 목록이 실제와 맞는다", () => {
    /*
     * 이미 옮긴 파일이 목록에 남아 있으면 「아직 할 일이 있다」는 거짓이 된다 —
     * 이 저장소에서 낡은 목록에 여러 번 속았다. 지금은 다 옮겨 목록이 비었고,
     * 새 컴포넌트가 숫자를 박으면 아래 검사가 잡는다.
     */
    for (const path of PENDING) {
      expect(inlineDimensions(path), `${path}는 이미 옮겼다 — 목록에서 빼라`).toBeGreaterThan(0);
    }
  });

  it("씬 컴포넌트 어디에도 숫자가 박혀 있지 않다", () => {
    /*
     * 목록이 비었으므로 이제 규칙으로 지킨다 — 새 컴포넌트가 치수를 숫자로
     * 적으면 여기서 걸린다. 「어디까지 했는가」를 적는 단계가 끝나고
     * 「그렇게 하지 않는다」가 된 것이다.
     */
    const offenders = collectSources("src")
      .filter((path) => inlineDimensions(path) > 0)
      .map((path) => `${path} (${inlineDimensions(path)}곳)`);
    expect(offenders, `치수를 숫자로 적은 곳:\n${offenders.join("\n")}`).toEqual([]);
  });
});
