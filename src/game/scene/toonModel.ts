/**
 * GLB를 이 도시의 룩으로 갈아입히는 일 — 툰 재질·림라이트·외곽선.
 *
 * `CharacterModel.tsx`에만 있던 것을 뺐다. 대장도 GLB가 되면서 **두 벌이 될
 * 참**이었고, 그러면 한쪽만 고쳐지는 날이 온다 — 주인공은 셀 셰이딩인데 대장만
 * 매끈해지는 식으로. 이 저장소가 여러 번 겪은 모양이다.
 *
 * three를 가져오는 순수 모듈이라 `tests/architecture.test.ts`의 예외 목록에
 * 적혀 있다. 재질과 지오메트리를 직접 만드는 일이라 렌더러 없이는 뜻이 없다.
 */

import * as THREE from "three";

import { getToonGradientTexture } from "@/game/world/textures";

/**
 * GLB의 재질을 셀 셰이딩으로 갈아 끼운다.
 *
 * 이름이 `paint…`로 시작하는 이유: 넘겨받은 것을 고치는 함수는 이 저장소에서
 * 정해진 동사로 시작해야 한다(`tests/stateBoundaries.test.ts`). 캔버스에 긋는
 * 것과 재질을 칠하는 것은 같은 일이다 — 받은 것에 색을 입힌다.
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
export function paintToon(mesh: THREE.Mesh): void {
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
export function createOutline(mesh: THREE.Mesh): THREE.Mesh {
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
 * 외곽선 껍데기를 뗀다.
 *
 * GLB 씬은 모듈 캐시에 남아 다음 입장에서 그대로 쓰인다. 떼지 않으면 `/play`를
 * 드나들 때마다 껍데기가 한 겹씩 쌓인다 — 화면은 멀쩡하고(같은 자리에 겹치니까)
 * 드로우콜만 조용히 늘어난다.
 *
 * 만든 곳과 놓는 곳을 **같은 파일에 둔다.** 캐릭터와 대장이 각자 놓고 있었는데,
 * 그러면 셋째가 붙을 때 또 각자 적게 되고 그중 하나가 빠지는 날이 온다.
 */
export function disposeOutline(shell: THREE.Mesh): void {
  shell.removeFromParent();
  (shell.material as THREE.Material).dispose();
}
