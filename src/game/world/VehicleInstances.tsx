"use client";

/**
 * 한 차종을 인스턴싱으로 세운다 — 배경 차량의 **모양** 쪽.
 *
 * 주행은 `Traffic.tsx`가 한다. 여기는 자세 배열을 읽어 행렬만 쓴다. 둘을 가른
 * 이유는 차종이 셋이 되면서다: 한 배열로 도는 주행과 차종별로 갈라지는 그리기가
 * 한 반복문 안에 있으면, 차종을 하나 더 들일 때 주행 코드를 건드리게 된다.
 *
 * GLB 하나에 메시가 하나뿐이라(반입 때 확인했다) 드로우콜은 차종당 둘이다 —
 * 차체와 전조등.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { mixHex } from "@/game/core/color";
import { loadGltf } from "@/game/scene/modelCache";
import { paintToon } from "@/game/scene/toonModel";
import type { CarPose, VehicleModel } from "@/game/world/trafficFleet";
import { tintForTone } from "@/game/world/trafficFleet";

/** 꺼진 전조등 — 낮에는 그냥 유리 렌즈다 */
const BEAM_OFF_COLOR = "#8f939c";
/** 켜진 전조등 */
const BEAM_LIT_COLOR = "#fff3d0";
/** 코끝에서 이 비율만큼 안으로 들여 박는다 */
const BEAM_INSET = 0.94;

interface InstanceSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** GLB 안 노드의 변환. 인스턴스 행렬 뒤에 곱한다 */
  offset: THREE.Matrix4;
}

/**
 * 씬에서 지오메트리·재질·노드 변환을 꺼낸다.
 *
 * `InstancedMesh`는 노드를 안 보고 지오메트리만 가져간다. 그런데 반입 때
 * `quantize`를 걸어서 **실제 크기가 노드 배율에 들어 있다**(정점은 정수 1.8배).
 * 그대로 넘기면 차가 손톱만 해진다.
 *
 * 그래서 노드 변환을 따로 들고 나와 매 프레임 인스턴스 행렬 뒤에 곱한다.
 *
 * 처음에는 지오메트리를 복제해 `applyMatrix4`로 **정점에 구웠다.** 화면에서
 * 차가 갈가리 찢어졌다 — `applyMatrix4`는 변환한 실수를 원래 배열에 도로 쓰는데
 * 그 배열이 정규화된 Int16이라, 1.68 같은 값이 1로 잘려 정점이 한 점으로
 * 뭉쳤다. 오류는 나지 않았다. 정수로 저장된 지오메트리는 **건드리지 않는 것이
 * 맞다** — 곱셈 한 번이 프레임당 서른여섯 번인데, 그것이 정확하기까지 하다.
 *
 * 주소마다 한 번만 한다. `loadGltf`가 씬을 캐시하므로 여기도 같이 캐시하지
 * 않으면 `/play`를 드나들 때마다 같은 것을 다시 뒤진다.
 */
const sources = new Map<string, InstanceSource>();

function instanceSource(url: string, scene: THREE.Group): InstanceSource | null {
  const cached = sources.get(url);
  if (cached) return cached;

  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const mesh = meshes[0];
  if (!mesh) return null;

  paintToon(mesh);
  const result = {
    geometry: mesh.geometry,
    material: mesh.material as THREE.Material,
    offset: mesh.matrixWorld.clone(),
  };
  sources.set(url, result);
  return result;
}

export interface VehicleInstancesProps {
  model: VehicleModel;
  /** 이 차종이 맡은 차들의 자리 — `partitionFleet`이 나눈 결과 */
  slots: readonly number[];
  /** 차종에 상관없이 한 배열이다. 주행 쪽이 매 프레임 고쳐 쓴다 */
  poses: readonly CarPose[];
  /** 차마다 곱할 색을 고르는 값 */
  tones: readonly number[];
  /** 밤 조명 세기(0~1) */
  glow: number;
}

