/**
 * 가로등과 횡단보도 — 도로 축을 따라 놓이는 것들.
 *
 * `cityLayout`이 800줄 상한을 넘어 떼어 냈다. 상한이 「이 묶음은 다른 책임인가」를
 * 묻게 했고 답은 그렇다였다: 나머지는 **구역 안에** 무엇이 서는지를 정하는데,
 * 이 둘은 도로를 따라 놓인다. 그래서 구역 루프에 끼울 수 없고 좌표로 걸러야 한다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로 순환이
 * 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다(`zones.ts` 주석).
 * 치수와 구역 판정은 인자로 받고 타입만 가져온다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { BoxInstance, GrappleAnchorSpec } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

/** 도시 격자 치수와 구역 판정 — `cityLayout`이 자기 값으로 채워 넘긴다 */
export interface StreetGrid {
  gridSize: number;
  blockSize: number;
  roadWidth: number;
  streetLightSpacing: number;
  /** 구역 중심 간 거리(m) */
  blockPitch: number;
  /** 그 좌표가 도시 구역인지. 가로등은 도로에 서므로 좌표로 물어야 한다 */
  isUrbanAt: (x: number, z: number) => boolean;
  /** 그 구역 번호가 도시 구역인지 */
  isUrbanBlock: (blockIndex: number) => boolean;
}

export function addStreetLights(
  props: BoxInstance[],
  colliders: Aabb[],
  lamps: BoxInstance[],
  anchors: GrappleAnchorSpec[],
  halfExtent: number,
  grid: StreetGrid,
): void {
  const laneOffset = grid.blockSize / 2 + 1.6;
  const poleWidth = 0.34;
  const poleHeight = 5.4;
  const offset = (grid.gridSize - 1) / 2;

  /*
   * 같은 자리에 두 번 세우지 않는다.
   *
   * 세로 도로용과 가로 도로용을 따로 도는데, **교차로 모서리에서는 두 줄이
   * 같은 지점을 가리킨다.** 그러면 기둥이 겹쳐 서고 충돌체도 둘이 된다 —
   * 화면에서는 한 개로 보이지만 그 자리만 유난히 두껍다.
   *
   * 384개 중 둘이 그랬다. 검사가 앞 40개만 보고 있어서 오래 남아 있었다.
   */
  const taken = new Set<string>();
  const placeKey = (x: number, z: number) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

  const place = (x: number, z: number, g: number) => {
    /*
     * 자연 구역에는 세우지 않는다.
     *
     * 가로등은 구역 루프가 아니라 **도로 축**을 따라 서므로 구역 번호로 거를
     * 수 없다 — 좌표로 물어야 한다. 숲 한복판의 가로등이 구역을 나눈 뒤에도
     * 남아 있던 가장 큰 위화감이었다.
     */
    if (!grid.isUrbanAt(x, z)) return;

    const key = placeKey(x, z);
    if (taken.has(key)) return;
    taken.add(key);

    anchors.push({ x, z, height: poleHeight });
    pushPole(props, colliders, x, z, poleWidth, poleHeight, g);
    // 갓은 기둥 꼭대기에 얹는다. 충돌체는 만들지 않는다 — 머리 위라 닿지 않는다.
    pushLamp(lamps, x, z, poleHeight, g);
  };

  for (let g = 0; g < grid.gridSize; g += 1) {
    const axis = (g - offset) * grid.blockPitch;

    for (let t = -halfExtent + 6; t < halfExtent - 6; t += grid.streetLightSpacing) {
      // 세로 도로 양옆
      place(axis + laneOffset, t, g);
      place(axis - laneOffset, t, g);
      // 가로 도로 양옆
      place(t, axis + laneOffset, g);
      place(t, axis - laneOffset, g);
    }
  }
}

/** 가로등 갓 하나. */
function pushLamp(
  lamps: BoxInstance[],
  x: number,
  z: number,
  poleHeight: number,
  blockIndex: number,
): void {
  lamps.push({
    x,
    y: poleHeight + LAMP_HEAD.height / 2,
    z,
    width: LAMP_HEAD.width,
    height: LAMP_HEAD.height,
    depth: LAMP_HEAD.width,
    tone: 0,
    blockIndex,
  });
}

/** 가로등 갓 크기. 기둥보다 눈에 띄게 넓어야 갓으로 읽힌다 */
const LAMP_HEAD = { width: 0.72, height: 0.22 } as const;

function pushPole(
  props: BoxInstance[],
  colliders: Aabb[],
  x: number,
  z: number,
  width: number,
  height: number,
  blockIndex: number,
): void {
  props.push({ x, y: height / 2, z, width, height, depth: width, tone: 0, blockIndex });
  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - width / 2,
    maxZ: z + width / 2,
    // 지면 높이 위다 — 화단과 같은 이유(addPlaza 주석)
    top: terrainHeight(x, z) + height,
  });
}

/** 교차로 횡단보도. 충돌체가 아니라 바닥 장식이므로 colliders에 넣지 않는다. */
export function addCrosswalks(
  crosswalks: BoxInstance[],
  halfExtent: number,
  grid: StreetGrid,
): void {
  const stripeCount = 6;
  const stripeWidth = 0.7;
  const stripeLength = grid.roadWidth * 0.72;
  const offset = (grid.gridSize - 1) / 2;
  const edge = grid.blockSize / 2 + grid.roadWidth / 2;

  for (let gx = 0; gx < grid.gridSize; gx += 1) {
    for (let gz = 0; gz < grid.gridSize; gz += 1) {
      const cx = (gx - offset) * grid.blockPitch;
      const cz = (gz - offset) * grid.blockPitch;

      if (Math.abs(cz + edge) > halfExtent || Math.abs(cx + edge) > halfExtent) continue;

      const blockIndex = gz * grid.gridSize + gx;
      /*
       * 자연 구역에는 긋지 않는다. 잔디로 덮인 자리에 횡단보도만 남으면
       * 건널 도로가 없는 흰 줄무늬가 된다 (roadMarks의 같은 이유).
       */
      if (!grid.isUrbanBlock(blockIndex)) continue;

      for (let i = 0; i < stripeCount; i += 1) {
        const spread = ((i - (stripeCount - 1) / 2) / stripeCount) * stripeLength * 1.6;
        // 세로 도로를 가로지르는 줄무늬
        crosswalks.push({
          x: cx + spread,
          y: 0.02,
          z: cz + edge,
          width: stripeWidth,
          height: 0.04,
          depth: stripeLength,
          tone: 0,
          blockIndex,
        });
        // 가로 도로를 가로지르는 줄무늬
        crosswalks.push({
          x: cx + edge,
          y: 0.02,
          z: cz + spread,
          width: stripeLength,
          height: 0.04,
          depth: stripeWidth,
          tone: 0,
          blockIndex,
        });
      }
    }
  }
}
