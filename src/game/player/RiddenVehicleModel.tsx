"use client";

/**
 * 타는 것의 몸 — GLB.
 *
 * 조랑말과 장난감 자동차를 상자 조합에서 모델로 바꾼다. 둘 다 **아이가 올라타
 * 화면 가운데에 오는 것**이라 실루엣이 가장 크게 읽히는데, 원통 넷에 상자
 * 하나로는 「말」도 「차」도 아니었다.
 *
 * 대장·동료와 같은 구조다(`BossModel`·`CompanionModel`) — 배치와 연출은
 * `RiddenVehicle.tsx`가 그대로 들고 있고 여기는 **몸만** 맡는다. 다른 점은
 * 하나: 이 둘은 **동작이 없다.** 그래서 믹서도 시계도 없다.
 *
 * 못 받으면 상자 몸이 그대로 선다. 타고 있는데 발밑이 비는 것보다 낫다.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";

import { loadGltf, type LoadedModel } from "@/game/scene/modelCache";
import { createOutline, disposeOutline, paintToon } from "@/game/scene/toonModel";

export interface RiddenVehicleModelProps {
  /** `public/` 아래 경로 */
  url: string;
  /**
   * 이 높이(m)에 맞춘다.
   *
   * 길이가 아니라 **높이**를 기준으로 잡는다. 아이는 타는 것 위에 **정해진
   * 높이로** 앉으므로, 모델이 그보다 크면 아이가 그 안에 파묻힌다 — 실제로
   * 두 원본 모두 세로가 크다(여우 1.84m, 카트 1.43m). 길이로 맞추면 여우가
   * 1.69m가 되어 1.5m인 아이보다 커진다.
   */
  heightMeters: number;
  /** 아직 못 받았거나 실패했을 때 — 상자 몸이 그대로 선다 */
  fallback: ReactNode;
}

export function RiddenVehicleModel({ url, heightMeters, fallback }: RiddenVehicleModelProps) {
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);

  useEffect(() => {
    let alive = true;
    loadGltf(url).then(
      (model) => {
        if (alive) setLoaded(model);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!loaded) return;

    // 먼저 모으고 나서 손댄다 — 순회 중에 붙이면 외곽선의 외곽선이 생긴다
    const meshes: THREE.Mesh[] = [];
    loaded.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });

    const outlines: THREE.Mesh[] = [];
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      paintToon(mesh);
      const shell = createOutline(mesh);
      mesh.add(shell);
      outlines.push(shell);
    }

    return () => {
      // GLB 씬은 캐시에 남는다 — 떼지 않으면 드나들 때마다 껍데기가 쌓인다
      for (const shell of outlines) disposeOutline(shell);
    };
  }, [loaded]);

  /**
   * 실제 크기에서 뽑는다.
   *
   * 원본의 크기를 상수로 적어 두지 않는 이유: 모델을 다시 받으면 그 숫자가
   * 조용히 틀려지고, 틀린 줄은 **화면에서 크기가 어긋나야** 안다. 여기서 재면
   * 파일이 바뀌어도 따라간다.
   */
  const scale = useMemo(() => {
    if (!loaded) return 1;
    const size = new THREE.Box3().setFromObject(loaded.scene).getSize(new THREE.Vector3());
    return size.y > 1e-4 ? heightMeters / size.y : 1;
  }, [loaded, heightMeters]);

  if (!loaded) return <>{fallback}</>;

  // 모델의 원점은 바닥이다. 타는 것 그룹의 원점도 땅이라 그대로 얹는다
  return <primitive object={loaded.scene} scale={scale} />;
}
