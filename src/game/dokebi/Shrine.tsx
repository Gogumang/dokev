"use client";

/**
 * 도깨비가 기다리는 자리.
 *
 * 지도에 표식만 있고 그 자리에 아무것도 없으면 도착해도 도착한 줄 모른다.
 * 돌무더기 위에 구슬이 떠 있고, 하늘로 빛기둥이 올라간다 — 빛기둥이 핵심이다.
 * 넓은 도시에서 "저기다"를 멀리서 알리는 유일한 신호다.
 *
 * 인스턴싱을 쓰지 않는다. 최대 두 개뿐이라 규칙이 말하는 "반복 오브젝트 수십
 * 개"가 아니고, 색과 표시 여부가 각자 달라 인스턴싱이 오히려 복잡해진다.
 *
 * 표시 여부를 매 프레임 판정하는 이유: 조건(처치 수·퀘스트)이 공유 객체에 있어
 * 리렌더를 일으키지 않는다. 조건을 채운 순간 바로 나타나야 한다.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import {
  beamOpacity,
  dissolveState,
  DISSOLVE_SECONDS,
  MOTE_COUNT,
  motePosition,
} from "@/game/dokebi/discoveryEffect";
import {
  DOKEBI,
  pendingDiscoveries,
  revealedDokebi,
  type DokebiId,
  type DokebiProgress,
  type DokebiSpirit,
} from "@/game/dokebi/roster";
import { SHRINE_BODY } from "@/game/dokebi/shrineBody";
import type { QuestView } from "@/game/quest/questRunner";
import { ToonMaterial } from "@/game/scene/ToonMaterial";
import { terrainHeight } from "@/game/world/terrain";

/**
 * 조건을 모두 채운 것으로 보는 진행도.
 *
 * 어떤 자리를 **그릴지**는 "아직 만나지 못했는가"만으로 정하고, 실제로
 * 보일지는 각 자리가 매 프레임 판단한다. 컴포넌트 목록이 매 프레임 바뀌면
 * React가 마운트·언마운트를 반복한다.
 */
const ALWAYS_REVEALED: DokebiProgress = {
  defeatedTotal: Number.MAX_SAFE_INTEGER,
  questCompleted: true,
};

/** 빛기둥 높이(m). 건물 최고 높이(26)보다 높아야 골목에서도 보인다 */
const BEAM_HEIGHT = 34;
/** 구슬이 떠 있는 높이(m) */
const ORB_HEIGHT = 1.65;
/** 위아래로 떠다니는 진폭(m) */
const BOB_AMPLITUDE = 0.16;

export interface ShrinesProps {
  /** 처치 누적 수를 읽는다 */
  link: { defeatedTotal: number; bossDefeated: boolean };
  /** 퀘스트 완료 여부를 읽는다 */
  questView: QuestView;
  /** 이미 만난 도깨비 — 자리를 치운다 */
  met: readonly DokebiId[];
  reducedMotion: boolean;
}

export function Shrines({ link, questView, met, reducedMotion }: ShrinesProps) {
  /*
   * 목록을 여기서 다시 만들지 않는다. 지도 표식과 **같은 함수**를 써야
   * 표식이 있는데 자리가 없거나, 자리는 있는데 표식이 없는 일이 생기지 않는다.
   *
   * 조건(처치 수·퀘스트)은 매 프레임 바뀔 수 있으므로 여기서는 "아직 만나지
   * 못한 것"까지만 고르고, 실제로 드러났는지는 각 자리가 프레임마다 본다.
   */
  const waiting = useMemo(() => pendingDiscoveries(ALWAYS_REVEALED, met), [met]);

  /*
   * 방금 만난 도깨비는 잠시 더 남겨 소멸 연출을 재생한다.
   *
   * met에서 빠지는 즉시 언마운트하면 가장 공들여 찾아간 순간이 "사라짐"으로
   * 끝난다. 목록에서 빠진 id를 붙잡아 두었다가 연출이 끝나면 놓아 준다.
   */
  const [farewell, setFarewell] = useState<DokebiId[]>([]);
  const previous = useRef<DokebiId[] | null>(null);

  useEffect(() => {
    const ids = waiting.map((spirit) => spirit.id);
    const before = previous.current;
    previous.current = ids;
    // 첫 렌더에서는 비교 대상이 없다. 시작하자마자 연출이 돌면 안 된다.
    if (before === null) return;

    const gone = before.filter((id) => !ids.includes(id));
    if (gone.length === 0) return;

    setFarewell((current) => [...current, ...gone]);
    const timer = window.setTimeout(
      () => setFarewell((current) => current.filter((id) => !gone.includes(id))),
      DISSOLVE_SECONDS * 1000 + 100,
    );
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const shown = [...waiting, ...farewell.map((id) => DOKEBI[id])];
  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((spirit) => (
        <Shrine
          key={spirit.id}
          spirit={spirit}
          link={link}
          questView={questView}
          reducedMotion={reducedMotion}
          dissolving={farewell.includes(spirit.id)}
        />
      ))}
    </>
  );
}

