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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MAX_DELTA_SECONDS, PLAYER_HEIGHT } from "@/game/config/tuning";
import { getToonGradientTexture } from "@/game/world/textures";
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

interface Loaded {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/**
 * 한 번만 받는다.
 *
 * 컴포넌트가 다시 마운트돼도(포토 모드 전환 등) 같은 약속을 나눠 쓴다 —
 * 매번 받으면 1MB를 여러 번 받는다.
 */
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
 * GLB의 재질을 셀 셰이딩으로 갈아 끼운다.
 *
 * 모델은 Meshy가 만든 PBR(MeshStandardMaterial)이다. 도시는 4단 셀 셰이딩인데
 * 주인공만 매끈하게 음영이 지면, 셋 중 **주인공이 다른 게임에서 온 것처럼**
 * 보인다 — 3인칭이라 그 차이가 화면 한가운데에 늘 떠 있다.
 *
 * 텍스처(map)는 그대로 물려받는다. 얼굴·옷 무늬가 거기 들어 있어서, 색만
 * 옮기면 캐릭터가 단색 인형이 된다.
 *
 * 원본 재질은 여기서 놓는다. 갈아 끼우고 나면 아무도 참조하지 않는데,
 * GLB는 한 번만 로드해 계속 쓰므로 놓지 않으면 그대로 남는다.
 */
function toonify(mesh: THREE.Mesh): void {
  const source = mesh.material;
  if (Array.isArray(source) || !(source instanceof THREE.MeshStandardMaterial)) return;

  const toon = new THREE.MeshToonMaterial({
    map: source.map,
    color: source.color,
    gradientMap: getToonGradientTexture(),
    // 스킨드 메시라 skinning은 three가 지오메트리를 보고 스스로 켠다
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    side: source.side,
  });
  applyRimLight(toon);

  mesh.material = toon;
  source.dispose();
}

/**
 * 가장자리 빛(림라이트).
 *
 * 시선과 거의 나란한 면일수록 밝아진다. 콘셉트 아트에서 캐릭터가 둥글게
 * 보이는 이유의 절반이 이것이고, 셀 셰이딩으로 음영이 계단이 된 뒤에는
 * **실루엣을 살려 주는 거의 유일한 수단**이 된다.
 *
 * 함수를 모듈 상수로 두지 않고 매번 새로 만들면 three가 프로그램을 다시
 * 컴파일한다. 재질을 만들 때 한 번만 부르므로 여기서는 문제가 없다.
 */
function applyRimLight(material: THREE.MeshToonMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(RIM_COLOR) };
    shader.uniforms.rimStrength = { value: RIM_STRENGTH };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 rimColor;
        uniform float rimStrength;`,
      )
      /*
       * 마지막 합성 직전에 더한다. 안개보다 앞이어야 먼 캐릭터에서 가장자리만
       * 안개를 뚫고 빛나는 일이 없다.
       *
       * chunk 이름이 `output_fragment`가 아니라 **`opaque_fragment`** 다
       * (three r152에서 바뀌었다). 옛 이름을 쓰면 `replace`가 조용히 아무것도
       * 안 하고 넘어간다 — 셰이더는 멀쩡히 컴파일되고 림라이트만 사라진다.
       * three를 올릴 때 다시 바뀔 수 있어서, `tests/actorToon.test.ts`가
       * **three의 실제 toon 셰이더에 이 chunk가 있는지** 대조한다.
       */
      .replace(
        "#include <opaque_fragment>",
        `float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
        outgoingLight += rimColor * pow(rim, 3.0) * rimStrength;
        #include <opaque_fragment>`,
      );
  };
}

/** 가장자리 빛 색 — 하늘빛을 반사하는 셈이라 차갑다 */
const RIM_COLOR = "#cfe6ff";
/** 세기. 넘기면 캐릭터가 형광 윤곽선을 두른 것처럼 보인다 */
const RIM_STRENGTH = 0.45;

