"use client";

/**
 * 도시 렌더링.
 *
 * 반복 오브젝트는 전부 InstancedMesh로 묶는다 (PROJECT_PLAN 「성능 예산」). 레이어가
 * 열 개 넘게 늘어도 드로우콜은 레이어 수만큼만 늘어난다.
 *
 * UV를 인스턴스마다 다르게 주는 방법이 이 파일의 핵심이다. 인스턴스는 재질을
 * 공유하므로 텍스처를 바꿀 수 없다. 대신 `aUvOffset`/`aUvScale` 인스턴스 속성을
 * 넘기고 정점 셰이더에서 UV에 적용한다. 이것으로
 *   - 건물 파사드: 크기가 달라도 창 크기 일정 (배율만 사용)
 *   - 간판·패널: 아틀라스에서 서로 다른 셀 선택 (오프셋 + 배율)
 *   - 차양: 폭에 비례한 줄무늬 반복
 * 을 전부 드로우콜 하나로 처리한다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { mixHex } from "@/game/core/color";
import type { QualityPreset } from "@/game/systems/quality";
import { atlasCellUv, getAtlas } from "@/game/world/atlasTextures";
import { CAR_PALETTE, FIXTURE_TONE, type CityDetails, type DetailInstance } from "@/game/world/cityDetails";
import { Curbs, Ground, Sidewalks } from "@/game/world/GroundSurfaces";
import { PondWater, Sea } from "@/game/world/Sea";
import {
  PROP_PALETTE,
  SHOPFRONT_PALETTE,
  ROOFTOP_PALETTE,
  ROAD_MARK_PALETTE,
  TRUNK_PALETTE,
  ROCK_PALETTE,
  HILLSIDE_PALETTE,
  OLD_TOWN_PALETTE,
  PLANTER_PALETTE,
  WALL_GREEN_PALETTE,
  MARKET_PALETTE,
  NEON_OFF_COLOR,
  NEON_PALETTE,
  PARK_PALETTE,
  UNDERGROWTH_PALETTE,
  CROWN_PALETTE,
  CONIFER_PALETTE,
  AWNING_PALETTE,
  BANNER_PALETTE,
  CAR_CABIN_PALETTE,
  FIXTURE_PALETTE,
} from "@/game/world/cityPalettes";
import { FacadeGroup } from "@/game/world/FacadeGroup";
import { injectUvTransform, setUvAttributes } from "@/game/world/instancedUv";
import { projectInstances, WHITE_PALETTE } from "@/game/world/instances";
import { buildStandBoxes } from "@/game/world/vehicleStands";
import { buildHanokRoofs, buildRoofs } from "@/game/world/roofs";
import { HanokRoofs, Roofs } from "@/game/world/RoofMeshes";
import { CITY, type BoxInstance, type CityLayout } from "@/game/world/cityLayout";
import { collectVisible, partitionByBlock, visibleBlocks, visibleKey } from "@/game/world/streaming";
import { terrainHeight } from "@/game/world/terrain";
import {
  FACADE_TONES,
  getLampGlowTexture,
  getTileTexture,
  getToonGradientTexture,
} from "@/game/world/textures";



/* ------------------------------------------------------------------ *
 * 인스턴스 채우기
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * 공통 컴포넌트
 * ------------------------------------------------------------------ */

