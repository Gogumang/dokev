"use client";

/**
 * 동료 빛에 드러나는 흔적 표식.
 *
 * 도감이 「주변에 숨은 흔적을 잠깐 빛나게 한다」고 약속하는데 흔적은 월드에
 * **아예 그려지지 않았다** — 지도의 마름모와 `T` 판정만 있었다. 능력을 써도
 * 눈앞에서는 아무 일도 없었으니, 도감이 없는 기능을 팔고 있었던 셈이다.
 *
 * 흔적은 셋뿐이라 인스턴싱하지 않는다(절대 규칙 2는 「수십 개」가 기준이다).
 * 대신 지오메트리와 재질을 셋이 나눠 쓰고, 해제도 한 번만 한다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { revealedClues, type CluePoint } from "@/game/quest/clueReveal";

/** 표식 반지름(m). 발밑에서 눈에 띄되 길을 가리지 않는 크기 */
const MARK_RADIUS = 0.7;
/** 바닥에서 띄우는 높이(m). 0이면 바닥과 z-파이팅이 난다 */
const MARK_HEIGHT = 0.05;
/** 지도 범례의 흔적 색과 같다 — 지도에서 본 것을 월드에서 찾는 사람이 헷갈리지 않게 */
const MARK_COLOR = "#ffe27a";
/** 숨 쉬는 주기(rad/s)와 폭. 가만히 있으면 바닥 무늬로 보인다 */
const BREATH_SPEED = 2.4;
const BREATH_AMPLITUDE = 0.18;
const BASE_OPACITY = 0.55;

export interface ClueGlowLink {
  companionX: number;
  companionZ: number;
  /** 동료 빛이 닿는 거리(m). 0이면 능력이 꺼져 있다 */
  companionLightRange: number;
}

export function ClueGlow({
  link,
  clues,
  reducedMotion,
}: {
  link: ClueGlowLink;
  /** 아직 조사하지 않은 흔적만 넘어온다 */
  clues: readonly CluePoint[];
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const breath = useRef(0);

  const geometry = useMemo(() => new THREE.CircleGeometry(MARK_RADIUS, 20), []);

  /*
   * 지오메트리만 직접 만든다. **재질은 JSX로 선언한다** — 그래야 R3F가
   * 정리해 주고, 무엇보다 매 프레임 `opacity`를 바꿀 수 있다(`useMemo`가
   * 돌려준 값은 렌더 뒤에 고칠 수 없다는 린트 규칙에 걸린다).
   *
   * 셋이 각자 재질을 갖게 되지만 표식은 셋뿐이라 값이 싸다.
   */
  useLayoutEffect(() => {
    const created = [geometry];
    return () => {
      for (const item of created) item.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const shown = revealedClues(clues, link.companionX, link.companionZ, link.companionLightRange);

    /*
     * 자식 수는 흔적 수만큼 고정해 두고 보이기만 바꾼다. 매 프레임 만들고
     * 지우면 지오메트리가 쌓이고, 그것이 이 프로젝트가 이미 겪은 누수다.
     */
    group.children.forEach((child, index) => {
      const clue = clues[index];
      const visible = clue !== undefined && shown.includes(clue);
      child.visible = visible;
      if (visible) child.position.set(clue.x, MARK_HEIGHT, clue.z);
    });

    if (reducedMotion) return;
    breath.current += delta * BREATH_SPEED;
    const opacity = BASE_OPACITY + Math.sin(breath.current) * BREATH_AMPLITUDE;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
      if (mat) mat.opacity = opacity;
    }
  });

  return (
    <group ref={groupRef}>
      {clues.map((clue, index) => (
        <mesh
          // 자리마다 하나씩 — 흔적은 셋뿐이고 위치가 고정이라 인덱스로 충분하다
          key={`${clue.x},${clue.z},${index}`}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <meshBasicMaterial
            color={MARK_COLOR}
            transparent
            opacity={BASE_OPACITY}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
