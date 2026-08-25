"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import {
  ABILITY_VFX_PROFILES,
  ABILITY_VFX_BODY,
  ABILITY_VFX_OPACITY,
  abilityVfxFrame,
  type AbilityVfxKind,
} from "@/game/dokebi/abilityVfx";
import type { CompanionState } from "@/game/dokebi/companionMotion";
import type { DokebiSpirit } from "@/game/dokebi/roster";

interface CompanionAbilityVfxProps {
  readonly source: { readonly current: CompanionState };
  readonly spirit: DokebiSpirit;
  readonly reducedMotion: boolean;
}

interface AbilityShapeProps {
  readonly radius: number;
  readonly bodyMaterial: THREE.MeshBasicMaterial;
  readonly accentMaterial: THREE.MeshBasicMaterial;
  readonly reducedMotion: boolean;
}

function Motes({ radius, bodyMaterial, accentMaterial, reducedMotion }: AbilityShapeProps) {
  const rootRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(ABILITY_VFX_BODY.moteRadius, 0), []);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = reducedMotion ? 0 : clock.elapsedTime * 1.4;
  });

  return (
    <group ref={rootRef}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <mesh
            key={index}
            geometry={geometry}
            material={index % 2 === 0 ? bodyMaterial : accentMaterial}
            position={[
              Math.sin(angle) * radius,
              0.05 + (index % 3) * 0.16,
              Math.cos(angle) * radius,
            ]}
          />
        );
      })}
    </group>
  );
}

function Smoke({ radius, bodyMaterial, accentMaterial, reducedMotion }: AbilityShapeProps) {
  const rootRef = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () => new THREE.DodecahedronGeometry(ABILITY_VFX_BODY.smokeRadius, 0),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = reducedMotion ? 0 : -clock.elapsedTime * 0.55;
  });

  return (
    <group ref={rootRef} position={[0, -0.12, 0]}>
      {Array.from({ length: 7 }, (_, index) => {
        const angle = (index / 7) * Math.PI * 2;
        const scale = 0.65 + (index % 3) * 0.2;
        return (
          <mesh
            key={index}
            geometry={geometry}
            material={index % 3 === 0 ? accentMaterial : bodyMaterial}
            position={[
              Math.sin(angle) * radius,
              -0.18 + (index % 2) * 0.2,
              Math.cos(angle) * radius,
            ]}
            scale={scale}
          />
        );
      })}
    </group>
  );
}

function Ripples({ radius, accentMaterial, reducedMotion }: AbilityShapeProps) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const geometry = useMemo(
    () => new THREE.TorusGeometry(1, ABILITY_VFX_BODY.ringThickness, 6, 36),
    [],
  );

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }) => {
    for (let index = 0; index < rings.current.length; index += 1) {
      const ring = rings.current[index];
      if (!ring) continue;
      const cycle = reducedMotion ? (index + 1) / 3 : (clock.elapsedTime * 0.7 + index / 3) % 1;
      ring.scale.setScalar(radius * (0.35 + cycle * 0.65));
    }
  });

  return (
    <group position={[0, -0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            rings.current[index] = mesh;
          }}
          geometry={geometry}
          material={accentMaterial}
        />
      ))}
    </group>
  );
}

