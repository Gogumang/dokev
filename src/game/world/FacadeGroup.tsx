"use client";

/**
 * 건물 파사드 묶음.
 *
 * `City.tsx`가 800줄 상한에 닿아 떼어 냈다. 상한이 「이 묶음은 다른 책임인가」를
 * 묻게 했고 답은 그렇다였다 — 나머지는 소품을 상자로 흩뿌리는 일인데, 이것은
 * **텍스처 반복 배율을 인스턴스마다 계산해 넣는** 한 가지 일만 한다.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { QualityPreset } from "@/game/systems/quality";
import type { BoxInstance } from "@/game/world/cityLayout";
import { injectUvTransformWithEmissive, setUvAttributes } from "@/game/world/instancedUv";
import { projectInstances, WHITE_PALETTE } from "@/game/world/instances";
import {
  FACADE_CELL_HEIGHT,
  FACADE_CELL_WIDTH,
  getFacadeEmissiveTexture,
  getFacadeTexture,
  getToonGradientTexture,
} from "@/game/world/textures";

export /**
 * 파사드 텍스처를 입힌 건물 한 톤 묶음.
 *
 * 반복 횟수를 정수로 반올림하므로 건물 크기가 달라도 창이 모서리에서 잘리지
 * 않는다. 건물의 폭과 깊이가 같게 생성되므로 네 옆면 모두 같은 배율을 쓴다.
 */
function FacadeGroup({
  items,
  toneIndex,
  quality,
  nightGlow,
}: {
  items: readonly BoxInstance[];
  toneIndex: number;
  quality: QualityPreset;
  /** 창문 발광 세기(0~1). 시간대에서 온다 */
  nightGlow: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => getFacadeTexture(toneIndex), [toneIndex]);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);
  // 마스크는 시간대와 무관하게 같다. 세기만 바꿔 셰이더 재컴파일을 피한다.
  const emissiveMask = useMemo(() => getFacadeEmissiveTexture(), []);

  const uv = useMemo(() => {
    const offsets = new Float32Array(items.length * 2);
    const scales = new Float32Array(items.length * 2);
    items.forEach((item, index) => {
      scales[index * 2] = Math.max(1, Math.round(item.width / FACADE_CELL_WIDTH));
      scales[index * 2 + 1] = Math.max(1, Math.round(item.height / FACADE_CELL_HEIGHT));
    });
    return { offsets, scales };
  }, [items]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // 톤이 이미 텍스처에 들어 있으므로 인스턴스 색은 흰색으로 통일한다.
    projectInstances(mesh, items, WHITE_PALETTE);
    setUvAttributes(mesh, uv.offsets, uv.scales);
  }, [items, uv]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={quality.shadows}
      receiveShadow={quality.shadows}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial
        map={texture}
        gradientMap={toonGradient}
        emissive="#ffd9a0"
        emissiveMap={emissiveMask}
        emissiveIntensity={nightGlow}
        onBeforeCompile={injectUvTransformWithEmissive}
      />
    </instancedMesh>
  );
}
