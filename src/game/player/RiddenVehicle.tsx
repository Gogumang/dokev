"use client";

/**
 * 지금 타고 있는 것.
 *
 * **캐릭터 안에 두지 않는다.** 원래 스케이트보드는 절차적 캐릭터
 * (`Character.tsx`) 안에 있었는데, 플레이어가 GLB 모델로 바뀌자 **GLB로 탈 때는
 * 아무것도 안 보였다** — 대체물이 뜰 때만 보드가 나왔다. 두 캐릭터 어느 쪽이
 * 그려지든 발밑에 있어야 하므로 형제로 올린다.
 *
 * 무엇을 탔는지는 `motion.mode`가 이미 들고 있다. 새 신호를 만들지 않는다 —
 * 이동·소리·자세가 모두 그 값을 보므로, 여기만 다른 것을 보면 **화면에 보이는
 * 탈것과 실제 조작감이 어긋난다.**
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { isVehicle, PLAYER_HEIGHT, type LocomotionMode } from "@/game/config/tuning";
import { PLAYER_BODY, VEHICLE_BODY } from "@/game/player/characterBody";
import { PonyShape, ToyCarShape } from "@/game/player/RiddenVehicleShapes";
import { ToonMaterial } from "@/game/scene/ToonMaterial";

/** 이 그룹의 원점은 플레이어의 가운데다 — 땅은 그만큼 아래다 */
const GROUND_Y = -PLAYER_HEIGHT / 2;

const DECK = "#2fd4c4";
const FRAME = "#e2603f";
const METAL = "#1b1a24";
const RUBBER = "#d8d3c8";
/** 조랑말 걸음의 빠르기(rad/s)와 폭(rad) */
const PONY_STEP_RATE = 6.5;
const PONY_STEP_SWING = 0.45;

/** 치수는 이름 있는 표에서 온다 — 여기서 짧게 부른다 */
const B = PLAYER_BODY;
const V = VEHICLE_BODY;

export interface RiddenVehicleProps {
  /** 매 프레임 갱신되는 공유 객체 — 씬이 쓰고 여기서 읽는다 */
  motion: { mode: LocomotionMode };
}

