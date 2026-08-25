"use client";

/**
 * GLB 캐릭터.
 *
 * 이 프로젝트는 오래 **외부 에셋 없이** 굴러왔고(전부 코드로 만든 상자였다),
 * 캐릭터 하나만 예외로 들인다. 사람 몸은 상자로 흉내 내기 가장 어려운 것이라
 * 여기서 얻는 것이 가장 크다.
 *
 * 받는 동안에는 **기존 절차적 캐릭터가 그대로 보인다.** 화면이 비면 「깨졌나」
 * 싶고, 네트워크가 느린 사람에게는 그 시간이 길다. 실패해도 마찬가지다 —
 * 캐릭터는 없으면 게임이 성립하지 않는 **핵심**이라 대체물이 있어야 한다.
 *
 * 무엇을 재생할지는 `characterClips.ts`가 정한다. 여기서는 **정해진 것을 트는
 * 일만** 한다.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS, PLAYER_HEIGHT } from "@/game/config/tuning";
import { loadGltf, type LoadedModel } from "@/game/scene/modelCache";
import { createOutline, disposeOutline, paintToon } from "@/game/scene/toonModel";
import {
  CLIP,
  clipFor,
  freezes,
  holdsLastFrame,
  playbackRate,
  type ClipInput,
} from "@/game/player/characterClips";

/** 파일이 놓인 자리 */
const MODEL_URL = "/character.glb";

/** 원본 모델의 키(m). 게임의 `PLAYER_HEIGHT`에 맞추는 데 쓴다 */
const MODEL_HEIGHT = 1.7;

/** 동작을 바꿀 때 겹치는 시간(초). 0이면 툭툭 끊긴다 */
const CROSSFADE = 0.18;

export interface CharacterModelProps {
  /** 매 프레임 갱신되는 공유 객체 — 씬이 쓰고 여기서 읽는다 */
  motion: ClipInput;
  /** 아직 못 받았거나 실패했을 때 보여 줄 것 */
  fallback: ReactNode;
  /**
   * 얼마나 진하게 보일지(0~1). 매 프레임 갱신되는 공유 객체다.
   *
   * 카메라가 벽에 밀려 플레이어에게 붙으면 씬이 이 값을 낮춘다 — 캐릭터가
   * 사라지면서 앞이 보인다. 매 프레임 setState를 하지 않으려고 객체를
   * 공유한다(이 저장소의 규칙).
   */
  fade?: { value: number };
}
/**
 * 씬의 모든 재질에 투명도를 먹인다.
 *
 * `transparent`는 **켜고 끄는 순간에만** 바꾼다 — 그 값이 바뀌면 three가
 * 셰이더를 다시 컴파일한다. 외곽선 껍데기는 자기 유니폼으로 받는다.
 */
function applyAlpha(scene: THREE.Object3D, alpha: number, previous: number): void {
  const crossed = alpha < 1 !== previous < 1;

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const material = mesh.material as THREE.Material & {
      uniforms?: { outlineAlpha?: { value: number } };
    };
    if (material.uniforms?.outlineAlpha) material.uniforms.outlineAlpha.value = alpha;

    material.opacity = alpha;
    if (crossed) {
      material.transparent = alpha < 1;
      material.needsUpdate = true;
    }
    // 완전히 사라진 것은 그림자도 드리우지 않는다 — 없는 것의 그림자가 남는다
    mesh.castShadow = mesh.castShadow && alpha > 0.02;
  });
}

