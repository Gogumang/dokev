"use client";

/**
 * 해안의 부두와 낚시 — 렌더와 배선.
 *
 * 규칙은 `systems/fishing.ts`가, 배치는 `world/pier.ts`가 들고 있다. 여기서는
 * **부두 끝에 서 있는지**를 보고 그 둘을 이어 준다.
 *
 * 물(`Sea.tsx`)과 나눈 이유: 저쪽은 배경이고 이쪽은 **눌러서 반응하는 것**이다.
 * 한 파일에 두면 배경을 고칠 때마다 상호작용이 딸려 온다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { consumeInteract } from "@/game/scene/interactionStep";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import {
  castLine,
  createFishing,
  pullLine,
  stepFishing,
  type FishingState,
} from "@/game/systems/fishing";
import { buildPier, PIER, pierDeckY, pierTip } from "@/game/world/pier";
import { SEA_LEVEL } from "@/game/world/terrain";

/** 부두 나무색 하나. 널판과 기둥이 같은 색이어야 조립 장난감으로 안 보인다 */
const WOOD = "#8a6440";

/** 찌 색. 물 위에서 눈에 걸려야 하므로 이 화면에서 유일하게 튀는 색이다 */
const BOBBER = "#ff6b4a";

/** 부두 끝에서 이 거리 안이면 던질 수 있다(m) */
const REACH = 3.4;

/** 찌가 뜨는 자리 — 부두 끝에서 바다 쪽으로 조금 더 나간다(m) */
const CAST_AHEAD = 3.2;

/** 잠길 때 찌가 내려가는 깊이(m) */
const DIP = 0.42;

/** 찌가 물결에 오르내리는 속도(rad/s). 예전 `performance.now() / 620`을 초로 옮긴 값 */
const DRIFT_RATE = 1 / 0.62;

export function Pier({
  halfExtent,
  link,
}: {
  halfExtent: number;
  /** 플레이어 자리. 부두 끝에 서 있는지 본다 */
  link: { position: { x: number; z: number }; interactPressed: boolean };
}) {
  const bobber = useRef<THREE.Mesh>(null);
  const fishing = useRef<FishingState>(createFishing());
  /*
   * 찌가 물결에 얹혀 흔들린 시간(초).
   *
   * `performance.now()`를 직접 봤다. 화면에서는 똑같지만 **같은 판을 두 번
   * 돌려도 찌가 다른 자리에 있다** — 시연 영상을 프레임 단위로 뽑을 때
   * 그 한 줄이 재생을 결정적이지 않게 만든다.
   */
  const drifted = useRef(0);

  const boxes = useMemo(() => buildPier(halfExtent), [halfExtent]);
  const deckY = useMemo(() => pierDeckY(halfExtent), [halfExtent]);
  const tip = useMemo(() => pierTip(halfExtent), [halfExtent]);

  const geometry = useMemo(
    () => ({
      plank: new THREE.BoxGeometry(1, 1, 1),
      bobber: new THREE.SphereGeometry(PIER.bobberRadius, 8, 6),
    }),
    [],
  );

  useLayoutEffect(
    () => () => {
      geometry.plank.dispose();
      geometry.bobber.dispose();
    },
    [geometry],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    drifted.current += dt;
    const atTip = Math.hypot(link.position.x - tip.x, link.position.z - tip.z) <= REACH;

    /*
     * 상호작용 키는 `interactionStep`이 소비하고, **대상이 없을 때만** 이리로
     * 넘어온다. 그 통로의 소비처가 하나여야 한다는 규칙을 지키는 방식이다 —
     * 부두가 직접 큐를 비우면 주민과 같은 누름을 둘이 가져간다.
     *
     * 넘어온 신호는 여기서 비운다. 안 비우면 매 프레임 다시 들어와 던지자마자
     * 당기게 된다.
     */
    const pressed = consumeInteract(link);

    if (atTip && pressed) {
      const state = fishing.current;
      fishing.current = state.phase === "idle" ? castLine(state) : pullLine(state);
    }

    fishing.current = stepFishing(fishing.current, dt);

    const mesh = bobber.current;
    if (!mesh) return;

    const phase = fishing.current.phase;
    mesh.visible = phase === "waiting" || phase === "bite";
    if (!mesh.visible) return;

    /*
     * 기다리는 동안 물결에 얹혀 오르내리고, **잠기는 순간 쑥 내려간다.**
     * 그 차이가 이 놀이의 유일한 신호다 — 둘이 비슷하면 언제 눌러야 할지
     * 화면에서 알 수 없다.
     */
    const drift = Math.sin(drifted.current * DRIFT_RATE) * 0.06;
    mesh.position.set(tip.x + CAST_AHEAD, SEA_LEVEL + drift - (phase === "bite" ? DIP : 0), tip.z);
  });

  return (
    <group>
      {boxes.map((box, index) => (
        <mesh
          key={index}
          geometry={geometry.plank}
          position={[box.x, box.y, box.z]}
          scale={[box.width, box.height, box.depth]}
          castShadow
          receiveShadow
        >
          <ToonMaterial color={WOOD} />
        </mesh>
      ))}
      {/* 찌 — 던지기 전에는 안 보인다 */}
      <mesh
        ref={bobber}
        geometry={geometry.bobber}
        visible={false}
        position={[tip.x, deckY, tip.z]}
      >
        <meshBasicMaterial color={BOBBER} toneMapped={false} />
      </mesh>
    </group>
  );
}