export function VehicleInstances({ model, slots, poses, tones, glow }: VehicleInstancesProps) {
  const [body, setBody] = useState<InstanceSource | null>(null);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const beamRef = useRef<THREE.InstancedMesh>(null);
  const count = Math.max(1, slots.length);

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      one: new THREE.Vector3(1, 1, 1),
      /*
       * 차폭의 절반 남짓, 얇게. 예전 상자 차에서는 이것이 **전조등 그 자체**라
       * 넓고 두꺼웠는데(0.82×0.16), 모델에는 전조등이 이미 그려져 있다. 여기
       * 남은 일은 밤에 그 자리를 빛나게 하는 것뿐이라, 크면 낮에 회색 판이
       * 차 앞에 떠 있는 것으로 보인다 — 실제로 그렇게 보였다.
       */
      beamScale: new THREE.Vector3(model.width * 0.5, 0.11, 0.1),
    }),
    [model],
  );

  useEffect(() => {
    let alive = true;
    loadGltf(model.url).then(
      (loaded) => {
        const result = instanceSource(model.url, loaded.scene);
        if (alive && result) setBody(result);
      },
      // 못 받으면 그 차종만 안 보인다. 나머지 둘은 그대로 달린다
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [model.url]);

  // 색은 바뀌지 않는다 — 매 프레임 올리는 것은 행렬뿐이다
  useEffect(() => {
    const mesh = bodyRef.current;
    if (!mesh || !body) return;
    const color = new THREE.Color();
    slots.forEach((car, index) => {
      color.set(tintForTone(tones[car] ?? 0));
      mesh.setColorAt(index, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [body, slots, tones]);

  useFrame(() => {
    const mesh = bodyRef.current;
    const beam = beamRef.current;
    if (!mesh || !body) return;

    const nose = model.length / 2;
    for (let index = 0; index < slots.length; index += 1) {
      const pose = poses[slots[index]];
      if (!pose?.visible) {
        mesh.setMatrixAt(index, scratch.hidden);
        if (beam) beam.setMatrixAt(index, scratch.hidden);
        continue;
      }

      scratch.quaternion.setFromAxisAngle(scratch.up, pose.yaw);
      scratch.position.set(pose.x, pose.y, pose.z);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.one);
      scratch.matrix.multiply(body.offset);
      mesh.setMatrixAt(index, scratch.matrix);

      if (beam) {
        // yaw가 곧 진행 방향이라 sin/cos가 코앞을 가리킨다. 살짝 안쪽에 둬서
        // 차체에 박히게 한다 — 코끝에 정확히 두면 앞으로 튀어나온 판이 된다
        scratch.position.set(
          pose.x + Math.sin(pose.yaw) * nose * BEAM_INSET,
          pose.y + model.beamY,
          pose.z + Math.cos(pose.yaw) * nose * BEAM_INSET,
        );
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.beamScale);
        beam.setMatrixAt(index, scratch.matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (beam) beam.instanceMatrix.needsUpdate = true;
  });

  if (!body) return null;

  return (
    <group>
      {/*
        frustumCulled를 끈다. InstancedMesh 경계구는 한 번 계산 후 캐시되는데
        차량은 매 프레임 움직여 캐시가 곧 틀린 값이 된다 (Crowd.tsx와 같은 이유).

        그림자를 만들지 않는다 — 그림자 맵은 매 프레임 다시 그려지므로 움직이는
        캐스터를 늘리면 그림자 패스가 그대로 무거워지고, 배경 차량이 낼 값이 아니다.
      */}
      <instancedMesh
        ref={bodyRef}
        args={[body.geometry, body.material, count]}
        frustumCulled={false}
      />

      {/* 전조등 — 조명을 받지 않는다. 밤에는 색이 밝아져 스스로 빛나 보인다 */}
      <instancedMesh ref={beamRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={mixHex(BEAM_OFF_COLOR, BEAM_LIT_COLOR, glow)}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
