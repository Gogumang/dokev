"use client";

/*
 * 월드 조명.
 *
 * `City.tsx`가 800줄 상한을 넘어 분리했다. 조명은 도시 배치와 책임이 다르다 —
 * 배치는 무엇이 어디에 서는지를, 조명은 그것이 어떻게 보이는지를 정한다.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { QualityPreset } from "@/game/systems/quality";
import { sunPosition, type TimeOfDayPreset } from "@/game/world/timeOfDay";

/**
 * 카메라 쪽에서 비추는 보조광.
 *
 * 다른 광원은 전부 월드 고정 방향이다. 그래서 플레이어가 어느 쪽을 보느냐에
 * 따라 **카메라가 보는 면이 통째로 죽는다** — 밤에 후드와 먼 보도블록의
 * 명암비가 1.03이었다(브라우저에서 실측). 3인칭이라 늘 등을 보는데, 그 등이
 * 배경과 구분되지 않으면 자기 캐릭터를 놓친다.
 *
 * 그림자를 만들지 않는다. 카메라와 같은 방향이라 그림자가 물체 뒤로 숨어
 * 보이지도 않으면서 그림자 맵 비용만 늘어난다.
 */
function CameraFill({ intensity, color }: { intensity: number; color: string }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ camera }) => {
    const light = lightRef.current;
    if (!light) return;

    light.position.copy(camera.position);
    // 카메라가 보는 방향 앞쪽을 겨눈다 — 위치만 맞추면 방향이 원점으로 쏠린다
    camera.getWorldDirection(target.position);
    target.position.multiplyScalar(20).add(camera.position);
    target.updateMatrixWorld();
  });

  return (
    <>
      <directionalLight ref={lightRef} intensity={intensity} color={color} target={target} />
      <primitive object={target} />
    </>
  );
}

/**
 * 해가 플레이어에서 얼마나 떨어져 뜨는지(m).
 *
 * 그림자 카메라 near/far가 이 거리를 감싸야 한다. 가까우면 높은 건물이
 * near 앞으로 나와 그림자가 잘리고, 멀면 깊이 정밀도만 버린다.
 */
const SUN_DISTANCE = 120;

export function WorldLighting({
  quality,
  worldHalfExtent,
  preset,
  viewer,
}: {
  quality: QualityPreset;
  worldHalfExtent: number;
  preset: TimeOfDayPreset;
  /** 그림자를 따라다니게 할 기준 — 플레이어 */
  viewer: { position: { x: number; y: number; z: number } };
}) {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  // 해의 방향만 쓴다. 거리는 SUN_DISTANCE가 정한다 — 그림자 카메라와 짝이다.
  const sun = sunPosition(preset, SUN_DISTANCE);

  /*
   * 그림자 카메라를 플레이어 위로 옮긴다.
   *
   * **텍셀 단위로 끊어서** 옮겨야 한다. 연속적으로 따라가면 매 프레임 그림자
   * 맵의 표본 위치가 미세하게 달라져 그림자 가장자리가 끓는다(shimmer).
   * 카메라가 항상 텍셀 격자 위에 있으면 같은 곳을 같은 표본으로 그린다.
   */
  useFrame(() => {
    const light = sunRef.current;
    if (!light || !quality.shadows) return;

    const texel = (quality.shadowRadius * 2) / quality.shadowMapSize;
    const centerX = Math.round(viewer.position.x / texel) * texel;
    const centerZ = Math.round(viewer.position.z / texel) * texel;

    target.position.set(centerX, 0, centerZ);
    target.updateMatrixWorld();
    light.position.set(centerX + sun.x, sun.y, centerZ + sun.z);
  });

  return (
    <>
      {/* 하늘빛(위)과 지면 반사광(아래)을 나눠 넣어 단조로운 평면 조명을 피한다 */}
      <hemisphereLight
        args={[preset.hemisphereSky, preset.hemisphereGround, preset.hemisphereIntensity]}
      />
      <primitive object={target} />
      <directionalLight
        ref={sunRef}
        position={[sun.x, sun.y, sun.z]}
        intensity={preset.sunIntensity}
        color={preset.sunColor}
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-camera-left={-quality.shadowRadius}
        shadow-camera-right={quality.shadowRadius}
        shadow-camera-top={quality.shadowRadius}
        shadow-camera-bottom={-quality.shadowRadius}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2}
        shadow-bias={-0.0012}
        target={target}
      />
      {/* 반대편 약한 보조광 — 그림자 쪽이 완전히 죽지 않게 한다 */}
      <directionalLight
        position={[-sun.x, worldHalfExtent * 0.4, -sun.z]}
        intensity={preset.fillIntensity}
        color={preset.fillColor}
      />
      {/* 낮에는 필요 없다 — 세기가 0이면 광원 자체를 달지 않는다 */}
      {preset.cameraFillIntensity > 0 && (
        <CameraFill intensity={preset.cameraFillIntensity} color={preset.fillColor} />
      )}
    </>
  );
}