function Shrine({
  spirit,
  link,
  questView,
  reducedMotion,
  dissolving,
}: {
  spirit: DokebiSpirit;
  link: { defeatedTotal: number; bossDefeated: boolean };
  questView: QuestView;
  reducedMotion: boolean;
  /** 방금 만나 사라지는 중인지 */
  dissolving: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const moteRef = useRef<THREE.InstancedMesh>(null);
  const elapsed = useRef(0);
  /** 소멸 연출이 시작된 뒤 지난 시간(초) */
  const dissolveElapsed = useRef(0);

  /** 알갱이 행렬 계산용. 매 프레임 새로 만들지 않는다 */
  const moteMatrix = useMemo(() => new THREE.Matrix4(), []);

  const geometry = useMemo(
    () => ({
      // 돌무더기 — 아래로 갈수록 넓다. 세 단이면 쌓았다는 인상이 난다.
      base: new THREE.CylinderGeometry(SHRINE_BODY.baseTopRadius, SHRINE_BODY.baseBottomRadius, SHRINE_BODY.baseHeight, 12),
      middle: new THREE.CylinderGeometry(SHRINE_BODY.middleTopRadius, SHRINE_BODY.middleBottomRadius, SHRINE_BODY.middleHeight, 10),
      top: new THREE.CylinderGeometry(SHRINE_BODY.topTopRadius, SHRINE_BODY.topBottomRadius, SHRINE_BODY.topHeight, 8),
      orb: new THREE.SphereGeometry(SHRINE_BODY.orbRadius, 16, 12),
      // 알갱이는 아주 작아 면 수를 최소로 줄인다.
      mote: new THREE.SphereGeometry(SHRINE_BODY.moteRadius, 6, 4),
      // 위가 열린 원통. 뚜껑이 있으면 위에서 볼 때 원판이 떠 보인다.
      beam: new THREE.CylinderGeometry(SHRINE_BODY.beamTopRadius, SHRINE_BODY.beamBottomRadius, BEAM_HEIGHT, 12, 1, true),
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


  useFrame((_, rawDelta) => {
    const root = rootRef.current;
    if (!root) return;

    // 조건을 채우기 전에는 자리 자체가 보이지 않는다 — 찾아갈 이유가 지도에서
    // 먼저 생겨야 한다.
    // 사라지는 중에는 조건을 다시 묻지 않는다 — 이미 만난 도깨비다.
    root.visible = dissolving
      ? true
      : revealedDokebi({
          defeatedTotal: link.defeatedTotal,
          questCompleted: questView.firstQuestDone,
          bossDefeated: link.bossDefeated,
        }).includes(spirit.id);
    if (!root.visible) return;

    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);
    elapsed.current += dt;

    const fade = dissolving ? dissolveState((dissolveElapsed.current += dt)) : null;

    if (orbRef.current) {
      const bob = reducedMotion ? 0 : Math.sin(elapsed.current * 1.6) * BOB_AMPLITUDE;
      orbRef.current.position.y = ORB_HEIGHT + bob + (fade?.orbLift ?? 0);
      orbRef.current.rotation.y = elapsed.current * 0.8;
      const scale = fade?.orbScale ?? 1;
      orbRef.current.scale.set(scale, scale, scale);
    }

    // 알갱이는 소멸 중에만 나타난다.
    const motes = moteRef.current;
    if (motes) {
      motes.visible = fade !== null;
      if (fade) {
        for (let i = 0; i < MOTE_COUNT; i += 1) {
          const mote = motePosition(i, dissolveElapsed.current);
          moteMatrix.makeScale(mote.scale, mote.scale, mote.scale);
          moteMatrix.setPosition(mote.x, mote.y, mote.z);
          motes.setMatrixAt(i, moteMatrix);
        }
        motes.instanceMatrix.needsUpdate = true;
      }
    }

    if (beamRef.current) {
      const material = beamRef.current.material as THREE.MeshBasicMaterial;
      // 아주 느리게 숨쉰다. 깜빡이면 신호가 아니라 경고등처럼 보인다.
      const base = beamOpacity(elapsed.current, reducedMotion);
      material.opacity = base * (fade?.beamFade ?? 1);
    }
  });

  const home = spirit.home;
  if (!home) return null;

  return (
    <group ref={rootRef} position={[home.x, terrainHeight(home.x, home.z), home.z]} visible={false}>
      <mesh geometry={geometry.base} position={[0, 0.15, 0]} castShadow>
        <ToonMaterial color="#4a4552" />
      </mesh>
      <mesh geometry={geometry.middle} position={[0, 0.44, 0]} castShadow>
        <ToonMaterial color="#565061" />
      </mesh>
      <mesh geometry={geometry.top} position={[0, 0.71, 0]} castShadow>
        <ToonMaterial color="#635c70" />
      </mesh>

      {/* 구슬 — 스스로 빛나므로 조명을 받지 않는다 */}
      <mesh ref={orbRef} geometry={geometry.orb} position={[0, ORB_HEIGHT, 0]}>
        <meshBasicMaterial color={spirit.bodyColor} toneMapped={false} />
      </mesh>

      {/* 빛기둥 — 가산 합성이라 깊이 기록을 끈다 (가로등 빛 웅덩이와 같은 이유) */}
      <mesh ref={beamRef} geometry={geometry.beam} position={[0, BEAM_HEIGHT / 2, 0]}>
        <meshBasicMaterial
          color={spirit.accentColor}
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* 흩어지는 빛 알갱이 — 소멸 연출에서만 보인다 */}
      <instancedMesh ref={moteRef} args={[geometry.mote, undefined, MOTE_COUNT]} visible={false}>
        <meshBasicMaterial color={spirit.accentColor} toneMapped={false} />
      </instancedMesh>

      <pointLight color={spirit.bodyColor} intensity={4} distance={12} position={[0, 1.8, 0]} />
    </group>
  );
}
