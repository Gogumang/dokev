/**
 * 대장을 눕히는 순간의 연출 — 슬로우 모션과 얼굴 클로즈업.
 *
 * 화면을 못 보는 상태에서 가장 확인하기 어려운 종류다. 「느려진다」와
 * 「얼굴이 보인다」를 수치로 붙잡아 둔다.
 */

import { describe, expect, it } from "vitest";

import {
  createFinisher,
  faceShot,
  FINISHER,
  FINISHER_SECONDS,
  finisherIntensity,
  finisherTimeScale,
  stepFinisher,
  type FinisherState,
} from "@/game/scene/finisher";

/** 실시간 dt로 연출을 끝까지 돌리며 매 프레임의 세기를 모은다 */
function run(seconds: number, dt = 1 / 60): { states: FinisherState[]; levels: number[] } {
  let state = stepFinisher(createFinisher(), 1, dt, false);
  const states: FinisherState[] = [state];
  const levels = [finisherIntensity(state)];

  for (let t = 0; t < seconds; t += dt) {
    state = stepFinisher(state, 1, dt, false);
    states.push(state);
    levels.push(finisherIntensity(state));
  }
  return { states, levels };
}

describe("발동", () => {
  it("대장이 눕으면 걸린다", () => {
    // Arrange
    const idle = createFinisher();

    // Act
    const fired = stepFinisher(idle, 1, 1 / 60, false);

    // Assert
    expect(finisherIntensity(idle)).toBe(0);
    expect(fired.remainingSeconds).toBe(FINISHER_SECONDS);
  });

  it("눕지 않으면 걸리지 않는다", () => {
    const next = stepFinisher(createFinisher(), 0, 1 / 60, false);
    expect(next.remainingSeconds).toBe(0);
  });

  it("한 번 눕은 것으로 두 번 걸리지 않는다", () => {
    // Arrange
    let state = stepFinisher(createFinisher(), 1, 1 / 60, false);
    const started = state.remainingSeconds;

    // Act — 같은 누적 수로 계속 돈다
    state = stepFinisher(state, 1, 1 / 60, false);

    // Assert
    expect(state.remainingSeconds).toBeLessThan(started);
  });

  it("두 번째로 눕으면 다시 걸린다 — 대장은 되살아난다", () => {
    // Arrange — 첫 연출이 절반쯤 지났다
    let state = stepFinisher(createFinisher(), 1, 1 / 60, false);
    for (let i = 0; i < 30; i += 1) state = stepFinisher(state, 1, 1 / 60, false);

    // Act
    state = stepFinisher(state, 2, 1 / 60, false);

    // Assert
    expect(state.remainingSeconds).toBe(FINISHER_SECONDS);
  });

  it("저감 모션이면 아예 걸리지 않는다", () => {
    /*
     * 화면이 느려졌다 빨라지는 것은 저감 모션 설정이 가장 먼저 끄고 싶어
     * 하는 종류다.
     */
    const next = stepFinisher(createFinisher(), 1, 1 / 60, true);
    expect(next.remainingSeconds).toBe(0);
  });

  it("저감 모션 중에 눕은 것이 나중에 터지지 않는다", () => {
    // Arrange — 저감 모션으로 넘겼다
    const skipped = stepFinisher(createFinisher(), 1, 1 / 60, true);

    // Act — 설정을 끄고 다음 프레임
    const next = stepFinisher(skipped, 1, 1 / 60, false);

    // Assert — 본 것으로 쳤으므로 밀린 연출이 없다
    expect(next.remainingSeconds).toBe(0);
  });
});

describe("세기 곡선", () => {
  it("빠르게 들어가 머물다 천천히 빠진다", () => {
    // Act
    const { levels } = run(FINISHER_SECONDS + 0.2);

    // Assert — 절정에 닿고, 끝에는 0으로 돌아온다
    expect(Math.max(...levels), "절정에 닿지 않는다").toBeCloseTo(1, 2);
    expect(levels[levels.length - 1], "끝나고도 남아 있다").toBe(0);
  });

  it("들어가는 것이 나오는 것보다 빠르다", () => {
    /*
     * 마지막 타격의 **그 순간**에 걸려야 인과가 보이고, 갑자기 정상 속도로
     * 튀어나오면 조작이 손보다 앞서 나가 그대로 벽에 박는다.
     */
    expect(FINISHER.easeInSeconds).toBeLessThan(FINISHER.easeOutSeconds);
  });

  it("한 방향으로만 오르고 한 방향으로만 내린다 — 중간에 흔들리지 않는다", () => {
    // Arrange
    const { levels } = run(FINISHER_SECONDS + 0.2);
    const peak = levels.indexOf(Math.max(...levels));

    // Assert
    for (let i = 1; i <= peak; i += 1) {
      expect(levels[i], `${i}프레임에서 내려간다`).toBeGreaterThanOrEqual(levels[i - 1] - 1e-9);
    }
    for (let i = peak + 1; i < levels.length; i += 1) {
      expect(levels[i], `${i}프레임에서 올라간다`).toBeLessThanOrEqual(levels[i - 1] + 1e-9);
    }
  });

  it("실시간으로 센다 — 자기가 늦춘 시간에 자기가 갇히지 않는다", () => {
    /*
     * 느려진 dt로 세면 연출이 1/0.22 ≈ 4.5배 길어진다. 프레임 수로 확인한다:
     * 60fps 실시간이면 총 길이 × 60프레임 언저리에서 끝나야 한다.
     */
    const { levels } = run(FINISHER_SECONDS + 0.5);
    const lastLit = levels.reduce((last, level, i) => (level > 0 ? i : last), 0);
    expect(lastLit / 60, `${(lastLit / 60).toFixed(2)}초 만에 끝났다`).toBeLessThan(
      FINISHER_SECONDS + 0.1,
    );
  });
});

