import { describe, expect, it } from "vitest";

import { BOSS } from "@/game/combat/bossSim";
import { COMBAT_TUNING, GUNNER } from "@/game/combat/combatSim";
import { PLAYER_COMBAT } from "@/game/combat/playerCombat";
import { swingSeconds, WEAPON_ORDER, WEAPONS, weaponRange } from "@/game/combat/weapons";
import { PROJECTILE } from "@/game/combat/projectiles";
import {
  AIR_JUMP_VELOCITY,
  CAMERA,
  GRAPPLE,
  GRAVITY,
  JUMP_VELOCITY,
  LOCOMOTION,
} from "@/game/config/tuning";
import { CAMERA_REDUCED, PHOTO_CAMERA, PLAYER_RADIUS } from "@/game/config/tuning";
import { VENDING } from "@/game/systems/vending";
import { CROWD } from "@/game/world/crowdLayout";
import { TRAFFIC } from "@/game/world/trafficLayout";
import { QUALITY_PRESETS, type QualityLevel } from "@/game/systems/quality";
import { BLIPS } from "@/game/systems/minimap";
import { CITY } from "@/game/world/cityLayout";

/*
 * 수치들 사이의 관계.
 *
 * 값 하나하나는 테스트가 있지만, **값들이 서로 성립하는지**는 주석에만 있었다.
 * "점프하면 탄을 피할 수 있다", "예고를 보고 물러설 시간이 있다" 같은 말은
 * 두 시스템의 숫자가 맞아떨어져야 참이 된다. 한쪽을 조정하면 조용히 거짓이 된다.
 *
 * 이 파일이 잡는 것은 개별 값의 오류가 아니라 **조정으로 깨지는 약속**이다.
 */

/**
 * 드는 무기 중 **가장 빠른** 공격 주기(초).
 *
 * 예전에는 방망이 하나를 박아 두고 잤다. 무기가 은퇴하면 그 검사는 없는 값을
 * 재게 되므로 목록에서 뽑는다 — 「빈틈에 한 번은 때릴 수 있는가」를 볼 때
 * 기준이 되어야 하는 것은 **가장 빨리 때릴 수 있는 수단**이다.
 */
const QUICKEST_CYCLE = Math.min(...WEAPON_ORDER.map((id) => swingSeconds(WEAPONS[id])));

describe("점프로 탄을 피할 수 있는가", () => {
  it("점프 정점이 탄 판정 높이를 넘는다", () => {
    /*
     * projectiles.ts가 "점프하면 아래로 지나간다는 규칙이 눈으로 분명해야
     * 한다"고 적어 두었다. 실제로 넘으려면 정점이 판정 상단보다 높아야 한다.
     *
     * 정점 = v² / (2g). 판정은 가슴 높이(발밑 +0.9) 기준 ±hitHeight다.
     */
    const apex = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
    const dodgeHeight = PROJECTILE.spawnHeight - 0.9 + PROJECTILE.hitHeight;

    expect(apex, `apex=${apex.toFixed(2)}m, need>${dodgeHeight.toFixed(2)}m`).toBeGreaterThan(
      dodgeHeight,
    );
  });

  it("안전한 시간이 사람이 맞출 수 있을 만큼 길다", () => {
    /*
     * 정점 여유(1.42m vs 1.25m = 17cm)만 보면 아슬아슬해 보이지만, 실제로
     * 중요한 것은 **판정 위에 머무는 시간**이다. 정점 근처에서만 피할 수
     * 있다면 프레임 단위로 타이밍을 맞춰야 한다.
     *
     * y(t) = v·t − g·t²/2 가 회피 높이를 넘는 구간의 길이를 푼다.
     * 판별식이 음수면 아예 못 넘는다는 뜻이다.
     */
    const dodgeHeight = PROJECTILE.spawnHeight - 0.9 + PROJECTILE.hitHeight;
    const discriminant = JUMP_VELOCITY * JUMP_VELOCITY - 2 * GRAVITY * dodgeHeight;
    expect(discriminant, "점프로 판정 높이를 넘지 못한다").toBeGreaterThan(0);

    const window = (2 * Math.sqrt(discriminant)) / GRAVITY;
    const airtime = (2 * JUMP_VELOCITY) / GRAVITY;

    /*
     * 사람의 반응 시간은 0.2~0.3초다. 안전 구간이 그보다 짧으면 "탄을 보고
     * 뛰기"가 불가능하고, 미리 뛰어 있는 것만이 답이 된다 — 그건 회피가
     * 아니라 운이다.
     *
     * 측정값: 0.34초 / 체공 0.66초 = 51%. 판정 높이를 1.0에서 0.8로 낮춰
     * 얻은 값이다(그 전에는 0.23초로 반응 시간보다 짧았다).
     */
    expect(
      window,
      `safe window ${window.toFixed(2)}s of ${airtime.toFixed(2)}s airtime`,
    ).toBeGreaterThan(0.3);
  });
});

