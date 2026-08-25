/**
 * 개별 사운드 보이스 — 전부 Web Audio 노드로 합성한다.
 *
 * "지속음"(바람·앰비언스·보드 구름)과 "원샷"(발소리·착지·점프)을 나눈다.
 * 지속음은 루프 소스를 한 번 켜 두고 게인/필터만 부드럽게 옮기고, 원샷은
 * 매번 노드를 만들어 짧게 울린 뒤 onended에서 스스로 끊는다.
 *
 * 게인 값이 전부 0.2 미만인 이유: 최대 다섯 갈래가 동시에 울리므로 각각을
 * 넉넉히 잡으면 합쳐질 때 클리핑이 난다. 마스터에서 한 번 더 줄인다.
 */

import { clamp, createSeededRandom, lerp } from "@/game/core/mathx";

/**
 * 게인·필터를 옮길 때 쓰는 setTargetAtTime 시상수(초).
 *
 * 값이 곧 "63%까지 붙는 데 걸리는 시간"이다. 0.08초면 속도 변화를 즉각 따라가면서도
 * 프레임마다 값이 튀는 것처럼 들리지 않는다.
 */
const GLIDE_SECONDS = 0.08;

/** 지수 램프는 0을 표현할 수 없다. 사실상 무음으로 취급할 하한. */
const SILENCE = 0.0001;

/* ------------------------------------------------------------------ */
/* 바람                                                                 */
/* ------------------------------------------------------------------ */

/** 저속에서도 완전히 마르지 않도록 남기는 최소 컷오프 */
const WIND_LOWPASS_MIN_HZ = 320;
/** 전속력에서 "쉭" 하는 고역이 열리는 지점. 이 위로 더 열면 잡음처럼 들린다 */
const WIND_LOWPASS_MAX_HZ = 2600;
const WIND_GAIN_MAX = 0.2;
/**
 * 게인 곡선의 지수.
 *
 * 선형으로 올리면 걷기 속도에서 이미 바람이 꽤 크게 들려 속도 대비가 사라진다.
 * 1.6제곱을 걸어 느릴 때는 거의 없다가 보드 최고 속도에서 몰아치게 만든다.
 */
const WIND_GAIN_CURVE = 1.6;

export interface WindVoice {
  update(speed01: number, now: number): void;
  dispose(): void;
}

