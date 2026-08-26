/**
 * 절차적 배경음악 — 적응형 스템.
 *
 * 음원 파일을 받지 않는다. 오실레이터와 노이즈로 그 자리에서 합성한다.
 * 대신 "곡"을 통째로 만들지 않고 **레이어를 쌓고 걷는다** — 걷고 있으면 패드와
 * 베이스만, 달리면 하이햇이 들어오고, 보드로 질주하면 아르페지오가 얹힌다.
 *
 * TRAILER_FEATURE_ANALYSIS 5절이 짚은 트레일러의 구조가 이것이다. 음악이 화면과
 * 같이 고조되면 같은 이동이 더 빨라 보인다. 반대로 항상 같은 밀도로 깔리면
 * 배경 소음이 된다.
 *
 * 스케줄링: rAF는 오디오에 충분히 정확하지 않다. 대신 **선행 스케줄링**을 쓴다 —
 * 매 갱신마다 앞으로 LOOKAHEAD 구간에 들어올 박자를 미리 예약한다. 예약된 소리는
 * 오디오 스레드가 샘플 단위로 정확히 재생하므로 프레임이 끊겨도 박자가 밀리지 않는다.
 */

import type { NoiseColor } from "@/game/systems/audio/noise";
import type { DistrictId } from "@/game/world/districts";

export interface MusicVoice {
  /**
   * @param intensity 0~1. 이동 속도에서 뽑은 값. 레이어 참여를 결정한다
   * @param now ctx.currentTime
   * @param companionPresent 초롱이 곁에 있으면 종소리 레이어가 얹힌다
   * @param district 현재 구역. 화음 진행이 바뀐다 (마디 경계에서만 반영)
   */
  update(intensity: number, now: number, companionPresent?: boolean, district?: DistrictId): void;
  dispose(): void;
}

/** 곡의 빠르기. 걷는 속도와 붙어 있어야 발걸음과 싸우지 않는다 */
const BPM = 96;
const SECONDS_PER_BEAT = 60 / BPM;
/** 한 마디의 박자 수 */
const BEATS_PER_BAR = 4;

/**
 * 곡의 빠르기 — **화면도 읽는다.**
 *
 * BPM과 마디를 이 파일이 알고 있는데 화면은 그것을 몰랐다. 원작은 곡이 게임보다
 * 먼저 나왔고 연출 타이밍이 곡 위에 있는데, 우리는 있는 값을 안 쓰고 있었다.
 */
export const MUSIC_TEMPO = {
  bpm: BPM,
  secondsPerBeat: SECONDS_PER_BEAT,
  beatsPerBar: BEATS_PER_BAR,
} as const;

/**
 * 지금 박의 진행도(0~1). 박이 넘어갈 때마다 0으로 돌아온다.
 *
 * **오디오 컨텍스트를 보지 않는다.** 경과 시간만 받는 순수 함수다 — 소리를
 * 끈 사람(`M`)의 화면이 멈추면 안 되고, 소리를 켜지 않은 첫 화면에서도
 * 맥동은 돌아야 한다. 렌더 시계(`clock.elapsedTime`)를 그대로 넘기면 된다.
 */
export function beatPhase(elapsedSeconds: number): number {
  const beats = elapsedSeconds / SECONDS_PER_BEAT;
  return beats - Math.floor(beats);
}

/** 지금 마디의 진행도(0~1). 마디 첫 박에 0이다 */
export function barPhase(elapsedSeconds: number): number {
  const bars = elapsedSeconds / (SECONDS_PER_BEAT * BEATS_PER_BAR);
  return bars - Math.floor(bars);
}

/**
 * 박에 맞춘 맥동 세기(0~1).
 *
 * 박 머리에서 1이고 다음 박까지 잦아든다. 사인파가 아니라 **감쇠**인 이유:
 * 사인은 오르내리는 시간이 같아 「울렁인다」로 보이고, 실제 박은 치고 사라진다.
 */
export function beatPulse(elapsedSeconds: number): number {
  return 1 - beatPhase(elapsedSeconds);
}

/**
 * 선행 스케줄 구간(초).
 *
 * 짧으면 프레임이 한 번 밀릴 때 음이 빠지고, 길면 강도 변화가 늦게 반영된다.
 * 0.3초면 60fps에서 18프레임 분량이라 여유가 있으면서도 반응이 늦지 않다.
 */
const LOOKAHEAD_SECONDS = 0.3;

