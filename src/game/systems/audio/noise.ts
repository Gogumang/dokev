/**
 * 절차적 노이즈 버퍼.
 *
 * 오디오 파일을 받지 않는다는 제약(PROJECT_PLAN 10절 초기 다운로드 예산) 때문에
 * 모든 소리의 재료를 런타임에 합성한다. 발소리·바람·구름 소리는 결국 전부
 * "노이즈를 어떻게 거르느냐"의 문제라서, 노이즈 버퍼 두 개를 만들어 모든
 * 보이스가 공유한다. 매번 새로 만들면 버퍼 하나에 수십 ms가 든다.
 *
 * three.js나 React에 의존하지 않는 순수 계산이다.
 */

import { createSeededRandom } from "@/game/core/mathx";

/**
 * 버퍼 길이.
 *
 * 짧으면 루프 주기가 "펄럭이는" 패턴으로 들린다. 2.5초면 사람이 반복을 인지하지
 * 못하고, 44.1kHz 모노 Float32 기준 약 440KB로 메모리도 감당된다.
 */
const NOISE_SECONDS = 2.5;

/**
 * 루프 경계 교차 페이드 길이.
 *
 * 버퍼 끝과 시작의 파형 값이 다르면 한 바퀴마다 "틱" 하는 클릭이 들린다.
 * 뒤쪽 여분 구간을 앞머리에 겹쳐 섞어 경계를 연속으로 만든다.
 */
const LOOP_CROSSFADE_SECONDS = 0.05;

export type NoiseColor = "white" | "pink";

/**
 * 핑크 노이즈 정규화 계수.
 *
 * 아래 필터 뱅크의 출력은 대략 ±9 범위로 나온다. -1..1로 되돌리지 않으면
 * 이후 게인 값들이 전부 클리핑 근처에서 놀게 된다.
 */
const PINK_NORMALIZE = 0.11;

/**
 * 핑크 노이즈 생성기 (Paul Kellet의 필터 뱅크 근사).
 *
 * 화이트 노이즈는 고역이 너무 밝아 바람·도시 소음으로 쓰면 "치익" 하는 잡음처럼
 * 들린다. 옥타브당 -3dB로 기우는 핑크 노이즈가 자연음에 훨씬 가깝다.
 */
function createPinkFilter(): (white: number) => number {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  return (white: number) => {
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const output = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return output * PINK_NORMALIZE;
  };
}

/**
 * 루프 재생에 안전한 모노 노이즈 버퍼를 만든다.
 *
 * seed를 받는 이유: 도시 배치와 같은 이유로 세션마다 결과가 달라지면 소리 문제를
 * 재현할 수 없다 (mathx의 createSeededRandom 주석과 같은 취지).
 */
export function createNoiseBuffer(
  ctx: BaseAudioContext,
  color: NoiseColor,
  seed: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * NOISE_SECONDS);
  const fade = Math.floor(sampleRate * LOOP_CROSSFADE_SECONDS);

  const random = createSeededRandom(seed);
  const pink = color === "pink" ? createPinkFilter() : null;

  // 교차 페이드에 쓸 여분(fade)까지 먼저 생성한 뒤 앞머리에 접어 넣는다.
  const raw = new Float32Array(length + fade);
  for (let i = 0; i < raw.length; i += 1) {
    const white = random() * 2 - 1;
    raw[i] = pink ? pink(white) : white;
  }

  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    if (i >= fade) {
      data[i] = raw[i];
      continue;
    }
    // i가 0에 가까울수록 "버퍼 끝 다음에 이어질 소리"(raw[length + i]) 비중이 커진다.
    const t = i / fade;
    data[i] = raw[i] * t + raw[length + i] * (1 - t);
  }

  return buffer;
}
