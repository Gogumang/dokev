import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";
import { PHOTO_CAMERA } from "@/game/config/tuning";

import { CAMERA, CAMERA_REDUCED, CHARACTER_FADE, LANDING_SHAKE } from "@/game/config/tuning";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";
import {
  followDistance,
  followFov,
  followHeight,
  lookAheadDistance,
  orbitDirection,
  speedRatio,
  stepLandingShake,
  vistaOpenness,
} from "@/game/scene/cameraRig";
import { combatPressure } from "@/game/combat/combatLink";

/*
 * 카메라.
 *
 * 88번의 반복 동안 한 번도 검증된 적이 없다. 화면을 못 보는 상태에서 가장
 * 확인하기 어려운 부분이라 순수 함수로 떼어 냈고, 이제 그 값들을 검사한다.
 */

describe("speedRatio", () => {
  it("멈춰 있으면 0이다", () => {
    expect(speedRatio(0, CAMERA.fovSpeedReference)).toBe(0);
  });

  it("기준 속도에서 1이다", () => {
    expect(speedRatio(CAMERA.fovSpeedReference, CAMERA.fovSpeedReference)).toBe(1);
  });

  it("기준을 넘어도 1을 넘지 않는다", () => {
    // 넘치면 시야각이 계속 벌어져 어안 렌즈가 된다
    expect(speedRatio(CAMERA.fovSpeedReference * 5, CAMERA.fovSpeedReference)).toBe(1);
  });
});

describe("followDistance", () => {
  it("빠를수록 멀어진다", () => {
    // 멀어져야 앞이 더 보이고, 그 자체가 속도감이 된다
    const still = followDistance(CAMERA, 0, false, 0, 0, 0, false);
    const fast = followDistance(CAMERA, 1, false, 0, 0, 0, false);
    expect(fast, `still=${still}, fast=${fast}`).toBeGreaterThan(still);
  });

  it("포토 모드에서는 휠로 정한 거리를 그대로 쓴다", () => {
    // 속도에 따라 움직이면 구도를 잡을 수 없다
    expect(followDistance(CAMERA, 1, true, 6.5, 0, 0, false)).toBe(6.5);
  });

  it("저감 모션에서도 거리가 있다", () => {
    // 0이면 카메라가 머리 안에 들어간다
    // 제품이 쓰는 모양 그대로 겹쳐서 잰다 — 저감 값은 CAMERA 위에 얹힌다
    expect(followDistance({ ...CAMERA, ...CAMERA_REDUCED }, 0, false, 0, 0, 0, false)).toBeGreaterThan(1);
  });
});

describe("orbitDirection", () => {
  it("단위 벡터다", () => {
    // 길이가 1이 아니면 거리 계산이 통째로 어긋난다
    for (const [yaw, pitch] of [
      [0, 0],
      [1.2, 0.4],
      [-2.6, -0.3],
      [3.9, 1.1],
    ]) {
      const dir = orbitDirection(yaw, pitch);
      expect(Math.hypot(dir.x, dir.y, dir.z), `yaw=${yaw}, pitch=${pitch}`).toBeCloseTo(1, 6);
    }
  });

  it("yaw 0이면 +z를 본다", () => {
    const dir = orbitDirection(0, 0);
    expect(dir.z).toBeCloseTo(1, 6);
    expect(dir.x).toBeCloseTo(0, 6);
  });

  it("pitch가 올라가면 y가 커진다", () => {
    // 부호가 뒤집히면 위를 보려 할 때 카메라가 땅으로 들어간다
    expect(orbitDirection(0, 0.5).y).toBeGreaterThan(orbitDirection(0, 0).y);
  });

  it("yaw가 돌면 수평 방향이 돈다", () => {
    const east = orbitDirection(Math.PI / 2, 0);
    expect(east.x).toBeCloseTo(1, 6);
    expect(east.z).toBeCloseTo(0, 6);
  });
});