describe("보스 예고를 보고 피할 수 있는가", () => {
  it("걸어서도 충격 반경을 벗어난다", () => {
    /*
     * 예고(1.1초) 동안 이동해서 충격 반경 밖으로 나가야 한다. 최악은 보스가
     * 사거리 끝(slamRange)에서 내려칠 때다 — 그만큼만 더 가면 된다.
     *
     * 달리기가 아니라 **걷기 속도**로 검사한다. 달려야만 피할 수 있으면
     * 조작을 배우는 중인 사람은 매번 맞는다.
     */
    const needed = BOSS.slamRadius - BOSS.slamRange;
    const walked = LOCOMOTION.walk.maxSpeed * BOSS.windupSeconds;

    expect(
      walked,
      `walk ${walked.toFixed(2)}m in windup, need ${needed.toFixed(2)}m`,
    ).toBeGreaterThan(needed);
  });

  it("빈틈이 한 발 쏠 시간보다 길다", () => {
    // 빈틈에 때릴 수 없으면 그건 빈틈이 아니다
    expect(
      BOSS.recoverSeconds,
      `recover=${BOSS.recoverSeconds}, cycle=${QUICKEST_CYCLE}`,
    ).toBeGreaterThan(QUICKEST_CYCLE);
  });

  it("비틀거림 동안 여러 번 때릴 수 있다", () => {
    expect(BOSS.staggerSeconds / QUICKEST_CYCLE, "비틀거림이 짧아 보상이 안 된다").toBeGreaterThan(
      3,
    );
  });
});

describe("그래플이 이어지는가", () => {
  it("사거리가 가로등 간격보다 길다", () => {
    /*
     * 그래플 지점은 가로등 꼭대기다. 사거리가 간격보다 짧으면 한 번 걸고
     * 내린 자리에서 다음 가로등에 걸 수 없어 연결이 끊긴다.
     */
    expect(
      GRAPPLE.maxRange,
      `range=${GRAPPLE.maxRange}, spacing=${CITY.streetLightSpacing}`,
    ).toBeGreaterThan(CITY.streetLightSpacing);
  });

  it("최소 사거리가 간격보다 짧다", () => {
    // 최소 사거리가 간격보다 길면 바로 옆 가로등을 영영 못 건다
    expect(GRAPPLE.minRange).toBeLessThan(CITY.streetLightSpacing);
  });

  it("안전장치가 풀리기 전에 도착한다", () => {
    /*
     * 걸어 놓고 시간이 다하면 강제로 놓는다. 당기는 속도가 느리면 **사거리
     * 끝에 건 대상에는 영영 못 닿는다** — 걸리기는 하는데 끌려가다 놓여
     * 제자리로 떨어진다.
     *
     * 사거리를 그 시간 안에 주파할 수 있어야 한다. `pullSpeed`를 0.1로
     * 줄여도 모든 검사가 통과하던 자리다.
     */
    const reach = GRAPPLE.pullSpeed * GRAPPLE.maxHoldSeconds;
    expect(
      reach,
      `${GRAPPLE.maxHoldSeconds}초 동안 ${reach.toFixed(1)}m — 사거리 ${GRAPPLE.maxRange}m에 못 미친다`,
    ).toBeGreaterThan(GRAPPLE.maxRange);
  });
});

