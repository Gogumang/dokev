"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 * 문의 충돌 상자와 안내는 useFrame 안에서 공유 객체를 직접 갱신한다.
 * setState로 옮기면 문 앞을 지날 때마다 초당 60회 리렌더가 발생한다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 빛으로 여는 문 — 렌더와 판정 연결.
 *
 * 규칙은 `spiritGates.ts`에 있고 여기는 **그 결과를 세 곳으로 흘려보낸다:**
 * 충돌 상자(막힘), 재질(보임), 안내 객체(알림). 셋 중 하나라도 빠지면 문이
 * 조용히 그림이 된다 — 이 저장소에서 여러 번 겪은 실패다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Aabb } from "@/game/player/locomotion";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { CITY } from "@/game/world/cityLayout";
import {
  GATE_HEIGHT,
  GATE_THICKNESS,
  gateCollider,
  isGateOpen,
  nearestGate,
  SPIRIT_GATES,
} from "@/game/world/spiritGates";
import { terrainHeight } from "@/game/world/terrain";

/** HUD가 읽는 문 상태. 문 앞이 아니면 `name`이 null이다 */
export interface GateView {
  name: string | null;
  line: string;
  open: boolean;
  /** 얼마나 더 밝아야 하는지(m). 이미 열렸으면 0 */
  shortfall: number;
}

export function createGateView(): GateView {
  return { name: null, line: "", open: false, shortfall: 0 };
}

/** 닫힌 문의 색 — 도깨비불처럼 푸르다 */
const CLOSED_COLOR = "#6ad7ff";
/** 열린 문은 거의 사라진다. 완전히 0으로 두지 않는 이유는 「거기 문이 있었다」가 남아야 해서다 */
const OPEN_OPACITY = 0.12;
const CLOSED_OPACITY = 0.62;

export function SpiritGates({
  link,
  boxes,
  view,
  reducedMotion,
}: {
  /** 플레이어 자리와 지금 동료 빛이 닿는 거리를 읽는다 */
  link: { position: { x: number; z: number }; companionLightRange: number };
  /**
   * 이 문들이 막는 자리. **바깥에서 만들어 넘긴 배열을 제자리에서 고친다** —
   * 플레이어 충돌이 같은 배열을 보고 있어야 문이 실제로 길을 막는다.
   */
  boxes: Aabb[];
  view: GateView;
  reducedMotion: boolean;
}) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  const geometries = useMemo(
    () =>
      SPIRIT_GATES.map((gate) =>
        gate.axis === "x"
          ? new THREE.BoxGeometry(CITY.roadWidth, GATE_HEIGHT, GATE_THICKNESS)
          : new THREE.BoxGeometry(GATE_THICKNESS, GATE_HEIGHT, CITY.roadWidth),
      ),
    [],
  );

  /*
   * R3F는 씬에 붙인 것은 정리하지만 **직접 만들어 넘긴 지오메트리는 그대로
   * 둔다.** /play를 드나들 때마다 GPU 버퍼가 쌓인다.
   */
  useLayoutEffect(() => {
    return () => {
      for (const geometry of geometries) geometry.dispose();
    };
  }, [geometries]);

  useFrame(({ clock }) => {
    const px = link.position.x;
    const pz = link.position.z;
    const lightRange = link.companionLightRange;

    for (let i = 0; i < SPIRIT_GATES.length; i += 1) {
      const gate = SPIRIT_GATES[i];
      const open = isGateOpen(gate, px, pz, lightRange);

      // 충돌 상자를 **제자리에서** 고친다. 새 객체를 넣으면 배열을 공유하는
      // 쪽이 낡은 상자를 계속 본다.
      const next = gateCollider(gate, open);
      const box = boxes[i];
      box.minX = next.minX;
      box.maxX = next.maxX;
      box.minZ = next.minZ;
      box.maxZ = next.maxZ;
      box.top = next.top;

      const mesh = meshes.current[i];
      if (!mesh) continue;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.opacity = open ? OPEN_OPACITY : CLOSED_OPACITY;
      /*
       * 닫힌 문은 천천히 숨 쉰다. 가만히 있는 판은 벽으로 읽히고, 벽 앞에서는
       * 아무도 능력을 켜 보지 않는다. 저감 모션이면 흔들지 않는다.
       */
      const breath = reducedMotion || open ? 0 : Math.sin(clock.elapsedTime * 1.6 + i) * 0.06;
      mesh.scale.set(1, 1 + breath, 1);
    }

    /* ---------------- 안내 ---------------- */
    const near = nearestGate(px, pz);
    if (near === null) {
      view.name = null;
      view.line = "";
      view.open = false;
      view.shortfall = 0;
      return;
    }
    const open = isGateOpen(near, px, pz, lightRange);
    view.name = near.name;
    view.line = near.line;
    view.open = open;
    view.shortfall = open ? 0 : near.requiredLightRange - lightRange;
  });

  return (
    <group>
      {SPIRIT_GATES.map((gate, index) => (
        <mesh
          key={gate.id}
          ref={(mesh) => {
            meshes.current[index] = mesh;
          }}
          geometry={geometries[index]}
          position={[gate.x, terrainHeight(gate.x, gate.z) + GATE_HEIGHT / 2, gate.z]}
        >
          <ToonMaterial color={CLOSED_COLOR} transparent opacity={CLOSED_OPACITY} />
        </mesh>
      ))}
    </group>
  );
}
