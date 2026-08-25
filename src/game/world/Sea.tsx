"use client";

/**
 * 물 — 바다와 벼랑, 그리고 공원의 연못.
 *
 * 「윤슬 해안」이라는 이름을 붙여 놓고 모래색 바닥만 있었다. 물이 없으면
 * 해안이 아니라 그냥 모래가 깔린 동네다.
 *
 * 물을 도시 **안**으로 들이지 않는다. 지형을 바다까지 끌어내리려면 경사가
 * 필요한데, 이 월드의 경사 한계는 20%다(`terrain` 검사). 자연 지형의 마루가
 * +8m라 -8m까지 내리려면 80m 넘는 비탈이 필요하고, 그러면 동쪽 두 구역이
 * 통째로 비탈이 된다. 그래서 **물은 월드 정사각형 바깥**에 두고, 땅의 끝을
 * 벼랑으로 마감한다.
 *
 * 덤으로 월드 경계가 설명된다. 예전에는 도시가 이유 없이 끊겼는데, 이제
 * 섬이라서 끊긴다.
 *
 * 연못도 여기 있다. 「공원 파일에 두는 게 맞지 않나」 싶지만, 연못을 물처럼
 * 보이게 하는 것은 **공원의 성질이 아니라 물의 성질**이다 — 결 텍스처와 UV를
 * 흘리는 방식이 바다와 한 글자도 다르지 않다. 두 곳에 같은 코드를 두면 한쪽만
 * 고쳐진다.
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { BoxInstance } from "@/game/world/cityLayout";
import { projectInstances, WHITE_PALETTE } from "@/game/world/instances";
import { SEA_LEVEL, terrainHeight } from "@/game/world/terrain";
import {
  getFoamTexture,
  getTileTexture,
  getToonGradientTexture,
  WATER_TILE_METERS,
} from "@/game/world/textures";

/**
 * 바다가 도시 밖으로 뻗는 거리(m).
 *
 * 가장 먼 안개 거리(220m)를 넘겨야 수평선까지 물로 보인다. 더 뻗어도
 * 카메라 far에 잘려 보이지 않으므로 삼각형만 낭비다.
 */
const SEA_REACH = 240;

/** 수면 격자 한 칸(m). 평면이라 잘게 나눌 이유는 없고, 도려내기 단위로만 쓴다 */
const SEA_CELL = 24;

/**
 * 수면이 땅 밑으로 파고드는 깊이(m).
 *
 * 경계선에 딱 맞추면 물과 벼랑 사이에 **머리카락 같은 틈**이 생겨 그 너머로
 * 하늘이 비친다. 조금 겹쳐 두면 벼랑이 물을 덮는다.
 */
const SEA_OVERLAP = 6;

/** 물결이 흐르는 속도(초당 UV). 빠르면 강물이 되고, 느리면 멈춘 것으로 보인다 */
const WAVE_SPEED = 0.014;

/** 벼랑이 수면 아래로 더 내려가는 깊이(m). 물이 얕은 곳에서도 바닥이 안 비쳐야 한다 */
const CLIFF_DEPTH = 10;

/** 벼랑을 따라 지형을 재는 간격(m). 촘촘할수록 벼랑 윗선이 땅을 잘 따라간다 */
const CLIFF_STEP = 4;

/**
 * 거품 띠가 물가에서 **뭍 안쪽으로** 뻗는 폭(m).
 *
 * 처음에는 반대로 바다 쪽에 깔았다. 물리적으로는 그게 맞는데 — 거품은 물 위에
 * 뜬다 — **화면에서 한 번도 안 보였다.** 뭍 가장자리가 수면보다 8~16m 높은
 * 벼랑이라, 뭍에서 보면 그 벼랑이 물가를 통째로 가린다. 정작 딱딱해 보이는
 * 선은 뭍 쪽 가장자리인데 거품은 그 아래 숨어 있었다.
 *
 * 그래서 뭍 위로 올렸다. 파도가 밀려와 젖은 모래에 남기는 자국이고, **보이는
 * 자리에 있다.** 좁으면 흰 실 한 줄이고 넓으면 물가가 통째로 하얘진다.
 */
const FOAM_REACH = 4.5;

/** 거품 무늬가 물가를 따라 반복되는 간격(m). 짧으면 되풀이가 눈에 띄고 길면 뭉갠다 */
const FOAM_TILE_METERS = 16;

