"use client";

/**
 * 지붕 메시 — 박공과 기와.
 *
 * `City.tsx`가 800줄 상한을 넘어 떼어 냈다. 상한이 「이 묶음은 다른 책임인가」를
 * 묻게 했고 답은 그렇다였다: 도시의 나머지는 전부 **상자 인스턴스**인데, 지붕은
 * 둘 다 **직접 만든 지오메트리**다. 인스턴스 하나의 모양은 묶음마다 하나뿐이라
 * 도형이 다르면 묶음이 갈리고, 그래서 지붕만 컴포넌트가 따로 있다.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { QualityPreset } from "@/game/systems/quality";
import type { BoxInstance } from "@/game/world/cityLayout";
import { projectInstances } from "@/game/world/instances";
import { getToonGradientTexture } from "@/game/world/textures";

/**
 * 박공지붕 지오메트리 — 단위 크기(1×1×1) 삼각기둥.
 *
 * 인스턴스가 크기를 곱하므로 여기서는 **모양만** 정한다. 용마루는 x축을 따라
 * 뻗고, 깊은 건물은 배치에서 90° 돌려 쓴다(`roofs.ts`).
 *
 * 밑면은 만들지 않는다 — 건물 꼭대기에 얹히므로 보이지 않고, 삼각형만 는다.
 */
function createGableGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  // 밑면 네 귀퉁이와 용마루 두 끝
  const a = [-0.5, -0.5, -0.5];
  const b = [0.5, -0.5, -0.5];
  const c = [0.5, -0.5, 0.5];
  const d = [-0.5, -0.5, 0.5];
  const ridgeLeft = [-0.5, 0.5, 0];
  const ridgeRight = [0.5, 0.5, 0];

  const positions = [
    // 뒤쪽 물매 (z-)
    ...a, ...b, ...ridgeRight,
    ...a, ...ridgeRight, ...ridgeLeft,
    // 앞쪽 물매 (z+)
    ...c, ...d, ...ridgeLeft,
    ...c, ...ridgeLeft, ...ridgeRight,
    // 좌우 박공 삼각형
    ...d, ...a, ...ridgeLeft,
    ...b, ...c, ...ridgeRight,
  ];

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 모임지붕 지오메트리 — 단위 크기(1×1×1). 네 면이 모두 물매다.
 *
 * 박공은 양 끝이 수직 삼각형(박공면)인데, 모임지붕은 그 면까지 눕는다.
 * 용마루가 짧아지고 네 귀퉁이에서 추녀가 모여 **위에서 눌린 사다리꼴**
 * 실루엣이 된다 — 한옥 지붕이 무겁게 앉아 보이는 이유다.
 *
 * 용마루를 x축 안쪽으로 당겨(±0.25) 짧게 만든다. 0.5까지 밀면 박공과 같아진다.
 */
function createHipGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  const a = [-0.5, -0.5, -0.5];
  const b = [0.5, -0.5, -0.5];
  const c = [0.5, -0.5, 0.5];
  const d = [-0.5, -0.5, 0.5];
  const ridgeLeft = [-0.25, 0.5, 0];
  const ridgeRight = [0.25, 0.5, 0];

  const positions = [
    // 뒤쪽 물매 (z-)
    ...a, ...b, ...ridgeRight,
    ...a, ...ridgeRight, ...ridgeLeft,
    // 앞쪽 물매 (z+)
    ...c, ...d, ...ridgeLeft,
    ...c, ...ridgeLeft, ...ridgeRight,
    // 좌우 추녀 — 박공면 대신 이쪽도 눕는다
    ...d, ...a, ...ridgeLeft,
    ...b, ...c, ...ridgeRight,
  ];

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 기와 색.
 *
 * 청회색 한 계열로 좁게 묶는다. 주택가 지붕(`ROOF_PALETTE`)은 여섯 색이 섞여
 * 「제각각 고쳐 온 동네」로 보이는데, 옛 마을은 반대로 **한 시기에 한 손으로
 * 올린 것**처럼 보여야 한다. 색이 흩어지면 그 인상이 사라진다.
 */
const HANOK_ROOF_PALETTE = ["#3d4450", "#474e5a", "#343a45"];

/** 옛 마을의 기와지붕. */
export function HanokRoofs({ items, quality }: { items: readonly BoxInstance[]; quality: QualityPreset }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createHipGeometry(), []);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  useLayoutEffect(() => {
    if (meshRef.current) projectInstances(meshRef.current, items, HANOK_ROOF_PALETTE);
  }, [items]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, items.length]}
      castShadow={quality.shadows}
      receiveShadow={quality.shadows}
    >
      <meshToonMaterial gradientMap={toonGradient} />
    </instancedMesh>
  );
}

/**
 * 지붕 색.
 *
 * 한국 주택가의 지붕은 대체로 청록·붉은 기와·회색 슬레이트다. 파사드 톤 수와
 * 맞출 필요는 없다 — 같은 벽에 다른 지붕이 얹히는 편이 오히려 동네처럼 보인다.
 */
const ROOF_PALETTE = ["#3f7f86", "#a8503f", "#6a6f78", "#4a6b4f", "#8a6a45", "#5a6a8a"];

/** 저층 건물에 얹는 박공지붕. */
export function Roofs({ items, quality }: { items: readonly BoxInstance[]; quality: QualityPreset }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createGableGeometry(), []);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  useLayoutEffect(() => {
    if (meshRef.current) projectInstances(meshRef.current, items, ROOF_PALETTE);
  }, [items]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, items.length]}
      castShadow={quality.shadows}
      receiveShadow={quality.shadows}
    >
      <meshToonMaterial gradientMap={toonGradient} />
    </instancedMesh>
  );
}
