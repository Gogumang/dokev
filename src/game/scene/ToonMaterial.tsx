"use client";

/**
 * 공용 셀 셰이딩 재질.
 *
 * 도시는 이미 `meshToonMaterial`을 쓰는데 캐릭터·적·차량·시민은 Lambert였다.
 * 같은 화면 안에서 음영 단수가 다르면 **소품이 다른 게임에서 온 것처럼 뜬다**
 * — City.tsx가 그 점을 주석에 적어 두고도 액터 쪽에는 적용하지 못한 상태였다.
 *
 * 그라데이션 맵을 컴포넌트가 들고 있으므로 호출부는 색만 넘기면 된다. 파일마다
 * `getToonGradientTexture()`를 부르고 useMemo로 감싸는 코드를 여덟 번 반복하지
 * 않는다.
 *
 * Toon은 Lambert와 같은 난반사 계산에 계단만 씌운 것이라 비용이 사실상 같다.
 */

import { useMemo } from "react";
import type { ThreeElements } from "@react-three/fiber";

import { getToonGradientTexture } from "@/game/world/textures";

export function ToonMaterial(props: ThreeElements["meshToonMaterial"]) {
  const gradientMap = useMemo(() => getToonGradientTexture(), []);
  return <meshToonMaterial gradientMap={gradientMap} {...props} />;
}