/**
 * 거품이 지면에서 떠 있는 높이(m).
 *
 * 같은 높이에 두면 지면과 z-파이팅이 나 **거품이 지직거린다.** 6cm면 옆에서
 * 봐도 떠 보이지 않으면서 깜빡임은 사라진다.
 */
const FOAM_LIFT = 0.06;

/** 거품이 물가를 따라 흐르는 속도(초당 UV). 수면보다 느려야 밀려드는 것으로 보인다 */
const FOAM_DRIFT = 0.008;

/** 거품 띠를 따라 재는 간격(m) */
const FOAM_STEP = 8;

export function Sea({ halfExtent }: { halfExtent: number }) {
  const materialRef = useRef<THREE.MeshToonMaterial>(null);
  const texture = useMemo(() => {
    const base = getTileTexture("water");
    const cloned = base.clone();
    cloned.needsUpdate = true;
    const span = (halfExtent + SEA_REACH) * 2;
    cloned.repeat.set(span / WATER_TILE_METERS, span / WATER_TILE_METERS);
    return cloned;
  }, [halfExtent]);

  const geometry = useMemo(() => buildSeaRing(halfExtent), [halfExtent]);
  const cliffs = useMemo(() => buildCliffSkirt(halfExtent), [halfExtent]);
  const foam = useMemo(() => buildFoamRibbon(halfExtent), [halfExtent]);

  const foamTexture = useMemo(() => {
    const base = getFoamTexture();
    const cloned = base.clone();
    cloned.needsUpdate = true;
    // 물가를 따라서만 반복한다. 세로는 한 번 — 그 방향은 그라데이션이다
    cloned.repeat.set((halfExtent * 8) / FOAM_TILE_METERS, 1);
    return cloned;
  }, [halfExtent]);

  const foamRef = useRef<THREE.MeshBasicMaterial>(null);

  useLayoutEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => () => cliffs.dispose(), [cliffs]);
  useLayoutEffect(() => () => foam.dispose(), [foam]);
  useLayoutEffect(() => () => foamTexture.dispose(), [foamTexture]);

  /*
   * UV를 흘려 물결을 만든다.
   *
   * 정점을 흔들지 않는다 — 수면 격자가 성기라 정점을 움직이면 물결이 아니라
   * 판이 접히는 것으로 보이고, 매 프레임 지오메트리를 다시 올려야 한다.
   * 오프셋 두 값만 바꾸면 GPU가 알아서 흘린다.
   *
   * **재질 ref를 거쳐서 만진다.** 위에서 `texture`를 훅(useLayoutEffect)에
   * 넘겼기 때문에 그 변수를 여기서 고치면 컴파일러가 막는다 — 훅에 넘긴 값을
   * 나중에 바꾸면 메모가 낡는지 알 수 없기 때문이다.
   */
  useFrame((_, delta) => {
    const map = materialRef.current?.map;
    if (!map) return;

    map.offset.x += delta * WAVE_SPEED;
    // 두 축을 다른 속도로 흘려야 무늬가 대각선으로 미끄러지지 않는다
    map.offset.y += delta * WAVE_SPEED * 0.42;

    /*
     * 거품은 **물가를 따라서만** 흐른다. 가로질러 흘리면 거품이 뭍으로
     * 기어 올라가거나 바다로 밀려나는 것으로 보인다.
     */
    const foamMap = foamRef.current?.map;
    if (foamMap) foamMap.offset.x += delta * FOAM_DRIFT;
  });

  return (
    <>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL, 0]}>
        {/*
         * 그림자를 받지 않는다. 수면은 도시에서 멀리 떨어져 있어 그림자 맵
         * 범위 밖이고, 켜 두면 범위 경계에서 물이 한 줄 어두워진다.
         */}
        <meshToonMaterial
          ref={materialRef}
          map={texture}
          color="#4f86a8"
          gradientMap={getToonGradientTexture()}
        />
      </mesh>
      {/*
       * 물가 거품. 깊이를 쓰되 **쓰지는 않는다**(depthWrite=false) — 반투명이라
       * 깊이에 써 넣으면 뒤쪽 수면이 잘려 띠 안쪽에 구멍이 뚫린다.
       */}
      <mesh geometry={foam}>
        <meshBasicMaterial
          ref={foamRef}
          map={foamTexture}
          transparent
          depthWrite={false}
          toneMapped={false}
          /*
           * 양면으로 그린다.
           *
           * 한 면만 그렸더니 **띠가 통째로 안 보였다.** 감김 방향이 아래를
           * 향해 위에서 보면 뒷면이었던 것이다 — 빨간색으로 칠해 보고서야
           * 「색이 옅어서 안 보인다」가 아니라 「그려지지 않는다」임을 알았다.
           * 벼랑 치마가 같은 이유로 양면이다.
           */
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={cliffs} receiveShadow>
        <meshToonMaterial
          color="#6e6a63"
          gradientMap={getToonGradientTexture()}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}