describe("카메라가 플레이어를 놓치지 않는가", () => {
  /*
   * 따라오는 계수를 0.01로 줄여도 모든 검사가 통과했다. 그 값이면 카메라가
   * 사실상 제자리에 있어 **달리면 화면 밖으로 나간다** — 조작 자체가 성립하지
   * 않는데 아무것도 걸리지 않았다.
   *
   * 지수 감쇠라 「1초 안에 벌어진 거리의 몇 %를 따라잡는가」로 잰다.
   */
  function catchUpInOneSecond(lambda: number): number {
    return 1 - Math.exp(-lambda);
  }

  it("1초 안에 거의 따라잡는다", () => {
    const caught = catchUpInOneSecond(CAMERA.followLambda);
    expect(caught, `1초에 ${(caught * 100).toFixed(1)}%만 따라잡는다`).toBeGreaterThan(0.9);
  });

  it("저감 모션에서 더 빨리 붙는다", () => {
    /*
     * 저감 모션은 화면 변화량을 줄이는 것이 목적이다. 카메라가 늦게 따라올수록
     * 화면이 크게 흔들리므로, 여기서는 **더 빨리** 붙어야 목적에 맞는다.
     */
    expect(
      CAMERA_REDUCED.followLambda,
      `저감 ${CAMERA_REDUCED.followLambda} vs 보통 ${CAMERA.followLambda}`,
    ).toBeGreaterThan(CAMERA.followLambda);
  });

  it("저감 모션도 1초 안에 따라잡는다", () => {
    expect(catchUpInOneSecond(CAMERA_REDUCED.followLambda)).toBeGreaterThan(0.9);
  });
});

