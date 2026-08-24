/**
 * 벽면의 결 — 순수 생성.
 *
 * 원작 화면의 정체는 **사실적인 배경 위의 카툰 캐릭터**이고, 개발진이 그 대비를
 * 일부러 만들었다고 말한다. 우리는 배경과 캐릭터가 **같은 추상도**에 있어서
 * 캐릭터가 배경에서 떠오르지 않았다 — 벽이 단색 면이라 가까이 붙어도 볼 것이
 * 없었다.
 *
 * 해상도를 올리지 않는다. **같은 크기 안에서 결만** 넣는다 — 캔버스 합성 비용과
 * 텍스처 메모리는 그대로여야 한다(백로그 11번의 예산 항목).
 *
 * 여기서는 **어디에 무엇을 칠할지**만 정한다. 그래야 규칙을 브라우저 없이 잴 수
 * 있다 — `textures.ts`는 `document`를 쓰는 파일이라 검사에서 부를 수 없다.
 *
 * 칠하는 함수를 여기 두려다 검사 둘에 걸렸다: 넘겨받은 캔버스에 쓰는 함수는
 * `project*` 계열이어야 하는데(`stateBoundaries`), 그 계열은 **매 프레임 도는
 * 곳에서 불려야** 뜻이 있다. 이 결은 시작할 때 한 번 구워진다 — 그래서
 * 캔버스를 아예 넘겨받지 않는다.
 */

import { createSeededRandom } from "@/game/core/mathx";

export const GRAIN = {
  /**
   * 한 장에 찍는 얼룩 수.
   *
   * 40이면 한 면에서 눈에 걸리되 화면이 지저분해지지 않는다. 늘리면 합성 시간이
   * 그만큼 늘고, 이 텍스처는 시작할 때 한 번에 구워진다.
   */
  markCount: 40,
  /** 얼룩 한 점의 크기 범위(텍스처 크기 대비 비율) */
  minSize: 0.04,
  maxSize: 0.22,
  /**
   * 얼룩의 진하기 범위.
   *
   * 더 진하면 벽에 **무늬**가 생겨 「결」이 아니라 벽지가 되고, 더 옅으면 압축을
   * 거치며 사라진다.
   */
  minAlpha: 0.06,
  maxAlpha: 0.16,
  /** 이음매(가로 줄) 간격 — 텍스처 크기 대비 */
  seamEvery: 0.25,
  /** 이음매의 진하기 */
  seamAlpha: 0.1,
} as const;

/** 결 한 점. 캔버스가 이 목록을 그대로 칠한다 */
export interface GrainMark {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0~1 */
  alpha: number;
  /** 어둡게 칠할지(때·그늘), 밝게 칠할지(빛바램) */
  dark: boolean;
}

/**
 * 결을 만든다.
 *
 * **시드를 받는다.** 벽면 톤마다 다른 결이어야 같은 무늬가 도시 전체에 반복되지
 * 않고, 그러면서도 판마다 같아야 한다 — 이 저장소의 다른 배치와 같은 규칙이다.
 */
export function buildGrain(size: number, seed: number): GrainMark[] {
  const random = createSeededRandom(seed);
  const marks: GrainMark[] = [];

  for (let i = 0; i < GRAIN.markCount; i += 1) {
    const width = size * (GRAIN.minSize + random() * (GRAIN.maxSize - GRAIN.minSize));
    const height = size * (GRAIN.minSize + random() * (GRAIN.maxSize - GRAIN.minSize));
    marks.push({
      // 가장자리를 넘지 않게 안쪽에서만 찍는다 — 넘으면 타일 이음매에서 잘린 자국이 보인다
      x: random() * (size - width),
      y: random() * (size - height),
      width,
      height,
      alpha: GRAIN.minAlpha + random() * (GRAIN.maxAlpha - GRAIN.minAlpha),
      /*
       * 어두운 것과 밝은 것을 섞는다. 한쪽만 쓰면 벽 전체가 그만큼 어두워지거나
       * 밝아져 **팔레트가 조용히 바뀐다** — 색을 눌러 둔 규칙(A-1)이 깨진다.
       */
      dark: random() < 0.6,
    });
  }

  // 층 이음매. 세로로 긴 벽이 한 덩어리로 보이지 않게 가로로 끊는다
  for (let y = GRAIN.seamEvery; y < 1; y += GRAIN.seamEvery) {
    marks.push({
      x: 0,
      y: size * y,
      width: size,
      height: Math.max(1, size * 0.004),
      alpha: GRAIN.seamAlpha,
      dark: true,
    });
  }

  return marks;
}
