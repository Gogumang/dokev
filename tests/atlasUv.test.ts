import { describe, expect, it } from "vitest";

import { atlasCellUv, type TextureAtlas } from "@/game/world/atlasTextures";

/*
 * 아틀라스 셀 → UV.
 *
 * 도시의 **간판과 소품 그림이 전부 이 함수를 지난다.** 그런데 셋을 뒤집어 봐도
 * 아무 검사가 몰랐다: 범위 밖 셀 감싸기, 세로 뒤집기, 셀 안쪽 여백.
 *
 * 증상이 셋 다 다르다:
 *   - 감싸기가 없으면 셀 번호가 넘칠 때 **아틀라스 밖**을 가리켜 간판이 깨진다.
 *   - 세로 뒤집기가 빠지면 모든 간판이 **엉뚱한 줄의 그림**을 단다. 텍스처의
 *     원점은 왼쪽 아래인데 셀은 왼쪽 위부터 세기 때문이다.
 *   - 여백이 없으면 밉맵이 이웃 셀을 물고 들어와 가장자리에 남의 색이 낀다 —
 *     감싸기 방식(ClampToEdge)에서 막은 것과 **같은 가족**의 사고다.
 *
 * 실제 아틀라스는 캔버스가 있어야 만들어지므로, 치수만 있는 대역을 쓴다.
 * 이 함수가 보는 것은 `image.width/height`와 격자 수뿐이다.
 */

/** 치수만 가진 아틀라스 대역 — 이 함수가 실제로 읽는 것만 담는다 */
function stub(columns: number, rows: number, cellCount: number, size = 512): TextureAtlas {
  return {
    texture: { image: { width: size, height: size } },
    columns,
    rows,
    cellCount,
  } as unknown as TextureAtlas;
}

describe("아틀라스 셀 좌표", () => {
  const atlas = stub(4, 4, 16);

  it("모든 셀이 아틀라스 안에 있다", () => {
    for (let cell = 0; cell < 16; cell += 1) {
      const uv = atlasCellUv(atlas, cell);
      expect(uv.offsetX, `셀 ${cell} offsetX`).toBeGreaterThanOrEqual(0);
      expect(uv.offsetY, `셀 ${cell} offsetY`).toBeGreaterThanOrEqual(0);
      expect(uv.offsetX + uv.scaleX, `셀 ${cell} 오른쪽 끝`).toBeLessThanOrEqual(1);
      expect(uv.offsetY + uv.scaleY, `셀 ${cell} 위쪽 끝`).toBeLessThanOrEqual(1);
    }
  });

  it("범위 밖 셀도 안으로 감싼다 — 아니면 아틀라스 밖을 가리켜 간판이 깨진다", () => {
    for (const cell of [16, 17, 33, -1, -16]) {
      const uv = atlasCellUv(atlas, cell);
      expect(uv.offsetX, `셀 ${cell} offsetX=${uv.offsetX}`).toBeGreaterThanOrEqual(0);
      expect(uv.offsetY, `셀 ${cell} offsetY=${uv.offsetY}`).toBeGreaterThanOrEqual(0);
      expect(uv.offsetX + uv.scaleX, `셀 ${cell} 오른쪽 끝`).toBeLessThanOrEqual(1);
    }
    // 한 바퀴 돌면 같은 칸이다
    expect(atlasCellUv(atlas, 16)).toEqual(atlasCellUv(atlas, 0));
    expect(atlasCellUv(atlas, -1)).toEqual(atlasCellUv(atlas, 15));
  });

  it("첫 셀이 왼쪽 위에 온다 — 뒤집기가 빠지면 모든 간판이 엉뚱한 줄을 단다", () => {
    /*
     * 텍스처 원점은 왼쪽 **아래**인데 셀은 왼쪽 **위**부터 센다. 그래서 첫 셀의
     * v는 위쪽 끝(1)에 붙어야 한다. 뒤집기를 빼면 0 근처로 내려온다.
     */
    const first = atlasCellUv(atlas, 0);
    const last = atlasCellUv(atlas, 15);
    expect(first.offsetY, `첫 셀 v=${first.offsetY}`).toBeGreaterThan(last.offsetY);
    /*
     * 위쪽 끝에 「붙는다」가 아니라 **여백만큼 안쪽**이다. 처음에 1에 딱 붙는
     * 것으로 적었다가 걸렸는데, 틀린 것은 코드가 아니라 내 기대였다 — 여백을
     * 두는 것이 바로 옆 검사가 요구하는 바다.
     */
    const top = first.offsetY + first.scaleY;
    expect(top, `첫 셀 위쪽 끝 ${top}`).toBeGreaterThan(0.97);
    expect(top, `첫 셀이 아틀라스를 넘었다: ${top}`).toBeLessThanOrEqual(1);
  });

  it("셀마다 서로 다른 자리를 가리킨다 — 겹치면 같은 그림이 반복된다", () => {
    const seen = new Set(
      Array.from({ length: 16 }, (_, cell) => {
        const uv = atlasCellUv(atlas, cell);
        return `${uv.offsetX.toFixed(6)},${uv.offsetY.toFixed(6)}`;
      }),
    );
    expect(seen.size, `서로 다른 자리 ${seen.size}개`).toBe(16);
  });

  it("셀 안쪽으로 여백을 둔다 — 없으면 이웃 셀 색이 가장자리에 낀다", () => {
    // 격자를 그대로 쓰면 폭이 정확히 1/columns다. 여백이 있으면 그보다 좁다
    const uv = atlasCellUv(atlas, 5);
    expect(uv.scaleX, `가로 ${uv.scaleX} vs 격자 ${1 / 4}`).toBeLessThan(1 / 4);
    expect(uv.scaleY, `세로 ${uv.scaleY} vs 격자 ${1 / 4}`).toBeLessThan(1 / 4);
    // 여백이 셀을 다 잡아먹으면 그림이 사라진다
    expect(uv.scaleX, "여백이 과하다").toBeGreaterThan(1 / 4 - 0.05);
  });

  it("아틀라스가 커지면 여백 비율이 줄어든다 — 픽셀 기준이라 그래야 맞다", () => {
    // 여백은 px 단위다. 큰 텍스처에서 같은 비율을 깎으면 필요 이상으로 잘린다
    const small = atlasCellUv(stub(4, 4, 16, 256), 0);
    const large = atlasCellUv(stub(4, 4, 16, 1024), 0);
    expect(large.scaleX, `큰 쪽 ${large.scaleX} vs 작은 쪽 ${small.scaleX}`).toBeGreaterThan(
      small.scaleX,
    );
  });
});
