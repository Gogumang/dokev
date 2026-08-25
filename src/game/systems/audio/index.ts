"use client";

/**
 * 월드 사운드 엔진 — 정책과 배선.
 *
 * 소리는 보조 데이터다 (coding-style: 핵심/보조 구분). AudioContext를 못 만들거나
 * 브라우저가 재생을 막아도 게임은 그대로 돌아가야 하므로, 이 파일의 모든 실패
 * 경로는 조용히 무음으로 떨어진다. 예외를 위로 던지지 않는다.
 *
 * 여기서 다루는 정책은 세 가지다:
 *   1. 자동재생 — DESIGN_GUIDE 「2.4 즐거움은 선택 가능해야 함」. 첫 명시적 입력 전에는 AudioContext를 만들지 않는다.
 *   2. 사용자 설정 — PlayerSettings.sound가 꺼지면 즉시 무음 + 컨텍스트 정지.
 *   3. 백그라운드 — 탭이 가려지면 멈춘다. 다른 탭에서 소리가 새면 안 된다.
 *
 * 매 프레임 React 상태를 갱신하지 않는다. GameScene이 갱신하는 가변 stats 객체를
 * requestAnimationFrame 루프에서 직접 읽는다 (GameScene의 RuntimeStats 주석과 같은 이유).
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  isVehicle,
  LOCOMOTION,
  VEHICLE_TOP_SPEED,
  type LocomotionMode,
} from "@/game/config/tuning";
import { createSeededRandom, inverseLerpClamped } from "@/game/core/mathx";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
} from "@/game/systems/settings";

import type { DistrictId } from "@/game/world/districts";

import {
  createCombatVoice,
  consumeCues,
  createCombatCues,
  hasCues,
  type CombatCues,
  type CombatVoice,
} from "./combat";
import { createMusicVoice, type MusicVoice } from "./music";
import { createNoiseBuffer } from "./noise";
import {
  advanceStride,
  FOOTSTEP_MIN_SPEED,
  LANDING_MAX_IMPACT,
  LANDING_MIN_IMPACT,
  landingImpact,
  landingSounds,
  STRIDE_METERS,
  walksOnFoot,
} from "@/game/systems/audio/footsteps";
import {
  createAmbienceVoice,
  createRollVoice,
  createWindVoice,
  playFootstep,
  playJump,
  playLanding,
  type AmbienceVoice,
  type RollVoice,
  type StepMode,
  type WindVoice,
} from "./voices";

/**
 * 엔진이 읽는 런타임 값.
 *
 * GameScene의 RuntimeStats를 import하지 않고 필요한 세 필드만 선언한다. 구조적
 * 타이핑 덕분에 RuntimeStats를 그대로 넘길 수 있으면서, 사운드가 3D 런타임에
 * 의존하지 않는다.
 */
export interface AudioMotionSource {
  /** 수평 이동 속도 (m/s) */
  readonly speed: number;
  /** 걷기·달리기·탈것 셋 중 하나. `string`으로 두면 오타가 조용히 통과한다 */
  readonly mode: LocomotionMode;
  readonly grounded: boolean;
  /** 도깨비 동료가 곁에 있는지. 음악 레이어에 쓴다 */
  readonly companionPresent?: boolean;
  /** 지금 서 있는 구역. 화음 진행이 바뀐다 */
  readonly district?: DistrictId;
  /**
   * 전투 사건 누적 수. 씬이 늘리고 여기서 차이만큼 소리를 낸다.
   *
   * 불리언이 아닌 이유: 한 프레임에 두 번 맞으면 한 번으로 뭉개진다.
   */
  readonly combat?: CombatCues;
}

