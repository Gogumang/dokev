"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { createGliderFrame, GLIDER_BODY, stepGliderFrame } from "@/game/player/gliderPresentation";

interface UmbrellaGliderProps {
  readonly motion: { readonly gliding: boolean };
  readonly reducedMotion: boolean;
}

const PANEL_COUNT = 8;
const PANEL_STEP = (Math.PI * 2) / PANEL_COUNT;

const UMBRELLA = {
  panelWarm: "#ff8a52",
  panelCream: "#ffe8ba",
  ribs: "#553849",
  grip: "#2f9fd4",
} as const;

export function UmbrellaGlider({ motion, reducedMotion }: UmbrellaGliderProps) {
  const rootRef = useRef<THREE.Group>(null);
  const canopyRef = useRef<THREE.Group>(null);
  const frame = useRef(createGliderFrame());

  const resources = useMemo(() => {
    const panels = Array.from(
      { length: PANEL_COUNT },
      (_, index) =>
        new THREE.SphereGeometry(
          GLIDER_BODY.panelRadius,
          8,
          4,
          index * PANEL_STEP,
          PANEL_STEP,
          0,
          Math.PI / 2,
        ),
    );
    const geometries = {
      panels,
      rib: new THREE.CylinderGeometry(
        GLIDER_BODY.ribRadius,
        GLIDER_BODY.ribRadius,
        GLIDER_BODY.panelRadius,
        6,
      ),
      shaft: new THREE.CylinderGeometry(
        GLIDER_BODY.shaftRadius,
        GLIDER_BODY.shaftRadius,
        GLIDER_BODY.shaftHeight,
        8,
      ),
      knob: new THREE.SphereGeometry(GLIDER_BODY.knobRadius, 8, 6),
      grip: new THREE.TorusGeometry(
        GLIDER_BODY.gripRadius,
        GLIDER_BODY.gripThickness,
        6,
        12,
        Math.PI,
      ),
    };
    const materials = {
      warm: new THREE.MeshToonMaterial({ color: UMBRELLA.panelWarm }),
      cream: new THREE.MeshToonMaterial({ color: UMBRELLA.panelCream }),
      ribs: new THREE.MeshToonMaterial({ color: UMBRELLA.ribs }),
      grip: new THREE.MeshToonMaterial({ color: UMBRELLA.grip }),
    };
    return { geometries, materials };
  }, []);

  useLayoutEffect(() => {
    return () => {
      for (const panel of resources.geometries.panels) panel.dispose();
      resources.geometries.rib.dispose();
      resources.geometries.shaft.dispose();
      resources.geometries.knob.dispose();
      resources.geometries.grip.dispose();
      resources.materials.warm.dispose();
      resources.materials.cream.dispose();
      resources.materials.ribs.dispose();
      resources.materials.grip.dispose();
    };
  }, [resources]);

  useFrame(({ clock }, rawDelta) => {
    frame.current = stepGliderFrame(
      frame.current,
      motion.gliding,
      Math.min(rawDelta, MAX_DELTA_SECONDS),
      clock.elapsedTime,
      reducedMotion,
    );

    const root = rootRef.current;
    const canopy = canopyRef.current;
    if (!root || !canopy) return;

    root.visible = frame.current.visible;
    root.position.y = 1.05 + frame.current.bob;
    root.rotation.z = frame.current.roll;
    canopy.scale.set(
      frame.current.openScale,
      0.38 + frame.current.openScale * 0.12,
      frame.current.openScale,
    );
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={canopyRef}>
        {resources.geometries.panels.map((geometry, index) => (
          <mesh
            key={index}
            castShadow
            geometry={geometry}
            material={index % 2 === 0 ? resources.materials.warm : resources.materials.cream}
          />
        ))}
        {Array.from({ length: PANEL_COUNT }, (_, index) => (
          <group key={index} rotation={[0, index * PANEL_STEP, 0]}>
            <mesh
              geometry={resources.geometries.rib}
              material={resources.materials.ribs}
              position={[GLIDER_BODY.panelRadius / 2, 0.015, 0]}
              rotation={[0, 0, Math.PI / 2]}
            />
          </group>
        ))}
        <mesh
          geometry={resources.geometries.knob}
          material={resources.materials.grip}
          position={[0, GLIDER_BODY.panelRadius * 0.52, 0]}
        />
      </group>

      <mesh
        geometry={resources.geometries.shaft}
        material={resources.materials.ribs}
        position={[0, -0.46, 0]}
      />
      <mesh
        geometry={resources.geometries.grip}
        material={resources.materials.grip}
        position={[0.09, -0.9, 0]}
        rotation={[0, Math.PI / 2, Math.PI]}
      />
    </group>
  );
}