/** 마스터 대비 음악 볼륨. 효과음을 덮지 않도록 낮게 잡는다 */
const MUSIC_GAIN = 0.16;
/** 강도 변화가 볼륨에 반영되는 속도(초). 급격히 바뀌면 펌핑처럼 들린다 */
const LAYER_FADE_SECONDS = 0.9;

/**
 * A 단조 5음계(펜타토닉).
 *
 * 5음계는 어떤 음을 겹쳐도 불협이 잘 나지 않는다. 절차적으로 음을 고르는데
 * 화성 규칙을 따로 두지 않으려면 이 성질이 필요하다.
 */
const SCALE_SEMITONES = [0, 3, 5, 7, 10];
/** A2 = 110Hz를 기준음으로 삼는다 */
const ROOT_HZ = 110;

/**
 * 화음 진행 — 8마디.
 *
 * 4마디로 돌면 30초도 안 되어 같은 자리가 되돌아온다. 뒤 4마디를 살짝 다르게
 * 두어 한 바퀴를 두 배로 늘렸다. 5음계 안에서만 움직여 어디서 끊겨도
 * 불협이 나지 않는다.
 */
const CHORD_PROGRESSION = [0, 5, 3, 7, 0, 8, 3, 5];

/**
 * 구역별 화음 진행.
 *
 * 진행만 바꾸고 조성(A 단조 5음계)·BPM·악기는 그대로 둔다 — 구역을 넘을 때마다
 * 곡이 통째로 갈리면 이동이 끊긴다. 같은 곡의 다른 절처럼 들려야 한다.
 *
 * districts.ts에는 장소의 이름만 있고 음은 여기 있다. 타입만 가져오므로
 * 사운드가 월드 데이터에 런타임 의존하지 않는다.
 */
const PROGRESSION_BY_DISTRICT: Record<DistrictId, readonly number[]> = {
  // 시작 지점의 소리가 이 게임의 기본값이다. 원래 진행을 그대로 쓴다.
  plaza: CHORD_PROGRESSION,
  // 번화가는 5도가 자주 나와 들뜬다.
  downtown: [0, 7, 5, 7, 3, 10, 5, 7],
  /*
   * 공사장은 대장과 싸우는 자리다. 근음을 오래 끌어 **긴장을 눌러 둔다** —
   * 여기서 곡이 들뜨면 예고를 보고 피하는 리듬과 따로 논다.
   */
  site: [0, 0, 3, 3, 0, 0, 5, 3],
  // 시장은 걸음이 빨라지는 곳이라 근음이 자주 바뀐다.
  market: [0, 5, 3, 8, 5, 10, 3, 7],
  // 주택가는 같은 음을 오래 끌어 한산하게 둔다.
  residential: [0, 0, 5, 3, 0, 0, 8, 3],
  // 옛 마을은 5음계만 밟아 다른 구역과 계열이 갈린다.
  shrine: [0, 3, 5, 10, 0, 3, 7, 5],
  // 공원은 장3도로 올려 밝게 둔다.
  park: [0, 4, 7, 4, 5, 4, 2, 7],
  // 숲은 근음을 거의 안 바꾼다 — 걸음 말고는 아무 일도 안 일어나야 한다.
  forest: [0, 0, 0, 3, 0, 0, 5, 3],
  // 해안은 넓게 벌려 둔다. 옥타브를 오가면 트인 느낌이 난다.
  coast: [0, 7, 0, 5, 10, 5, 7, 0],
};

/**
 * 마디 번호에서 근음을 구한다.
 *
 * 순수 함수로 빼 둔 이유: 진행을 바꿀 때 소리를 들어 보지 않고도 순서가
 * 의도대로인지 확인할 수 있어야 한다.
 */
export function chordRootForBar(bar: number, district: DistrictId = "plaza"): number {
  const progression = PROGRESSION_BY_DISTRICT[district];
  const index = ((bar % progression.length) + progression.length) % progression.length;
  return progression[index];
}

/** 레이어가 들어오기 시작하는 강도 */
/**
 * 레이어가 들어오는 강도 문턱.
 *
 * 순서가 곧 곡의 구조다 — 걷기(패드)에서 시작해 달리기(하이햇), 보드
 * 최고 속도(아르페지오)로 쌓인다. 값이 뒤집히면 순서가 무너져 "속도에 따라
 * 쌓인다"는 설계가 통째로 깨지는데, 그건 귀로만 알 수 있다. 그래서 내보낸다.
 */
export const LAYER_THRESHOLD = {
  pad: 0,
  bass: 0.12,
  hat: 0.42,
  arp: 0.72,
} as const;

function semitoneToHz(semitone: number): number {
  return ROOT_HZ * 2 ** (semitone / 12);
}