describe("followFov", () => {
  it("빠를수록 넓어진다", () => {
    const still = followFov(CAMERA, 0, false);
    const fast = followFov(CAMERA, 1, false);
    expect(fast, `still=${still}, fast=${fast}`).toBeGreaterThan(still);
  });

  it("포토 모드에서는 기본값으로 고정된다", () => {
    /*
     * 사진마다 화각이 다르면 같은 장소를 찍어도 다른 곳처럼 보인다.
     */
    expect(followFov(CAMERA, 1, true)).toBe(CAMERA.fovBase);
  });

  it("추가 각도가 더해진다", () => {
    // 만남의 카메라 숨이 이 인자로 들어온다
    expect(followFov(CAMERA, 0, false, 5)).toBeCloseTo(CAMERA.fovBase + 5, 6);
  });

  it("포토 모드에서는 추가 각도도 들어오지 않아야 정상이다", () => {
    /*
     * 함수 자체는 더해 준다 — 막는 것은 호출부의 책임이다. 여기서는 그
     * 계약을 분명히 해 둔다: 포토 모드에서 흔들리면 호출부가 잘못 부른 것이다.
     */
    expect(followFov(CAMERA, 1, true, 5)).toBe(CAMERA.fovBase + 5);
  });

  it("저감 모션이 더 좁은 범위를 쓴다", () => {
    // 시야각 변화는 멀미의 주된 원인이다
    const normal = followFov(CAMERA, 1, false) - followFov(CAMERA, 0, false);
    const reduced = followFov(CAMERA_REDUCED, 1, false) - followFov(CAMERA_REDUCED, 0, false);
    expect(reduced, `normal=${normal}, reduced=${reduced}`).toBeLessThan(normal);
  });
});

describe("lookAheadDistance", () => {
  it("멈춰 있으면 0이다", () => {
    // 움직이지 않는데 시선이 앞서면 화면이 흔들린다
    expect(lookAheadDistance(CAMERA, 0, false)).toBe(0);
  });

  it("빠를수록 멀리 본다", () => {
    expect(lookAheadDistance(CAMERA, 1, false)).toBeGreaterThan(
      lookAheadDistance(CAMERA, 0.3, false),
    );
  });

  it("포토 모드에서는 선행하지 않는다", () => {
    // 구도를 잡는 중에 시선이 앞서면 원하는 곳을 못 담는다
    expect(lookAheadDistance(CAMERA, 1, true)).toBe(0);
  });
});

describe("튜닝 값의 관계", () => {
  it("최대 거리가 기본 거리보다 멀다", () => {
    expect(CAMERA.distanceMax).toBeGreaterThan(CAMERA.distanceBase);
  });

  it("최대 시야각이 기본 시야각보다 넓다", () => {
    expect(CAMERA.fovMax).toBeGreaterThan(CAMERA.fovBase);
  });

  it("시야각이 멀미를 부를 만큼 넓지 않다", () => {
    /*
     * DESIGN_GUIDE 「카메라」가 "멀미를 줄이기 위해 기본 FOV와 가속도를
     * 보수적으로" 요구한다. 90도를 넘으면 가장자리 왜곡이 커진다.
     */
    expect(CAMERA.fovMax, `fovMax=${CAMERA.fovMax}`).toBeLessThanOrEqual(90);
  });

  it("저감 모션이 모든 축에서 더 얌전하다", () => {
    expect(CAMERA_REDUCED.fovMax).toBeLessThanOrEqual(CAMERA.fovMax);
    expect(CAMERA_REDUCED.lookAheadMax).toBeLessThanOrEqual(CAMERA.lookAheadMax);
  });
});

