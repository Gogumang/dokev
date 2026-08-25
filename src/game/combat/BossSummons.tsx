"use client";

/**
 * 보스전에 불려 나온 도깨비들과 능력 자국.
 *
 * `Boss.tsx`에서 뗐다 — 저기는 **대장**을 그리는 곳이고 이건 그 앞에 선
 * 동료들이다. 한 파일에 있으면 「대장의 몸」과 「우리 편」이 섞인다.
 *
 * 슬롯을 미리 잡아 두고 안 쓰는 것은 숨긴다. 소환할 때마다 메시를 만들면
 * 보스전 한복판에서 지오메트리를 올리게 되고, 그 순간이 곧 프레임 끊김이다.
 */

import * as THREE from "three";

import { DOKEBI_ORDER } from "@/game/dokebi/roster";
import { roleForDokebi, type SummonRole } from "@/game/combat/summonSim";

const SUMMON_COLOR: Record<SummonRole, string> = {
  mark: "#ffe066",
  lure: "#9b8aa6",
  mend: "#5ad2ff",
  burst: "#ff7ad9",
};

export interface BossSummonsProps {
  geometry: { orb: THREE.BufferGeometry; burst: THREE.BufferGeometry };
  ringTexture: THREE.Texture;
  orbRefs: { current: (THREE.Mesh | null)[] };
  burstRefs: { current: (THREE.Mesh | null)[] };
}

export function BossSummons({ geometry, ringTexture, orbRefs, burstRefs }: BossSummonsProps) {
  return (
    <>
      {/*
    부른 도깨비와 능력 자국.
    슬롯을 미리 잡아 두고 안 쓰는 것은 숨긴다 — 소환할 때마다 메시를 만들면
    보스전 한복판에서 지오메트리를 올리게 되고, 그 순간이 곧 프레임 끊김이다.
  */}
      {DOKEBI_ORDER.map((id, slot) => {
        const color = SUMMON_COLOR[roleForDokebi(id)];
        return (
          <group key={id}>
            <mesh
              ref={(mesh) => {
                orbRefs.current[slot] = mesh;
              }}
              geometry={geometry.orb}
              visible={false}
            >
              {/* 스스로 빛나는 존재다 — 조명을 받으면 그냥 떠다니는 공이 된다 */}
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <mesh
              ref={(mesh) => {
                burstRefs.current[slot] = mesh;
              }}
              geometry={geometry.burst}
              visible={false}
            >
              <meshBasicMaterial
                map={ringTexture}
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
