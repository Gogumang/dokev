"use client";

/**
 * 등불 몸 — 모델이 없을 때 서는 것.
 *
 * 동료는 원래 전부 이것이었다. 구 + 뚜껑 + 눈 + 도는 부적 고리. 곰·검은 고양이·
 * 버섯이 모델로 들어오면서 셋은 이 자리를 떠났고, 아직 안 온 로봇(자정)과
 * **모델을 못 받은 경우**가 여기 남는다 — 파일 하나 때문에 동료가 화면에서
 * 사라지는 것보다 낫다.
 *
 * `Companion.tsx`에서 뗀 이유는 저쪽이 300줄 상한에 걸려서인데, 자를 자리는
 * 원래 여기였다: 저쪽은 자리·빛·능력을 계산하고 여기는 모양만 만든다.
 *
 * 도는 것과 깜빡이는 것은 여전히 `Companion.tsx`가 프레임마다 쓴다. 그래서
 * ref를 받는다 — 상태를 둘로 나누면 한쪽만 갱신되는 날이 온다.
 */

import { useLayoutEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";

import { COMPANION_BODY } from "@/game/dokebi/companionBody";
import type { DokebiSpirit } from "@/game/dokebi/roster";
import { ToonMaterial } from "@/game/scene/ToonMaterial";

export interface CompanionLanternProps {
  spirit: DokebiSpirit;
  /** 도는 부적 고리 */
  ringRef: RefObject<THREE.Mesh | null>;
  eyeLeftRef: RefObject<THREE.Mesh | null>;
  eyeRightRef: RefObject<THREE.Mesh | null>;
}

export function CompanionLantern({
  spirit,
  ringRef,
  eyeLeftRef,
  eyeRightRef,
}: CompanionLanternProps) {
  // 지오메트리는 한 번만 만들어 재사용한다. 매 렌더 새로 만들면 GPU 버퍼가 계속 쌓인다.
  const geometry = useMemo(
    () => ({
      body: new THREE.SphereGeometry(COMPANION_BODY.bodyRadius, 16, 12),
      ring: new THREE.TorusGeometry(COMPANION_BODY.ringRadius, COMPANION_BODY.ringThickness, 8, 24),
      eye: new THREE.SphereGeometry(COMPANION_BODY.eyeRadius, 8, 6),
      cap: new THREE.CylinderGeometry(
        COMPANION_BODY.capTopRadius,
        COMPANION_BODY.capBottomRadius,
        COMPANION_BODY.capHeight,
        10,
      ),
    }),
    [],
  );

  /*
   * 언마운트 시 지오메트리를 해제한다.
   *
   * R3F는 씬 그래프에 붙인 객체는 정리하지만 **컴포넌트가 직접 만들어 넘긴
   * 것은 건드리지 않는다.** 해제하지 않으면 /play를 드나들 때마다 GPU 버퍼가
   * 쌓인다. City.tsx가 이미 같은 방식으로 정리하고 있다.
   */
  useLayoutEffect(() => {
    const created = Object.values(geometry);
    return () => {
      for (const item of created) item.dispose();
    };
  }, [geometry]);

  return (
    <>
      {/* 등불 몸통 — 스스로 빛나므로 조명을 받지 않는다 */}
      <mesh geometry={geometry.body}>
        <meshBasicMaterial color={spirit.bodyColor} toneMapped={false} />
      </mesh>

      {/* 위쪽 뚜껑 — 등불이라는 신호. 여기만 조명을 받아 입체감을 남긴다 */}
      <mesh geometry={geometry.cap} position={[0, 0.36, 0]}>
        <ToonMaterial color={spirit.accentColor} />
      </mesh>

      {/* 눈 — 앞면(+z)에 둔다. 방향을 읽을 수 있어야 한다 */}
      <mesh ref={eyeLeftRef} geometry={geometry.eye} position={[-0.12, 0.05, 0.3]}>
        <meshBasicMaterial color="#2b2028" toneMapped={false} />
      </mesh>
      <mesh ref={eyeRightRef} geometry={geometry.eye} position={[0.12, 0.05, 0.3]}>
        <meshBasicMaterial color="#2b2028" toneMapped={false} />
      </mesh>

      {/* 부적 고리 — 회전하면서 도깨비라는 인상을 만든다 */}
      <mesh ref={ringRef} geometry={geometry.ring} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial
          color={spirit.accentColor}
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>
    </>
  );
}
