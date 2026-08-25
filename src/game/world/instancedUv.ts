/**
 * 인스턴스마다 UV를 다르게 주는 장치.
 *
 * `City.tsx`가 800줄 상한에 닿아 떼어 냈다. 이것은 화면 컴포넌트가 아니라
 * **셰이더에 손을 넣는 도구**라 책임이 다르다 — 파사드·간판·아틀라스가
 * 공유한다.
 */

import * as THREE from "three";

/**
 * UV 인스턴스 속성을 붙인다.
 *
 * 속성이 없으면 셰이더가 컴파일되지 않으므로, UV 변형이 필요 없는 경우에도
 * 항등값(scale 1, offset 0)을 넣어 준다.
 */
export function setUvAttributes(
  mesh: THREE.InstancedMesh,
  offsets: Float32Array,
  scales: Float32Array,
): void {
  mesh.geometry.setAttribute("aUvOffset", new THREE.InstancedBufferAttribute(offsets, 2));
  mesh.geometry.setAttribute("aUvScale", new THREE.InstancedBufferAttribute(scales, 2));
}

/**
 * 정점 셰이더에 UV 변환을 주입하는 함수를 만든다.
 *
 * three는 맵마다 varying을 따로 만든다 — map은 `vMapUv`, emissiveMap은
 * `vEmissiveMapUv`다. `vMapUv`만 변환하면 발광 마스크만 타일링이 어긋나
 * 창문 빛이 벽으로 새어 나온 것처럼 보인다. 그래서 쓰는 맵을 명시해 받는다.
 *
 * onBeforeCompile 시점에는 `#include`가 아직 펼쳐지지 않아 셰이더 문자열을
 * 검사해 varying 존재를 알아낼 수 없다. 선언되지 않은 varying에 대입하면
 * 컴파일 오류이므로, 호출부가 어떤 맵을 쓰는지 알려 주는 방식이 유일하다.
 *
 * 모듈 상수로 만들어 둔다 — 렌더마다 새 함수를 넘기면 three가 프로그램을
 * 다시 컴파일한다.
 */
function makeUvTransformInjector(varyings: readonly string[]) {
  const assignments = varyings
    .map((name) => `${name} = ${name} * aUvScale + aUvOffset;`)
    .join("\n");
  return (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 aUvOffset;\nattribute vec2 aUvScale;",
      )
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n${assignments}`);
  };
}

export const injectUvTransform = makeUvTransformInjector(["vMapUv"]);
/** 파사드 전용 — 본 텍스처와 창문 발광 마스크를 같은 UV로 움직인다 */
export const injectUvTransformWithEmissive = makeUvTransformInjector(["vMapUv", "vEmissiveMapUv"]);
