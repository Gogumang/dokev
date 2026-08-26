/**
 * 처치 순간에 흩어지는 것들 — 색종이와 빠져나가는 빛.
 *
 * `Enemies.tsx`에서 뗐다. 저 파일은 이미 상한을 크게 넘었고, 이 둘은 화면
 * 상태와 아무 상관이 없다 — 풀 하나를 인스턴스 버퍼로 옮기는 일뿐이다.
 *
 * 둘 다 **색상환을 탄다**(`core/rainbow`). 색종이는 조각마다 다른 색이고
 * 빛은 떠오르는 동안 색이 흐른다 — 같은 무지개를 다르게 쓴다. 움직임도
 * 다르다: 색종이는 중력을 받아 흩어지고 빛은 곧게 오른다. 색까지 같으면
 * 둘이 한 덩어리로 뭉개진다.
 *
 * three를 타입으로만 가져온다 — 버퍼도 스크래치도 부르는 쪽이 들고 있다.
 */

import type * as THREE from "three";

import type { TrailScratch } from "@/game/combat/arrowTrailPaint";
import { EMBER, type Ember, emberFade } from "@/game/combat/emberRelease";
import { rainbowAt, rainbowFlow } from "@/game/core/rainbow";

export const CONFETTI = {
  /** 풀 크기. 한 번 맞을 때 `perHit`을 쓰므로 동시 타격 몇 번은 견딘다 */
  poolSize: 96,
  perHit: 14,
  lifeSeconds: 0.9,
  gravity: 14,
  /**
   * 색이 흐르는 속도(바퀴/초).
   *
   * 화살 자국(2.4)보다 느리다. 색종이는 0.9초를 살고 그동안 튀면서 도는데,
   * 색까지 빠르게 돌면 **무슨 색인지 못 보고 사라진다.**
   */
  flowPerSecond: 0.8,
} as const;

/**
 * 빠져나간 빛의 색.
 *
 * 로봇 가슴의 점(`Enemies.tsx`의 CORE_COLOR)과 같은 색이다. 갇혀 있던 것이
 * 그대로 떠오르는 장면이라 **색이 바뀌면 다른 것이 나온 것**으로 보인다.
 */
const EMBER_COLOR = "#7cf5c4";

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  spin: number;
}

/** 꺼진 상태로 채운 풀 */
export function createConfetti(): Particle[] {
  return Array.from({ length: CONFETTI.poolSize }, () => ({
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    spin: 0,
  }));
}

/**
 * 색종이를 인스턴스 버퍼에 적는다 — 한 프레임 굴리면서.
 *
 * 굴리는 일과 적는 일이 한 루프인 이유: 조각이 아흔여섯이고 둘 다 같은 배열을
 * 순서대로 훑는다. 두 번 훑으면 캐시만 두 번 흐트러진다.
 *
 * 색은 **칸 번호**에서 나온다. 한 번 때리면 열넷이 연달아 나가고 열넷은
 * 여섯으로 안 나눠떨어지므로, 매 타격마다 색 배열이 밀린다 — 같은 자리를
 * 두 번 때려도 같은 무지개가 두 번 나오지 않는다.
 *
 * 저감 모션을 안 받는다. 그때는 색종이가 아예 안 터진다(`Enemies.tsx`).
 */