export function CharacterModel({ motion, fallback, fade }: CharacterModelProps) {
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef(new Map<string, THREE.AnimationAction>());
  const playing = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadGltf("/character.glb")
      .then((model) => {
        if (alive) setLoaded(model);
      })
      .catch(() => {
        // 캐릭터가 없어도 게임은 돌아야 한다 — 대체물이 그대로 남는다
      });
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

    /*
     * 먼저 모으고 나서 손댄다.
     *
     * `traverse` 도중에 자식을 붙이면 방금 붙인 것까지 순회해 외곽선의
     * 외곽선을 만든다 — 그대로 두면 무한히 늘어난다.
     */
    const meshes: THREE.Mesh[] = [];
    loaded.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });

    const outlines: THREE.Mesh[] = [];
    for (const mesh of meshes) {
      mesh.castShadow = true;
      // 그림자를 받지는 않는다 — 자기 몸에 진 그림자가 저해상도에서 지저분하다
      mesh.receiveShadow = false;
      paintToon(mesh);

      const shell = createOutline(mesh);
      mesh.add(shell);
      outlines.push(shell);
    }

    return () => {
      next.stopAllAction();
      mixer.current = null;

      /*
       * 외곽선은 뗀다.
       *
       * GLB 씬은 모듈 캐시에 남아 다음 입장에서 그대로 쓰인다. 떼지 않으면
       * /play를 드나들 때마다 껍데기가 한 겹씩 쌓인다 — 화면은 멀쩡하고
       * (같은 자리에 겹치니까) 드로우콜만 조용히 늘어난다.
       *
       * 재질은 껍데기와 함께 만들었으므로 함께 놓는다. 반면 본체의 툰 재질은
       * 놓지 않는다 — 캐시된 씬이 계속 들고 있어야 하고, 놓으면 다음 입장에서
       * 해제된 재질을 쓰게 된다.
       */
      for (const shell of outlines) disposeOutline(shell);
    };
  }, [loaded]);

  const scale = useMemo(() => PLAYER_HEIGHT / MODEL_HEIGHT, []);
  /** 지금 재질에 들어가 있는 값. 바뀔 때만 다시 쓴다 */
  const appliedAlpha = useRef(1);

  useFrame((_, rawDelta) => {
    /*
     * 흐리게 하기.
     *
     * 재질을 뒤지는 것은 **값이 바뀔 때만** 한다. 매 프레임 `transparent`를
     * 건드리면 three가 셰이더를 다시 컴파일해 프레임이 끊긴다.
     */
    const wantedAlpha = fade ? fade.value : 1;
    if (loaded && Math.abs(wantedAlpha - appliedAlpha.current) > 0.002) {
      applyAlpha(loaded.scene, wantedAlpha, appliedAlpha.current);
      appliedAlpha.current = wantedAlpha;
    }

    const active = mixer.current;
    if (!active) return;

    const wanted = clipFor(motion);
    const action = actions.current.get(wanted);
    if (!action) return;

    if (playing.current !== wanted) {
      const previous = playing.current ? actions.current.get(playing.current) : null;
      action.reset();

      if (holdsLastFrame(wanted)) {
        /*
         * 끝 자세에서 멈추는 동작이다. 「일어서기」는 **끝에서야** 서 있는
         * 모습이라, 가만히 있을 때는 그 자리로 바로 보내야 한다 — 안 그러면
         * 서 있는 사람이 계속 바닥에서 일어난다.
         */
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        /*
         * 「가만히 있기」는 **끝 자세로 바로 보낸다.** 처음부터 재생하면 서 있는
         * 사람이 바닥에서 일어나는 그림이 1초쯤 나온다.
         *
         * 「쓰러짐」은 처음부터 재생해야 한다 — 쓰러지는 과정이 보여야 한다.
         */
        if (wanted === CLIP.idle) action.time = action.getClip().duration;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }

      action.play();
      if (previous) previous.crossFadeTo(action, CROSSFADE, false);
      playing.current = wanted;
    }

    /*
     * 멈춰 세울 때는 **재생 속도를 0으로** 둔다. `paused`를 쓰면 섞는 중에도
     * 멈춰 다음 동작으로 넘어가지 못한다.
     */
    action.timeScale = freezes(motion) ? 0 : playbackRate(motion);

    active.update(Math.min(rawDelta, MAX_DELTA_SECONDS));
  });

  if (!loaded) return <>{fallback}</>;

  /*
   * 모델은 발바닥이 원점이고 키가 1.7m다. 게임의 캐릭터는 1.5m이므로 줄인다.
   *
   * **발밑으로 내린다.** 이 그룹의 원점은 플레이어의 **가운데**다(씬이 위치에
   * `PLAYER_HEIGHT / 2`를 더해 놓는다). 절차적 캐릭터는 안에서 스스로 상쇄해
   * 그 규칙을 지키는데, 이 모델은 발바닥이 원점이라 그대로 두면 **키의 절반만큼
   * 공중에 뜬다.** 붙였을 때 이 보정을 빠뜨렸다.
   *
   * **돌리지 않는다.** 이 모델의 정면은 이미 +Z이고, 게임의 0도도 +Z다.
   *
   * 오랫동안 `rotation={[0, Math.PI, 0]}`이 붙어 있었다. 주석에는 "모델 정면이
   * -Z라 안 돌리면 뒤로 달린다"고 적혀 있었는데, **지금 모델에서는 그 보정이
   * 오히려 뒤로 달리게 만든다** — 캐릭터가 늘 자기 등 방향으로 걸었다.
   * 앞으로 갈 때는 얼굴이 이쪽을 보고, 뒤로 갈 때는 등을 보인 채 다가온다.
   * 「뒤로 가면 사람이 안 돌아선다」로 보이던 것의 정체가 이것이다.
   *
   * 브라우저에서 확인했다: 리로드 직후 정지 상태에서 W를 누르면, 보정이 있을
   * 때는 **얼굴**이, 없을 때는 **등**이 보인다(카메라 반대쪽으로 가므로 등이
   * 맞다). 모델을 다시 뽑으면(`scripts/build-character.mjs`) 축이 또 바뀔 수
   * 있으니, 바꿀 때는 이 확인을 반드시 다시 한다.
   */
  return <primitive object={loaded.scene} scale={scale} position={[0, -PLAYER_HEIGHT / 2, 0]} />;
}
