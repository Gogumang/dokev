/**
 * 박공지붕 — 저층 건물의 실루엣.
 *
 * 도시의 건물이 전부 **꼭대기가 평평한 직육면체**였다. 색과 간판을 아무리
 * 촘촘히 붙여도 하늘을 배경으로 한 윤곽이 상자 밭이면 모형처럼 보인다.
 * 실제 한국 주택가에서 낮은 집은 대부분 경사진 기와·슬레이트 지붕이고,
 * 그 삼각형들이 스카이라인을 만든다.
 *
 * 높은 건물에는 올리지 않는다 — 6층 상가 위의 박공지붕은 어색하다. 평지붕에
 * 난간과 물탱크가 올라가는 지금 모습이 그쪽에는 맞다.
 */

import type { BoxInstance } from "@/game/world/cityLayout";
import { zoneForBlock } from "@/game/world/zones";

/** 이 높이(m) 아래 건물에만 지붕을 올린다 */
const MAX_ROOF_HEIGHT = 13;

/** 지붕 높이를 건물 폭의 몇 배로 잡을지. 너무 가파르면 성처럼 보인다 */
const PITCH_RATIO = 0.26;

/** 처마가 벽 밖으로 나오는 정도(m). 그림자가 생겨 벽과 지붕이 분리돼 보인다 */
const EAVES = 0.45;

/**
 * 지붕을 올릴 건물을 골라 지붕 상자를 만든다.
 *
 * 반환하는 것은 렌더가 인스턴싱할 데이터다 — 실제 삼각기둥 모양은 렌더 쪽
 * 지오메트리가 만들고, 여기서는 **어디에 얼마만 한 것이 놓이는지**만 정한다
 * (배치와 렌더 분리).
 */
export function buildRoofs(buildings: readonly BoxInstance[]): BoxInstance[] {
  const roofs: BoxInstance[] = [];

  for (const building of buildings) {
    if (building.height > MAX_ROOF_HEIGHT) continue;
    // 옛 마을은 기와지붕(모임지붕)을 따로 얹는다 — 실루엣이 갈려야 다른 마을이다
    if (zoneForBlock(building.blockIndex).id === "shrine") continue;

    const width = building.width + EAVES * 2;
    const depth = building.depth + EAVES * 2;
    // 좁은 쪽으로 물매를 잡는다 — 실제 지붕이 그렇고, 긴 쪽으로 잡으면 납작해진다
    const height = Math.min(width, depth) * PITCH_RATIO;

    const rotated = depth > width;

    roofs.push({
      x: building.x,
      y: building.height + height / 2,
      z: building.z,
      /*
       * 돌릴 때는 폭과 깊이도 함께 바꾼다.
       *
       * 인스턴스 행렬은 크기를 먼저 주고 그 다음 돌린다. 돌리기만 하면
       * **발자국이 90° 돌아가** 처마가 긴 변에 걸린다.
       */
      width: rotated ? depth : width,
      height,
      depth: rotated ? width : depth,
      tone: building.tone,
      blockIndex: building.blockIndex,
      /*
       * 용마루가 어느 쪽으로 뻗는지.
       *
       * 지오메트리는 x축으로 뻗은 용마루 하나만 만든다. 깊은 건물에서는
       * 90° 돌려 긴 쪽을 따라가게 한다 — 안 돌리면 처마가 긴 변에 걸린다.
       */
      rotationY: rotated ? Math.PI / 2 : 0,
    });
  }

  return roofs;
}

/**
 * 기와지붕이 처마를 얼마나 더 내미는지(m).
 *
 * 박공지붕(0.45m)보다 훨씬 깊다. **깊은 처마가 한옥 지붕의 전부**다 — 벽에서
 * 멀리 나온 지붕이 그 아래에 짙은 그늘을 만들고, 그 그늘 띠가 멀리서도
 * 「기와집」으로 읽힌다. 얕게 두면 그냥 색이 다른 지붕이다.
 */
const HANOK_EAVES = 1.15;

/**
 * 기와지붕 높이를 건물 폭의 몇 배로.
 *
 * 박공(0.26)보다 완만하다. 한옥 지붕은 가파른 대신 **넓고 무겁게** 앉는다.
 * 가파르게 두면 성이나 산장처럼 보인다.
 */
const HANOK_PITCH_RATIO = 0.2;

/**
 * 옛 마을의 기와지붕.
 *
 * 박공(`buildRoofs`)과 나누는 이유는 색이 아니라 **도형**이다. 이쪽은 네 면이
 * 모두 물매인 모임지붕이라 지오메트리가 다르고, 인스턴스 하나의 모양은
 * 묶음마다 하나뿐이라 묶음을 갈라야 한다.
 *
 * 높이 제한은 같이 쓴다 — 6층 위에 기와를 얹으면 그것도 어색하다.
 */
export function buildHanokRoofs(buildings: readonly BoxInstance[]): BoxInstance[] {
  const roofs: BoxInstance[] = [];

  for (const building of buildings) {
    if (building.height > MAX_ROOF_HEIGHT) continue;
    if (zoneForBlock(building.blockIndex).id !== "shrine") continue;

    const width = building.width + HANOK_EAVES * 2;
    const depth = building.depth + HANOK_EAVES * 2;
    const height = Math.min(width, depth) * HANOK_PITCH_RATIO;

    /*
     * 돌리지 않는다.
     *
     * 모임지붕은 네 면이 모두 물매라 긴 쪽·짧은 쪽 구분이 없다 — 박공처럼
     * 90° 돌릴 이유가 없고, 돌리면 용마루만 짧아진다.
     */
    roofs.push({
      x: building.x,
      y: building.height + height / 2,
      z: building.z,
      width,
      height,
      depth,
      tone: building.tone,
      blockIndex: building.blockIndex,
    });
  }

  return roofs;
}