export interface WorldAudio {
  /** PlayerSettings.sound 반영. 끄면 즉시 페이드 아웃 후 컨텍스트를 정지한다 */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* 상수                                                                 */
/* ------------------------------------------------------------------ */

/** 전체 출력 상한. 보이스 다섯 갈래가 겹쳐도 클리핑되지 않도록 여유를 둔다 */
const MASTER_GAIN = 0.7;
/** 마스터 페이드 시상수. 이보다 짧으면 켜고 끌 때 "뚝" 하고 튄다 */
const MASTER_FADE_SECONDS = 0.12;
/**
 * 페이드가 끝나기 전에 suspend하면 소리가 잘려 나간다.
 * setTargetAtTime은 시상수의 4배쯤이면 사실상 0에 도달하므로 그 이후로 미룬다.
 */
const SUSPEND_DELAY_MS = 600;

/** 파라미터 자동화 주기. 매 프레임 setTargetAtTime을 부를 필요는 없다 */
const PARAM_INTERVAL_SECONDS = 0.05;
/**
 * 오디오 루프의 dt 상한.
 *
 * 탭 복귀 직후의 거대한 dt를 그대로 쓰면 걸음 거리 누적이 한 번에 터져 발소리가
 * 연발한다 (GameScene의 MAX_DELTA_SECONDS와 같은 취지).
 */
const MAX_AUDIO_DELTA_SECONDS = 1 / 20;

/** 바람이 들리기 시작하는 속도. 걷기 최고 속도 부근이라 산책 중에는 거의 없다 */
const WIND_START_SPEED = LOCOMOTION.walk.maxSpeed;
/** 바람이 최대가 되는 속도 = 가장 빠른 탈것의 최고 속도 */
const WIND_FULL_SPEED = VEHICLE_TOP_SPEED;

/** 구름 소리가 들리기 시작하는 속도. 멈춘 보드에서 소리가 나면 안 된다 */
const ROLL_START_SPEED = 0.8;

/* ------------------------------------------------------------------ */
/* 엔진                                                                 */
/* ------------------------------------------------------------------ */

interface AudioGraph {
  master: GainNode;
  wind: WindVoice;
  ambience: AmbienceVoice;
  roll: RollVoice;
  music: MusicVoice;
  combat: CombatVoice;
  whiteNoise: AudioBuffer;
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

/** 구형 사파리는 접두사 붙은 생성자만 노출한다. 둘 다 없으면 무음으로 간다. */
function resolveAudioContextCtor(): AudioContextConstructor | null {
  const scope = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** 사용자 제스처로 인정하는 이벤트. iOS Safari는 touchstart까지 봐야 확실하다 */
const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** 아무것도 하지 않는 엔진 — 오디오를 못 쓰는 환경에서 호출부를 분기시키지 않기 위한 것 */
const SILENT_AUDIO: WorldAudio = {
  setEnabled() {},
  dispose() {},
};

/**
 * 월드 사운드 엔진을 만든다.
 *
 * 이 시점에는 AudioContext를 만들지 않는다. 첫 사용자 제스처를 기다렸다가 그때
 * 그래프를 세운다 — 제스처 전에 만들면 브라우저가 suspended 상태로 잠그고,
 * iOS에서는 그 뒤 resume해도 소리가 나지 않는 경우가 있다.
 */
function createWorldAudio(motion: AudioMotionSource): WorldAudio {
  if (typeof window === "undefined") return SILENT_AUDIO;

  let ctx: AudioContext | null = null;
  let graph: AudioGraph | null = null;
  let disposed = false;

  let enabled = true;
  let visible = document.visibilityState !== "hidden";
  /** 첫 사용자 제스처가 지나갔는지. 소리를 껐다 켤 때 그래프를 세워도 되는지 판단한다 */
  let gestureSeen = false;

  let frameHandle = 0;
  let suspendHandle = 0;
  let lastFrameMs = 0;
  let paramClock = 0;

  // 이동 이벤트 추적용 누적기
  let strideDistance = 0;
  /** 마지막으로 소리를 낸 전투 사건 수 */
  let lastCues: CombatCues = createCombatCues();
  let wasGrounded = motion.grounded;
  let airborneSinceMs = 0;

  const random = createSeededRandom(0xa17d10);

  const shouldPlay = () => !disposed && enabled && visible && ctx !== null;

  /* ---------------- 프레임 루프 ---------------- */

  const step = (nowMs: number) => {
    frameHandle = requestAnimationFrame(step);
    if (!ctx || !graph) return;

    const dt =
      lastFrameMs === 0 ? 0 : Math.min((nowMs - lastFrameMs) / 1000, MAX_AUDIO_DELTA_SECONDS);
    lastFrameMs = nowMs;

    const speed = motion.speed;
    const rolling = isVehicle(motion.mode);
    const now = ctx.currentTime;

    /* 지속음 — 주기적으로만 파라미터를 옮긴다 */
    paramClock += dt;
    if (paramClock >= PARAM_INTERVAL_SECONDS) {
      paramClock = 0;
      graph.wind.update(inverseLerpClamped(WIND_START_SPEED, WIND_FULL_SPEED, speed), now);
      graph.roll.update(
        inverseLerpClamped(ROLL_START_SPEED, VEHICLE_TOP_SPEED, speed),
        rolling && motion.grounded,
        now,
      );
      graph.ambience.update(now);
      /*
       * 음악 강도는 걷기 최고 속도부터 보드 최고 속도 사이를 0~1로 편다.
       * 바람과 같은 구간을 쓰면 두 소리가 함께 커져 서로를 가린다 — 음악은
       * 조금 늦게 올라오도록 시작점을 걷기 속도에 둔다.
       */
      /*
       * 전투 소리 — 마지막으로 본 수와의 차이만큼 낸다. 파라미터 갱신 주기와
       * 무관하게 매 프레임 확인해야 타격이 밀리지 않는다.
       */
      if (motion.combat) {
        const fired = consumeCues(lastCues, motion.combat);
        if (hasCues(fired)) graph.combat.play(fired, now);
        lastCues = { ...motion.combat };
      }

      graph.music.update(
        inverseLerpClamped(WIND_START_SPEED, WIND_FULL_SPEED, speed),
        now,
        motion.companionPresent ?? false,
        motion.district ?? "plaza",
      );
    }

    /* 발소리 — 탈것은 구름 소리가 대신하므로 걸음을 세지 않는다 */
    if (walksOnFoot(rolling, motion.grounded, speed)) {
      const stepMode: StepMode = motion.mode === "run" ? "run" : "walk";
      const advanced = advanceStride(strideDistance, speed * dt, STRIDE_METERS[stepMode]);
      strideDistance = advanced.distance;
      if (advanced.stepped) {
        playFootstep(
          ctx,
          graph.master,
          graph.whiteNoise,
          stepMode,
          inverseLerpClamped(FOOTSTEP_MIN_SPEED, LOCOMOTION[stepMode].maxSpeed, speed),
          random,
        );
      }
    } else {
      // 멈추거나 공중에 뜨면 다음 첫 걸음이 바로 나도록 누적을 비운다.
      strideDistance = 0;
    }

    /* 점프 / 착지 — grounded 전이로 잡는다 */
    if (wasGrounded && !motion.grounded) {
      airborneSinceMs = nowMs;
      playJump(ctx, graph.master, graph.whiteNoise);
    } else if (!wasGrounded && motion.grounded) {
      const airtime = airborneSinceMs === 0 ? 0 : (nowMs - airborneSinceMs) / 1000;
      const impact = landingImpact(airtime);
      if (landingSounds(airtime)) {
        playLanding(
          ctx,
          graph.master,
          graph.whiteNoise,
          inverseLerpClamped(LANDING_MIN_IMPACT, LANDING_MAX_IMPACT, impact),
        );
      }
      airborneSinceMs = 0;
    }
    wasGrounded = motion.grounded;
  };

  const startLoop = () => {
    if (frameHandle !== 0) return;
    lastFrameMs = 0;
    frameHandle = requestAnimationFrame(step);
  };

  const stopLoop = () => {
    if (frameHandle === 0) return;
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  /* ---------------- 활성화 정책 ---------------- */

  const applyActivation = () => {
    if (!ctx || !graph) return;

    const context = ctx;
    const master = graph.master;

    if (suspendHandle !== 0) {
      window.clearTimeout(suspendHandle);
      suspendHandle = 0;
    }

    if (shouldPlay()) {
      // resume은 프로미스를 돌려준다. 실패해도 게임에는 영향이 없어야 한다.
      void context.resume().catch(() => {});
      master.gain.setTargetAtTime(MASTER_GAIN, context.currentTime, MASTER_FADE_SECONDS);
      startLoop();
      return;
    }

    master.gain.setTargetAtTime(0, context.currentTime, MASTER_FADE_SECONDS);
    stopLoop();
    suspendHandle = window.setTimeout(() => {
      suspendHandle = 0;
      // 타이머가 도는 사이 다시 켜졌을 수 있다.
      if (shouldPlay()) return;
      void context.suspend().catch(() => {});
    }, SUSPEND_DELAY_MS);
  };

  /* ---------------- 그래프 구성 ---------------- */

  const build = () => {
    if (ctx || disposed) return;

    try {
      const Ctor = resolveAudioContextCtor();
      if (!Ctor) return;

      const context = new Ctor({ latencyHint: "interactive" });
      const master = context.createGain();
      // 0에서 시작해 페이드로 올린다. 전체 게인으로 바로 열면 시작음이 튄다.
      master.gain.value = 0;
      master.connect(context.destination);

      const pinkNoise = createNoiseBuffer(context, "pink", 0x9e3779b9);
      const whiteNoise = createNoiseBuffer(context, "white", 0x85ebca6b);

      ctx = context;
      graph = {
        master,
        whiteNoise,
        wind: createWindVoice(context, master, pinkNoise),
        ambience: createAmbienceVoice(context, master, pinkNoise, random),
        roll: createRollVoice(context, master, pinkNoise, whiteNoise),
        music: createMusicVoice(context, master, { white: whiteNoise, pink: pinkNoise }),
        combat: createCombatVoice(context, master, whiteNoise),
      };

      applyActivation();
    } catch {
      // 오디오는 보조 데이터다. 컨텍스트 개수 상한, 정책 차단, 구형 브라우저 —
      // 어떤 이유든 게임은 무음으로 계속 돌아가야 한다.
      ctx = null;
      graph = null;
    }
  };

  /* ---------------- 이벤트 배선 ---------------- */

  const onGesture = () => {
    if (disposed) return;
    gestureSeen = true;
    if (!ctx) {
      // 소리를 꺼 둔 사용자에게는 AudioContext 자체를 만들지 않는다. 켜는 순간
      // setEnabled가 이 자리를 대신 맡는다.
      if (enabled) build();
      return;
    }
    // iOS는 전화·알람 등으로 컨텍스트를 임의로 멈춘다. 제스처마다 되살릴 기회를 준다.
    if (shouldPlay() && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  };

  const onVisibilityChange = () => {
    visible = document.visibilityState !== "hidden";
    applyActivation();
  };

  for (const type of GESTURE_EVENTS) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      // 꺼진 채로 제스처를 흘려보냈다면 그래프가 아직 없다. 이 켜기 자체가
      // 사용자 조작의 결과이므로 자동재생 정책상 지금 만들어도 된다.
      if (enabled && !ctx && gestureSeen) {
        build();
        return;
      }
      applyActivation();
    },

    dispose() {
      if (disposed) return;
      disposed = true;

      for (const type of GESTURE_EVENTS) {
        window.removeEventListener(type, onGesture, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);

      stopLoop();
      if (suspendHandle !== 0) {
        window.clearTimeout(suspendHandle);
        suspendHandle = 0;
      }

      // 지속음은 명시적으로 끊는다. 짧은 원샷은 onended가 스스로 정리하고,
      // 그 사이에 남은 것은 close()가 회수한다.
      graph?.wind.dispose();
      graph?.ambience.dispose();
      graph?.roll.dispose();
      graph?.music.dispose();
      graph?.combat.dispose();
      graph?.master.disconnect();
      graph = null;

      const context = ctx;
      ctx = null;
      void context?.close().catch(() => {});
    },
  };
}

/* ------------------------------------------------------------------ */
/* React 배선                                                           */
/* ------------------------------------------------------------------ */

/**
 * 월드 화면에 사운드를 붙인다.
 *
 * 설정 변경은 useSyncExternalStore로 구독한다 — 시작 화면에서 소리를 끄고
 * 들어오든 플레이 중에 끄든 같은 경로로 즉시 반영된다.
 */
export function useWorldAudio(motion: AudioMotionSource): void {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  const audioRef = useRef<WorldAudio | null>(null);

  useEffect(() => {
    const audio = createWorldAudio(motion);
    audioRef.current = audio;
    return () => {
      audioRef.current = null;
      audio.dispose();
    };
  }, [motion]);

  // 엔진 생성 효과가 먼저 돌므로 첫 마운트에서도 설정이 곧바로 반영된다.
  useEffect(() => {
    audioRef.current?.setEnabled(settings.sound);
  }, [settings.sound]);
}
