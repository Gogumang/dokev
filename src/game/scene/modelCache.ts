/**
 * GLB를 받는 **유일한** 자리.
 *
 * 처음에는 캐릭터 하나뿐이라 그 파일 안에 로더가 있었고, 검사가
 * 「이 파일에서만 받는다」로 그것을 지켰다. 대장이 붙으면서 둘이 됐고 차량까지
 * 오면 셋이 된다 — 그렇게 늘어나면 「적어 둔 곳에서만」은 **적는 습관**이지
 * 규칙이 아니게 된다. CSP(`connect-src 'self'`) 약속도 같이 흐려진다.
 *
 * 받는 곳을 하나로 되돌린다. 무엇을 받을지는 부르는 쪽이 정하고, **어떻게**
 * 받는지는 여기만 안다.
 *
 * three를 가져오는 순수 모듈이라 `tests/architecture.test.ts`의 예외 목록에
 * 적혀 있다 — 로더는 렌더러 없이는 뜻이 없다.
 */

import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/**
 * 주소마다 한 번만 받는다.
 *
 * 컴포넌트가 다시 마운트돼도(포토 모드 전환, `/play` 재입장) 같은 약속을
 * 나눠 쓴다 — 매번 받으면 같은 파일을 여러 번 받는다.
 */
const pending = new Map<string, Promise<LoadedModel>>();

export function loadGltf(url: string): Promise<LoadedModel> {
  const cached = pending.get(url);
  if (cached) return cached;

  const promise = new Promise<LoadedModel>((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve({ scene: gltf.scene, clips: gltf.animations }),
      undefined,
      reject,
    );
  });
  pending.set(url, promise);
  return promise;
}