export function paintConfetti(
  mesh: THREE.InstancedMesh | null,
  pool: Particle[],
  scratch: TrailScratch,
  dt: number,
): void {
  if (!mesh) return;

  for (let index = 0; index < pool.length; index += 1) {
    const particle = pool[index];
    if (particle.life > 0) {
      particle.life -= dt;
      particle.vy -= CONFETTI.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      // 바닥에 닿으면 멈춘다. 지면 아래로 빠지면 남은 수명 동안 안 보인다
      if (particle.y < 0.05) {
        particle.y = 0.05;
        particle.vx *= 0.6;
        particle.vz *= 0.6;
        particle.vy = 0;
      }
    }

    const alive = particle.life > 0;
    scratch.position.set(particle.x, alive ? particle.y : -999, particle.z);
    scratch.euler.set(particle.life * particle.spin, particle.life * particle.spin * 0.7, 0);
    scratch.quaternion.setFromEuler(scratch.euler);
    // 수명이 끝나갈수록 작아진다. 인스턴스별 알파를 주는 것보다 싸다
    const shrink = alive ? Math.min(1, particle.life / 0.3) : 0;
    scratch.scale.set(shrink, shrink, shrink);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(index, scratch.matrix);

    /*
     * 조각마다 제 색을 쥔다. 색상환을 시간으로 한 번 더 밀어 **터지는 동안
     * 조각이 색을 바꾸게** 한다 — 고정해 두면 흩날리는 종이가 아니라 도장을
     * 찍은 무늬로 보인다.
     *
     * 저감 모션 분기를 두지 않는다. 색종이는 그때 **아예 안 터지고**
     * (`Enemies.tsx`가 `burst`를 부르지 않는다), 안 터지는 것의 색을 정하는
     * 갈래는 영원히 안 도는 코드다.
     */
    scratch.color.set(rainbowAt(rainbowFlow(particle.life, CONFETTI.flowPerSecond, index)));
    mesh.setColorAt(index, scratch.color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * 그 자리에서 색종이를 터뜨린다.
 *
 * 커서를 넘겨받아 **다음 자리**를 돌려준다. 부르는 쪽의 ref를 여기서 만지지
 * 않는 이유: 그러면 이 함수가 화면 상태를 알아야 한다.
 */
export function burstConfetti(
  pool: Particle[],
  cursor: number,
  x: number,
  y: number,
  z: number,
  random: () => number,
): number {
  let at = cursor;
  for (let i = 0; i < CONFETTI.perHit; i += 1) {
    const particle = pool[at];
    at = (at + 1) % CONFETTI.poolSize;

    const angle = random() * Math.PI * 2;
    const speed = 2.5 + random() * 4;
    particle.x = x;
    particle.y = y;
    particle.z = z;
    particle.vx = Math.sin(angle) * speed;
    particle.vy = 3 + random() * 4.5;
    particle.vz = Math.cos(angle) * speed;
    particle.life = CONFETTI.lifeSeconds;
    particle.spin = (random() - 0.5) * 12;
  }
  return at;
}

/**
 * 빠져나간 빛을 인스턴스 버퍼에 적는다.
 *
 * **한 색이다.** 무지개로 돌려 봤다가 되돌렸다 — 원작 프레임에서 이 자리에
 * 있는 것은 무지개가 아니라 **아주 작은 청록 발광점** 하나다(frame-notes 063:
 * 「거의 무채색, 튀는 색은 청록 발광체와 짧은 무지개 선으로 3% 미만」).
 * 어두운 배경에 단색 점 하나가 **가장 먼저 눈에 걸리는** 구성이고, 색이
 * 돌아가면 그 힘이 흩어진다.
 *
 * 색을 인스턴스로 적는 것은 남긴다. 가슴의 점과 같은 재질을 나눠 쓰는데
 * 재질 색을 흰색으로 비워 두었기 때문이다.
 */
export function paintEmbers(
  mesh: THREE.InstancedMesh | null,
  pool: readonly Ember[],
  scratch: TrailScratch,
): void {
  if (!mesh) return;

  for (let i = 0; i < EMBER.poolSize; i += 1) {
    const ember = pool[i];
    const fade = emberFade(ember);
    scratch.position.set(ember.x, fade > 0 ? ember.y : -999, ember.z);
    scratch.quaternion.identity();
    // 잦아들수록 작아진다. 크기와 밝기가 함께 줄어야 「사라진다」로 읽힌다
    scratch.scale.setScalar(fade);
    scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
    mesh.setMatrixAt(i, scratch.matrix);

    scratch.color.set(EMBER_COLOR);
    mesh.setColorAt(i, scratch.color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}
