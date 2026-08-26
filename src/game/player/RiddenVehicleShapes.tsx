"use client";

/**
 * 조랑말과 장난감 자동차의 **상자 몸** — 모델을 못 받았을 때 서는 것.
 *
 * `RiddenVehicle.tsx`에서 뗐다. 저 파일이 상한에 닿아 있었고, 이 둘은 이제
 * 주 경로가 아니다 — 평소에는 GLB가 뜨고(`RiddenVehicleModel`) 이것은
 * **못 받았을 때만** 나온다. 주가 아닌 것이 파일의 절반을 차지할 이유가 없다.
 *
 * 지오메트리는 부르는 쪽이 만들어 넘긴다. 여기서 만들면 모델이 뜬 판에서도
 * GPU 버퍼를 잡고 있게 된다 — 대체물의 값은 「없을 때 대신 선다」이지
 * 「늘 준비돼 있다」가 아니다.
 */

import type * as THREE from "three";

import { VEHICLE_BODY } from "@/game/player/characterBody";
import { ToonMaterial } from "@/game/scene/ToonMaterial";

const V = VEHICLE_BODY;

/** 장난감 자동차 — 도시 소품 사이에서 눈에 띄는 노랑 */
const CAR = "#f5c542";
const METAL = "#1b1a24";
/** 조랑말 — 제주 조랑말의 갈색 털 */
const PONY_COAT = "#8a5a3b";
/** 갈기와 꼬리. 몸보다 어두워야 실루엣이 나뉜다 */
const PONY_MANE = "#4a2f1e";

/** 바퀴 넷·다리 넷의 자리 — 앞뒤·좌우 */
const LEG_SPOTS: readonly [number, number][] = [
  [-0.18, 0.42],
  [0.18, 0.42],
  [-0.18, -0.42],
  [0.18, -0.42],
];

export interface ToyCarShapeProps {
  geometry: { carBody: THREE.BufferGeometry; carWheel: THREE.BufferGeometry };
}

/** 바퀴 넷이 실루엣을 정한다 */
export function ToyCarShape({ geometry }: ToyCarShapeProps) {
  return (
    <>
      <mesh castShadow geometry={geometry.carBody} position={[0, V.carHeight / 2 + 0.16, 0]}>
        <ToonMaterial color={CAR} />
      </mesh>
      {LEG_SPOTS.map(([side, front], index) => (
        <mesh
          key={index}
          castShadow
          geometry={geometry.carWheel}
          position={[side * 2.4, V.carWheelRadius, front * 1.35]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <ToonMaterial color={METAL} />
        </mesh>
      ))}
    </>
  );
}

export interface PonyShapeProps {
  geometry: {
    ponyBody: THREE.BufferGeometry;
    ponyLeg: THREE.BufferGeometry;
    ponyNeck: THREE.BufferGeometry;
    ponyHead: THREE.BufferGeometry;
  };
  /** 다리 넷을 담을 자리. 부르는 쪽이 매 프레임 돌린다 */
  legs: { current: (THREE.Mesh | null)[] };
}

export function PonyShape({ geometry, legs }: PonyShapeProps) {
  return (
    <>
      <mesh
        castShadow
        geometry={geometry.ponyBody}
        position={[0, V.ponyLegHeight + V.ponyBodyHeight / 2, 0]}
      >
        <ToonMaterial color={PONY_COAT} />
      </mesh>
      {LEG_SPOTS.map(([side, front], index) => (
        <mesh
          key={index}
          castShadow
          ref={(mesh) => {
            legs.current[index] = mesh;
          }}
          geometry={geometry.ponyLeg}
          position={[side, V.ponyLegHeight / 2, front]}
        >
          <ToonMaterial color={PONY_COAT} />
        </mesh>
      ))}
      <mesh
        castShadow
        geometry={geometry.ponyNeck}
        position={[0, V.ponyLegHeight + V.ponyBodyHeight + 0.1, 0.52]}
        rotation={[0.35, 0, 0]}
      >
        <ToonMaterial color={PONY_MANE} />
      </mesh>
      <mesh
        castShadow
        geometry={geometry.ponyHead}
        position={[0, V.ponyLegHeight + V.ponyBodyHeight + 0.3, 0.72]}
      >
        <ToonMaterial color={PONY_COAT} />
      </mesh>
    </>
  );
}
