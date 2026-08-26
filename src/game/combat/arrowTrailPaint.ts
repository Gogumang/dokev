/**
 * 화살 자국을 인스턴스 버퍼에 적는다.
 *
 * `Enemies.tsx`에서 뗐다 — 저 파일은 이미 상한을 크게 넘었고, 이건 화면 상태와
 * 아무 상관이 없다. 자리와 색은 `arrowTrail`이 정하고, 여기서는 **그것을
 * 행렬로 옮기기만** 한다.
 *
 * three를 타입으로만 가져온다. `new THREE.X`가 하나도 없어서 순수 모듈 규칙을
 * 지킨다 — 버퍼도 스크래치도 부르는 쪽이 들고 있다.
 */

import type * as THREE from "three";

import { ARROW_TRAIL, trailSegment } from "@/game/combat/arrowTrail";
import { RAINBOW, rainbowAt, rainbowFlow } from "@/game/core/rainbow";
import { PLAYER_BOLT_MAX, type PlayerBolt } from "@/game/combat/projectiles";

/**
 * 자국을 안 남기는 탄의 색.
 *
 * 지금 드는 둘은 모두 자국을 남기므로 **화면에 안 나온다.** 깃발을 끄는 탄이
 * 생기면 이 색으로 난다 — 적 탄(붉은색)과 반대편이라 날아다니는 둘 중 무엇을
 * 피해야 하는지가 순간에 갈린다.
 */
const PLAIN_BOLT_COLOR = "#5ce1ff";

/** 부르는 쪽이 돌려쓰는 임시 객체들 */
export interface TrailScratch {
  matrix: THREE.Matrix4;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  euler: THREE.Euler;
  scale: THREE.Vector3;
  color: THREE.Color;
}

/**
 * 플레이어의 탄을 인스턴스 버퍼에 적는다.
 *
 * 자국과 같은 파일에 둔다 — 하나는 화살이고 하나는 그 뒤에 남는 것이라,
 * 자리를 정하는 규칙(진행 방향·수명)을 나눠 두면 둘이 어긋난다.
 *
 * 촉도 색상환을 탄다 — **자국을 남기는 탄만.** 자국만 무지개고 촉이 하늘색이면
 * **머리와 몸이 다른 것**으로 보인다.
 *
 * 한때 광선총 탄까지 무지개로 칠했다가 되돌렸다. 원작 프레임에서 원거리
 * 사격은 **청백색 빔**이고(frame-notes 066·067: 「굵은 청백색 빔」, 가장 밝은
 * 곳이 그 코어), 무지개는 자국·색종이·하늘에 붙지 빔 자체에 붙지 않는다.
 * 둘을 다 무지개로 만들면 **무기가 하나로 보이기까지** 한다.
 */
export function paintPlayerBolts(
  mesh: THREE.InstancedMesh | null,
  bolts: readonly PlayerBolt[],
  scratch: TrailScratch,
  reducedMotion: boolean,
): void {
  if (!mesh) return;

  for (let i = 0; i < PLAYER_BOLT_MAX; i += 1) {
    const bolt = bolts[i];
    if (bolt) {
      scratch.position.set(bolt.x, bolt.y, bolt.z);
      // 수명에 비례해 구른다 — 날아가는 것이 멈춰 보이지 않게 한다
      scratch.euler.set(bolt.life * 14, Math.atan2(bolt.vx, bolt.vz), 0, "YXZ");
      scratch.quaternion.setFromEuler(scratch.euler);
      scratch.scale.set(0.8, 0.8, 1.4);
    } else {
      scratch.position.set(0, -999, 0);
      scratch.quaternion.identity();
      scratch.scale.set(0, 0, 0);
    }
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(i, scratch.matrix);

    /*
     * 촉은 **자국의 첫 마디와 같은 색**이다(둘 다 `offset` 0). 한 칸이라도
     * 어긋나면 촉만 딴 색으로 튀어 화살이 두 동강 나 보인다.
     *
     * 저감 모션에서는 흐름을 멈춘다 — 자국과 같은 규칙이다.
     */
    scratch.color.set(
      bolt?.rainbow
        ? rainbowAt(reducedMotion ? 0 : rainbowFlow(bolt.life, ARROW_TRAIL.flowPerSecond))
        : PLAIN_BOLT_COLOR,
    );
    mesh.setColorAt(i, scratch.color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * 화살 뒤에 무지개 마디를 세운다.
 *
 * 자리와 색은 `arrowTrail`이 정한다 — 여기서는 진행 방향의 **반대**로 물러난
 * 자리에 인스턴스를 놓기만 한다. 무기가 자국을 안 남기면(광선총) 그 탄의
 * 칸은 통째로 비운다 — 21m를 0.7초에 가는 탄이라 자국이 붙을 자리가 없다.
 */
export function paintArrowTrails(
  mesh: THREE.InstancedMesh | null,
  bolts: readonly PlayerBolt[],
  scratch: TrailScratch,
  reducedMotion: boolean,
): void {
  if (!mesh) return;

  for (let slot = 0; slot < PLAYER_BOLT_MAX; slot += 1) {
    const bolt = bolts[slot];
    // 진행 방향의 단위 벡터. 자리를 뒤로 물릴 때 쓴다
    const speed = bolt ? Math.hypot(bolt.vx, bolt.vz) : 0;
    const ux = bolt && speed > 0 ? bolt.vx / speed : 0;
    const uz = bolt && speed > 0 ? bolt.vz / speed : 0;

    for (let s = 0; s < ARROW_TRAIL.segments; s += 1) {
      const at = slot * ARROW_TRAIL.segments + s;

      if (!bolt?.rainbow || speed === 0) {
        scratch.position.set(0, -999, 0);
        scratch.scale.set(0, 0, 0);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        mesh.setMatrixAt(at, scratch.matrix);
        continue;
      }

      const segment = trailSegment(s, bolt.life, reducedMotion);
      scratch.position.set(bolt.x - ux * segment.back, bolt.y, bolt.z - uz * segment.back);
      scratch.quaternion.identity();
      scratch.scale.setScalar(segment.scale);
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
      mesh.setMatrixAt(at, scratch.matrix);

      /*
       * 불투명도는 인스턴스마다 다를 수 없다(재질 하나를 나눠 쓴다). 대신
       * **색을 어둡게** 해서 같은 인상을 만든다 — 가산이 아니라 일반 합성이라
       * 어두워지면 뒤로 물러나 보인다.
       */
      /*
       * 불투명도는 인스턴스마다 다를 수 없다(재질 하나를 나눠 쓴다). 대신
       * **색을 어둡게** 해서 같은 인상을 만든다.
       *
       * 어둡게 하기 **전에** 흰빛을 섞는다. 순서가 반대면 꼬리에서 흰빛이
       * 다시 살아나 리본 끝이 하얗게 뜬다 — 코어는 앞에만 있어야 한다.
       */
      scratch.color.set(RAINBOW[segment.colorIndex]);
      if (segment.whiteness > 0) {
        // 흰색을 향해 각 채널을 끌어올린다 — `Color` 하나를 더 만들지 않는다
        scratch.color.r += (1 - scratch.color.r) * segment.whiteness;
        scratch.color.g += (1 - scratch.color.g) * segment.whiteness;
        scratch.color.b += (1 - scratch.color.b) * segment.whiteness;
      }
      scratch.color.multiplyScalar(segment.opacity);
      mesh.setColorAt(at, scratch.color);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
