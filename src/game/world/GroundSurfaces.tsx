"use client";

/**
 * 지면과 인도 — 도시의 바닥.
 *
 * `City.tsx`가 800줄 상한에 닿아 분리했다. 이 둘은 다른 레이어와 성격이 다르다:
 * 나머지는 전부 인스턴스 상자인데, 여기는 **월드 크기의 면 하나**(지면)와
 * 그 위에 까는 판(인도)이다. 지형 고저차가 들어오면서 지면이 평면 한 장에서
 * 격자로 바뀐 것도 이 파일에서만 일어난다.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { zoneAt } from "@/game/world/districts";
import { ZONES, type GroundKind, type ZoneId } from "@/game/world/zones";
import { ROAD_SURFACE_COLOR } from "@/game/world/cityPalettes";
import { projectInstances } from "@/game/world/instances";
import { buildCurbs, buildSidewalkSurface, SIDEWALK_SLAB_SIZE } from "@/game/world/sidewalks";
import { buildTactileGuideways, isRoadSurface } from "@/game/world/streetGround";
import { terrainHeight } from "@/game/world/terrain";
import {
  ASPHALT_TILE_METERS,
  getTileTexture,
  getToonGradientTexture,
  GRASS_TILE_METERS,
  PAVING_TILE_METERS,
} from "@/game/world/textures";

/**
 * 지면 격자 한 칸의 크기(m).
 *
 * 언덕 하나가 88m이므로 4m면 마루 하나에 스무 칸이 들어간다 — 각져 보이지
 * 않는다. 더 잘게 나누면 삼각형만 늘고 실루엣은 그대로다.
 */
const GROUND_CELL_METERS = 4;

/**
 * 지면 — 구역마다 다른 바닥 한 장씩.
 *
 * 한 장이었다. 구역 색을 **정점 색**으로 칠해 숲을 초록으로 물들이려 했는데
 * 두 번 실패했다. 첫째, 색만 바꿔서는 아스팔트의 균열과 보수 자국이 그대로
 * 남아 잔디밭에 검은 금이 그어졌다 — 색은 재질이 아니다. 둘째, `vertexColors`는
 * **색 속성이 없으면 조용히 새까맣게 칠한다**(vColor가 0). 지오메트리를
 * useMemo가 캐시하는 구조라 속성을 넣는 줄 하나가 어긋나면 바닥 전체가
 * 사라졌고, 화면에는 「밤인가?」로 보여서 원인을 찾는 데 오래 걸렸다.
 *
 * 그래서 정점 색을 쓰지 않는다. **구역마다 메시를 하나씩** 만들고 각자
 * 텍스처와 색을 재질에 직접 준다. 색이 없으면 흰 바닥이 되어 **눈에 띄게
 * 틀린다** — 조용히 검게 죽는 것보다 낫다.
 *
 * 면을 쪼개도 솔기가 없다. **정점은 한 벌을 공유하고 삼각형(인덱스)만 나누기**
 * 때문이다 — 두 메시가 완전히 같은 좌표를 쓰므로 경계에서 틈도 겹침도
 * 생길 수 없다. 드로우콜은 구역 수(8)만큼이고, 전부 정적이라 프레임당 비용은
 * 행렬 하나씩이다.
 */
