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

import { ARROW_TRAIL, RAINBOW, trailSegment } from "@/game/combat/arrowTrail";
import { PLAYER_BOLT_MAX, type PlayerBolt } from "@/game/combat/projectiles";

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
 */
export function paintPlayerBolts(
  mesh: THREE.InstancedMesh | null,
  bolts: readonly PlayerBolt[],
  scratch: TrailScratch,
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
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * 화살 뒤에 무지개 마디를 세운다.
 *
 * 자리와 색은 `arrowTrail`이 정한다 — 여기서는 진행 방향의 **반대**로 물러난
 * 자리에 인스턴스를 놓기만 한다. 무기가 무지개를 안 남기면(광선총) 그 탄의
 * 칸은 통째로 비운다.
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

      if (!bolt || !bolt.rainbow || speed === 0) {
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
      scratch.color.set(RAINBOW[segment.colorIndex]).multiplyScalar(segment.opacity);
      mesh.setColorAt(at, scratch.color);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