/**
 * 외곽선 두께(모델 좌표계).
 *
 * 모델 키가 1.7이고 화면에서 300px 남짓이므로 0.012면 두어 픽셀이다. 굵히면
 * 손가락처럼 가는 부분이 선에 먹혀 뭉개진다.
 */
const OUTLINE_WIDTH = 0.012;

/** 외곽선 색. 순수 검정은 밤에 하늘과 붙어 실루엣이 사라진다 (buildingEdges와 같은 이유) */
const OUTLINE_COLOR = "#241d33";

/*
 * 외곽선 셰이더 — 정점을 노멀 방향으로 밀어낸 복제본의 **뒷면**을 그린다.
 *
 * 건물에서는 이 기법이 통하지 않았다(buildingEdges.ts 주석). 껍데기의 뒷면이
 * 물체 **뒤쪽 깊이**에 찍히는데, 건물은 땅에 박혀 있고 서로 붙어 서 있어
 * 그 자리가 바닥과 옆 건물에 가려지기 때문이다.
 *
 * 캐릭터는 다르다. 공중에 떠 있는 독립된 덩어리라 실루엣 바깥이 배경이고,
 * 껍데기의 뒷면이 그대로 보인다. 같은 기법이 한쪽에서만 통하는 이유가 이것이다.
 *
 * 스키닝 chunk를 직접 넣는다 — 뼈를 따라 움직이지 않으면 선만 T포즈로 남는다.
 */
const OUTLINE_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  uniform float outlineWidth;

  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    transformed += objectNormal * outlineWidth;

    #include <project_vertex>
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 outlineColor;
  uniform float outlineAlpha;

  void main() {
    gl_FragColor = vec4(outlineColor, outlineAlpha);
    #include <colorspace_fragment>
  }
`;

/**
 * 메시에 붙일 외곽선 껍데기를 만든다.
 *
 * 스킨드 메시는 **같은 스켈레톤에 다시 묶어야** 한다. 지오메트리만 공유하면
 * 뼈 정보가 없어 원점에 T포즈로 서 있는 검은 덩어리가 하나 생긴다.
 *
 * 자식으로 붙이므로 부모의 변환을 그대로 따라간다.
 */
function createOutline(mesh: THREE.Mesh): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    uniforms: {
      outlineWidth: { value: OUTLINE_WIDTH },
      outlineColor: { value: new THREE.Color(OUTLINE_COLOR) },
      outlineAlpha: { value: 1 },
    },
    // 앞면까지 그리면 캐릭터가 통째로 검은 실루엣이 된다
    side: THREE.BackSide,
  });

  if (mesh instanceof THREE.SkinnedMesh) {
    const shell = new THREE.SkinnedMesh(mesh.geometry, material);
    shell.bind(mesh.skeleton, mesh.bindMatrix);
    // 껍데기가 그림자를 드리우면 원본보다 큰 그림자가 생겨 발이 떠 보인다
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.frustumCulled = false;
    return shell;
  }

  const shell = new THREE.Mesh(mesh.geometry, material);
  shell.castShadow = false;
  shell.receiveShadow = false;
  return shell;
}

/**
 * 씬의 모든 재질에 투명도를 먹인다.
 *
 * `transparent`는 **켜고 끄는 순간에만** 바꾼다 — 그 값이 바뀌면 three가
 * 셰이더를 다시 컴파일한다. 외곽선 껍데기는 자기 유니폼으로 받는다.
 */
function applyAlpha(scene: THREE.Object3D, alpha: number, previous: number): void {
  const crossed = (alpha < 1) !== (previous < 1);

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
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const mixer = useRef<THREE.AnimationMixer | null>(null);
  const actions = useRef(new Map<string, THREE.AnimationAction>());
  const playing = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadModel()
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
      toonify(mesh);

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
      for (const shell of outlines) {
        shell.removeFromParent();
        (shell.material as THREE.Material).dispose();
      }
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
  return (
    <primitive object={loaded.scene} scale={scale} position={[0, -PLAYER_HEIGHT / 2, 0]} />
  );
}