export function Ground({ size, receiveShadow }: { size: number; receiveShadow: boolean }) {
  /*
   * 평면을 잘게 나눈 뒤 정점마다 지형 높이를 준다.
   *
   * 회전(-90°) 뒤의 좌표 대응에 주의해야 한다. 로컬 (x, y)는 월드 (x, -z)가
   * 되고 로컬 z가 월드 높이가 된다 — 부호를 빼먹으면 지형이 남북으로 뒤집혀
   * **건물만 언덕에 맞고 길은 반대로 기운다.**
   */
  const patches = useMemo(() => {
    const segments = Math.max(1, Math.round(size / GROUND_CELL_METERS));
    const plane = new THREE.PlaneGeometry(size, size, segments, segments);
    const position = plane.attributes.position;

    for (let i = 0; i < position.count; i += 1) {
      position.setZ(i, terrainHeight(position.getX(i), -position.getY(i)));
    }
    position.needsUpdate = true;
    // 기울기에 따라 음영이 지려면 노멀을 다시 구해야 한다
    plane.computeVertexNormals();

    return splitByZone(plane, size);
  }, [size]);

  useLayoutEffect(
    () => () => {
      for (const patch of patches) {
        patch.geometry.dispose();
        patch.texture.dispose();
      }
    },
    [patches],
  );

  return (
    <>
      {patches.map((patch) => (
        <mesh
          key={patch.id}
          geometry={patch.geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow={receiveShadow}
        >
          <meshToonMaterial
            map={patch.texture}
            color={patch.color}
            gradientMap={getToonGradientTexture()}
          />
        </mesh>
      ))}
    </>
  );
}

/**
 * 바닥 재질 종류 → 어떤 타일을 몇 미터마다 반복할지.
 *
 * 종류를 다섯으로 두고 **색은 구역이 따로 정한다**(`zones.groundColor`). 흙과
 * 모래는 결이 같고 색만 다르므로 그림을 새로 그릴 이유가 없다 — 잔디 결이
 * 모래에서도 잔물결로 읽힌다.
 */
const GROUND_TILE: Record<GroundKind, { kind: "asphalt" | "paving" | "grass"; meters: number }> = {
  asphalt: { kind: "asphalt", meters: ASPHALT_TILE_METERS },
  stone: { kind: "paving", meters: PAVING_TILE_METERS },
  grass: { kind: "grass", meters: GRASS_TILE_METERS },
  sand: { kind: "grass", meters: GRASS_TILE_METERS },
  dirt: { kind: "grass", meters: GRASS_TILE_METERS },
};

interface GroundPatch {
  id: ZoneId | typeof ROAD_ID;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture;
  color: string;
}

/**
 * 차도 바닥.
 *
 * **구역 색이 도로까지 칠하고 있었다.** 지면은 `zoneAt`으로만 갈랐는데 그
 * 함수는 도로 좌표를 가장 가까운 구역으로 접는다 — 그래서 옛 마을 옆 도로는
 * 흙, 숲 옆 도로는 잔디가 되었다. 화면에서는 **도로가 아예 없었다**: 차선만
 * 흙바닥 위에 떠 있고 아스팔트가 한 뼘도 안 보였다.
 *
 * 도로는 구역의 성격이 아니라 **도시가 깐 것**이다. 인도·연석과 같은 이유로
 * 따로 칠한다.
 */
const ROAD_ID = "road" as const;

/**
 * 삼각형을 구역별로 갈라 메시 데이터를 만든다.
 *
 * 정점 속성(위치·노멀·UV)은 **원본을 그대로 공유한다.** 복사하면 메모리가
 * 구역 수만큼 늘고, 무엇보다 한쪽만 고쳐질 여지가 생긴다.
 *
 * 삼각형이 어느 구역인지는 **세 꼭짓점의 무게중심**으로 판정한다. 꼭짓점
 * 하나로 정하면 경계에 걸친 삼각형이 이웃과 다르게 갈려 톱니가 보인다.
 *
 * 삼각형이 하나도 없는 구역은 메시를 만들지 않는다 — 빈 인덱스 버퍼는
 * 드로우콜만 먹는다.
 */
function splitByZone(plane: THREE.PlaneGeometry, size: number): GroundPatch[] {
  const index = plane.getIndex();
  const position = plane.attributes.position;
  if (!index) throw new Error("지면 평면에 인덱스가 없다 — PlaneGeometry는 항상 인덱스를 가진다");

  const buckets = new Map<ZoneId | typeof ROAD_ID, number[]>();

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);

    const cx = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    // 로컬 y가 월드 -z다 (위 회전 주석)
    const cz = -(position.getY(a) + position.getY(b) + position.getY(c)) / 3;

    const id = isRoadSurface(cx, cz) ? ROAD_ID : zoneAt(cx, cz).id;
    const bucket = buckets.get(id);
    if (bucket) bucket.push(a, b, c);
    else buckets.set(id, [a, b, c]);
  }

  const patches: GroundPatch[] = [];
  for (const [id, indices] of buckets) {
    if (indices.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attribute = plane.getAttribute(name);
      if (attribute) geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    const ground: GroundKind = id === ROAD_ID ? "asphalt" : ZONES[id].ground;
    const tile = GROUND_TILE[ground];
    patches.push({
      id,
      geometry,
      texture: tiledCopy(getTileTexture(tile.kind), size, tile.meters),
      color: id === ROAD_ID ? ROAD_SURFACE_COLOR : ZONES[id].groundColor,
    });
  }

  return patches;
}

