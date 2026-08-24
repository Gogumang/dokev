/**
 * 전깃줄.
 *
 * 가로등 기둥을 이어 붙인다. 하늘을 가로지르는 선은 한국 골목의 대표적인
 * 인상이면서, 빠르게 지나갈 때 머리 위로 흘러가 속도감을 크게 키운다.
 *
 * `cityDetails.ts`에 있었는데 그 파일이 800줄 상한을 넘어 따로 뺐다.
 *
 * 오래 **곧은 선 두 가닥**이었다. 실제 한국 거리의 전선은 여러 가닥이 한
 * 뭉치로 다니고 **가운데가 처진다** — 곧은 선은 아무리 여러 개를 그어도
 * 도면처럼 보인다. 처짐이 이 파일에서 가장 중요한 값이다.
 */

import { CITY, type CityLayout } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

import type { CityDetails } from "@/game/world/cityDetails";
import { blockIndexFromPosition } from "@/game/world/streaming";
import { isUrbanBlock } from "@/game/world/zones";

/** 가장 높은 가닥의 높이(m) */
const WIRE_HEIGHT = 4.6;

/**
 * 가닥들의 자리 — [세로 내림(m), 가로 치우침(m), 처짐 배율].
 *
 * 넷이었다. 골목 사진을 보면 실제로 그만큼 다니지만, 화면에서는 **하늘이
 * 통째로 그물에 덮인 것**처럼 보였다 — 도로를 달릴 때 시야의 위쪽 절반이
 * 검은 선으로 채워진다. 참고하는 트레일러의 큰길에는 전선이 거의 없다.
 *
 * 둘로 줄인다. 「전선이 지나간다」는 인상은 남기고, 하늘은 돌려준다.
 */
const STRANDS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0.9],
  [0.24, 0.12, 1.15],
];

/**
 * 한 구간을 몇 토막으로 나눌지.
 *
 * 처짐은 곡선이라 토막이 적으면 각져 보인다. 넷이면 눈에 곡선으로 읽히고,
 * 더 늘리면 선분 수만 는다.
 */
const SEGMENTS = 4;

/**
 * 구간 길이에 대한 처짐 깊이의 비율.
 *
 * 0.045로 뒀더니 가장 아래 가닥이 2.81m까지 내려왔다 — 사람 키의 두 배도 안
 * 되는 높이라 버스가 걸린다. 처짐은 **보이기만 하면 되지 깊을 필요가 없다.**
 */
const SAG_RATIO = 0.03;

/**
 * 처짐 모양.
 *
 * 실제로는 현수선이지만 포물선으로 충분하다 — 눈으로 구분되지 않고, 양 끝이
 * 정확히 0이라 기둥에 정확히 붙는다.
 *
 * @param t 구간 안의 위치(0~1)
 * @returns 0(양 끝)~1(가운데)
 */
export function sagShape(t: number): number {
  const centered = t * 2 - 1;
  return 1 - centered * centered;
}

/**
 * 기둥 사이에 가닥들을 건다.
 *
 * 같은 축에 늘어선 기둥끼리만 잇는다. 대각선으로 이으면 격자처럼 보인다.
 */
export function addPowerLines(details: CityDetails, layout: CityLayout): void {
  const poles = layout.props.filter((prop) => prop.tone === 0 && prop.height > 4);
  const maxSpan = CITY.streetLightSpacing * 1.35;

  for (let i = 0; i < poles.length; i += 1) {
    for (let j = i + 1; j < poles.length; j += 1) {
      const a = poles[i];
      const b = poles[j];
      const sameX = Math.abs(a.x - b.x) < 0.01;
      const sameZ = Math.abs(a.z - b.z) < 0.01;
      if (!sameX && !sameZ) continue;

      /*
       * 자연 구역 위로는 전선을 걸지 않는다.
       *
       * 기둥의 `blockIndex`를 믿으면 안 된다 — 가로등은 구역 루프가 아니라
       * 도로 축을 따라 서므로 거기 담긴 것은 **축 번호**다(`addStreetLights`가
       * `g`를 넘긴다). 좌표로 물어야 한다.
       *
       * 한쪽 끝만 자연이어도 거른다. 절반만 걸린 전선은 허공에서 끊긴다.
       */
      if (!isUrbanBlock(blockIndexFromPosition(a.x, a.z))) continue;
      if (!isUrbanBlock(blockIndexFromPosition(b.x, b.z))) continue;

      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      if (distance < 0.01 || distance > maxSpan) continue;

      // 구간에 직각인 수평 방향 — 가닥을 옆으로 흩는 축이다
      const sideX = sameX ? 1 : 0;
      const sideZ = sameX ? 0 : 1;
      const sag = distance * SAG_RATIO;

      /*
       * 전선 높이는 **그 자리의 지면 위**다.
       *
       * 평지 기준으로 그으면 언덕 위 구간에서 전선이 땅속으로 들어가고,
       * 내리막에서는 하늘 높이 떠 버린다. 기둥은 지면을 따라 서 있으므로
       * 전선도 따라가야 한 뭉치로 보인다.
       */
      for (const [drop, side, sagScale] of STRANDS) {
        const base = WIRE_HEIGHT - drop;
        const ox = sideX * side;
        const oz = sideZ * side;

        let px = a.x + ox;
        let py = base + terrainHeight(px, a.z + oz);
        let pz = a.z + oz;

        for (let s = 1; s <= SEGMENTS; s += 1) {
          const t = s / SEGMENTS;
          const nx = a.x + (b.x - a.x) * t + ox;
          const nz = a.z + (b.z - a.z) * t + oz;
          const ny = base + terrainHeight(nx, nz) - sagShape(t) * sag * sagScale;

          details.wireVertices.push(px, py, pz, nx, ny, nz);
          px = nx;
          py = ny;
          pz = nz;
        }
      }
    }
  }
}