describe("가장 낮은 등급도 볼 만한가", () => {
  /*
   * 해상도 배율을 0.05로 줄여도 통과했다 — 화면이 알아볼 수 없는 뭉개짐이
   * 되는데 검사는 조용하다. 자동 강등은 **끊기는 것보다 덜 예쁜 편이 낫다**는
   * 판단인데, 알아볼 수 없으면 그 판단이 성립하지 않는다.
   */
  it("절반 아래로 내려가지 않는다", () => {
    for (const level of ["low", "medium", "high"] as QualityLevel[]) {
      const ratio = QUALITY_PRESETS[level].maxPixelRatio;
      expect(ratio, `${level} 등급이 ${ratio}배`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("그림자를 켠 등급은 쓸 만한 그림자 해상도를 쓴다", () => {
    /*
     * 가벼움은 그림자를 끄므로 그 값이 무엇이든 상관없다 — 실제로 8로
     * 줄여도 아무 일이 없었다. 켜는 등급만 본다.
     */
    let checked = 0;
    for (const level of ["low", "medium", "high"] as QualityLevel[]) {
      const preset = QUALITY_PRESETS[level];
      if (!preset.shadows) continue;
      checked += 1;
      expect(
        preset.shadowMapSize,
        `${level} 그림자 ${preset.shadowMapSize}`,
      ).toBeGreaterThanOrEqual(512);
    }
    expect(checked, `그림자를 켠 등급 ${checked}개`).toBeGreaterThan(0);
  });
});

describe("교통이 성립하는가", () => {
  /*
   * 차간 거리와 감속 시작 거리를 각각 0.1·1로 줄여도 통과했다. 주석에는
   * 근거까지 적혀 있는데(「감쇠 감속이라 멈추는 데 3m 이상 필요하다」)
   * 그 관계를 지키는 것이 없었다.
   */
  it("앞차와 겹치지 않는다", () => {
    /*
     * 멈추는 거리가 차체 길이보다 짧으면 앞차를 파고든다 — 도시가 살아
     * 있다는 인상 대신 「차가 겹친다」가 먼저 보인다.
     */
    expect(
      TRAFFIC.followGap,
      `차간 ${TRAFFIC.followGap}m vs 차체 ${TRAFFIC.bodyLength}m`,
    ).toBeGreaterThan(TRAFFIC.bodyLength);
  });

  it("신호를 밟기 전에 감속을 시작한다", () => {
    /*
     * 주석이 적어 둔 값이다 — 감쇠 감속이라 멈추는 데 3m 이상이 필요하고,
     * 감속 시작이 그보다 짧으면 정지선을 지나간 뒤에 멈춘다.
     *
     * 정지선 여유(stopMargin)까지 더해 재야 한다.
     */
    const BRAKING_DISTANCE = 3;
    expect(
      TRAFFIC.stopLookahead,
      `감속 시작 ${TRAFFIC.stopLookahead}m, 필요 ${BRAKING_DISTANCE + TRAFFIC.stopMargin}m`,
    ).toBeGreaterThan(BRAKING_DISTANCE + TRAFFIC.stopMargin);
  });

  it("차가 사람보다 빠르다", () => {
    // 걷는 속도보다 느리면 도로가 멈춰 있는 것처럼 보인다
    expect(TRAFFIC.minCruiseSpeed).toBeGreaterThan(LOCOMOTION.walk.maxSpeed);
  });

  it("속도 범위가 뒤집히지 않았다", () => {
    expect(TRAFFIC.minCruiseSpeed).toBeLessThan(TRAFFIC.maxCruiseSpeed);
  });
});

describe("포토 모드 거리", () => {
  /*
   * 최소 거리를 0.01m로 줄여도 통과했다 — 카메라가 캐릭터 **안**에 들어가
   * 모델 뒷면과 근평면만 보인다. 사진을 남기라고 만든 모드에서 가장 가까이
   * 당겼을 때 아무것도 안 보이면 곤란하다.
   */
  it("카메라가 몸 안으로 들어가지 않는다", () => {
    expect(
      PHOTO_CAMERA.minDistance,
      `최소 ${PHOTO_CAMERA.minDistance}m vs 몸 반지름 ${PLAYER_RADIUS}m`,
    ).toBeGreaterThan(PLAYER_RADIUS * 2);
  });

  it("기본 거리가 조절 범위 안에 있다", () => {
    // 밖에 있으면 들어가자마자 한쪽 끝으로 튄다
    expect(PHOTO_CAMERA.defaultDistance).toBeGreaterThan(PHOTO_CAMERA.minDistance);
    expect(PHOTO_CAMERA.defaultDistance).toBeLessThan(PHOTO_CAMERA.maxDistance);
  });

  it("한 번 굴려서 끝까지 가지 않는다", () => {
    /*
     * 휠 한 칸이 범위 전체를 덮으면 조절이 아니라 토글이 된다. 적어도 몇
     * 칸은 굴려야 끝에 닿아야 한다.
     */
    const span = PHOTO_CAMERA.maxDistance - PHOTO_CAMERA.minDistance;
    expect(
      span / PHOTO_CAMERA.zoomPerNotch,
      `한 칸 ${PHOTO_CAMERA.zoomPerNotch}m로 범위 ${span}m`,
    ).toBeGreaterThan(5);
  });
});

describe("도시가 비어 보이지 않는가", () => {
  /*
   * 군중 컬링 거리를 1m로 줄여도 통과했다 — 사람이 아무도 안 보이는 도시가
   * 되는데 검사는 조용하다. 「도시가 살아 있다」는 이 게임이 파는 감각의
   * 절반이다.
   */
  it("같은 블록 사람은 보인다", () => {
    expect(
      CROWD.cullDistance,
      `컬링 ${CROWD.cullDistance}m, 블록 ${CITY.blockSize}m`,
    ).toBeGreaterThan(CITY.blockSize);
  });

  it("가까운 사람은 매 프레임 움직인다", () => {
    // 절반 속도로 그리는 거리가 컬링보다 멀면 모두가 뚝뚝 끊겨 보인다
    expect(CROWD.halfRateDistance).toBeLessThan(CROWD.cullDistance);
  });
});

describe("표가 약속한 것이 실제로 일어나는가", () => {
  /*
   * 조작표는 「Space (공중에서 한 번 더)」라고 적어 두었다. 그런데 공중 점프
   * 속도를 0.1로 줄여도 모든 검사가 통과했다 — 눌러도 아무 일이 없는데
   * 표만 남는다. 이 저장소에서 반복해 나온 「안내가 거짓이 되는」 유형이다.
   */
  it("공중 점프가 눈에 띄게 뜬다", () => {
    /*
     * 첫 점프의 절반은 되어야 「한 번 더 떴다」로 읽힌다. 그보다 작으면
     * 떨어지던 속도를 조금 늦춘 것에 가깝다.
     */
    expect(AIR_JUMP_VELOCITY, `공중 ${AIR_JUMP_VELOCITY} vs 지상 ${JUMP_VELOCITY}`).toBeGreaterThan(
      JUMP_VELOCITY / 2,
    );
  });

  it("공중 점프가 첫 점프보다 세지 않다", () => {
    // 두 번째가 더 세면 첫 점프를 일부러 낮게 하는 편이 이득이 된다
    expect(AIR_JUMP_VELOCITY).toBeLessThanOrEqual(JUMP_VELOCITY);
  });

  it("음료가 실제로 빨라지게 한다", () => {
    /*
     * 배율이 1이면 마셔도 아무 일이 없다. 조작표가 「음료 뽑기」를 약속하고
     * 자판기를 80대나 세워 둔 것이 전부 헛말이 된다.
     */
    expect(VENDING.boostScale, `배율 ${VENDING.boostScale}`).toBeGreaterThan(1.05);
  });

  it("음료 효과가 다시 마실 수 있을 때까지보다 짧다", () => {
    // 효과가 재사용 대기보다 길면 한 번 마신 뒤 영영 빨라진 상태가 된다
    expect(
      VENDING.boostSeconds,
      `효과 ${VENDING.boostSeconds}초 vs 대기 ${VENDING.cooldownSeconds}초`,
    ).toBeLessThan(VENDING.cooldownSeconds);
  });
});

describe("지도 표식이 길잡이가 되는가", () => {
  /*
   * 반경을 1m로 줄여도 모든 검사가 통과했다 — 그 크기면 자기 발밑만 보인다.
   * 지도는 「다음 모퉁이에 무엇이 있는가」를 알려 주는 물건이므로, 적어도 한
   * 블록은 담아야 한다.
   */
  const blockPitch = CITY.blockSize + CITY.roadWidth;

  it("한 블록 너머까지 보인다", () => {
    expect(
      BLIPS.rangeMeters,
      `반경 ${BLIPS.rangeMeters}m, 블록 간격 ${blockPitch}m`,
    ).toBeGreaterThan(blockPitch);
  });

  it("적을 알아보기 전에 화면에 들어온다", () => {
    /*
     * 로봇이 나를 인지하는 거리보다 표식 반경이 좁으면, 표식이 뜨는 순간 이미
     * 쫓기고 있다 — 미리 보라고 만든 것이 사후 통보가 된다.
     */
    expect(
      BLIPS.rangeMeters,
      `반경 ${BLIPS.rangeMeters}m vs 인지 ${COMBAT_TUNING.aggroRadius}m`,
    ).toBeGreaterThan(COMBAT_TUNING.aggroRadius);
  });
});

describe("보스가 일반 로봇과 구분되는가", () => {
  /*
   * 「쓰러진 뒤 다시 일어나기까지. 일반 로봇보다 훨씬 길다」고 적어 두었지만
   * 그 관계를 지키는 것이 없었다 — 0.1초로 줄여도 모든 검사가 통과했다.
   * 그러면 눕히자마자 다시 서서, 이기는 순간이 사라진다.
   */
  it("다시 서기까지 일반 로봇보다 오래 걸린다", () => {
    expect(
      BOSS.downSeconds,
      `보스 ${BOSS.downSeconds}초 vs 로봇 ${COMBAT_TUNING.downSeconds}초`,
    ).toBeGreaterThan(COMBAT_TUNING.downSeconds * 2);
  });

  it("체력도 훨씬 두껍다", () => {
    // 두께와 재등장 시간이 함께 「큰 놈」을 만든다. 하나만 지키면 어긋난다
    expect(BOSS.maxHp).toBeGreaterThan(COMBAT_TUNING.maxHp * 2);
  });
});

describe("전투가 성립하는가", () => {
  it("사수의 탄이 인지 반경보다 멀리 간다", () => {
    /*
     * 도망치는 등에도 닿아야 "쫓기는" 느낌이 난다. 사거리가 인지 반경보다
     * 짧으면 인지하자마자 사거리 밖인 구간이 생긴다.
     */
    const reach = PROJECTILE.speed * PROJECTILE.lifeSeconds;
    expect(
      reach,
      `reach=${reach.toFixed(1)}m, aggro=${COMBAT_TUNING.aggroRadius}m`,
    ).toBeGreaterThan(COMBAT_TUNING.aggroRadius);
  });

  it("탄이 달리기보다 빠르다", () => {
    // 뒤돌아 달리기만으로 피할 수 있으면 사수가 무의미하다
    expect(PROJECTILE.speed).toBeGreaterThan(LOCOMOTION.run.maxSpeed);
  });

  it("사수가 다른 로봇보다 멀리 서되, 쏴서 닿는 자리에 선다", () => {
    /*
     * 예전에는 「근접 사거리 밖인가」를 봤다. 드는 무기가 활·광선총 둘로
     * 좁혀지면서 근접 사거리라는 것이 사라졌고, 그 검사는 **없는 값**을
     * 재고 있었다.
     *
     * 지금 지켜야 하는 것은 둘이다: 달려드는 로봇(`standoffRadius`)보다 멀리
     * 서야 「저건 쏘는 놈」으로 읽히고, 내 사거리 안에 있어야 **답할 수 있는
     * 싸움**이 된다. 밖에 서면 그건 어려운 것이 아니라 고장이다.
     */
    expect(GUNNER.minDistance, "달려드는 로봇과 같은 자리에 선다").toBeGreaterThan(
      COMBAT_TUNING.standoffRadius,
    );
    const shortest = Math.min(...WEAPON_ORDER.map((id) => weaponRange(WEAPONS[id])));
    expect(GUNNER.minDistance, `사수 ${GUNNER.minDistance}m, 내 사거리 ${shortest}m`).toBeLessThan(
      shortest,
    );
  });

  it("사수가 자기 사거리 안에 선다", () => {
    const reach = PROJECTILE.speed * PROJECTILE.lifeSeconds;
    expect(
      GUNNER.maxDistance,
      `keep=${GUNNER.maxDistance}, reach=${reach.toFixed(1)}`,
    ).toBeLessThan(reach);
  });

  it("무적 시간이 적의 공격 주기보다 짧다", () => {
    /*
     * 무적이 더 길면 여러 마리에 둘러싸여도 사실상 무적이 된다. 반대로 너무
     * 짧으면 한 번에 체력이 다 깎인다 — 그 균형이 이 두 값의 관계다.
     */
    expect(PLAYER_COMBAT.invulnerableSeconds).toBeGreaterThan(QUICKEST_CYCLE);
    expect(PLAYER_COMBAT.invulnerableSeconds).toBeLessThan(QUICKEST_CYCLE * 4);
  });

  it("최대 체력이 회복 대기보다 오래 버틴다", () => {
    // 최악의 경우(계속 맞음) 버티는 시간이 회복 시작보다 짧으면 회복이 무의미하다
    const survival = PLAYER_COMBAT.maxHp * PLAYER_COMBAT.invulnerableSeconds;
    expect(survival, `survival=${survival.toFixed(1)}s`).toBeGreaterThan(
      PLAYER_COMBAT.regenDelaySeconds * 0.5,
    );
  });
});

describe("도시와 이동", () => {
  it("보드 최고 속도로 한 구역을 지나는 데 시간이 걸린다", () => {
    /*
     * 구역 하나를 0.5초에 지나가면 도시가 좁게 느껴진다. 최소한 한 호흡은
     * 있어야 "구역을 지났다"는 감각이 생긴다.
     */
    const pitch = CITY.blockSize + CITY.roadWidth;
    const seconds = pitch / LOCOMOTION.skateboard.maxSpeed;
    expect(seconds, `${seconds.toFixed(2)}s per block`).toBeGreaterThan(1.5);
  });

  it("걸어서 도시를 가로지르는 것이 지루할 만큼 멀다", () => {
    // 걸어서 금방 끝나면 보드와 그래플을 쓸 이유가 없다
    const across = CITY.gridSize * (CITY.blockSize + CITY.roadWidth);
    const walkSeconds = across / LOCOMOTION.walk.maxSpeed;
    expect(walkSeconds, `${walkSeconds.toFixed(0)}s to walk across`).toBeGreaterThan(60);
  });
});

describe("안개와 스트리밍", () => {
  /**
   * 스트리밍이 확실히 덮는 거리(m).
   *
   * 가장 가까운 **안 그리는** 구역은 체비셰프 거리 radius+1에 있고, 그
   * 구역의 앞면은 중심에서 blockSize/2만큼 앞이다. 플레이어는 자기 구역
   * 안에서 최대 pitch/2만큼 그쪽으로 치우쳐 있을 수 있다.
   */
  function streamCoverage(radius: number): number {
    const pitch = CITY.blockSize + CITY.roadWidth;
    return (radius + 0.5) * pitch - CITY.blockSize / 2;
  }

  it("모든 품질에서 안개가 스트리밍 안쪽에 있다", () => {
    /*
     * 안개가 더 멀리 보이면 그 사이 구간의 건물이 통째로 빠진 채 보인다 —
     * 도시가 잘린 것처럼 보이고, 다가가면 눈앞에서 생겨난다.
     *
     * 실제로 그랬다: 반경 2는 100.5m를 덮는데 높은 품질의 안개는 220m였다.
     */
    for (const level of ["low", "medium", "high"] as const) {
      const preset = QUALITY_PRESETS[level];
      const coverage = streamCoverage(preset.streamRadius);
      expect(
        preset.fogFar,
        `${level}: fog ${preset.fogFar}m > streaming ${coverage.toFixed(1)}m (radius ${preset.streamRadius})`,
      ).toBeLessThanOrEqual(coverage);
    }
  });

  it("안개 시작이 끝보다 가깝다", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const preset = QUALITY_PRESETS[level];
      expect(preset.fogNear, `${level}`).toBeLessThan(preset.fogFar);
    }
  });

  it("높은 품질일수록 멀리 보인다", () => {
    // 이름만 높고 시야가 같으면 품질을 고를 이유가 없다
    expect(QUALITY_PRESETS.low.fogFar).toBeLessThan(QUALITY_PRESETS.medium.fogFar);
    expect(QUALITY_PRESETS.medium.fogFar).toBeLessThan(QUALITY_PRESETS.high.fogFar);
  });

  it("반경도 품질을 따라 올라간다", () => {
    expect(QUALITY_PRESETS.low.streamRadius).toBeLessThanOrEqual(
      QUALITY_PRESETS.medium.streamRadius,
    );
    expect(QUALITY_PRESETS.medium.streamRadius).toBeLessThanOrEqual(
      QUALITY_PRESETS.high.streamRadius,
    );
  });

  it("안개가 도시 한 변보다 짧다", () => {
    // 도시 전체가 안개 없이 보이면 경계 밖 빈 공간이 그대로 드러난다
    const across = CITY.gridSize * (CITY.blockSize + CITY.roadWidth);
    expect(
      QUALITY_PRESETS.high.fogFar,
      `fog=${QUALITY_PRESETS.high.fogFar}, city=${across}`,
    ).toBeLessThan(across);
  });
});

describe("카메라 시작 구도", () => {
  /**
   * 지평선이 화면 위에서 몇 %에 걸리는지.
   *
   * 카메라는 목표를 pitch만큼 내려다본다. 무한히 먼 지평선은 시선축보다
   * pitch만큼 **위**에 보이므로, 화면 중앙에서 위로 tan(pitch)/tan(fov/2)만큼
   * 떨어진 곳에 걸린다.
   */
  function horizonFromTop(pitchRad: number, fovDegrees: number): number {
    const halfFov = ((fovDegrees / 2) * Math.PI) / 180;
    return 0.5 - 0.5 * (Math.tan(pitchRad) / Math.tan(halfFov));
  }

  it("계산이 실제 화면과 맞는다", () => {
    // 브라우저에서 띄워 재 보니 31%였다. 예전 값 0.18로 넣으면 그 근처가 나와야 한다
    const measured = horizonFromTop(0.18, CAMERA.fovBase);
    expect(measured, `계산 ${(measured * 100).toFixed(0)}%, 실측 31%`).toBeCloseTo(0.33, 1);
  });

  it("지평선이 위쪽 3분의 1에 몰리지 않는다", () => {
    /*
     * 0.18일 때 화면의 3분의 2가 보도블록이었고, 이 동네에서 가장 눈에 띄는
     * 세로 간판이 위로 잘려 나갔다. 반복되는 바닥 텍스처가 화면을 지배하면
     * 도시를 만든 의미가 없다.
     */
    const fraction = horizonFromTop(CAMERA.pitchStart, CAMERA.fovBase);
    expect(fraction, `지평선이 ${(fraction * 100).toFixed(0)}% 지점`).toBeGreaterThan(0.35);
  });

  it("그래도 내려다본다 — 발밑이 보여야 착지 지점을 가늠한다", () => {
    expect(CAMERA.pitchStart).toBeGreaterThan(0);
    const fraction = horizonFromTop(CAMERA.pitchStart, CAMERA.fovBase);
    expect(fraction, `지평선이 ${(fraction * 100).toFixed(0)}% 지점`).toBeLessThan(0.5);
  });

  it("시작 각이 조작 범위 안에 있다", () => {
    expect(CAMERA.pitchStart).toBeGreaterThan(CAMERA.pitchMin);
    expect(CAMERA.pitchStart).toBeLessThan(CAMERA.pitchMax);
  });
});

describe("안개 시작 거리가 등급마다 같은 인상을 주는가", () => {
  /*
   * 가벼움에서 길 건너 건물이 곧바로 흐려지는 것을 보고 `fogNear: 30`이
   * 너무 가깝다고 판단해 55로 올렸다가 되돌렸다 — 세 등급이 이미
   * `fogNear ≈ fogFar × 0.31`로 **일관된 규칙**을 따르고 있었다.
   *
   * 흐려지는 구간이 보이는 거리에 비례해야 등급을 바꿔도 같은 인상이 난다.
   * 한 등급만 손대면 그 등급만 다른 세계처럼 보인다.
   */
  it("세 등급이 같은 비율을 쓴다", () => {
    const ratios = (Object.keys(QUALITY_PRESETS) as QualityLevel[]).map((level) => {
      const preset = QUALITY_PRESETS[level];
      return { level, ratio: preset.fogNear / preset.fogFar };
    });

    const lowest = Math.min(...ratios.map((r) => r.ratio));
    const highest = Math.max(...ratios.map((r) => r.ratio));
    expect(
      highest - lowest,
      ratios.map((r) => `${r.level} ${r.ratio.toFixed(3)}`).join(", "),
    ).toBeLessThan(0.05);
  });

  it("흐려지는 구간이 남아 있다", () => {
    // 시작과 끝이 붙으면 안개가 아니라 잘린 벽이 된다
    for (const level of Object.keys(QUALITY_PRESETS) as QualityLevel[]) {
      const preset = QUALITY_PRESETS[level];
      const band = preset.fogFar - preset.fogNear;
      expect(band, `${level}: ${preset.fogNear}~${preset.fogFar}m`).toBeGreaterThan(
        preset.fogFar * 0.5,
      );
    }
  });
});