/** 공유 타일을 이 면 크기에 맞춰 반복시킨 사본. 원본을 건드리면 다른 곳이 깨진다 */
function tiledCopy(base: THREE.CanvasTexture, size: number, tileMeters: number): THREE.Texture {
  const cloned = base.clone();
  cloned.needsUpdate = true;
  cloned.repeat.set(size / tileMeters, size / tileMeters);
  return cloned;
}

/**
 * 인도 — 구역마다 살짝 올라온 판.
 *
 * 차도와 보도가 높이로 구분되어야 도로가 도로로 읽힌다. 충돌체로 넣지 않는
 * 이유는 16cm 턱마다 걸리면 이동이 답답해지기 때문이다 (달리기·보드 우선).
 */
/**
 * 연석 색.
 *
 * 인도 블록보다 밝은 콘크리트다. 실제 연석이 그렇고, 밝아야 차도와의 경계가
 * 멀리서도 한 줄로 읽힌다.
 */
/**
 * 연석과 점자블록.
 *
 * 점자블록을 **여기로 옮겼다.** 예전에는 `cityDetails.groundPlates`에 섞여
 * 구역 단위로 스트리밍됐는데, 지형을 따라가게 하려고 잘게 쪼개자 인스턴스가
 * 열 배로 늘어 스트리밍 예산을 넘겼다. 연석과 같은 묶음에 두면 **항상 그리는
 * 드로우콜 하나**에 함께 들어간다 — 애초에 이 둘은 같은 것(인도 테두리)이다.
 */
const CURB_PALETTE = ["#c9c6bd", "#e9d67a"];

/** 점자블록의 팔레트 인덱스 */
const GUIDEWAY_TONE = 1;

/** 구역을 두르는 연석 — 차도의 폭을 눈으로 규정한다. */
export function Curbs({ receiveShadow }: { receiveShadow: boolean }) {
  const items = useMemo(
    () => [...buildCurbs(SIDEWALK_SLAB_SIZE), ...buildTactileGuideways(GUIDEWAY_TONE)],
    [],
  );
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const toonGradient = useMemo(() => getToonGradientTexture(), []);

  useLayoutEffect(() => {
    if (meshRef.current) projectInstances(meshRef.current, items, CURB_PALETTE);
  }, [items]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      receiveShadow={receiveShadow}
      castShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial gradientMap={toonGradient} />
    </instancedMesh>
  );
}

export function Sidewalks({ receiveShadow }: { receiveShadow: boolean }) {
  // 정본은 sidewalks.ts — 바닥에 까는 것들이 연석 위치를 같은 값에서 받는다
  const size = SIDEWALK_SLAB_SIZE;

  const texture = useMemo(() => {
    const base = getTileTexture("paving");
    const cloned = base.clone();
    cloned.needsUpdate = true;
    /*
     * 반복은 UV에서 이미 끝났다(`buildSidewalkSurface`가 월드 좌표를 타일
     * 크기로 나눠 넣는다). 여기서 `repeat`를 또 걸면 두 번 나뉘어 무늬가
     * 잘아진다. 대신 **감싸기**를 켜 둬야 1을 넘는 UV가 잘리지 않는다.
     */
    cloned.wrapS = THREE.RepeatWrapping;
    cloned.wrapT = THREE.RepeatWrapping;
    return cloned;
  }, []);

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  /*
   * 인도는 **면 하나**다. 예전에는 구역마다 상자 하나였는데, 상자에는 그
   * 중심의 지형 높이가 한 번만 더해져서 판이 평평했다 — 구역 가장자리에서
   * 2.76m 떠올라 회색 벽처럼 걸렸다(`buildSidewalkSurface` 주석).
   */
  const geometry = useMemo(() => {
    const mesh = buildSidewalkSurface(size, PAVING_TILE_METERS);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
    geo.setIndex(mesh.indices);
    // 기울기에 따라 음영이 지려면 노멀을 다시 구해야 한다
    geo.computeVertexNormals();
    return geo;
  }, []);

  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow={receiveShadow}>
      <meshToonMaterial map={texture} gradientMap={getToonGradientTexture()} />
    </mesh>
  );
}