describe("포토 모드를 키보드로 조작할 수 있는가", () => {
  /*
   * 구도는 드래그와 휠로만 잡을 수 있었다 — 키보드만 쓰는 사람은 P로 들어갈
   * 수는 있어도 아무것도 할 수 없었다. 사진을 남기는 것이 이 게임의 목적 중
   * 하나인데 그 사람에게는 닫힌 문이었다.
   *
   * 포토 모드에서는 시뮬레이션이 멈춰 이동 키가 하는 일이 없으므로 그 자리를
   * 카메라에 내준다.
   */
  it("이동 키가 카메라를 돌린다", () => {
    // 시점 조작은 `lookControl`에 있다 — 씬의 프레임 루프에서 떼어 냈다
    const look = readCode("src/game/scene/lookControl.ts");
    expect(look, "포토 모드에서 키보드가 시점을 바꾸지 않는다").toContain(
      "input.moveX * PHOTO_CAMERA.keyTurnRate",
    );
    expect(look).toContain("input.moveZ * PHOTO_CAMERA.keyTurnRate");
  });

  it("포토 모드에서만 그렇게 한다", () => {
    /*
     * 월드에서 이동 키가 카메라를 돌리면 걷다가 화면이 같이 돈다.
     * 조건 안에 있어야 한다.
     */
    const look = readCode("src/game/scene/lookControl.ts");
    const at = look.indexOf("PHOTO_CAMERA.keyTurnRate");
    const before = look.slice(Math.max(0, at - 200), at);
    expect(before, "포토 모드 조건 밖에서 돈다").toContain("if (input.photoMode)");
  });

  it("돌리는 속도가 쓸 만한 범위다", () => {
    // 한 바퀴에 4초쯤. 너무 느리면 못 쓰고, 너무 빠르면 원하는 각도에서 못 멈춘다
    const seconds = (Math.PI * 2) / PHOTO_CAMERA.keyTurnRate;
    expect(seconds, `한 바퀴 ${seconds.toFixed(1)}초`).toBeGreaterThan(2);
    expect(seconds, `한 바퀴 ${seconds.toFixed(1)}초`).toBeLessThan(8);
  });

  it("거리도 키보드로 바꿀 수 있다", () => {
    /*
     * 각도만 되고 거리가 휠뿐이면 절반만 열어 준 것이다 — 가까이 가서 찍는
     * 구도를 만들 수 없다.
     */
    const input = readCode("src/game/systems/input.ts");
    expect(input, "확대 키가 없다").toContain("CONTROL_CODES.zoomIn");
    expect(input, "축소 키가 없다").toContain("CONTROL_CODES.zoomOut");
  });

  it("확대와 축소가 반대 방향이다", () => {
    // 둘 다 같은 부호면 한쪽으로만 움직인다
    const input = readCode("src/game/systems/input.ts");
    expect(input).toContain("input.zoomDelta -= WHEEL_NOTCH");
    expect(input).toContain("input.zoomDelta += WHEEL_NOTCH");
  });

  it("안내에 키보드가 적혀 있다", () => {
    // 할 수 있게 만들어도 알려 주지 않으면 없는 것과 같다
    const controls = readCode("src/components/hud/PhotoControls.tsx");
    expect(controls).toMatch(/WASD|방향키/);
    expect(controls, "거리 조절 키가 안내에 없다").toMatch(/Z·X|Z, X/);
  });
});

/*
 * 착지 흔들림.
 *
 * `PlayerRig`의 프레임 루프 안에 있던 계산이라 **화면을 봐야만** 확인되던
 * 규칙이었다. 카메라 쪽으로 옮기면서 잰다.
 */
describe("stepLandingShake", () => {
  const T = LANDING_SHAKE;

  it("세게 떨어질수록 크게 흔들린다", () => {
    const soft = stepLandingShake(0, T.minImpactSpeed + 1, 0, false, T);
    const hard = stepLandingShake(0, T.maxImpactSpeed, 0, false, T);
    expect(hard, `약 ${soft.toFixed(3)} vs 강 ${hard.toFixed(3)}`).toBeGreaterThan(soft);
  });

  it("계단 정도로는 흔들리지 않는다", () => {
    // 임계 아래까지 흔들면 걸어 다니는 내내 화면이 떨려 피로하다
    expect(stepLandingShake(0, T.minImpactSpeed - 0.1, 0, false, T)).toBe(0);
  });

  it("저감 모션이면 새 흔들림을 받지 않는다", () => {
    expect(stepLandingShake(0, T.maxImpactSpeed, 0, true, T)).toBe(0);
  });

  it("저감 모션이어도 이미 흔들리던 것은 멎는다 — 안 그러면 켜는 순간 굳는다", () => {
    const next = stepLandingShake(0.2, 0, 0.1, true, T);
    expect(next, `${next.toFixed(3)}`).toBeLessThan(0.2);
  });

  it("가만두면 0으로 잦아든다", () => {
    let value: number = T.maxAmplitude;
    for (let i = 0; i < 200; i += 1) value = stepLandingShake(value, 0, 1 / 60, false, T);
    expect(value, `남은 흔들림 ${value}`).toBeLessThan(0.001);
  });

  it("큰 dt에도 음수로 내려가지 않는다 — 뒤집히면 반대로 흔들린다", () => {
    expect(stepLandingShake(0.2, 0, 5, false, T)).toBe(0);
  });
});