export function RiddenVehicle({ motion }: RiddenVehicleProps) {
  const kickboard = useRef<THREE.Group>(null);
  const bike = useRef<THREE.Group>(null);
  const skateboard = useRef<THREE.Group>(null);
  const toycar = useRef<THREE.Group>(null);
  const pony = useRef<THREE.Group>(null);
  const jetski = useRef<THREE.Group>(null);
  /** 조랑말 다리 넷. 걸음을 만들려면 개별로 돌려야 한다 */
  const ponyLegs = useRef<(THREE.Mesh | null)[]>([]);

  const geometry = useMemo(
    () => ({
      deck: new THREE.BoxGeometry(B.deckWidth, B.deckHeight, B.deckLength),
      truck: new THREE.BoxGeometry(B.truckWidth, B.truckHeight, B.truckDepth),
      smallWheel: new THREE.CylinderGeometry(B.wheelRadius, B.wheelRadius, B.wheelWidth, 8),
      /** 킥보드 발판 — 보드보다 좁고 낮다 */
      footPlate: new THREE.BoxGeometry(V.plateWidth, V.plateHeight, V.plateLength),
      /** 킥보드 기둥과 자전거 안장 기둥이 함께 쓰는 가는 막대 */
      post: new THREE.BoxGeometry(V.postSide, V.postHeight, V.postSide),
      handlebar: new THREE.BoxGeometry(V.barWidth, V.barThickness, V.barThickness),
      bikeWheel: new THREE.CylinderGeometry(
        V.bikeWheelRadius,
        V.bikeWheelRadius,
        V.bikeWheelWidth,
        14,
      ),
      bikeBar: new THREE.BoxGeometry(V.bikeBarSide, V.bikeBarSide, V.bikeBarLength),
      saddle: new THREE.BoxGeometry(V.saddleWidth, V.saddleHeight, V.saddleDepth),
      carBody: new THREE.BoxGeometry(V.carWidth, V.carHeight, V.carLength),
      carWheel: new THREE.CylinderGeometry(V.carWheelRadius, V.carWheelRadius, V.carWheelWidth, 10),
      ponyBody: new THREE.BoxGeometry(V.ponyBodyWidth, V.ponyBodyHeight, V.ponyBodyLength),
      ponyLeg: new THREE.BoxGeometry(V.ponyLegSide, V.ponyLegHeight, V.ponyLegSide),
      ponyNeck: new THREE.BoxGeometry(V.ponyNeckSide, V.ponyNeckHeight, V.ponyNeckSide),
      ponyHead: new THREE.BoxGeometry(V.ponyHeadWidth, V.ponyHeadHeight, V.ponyHeadLength),
      skiHull: new THREE.BoxGeometry(V.skiHullWidth, V.skiHullHeight, V.skiHullLength),
      skiBow: new THREE.BoxGeometry(V.skiBowWidth, V.skiBowHeight, V.skiBowLength),
      skiSeat: new THREE.BoxGeometry(V.skiSeatWidth, V.skiSeatHeight, V.skiSeatLength),
      skiPost: new THREE.BoxGeometry(V.skiPostSide, V.skiPostHeight, V.skiPostSide),
      skiBar: new THREE.BoxGeometry(V.skiBarWidth, V.skiBarThickness, V.skiBarThickness),
    }),
    [],
  );

  /*
   * 형상은 사라질 때 반드시 버린다. three는 GPU 버퍼를 잡고 있어서 놓아 두면
   * 포토 모드를 드나들 때마다 쌓인다.
   */
  useLayoutEffect(
    () => () => {
      geometry.deck.dispose();
      geometry.truck.dispose();
      geometry.smallWheel.dispose();
      geometry.footPlate.dispose();
      geometry.post.dispose();
      geometry.handlebar.dispose();
      geometry.bikeWheel.dispose();
      geometry.bikeBar.dispose();
      geometry.saddle.dispose();
      geometry.carBody.dispose();
      geometry.carWheel.dispose();
      geometry.ponyBody.dispose();
      geometry.ponyLeg.dispose();
      geometry.ponyNeck.dispose();
      geometry.ponyHead.dispose();
      geometry.skiHull.dispose();
      geometry.skiBow.dispose();
      geometry.skiSeat.dispose();
      geometry.skiPost.dispose();
      geometry.skiBar.dispose();
    },
    [geometry],
  );

  useFrame(({ clock }) => {
    const mode = motion.mode;
    /*
     * 매 프레임 `visible`만 건드린다. 조건부 렌더로 바꾸면 초당 60번 리렌더가
     * 되고, 이 저장소가 금지한 「매 프레임 setState」가 된다.
     */
    if (kickboard.current) kickboard.current.visible = mode === "kickboard";
    if (bike.current) bike.current.visible = mode === "bike";
    if (skateboard.current) skateboard.current.visible = mode === "skateboard";
    if (toycar.current) toycar.current.visible = mode === "toycar";
    if (pony.current) pony.current.visible = mode === "pony";
    if (jetski.current) jetski.current.visible = mode === "jetski";

    /*
     * 조랑말 걸음.
     *
     * 다리를 안 움직이면 **말이 미끄러진다** — 살아 있는 것을 탄다는 인상이
     * 통째로 사라지고, 그러면 기계 탈것을 하나 더 만든 것과 같다. 앞뒤가 엇갈려
     * 짚도록 대각선끼리 위상을 맞춘다.
     */
    if (mode === "pony") {
      const swing = Math.sin(clock.elapsedTime * PONY_STEP_RATE) * PONY_STEP_SWING;
      for (let i = 0; i < ponyLegs.current.length; i += 1) {
        const leg = ponyLegs.current[i];
        if (!leg) continue;
        // 0·3이 한 쌍, 1·2가 다른 쌍 — 대각선끼리 같이 나간다
        leg.rotation.x = i === 0 || i === 3 ? swing : -swing;
      }
    }
  });

  // 첫 프레임이 오기 전까지의 모습. 시작은 두 발이라 대개 아무것도 안 보인다
  const riding = isVehicle(motion.mode);

  return (
    <group position={[0, GROUND_Y, 0]}>
      {/* 킥보드 — 발판이 낮고 기둥이 앞에 선다 */}
      <group ref={kickboard} visible={riding && motion.mode === "kickboard"}>
        <mesh castShadow geometry={geometry.footPlate} position={[0, 0.11, -0.05]}>
          <ToonMaterial color={DECK} />
        </mesh>
        <mesh castShadow geometry={geometry.post} position={[0, 0.55, 0.38]}>
          <ToonMaterial color={METAL} />
        </mesh>
        <mesh castShadow geometry={geometry.handlebar} position={[0, 1.02, 0.38]}>
          <ToonMaterial color={METAL} />
        </mesh>
        {[0.42, -0.48].map((z) => (
          <mesh
            key={z}
            geometry={geometry.smallWheel}
            position={[0, 0.09, z]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <ToonMaterial color={RUBBER} />
          </mesh>
        ))}
      </group>

      {/* 자전거 — 바퀴가 커서 눈높이가 올라간다 */}
      <group ref={bike} visible={riding && motion.mode === "bike"}>
        {[0.62, -0.62].map((z) => (
          <mesh
            key={z}
            castShadow
            geometry={geometry.bikeWheel}
            position={[0, 0.33, z]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <ToonMaterial color={METAL} />
          </mesh>
        ))}
        <mesh castShadow geometry={geometry.bikeBar} position={[0, 0.62, 0]}>
          <ToonMaterial color={FRAME} />
        </mesh>
        <mesh castShadow geometry={geometry.post} position={[0, 0.5, 0.5]} scale={[1, 0.5, 1]}>
          <ToonMaterial color={FRAME} />
        </mesh>
        <mesh castShadow geometry={geometry.handlebar} position={[0, 0.86, 0.55]}>
          <ToonMaterial color={METAL} />
        </mesh>
        <mesh castShadow geometry={geometry.saddle} position={[0, 0.78, -0.36]}>
          <ToonMaterial color={METAL} />
        </mesh>
      </group>

      {/* 스케이트보드 — 원래 캐릭터 안에 있던 것을 그대로 옮겼다 */}
      <group
        ref={skateboard}
        visible={riding && motion.mode === "skateboard"}
        position={[0, 0.1, 0]}
      >
        <mesh castShadow geometry={geometry.deck}>
          <ToonMaterial color={DECK} />
        </mesh>
        {[0.36, -0.36].map((z) => (
          <group key={z} position={[0, -0.07, z]}>
            <mesh geometry={geometry.truck}>
              <ToonMaterial color={METAL} />
            </mesh>
            {[-0.16, 0.16].map((x) => (
              <mesh
                key={x}
                geometry={geometry.smallWheel}
                position={[x, -0.03, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <ToonMaterial color={RUBBER} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {/*
        장난감 자동차 — 아이가 들어가 앉는 크기다. 트레일러의 「소형 자동차」가
        근거이고(TRAILER_FEATURE_ANALYSIS 「3.3 이동 수단과 이동 능력」), 진짜
        자동차를 운전하는 것과는 다르다. 바퀴 넷이 실루엣을 정한다.
      */}
      <group ref={toycar} visible={riding && motion.mode === "toycar"}>
        <ToyCarShape geometry={geometry} />
      </group>

      {/*
        조랑말 — **살아 있는 탈것.** 기계와 달리 걸음이 보여야 하므로 다리를
        따로 돌린다. 자연 구역에서만 만난다(`PASTURE_VEHICLES`).
      */}
      <group ref={pony} visible={riding && motion.mode === "pony"}>
        <PonyShape geometry={geometry} legs={ponyLegs} />
      </group>

      {/*
        제트스키 — 바퀴가 없어 몸통이 바닥에서 시작한다. 물 위에서만 값을
        하는 탈것이고(`WATER_VEHICLES`), 부두 앞에 대어 둔 것을 탄다.

        앞쪽(-z)이 뱃머리다. 다른 탈것과 앞뒤가 같아야 조향이 뒤집히지 않는다.
      */}
      <group ref={jetski} visible={riding && motion.mode === "jetski"}>
        <mesh castShadow geometry={geometry.skiHull} position={[0, V.skiHullHeight / 2 + 0.06, 0]}>
          <ToonMaterial color={DECK} />
        </mesh>
        <mesh
          castShadow
          geometry={geometry.skiBow}
          position={[0, V.skiHullHeight + 0.14, -(V.skiHullLength / 2 - V.skiBowLength / 2 + 0.06)]}
        >
          <ToonMaterial color={DECK} />
        </mesh>
        <mesh
          castShadow
          geometry={geometry.skiSeat}
          position={[0, V.skiHullHeight + V.skiSeatHeight / 2 + 0.06, 0.3]}
        >
          <ToonMaterial color={RUBBER} />
        </mesh>
        <mesh
          castShadow
          geometry={geometry.skiPost}
          position={[0, V.skiHullHeight + V.skiPostHeight / 2 + 0.2, -0.32]}
        >
          <ToonMaterial color={METAL} />
        </mesh>
        <mesh
          castShadow
          geometry={geometry.skiBar}
          position={[0, V.skiHullHeight + V.skiPostHeight + 0.24, -0.32]}
        >
          <ToonMaterial color={METAL} />
        </mesh>
      </group>
    </group>
  );
}
