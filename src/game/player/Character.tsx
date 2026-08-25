"use client";

/**
 * 절차적 캐릭터.
 *
 * GLB 없이 프리미티브만으로 만든다. 상자를 쌓는 대신 캡슐과 구를 써서
 * 실루엣을 만든다 — 멀리서 볼 때 사람으로 읽히는지는 디테일이 아니라
 * 윤곽선이 정한다.
 *
 * 비율은 사실적이지 않게 잡았다. 머리를 크게 두면 장난감 같은 인상이 되는데,
 * TRAILER_FEATURE_ANALYSIS 3.1절이 말하는 어린이 주인공에 그쪽이 맞다.
 *
 * 자세 계산은 characterPose.ts에 있다. 여기서는 계산 결과를 뼈대에 붙이기만 한다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS, PLAYER_HEIGHT, type VehicleKind } from "@/game/config/tuning";
import type { Appearance } from "@/game/player/appearance";
import { attackPose } from "@/game/player/attackPose";
import { WEAPON_ORDER, WEAPONS, type WeaponId } from "@/game/combat/weapons";
import { swingTrail, trailHalfWidth } from "@/game/player/swingTrail";
import { PLAYER_BODY } from "@/game/player/characterBody";
import { emotePose, type EmoteState } from "@/game/player/emote";
import type { PhotoPose } from "@/game/player/photoPose";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import {
  bodyBob,
  createPoseState,
  limbPose,
  squashScale,
  stepPose,
  type PoseState,
} from "@/game/player/characterPose";

/**
 * 애니메이션 입력.
 *
 * 값이 아니라 **가변 객체 참조**를 받는다. 속도는 매 프레임 바뀌는데 이를 값으로
 * 넘기면 초당 60번 리렌더가 필요해진다. 렌더 루프끼리 같은 객체를 공유하고
 * 각자 읽는 방식이 이 프로젝트의 성능 예산에 맞다.
 */
/**
 * 자국을 남기는 무기들.
 *
 * 원거리는 빠진다 — 탄이 이미 눈에 보이고, 부채꼴까지 그리면 **쏘지도 않은
 * 근접 판정이 있는 것처럼** 읽힌다(`swingTrail`이 같은 규칙을 잰다).
 */
const MELEE_WEAPONS = WEAPON_ORDER.filter((id) => WEAPONS[id].bolt === null);

/** 자국 안쪽 반지름 비율. 몸에서 조금 떨어져야 팔이 그린 길처럼 보인다 */
const TRAIL_INNER_RATIO = 0.45;

/** 부채꼴을 몇 조각으로 나눌지. 자국 하나뿐이라 넉넉히 줘도 싸다 */
const TRAIL_SEGMENTS = 16;

/** 자국 색. 불꽃이 아니라 **그림 도구**의 인상이어야 한다 */
const TRAIL_COLOR = "#8ff2ff";

/**
 * 가장 진할 때의 불투명도.
 *
 * 1로 두면 바닥을 덮는 판이 되어 **캐릭터보다 자국이 주인공**이 된다. 프레임의
 * 참격도 배경을 지우지 않고 위에 얹혀 있었다.
 */
const TRAIL_MAX_OPACITY = 0.5;

export interface CharacterMotionSource {
  /** 현재 수평 속도(m/s) */
  speed: number;
  grounded: boolean;
  /** 활강 중인지 */
  gliding: boolean;
  /** 이번 프레임 착지 충돌 속도(m/s). 없으면 0 */
  landingImpact: number;
  /** 감정 표현 상태. 아무 동작도 안 하면 elapsed가 null이다 */
  emote: EmoteState;
  /** 휘두르기 경과 시간(초). 쉬고 있으면 null */
  attackElapsed: number | null;
  /**
   * 지금 들고 있는 무기.
   *
   * 경과 시간만으로는 자세를 못 그린다 — 그 시간이 0.48초짜리 휘두르기의
   * 절반인지 1.03초짜리의 3분의 1인지에 따라 팔이 있어야 할 곳이 다르다.
   */
  weapon: WeaponId;
}

