"use client";

/**
 * 그래플 시각화 — 줄과 대상 표시.
 *
 * 줄이 없으면 플레이어는 자기가 순간이동했다고 느낀다. 어디에 걸렸는지
 * 보여야 "저 기둥에 걸어서 당겨졌다"는 인과가 읽힌다.
 *
 * 대상 표시도 같은 이유다. 걸 수 있는 곳을 모르면 G는 그냥 가끔 되는 키가 된다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  ropePoints,
  SEGMENT_FLOAT_COUNT,
  toSegmentPositions,
} from "@/game/player/grappleRope";

/** 씬이 매 프레임 채워 넣는 그래플 표시 상태 */
export interface GrappleView {
  /** 줄이 걸려 있는지 */
  attached: boolean;
  /** 줄의 시작점(플레이어 손 근처) */
  fromX: number;
  fromY: number;
  fromZ: number;
  /** 줄의 끝점(걸린 지점) */
  toX: number;
  toY: number;
  toZ: number;
  /** 지금 걸 수 있는 대상이 있는지 */
  hasTarget: boolean;
  targetX: number;
  targetY: number;
  targetZ: number;
  /** 당기는 힘 0~1. 1이면 줄이 완전히 펴진다 */
  tension: number;
}

export function createGrappleView(): GrappleView {
  return {
    attached: false,
    fromX: 0,
    fromY: 0,
    fromZ: 0,
    toX: 0,
    toY: 0,
    toZ: 0,
    hasTarget: false,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    tension: 0,
  };
}

/**
 * 갈고리 상태를 화면이 읽는 모양으로 옮긴다.
 *
 * 걸려 있으면 줄을, 아니면 걸 수 있는 대상 표시를 그린다. 프레임 루프 안에서
 * 칸마다 손으로 적을 때는 **`hasTarget`을 지워도 아무도 몰랐다** — 그러면
 * 걸 수 있는 자리에 서 있어도 **표시가 안 떠서 걸 수 있다는 것을 모른다.**
 * 활강과 함께 이 도시를 도는 방식 자체가 사라지는데 화면은 멀쩡하다.
 *
 * 미리보기는 **실제 발동과 같은 함수**로 구한 것을 받는다 — 표시와 판정이 다른
 * 규칙을 쓰면 「표시가 떴는데 안 걸리는」 상황이 생긴다.
 */
export function projectGrappleView(
  view: GrappleView,
  /** 걸려 있는 지점. 없으면 null */
  anchor: { x: number; y: number; z: number } | null,
  /** 플레이어 자리 */
  position: { x: number; y: number; z: number },
  /** 손 높이(m). 발밑에서 줄이 뻗는 그림이 되지 않게 한다 */
  handHeight: number,
  /** 지금 걸 수 있는 대상. 없으면 null */
  preview: { x: number; y: number; z: number } | null,
  /** 장력을 정규화할 최대 사거리(m) */
  maxRange: number,
): void {
  view.attached = anchor !== null;

  if (anchor) {
    view.fromX = position.x;
    view.fromY = position.y + handHeight;
    view.fromZ = position.z;
    view.toX = anchor.x;
    view.toY = anchor.y;
    view.toZ = anchor.z;
    // 줄이 걸려 있는 동안에는 대상 표시를 숨긴다 — 줄과 겹쳐 지저분해진다
    view.hasTarget = false;
    /*
     * 장력 — 가까워질수록 1에 가까워져 줄이 펴진다. 걸린 직후에는 늘어져
     * 있다가 당겨지면서 팽팽해지는 변화가 「지금 끌려간다」를 말해 준다.
     */
    const distance = Math.hypot(anchor.x - position.x, anchor.y - position.y, anchor.z - position.z);
    view.tension = 1 - Math.min(1, Math.max(0, distance / maxRange));
    return;
  }

  view.hasTarget = preview !== null;
  if (preview) {
    view.targetX = preview.x;
    view.targetY = preview.y;
    view.targetZ = preview.z;
  }
}

/*
 * 걸 수 있는 대상에 뜨는 표식.
 *
 * 가로등 꼭대기에 겹쳐 그리므로 기둥보다 눈에 띄어야 하고, 그렇다고 화면을
 * 가릴 만큼 크면 조준이 안 된다.
 */
const MARKER_RADIUS = 0.55;
const MARKER_THICKNESS = 0.06;

/** 대상 표시 고리가 도는 속도(rad/s) */
const MARKER_SPIN = 1.8;

export function GrappleVisuals({ view }: { view: GrappleView }) {
  const ropeRef = useRef<THREE.LineSegments>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const spin = useRef(0);

  /*
   * 줄은 정점 두 개짜리 선 하나다.
   *
   * 실린더로 만들면 매 프레임 위치·회전·길이를 다시 계산해야 하고, 이 거리에서
   * 굵기 차이는 보이지 않는다. 정점 두 개를 옮기는 편이 훨씬 싸다.
   */
  const ropeBuffer = useMemo(() => new Float32Array(SEGMENT_FLOAT_COUNT), []);
  const ropeGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(ropeBuffer, 3));
    return geometry;
  }, [ropeBuffer]);

  const markerGeometry = useMemo(
    () => new THREE.TorusGeometry(MARKER_RADIUS, MARKER_THICKNESS, 6, 18),
    [],
  );

  /*
   * R3F는 컴포넌트가 만들어 넘긴 지오메트리를 정리하지 않는다 (Enemies와 같은 이유).
   *
   * 밧줄 쪽을 빠뜨리고 있었다 — 바로 옆에서 표식을 해제하면서. 다른 파일들이
   * `Object.values(geometry)`를 훑는 이유가 이것이다: 하나씩 적으면 하나를
   * 잊는다. 여기도 목록으로 훑는다.
   */
  useLayoutEffect(() => {
    const created = [ropeGeometry, markerGeometry];
    return () => {
      for (const item of created) item.dispose();
    };
  }, [markerGeometry, ropeGeometry]);

  useFrame((_, delta) => {
    const rope = ropeRef.current;
    if (rope) {
      rope.visible = view.attached;
      if (view.attached) {
        const points = ropePoints(
          { x: view.fromX, y: view.fromY, z: view.fromZ },
          { x: view.toX, y: view.toY, z: view.toZ },
          view.tension,
        );
        toSegmentPositions(points, ropeBuffer);
        const positions = ropeGeometry.getAttribute("position") as THREE.BufferAttribute;
        positions.needsUpdate = true;
        // 정점이 움직였으므로 경계구를 다시 잡지 않으면 절두체 컬링에 잘린다.
        ropeGeometry.computeBoundingSphere();
      }
    }

    const marker = markerRef.current;
    if (marker) {
      // 걸려 있는 동안에는 대상 표시를 숨긴다 — 줄과 겹쳐 지저분해진다.
      marker.visible = view.hasTarget && !view.attached;
      if (marker.visible) {
        marker.position.set(view.targetX, view.targetY, view.targetZ);
        spin.current += MARKER_SPIN * delta;
        marker.rotation.set(Math.PI / 2, 0, spin.current);
      }
    }
  });

  return (
    <group>
      <lineSegments ref={ropeRef} geometry={ropeGeometry} visible={false}>
        <lineBasicMaterial color="#2fd4c4" toneMapped={false} />
      </lineSegments>
      <mesh ref={markerRef} geometry={markerGeometry} visible={false}>
        <meshBasicMaterial color="#2fd4c4" toneMapped={false} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