interface InstancedBoxesProps {
  items: readonly DetailInstance[];
  palette: readonly string[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** 조명을 받지 않아야 하는 것(도로 표시 등)에 쓴다 */
  unlit?: boolean;
  /**
   * 인스턴스 하나의 모양. 기본은 상자다.
   *
   * `blob`은 수관 전용이다 — 도시의 나머지는 상자로 두는 편이 결이 일관되고,
   * 도형을 늘리면 그만큼 묶음(드로우콜)이 갈린다.
   */
  shape?: "box" | "blob" | "cone";
}

/** 텍스처 없는 단색 인스턴스 묶음. */
function InstancedBoxes({
  items,
  palette,
  castShadow = false,
  receiveShadow = false,
  unlit = false,
  shape = "box",
}: InstancedBoxesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  useLayoutEffect(() => {
    if (meshRef.current) projectInstances(meshRef.current, items, palette);
  }, [items, palette]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {/*
        * 수관만 상자가 아니다.
        *
        * 도시의 모든 것이 축 정렬 상자라 그 결정이 일관돼 보였는데, **나무만은
        * 상자가 나무로 안 읽힌다.** 숲에 서 보면 초록 벽이 늘어선 창고 단지고,
        * 3인칭 카메라가 늘 수관 높이를 지나가니 매 순간 그게 보인다.
        *
        * 스무면체 1단 세분(80면)이면 실루엣이 둥글어지면서도 각이 남아 도시의
        * 각진 결과 어울린다. 반지름을 0.5로 두어 **상자와 같은 스케일 규칙**을
        * 쓴다 — `projectInstances`는 width/height/depth를 그대로 scale에 넣으므로
        * 지름 1인 도형이어야 크기 값의 뜻이 바뀌지 않는다.
        */}
      {shape === "blob" && <icosahedronGeometry args={[0.5, 1]} />}
      {/*
        * 침엽수. 반지름 0.5·높이 1이라 상자와 스케일 규칙이 같다.
        * 옆면을 일곱으로 끊는다 — 매끈하면 이 월드의 각진 결에서 혼자 떠 보이고,
        * 넷이면 종이 고깔이 된다.
        */}
      {shape === "cone" && <coneGeometry args={[0.5, 1, 7]} />}
      {shape === "box" && <boxGeometry args={[1, 1, 1]} />}
      {unlit ? (
        <meshBasicMaterial toneMapped={false} />
      ) : (
        /*
         * Toon은 Lambert와 같은 난반사 계산에 그라데이션 맵으로 계단만 씌운
         * 것이라 비용이 사실상 같다. 도시의 **모든** 음영이 같은 단수를 써야
         * 한다 — 건물만 계단이고 소품은 매끈하면 소품이 다른 게임에서 온
         * 것처럼 떠 보인다.
         */
        <meshToonMaterial gradientMap={toonGradient} />
      )}
    </instancedMesh>
  );
}

type AtlasKindName = "shopHorizontal" | "shopVertical" | "banner" | "prop";

interface AtlasInstancesProps {
  items: readonly DetailInstance[];
  atlasKind: AtlasKindName;
  palette?: readonly string[];
  /** 간판처럼 역광에서도 색이 살아 있어야 하는 것은 조명을 받지 않는다 */
  unlit?: boolean;
  castShadow?: boolean;
}

/** 아틀라스에서 인스턴스마다 다른 셀을 골라 그리는 묶음. */
function AtlasInstances({
  items,
  atlasKind,
  palette = WHITE_PALETTE,
  unlit = true,
  castShadow = false,
}: AtlasInstancesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const atlas = useMemo(() => getAtlas(atlasKind), [atlasKind]);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  const uv = useMemo(() => {
    const offsets = new Float32Array(items.length * 2);
    const scales = new Float32Array(items.length * 2);
    items.forEach((item, index) => {
      const cell = atlasCellUv(atlas, item.cell ?? 0);
      offsets[index * 2] = cell.offsetX;
      offsets[index * 2 + 1] = cell.offsetY;
      scales[index * 2] = cell.scaleX;
      scales[index * 2 + 1] = cell.scaleY;
    });
    return { offsets, scales };
  }, [items, atlas]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    projectInstances(mesh, items, palette);
    setUvAttributes(mesh, uv.offsets, uv.scales);
  }, [items, palette, uv]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      {unlit ? (
        <meshBasicMaterial map={atlas.texture} toneMapped={false} onBeforeCompile={injectUvTransform} />
      ) : (
        <meshToonMaterial
          map={atlas.texture}
          gradientMap={toonGradient}
          onBeforeCompile={injectUvTransform}
        />
      )}
    </instancedMesh>
  );
}

interface TiledInstancesProps {
  items: readonly DetailInstance[];
  texture: THREE.Texture;
  palette?: readonly string[];
  /** 세로 반복 횟수. 지정하지 않으면 1 */
  repeatY?: number;
  unlit?: boolean;
  castShadow?: boolean;
}

