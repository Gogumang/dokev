/**
 * 전투 소리 — 절차 합성.
 *
 * 로봇을 때려도 소리가 없었다. 화면만 흔들리고 조용하면 맞았는지 스친 것인지
 * 알 수 없다 — 타격은 눈보다 귀로 먼저 확인된다.
 *
 * TRAILER_FEATURE_ANALYSIS 3.4절: 전투는 장난감처럼 유쾌해야 한다. 그래서
 * 금속 파열음이 아니라 **깡통 두드리는 소리**에 가깝게 만든다.
 *
 * 사건은 프레임마다 여러 번 일어날 수 있으므로 **카운터**로 주고받는다.
 * 불리언 플래그는 한 프레임에 두 번 맞으면 한 번으로 뭉개진다.
 */

export interface CombatCues {
  /** 적을 때린 횟수 */
  hits: number;
  /** 적을 쓰러뜨린 횟수 */
  defeats: number;
  /** 플레이어가 맞은 횟수 */
  hurts: number;
  /** 보스가 내려친 횟수 */
  slams: number;
}

export function createCombatCues(): CombatCues {
  return { hits: 0, defeats: 0, hurts: 0, slams: 0 };
}

/**
 * 한 프레임에 실제로 낼 소리 수.
 *
 * 탭이 오래 멈춰 있다 돌아오면 그 사이 쌓인 사건이 한꺼번에 터진다. 상한을
 * 두지 않으면 수십 개가 같은 시각에 겹쳐 굉음이 된다.
 */
const MAX_PER_FRAME = 3;

/** 이번 프레임에 낼 소리 수를 센다. 남은 것은 버린다 */
export function consumeCues(previous: CombatCues, current: CombatCues): CombatCues {
  const take = (before: number, after: number) =>
    Math.max(0, Math.min(MAX_PER_FRAME, after - before));

  return {
    hits: take(previous.hits, current.hits),
    defeats: take(previous.defeats, current.defeats),
    hurts: take(previous.hurts, current.hurts),
    slams: take(previous.slams, current.slams),
  };
}

/** 두 상태가 같은 값인지. 같으면 아무 소리도 낼 것이 없다 */
export function hasCues(counts: CombatCues): boolean {
  return counts.hits > 0 || counts.defeats > 0 || counts.hurts > 0 || counts.slams > 0;
}

export interface CombatVoice {
  play(counts: CombatCues, now: number): void;
  dispose(): void;
}

/**
 * 짧은 타격음 하나.
 *
 * 노이즈(부딪히는 질감)와 사인파(통이 울리는 몸통)를 겹친다. 노이즈만 쓰면
 * 모래 소리가 되고, 사인파만 쓰면 전자음이 된다.
 */
function strike(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
  now: number,
  options: { frequency: number; duration: number; peak: number; noiseAmount: number },
): void {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(options.peak * options.noiseAmount, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = options.frequency * 2.5;
  filter.Q.value = 1.2;

  source.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(destination);
  source.start(now);
  source.stop(now + options.duration);

  const tone = ctx.createOscillator();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(options.frequency, now);
  // 음이 아래로 떨어져야 "맞았다"로 들린다. 올라가면 튕겨 나간 느낌이다.
  tone.frequency.exponentialRampToValueAtTime(options.frequency * 0.55, now + options.duration);

  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(options.peak, now);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

  tone.connect(toneGain);
  toneGain.connect(destination);
  tone.start(now);
  tone.stop(now + options.duration);
}

/**
 * 전투 소리를 만든다.
 *
 * 소리마다 음높이를 다르게 준다 — 같은 소리면 때린 것과 맞은 것을 귀로
 * 구분할 수 없다.
 */
export function createCombatVoice(
  ctx: AudioContext,
  destination: AudioNode,
  noise: AudioBuffer,
): CombatVoice {
  const bus = ctx.createGain();
  bus.gain.value = 0.5;
  bus.connect(destination);
  let disposed = false;

  return {
    play(counts, now) {
      if (disposed) return;

      for (let i = 0; i < counts.hits; i += 1) {
        // 연달아 맞을 때 조금씩 어긋나게 둔다. 정확히 겹치면 한 번으로 들린다.
        strike(ctx, bus, noise, now + i * 0.045, {
          frequency: 320,
          duration: 0.16,
          peak: 0.5,
          noiseAmount: 0.9,
        });
      }

      for (let i = 0; i < counts.defeats; i += 1) {
        // 쓰러질 때는 더 낮고 길게. 마지막 한 방이 다르게 들려야 한다.
        strike(ctx, bus, noise, now + i * 0.05, {
          frequency: 180,
          duration: 0.42,
          peak: 0.65,
          noiseAmount: 1.1,
        });
      }

      for (let i = 0; i < counts.hurts; i += 1) {
        // 내가 맞은 소리는 높고 짧다 — 적을 때린 소리와 섞이면 안 된다.
        strike(ctx, bus, noise, now + i * 0.05, {
          frequency: 520,
          duration: 0.22,
          peak: 0.55,
          noiseAmount: 0.5,
        });
      }

      for (let i = 0; i < counts.slams; i += 1) {
        // 보스의 내려침은 가장 낮고 길다. 거리와 무관하게 들려야 피할 수 있다.
        strike(ctx, bus, noise, now + i * 0.06, {
          frequency: 90,
          duration: 0.7,
          peak: 0.8,
          noiseAmount: 1.4,
        });
      }
    },
    dispose() {
      disposed = true;
      bus.disconnect();
    },
  };
}