/**
 * 한 음을 예약한다.
 *
 * 매 음마다 오실레이터를 새로 만든다. 낭비처럼 보이지만 Web Audio가 의도한
 * 사용법이고, stop된 노드는 자동으로 정리된다. 하나를 재사용하며 주파수를
 * 바꾸면 음 사이에 글리치가 생긴다.
 */
function scheduleTone(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    frequency: number;
    startTime: number;
    duration: number;
    type: OscillatorType;
    peak: number;
    attack: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.frequency, options.startTime);

  // 지수 감쇠는 0에 도달하지 못하므로 마지막에 선형으로 끊는다.
  gain.gain.setValueAtTime(0, options.startTime);
  gain.gain.linearRampToValueAtTime(options.peak, options.startTime + options.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, options.startTime + options.duration);
  gain.gain.linearRampToValueAtTime(0, options.startTime + options.duration + 0.01);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(options.startTime);
  osc.stop(options.startTime + options.duration + 0.02);
}

/** 하이햇 — 짧은 노이즈 버스트를 하이패스로 깎는다. */
function scheduleHat(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  startTime: number,
  peak: number,
): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = noise;
  // 버퍼의 다른 지점에서 시작해 매번 같은 소리가 나지 않게 한다.
  const offset = (startTime * 7.3) % Math.max(0.001, noise.duration - 0.1);

  filter.type = "highpass";
  filter.frequency.setValueAtTime(7200, startTime);

  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
  gain.gain.linearRampToValueAtTime(0, startTime + 0.065);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(startTime, offset, 0.09);
  source.stop(startTime + 0.09);
}

/**
 * 음악 보이스를 만든다.
 *
 * 레이어마다 게인 노드를 두고, 강도에 따라 그 게인만 움직인다. 노드를 껐다
 * 켜면 음이 중간에 잘리므로 볼륨으로만 드나들게 한다.
 */
