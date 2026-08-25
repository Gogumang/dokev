"use client";

/**
 * 포토 필터 오버레이.
 *
 * 카메라 바로 앞에 사각형 하나를 띄워 색을 얹는다. 후처리 패스가 아니라
 * 씬의 일부이므로 사진 저장에도 그대로 남고, 실패해도 화면이 검게 나가지 않는다.
 *
 * 깊이 판정을 끄고 렌더 순서를 마지막으로 밀어 항상 맨 위에 오게 한다.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { PhotoFilter } from "@/game/systems/photoFilter";
import { getFilterTexture } from "@/game/world/textures";

/** 카메라에서 얼마나 앞에 둘지(m). near(0.1)보다 커야 잘리지 않는다 */
const OVERLAY_DISTANCE = 0.3;

export function FilterOverlay({ filter }: { filter: PhotoFilter }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const texture = useMemo(
    () => getFilterTexture(filter.id, filter.center, filter.edge),
    [filter.id, filter.center, filter.edge],
  );
  const forward = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.quaternion.copy(camera.quaternion);
    camera.getWorldDirection(forward);
    mesh.position.copy(camera.position).addScaledVector(forward, OVERLAY_DISTANCE);

    /*
     * 화면을 정확히 덮는 크기를 매 프레임 다시 잰다. fov는 속도에 따라 변하고
     * 창 크기도 바뀐다 — 한 번만 재면 필터가 화면 일부만 덮는다.
     */
    if (camera instanceof THREE.PerspectiveCamera) {
      const height = 2 * OVERLAY_DISTANCE * Math.tan((camera.fov * Math.PI) / 360);
      // 여유를 조금 준다. 딱 맞추면 반올림 때문에 가장자리에 실선이 보인다.
      mesh.scale.set(height * camera.aspect * 1.02, height * 1.02, 1);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={999} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
