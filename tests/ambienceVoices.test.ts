import { describe, expect, it } from "vitest";

import { landingThumpSeconds, STEP_PROFILES } from "@/game/systems/audio/voices";

import { readCode } from "./support/source";

/*
 * 주변 소리의 값들.
 *
 * 이 모듈에는 검사가 하나도 없었다. 소리는 이 저장소에서 **아무도 들어 본 적이
 * 없는** 감각이라 값이 뒤집혀도 알아챌 방법이 없다 — 바람이 셀수록 낮아지고,
 * 차가 멀어질수록 가까운 소리가 나도 화면은 멀쩡하다.
 *
 * 오디오 노드를 만들지 않고 값만 읽는다. `AudioContext`가 없는 환경에서도
 * 돌아야 하고, 확인하려는 것은 배선이 아니라 **숫자의 관계**다.
 */

const source = readCode("src/game/systems/audio/voices.ts");

/** `const 이름 = 숫자;` 를 읽는다 */
function value(name: string): number {
  const match = new RegExp(`const ${name} = ([\\d.]+)`).exec(source);
  expect(match, `${name}을 못 찾았다`).not.toBeNull();
  return Number(match?.[1]);
}

describe("짝지어진 값이 뒤집히지 않았는가", () => {
  const PAIRS: { name: string; min: string; max: string; why: string }[] = [
    {
      name: "바람",
      min: "WIND_LOWPASS_MIN_HZ",
      max: "WIND_LOWPASS_MAX_HZ",
      why: "빠를수록 높아져야 한다 — 뒤집히면 달릴수록 소리가 먹먹해진다",
    },
    {
      name: "보드 구름",
      min: "ROLL_RUMBLE_MIN_HZ",
      max: "ROLL_RUMBLE_MAX_HZ",
      why: "속도에 따라 올라가야 한다",
    },
    {
      name: "차 지나가는 간격",
      min: "CAR_INTERVAL_MIN_SECONDS",
      max: "CAR_INTERVAL_MAX_SECONDS",
      why: "최소가 최대보다 길면 간격 계산이 거꾸로 돈다",
    },
  ];

  for (const { name, min, max, why } of PAIRS) {
    it(`${name}의 최소가 최대보다 작다`, () => {
      const low = value(min);
      const high = value(max);
      expect(low, `${min}=${low}, ${max}=${high} — ${why}`).toBeLessThan(high);
    });
  }

  it("차가 가까울 때 더 높은 소리가 난다", () => {
    /*
     * 멀리서 다가올수록 밝아지고 멀어지면 다시 낮아진다. 뒤집히면 차가
     * 멀어질 때 다가오는 것처럼 들린다.
     */
    const near = value("CAR_BAND_NEAR_HZ");
    const far = value("CAR_BAND_FAR_HZ");
    expect(near, `가까이 ${near}Hz, 멀리 ${far}Hz`).toBeGreaterThan(far);
  });
});

describe("들리지 않는 소리를 만들지 않는가", () => {
  it("바람 세기가 0이 아니다", () => {
    // 0이면 배선은 다 있는데 아무 소리도 안 난다 — 가장 알아채기 어려운 고장이다
    expect(value("WIND_GAIN_MAX"), "바람 세기").toBeGreaterThan(0.01);
  });

  it("사람이 들을 수 있는 높이다", () => {
    /*
     * 20Hz 아래는 소리가 아니라 진동이고, 대부분의 노트북 스피커는 100Hz
     * 아래를 거의 못 낸다. 낮은 웅웅거림이 그 아래로 내려가면 「조용하다」가 된다.
     */
    const hum = /const HUM_FREQUENCIES = \[([\d.,\s]+)\]/.exec(source)?.[1] ?? "";
    const frequencies = hum.split(",").map((part) => Number(part.trim()));
    expect(frequencies.length, `찾은 웅웅거림 ${frequencies.length}개`).toBeGreaterThan(0);
    for (const frequency of frequencies) {
      expect(frequency, `${frequency}Hz`).toBeGreaterThan(20);
    }
  });

  it("웅웅거림이 서로 다른 높이다", () => {
    // 같은 값을 두 번 쌓으면 소리가 두꺼워지는 대신 그냥 커지기만 한다
    const hum = /const HUM_FREQUENCIES = \[([\d.,\s]+)\]/.exec(source)?.[1] ?? "";
    const frequencies = hum.split(",").map((part) => Number(part.trim()));
    expect(new Set(frequencies).size, `${frequencies.join(", ")}`).toBe(frequencies.length);
  });
});