/**
 * 반복 타일 텍스처를 인스턴스마다 다른 횟수로 반복시키는 묶음.
 *
 * 차양 줄무늬와 1층 유리처럼 "폭에 비례해 무늬 수가 달라져야 하는" 것에 쓴다.
 */
function TiledInstances({
  items,
  texture,
  palette = WHITE_PALETTE,
  repeatY = 1,
  unlit = false,
  castShadow = false,
}: TiledInstancesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  const uv = useMemo(() => {
    const offsets = new Float32Array(items.length * 2);
    const scales = new Float32Array(items.length * 2);
    items.forEach((item, index) => {
      scales[index * 2] = item.uvRepeatX ?? 1;
      scales[index * 2 + 1] = repeatY;
    });
    return { offsets, scales };
  }, [items, repeatY]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    projectInstances(mesh, items, palette);
    setUvAttributes(mesh, uv.offsets, uv.scales);
  }, [items, palette, uv]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      {unlit ? (
        <meshBasicMaterial map={texture} toneMapped={false} onBeforeCompile={injectUvTransform} />
      ) : (
        <meshToonMaterial
          map={texture}
          gradientMap={toonGradient}
          onBeforeCompile={injectUvTransform}
        />
      )}
    </instancedMesh>
  );
}


/** 꺼진 가로등 갓 색 — 낮에는 그냥 금속 갓이다 */
const LAMP_OFF_COLOR = "#6b6470";
/** 켜진 색 */
const LAMP_LIT_COLOR = "#ffe6b0";
/** 빛 웅덩이 지름(m) */
const LAMP_POOL_METERS = 7.5;
/** 이 아래로는 웅덩이를 그리지 않는다 — 한낮에 바닥에 원이 보이면 안 된다 */
const LAMP_POOL_MIN_GLOW = 0.25;

/**
 * 가로등이 바닥에 만드는 빛 웅덩이.
 *
 * 가산 합성이라 깊이 기록을 끈다. 켜 두면 뒤에 오는 반투명 요소가 웅덩이에
 * 가려 사라진다.
 */
