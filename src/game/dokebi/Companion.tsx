"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * useFrame 안에서 Object3D transform을 직접 갱신한다. 능력 요청은 한 번만
 * 처리해야 하므로 읽은 쪽이 소비해야 하고, 이를 setState로 옮기면 키를 누를
 * 때마다 리렌더가 발생한다.
 *
 * 공유 효과 객체에 쓰는 일은 `projectCompanionEffects`가 맡는다 — 화면 안에
 * 두었을 때는 한 줄을 지워도 아무도 몰랐다. 그 덕에 이 파일에서 불변성 예외를
 * 걸어 둘 이유도 사라졌다.
 */
/**
 * 도깨비 동료 — 자리·빛·능력 연출. 몸은 `CompanionModel`이 맡는다.
 *
 * 실루엣 원칙 (TRAILER 8.2 지원형 동료): 작고, 빠르고, 스스로 빛난다.
 * **「떠 있고」가 빠졌다** — 등불이던 시절의 원칙이라, 걷는 동작을 든 두 발
 * 생물에게는 성립하지 않는다(공중에서 다리를 저으면 버그로 읽힌다).
 *
 * 등불 몸은 아직 안 온 로봇(자정)과 못 받은 경우를 위해 fallback으로 남는다.
 * 그때 몸통과 눈이 조명을 안 받는 것은 그대로다 — 스스로 빛나는 인상이
 * 흐려지면 그냥 떠다니는 공이 된다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { COMPANION_BODY } from "@/game/dokebi/companionBody";
import { CompanionAbilityVfx } from "@/game/dokebi/CompanionAbilityVfx";
import { CompanionLantern } from "@/game/dokebi/CompanionLantern";
import { CompanionModel } from "@/game/dokebi/CompanionModel";
import { COMPANION_SHAPE } from "@/game/dokebi/companionShapes";
import { BASE_LIGHT_RANGE, type DokebiSpirit } from "@/game/dokebi/roster";
import {
  bobOffset,
  companionFormationScale,
  createCompanionState,
  isAbilityActive,
  stepCompanion,
  type CompanionCommand,
  type CompanionState,
  type CompanionTarget,
} from "@/game/dokebi/companionMotion";
import { projectCompanionEffects } from "@/game/dokebi/companionProjection";

export interface CompanionProps {
  /** GameScene이 매 프레임 갱신하는 공유 객체. 값이 아니라 참조를 받는다 */
  target: CompanionTarget;
  /** 소환·능력 명령. 역시 가변 객체 참조다 */
  command: CompanionCommand;
  reducedMotion: boolean;
  /** 지금 데리고 다니는 도깨비. 색과 능력이 여기서 온다 */
  spirit: DokebiSpirit;
  /** 여럿이 따라다닐 때의 자리 번호. 0이면 예전과 같은 자리다 */
  slot?: number;
  /**
   * 능력 효과를 써 넣을 곳. 전투 쪽이 매 프레임 읽는다.
   *
   * 동료가 능력 상태를 갖고 있으므로 여기서 쓰는 것이 맞다. 전투가 동료
   * 상태를 직접 들여다보게 하면 두 시스템이 서로를 알아야 한다.
   */
  effects: {
    abilityAggroScale: number;
    abilityRegenScale: number;
    /** 지도가 읽는 동료 위치. 사라져 있으면 companionVisible이 false다 */
    companionX: number;
    companionZ: number;
    companionVisible: boolean;
    /** 능력을 지금 쓸 수 있는지. HUD가 버튼 안내에 쓴다 */
    companionAbilityReady: boolean;
    /** 지금 빛이 닿는 거리(m). 능력이 꺼져 있으면 0 — 흔적을 드러내는 범위다 */
    companionLightRange: number;
  };
}

/** 고리가 도는 속도(rad/s). 서두를수록 빨라진다 */
const RING_SPIN_BASE = 1.1;
const RING_SPIN_RUSH = 3.4;

/** 눈을 깜빡이는 주기(초)와 감고 있는 시간(초) */
const BLINK_CYCLE = 3.4;
const BLINK_DURATION = 0.12;