/**
 * 도시 정사각형 **바깥**만 남긴 수면.
 *
 * 도시 밑에도 물을 깔면 안쪽 골짜기(-7.95m)가 수면(-8.6m)보다 높으니 가려지긴
 * 하지만, 화면 전체 크기의 면이 한 장 더 그려져 채우기 비용만 든다. 안쪽
 * 삼각형은 지워 버린다.
 */
function buildSeaRing(halfExtent: number): THREE.BufferGeometry {
  const span = (halfExtent + SEA_REACH) * 2;
  const segments = Math.max(1, Math.round(span / SEA_CELL));
  const plane = new THREE.PlaneGeometry(span, span, segments, segments);

  const index = plane.getIndex();
  const position = plane.attributes.position;
  if (!index) throw new Error("수면 평면에 인덱스가 없다 — PlaneGeometry는 항상 인덱스를 가진다");

  const inner = halfExtent - SEA_OVERLAP;
  const kept: number[] = [];

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);

    const cx = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const cy = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;

    // 도시 안쪽(겹침 여유를 뺀)이면 버린다
    if (Math.abs(cx) < inner && Math.abs(cy) < inner) continue;
    kept.push(a, b, c);
  }

  const ring = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const attribute = plane.getAttribute(name);
    if (attribute) ring.setAttribute(name, attribute);
  }
  ring.setIndex(kept);
  ring.computeBoundingSphere();
  return ring;
}

/**
 * 물가를 한 바퀴 도는 거품 자국.
 *
 * 뭍 가장자리에서 **안쪽으로** `FOAM_REACH`만큼 뻗는다. 바다 쪽에 깔았다가
 * 벼랑에 통째로 가려 한 번도 안 보였다(`FOAM_REACH` 주석).
 *
 * **지형을 따라간다.** 수면처럼 평평하게 두면 마루에서는 땅에 파묻히고
 * 골짜기에서는 공중에 뜬다 — 벼랑 치마와 같은 이유다.
 *
 * UV의 u는 물가를 따라 흐르고 v는 **가장자리(0)에서 안쪽(1)**으로 간다.
 * 텍스처가 v로 흐려지므로 뒤집으면 안쪽이 짙어져, 젖은 자국이 물가가 아니라
 * 뭍 한복판에 생긴 것처럼 보인다.
 */