function LampPools({ lamps, glow }: { lamps: readonly BoxInstance[]; glow: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => getLampGlowTexture(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    lamps.forEach((lamp, index) => {
      // 바닥에서 살짝 띄운다. 정확히 0이면 도로와 z-파이팅이 난다.
      matrix.makeTranslation(lamp.x, terrainHeight(lamp.x, lamp.z) + 0.03, lamp.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lamps]);

  if (lamps.length === 0 || glow < LAMP_POOL_MIN_GLOW) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, lamps.length]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[LAMP_POOL_METERS, LAMP_POOL_METERS]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={glow}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** 전깃줄. 얇은 실린더 대신 선으로 그린다 — 정점 수가 비교가 안 되게 적다. */
function PowerLines({ vertices }: { vertices: number[] }) {
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return buffer;
  }, [vertices]);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  if (vertices.length === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#241f2e" transparent opacity={0.85} />
    </lineSegments>
  );
}

/** City가 읽는 플레이어 위치. GameScene의 playerLink가 그대로 들어온다 */
export interface CityViewer {
  position: { x: number; y: number; z: number };
}

/**
 * 보이는 구역을 추적한다.
 *
 * useFrame에서 키를 비교하고 **바뀔 때만** setState한다. 구역을 넘는 일은
 * 몇 초에 한 번이라 리렌더 비용이 문제되지 않고, 대신 매 프레임 수천 개
 * 인스턴스를 다시 거르는 일을 피할 수 있다.
 */
function useVisibleBlocks(viewer: CityViewer, radiusBlocks: number): number[] {
  const [key, setKey] = useState(() => visibleKey(viewer.position.x, viewer.position.z, radiusBlocks));
  const lastKey = useRef(key);

  useFrame(() => {
    const next = visibleKey(viewer.position.x, viewer.position.z, radiusBlocks);
    if (next === lastKey.current) return;
    lastKey.current = next;
    setKey(next);
  });

  // key가 좌표를 담고 있으므로 여기서 구역 목록을 다시 만들어도 안전하다.
  return useMemo(() => {
    const [col, row, radius] = key.split(":").map(Number);
    return visibleBlocks(
      // 열·행을 좌표로 되돌릴 필요 없이 중심 구역만 알면 된다.
      (col - (CITY.gridSize - 1) / 2) * (CITY.blockSize + CITY.roadWidth),
      (row - (CITY.gridSize - 1) / 2) * (CITY.blockSize + CITY.roadWidth),
      radius,
    );
  }, [key]);
}

/** 구역별로 나눠 두고 보이는 것만 돌려주는 훅. */
function useStreamed<T extends { x: number; z: number }>(
  items: readonly T[],
  blocks: readonly number[],
): T[] {
  const buckets = useMemo(() => partitionByBlock(items), [items]);
  return useMemo(() => collectVisible(buckets, blocks), [buckets, blocks]);
}

interface CityProps {
  layout: CityLayout;
  details: CityDetails;
  quality: QualityPreset;
  viewer: CityViewer;
  /** 창문 발광 세기(0~1). 시간대 프리셋에서 온다 */
  nightGlow: number;
}

export function City({ layout, details, quality, viewer, nightGlow }: CityProps) {
  const groundSize = layout.halfExtent * 2 + 40;
  const shadows = quality.shadows;

  const blocks = useVisibleBlocks(viewer, quality.streamRadius);

  /*
   * 건물과 소품만 스트리밍한다. 가로등·도로 표시·전깃줄은 끊기면 도로가
   * 사라진 것처럼 보여서 항상 그린다.
   *
   * 예전 주석은 "인스턴스가 적어서"라고 적어 두었는데 사실이 아니다 —
   * 도로 표시만 2,172개로 항상 그리는 것 중 3분의 2다. 그래도 유지하는
   * 이유는 개수가 아니라 **정적 InstancedMesh라 프레임당 비용이 드로우콜
   * 하나**이기 때문이다. 스트리밍해도 드로우콜은 그대로 하나고, 구역을
   * 넘을 때마다 버퍼를 다시 만드는 비용만 생긴다.
   */
  const buildings = useStreamed(layout.buildings, blocks);
  const setbacks = useStreamed(layout.setbacks, blocks);
  const groundPlates = useStreamed(details.groundPlates, blocks);
  /* 세워 둔 탈것 — 자리는 도시가 갖고, 상자로 펴는 일만 여기서 한다 */
  const standBoxes = useMemo(
    () =>
      buildStandBoxes(
        details.vehicleStands,
        FIXTURE_TONE.lightMetal,
        FIXTURE_TONE.cone,
        // 조랑말 털은 나무색을 쓴다 — 금속·주황 사이에서 유일하게 살아 있는 색이다
        FIXTURE_TONE.wood,
      ),
    [details.vehicleStands],
  );
  const parkedVehicles = useStreamed(standBoxes, blocks);
  const shopfronts = useStreamed(details.shopfronts, blocks);
  const rooftops = useStreamed(details.rooftops, blocks);
  const awnings = useStreamed(details.awnings, blocks);
  const shopGlass = useStreamed(details.shopGlass, blocks);
  const signsHorizontal = useStreamed(details.signsHorizontal, blocks);
  const signsVertical = useStreamed(details.signsVertical, blocks);
  const banners = useStreamed(details.banners, blocks);
  const propPanels = useStreamed(details.propPanels, blocks);
  const streetFixtures = useStreamed(details.streetFixtures, blocks);
  const rocks = useStreamed(layout.rocks, blocks);
  const stoneWalls = useStreamed(layout.stoneWalls, blocks);
  const gates = useStreamed(layout.gates, blocks);
  const wallPlanters = useStreamed(layout.wallPlanters, blocks);
  const wallGreens = useStreamed(layout.wallGreens, blocks);
  const alleySteps = useStreamed(layout.alleySteps, blocks);
  const alleyRails = useStreamed(layout.alleyRails, blocks);
  const marketCanopies = useStreamed(layout.marketCanopies, blocks);
  const marketStalls = useStreamed(layout.marketStalls, blocks);
  const pondWater = useStreamed(layout.pondWater, blocks);
  const pondRim = useStreamed(layout.pondRim, blocks);
  const playground = useStreamed(layout.playground, blocks);
  const parkPaths = useStreamed(layout.parkPaths, blocks);
  const undergrowth = useStreamed(layout.undergrowth, blocks);
  const neon = useStreamed(layout.neon, blocks);

  /*
   * 네온 색을 밤 정도로 섞는다.
   *
   * 가로등(`LAMP_OFF_COLOR`)과 같은 방식이다 — 다섯 색이라 배열로 섞는 것만
   * 다르다. `nightGlow`가 바뀔 때만 다시 만든다: 매 프레임 새 배열을 넘기면
   * `projectInstances`가 인스턴스 색을 통째로 다시 쓴다.
   */
  const neonPalette = useMemo(
    () => NEON_PALETTE.map((color) => mixHex(NEON_OFF_COLOR, color, nightGlow)),
    [nightGlow],
  );
  const treeTrunks = useStreamed(details.treeTrunks, blocks);
  const treeCrowns = useStreamed(details.treeCrowns, blocks);
  const treeCones = useStreamed(details.treeCones, blocks);
  const carBodies = useStreamed(details.carBodies, blocks);
  const carCabins = useStreamed(details.carCabins, blocks);

  /*
   * 톤별로 건물을 나눈다. 텍스처가 톤마다 다르므로 묶음도 톤 단위여야 한다.
   *
   * 옥탑(setbacks)도 같은 묶음에 넣는다 — 같은 파사드 텍스처를 쓰므로
   * 드로우콜이 늘지 않는다. 배치에서 나눠 둔 이유는 렌더가 아니라
   * 디테일(1층 상가·간판)을 붙이지 않기 위해서다.
   */
  const facadeGroups = useMemo(() => {
    const groups: BoxInstance[][] = FACADE_TONES.map(() => []);
    for (const building of buildings) {
      groups[building.tone % FACADE_TONES.length].push(building);
    }
    for (const tower of setbacks) {
      groups[tower.tone % FACADE_TONES.length].push(tower);
    }
    return groups;
  }, [buildings, setbacks]);

  /* 건물마다 기둥 넷 + 처마 하나. 191채 전부여도 상자 하나에 담겨 드로우콜은 1이다 */
  /* 저층 건물에만 올린다. 배치는 순수 함수가 정하고 여기서는 스트리밍만 건다 */
  const roofs = useMemo(() => buildRoofs(buildings), [buildings]);
  const hanokRoofs = useMemo(() => buildHanokRoofs(buildings), [buildings]);

  const glassTexture = useMemo(() => getTileTexture("shopGlass"), []);
  const awningTexture = useMemo(() => getTileTexture("awningStripe"), []);

  return (
    <group>
      <Ground size={groundSize} receiveShadow={shadows} />
      {/* 바다와 벼랑 — 도시 밖. 월드 경계를 「섬의 끝」으로 설명한다 */}
      <Sea halfExtent={layout.halfExtent} />
      <Sidewalks receiveShadow={shadows} />
      {/* 연석 — 인도 판 다음에 그린다. 판 위에 얹히는 턱이다 */}
      <Curbs receiveShadow={shadows} />

      {facadeGroups.map((items, toneIndex) => (
        <FacadeGroup
          key={toneIndex}
          items={items}
          toneIndex={toneIndex}
          quality={quality}
          nightGlow={nightGlow}
        />
      ))}

      {/*
        건물 모서리의 검은 기둥·처마를 뺐다.

        카툰 렌더의 「선」을 실제 지오메트리로 세운 것이었는데, 화면에서는
        **건물마다 검은 줄이 그어진 것**으로 보였다. 참고하는 트레일러의
        건물에는 그런 선이 하나도 없다 — 벽은 깨끗하고, 형태는 창틀·차양·
        처마의 그림자가 만든다. 선을 그어 형태를 설명하는 대신 형태 자체를
        만드는 쪽이 맞다.
      */}

      {/* 저층 건물의 박공지붕 — 스카이라인을 상자 밭에서 꺼낸다 */}
      <Roofs items={roofs} quality={quality} />
      <HanokRoofs items={hanokRoofs} quality={quality} />

      {/* 건물에 붙는 것들 */}
      <InstancedBoxes
        items={shopfronts}
        palette={SHOPFRONT_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <TiledInstances items={shopGlass} texture={glassTexture} unlit />
      <InstancedBoxes
        items={rooftops}
        palette={ROOFTOP_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <TiledInstances
        items={awnings}
        texture={awningTexture}
        palette={AWNING_PALETTE}
        castShadow={shadows}
      />

      {/* 간판 — 아틀라스에서 셀을 골라 글자가 보이게 한다 */}
      <AtlasInstances items={signsHorizontal} atlasKind="shopHorizontal" />
      <AtlasInstances items={signsVertical} atlasKind="shopVertical" />
      <AtlasInstances items={banners} atlasKind="banner" palette={BANNER_PALETTE} />
      <AtlasInstances items={propPanels} atlasKind="prop" unlit={false} />

      {/* 거리 소품과 가로수 */}
      <InstancedBoxes
        items={streetFixtures}
        palette={FIXTURE_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <InstancedBoxes items={layout.props} palette={PROP_PALETTE} castShadow={shadows} receiveShadow={shadows} />
      {/* 선돌 — 자연 구역의 그래플 지점이자 이정표. 각지면 건물처럼 보인다 */}
      <InstancedBoxes
        items={rocks}
        palette={ROCK_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
        shape="blob"
      />
      {/* 옛 마을의 돌담과 홍살문. 눈높이에 있어 그 구역의 인상을 만든다 */}
      <InstancedBoxes
        items={stoneWalls}
        palette={OLD_TOWN_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <InstancedBoxes items={gates} palette={OLD_TOWN_PALETTE} castShadow={shadows} receiveShadow={shadows} />
      {/*
        * 담 아래 화분 — 나무 상자와 철쭉. 꽃은 `blob`이라 묶음이 따로다.
        * 상자는 그림자를 드리우고, 꽃은 상자 위에 얹혀 받기만 한다.
        */}
      <InstancedBoxes
        items={wallPlanters}
        palette={PLANTER_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      {/*
        * 담에 붙는 식물 — 화분의 철쭉과 담쟁이. 둘 다 **둥근 덩어리**다.
        * 상자로 두었더니 4m 거리에서 납작한 판으로 읽혔다 — 잡초의 철쭉은
        * 둥근데 화분 꽃만 각져 있어 더 눈에 띄었다.
        *
        * 담쟁이는 **그림자를 드리운다** — 담 위에서 갓 위로 솟아 있어 그
        * 그림자가 담 바깥면에 떨어지고, 그것이 담쟁이를 붙어 있는 것으로 만든다.
        */}
      <InstancedBoxes
        items={wallGreens}
        palette={WALL_GREEN_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
        shape="blob"
      />
      {/*
        * 언덕 주택가의 골목 계단.
        *
        * 디딤판은 바닥에 눕는 판이라 **그림자를 드리우지 않는다** — 단이
        * 20cm뿐이라 드리워 봐야 자기 밑에 검은 선만 남는다(공원 산책로와 같다).
        * 대신 **받는다**: 골목은 양옆이 집이라 하루 대부분 그늘이고, 그 그늘이
        * 지지 않으면 계단만 환하게 떠서 바닥에 붙어 보이지 않는다.
        *
        * 난간은 반대다. 가늘어도 서 있는 것이라 그림자가 계단을 가로지르는
        * 줄무늬로 떨어진다 — 계단이 계단으로 읽히는 데 이쪽이 더 크게 쓰인다.
        */}
      <InstancedBoxes items={alleySteps} palette={HILLSIDE_PALETTE} receiveShadow={shadows} />
      <InstancedBoxes
        items={alleyRails}
        palette={HILLSIDE_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      {/*
        * 노을 시장. 천막은 **그림자를 드리운다** — 그 그늘이 골목을 덮는 감각의
        * 절반이다. 받지는 않는다(가장 위에 있어 받을 것이 없다).
        */}
      <InstancedBoxes items={marketCanopies} palette={MARKET_PALETTE} castShadow={shadows} />
      <InstancedBoxes
        items={marketStalls}
        palette={MARKET_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />

      {/*
        * 너른 공원. 산책로와 연못은 바닥에 눕는 판이라 그림자를 드리우지
        * 않는다 — 두께가 10cm라 드리워 봐야 자기 밑에 검은 선만 남는다.
        */}
      {/*
        * 발밑 잡초. 그림자를 **드리우지 않는다** — 무릎 아래라 자기 밑에만
        * 점이 찍히는데, 수백 개가 그림자 맵에 들어가면 그만큼 해상도를 먹어
        * 정작 건물 그림자가 거칠어진다.
        */}
      {/*
        * 번화가 네온. 조명을 받지 않는다 — 관 자체가 광원처럼 보여야 하고,
        * 그림자도 드리우지 않는다(가느다란 관의 그림자는 얼룩으로만 남는다).
        */}
      <InstancedBoxes items={neon} palette={neonPalette} unlit />
      <InstancedBoxes
        items={undergrowth}
        palette={UNDERGROWTH_PALETTE}
        receiveShadow={shadows}
        shape="blob"
      />
      <InstancedBoxes items={parkPaths} palette={PARK_PALETTE} receiveShadow={shadows} />
      <InstancedBoxes items={pondRim} palette={PARK_PALETTE} receiveShadow={shadows} />
      {/* 연못 수면 — 바다와 같은 방식으로 UV를 흘린다 */}
      <PondWater items={pondWater} />
      <InstancedBoxes
        items={playground}
        palette={PARK_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <InstancedBoxes items={treeTrunks} palette={TRUNK_PALETTE} castShadow={shadows} />
      <InstancedBoxes items={treeCrowns} palette={CROWN_PALETTE} castShadow={shadows} shape="blob" />
      {/* 침엽수 — 숲과 옛 마을. 원뿔이라 묶음이 따로다 */}
      <InstancedBoxes items={treeCones} palette={CONIFER_PALETTE} castShadow={shadows} shape="cone" />

      {/* 주차 차량 */}
      <InstancedBoxes
        items={carBodies}
        palette={CAR_PALETTE}
        castShadow={shadows}
        receiveShadow={shadows}
      />
      <InstancedBoxes items={carCabins} palette={CAR_CABIN_PALETTE} castShadow={shadows} />

      {/* 바닥 표시는 조명을 받지 않는다 — 역광에서도 선이 보여야 한다 */}
      <InstancedBoxes items={details.roadMarks} palette={ROAD_MARK_PALETTE} unlit />
      {/* 점자블록·빗물받이·맨홀. 발밑에만 보이면 되므로 가까운 구역만 그린다 */}
      <InstancedBoxes items={groundPlates} palette={ROAD_MARK_PALETTE} unlit />
      {/* 거리에 세워진 공유 킥보드와 자전거 */}
      <InstancedBoxes items={parkedVehicles} palette={FIXTURE_PALETTE} castShadow={shadows} />
      <InstancedBoxes items={layout.crosswalks} palette={["#f2efe6"]} unlit />

      {/* 가로등 — 갓은 밤에 스스로 빛나고, 바닥에는 빛 웅덩이가 깔린다 */}
      <InstancedBoxes
        items={layout.streetLamps}
        palette={[mixHex(LAMP_OFF_COLOR, LAMP_LIT_COLOR, nightGlow)]}
        unlit
      />
      <LampPools lamps={layout.streetLamps} glow={nightGlow} />

      <PowerLines vertices={details.wireVertices} />
    </group>
  );
}

/**
 * 노을 조명.
 *
 * 그림자 카메라는 도시 전체를 덮도록 고정한다. 플레이어를 따라다니게 만들면
 * 그림자 해상도는 좋아지지만 매 프레임 그림자 맵을 다시 그려야 해서 비싸다.
 */