/*
 * 카메라 높이와 전투 거리.
 *
 * 트레일러 프레임에서 원작 카메라는 **허리~어깨 높이**이고 인물이 화면의
 * 10~80%를 오간다(DOKEV_VIDEO_STUDY 「3.5 프레임에서 직접 확인한 것 (2026-08-24)」).
 * 우리는 늘 같은 높이·같은 거리였다.
 */
describe("followHeight", () => {
  it("멈추면 낮고 달리면 높다", () => {
    const still = followHeight(CAMERA, 0, 0, 0, false);
    const running = followHeight(CAMERA, 1, 0, 0, false);
    expect(running, `정지 ${still} vs 달리기 ${running}`).toBeGreaterThan(still);
  });

  it("전투에서는 더 올라간다 — 전장이 보여야 피할 곳이 보인다", () => {
    const calm = followHeight(CAMERA, 0, 0, 0, false);
    const fighting = followHeight(CAMERA, 0, 1, 0, false);
    expect(fighting, `평시 ${calm} vs 전투 ${fighting}`).toBeGreaterThan(calm);
  });

  it("아이 키를 넘지만 사람 눈높이 안이다", () => {
    /*
     * 위에서 내려다보면 아이가 작아 보이고, 너무 낮으면 앞이 안 보인다.
     * 프레임의 「허리~어깨」는 카메라가 **캐릭터 머리 아래**라는 뜻이 아니라
     * 사람이 아이를 따라다니는 높이라는 뜻이다.
     */
    for (const speed of [0, 0.5, 1]) {
      const height = followHeight(CAMERA, speed, 1, 0, false);
      expect(height, `속도 ${speed}에서 ${height}`).toBeGreaterThan(1);
      expect(height, `속도 ${speed}에서 ${height}`).toBeLessThan(3);
    }
  });
});

describe("전투에서 물러나는가", () => {
  it("적이 붙으면 카메라가 더 멀어진다", () => {
    const calm = followDistance(CAMERA, 0, false, 0, 0, 0, false);
    const fighting = followDistance(CAMERA, 0, false, 0, 1, 0, false);
    expect(fighting, `평시 ${calm} vs 전투 ${fighting}`).toBeGreaterThan(calm);
  });

  it("포토 모드에서는 전투여도 휠 값 그대로다", () => {
    // 사진을 찍는 중이다. 로봇이 다가온다고 구도가 흔들리면 못 찍는다
    expect(followDistance(CAMERA, 1, true, 4.2, 1, 0, false)).toBe(4.2);
  });
});

describe("combatPressure", () => {
  /** 적 좌표 두 쌍을 담은 버퍼 */
  function blipsOf(pairs: number[][]): Float32Array {
    const buffer = new Float32Array(pairs.length * 2);
    pairs.forEach(([x, z], index) => {
      buffer[index * 2] = x;
      buffer[index * 2 + 1] = z;
    });
    return buffer;
  }

  it("아무도 없으면 0이다", () => {
    expect(combatPressure(blipsOf([]), 0, 0, 0, false, 14)).toBe(0);
  });

  it("반경 밖의 적은 세지 않는다 — 도시 반대편 로봇에 카메라가 반응하면 안 된다", () => {
    expect(combatPressure(blipsOf([[20, 0]]), 1, 0, 0, false, 14)).toBe(0);
  });

  it("가까울수록 커진다", () => {
    const far = combatPressure(blipsOf([[12, 0]]), 1, 0, 0, false, 14);
    const near = combatPressure(blipsOf([[3, 0]]), 1, 0, 0, false, 14);
    expect(near, `먼 쪽 ${far.toFixed(2)} vs 가까운 쪽 ${near.toFixed(2)}`).toBeGreaterThan(far);
    expect(far, "반경 안인데 0이다").toBeGreaterThan(0);
  });

  it("버퍼에 남아 있어도 개수 밖은 보지 않는다", () => {
    /*
     * 미니맵 버퍼는 고정 길이라 **죽은 적의 좌표가 뒤에 남는다.** 개수를 무시하면
     * 아무도 없는 자리에서 카메라가 계속 물러난다.
     */
    expect(combatPressure(blipsOf([[1, 1], [2, 2]]), 0, 0, 0, false, 14)).toBe(0);
  });

  it("대장과 맞붙으면 최대다 — 대장은 미니맵 점에 없다", () => {
    expect(combatPressure(blipsOf([]), 0, 0, 0, true, 14)).toBe(1);
  });
});