export function Companion({
  target,
  command,
  reducedMotion,
  spirit,
  effects,
  slot = 0,
}: CompanionProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Group>(null);
  const eyeLeftRef = useRef<THREE.Mesh>(null);
  const eyeRightRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const viewportWidth = useThree((renderState) => renderState.size.width);
  const formationScale = companionFormationScale(viewportWidth);

  const state = useRef<CompanionState>(createCompanionState(target.position, slot, formationScale));
  const ringSpin = useRef(0);
  const blinkTimer = useRef(0);
  /*
   * GLB가 실제로 섰는가.
   *
   * 등불 몸은 모델이 없는 도깨비(아직 안 온 로봇)와 못 받은 경우를 위해 남는다.
   * 모델이 섰으면 꼬리 불꽃을 감춘다 — 걸어 다니는 곰 뒤에 불꽃이 매달려 있으면
   * 등불이던 시절의 부품만 남은 것으로 보인다. 부적 고리와 눈은 fallback 안에
   * 있어서 저절로 사라진다.
   */
  const modelShown = useRef(false);

  /*
   * 꼬리 불꽃만 여기 남는다. 등불 몸과 달리 `bodyRef` **밖에** 매달려 있어서
   * (기울기를 반대로 받아야 한다) 같이 옮기면 기울기가 두 번 걸린다.
   */
  const flame = useMemo(
    () => new THREE.ConeGeometry(COMPANION_BODY.flameRadius, COMPANION_BODY.flameHeight, 8),
    [],
  );
  useLayoutEffect(() => () => flame.dispose(), [flame]);
  const shape = COMPANION_SHAPE[spirit.id];
  const handleShown = useCallback((shown: boolean) => {
    modelShown.current = shown;
  }, []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    const next = stepCompanion(
      state.current,
      target,
      dt,
      command,
      spirit.effect,
      slot,
      formationScale,
    );
    // 요청은 한 번만 처리한다 — 유지되면 매 프레임 재발동한다.
    state.current = next;

    const root = rootRef.current;
    if (!root) return;

    // 완전히 사라졌으면 그리지 않는다. 투명한 물체도 렌더 비용은 든다.
    root.visible = next.presence > 0.01;
    if (!root.visible) return;

    // 저감 모션에서는 위아래 흔들림을 빼고 위치만 따라간다.
    const bob = reducedMotion ? 0 : bobOffset(next);
    root.position.set(next.position.x, next.position.y + bob, next.position.z);
    root.rotation.y = next.facing;
    // 나타나고 사라질 때 크기로 표현한다 — 재질 투명도를 건드리면
    // 인스턴스마다 재질을 복제해야 해서 비싸다.
    root.scale.setScalar(next.presence);

    if (bodyRef.current) {
      // 빠를수록 앞으로 기운다. 정지 상태에서 기울어 있으면 어색하다.
      bodyRef.current.rotation.x = reducedMotion ? 0 : next.lean;
      // 서두를 때 몸을 살짝 늘려 속도감을 준다 (스쿼시 앤 스트레치).
      const stretch = reducedMotion ? 1 : 1 + next.lean * 0.22;
      bodyRef.current.scale.set(1 / stretch, 1, stretch);
    }

    if (ringRef.current) {
      const rate = next.mood === "rush" ? RING_SPIN_RUSH : RING_SPIN_BASE;
      ringSpin.current += rate * dt;
      ringRef.current.rotation.z = ringSpin.current;
      // 공중에서는 고리를 눕혀 "떠오른" 느낌을 준다.
      ringRef.current.rotation.x =
        next.mood === "airborne" ? Math.PI / 2 : Math.PI / 2 + Math.sin(next.bobPhase) * 0.18;
    }

    if (tailRef.current) {
      tailRef.current.visible = !modelShown.current;
      // 꼬리 불꽃은 기울기 반대로 젖혀진다.
      tailRef.current.rotation.x = -next.lean * 1.6;
      const flicker = reducedMotion ? 1 : 1 + Math.sin(next.bobPhase * 3.1) * 0.18;
      tailRef.current.scale.setScalar(flicker);
    }

    // 깜빡임 — 살아 있다는 가장 싼 신호다.
    blinkTimer.current += dt;
    const isBlinking =
      !reducedMotion && blinkTimer.current % BLINK_CYCLE > BLINK_CYCLE - BLINK_DURATION;
    const eyeScaleY = isBlinking ? 0.15 : 1;
    // 공중에 떴을 때 눈을 키워 놀란 표정을 만든다.
    const eyeScale = next.mood === "airborne" ? 1.35 : 1;
    if (eyeLeftRef.current) eyeLeftRef.current.scale.set(eyeScale, eyeScaleY * eyeScale, eyeScale);
    if (eyeRightRef.current)
      eyeRightRef.current.scale.set(eyeScale, eyeScaleY * eyeScale, eyeScale);

    /*
     * 능력 — 도깨비마다 효과가 다르다. 여기서는 빛만 직접 다루고, 전투에
     * 걸리는 배율은 공유 객체에 써 두어 Enemies가 읽어 가게 한다.
     */
    const active = isAbilityActive(next);
    const lightRange = BASE_LIGHT_RANGE * (active ? spirit.effect.lightRangeScale : 1);
    if (lightRef.current) {
      const base = reducedMotion ? 3 : 5;
      const boost = active ? spirit.effect.lightScale : 1;
      lightRef.current.intensity = base * boost * next.presence;
      lightRef.current.distance = lightRange;
    }

    // 해제 중에는 효과도 없다 — 안 보이는 동료가 계속 숨겨 주면 앞뒤가 안 맞는다.
    const applies = active && next.presence > 0.5;
    projectCompanionEffects(effects, next, spirit.effect, slot, applies, lightRange);
  });

  return (
    <group ref={rootRef}>
      <group ref={bodyRef}>
        <CompanionModel
          shape={shape}
          source={state}
          onShown={handleShown}
          fallback={
            <CompanionLantern
              spirit={spirit}
              ringRef={ringRef}
              eyeLeftRef={eyeLeftRef}
              eyeRightRef={eyeRightRef}
            />
          }
        />
      </group>

      {/* 꼬리 불꽃 — 뒤쪽(-z)에 매단다 */}
      <group ref={tailRef} position={[0, -0.12, -0.36]}>
        <mesh geometry={flame} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#ff8a3d" toneMapped={false} transparent opacity={0.75} />
        </mesh>
      </group>

      {/*
       * 주변을 물들이는 빛.
       *
       * 그림자를 만들지 않는다. 그림자 있는 광원을 하나 더 두면 그림자 맵을
       * 매 프레임 다시 그려야 해서 모바일 프레임 예산이 무너진다.
       */}
      <pointLight
        ref={lightRef}
        color={spirit.bodyColor}
        intensity={reducedMotion ? 3 : 5}
        distance={9}
        decay={2}
      />
      <CompanionAbilityVfx source={state} spirit={spirit} reducedMotion={reducedMotion} />
    </group>
  );
}