export function createMusicVoice(
  ctx: AudioContext,
  destination: AudioNode,
  noiseByColor: Record<NoiseColor, AudioBuffer>,
): MusicVoice {
  const bus = ctx.createGain();
  bus.gain.value = MUSIC_GAIN;

  const layers = {
    pad: ctx.createGain(),
    bass: ctx.createGain(),
    hat: ctx.createGain(),
    arp: ctx.createGain(),
    /** 동료가 곁에 있을 때만 들리는 종소리. 존재를 소리로도 알린다 */
    bell: ctx.createGain(),
  };

  // 패드는 저역이 뭉치지 않도록 살짝 깎아 둔다.
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 1400;

  layers.pad.connect(padFilter);
  padFilter.connect(bus);
  layers.bass.connect(bus);
  layers.hat.connect(bus);
  layers.arp.connect(bus);
  layers.bell.connect(bus);
  bus.connect(destination);

  for (const layer of Object.values(layers)) layer.gain.value = 0;

  /** 다음에 예약할 박자 번호. 계속 증가한다 */
  let beatIndex = 0;
  /**
   * 지금 울리고 있는 구역과 다음 마디부터 울릴 구역.
   *
   * 구역이 바뀌는 즉시 화음을 갈면 마디 중간에 베이스만 다른 음으로 튄다.
   * 마디 첫 박에서만 갈아탄다.
   */
  let activeDistrict: DistrictId = "plaza";
  let pendingDistrict: DistrictId = "plaza";
  /** 그 박자가 울릴 시각. 첫 갱신에서 현재 시각으로 맞춘다 */
  let nextBeatTime = 0;
  let started = false;
  let disposed = false;

  const scheduleBeat = (beat: number, time: number, level: number): void => {
    const bar = Math.floor(beat / BEATS_PER_BAR);
    const beatInBar = beat % BEATS_PER_BAR;
    if (beatInBar === 0) activeDistrict = pendingDistrict;
    const chordRoot = chordRootForBar(bar, activeDistrict);

    // 패드 — 마디 첫 박에 화음을 길게 깐다.
    if (beatInBar === 0) {
      for (const semitone of [chordRoot, chordRoot + 7, chordRoot + 12]) {
        scheduleTone(ctx, layers.pad, {
          frequency: semitoneToHz(semitone + 12),
          startTime: time,
          duration: SECONDS_PER_BEAT * BEATS_PER_BAR,
          type: "triangle",
          peak: 0.18,
          attack: 0.35,
        });
      }
    }

    // 베이스 — 1박과 3박. 4분음표 두 번이 걷는 느낌을 만든다.
    if (level >= LAYER_THRESHOLD.bass && beatInBar % 2 === 0) {
      scheduleTone(ctx, layers.bass, {
        frequency: semitoneToHz(chordRoot),
        startTime: time,
        duration: SECONDS_PER_BEAT * 0.85,
        type: "sine",
        peak: 0.5,
        attack: 0.012,
      });
    }

    // 하이햇 — 8분음표. 강박과 약박의 세기를 다르게 준다.
    if (level >= LAYER_THRESHOLD.hat) {
      scheduleHat(ctx, layers.hat, noiseByColor.white, time, 0.14);
      scheduleHat(ctx, layers.hat, noiseByColor.white, time + SECONDS_PER_BEAT / 2, 0.075);
    }

    // 종소리 — 마디 첫 박에 한 번. 동료 레이어의 게인이 0이면 들리지 않는다.
    if (beatInBar === 0) {
      scheduleTone(ctx, layers.bell, {
        frequency: semitoneToHz(chordRoot + SCALE_SEMITONES[2] + 36),
        startTime: time,
        duration: SECONDS_PER_BEAT * 2.4,
        type: "sine",
        peak: 0.22,
        attack: 0.006,
      });
    }

    // 아르페지오 — 16분음표 네 개. 최고 속도에서만 들어온다.
    if (level >= LAYER_THRESHOLD.arp) {
      for (let step = 0; step < 4; step += 1) {
        // 박자 번호로 음을 고른다. 난수를 쓰면 매번 달라져 곡으로 안 들린다.
        const degree = (beat * 3 + step * 2) % SCALE_SEMITONES.length;
        scheduleTone(ctx, layers.arp, {
          frequency: semitoneToHz(chordRoot + SCALE_SEMITONES[degree] + 24),
          startTime: time + (SECONDS_PER_BEAT / 4) * step,
          duration: SECONDS_PER_BEAT / 3,
          type: "triangle",
          peak: 0.12,
          attack: 0.005,
        });
      }
    }
  };

  /** 강도에서 레이어 게인을 뽑는다. 문턱을 넘은 뒤 서서히 열린다 */
  const layerGain = (intensity: number, threshold: number): number => {
    if (intensity <= threshold) return 0;
    const span = Math.max(0.08, 1 - threshold);
    return Math.min(1, (intensity - threshold) / span);
  };

  return {
    update(intensity, now, companionPresent = false, district = "plaza") {
      if (disposed) return;
      pendingDistrict = district;

      if (!started) {
        // 첫 갱신에서 기준 시각을 잡는다. 0으로 두면 과거 시각에 예약하게 된다.
        nextBeatTime = now + 0.08;
        started = true;
      }

      const clamped = Math.max(0, Math.min(1, intensity));

      // 패드는 멈춰 있어도 들려야 한다. 정적이 아니라 여백이어야 하기 때문이다.
      layers.pad.gain.setTargetAtTime(0.55 + 0.45 * clamped, now, LAYER_FADE_SECONDS);
      layers.bass.gain.setTargetAtTime(
        layerGain(clamped, LAYER_THRESHOLD.bass),
        now,
        LAYER_FADE_SECONDS,
      );
      layers.hat.gain.setTargetAtTime(
        layerGain(clamped, LAYER_THRESHOLD.hat),
        now,
        LAYER_FADE_SECONDS,
      );
      layers.arp.gain.setTargetAtTime(
        layerGain(clamped, LAYER_THRESHOLD.arp),
        now,
        LAYER_FADE_SECONDS,
      );
      // 동료가 떠나면 소리도 함께 사라진다 — 화면과 소리가 같은 말을 해야 한다.
      layers.bell.gain.setTargetAtTime(companionPresent ? 1 : 0, now, LAYER_FADE_SECONDS);

      // 앞으로 LOOKAHEAD 안에 들어오는 박자를 미리 예약한다.
      let guard = 0;
      while (nextBeatTime < now + LOOKAHEAD_SECONDS && guard < 32) {
        scheduleBeat(beatIndex, nextBeatTime, clamped);
        beatIndex += 1;
        nextBeatTime += SECONDS_PER_BEAT;
        guard += 1;
      }

      // 탭이 오래 멈춰 있었다면 예약이 과거에 몰린다. 기준을 현재로 되돌린다.
      if (nextBeatTime < now) {
        nextBeatTime = now + 0.05;
      }
    },

    dispose() {
      disposed = true;
      for (const layer of Object.values(layers)) layer.disconnect();
      padFilter.disconnect();
      bus.disconnect();
    },
  };
}