function Beacon({ radius, bodyMaterial, accentMaterial, reducedMotion }: AbilityShapeProps) {
  const rootRef = useRef<THREE.Group>(null);
  const beam = useMemo(
    () =>
      new THREE.ConeGeometry(
        ABILITY_VFX_BODY.beaconBeamRadius,
        radius * ABILITY_VFX_BODY.beaconBeamHeightScale,
        5,
      ),
    [radius],
  );
  const ring = useMemo(
    () =>
      new THREE.TorusGeometry(
        radius * ABILITY_VFX_BODY.beaconRingRadiusScale,
        ABILITY_VFX_BODY.beaconRingThickness,
        6,
        32,
      ),
    [radius],
  );

  useLayoutEffect(() => {
    return () => {
      beam.dispose();
      ring.dispose();
    };
  }, [beam, ring]);
  useFrame(({ clock }) => {
    if (rootRef.current) rootRef.current.rotation.y = reducedMotion ? 0 : clock.elapsedTime * 0.45;
  });

  return (
    <group ref={rootRef}>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2;
        return (
          <mesh
            key={index}
            geometry={beam}
            material={index % 2 === 0 ? bodyMaterial : accentMaterial}
            position={[Math.sin(angle) * radius * 0.55, 0.35, Math.cos(angle) * radius * 0.55]}
            scale={[1, 0.7 + (index % 2) * 0.3, 1]}
          />
        );
      })}
      <mesh geometry={ring} material={accentMaterial} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function abilityShape(kind: AbilityVfxKind, props: AbilityShapeProps): ReactNode {
  switch (kind) {
    case "motes":
      return <Motes {...props} />;
    case "smoke":
      return <Smoke {...props} />;
    case "ripples":
      return <Ripples {...props} />;
    case "beacon":
      return <Beacon {...props} />;
  }
}

export function CompanionAbilityVfx({ source, spirit, reducedMotion }: CompanionAbilityVfxProps) {
  const rootRef = useRef<THREE.Group>(null);
  const profile = ABILITY_VFX_PROFILES[spirit.id];
  const materials = useMemo(
    () => ({
      body: new THREE.MeshBasicMaterial({
        color: spirit.bodyColor,
        transparent: true,
        opacity: ABILITY_VFX_OPACITY.body,
        depthWrite: false,
        toneMapped: false,
        /*
         * 기준 불투명도를 재질에 얹어 둔다.
         *
         * 프레임마다 훑어 값을 넣을 때 **어느 재질의 기준이 얼마였는지**를
         * 알아야 한다. 밖에서 두 재질을 직접 만지면 훅에 넘긴 값을 고치는
         * 셈이라 규칙이 막고, 여기 적어 두면 훑는 쪽이 스스로 안다.
         */
        userData: { baseOpacity: ABILITY_VFX_OPACITY.body },
      }),
      accent: new THREE.MeshBasicMaterial({
        color: spirit.accentColor,
        transparent: true,
        opacity: ABILITY_VFX_OPACITY.accent,
        depthWrite: false,
        toneMapped: false,
        userData: { baseOpacity: ABILITY_VFX_OPACITY.accent },
      }),
    }),
    [spirit.accentColor, spirit.bodyColor],
  );

  useLayoutEffect(() => {
    return () => {
      materials.body.dispose();
      materials.accent.dispose();
    };
  }, [materials]);

  useFrame(({ clock }) => {
    const frame = abilityVfxFrame(
      source.current.abilityRemaining,
      spirit.effect.durationSeconds,
      clock.elapsedTime,
      reducedMotion,
    );
    const root = rootRef.current;
    if (!root) return;

    root.visible = frame.visible;
    root.rotation.y = frame.rotation;
    root.scale.setScalar(frame.scale + frame.pulse);
    /*
     * 같은 값을 넣는 대신 **각자의 기준값에 세기를 곱한다.**
     *
     * 전에는 훑으면서 `frame.opacity` 하나를 모두에게 넣어, 몸 색(0.56)과
     * 강조 색(0.78)이 첫 프레임에 같아졌다 — 두 색으로 나눈 이유가 화면에서
     * 사라진다.
     */
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!(material instanceof THREE.MeshBasicMaterial)) return;
      const base = (material.userData.baseOpacity as number | undefined) ?? 1;
      material.opacity = base * frame.strength;
    });
  });

  return (
    <group ref={rootRef} visible={false}>
      {abilityShape(profile.kind, {
        radius: profile.radius,
        bodyMaterial: materials.body,
        accentMaterial: materials.accent,
        reducedMotion,
      })}
    </group>
  );
}