/*
 * 트인 곳에서 시야가 열리는가.
 *
 * 프레임 019에 **마을 전체를 내려다보는 확립 샷**이 한 번 들어간다. 우리
 * 카메라는 시야가 낮아 언덕 마루에 서도 도시 너머가 보이지 않았다 — 바다를
 * 확인하려고 포토 모드로 시점을 돌려야 했다.
 */
describe("vistaOpenness", () => {
  it("평지에서는 열리지 않는다", () => {
    expect(vistaOpenness(0, CAMERA)).toBe(0);
  });

  it("골짜기에서도 음수가 아니다 — 뒤집히면 카메라가 파고든다", () => {
    expect(vistaOpenness(-6.4, CAMERA)).toBe(0);
  });

  it("마루에 서면 거의 최대다", () => {
    const crest = vistaOpenness(6.4, CAMERA);
    expect(crest, `마루에서 ${crest.toFixed(2)}`).toBeGreaterThan(0.8);
  });

  it("아무리 높아도 1을 넘지 않는다 — 넘으면 카메라가 도시 밖으로 나간다", () => {
    expect(vistaOpenness(200, CAMERA)).toBe(1);
  });
});

describe("높은 데 서면", () => {
  it("평지보다 카메라가 높다", () => {
    const flat = followHeight(CAMERA, 0, 0, 0, false);
    const crest = followHeight(CAMERA, 0, 0, 6.4, false);
    expect(crest, `평지 ${flat} vs 마루 ${crest}`).toBeGreaterThan(flat);
  });

  it("평지보다 더 물러난다", () => {
    const flat = followDistance(CAMERA, 0, false, 0, 0, 0, false);
    const crest = followDistance(CAMERA, 0, false, 0, 0, 6.4, false);
    expect(crest, `평지 ${flat} vs 마루 ${crest}`).toBeGreaterThan(flat);
  });

  it("포토 모드에서는 그대로다 — 구도를 잡는 중이다", () => {
    expect(followDistance(CAMERA, 0, true, 5, 0, 6.4, false)).toBe(5);
  });

  it("도시에 실제로 그런 자리가 있다", () => {
    /*
     * 수치만 맞고 **그런 높이의 땅이 없으면** 이 기능은 영영 안 나온다.
     * 지형 함수를 훑어 가장 높은 자리를 찾아 거기서 열리는지 본다.
     */
    let best = { x: 0, z: 0, y: -Infinity };
    for (let x = -140; x <= 140; x += 4) {
      for (let z = -140; z <= 140; z += 4) {
        const y = terrainHeight(x, z);
        if (y > best.y) best = { x, z, y };
      }
    }
    expect(best.y, `가장 높은 지형 ${best.y.toFixed(2)}m`).toBeGreaterThan(CAMERA.vistaBaseY);
    expect(
      vistaOpenness(best.y, CAMERA),
      `(${best.x}, ${best.z})에서 ${vistaOpenness(best.y, CAMERA).toFixed(2)}`,
    ).toBeGreaterThan(0.8);
  });

  it("마루에서 눈높이가 수면보다 한참 위다 — 수평선이 화면에 들어온다", () => {
    /*
     * 각도가 아니라 **눈높이**로 잰다. 올려다보는 각은 사람이 마우스로 정하는
     * 값이라 검사가 고정할 수 있는 것이 아니다. 대신 「수면보다 높은 자리에서
     * 카메라가 더 올라간다」는 이 기능이 지켜야 할 기하다.
     */
    const crestGround = 6.4;
    const eye = crestGround + followHeight(CAMERA, 0, 0, crestGround, false);
    const flatEye = followHeight(CAMERA, 0, 0, 0, false);
    expect(eye, `마루 눈높이 ${eye.toFixed(2)} vs 수면 ${SEA_LEVEL}`).toBeGreaterThan(SEA_LEVEL + 10);
    expect(eye - flatEye, `평지 대비 ${(eye - flatEye).toFixed(2)}m`).toBeGreaterThan(crestGround);
  });
});

