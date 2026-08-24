"use client";

/**
 * 하늘 돔.
 *
 * 예전에는 `<color attach="background">` 한 색이 전부였다. 색을 아무리 잘
 * 골라도 단색 하늘은 **칠한 판**으로 보인다 — 위아래 밝기 차이도, 구름도
 * 없으니 거리감이 생기지 않는다. 이 화면과 참고하는 카툰 렌더의 차이 중
 * 큰 하나가 여기였다.
 *
 * 카메라를 따라다니는 구를 안쪽에서 본다. 월드에 고정하면 반지름을 도시보다
 * 크게 잡아야 하는데, 그러면 카메라 far(안개 거리 + 60)에 잘려 하늘이
 * 사라진다. 따라다니면 반지름은 아무래도 좋다.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { tintRatio } from "@/game/core/color";
import { getSkyTexture } from "@/game/world/skyTexture";
import type { TimeOfDayPreset } from "@/game/world/timeOfDay";

/**
 * 돔 반지름을 안개 거리의 몇 배로 잡을지.
 *
 * **카메라 far 평면 안에 들어와야 한다.** far는 `안개 거리 + 60`이므로 1을
 * 넘기지 않으면 안전하다.
 *
 * 처음에 500m로 박아 두었다가 하늘이 한 픽셀도 안 나왔다. 깊이 판정을 꺼
 * 두었으니 가려질 리 없다고 생각했는데, **잘린 것은 깊이가 아니라 클립
 * 공간**이었다 — far 밖의 정점은 깊이 판정에 도달하기도 전에 버려진다.
 * 화면에는 배경색만 남아서, 돔이 "안 그려진" 것이 아니라 "하늘색이 원래
 * 저렇다"로 보였다.
 *
 * 깊이를 쓰지 않고 가장 먼저 그리므로 실제 거리는 아무 의미가 없다. 무엇이든
 * 이 위에 덮인다.
 */
const DOME_RADIUS_SCALE = 0.6;

/**
 * 하늘이 구역 색을 따라가는 세기(0~1).
 *
 * 안개보다 **약하게** 민다. 안개는 먼 것을 덮는 막이라 색이 통째로 바뀌어도
 * 되지만, 하늘 텍스처에는 시간대의 그라데이션과 구름이 구워져 있어서 세게
 * 밀면 그 결이 뭉개진다. 0.55는 「지평선에서 안개와 하늘이 같은 계열로
 * 보이되, 위쪽 그라데이션은 남는」 자리다.
 */
const ZONE_TINT_STRENGTH = 0.55;

export function SkyDome({
  preset,
  viewDistance,
}: {
  preset: TimeOfDayPreset;
  /** 안개가 완전히 덮는 거리(m). 카메라 far가 여기서 나온다 */
  viewDistance: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  /*
   * 시간대 색을 담아 둘 그릇. 매 프레임 새 Color를 만들면 60fps에서 초당
   * 예순 개가 쓰레기로 쌓인다.
   */
  const base = useMemo(() => new THREE.Color(), []);
  const texture = useMemo(
    () => getSkyTexture(preset.skyTop, preset.sky, preset.cloudiness),
    [preset.skyTop, preset.sky, preset.cloudiness],
  );

  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ camera, scene }) => {
    // 위치만 따라간다. 회전까지 따라가면 고개를 돌릴 때 구름이 같이 돌아
    // 하늘이 머리에 붙어 있는 것처럼 보인다.
    meshRef.current?.position.copy(camera.position);

    /*
     * 구역 색을 **안개에서 빌려 온다.**
     *
     * `ZoneAtmosphere`가 이미 구역에 맞춰 안개 색을 부드럽게 옮기고 있다.
     * 같은 계산을 여기서 한 번 더 하면 두 값이 갈라지고, 갈라지는 순간
     * **지평선에서 하늘과 안개가 다른 색**이 되어 이음매가 드러난다.
     * 빌려 오면 그럴 수가 없다.
     *
     * 그대로 곱하지는 않는다 — 텍스처에 시간대 색이 이미 구워져 있어
     * 같은 색이 두 번 곱해진다(`tintRatio` 주석).
     */
    const material = materialRef.current;
    const fog = scene.fog;
    if (!material || !(fog instanceof THREE.Fog)) return;

    base.set(preset.sky);
    const tint = tintRatio(base, fog.color, ZONE_TINT_STRENGTH);
    material.color.setRGB(tint.r, tint.g, tint.b);
  });

  return (
    <mesh
      ref={meshRef}
      /*
       * 가장 먼저, 깊이를 쓰지 않고 그린다.
       *
       * 배경이므로 무엇에도 가려질 필요가 없고 무엇도 가려서는 안 된다.
       * 깊이 판정을 켜 두면 far 평면 근처에서 잘려 하늘에 구멍이 뚫린다.
       */
      renderOrder={-1000}
      frustumCulled={false}
    >
      <sphereGeometry args={[viewDistance * DOME_RADIUS_SCALE, 32, 16]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        side={THREE.BackSide}
        depthTest={false}
        depthWrite={false}
        // 안개를 받으면 하늘이 안개색 한 장으로 덮여 그라데이션이 사라진다
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}
