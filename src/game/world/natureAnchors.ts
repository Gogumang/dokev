/**
 * 선돌 — 자연 구역의 그래플 지점이자 이정표.
 *
 * `cityLayout`이 800줄 상한을 넘어 떼어 냈다. 상한이 「이 묶음은 다른 책임인가」를
 * 묻게 했고 답은 그렇다였다: 나머지는 **도시를 세우는** 코드인데, 이것은
 * 도시가 없는 자리에 무엇을 둘지를 정한다.
 *
 * `cityLayout`을 **값으로** import하지 않는다 — 그쪽이 이 파일을 부르므로
 * 순환이 되고, 이 저장소는 그 순환 하나로 검사 49개가 죽는 걸 겪었다
 * (`zones.ts` 주석). 치수는 인자로 받고 타입만 가져온다.
 */

import type { Aabb } from "@/game/player/locomotion";
import type { BoxInstance, GrappleAnchorSpec } from "@/game/world/cityLayout";
import { terrainHeight } from "@/game/world/terrain";

export interface NatureBlock {
  blockIndex: number;
  cx: number;
  cz: number;
}

export interface NatureAnchors {
  rocks: BoxInstance[];
  colliders: Aabb[];
  grappleAnchors: GrappleAnchorSpec[];
}

/**
 * 선돌 수치.
 *
 * 그래플 사거리(24m)가 이 값들을 정한다. 한 구역(34m)의 어느 구석에서도 걸려야
 * 하므로, 중심에 하나만 세우면 모서리까지가 24.04m — **1cm 차이로 걸리거나
 * 안 걸린다.** 그런 여유로 두면 지형이 조금만 바뀌어도 숲에서 이동이 막힌다.
 * 네 귀퉁이에 나눠 세워 최악 거리를 12m대로 내린다.
 */
const ROCK = {
  minHeight: 7.5,
  heightSpread: 3.4,
  minWidth: 1.5,
  widthSpread: 1.1,
  /** 자리를 흩는 폭(m). 정확히 격자에 놓이면 사람이 세운 것처럼 보인다 */
  jitter: 2.6,
} as const;

/**
 * 자연 구역에 선돌을 세운다.
 *
 * 그래플을 걸 곳이면서 동시에 **숲의 랜드마크**다. 나무만 있으면 어디가 어딘지
 * 알 수 없는데, 키 큰 바위가 서 있으면 그것이 이정표가 된다.
 *
 * 광장·번화가·시장·주택가에는 세우지 않는다 — 거기엔 가로등이 있다.
 */
export function buildNatureAnchors(
  blocks: readonly NatureBlock[],
  blockSize: number,
  random: () => number,
): NatureAnchors {
  const rocks: BoxInstance[] = [];
  const colliders: Aabb[] = [];
  const anchors: GrappleAnchorSpec[] = [];

  for (const { blockIndex, cx, cz } of blocks) {
    const offset = blockSize / 4;

    for (const dx of [-offset, offset]) {
      for (const dz of [-offset, offset]) {
        const x = cx + dx + (random() - 0.5) * ROCK.jitter;
        const z = cz + dz + (random() - 0.5) * ROCK.jitter;
        const height = ROCK.minHeight + random() * ROCK.heightSpread;
        const width = ROCK.minWidth + random() * ROCK.widthSpread;

        rocks.push({
          x,
          y: height / 2,
          z,
          width,
          height,
          // 앞뒤로 살짝 다르게 — 정사각 단면은 어느 각도에서 봐도 같아 기둥으로 보인다
          depth: width * (0.75 + random() * 0.5),
          tone: Math.floor(random() * 2),
          blockIndex,
          /*
           * 땅에 파묻는다. 둥근 덩어리는 아래쪽이 좁아 지면과 닿는 자리가
           * 점이 되고, 그러면 **떠 있는 돌**로 보인다.
           */
          sink: height * 0.18,
        });

        colliders.push({
          minX: x - width / 2,
          maxX: x + width / 2,
          minZ: z - width / 2,
          maxZ: z + width / 2,
          top: terrainHeight(x, z) + height,
        });

        // 꼭대기보다 조금 아래에 건다 — 정점에 걸면 밧줄이 실루엣 밖으로 나간다
        anchors.push({ x, z, height: height * 0.9 });
      }
    }
  }

  return { rocks, colliders, grappleAnchors: anchors };
}