/*
 * 탈것에 탄 시점.
 *
 * 프레임 082에서 탈것에 탄 화면은 **아래 25%를 차체가 차지한다** — 게임플레이
 * 카메라의 관습을 트레일러가 그대로 쓴다. 우리 탈것은 발밑에 그려지는데
 * 카메라가 높아 화면에 거의 안 들어왔다.
 */
describe("무언가를 타면", () => {
  it("카메라가 낮아진다 — 차체가 화면 아래로 들어온다", () => {
    const walking = followHeight(CAMERA, 1, 0, 0, false);
    const riding = followHeight(CAMERA, 1, 0, 0, true);
    expect(riding, `걷기 ${walking} vs 타기 ${riding}`).toBeLessThan(walking);
  });

  it("조금 붙는다 — 속도가 밀어낸 것의 일부만 되돌린다", () => {
    const walking = followDistance(CAMERA, 1, false, 0, 0, 0, false);
    const riding = followDistance(CAMERA, 1, false, 0, 0, 0, true);
    expect(riding, `걷기 ${walking} vs 타기 ${riding}`).toBeLessThan(walking);
    /*
     * 다만 **멈춰 있을 때보다는 멀어야** 한다. 타면 무조건 붙어 버리면 빠를수록
     * 멀어지는 규칙이 뒤집혀 속도감이 죽는다.
     */
    const still = followDistance(CAMERA, 0, false, 0, 0, 0, false);
    expect(riding, `정지 ${still} vs 타고 달리기 ${riding}`).toBeGreaterThan(still);
  });

  it("가장 붙는 순간에도 캐릭터가 사라지지 않는다", () => {
    /*
     * 카메라가 `CHARACTER_FADE.start`보다 가까워지면 캐릭터가 흐려지기 시작한다.
     * 타는 중에 내가 반투명해지면 그건 결함으로 읽힌다.
     */
    const closest = followDistance(CAMERA, 0, false, 0, 0, -10, true);
    expect(closest, `가장 가까울 때 ${closest.toFixed(2)}m`).toBeGreaterThan(CHARACTER_FADE.start);
  });

  it("포토 모드에서는 타고 있어도 휠 값 그대로다", () => {
    expect(followDistance(CAMERA, 1, true, 5.5, 0, 0, true)).toBe(5.5);
  });
});

/*
 * 카메라가 **화면에서** 달라지는가.
 *
 * 여기 있던 검사들은 전부 「빨라지면 멀어진다」 같은 **단조성**만 봤다. 그런데
 * 단조롭기만 하면 통과한다 — 거리가 5.60m에서 5.61m로 늘어도 「멀어진다」는
 * 참이다. A-2의 완료 조건은 그게 아니라 「달리다 멈추면 카메라가 **눈에 띄게**
 * 붙는다」였고, 그 「눈에 띄게」를 아무도 재지 않고 있었다.
 *
 * 브라우저로 재려 했지만 못 했다. 카메라 값을 페이지에서 읽을 길이 없었고,
 * 무엇보다 「달리다 멈추면」은 **시간이 흘러야** 보이는 것인데 자동화로 연 탭은
 * `requestAnimationFrame`이 돌지 않는다(RALPH_BACKLOG 「브라우저 자동화의 한계
 * (반복 112에서 확정)」). 그래서 화면에 맺히는 크기를 **계산으로** 잰다.
 *
 * 인물의 실제 키는 필요 없다. 원근 투영에서 화면에 맺히는 크기는 거리와
 * 화각만으로 정해지고(높이 h는 모든 상태에 똑같이 곱해진다), 우리가 묻는 것은
 * **상태 사이의 비율**이기 때문이다. GLB의 키를 상수로 적어 두면 모델을 바꿀
 * 때 조용히 거짓말이 되는 자가 하나 늘어난다.
 */