/** 속도에 비례해 커지는 로우패스 핑크 노이즈. 속도감의 대부분을 담당한다. */
export function createWindVoice(
  ctx: AudioContext,
  destination: AudioNode,
  pinkNoise: AudioBuffer,
): WindVoice {
  const source = ctx.createBufferSource();
  source.buffer = pinkNoise;
  source.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = WIND_LOWPASS_MIN_HZ;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(lowpass).connect(gain).connect(destination);
  source.start();

  return {
    update(speed01, now) {
      const shaped = clamp(speed01, 0, 1) ** WIND_GAIN_CURVE;
      gain.gain.setTargetAtTime(shaped * WIND_GAIN_MAX, now, GLIDE_SECONDS);
      lowpass.frequency.setTargetAtTime(
        lerp(WIND_LOWPASS_MIN_HZ, WIND_LOWPASS_MAX_HZ, shaped),
        now,
        GLIDE_SECONDS,
      );
    },
    dispose() {
      try {
        source.stop();
      } catch {
        // 이미 멈춘 소스에 stop을 부르면 예외가 난다. 정리 경로에서는 무해하다.
      }
      source.disconnect();
      lowpass.disconnect();
      gain.disconnect();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 도시 앰비언스                                                         */
/* ------------------------------------------------------------------ */

/**
 * 저역 웅웅거림의 기본 주파수들.
 *
 * A1(55Hz)과 그 완전5도(82.5Hz). 정수배 관계가 아니라 아주 느린 맥놀이가 생겨
 * 단일 사인파처럼 "기계음"으로 들리지 않는다.
 */
const HUM_FREQUENCIES = [55, 82.5] as const;
/** 웅웅거림에서 배음을 잘라내는 지점. 이 위가 남으면 톱니 특유의 쏘는 소리가 난다 */
const HUM_LOWPASS_HZ = 170;
const HUM_GAIN = 0.045;
/** 두 오실레이터를 살짝 어긋나게 해 위상이 고정되지 않도록 한다 */
const HUM_DETUNE_CENTS = 7;

/** 멀리서 깔리는 교통 소음 대역 */
const TRAFFIC_BAND_HZ = 520;
const TRAFFIC_BAND_Q = 0.7;
const TRAFFIC_GAIN = 0.035;

/** 지나가는 차 이벤트 간격. 너무 잦으면 도로 한복판처럼 들려 동네 감성이 깨진다 */
const CAR_INTERVAL_MIN_SECONDS = 7;
const CAR_INTERVAL_MAX_SECONDS = 18;
const CAR_DURATION_SECONDS = 2.4;
const CAR_PEAK_GAIN = 0.075;
/** 가장 가까울 때(중앙)와 멀 때의 대역 중심. 다가올수록 밝아지는 것이 거리감을 만든다 */
const CAR_BAND_NEAR_HZ = 780;
const CAR_BAND_FAR_HZ = 260;
const CAR_BAND_Q = 0.9;

export interface AmbienceVoice {
  /** now(ctx.currentTime)를 받아 지나가는 차 이벤트를 예약한다 */
  update(now: number): void;
  dispose(): void;
}

/**
 * 낮은 웅웅거림 + 옅은 교통 소음 + 가끔 지나가는 차.
 *
 * 앰비언스는 "있는지 모를 정도"가 목표다. 존재를 알아차릴 만큼 크면 이동 사운드가
 * 묻히고, 장시간 플레이에서 피로해진다.
 */
export function createAmbienceVoice(
  ctx: AudioContext,
  destination: AudioNode,
  pinkNoise: AudioBuffer,
  random: () => number,
): AmbienceVoice {
  const humLowpass = ctx.createBiquadFilter();
  humLowpass.type = "lowpass";
  humLowpass.frequency.value = HUM_LOWPASS_HZ;

  const humGain = ctx.createGain();
  humGain.gain.value = HUM_GAIN;
  humLowpass.connect(humGain).connect(destination);

  const oscillators = HUM_FREQUENCIES.map((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    osc.detune.value = index === 0 ? -HUM_DETUNE_CENTS : HUM_DETUNE_CENTS;
    osc.connect(humLowpass);
    osc.start();
    return osc;
  });

  const trafficSource = ctx.createBufferSource();
  trafficSource.buffer = pinkNoise;
  trafficSource.loop = true;

  const trafficBand = ctx.createBiquadFilter();
  trafficBand.type = "bandpass";
  trafficBand.frequency.value = TRAFFIC_BAND_HZ;
  trafficBand.Q.value = TRAFFIC_BAND_Q;

  const trafficGain = ctx.createGain();
  trafficGain.gain.value = TRAFFIC_GAIN;

  trafficSource.connect(trafficBand).connect(trafficGain).connect(destination);
  trafficSource.start();

  // 시작 직후에 차가 지나가면 연출처럼 느껴진다. 첫 이벤트는 한 박자 늦춘다.
  let nextCarAt = ctx.currentTime + CAR_INTERVAL_MIN_SECONDS;
  const passingCars = new Set<AudioBufferSourceNode>();

  const schedulePassingCar = (at: number) => {
    const source = ctx.createBufferSource();
    source.buffer = pinkNoise;
    source.loop = true;
    // 재생 속도를 살짝 흔들어 매번 같은 차가 지나가는 것처럼 들리지 않게 한다.
    source.playbackRate.value = 0.85 + random() * 0.3;

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = CAR_BAND_FAR_HZ;
    band.Q.value = CAR_BAND_Q;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const mid = at + CAR_DURATION_SECONDS / 2;
    const end = at + CAR_DURATION_SECONDS;

    band.frequency.setValueAtTime(CAR_BAND_FAR_HZ, at);
    band.frequency.linearRampToValueAtTime(CAR_BAND_NEAR_HZ, mid);
    band.frequency.linearRampToValueAtTime(CAR_BAND_FAR_HZ, end);

    gain.gain.setValueAtTime(SILENCE, at);
    gain.gain.linearRampToValueAtTime(CAR_PEAK_GAIN, mid);
    gain.gain.linearRampToValueAtTime(SILENCE, end);

    let tail: AudioNode = gain;
    // 좌우로 스쳐 지나가야 "지나감"이 된다. 구형 사파리에는 스테레오 패너가 없다.
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      const direction = random() < 0.5 ? -1 : 1;
      panner.pan.setValueAtTime(-direction, at);
      panner.pan.linearRampToValueAtTime(direction, end);
      gain.connect(panner);
      tail = panner;
    }

    source.connect(band).connect(gain);
    tail.connect(destination);

    source.start(at);
    source.stop(end);
    passingCars.add(source);
    source.onended = () => {
      passingCars.delete(source);
      source.disconnect();
      band.disconnect();
      gain.disconnect();
      if (tail !== gain) tail.disconnect();
    };
  };

  return {
    update(now) {
      if (now < nextCarAt) return;
      schedulePassingCar(now);
      nextCarAt =
        now +
        CAR_DURATION_SECONDS +
        lerp(CAR_INTERVAL_MIN_SECONDS, CAR_INTERVAL_MAX_SECONDS, random());
    },
    dispose() {
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          // 이미 멈춘 노드 — 정리 경로에서는 무해하다.
        }
        osc.disconnect();
      }
      humLowpass.disconnect();
      humGain.disconnect();

      try {
        trafficSource.stop();
      } catch {
        // 위와 같다.
      }
      trafficSource.disconnect();
      trafficBand.disconnect();
      trafficGain.disconnect();

      for (const car of passingCars) {
        try {
          car.stop();
        } catch {
          // 위와 같다.
        }
      }
      passingCars.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 보드 구름 소리                                                        */
/* ------------------------------------------------------------------ */

/** 바퀴가 아스팔트를 구르는 저역. 속도가 오르면 중심이 위로 올라간다 */
const ROLL_RUMBLE_MIN_HZ = 95;
const ROLL_RUMBLE_MAX_HZ = 380;
const ROLL_RUMBLE_Q = 1.1;
const ROLL_RUMBLE_GAIN_MAX = 0.17;
/** 노면 질감을 담당하는 고역. 이게 없으면 저역만 남아 엔진음처럼 들린다 */
const ROLL_GRIT_HIGHPASS_HZ = 2600;
const ROLL_GRIT_GAIN_MAX = 0.05;

export interface RollVoice {
  update(speed01: number, rolling: boolean, now: number): void;
  dispose(): void;
}

/** 보드 모드 전용 지속 구름 소리. 발소리 대신 이것이 이동을 들려준다. */
export function createRollVoice(
  ctx: AudioContext,
  destination: AudioNode,
  pinkNoise: AudioBuffer,
  whiteNoise: AudioBuffer,
): RollVoice {
  const rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = pinkNoise;
  rumbleSource.loop = true;

  const rumbleBand = ctx.createBiquadFilter();
  rumbleBand.type = "bandpass";
  rumbleBand.frequency.value = ROLL_RUMBLE_MIN_HZ;
  rumbleBand.Q.value = ROLL_RUMBLE_Q;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0;

  rumbleSource.connect(rumbleBand).connect(rumbleGain).connect(destination);
  rumbleSource.start();

  const gritSource = ctx.createBufferSource();
  gritSource.buffer = whiteNoise;
  gritSource.loop = true;

  const gritHighpass = ctx.createBiquadFilter();
  gritHighpass.type = "highpass";
  gritHighpass.frequency.value = ROLL_GRIT_HIGHPASS_HZ;

  const gritGain = ctx.createGain();
  gritGain.gain.value = 0;

  gritSource.connect(gritHighpass).connect(gritGain).connect(destination);
  gritSource.start();

  return {
    update(speed01, rolling, now) {
      // 보드에서 내렸거나 공중에 떠 있으면 바퀴가 노면에 닿아 있지 않다.
      const intensity = rolling ? clamp(speed01, 0, 1) : 0;
      rumbleGain.gain.setTargetAtTime(intensity * ROLL_RUMBLE_GAIN_MAX, now, GLIDE_SECONDS);
      gritGain.gain.setTargetAtTime(intensity * intensity * ROLL_GRIT_GAIN_MAX, now, GLIDE_SECONDS);
      rumbleBand.frequency.setTargetAtTime(
        lerp(ROLL_RUMBLE_MIN_HZ, ROLL_RUMBLE_MAX_HZ, intensity),
        now,
        GLIDE_SECONDS,
      );
    },
    dispose() {
      for (const source of [rumbleSource, gritSource]) {
        try {
          source.stop();
        } catch {
          // 이미 멈춘 노드 — 정리 경로에서는 무해하다.
        }
        source.disconnect();
      }
      rumbleBand.disconnect();
      rumbleGain.disconnect();
      gritHighpass.disconnect();
      gritGain.disconnect();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 원샷 — 발소리 / 착지 / 점프                                           */
/* ------------------------------------------------------------------ */

export type StepMode = "walk" | "run";

export interface StepProfile {
  /** 발이 노면에 닿는 소리의 중심 대역 */
  bandHz: number;
  bandQ: number;
  gain: number;
  decaySeconds: number;
  /** 체중이 실리는 저역 충격. 걷기에는 없다 */
  thumpHz: number;
  thumpGain: number;
}

/**
 * 걷기와 달리기의 차이는 크기만이 아니다.
 *
 * 달리기는 중심 대역이 낮고(발 전체가 닿는다) 저역 충격이 붙으며 여운이 길다.
 * 이 세 가지를 같이 바꿔야 "같은 소리를 크게 튼 것"으로 들리지 않는다.
 */
export const STEP_PROFILES: Record<StepMode, StepProfile> = {
  walk: { bandHz: 1150, bandQ: 1.1, gain: 0.085, decaySeconds: 0.09, thumpHz: 0, thumpGain: 0 },
  run: { bandHz: 880, bandQ: 0.9, gain: 0.15, decaySeconds: 0.13, thumpHz: 95, thumpGain: 0.1 },
};

/** 발소리마다 대역·게인·재생속도를 흔드는 폭. 없으면 기계가 걷는 것처럼 들린다 */
const STEP_JITTER = 0.12;
/** 원샷의 어택. 0이면 클릭이 나고, 길면 타격감이 사라진다 */
const ATTACK_SECONDS = 0.004;

/** 짧은 노이즈 조각을 잘라 쓰기 위한 최대 시작 오프셋(초) */
const NOISE_OFFSET_RANGE = 2;
/** 오프셋용 난수. 노이즈 버퍼와 같은 이유로 시드를 고정해 재현 가능하게 둔다 */
const burstOffsetRandom = createSeededRandom(0x571e9);

/**
 * 노이즈 원샷 하나를 예약한다.
 *
 * 노드는 onended에서 스스로 끊는다. 원샷은 0.3초 안에 끝나므로 별도 추적 없이도
 * 누적되지 않고, 언마운트 시에는 AudioContext.close()가 남은 것을 모두 회수한다.
 */
function scheduleNoiseBurst(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  filter: BiquadFilterNode,
  peakGain: number,
  decaySeconds: number,
  playbackRate: number,
): void {
  const now = ctx.currentTime;
  const end = now + ATTACK_SECONDS + decaySeconds;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENCE, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);

  source.connect(filter).connect(gain).connect(destination);
  source.start(now, burstOffsetRandom() * NOISE_OFFSET_RANGE);
  source.stop(end);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * 발소리 한 걸음.
 *
 * intensity(0..1)는 이동 속도에서 온다. 같은 모드 안에서도 살금살금 걸을 때와
 * 최고 속도로 걸을 때의 크기가 달라야 조작에 반응하는 느낌이 난다.
 */
export function playFootstep(
  ctx: AudioContext,
  destination: AudioNode,
  whiteNoise: AudioBuffer,
  mode: StepMode,
  intensity: number,
  random: () => number,
): void {
  const profile = STEP_PROFILES[mode];
  const jitter = (random() * 2 - 1) * STEP_JITTER;
  const level = clamp(intensity, 0, 1);

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = profile.bandHz * (1 + jitter);
  band.Q.value = profile.bandQ;

  scheduleNoiseBurst(
    ctx,
    destination,
    whiteNoise,
    band,
    profile.gain * (0.55 + 0.45 * level) * (1 + jitter),
    profile.decaySeconds,
    1 + jitter,
  );

  if (profile.thumpHz <= 0) return;

  // 달리기의 저역 충격 — 노이즈만으로는 체중이 실린 느낌이 나지 않는다.
  const now = ctx.currentTime;
  const end = now + profile.decaySeconds;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(profile.thumpHz * (1 + jitter), now);
  osc.frequency.exponentialRampToValueAtTime(profile.thumpHz * 0.6, end);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENCE, now);
  gain.gain.linearRampToValueAtTime(profile.thumpGain * level, now + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(end);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** 착지 임팩트 — 저역 "쿵"이 주역이고 노이즈는 질감만 얹는다 */
const LANDING_THUMP_START_HZ = 130;
const LANDING_THUMP_END_HZ = 42;
const LANDING_THUMP_SECONDS = 0.16;
const LANDING_THUMP_GAIN_MIN = 0.07;
const LANDING_THUMP_GAIN_MAX = 0.3;
const LANDING_NOISE_LOWPASS_HZ = 1100;
const LANDING_NOISE_SECONDS = 0.2;
const LANDING_NOISE_GAIN_MAX = 0.12;

/**
 * 착지 저역이 울리는 시간(초).
 *
 * 떼어 낸 이유: 바로 위 주석이 「크기뿐 아니라 **저역의 길이도** 함께 늘려야
 * "높은 데서 떨어졌다"가 전달된다」고 단언하는데, `AudioContext` 안에 묻혀
 * 있어 아무도 확인할 수 없었다. 값 하나만 바꿔도 그 약속이 조용히 깨진다.
 */
export function landingThumpSeconds(impact01: number): number {
  const level = clamp(impact01, 0, 1);
  return LANDING_THUMP_SECONDS * (0.7 + 0.6 * level);
}

/**
 * 착지 소리. impact01(0..1)은 낙하 속도에서 온다.
 *
 * 크기뿐 아니라 저역의 길이도 함께 늘려야 "높은 데서 떨어졌다"가 전달된다.
 */
export function playLanding(
  ctx: AudioContext,
  destination: AudioNode,
  whiteNoise: AudioBuffer,
  impact01: number,
): void {
  const level = clamp(impact01, 0, 1);
  const now = ctx.currentTime;
  const end = now + landingThumpSeconds(impact01);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(LANDING_THUMP_START_HZ, now);
  osc.frequency.exponentialRampToValueAtTime(LANDING_THUMP_END_HZ, end);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENCE, now);
  gain.gain.linearRampToValueAtTime(
    lerp(LANDING_THUMP_GAIN_MIN, LANDING_THUMP_GAIN_MAX, level),
    now + ATTACK_SECONDS,
  );
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(end);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = LANDING_NOISE_LOWPASS_HZ;

  scheduleNoiseBurst(
    ctx,
    destination,
    whiteNoise,
    lowpass,
    LANDING_NOISE_GAIN_MAX * level,
    LANDING_NOISE_SECONDS,
    1,
  );
}

/** 점프 — 존재를 알아채지 못할 만큼 옅은 옷깃 스치는 소리 */
const JUMP_SECONDS = 0.18;
const JUMP_BAND_START_HZ = 500;
const JUMP_BAND_END_HZ = 1500;
const JUMP_BAND_Q = 1.4;
const JUMP_GAIN = 0.05;

/** 도약 소리. 대역이 위로 훑고 올라가면 "떠오른다"로 읽힌다. */
export function playJump(ctx: AudioContext, destination: AudioNode, whiteNoise: AudioBuffer): void {
  const now = ctx.currentTime;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = JUMP_BAND_Q;
  band.frequency.setValueAtTime(JUMP_BAND_START_HZ, now);
  band.frequency.linearRampToValueAtTime(JUMP_BAND_END_HZ, now + JUMP_SECONDS);

  scheduleNoiseBurst(ctx, destination, whiteNoise, band, JUMP_GAIN, JUMP_SECONDS, 1);
}
