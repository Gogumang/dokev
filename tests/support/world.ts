/**
 * 월드 배치를 재는 도구 — 검사끼리 나눠 쓴다.
 *
 * `worldConsistency.test.ts` 안에 있던 것을 뺐다. 대장 자리 검사를 따로
 * 떼면서 같은 함수가 두 벌이 될 참이었고, 이 저장소가 가장 아파한 종류의
 * 중복이 그것이다 — 한쪽만 고쳐지면 두 검사가 다른 세상을 재게 된다.
 *
 * `layout`을 인자로 받는다. 모듈이 스스로 부르면 검사 파일마다 도시를 다시
 * 짓게 되고, 그것은 몇 초씩 든다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { CityLayout } from "@/game/world/cityLayout";

/** 그 지점이 어떤 충돌체 안에 있는지. margin만큼 넓혀서 본다 */
export function blockedBy(layout: CityLayout, x: number, z: number, margin: number): Aabb[] {
  return layout.colliders.filter(
    (box) =>
      x >= box.minX - margin &&
      x <= box.maxX + margin &&
      z >= box.minZ - margin &&
      z <= box.maxZ + margin,
  );
}

export function describeBox(box: Aabb): string {
  return `[${box.minX.toFixed(1)}~${box.maxX.toFixed(1)}, ${box.minZ.toFixed(1)}~${box.maxZ.toFixed(1)}]`;
}

/**
 * 어떤 충돌체가 그 원과 겹치는지.
 *
 * `blockedBy`는 **점 하나**가 상자 안인지 본다. 「반경 안에 걸리는 것이
 * 없는가」는 다른 질문이라 따로 둔다 — 대장에게서 물러설 자리를 잴 때
 * 점으로 보면 **한가운데만 비어 있어도 통과한다.**
 */
export function overlapping(layout: CityLayout, x: number, z: number, radius: number): Aabb[] {
  return layout.colliders.filter((box) => {
    const nearX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    return Math.hypot(x - nearX, z - nearZ) <= radius;
  });
}

/** 걸어서 닿는가. 격자 너비 탐색이고, 캐릭터 반지름만큼 여유를 둔다 */
export function walkableFrom(
  layout: CityLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
): boolean {
  const CELL = 1;
  const limit = layout.halfExtent;
  const key = (x: number, z: number) => `${x},${z}`;

  const start = { x: Math.round(fromX), z: Math.round(fromZ) };
  const seen = new Set<string>([key(start.x, start.z)]);
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (Math.hypot(current.x - toX, current.z - toZ) <= radius) return true;

    for (const [dx, dz] of [
      [CELL, 0],
      [-CELL, 0],
      [0, CELL],
      [0, -CELL],
    ]) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (Math.abs(nx) > limit || Math.abs(nz) > limit) continue;
      const id = key(nx, nz);
      if (seen.has(id)) continue;
      seen.add(id);
      // 캐릭터 반지름만큼 여유를 둔다. 딱 맞게 통과하는 틈은 실제로 못 지나간다.
      if (blockedBy(layout, nx, nz, 0.45).length > 0) continue;
      queue.push({ x: nx, z: nz });
    }
  }
  return false;
}