function buildFoamRibbon(halfExtent: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const inner = halfExtent - FOAM_REACH;

  const strip = (
    edge: (t: number) => { x: number; z: number },
    inland: (t: number) => { x: number; z: number },
  ) => {
    let u = 0;
    for (let t = -halfExtent; t < halfExtent; t += FOAM_STEP) {
      const next = Math.min(t + FOAM_STEP, halfExtent);
      const a = edge(t);
      const b = edge(next);
      const c = inland(next);
      const d = inland(t);
      const nextU = u + (next - t) / (halfExtent * 2);

      const lift = (p: { x: number; z: number }) => terrainHeight(p.x, p.z) + FOAM_LIFT;

      positions.push(a.x, lift(a), a.z, b.x, lift(b), b.z, c.x, lift(c), c.z);
      positions.push(a.x, lift(a), a.z, c.x, lift(c), c.z, d.x, lift(d), d.z);
      uvs.push(u, 0, nextU, 0, nextU, 1);
      uvs.push(u, 0, nextU, 1, u, 1);

      u = nextU;
    }
  };

  strip(
    (t) => ({ x: t, z: -halfExtent }),
    (t) => ({ x: t, z: -inner }),
  );
  strip(
    (t) => ({ x: t, z: halfExtent }),
    (t) => ({ x: t, z: inner }),
  );
  strip(
    (t) => ({ x: -halfExtent, z: t }),
    (t) => ({ x: -inner, z: t }),
  );
  strip(
    (t) => ({ x: halfExtent, z: t }),
    (t) => ({ x: inner, z: t }),
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 땅의 끝을 물속까지 내리는 벼랑.
 *
 * 없으면 지면이 **종잇장처럼** 끊긴다 — 옆에서 보면 두께가 없어 그 너머로
 * 바다가 그대로 비치고, 도시가 잘린 판 위에 얹힌 것으로 보인다.
 *
 * 윗선은 지형을 그대로 따라간다. 평평한 벽으로 두면 마루에서는 땅속에
 * 파묻히고 골짜기에서는 공중에 뜬다.
 */
function buildCliffSkirt(halfExtent: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const bottom = SEA_LEVEL - CLIFF_DEPTH;

  /** 한 변을 따라 사각형 띠를 잇는다. `axis`가 고정 좌표, `t`가 훑는 좌표다 */
  const strip = (toPoint: (t: number) => { x: number; z: number }) => {
    for (let t = -halfExtent; t < halfExtent; t += CLIFF_STEP) {
      const near = toPoint(t);
      const far = toPoint(Math.min(t + CLIFF_STEP, halfExtent));

      const nearTop = terrainHeight(near.x, near.z);
      const farTop = terrainHeight(far.x, far.z);

      // 사각형 하나를 삼각형 둘로. 양면을 그리므로 감김 방향은 신경 쓰지 않는다
      positions.push(near.x, nearTop, near.z, far.x, farTop, far.z, near.x, bottom, near.z);
      positions.push(far.x, farTop, far.z, far.x, bottom, far.z, near.x, bottom, near.z);
    }
  };

  strip((t) => ({ x: t, z: -halfExtent }));
  strip((t) => ({ x: t, z: halfExtent }));
  strip((t) => ({ x: -halfExtent, z: t }));
  strip((t) => ({ x: halfExtent, z: t }));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 연못 물결 타일 한 변(m).
 *
 * 바다(22m)보다 훨씬 잘다. 연못은 9m밖에 안 되므로 바다 배율을 그대로 쓰면
 * **물결 한 겹이 연못보다 커서** 결이 아예 안 보인다 — 파란 판이 된다.
 */
const POND_TILE_METERS = 3.4;

/**
 * 연못 물결이 흐르는 속도(초당 UV).
 *
 * 바다의 절반이 안 된다. 고인 물이라 파도가 아니라 **바람에 이는 잔물결**이고,
 * 빠르면 개울처럼 흘러가는 것으로 보인다.
 */
const POND_WAVE_SPEED = 0.006;

/**
 * 공원 연못의 수면.
 *
 * 돌 테두리는 여기서 그리지 않는다 — 단색이라 다른 소품과 같은 묶음에 들어간다.
 * 이쪽은 텍스처와 UV 흐름이 필요해 묶음이 갈린다.
 */
export function PondWater({ items }: { items: readonly BoxInstance[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshToonMaterial>(null);

  const texture = useMemo(() => {
    const base = getTileTexture("water");
    const cloned = base.clone();
    cloned.needsUpdate = true;
    /*
     * 인스턴스가 크기를 곱하므로 반복 수는 **연못 한 변** 기준이다. 상자
     * 지오메트리의 UV는 면마다 0~1이라, 반복을 주지 않으면 결 한 장이
     * 수면 전체로 늘어난다.
     */
    cloned.repeat.set(POND_SIZE_HINT / POND_TILE_METERS, POND_SIZE_HINT / POND_TILE_METERS);
    return cloned;
  }, []);

  useLayoutEffect(() => {
    if (meshRef.current) projectInstances(meshRef.current, items, WHITE_PALETTE);
  }, [items]);

  useLayoutEffect(() => () => texture.dispose(), [texture]);

  /*
   * 바다와 같은 방식으로 흘린다. 재질 ref를 거치는 이유도 같다 — 훅에 넘긴
   * 값을 나중에 고치면 컴파일러가 막는다.
   */
  useFrame((_, delta) => {
    const map = materialRef.current?.map;
    if (!map) return;

    map.offset.x += delta * POND_WAVE_SPEED;
    map.offset.y += delta * POND_WAVE_SPEED * 0.62;
  });

  if (items.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial
        ref={materialRef}
        map={texture}
        color="#5f9fbe"
        gradientMap={getToonGradientTexture()}
      />
    </instancedMesh>
  );
}

/**
 * 연못 한 변(m) — 반복 수를 정하는 데만 쓴다.
 *
 * `park.ts`의 `POND.size`와 같아야 한다. 값으로 가져오지 않는 이유는 순환
 * 때문이 아니라 **이 값이 틀려도 화면이 조금 성겨질 뿐**이라서다 — 배치가
 * 어긋나는 종류의 값이 아니므로 검사로 묶는 대신 여기 적어 둔다.
 */
const POND_SIZE_HINT = 9.4;
