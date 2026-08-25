"use client";

/**
 * 고물 대장의 몸 — GLB.
 *
 * 프리미티브 조합(`bossBody.ts` 치수 + 상자 넷)을 대신한다. 대장은 화면에서
 * 가장 크게 보이는 적이고, 예고 동작이 **게임플레이 그 자체**다 — 팔이 올라가는
 * 1.1초가 피할 때를 아는 유일한 단서다. 상자로는 그 팔이 안 올라간다.
 *
 * 배치·색·연출은 `Boss.tsx`가 그대로 들고 있다. 여기는 **몸만** 맡는다.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { BOSS, type BossPhase } from "@/game/combat/bossSim";
import { BOSS_BODY } from "@/game/combat/bossBody";
import { bossClipFor, bossPlaybackRate, holdsLastFrame } from "@/game/combat/bossClips";
import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { createOutline, disposeOutline, paintToon } from "@/game/scene/toonModel";

const MODEL_URL = "/models/boss-scrap-foreman.glb";

/** 원본 모델의 키(m). 캐릭터와 같은 Meshy 규약이다 */
const MODEL_HEIGHT = 1.7;

/** 동작을 바꿀 때 겹치는 시간(초). 예고는 짧아야 하므로 캐릭터보다 촘촘하다 */
const CROSSFADE = 0.12;

interface Loaded {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** 한 번만 받는다 — 컴포넌트가 다시 마운트돼도 같은 약속을 나눠 쓴다 */
let pending: Promise<Loaded> | null = null;

function loadModel(): Promise<Loaded> {
  pending ??= new Promise<Loaded>((resolve, reject) => {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => resolve({ scene: gltf.scene, clips: gltf.animations }),
      undefined,
      reject,
    );
  });
  return pending;
}

/** 단계가 실제로 지속되는 시간(초). 0이면 동작 길이를 그대로 쓴다 */
function phaseSeconds(phase: BossPhase): number {
  if (phase === "windup") return BOSS.windupSeconds;
  if (phase === "slam") return BOSS.slamSeconds;
  if (phase === "recover") return BOSS.recoverSeconds;
  return 0;
}

export interface BossModelProps {
  /** 매 프레임 갱신되는 공유 객체. `Boss.tsx`가 쓰고 여기서 읽는다 */
  source: { readonly phase: BossPhase };
  /** 아직 못 받았거나 실패했을 때 보여 줄 것 — 상자 몸이 그대로 선다 */
  fallback: ReactNode;
}

export function BossModel({ source, fallback }: BossModelProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef(new Map<string, THREE.AnimationAction>());
  const playing = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadModel().then(
      (model) => {
        if (alive) setLoaded(model);
      },
      // 못 받으면 상자 몸으로 남는다. 대장이 사라지는 것보다 낫다
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
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
  }, [loaded]);

  const scale = useMemo(() => BOSS_BODY.height / MODEL_HEIGHT, []);

  useFrame((_, rawDelta) => {
    const active = mixer.current;
    if (!active) return;

    const phase = source.phase;
    const wanted = bossClipFor(phase);
    const action = actions.current.get(wanted);
    if (!action) return;

    if (playing.current !== wanted) {
      const previous = playing.current ? actions.current.get(playing.current) : null;
      action.reset();

      if (holdsLastFrame(wanted)) {
        /*
         * 쓰러짐은 한 번만 재생하고 그 자리에 머문다. 반복하면 넘어진 대장이
         * 25초 동안 계속 다시 넘어진다.
         */
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }

      action.play();
      if (previous) previous.crossFadeTo(action, CROSSFADE, false);
      playing.current = wanted;
    }

    /*
     * 예고는 **정확히 예고 시간 동안** 팔이 올라가야 한다. 동작이 그보다 길면
     * 다 올라가기도 전에 판정이 오고, 짧으면 팔을 든 채로 기다린다 — 둘 다
     * 「보고 피한다」를 무너뜨린다.
     */
    action.timeScale = bossPlaybackRate(action.getClip().duration, phaseSeconds(phase));

    active.update(Math.min(rawDelta, MAX_DELTA_SECONDS));
  });

  if (!loaded) return <>{fallback}</>;

  // 모델은 발바닥이 원점이다. 대장 그룹의 원점도 발밑이라 그대로 얹는다
  return <primitive object={loaded.scene} scale={scale} />;
}
