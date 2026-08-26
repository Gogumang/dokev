"use client";

/**
 * 동료의 몸 — GLB.
 *
 * 절차적 등불(`Companion.tsx`의 구 + 부적 고리 + 꼬리 불꽃)을 대신한다.
 * 자리·빛·능력 연출은 `Companion.tsx`가 그대로 들고 있다. 여기는 **몸만**
 * 맡는다 — 대장에서 이미 같은 식으로 갈라 두었다(`combat/BossModel.tsx`).
 *
 * 모델이 없거나 못 받으면 `fallback`이 그대로 선다. 넷 중 로봇이 아직 안 왔고,
 * 그 하나 때문에 자정을 화면에서 빼는 것은 말이 안 된다.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import type { CompanionState } from "@/game/dokebi/companionMotion";
import { isAbilityActive } from "@/game/dokebi/companionMotion";
import {
  COMPANION_HEIGHT,
  COMPANION_MODEL_HEIGHT,
  companionClipFor,
  companionPlaybackRate,
  type CompanionShape,
} from "@/game/dokebi/companionShapes";
import { loadGltf, type LoadedModel } from "@/game/scene/modelCache";
import { createOutline, disposeOutline, paintToon } from "@/game/scene/toonModel";

/** 동작을 바꿀 때 겹치는 시간(초). 걷기↔달리기는 자주 오가므로 짧다 */
const CROSSFADE = 0.18;

export interface CompanionModelProps {
  shape: CompanionShape;
  /** 매 프레임 갱신되는 공유 객체. `Companion.tsx`가 쓰고 여기서 읽는다 */
  source: { readonly current: CompanionState };
  /** 아직 못 받았거나 파일이 없을 때 세울 것 — 등불 몸이다 */
  fallback: ReactNode;
  /** 모델이 실제로 섰는지 알린다. 등불 쪽을 감추는 데 쓴다 */
  onShown: (shown: boolean) => void;
}

export function CompanionModel({ shape, source, fallback, onShown }: CompanionModelProps) {
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef(new Map<string, THREE.AnimationAction>());
  const playing = useRef<string | null>(null);

  useEffect(() => {
    const url = shape.url;
    if (!url) {
      setLoaded(null);
      return;
    }

    let alive = true;
    loadGltf(url).then(
      (model) => {
        if (alive) setLoaded(model);
      },
      // 못 받으면 등불로 남는다. 동료가 사라지는 것보다 낫다
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [shape.url]);

  useEffect(() => {
    onShown(loaded !== null);
    if (!loaded) return;

    const next = new THREE.AnimationMixer(loaded.scene);
    mixer.current = next;
    actions.current = new Map(loaded.clips.map((clip) => [clip.name, next.clipAction(clip)]));
    playing.current = null;

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
      next.stopAllAction();
      mixer.current = null;
      // GLB 씬은 캐시에 남는다 — 떼지 않으면 드나들 때마다 껍데기가 쌓인다
      for (const shell of outlines) disposeOutline(shell);
    };
  }, [loaded, onShown]);

  const scale = useMemo(() => COMPANION_HEIGHT / COMPANION_MODEL_HEIGHT, []);

  useFrame((_, rawDelta) => {
    const active = mixer.current;
    if (!active) return;

    const state = source.current;
    const wanted = companionClipFor(shape, state.mood, isAbilityActive(state));
    const action = wanted ? actions.current.get(wanted) : null;
    if (!action || !wanted) return;

    if (playing.current !== wanted) {
      const previous = playing.current ? actions.current.get(playing.current) : null;
      action.reset();
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      action.play();
      if (previous) previous.crossFadeTo(action, CROSSFADE, false);
      playing.current = wanted;
    }

    /*
     * 발이 땅에 붙어 있어야 한다. 속도와 무관하게 1배로 틀면 느리게 갈 때는
     * 미끄러지고 빠를 때는 종종거린다.
     */
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    action.timeScale = companionPlaybackRate(speed, state.mood);

    active.update(Math.min(rawDelta, MAX_DELTA_SECONDS));
  });

  if (!loaded) return <>{fallback}</>;

  /*
   * 원점이 발밑이다. 자리 계산이 「발이 놓일 곳」을 돌려주므로
   * (`companionMotion`의 `groundLevel`) 여기서 내려 줄 것이 없다.
   */
  return <primitive object={loaded.scene} scale={scale} />;
}