describe("카메라가 화면에서 달라지는 크기", () => {
  /**
   * 인물이 화면 세로에서 차지하는 비율에 **비례하는** 값.
   *
   * 세로 화각 θ, 거리 d일 때 화면에 담기는 세로 길이는 `2·d·tan(θ/2)`다.
   * 인물의 크기는 그 역수에 비례한다 — 멀거나 화각이 넓으면 작아진다.
   */
  function screenScale(distance: number, fovDegrees: number): number {
    return 1 / (distance * Math.tan((fovDegrees * Math.PI) / 360));
  }

  /** 땅 위(트인 곳 보정 없음)에서 이 상태의 화면 크기 */
  function scaleAt(speed01: number, combat01: number, riding = false): number {
    const distance = followDistance(CAMERA, speed01, false, 0, combat01, CAMERA.vistaBaseY, riding);
    const fov = followFov(CAMERA, speed01, false);
    return screenScale(distance, fov);
  }

  it("멈추면 달릴 때보다 인물이 확연히 커진다", () => {
    const idle = scaleAt(0, 0);
    const running = scaleAt(1, 0);

    /*
     * 1.5배다. 「달라졌다」가 아니라 「다른 장면으로 보인다」가 기준이라 크게
     * 잡았다. 거리(5.6→7.8)와 화각(58→86)이 같은 방향으로 움직여 곱해지므로
     * 실제로는 2배가 넘는다 — 여유는 튜닝을 조금 손봐도 검사가 붙잡지 않도록
     * 남긴 것이다.
     */
    const ratio = idle / running;
    expect(ratio, `멈춤/달림 = ${ratio.toFixed(2)}배`).toBeGreaterThan(1.5);
  });

  it("로봇이 붙으면 물러나 인물이 작아진다", () => {
    const calm = scaleAt(0, 0);
    const combat = scaleAt(0, 1);

    expect(combat, `평상시 ${calm.toFixed(3)} / 전투 ${combat.toFixed(3)}`).toBeLessThan(calm);

    /*
     * 전투에서는 화각이 그대로고 거리만 움직이므로 낙차가 작다. 그래도 15%는
     * 넘어야 「전장이 넓게 보인다」가 된다 — 이보다 작으면 사람은 알아채지
     * 못하고, 그러면 `combatPullback`은 있으나 마나다.
     */
    const ratio = calm / combat;
    expect(ratio, `평상시/전투 = ${ratio.toFixed(2)}배`).toBeGreaterThan(1.15);
  });

  it("언덕 마루에서는 더 물러나 도시가 들어온다", () => {
    const ground = followDistance(CAMERA, 0, false, 0, 0, CAMERA.vistaBaseY, false);
    const summit = followDistance(
      CAMERA,
      0,
      false,
      0,
      0,
      CAMERA.vistaBaseY + CAMERA.vistaSpan,
      false,
    );

    // 트인 곳 보정이 통째로 들어와야 한다. 절반만 들어오면 어딘가 값이 새는 것이다
    expect(summit - ground, `마루에서 ${(summit - ground).toFixed(2)}m 더 물러난다`).toBeCloseTo(
      CAMERA.vistaPullback,
      5,
    );
  });

  it("눈높이가 세 상태에서 서로 다르다", () => {
    const idle = followHeight(CAMERA, 0, 0, CAMERA.vistaBaseY, false);
    const running = followHeight(CAMERA, 1, 0, CAMERA.vistaBaseY, false);
    const combat = followHeight(CAMERA, 0, 1, CAMERA.vistaBaseY, false);

    /*
     * 0.3m는 아이 키의 5분의 1쯤이다. 이보다 작게 움직이면 화면에서는 같은
     * 높이로 보인다 — 「낮춰서 아이 눈높이에 가깝게」가 값에만 남는다.
     */
    expect(running - idle, `달릴 때 ${(running - idle).toFixed(2)}m 올라간다`).toBeGreaterThan(0.3);
    expect(combat - idle, `전투에서 ${(combat - idle).toFixed(2)}m 올라간다`).toBeGreaterThan(0.3);
  });

  it("타면 붙고 낮아진다 — 두 방향이 서로를 상쇄하지 않는다", () => {
    const onFoot = scaleAt(0, 0, false);
    const riding = scaleAt(0, 0, true);

    // 붙으므로 커진다. 반대로 나오면 부호가 뒤집힌 것이다
    expect(riding, `걸을 때 ${onFoot.toFixed(3)} / 탈 때 ${riding.toFixed(3)}`).toBeGreaterThan(
      onFoot,
    );

    const walkHeight = followHeight(CAMERA, 0, 0, CAMERA.vistaBaseY, false);
    const rideHeight = followHeight(CAMERA, 0, 0, CAMERA.vistaBaseY, true);
    expect(rideHeight).toBeLessThan(walkHeight);
  });
});