describe("시간 배율", () => {
  it("꺼져 있으면 1이다 — 평소 속도를 건드리지 않는다", () => {
    expect(finisherTimeScale(createFinisher())).toBe(1);
  });

  it("절정에서 느려진다", () => {
    // Arrange — 절정까지 진행
    let state = stepFinisher(createFinisher(), 1, 1 / 60, false);
    for (let i = 0; i < 12; i += 1) state = stepFinisher(state, 1, 1 / 60, false);

    // Assert
    expect(finisherTimeScale(state)).toBeCloseTo(FINISHER.slowScale, 2);
  });

  it("멈추지는 않는다 — 끝난 줄 알고 조작을 놓게 하면 안 된다", () => {
    expect(FINISHER.slowScale).toBeGreaterThan(0.1);
    expect(FINISHER.slowScale, "이 정도면 그냥 굼뜬 화면이다").toBeLessThan(0.5);
  });
});

describe("얼굴 클로즈업", () => {
  it("캐릭터 앞쪽에 선다 — 뒤통수 확대가 아니다", () => {
    /*
     * "얼굴이 보이는 장면"이라는 요구가 뒤통수 확대로 끝나지 않게 한다.
     * 캐릭터가 보는 방향(+z 쪽으로 facing=0)의 **같은 편**에 카메라가 있어야
     * 얼굴이 렌즈를 향한다.
     */
    const shot = faceShot(0, 0, 0, 0);

    expect(shot.z, `카메라 z=${shot.z}`).toBeGreaterThan(0);
  });

  it("어느 방향을 보고 있어도 앞쪽이다", () => {
    for (const facing of [0, 1, 2, 3, -1, -2.5, Math.PI]) {
      const shot = faceShot(0, 0, 0, facing);
      // 카메라가 선 방향과 캐릭터가 보는 방향의 내적이 양수 = 앞쪽이다
      const dot = Math.sin(facing) * shot.x + Math.cos(facing) * shot.z;
      expect(dot, `facing=${facing}일 때 뒤에 선다`).toBeGreaterThan(0);
    }
  });

  it("정면 정중앙은 피한다 — 증명사진이 되지 않게", () => {
    expect(FINISHER.faceSideAngle).toBeGreaterThan(0.2);
    // 너무 비끼면 옆얼굴만 보인다
    expect(FINISHER.faceSideAngle).toBeLessThan(Math.PI / 4);
  });

  it("얼굴을 본다", () => {
    // Arrange
    const shot = faceShot(3, 1.5, -2, 0.7);

    // Assert — 시선 지점이 발밑이 아니라 얼굴 높이다
    expect(shot.lookX).toBe(3);
    expect(shot.lookZ).toBe(-2);
    expect(shot.lookY).toBeCloseTo(1.5 + FINISHER.faceHeight, 6);
  });

  it("살짝 올려다본다 — 아이가 커 보이는 각이다", () => {
    const shot = faceShot(0, 0, 0, 0);
    expect(shot.y, `카메라 y=${shot.y}, 얼굴 y=${shot.lookY}`).toBeLessThan(shot.lookY);
  });

  it("얼굴이 화면에 차는 거리다", () => {
    /*
     * 멀면 그냥 「조금 당긴 3인칭」이라 연출로 안 읽히고, 너무 가까우면
     * 근평면에 걸려 코가 잘린다.
     */
    expect(FINISHER.faceDistance).toBeGreaterThan(0.8);
    expect(FINISHER.faceDistance).toBeLessThan(2.5);
  });

  it("클로즈업 화각이 평소보다 훨씬 좁다", () => {
    // 좁을수록 원근이 눌려 인물이 배경에서 떨어져 나온다
    expect(FINISHER.fovNarrow).toBeLessThan(45);
  });
});
