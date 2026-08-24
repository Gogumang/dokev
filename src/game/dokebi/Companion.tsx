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
 * 도깨비 동료 — 렌더와 애니메이션. 색과 능력은 데리고 다니는 도깨비를 따른다.
 *
 * 실루엣 원칙 (TRAILER 8.2 지원형 동료): 작고, 둥글고, 떠 있고, 스스로 빛난다.
 * 등불 몸통 + 회전하는 부적 고리 + 꼬리 불꽃. 뿔 달린 전통 도깨비를 따라가지
 * 않는 대신, 노을과 골목 어둠 양쪽에서 눈에 띄는 밝은 덩어리를 목표로 했다.
 *
 * 몸통과 눈은 조명을 받지 않는 재질을 쓴다. 스스로 빛나는 존재라는 인상이
 * 흐려지면 그냥 떠다니는 공이 되기 때문이다.
 */

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { COMPANION_BODY } from "@/game/dokebi/companionBody";
import { BASE_LIGHT_RANGE, type DokebiSpirit } from "@/game/dokebi/roster";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import {
  bobOffset,
  createCompanionState,
  isAbilityActive,
  projectCompanionEffects,
  stepCompanion,
  type CompanionCommand,
  type CompanionState,
  type CompanionTarget,
} from "@/game/dokebi/companionMotion";

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
    /** 미니맵이 읽는 동료 위치. 사라져 있으면 companionVisible이 false다 */
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

  const state = useRef<CompanionState>(createCompanionState(target.position, slot));
  const ringSpin = useRef(0);
  const blinkTimer = useRef(0);

  // 지오메트리는 한 번만 만들어 재사용한다. 매 렌더 새로 만들면 GPU 버퍼가 계속 쌓인다.
  const geometry = useMemo(
    () => ({
      body: new THREE.SphereGeometry(COMPANION_BODY.bodyRadius, 16, 12),
      ring: new THREE.TorusGeometry(
        COMPANION_BODY.ringRadius,
        COMPANION_BODY.ringThickness,
        8,
        24,
      ),
      eye: new THREE.SphereGeometry(COMPANION_BODY.eyeRadius, 8, 6),
      flame: new THREE.ConeGeometry(COMPANION_BODY.flameRadius, COMPANION_BODY.flameHeight, 8),
      cap: new THREE.CylinderGeometry(
        COMPANION_BODY.capTopRadius,
        COMPANION_BODY.capBottomRadius,
        COMPANION_BODY.capHeight,
        10,
      ),
    }),
    [],
  );

  /*
   * 언마운트 시 지오메트리를 해제한다.
   *
   * R3F는 씬 그래프에 붙인 객체는 정리하지만 **컴포넌트가 직접 만들어 넘긴
   * 것은 건드리지 않는다.** 해제하지 않으면 /play를 드나들 때마다 GPU 버퍼가
   * 쌓인다. City.tsx가 이미 같은 방식으로 정리하고 있다.
   */
  useLayoutEffect(() => {
    const created = Object.values(geometry);
    return () => {
      for (const item of created) item.dispose();
    };
  }, [geometry]);


  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    const next = stepCompanion(state.current, target, dt, command, spirit.effect, slot);
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
    if (eyeRightRef.current) eyeRightRef.current.scale.set(eyeScale, eyeScaleY * eyeScale, eyeScale);

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
        {/* 등불 몸통 — 스스로 빛나므로 조명을 받지 않는다 */}
        <mesh geometry={geometry.body}>
          <meshBasicMaterial color={spirit.bodyColor} toneMapped={false} />
        </mesh>

        {/* 위쪽 뚜껑 — 등불이라는 신호. 여기만 조명을 받아 입체감을 남긴다 */}
        <mesh geometry={geometry.cap} position={[0, 0.36, 0]}>
          <ToonMaterial color={spirit.accentColor} />
        </mesh>

        {/* 눈 — 앞면(+z)에 둔다. 방향을 읽을 수 있어야 한다 */}
        <mesh ref={eyeLeftRef} geometry={geometry.eye} position={[-0.12, 0.05, 0.3]}>
          <meshBasicMaterial color="#2b2028" toneMapped={false} />
        </mesh>
        <mesh ref={eyeRightRef} geometry={geometry.eye} position={[0.12, 0.05, 0.3]}>
          <meshBasicMaterial color="#2b2028" toneMapped={false} />
        </mesh>

        {/* 부적 고리 — 회전하면서 도깨비라는 인상을 만든다 */}
        <mesh ref={ringRef} geometry={geometry.ring} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial
            color={spirit.accentColor}
            toneMapped={false}
            transparent
            opacity={0.85}
          />
        </mesh>
      </group>

      {/* 꼬리 불꽃 — 뒤쪽(-z)에 매단다 */}
      <group ref={tailRef} position={[0, -0.12, -0.36]}>
        <mesh geometry={geometry.flame} rotation={[Math.PI / 2, 0, 0]}>
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
    </group>
  );
}