export interface CharacterProps {
  motion: CharacterMotionSource;
  /** 스케이트보드 탑승 여부를 담은 가변 입력 객체 */
  input: { vehicle: VehicleKind | null };
  /** 저감 모션이면 흔들림 계열 연출을 끈다 */
  reducedMotion: boolean;
  /**
   * 포토 모드 포즈. 포토 모드가 아니면 null이고, 그때는 걸음 자세를 그대로 쓴다.
   *
   * 포즈가 있으면 팔다리·상체를 통째로 덮어쓴다. 걸음 자세와 섞으면 멈춘
   * 위상값이 그대로 더해져 포즈가 매번 조금씩 달라진다.
   */
  photoPose: PhotoPose | null;
  /**
   * 외형 프리셋.
   *
   * 색을 상수로 박아 두면 고를 수가 없다. 팔레트는 여전히 "노을 아래에서
   * 실루엣이 배경과 분리되어야 한다"는 제약을 지킨다 — 그건 프리셋 쪽에서
   * 테스트가 확인한다.
   */
  appearance: Appearance;
}

export function Character({ motion, input, reducedMotion, photoPose, appearance }: CharacterProps) {
  const { skin: SKIN, hair: HAIR, hoodie: HOODIE, hoodieDark: HOODIE_DARK } = appearance;
  const { pants: PANTS, shoe: SHOE, bag: BAG } = appearance;
  const torsoRef = useRef<THREE.Group>(null);
  const squashRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);

  const pose = useRef<PoseState>(createPoseState());
  /** 무기마다 자국 링이 하나씩. 지금 든 것만 보인다 */
  const trails = useRef<(THREE.Mesh | null)[]>([]);

  // 지오메트리는 한 번만 만든다. 매 렌더 새로 만들면 GPU 버퍼가 계속 쌓인다.
  const geometry = useMemo(
    () => ({
      head: new THREE.SphereGeometry(PLAYER_BODY.headRadius, 16, 12),
      hair: new THREE.SphereGeometry(PLAYER_BODY.hairRadius, 16, 12),
      torso: new THREE.CapsuleGeometry(PLAYER_BODY.torsoRadius, PLAYER_BODY.torsoLength, 4, 12),
      arm: new THREE.CapsuleGeometry(PLAYER_BODY.armRadius, PLAYER_BODY.armLength, 3, 8),
      leg: new THREE.CapsuleGeometry(PLAYER_BODY.legRadius, PLAYER_BODY.legLength, 3, 8),
      shoe: new THREE.BoxGeometry(
        PLAYER_BODY.shoeWidth,
        PLAYER_BODY.shoeHeight,
        PLAYER_BODY.shoeDepth,
      ),
      bag: new THREE.BoxGeometry(PLAYER_BODY.bagWidth, PLAYER_BODY.bagHeight, PLAYER_BODY.bagDepth),
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

  /*
   * 휘두른 자국 링 — 무기마다 하나.
   *
   * 위 `geometry`에 넣지 않는다. 저쪽은 **값이 전부 지오메트리 하나**라는
   * 전제로 해제되는데, 배열을 하나 끼우면 `dispose`가 없는 것에 대고 부른다.
   *
   * 각도를 지오메트리가 들고 있어 렌더는 돌리기만 한다 — 매 프레임 정점을 다시
   * 만들면 GC가 프레임을 먹는다.
   */
  const trailRings = useMemo(
    () =>
      MELEE_WEAPONS.map((id) => {
        const weapon = WEAPONS[id];
        const halfWidth = trailHalfWidth(weapon);
        return new THREE.RingGeometry(
          weapon.reachMeters * TRAIL_INNER_RATIO,
          weapon.reachMeters,
          TRAIL_SEGMENTS,
          1,
          // 링의 0도는 +x다. 정면(+z)에 자국을 두려면 -90도에서 시작한다
          -Math.PI / 2 - halfWidth,
          halfWidth * 2,
        );
      }),
    [],
  );

  useLayoutEffect(() => {
    return () => {
      for (const ring of trailRings) ring.dispose();
    };
  }, [trailRings]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);

    const next = stepPose(
      pose.current,
      {
        speed: motion.speed,
        grounded: motion.grounded,
        onBoard: input.vehicle !== null,
        gliding: motion.gliding,
        landingImpact: motion.landingImpact,
      },
      dt,
    );
    pose.current = next;

    const limbs = limbPose(next);

    /*
     * 춤은 포토 포즈와 같은 채널을 쓴다. 리그가 포즈를 적용하는 코드를 이미
     * 갖고 있으므로 별도 경로를 만들면 같은 일을 두 번 하게 된다.
     * 포토 모드가 켜져 있으면 그쪽이 우선이다 — 사진을 찍는 중이다.
     */
    /*
     * 우선순위: 포토 모드 > 공격 > 감정 표현.
     *
     * 공격이 감정 표현을 이긴다 — 춤추다 때리면 때리는 동작이 보여야 한다.
     * 포토 모드가 가장 위인 이유는 사진을 찍는 중이기 때문이다.
     */
    const appliedPose =
      photoPose ??
      (motion.attackElapsed !== null
        ? attackPose(motion.attackElapsed, WEAPONS[motion.weapon])
        : emotePose(motion.emote));

    /*
     * 휘두른 자국.
     *
     * 지금 든 무기의 링만 보인다. 매 프레임 `visible`만 건드린다 — 조건부
     * 렌더로 바꾸면 휘두를 때마다 리렌더가 난다.
     */
    const trail = swingTrail(motion.attackElapsed, WEAPONS[motion.weapon]);
    for (let index = 0; index < MELEE_WEAPONS.length; index += 1) {
      const ring = trails.current[index];
      if (!ring) continue;
      const mine = MELEE_WEAPONS[index] === motion.weapon;
      ring.visible = mine && trail.opacity > 0;
      if (!ring.visible) continue;
      ring.rotation.y = trail.centerAngle;
      (ring.material as THREE.MeshBasicMaterial).opacity = trail.opacity * TRAIL_MAX_OPACITY;
    }

    if (leftArm.current) {
      leftArm.current.rotation.x = appliedPose ? appliedPose.leftArmX : limbs.leftArm;
      // 포즈를 벗어나면 벌림을 0으로 되돌린다 — 남으면 걸을 때 팔이 벌어진 채다.
      leftArm.current.rotation.z = appliedPose ? appliedPose.leftArmZ : 0;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = appliedPose ? appliedPose.rightArmX : limbs.rightArm;
      rightArm.current.rotation.z = appliedPose ? appliedPose.rightArmZ : 0;
    }
    if (leftLeg.current)
      leftLeg.current.rotation.x = appliedPose ? appliedPose.leftLegX : limbs.leftLeg;
    if (rightLeg.current) {
      rightLeg.current.rotation.x = appliedPose ? appliedPose.rightLegX : limbs.rightLeg;
    }

    if (squashRef.current) {
      // 착지 스쿼시는 저감 모션에서도 남긴다 — 화면 흔들림이 아니라 캐릭터
      // 자체의 반응이고, 착지가 씹혔는지 판단하는 단서가 되기 때문이다.
      const scale = squashScale(next);
      squashRef.current.scale.set(scale.x, scale.y, scale.z);
    }

    if (torsoRef.current) {
      torsoRef.current.rotation.x = appliedPose ? appliedPose.lean : next.lean;
      // 포즈를 잡는 동안에는 숨쉬기 흔들림도 멈춘다. 사진이 흔들려 보인다.
      torsoRef.current.position.y = reducedMotion || photoPose ? 0 : bodyBob(next);
    }

    if (headRef.current) {
      // 상체가 기울어도 머리는 앞을 본다. 사람은 달릴 때 시선을 유지한다.
      headRef.current.rotation.x = appliedPose ? appliedPose.headTilt : -next.lean * 0.75;
    }
  });

  return (
    <group>
      {/*
        휘두른 자국 — 발밑에 눕힌 부채꼴.
        캐릭터 그룹 안에 두어 **몸이 도는 대로 함께 돈다.** 밖에 두면 방향을
        따로 맞춰야 하고, 그러면 판정과 어긋날 자리가 하나 더 생긴다.
      */}
      {MELEE_WEAPONS.map((id, index) => (
        <mesh
          key={id}
          ref={(mesh) => {
            trails.current[index] = mesh;
          }}
          geometry={trailRings[index]}
          visible={false}
          position={[0, -PLAYER_HEIGHT * 0.32, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial
            color={TRAIL_COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* 스쿼시는 캐릭터 전체에 걸린다. 발이 지면을 뚫지 않도록 원점을 발밑에 둔다 */}
      <group ref={squashRef} position={[0, -PLAYER_HEIGHT / 2, 0]}>
        <group position={[0, PLAYER_HEIGHT / 2, 0]}>
          <group ref={torsoRef}>
            {/* 몸통 — 후드 */}
            <mesh castShadow geometry={geometry.torso} position={[0, PLAYER_HEIGHT * 0.16, 0]}>
              <ToonMaterial color={HOODIE} />
            </mesh>
            {/* 후드 목깃 — 어깨선을 만들어 준다 */}
            <mesh
              castShadow
              geometry={geometry.head}
              position={[0, PLAYER_HEIGHT * 0.33, -0.06]}
              scale={[1.05, 0.5, 0.9]}
            >
              <ToonMaterial color={HOODIE_DARK} />
            </mesh>

            {/* 가방 — 실루엣에 덩어리를 더한다 (TRAILER 3.1의 가방) */}
            <mesh castShadow geometry={geometry.bag} position={[0, PLAYER_HEIGHT * 0.17, -0.2]}>
              <ToonMaterial color={BAG} />
            </mesh>

            <group ref={headRef} position={[0, PLAYER_HEIGHT * 0.5, 0]}>
              <mesh castShadow geometry={geometry.head}>
                <ToonMaterial color={SKIN} />
              </mesh>
              {/* 머리카락 — 뒤통수와 정수리를 덮어 앞뒤를 구분시킨다 */}
              <mesh
                castShadow
                geometry={geometry.hair}
                position={[0, 0.03, -0.025]}
                scale={[1, 0.92, 1]}
              >
                <ToonMaterial color={HAIR} />
              </mesh>
              {/* 앞머리 */}
              <mesh geometry={geometry.hair} position={[0, 0.1, 0.03]} scale={[0.92, 0.36, 0.92]}>
                <ToonMaterial color={HAIR} />
              </mesh>
              {/* 눈 — 방향을 읽을 수 있어야 조작 감각을 판단할 수 있다 */}
              <mesh position={[-0.07, 0.005, 0.185]}>
                <sphereGeometry args={[0.026, 8, 6]} />
                <meshBasicMaterial color="#14101c" toneMapped={false} />
              </mesh>
              <mesh position={[0.07, 0.005, 0.185]}>
                <sphereGeometry args={[0.026, 8, 6]} />
                <meshBasicMaterial color="#14101c" toneMapped={false} />
              </mesh>
            </group>

            {/* 팔 — 어깨를 회전 원점으로 두려고 그룹 안에서 아래로 내려 배치한다 */}
            <group ref={leftArm} position={[-0.24, PLAYER_HEIGHT * 0.3, 0]}>
              <mesh castShadow geometry={geometry.arm} position={[0, -0.2, 0]}>
                <ToonMaterial color={HOODIE} />
              </mesh>
              <mesh castShadow position={[0, -0.4, 0]}>
                <sphereGeometry args={[0.06, 8, 6]} />
                <ToonMaterial color={SKIN} />
              </mesh>
            </group>
            <group ref={rightArm} position={[0.24, PLAYER_HEIGHT * 0.3, 0]}>
              <mesh castShadow geometry={geometry.arm} position={[0, -0.2, 0]}>
                <ToonMaterial color={HOODIE} />
              </mesh>
              <mesh castShadow position={[0, -0.4, 0]}>
                <sphereGeometry args={[0.06, 8, 6]} />
                <ToonMaterial color={SKIN} />
              </mesh>
            </group>
          </group>

          {/* 다리 — 골반을 회전 원점으로. 상체 기울기와 무관해야 한다 */}
          <group ref={leftLeg} position={[-0.1, -PLAYER_HEIGHT * 0.06, 0]}>
            <mesh castShadow geometry={geometry.leg} position={[0, -0.22, 0]}>
              <ToonMaterial color={PANTS} />
            </mesh>
            <mesh castShadow geometry={geometry.shoe} position={[0, -0.46, 0.035]}>
              <ToonMaterial color={SHOE} />
            </mesh>
          </group>
          <group ref={rightLeg} position={[0.1, -PLAYER_HEIGHT * 0.06, 0]}>
            <mesh castShadow geometry={geometry.leg} position={[0, -0.22, 0]}>
              <ToonMaterial color={PANTS} />
            </mesh>
            <mesh castShadow geometry={geometry.shoe} position={[0, -0.46, 0.035]}>
              <ToonMaterial color={SHOE} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