describe("발소리 — 걷기와 달리기", () => {
  /*
   * 주석이 설계를 **단언**한다: 「달리기는 중심 대역이 낮고, 저역 충격이
   * 붙으며, 여운이 길다. 이 세 가지를 같이 바꿔야 "같은 소리를 크게 튼 것"
   * 으로 들리지 않는다.」
   *
   * 그런데 아무도 지키지 않고 있었다 — `voices.ts`는 내보낸 이름 여섯 개
   * 중 **하나도** 검사에 나오지 않는 파일이었다. 소리는 값을 봐도 알 수
   * 없으니, 적어도 **적어 둔 관계**는 지킨다.
   */
  const walk = STEP_PROFILES.walk;
  const run = STEP_PROFILES.run;

  it("달리기가 더 크다", () => {
    expect(run.gain, `walk ${walk.gain}, run ${run.gain}`).toBeGreaterThan(walk.gain);
  });

  it("달리기는 중심 대역이 더 낮다", () => {
    // 발 전체가 닿는 소리다 — 같으면 크기만 다른 같은 소리가 된다
    expect(run.bandHz, `walk ${walk.bandHz}Hz, run ${run.bandHz}Hz`).toBeLessThan(walk.bandHz);
  });

  it("저역 충격은 달리기에만 있다", () => {
    expect(walk.thumpGain, `walk thump ${walk.thumpGain}`).toBe(0);
    expect(run.thumpGain, `run thump ${run.thumpGain}`).toBeGreaterThan(0);
    expect(run.thumpHz, `run thumpHz ${run.thumpHz}`).toBeGreaterThan(0);
  });

  it("달리기가 여운이 더 길다", () => {
    expect(run.decaySeconds, `walk ${walk.decaySeconds}s, run ${run.decaySeconds}s`).toBeGreaterThan(
      walk.decaySeconds,
    );
  });

  it("크기만 다른 소리가 아니다", () => {
    /*
     * 위 넷을 한 문장으로 다시 본다 — 크기 말고 **몇 가지가 다른가**.
     * 하나만 다르면 「같은 소리를 크게 튼 것」이고, 주석이 거짓이 된다.
     */
    const differences = [
      run.bandHz !== walk.bandHz,
      run.bandQ !== walk.bandQ,
      run.decaySeconds !== walk.decaySeconds,
      run.thumpGain !== walk.thumpGain,
    ].filter(Boolean).length;
    expect(differences, `크기 말고 다른 것 ${differences}가지`).toBeGreaterThanOrEqual(3);
  });
});

describe("착지 소리의 길이", () => {
  /*
   * 「크기뿐 아니라 저역의 길이도 함께 늘려야 "높은 데서 떨어졌다"가
   * 전달된다」 — 주석의 단언이다. 계산이 `AudioContext` 안에 묻혀 있어
   * 아무도 확인할 수 없었다.
   */
  it("세게 떨어질수록 길게 운다", () => {
    const soft = landingThumpSeconds(0);
    const hard = landingThumpSeconds(1);
    expect(hard, `약 ${soft.toFixed(3)}s, 강 ${hard.toFixed(3)}s`).toBeGreaterThan(soft);
  });

  it("중간 세기는 중간 길이다", () => {
    // 단조롭게 늘어야 한다 — 어느 구간에서 꺾이면 「더 세게 떨어졌는데 짧다」가 된다
    const steps = [0, 0.25, 0.5, 0.75, 1].map(landingThumpSeconds);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `${steps.join(" → ")}`).toBeGreaterThan(steps[i - 1]);
    }
  });

  it("범위 밖 값에도 흔들리지 않는다", () => {
    /*
     * 부르는 쪽이 이미 `inverseLerpClamped`로 0~1을 보장하지만, 여기서도
     * 한 번 자른다 — 두 곳 중 하나가 바뀌어도 소리 길이가 음수가 되지 않는다.
     *
     * `NaN`까지는 요구하지 않는다. 체공 시간에서 오는 값이라 닿을 수 없고,
     * 닿는다면 그것은 이 함수가 아니라 **위쪽이 고장 난 것**이다 —
     * 조용히 0으로 바꾸면 그 고장을 덮는다.
     */
    expect(landingThumpSeconds(-5)).toBe(landingThumpSeconds(0));
    expect(landingThumpSeconds(9)).toBe(landingThumpSeconds(1));
  });
});
