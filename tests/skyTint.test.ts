import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { tintRatio } from "@/game/core/color";

/*
 * 하늘이 구역 색을 따라가는가.
 *
 * 안개만 구역에 맞춰 바꿔 놓았더니, **위를 올려다보면 숲에서도 도심의 하늘**이
 * 보였다. 지평선에서 안개와 하늘이 다른 색이라 이음매가 드러난다.
 *
 * 고치는 방법은 하나뿐이 아니었다. 하늘도 같은 계산을 한 번 더 하는 길이
 * 있었는데, 그러면 두 값이 갈라진다 — 안개에서 **빌려 오면** 갈라질 수가 없다.
 */

describe("tintRatio", () => {
  it("바탕과 목표가 같으면 아무 일도 하지 않는다", () => {
    /*
     * 이 성질이 안전판이다. 구역 보정이 없으면 1이 나와 하늘이 예전 그대로다 —
     * 「켰는데 화면이 이상해졌다」가 아니라 「켰는데 아무 일도 안 일어난다」가
     * 기본값이어야 한다.
     */
    const same = { r: 0.4, g: 0.6, b: 0.8 };
    const ratio = tintRatio(same, same, 1);

    expect(ratio.r).toBeCloseTo(1, 6);
    expect(ratio.g).toBeCloseTo(1, 6);
    expect(ratio.b).toBeCloseTo(1, 6);
  });

  it("밀린 만큼만 곱으로 뽑는다", () => {
    // 목표가 바탕의 1.2배면 비율도 1.2다 — 바탕 색은 결과에 남지 않는다
    const ratio = tintRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.6, g: 0.4, b: 0.5 }, 1);

    expect(ratio.r, `r ${ratio.r}`).toBeCloseTo(1.2, 6);
    expect(ratio.g, `g ${ratio.g}`).toBeCloseTo(0.8, 6);
    expect(ratio.b, `b ${ratio.b}`).toBeCloseTo(1, 6);
  });

  it("세기가 0이면 밀지 않는다", () => {
    const ratio = tintRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.9, g: 0.1, b: 0.5 }, 0);
    expect(ratio.r).toBeCloseTo(1, 6);
    expect(ratio.g).toBeCloseTo(1, 6);
  });

  it("세기가 절반이면 절반만 민다", () => {
    const full = tintRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.7, g: 0.5, b: 0.5 }, 1);
    const half = tintRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.7, g: 0.5, b: 0.5 }, 0.5);

    expect(half.r - 1, `half ${half.r} vs full ${full.r}`).toBeCloseTo((full.r - 1) / 2, 6);
  });

  it("어두운 바탕에서 나눗셈이 폭발하지 않는다", () => {
    /*
     * 밤 하늘은 0에 가깝다. 그대로 나누면 무한대가 되어 **그 채널만 하얗게
     * 타 버리는데**, 화면에서는 「하늘에 색깔 줄이 그였다」로 보이지 원인이
     * 나눗셈이라고는 안 보인다.
     */
    const ratio = tintRatio({ r: 0, g: 0.001, b: 0.5 }, { r: 0.9, g: 0.9, b: 0.5 }, 1);

    expect(Number.isFinite(ratio.r), `r ${ratio.r}`).toBe(true);
    expect(Number.isFinite(ratio.g), `g ${ratio.g}`).toBe(true);
    expect(ratio.r, `r ${ratio.r}`).toBe(1);
    expect(ratio.g, `g ${ratio.g}`).toBe(1);
  });

  it("한 프레임 튀어도 하늘이 번쩍이지 않게 묶는다", () => {
    /*
     * 시간대가 바뀌는 순간에는 안개 색이 아직 이전 시간대에서 따라오는
     * 중이라 비율이 잠깐 크게 튄다.
     */
    const huge = tintRatio({ r: 0.05, g: 0.5, b: 0.5 }, { r: 0.95, g: 0.5, b: 0.5 }, 1);
    const tiny = tintRatio({ r: 0.95, g: 0.5, b: 0.5 }, { r: 0.05, g: 0.5, b: 0.5 }, 1);

    expect(huge.r, `위로 ${huge.r}`).toBeLessThanOrEqual(1.6);
    expect(tiny.r, `아래로 ${tiny.r}`).toBeGreaterThanOrEqual(0.6);
  });
});

describe("배선", () => {
  const dome = readCode("src/game/world/SkyDome.tsx");

  it("하늘이 안개에서 색을 빌려 온다", () => {
    /*
     * 같은 계산을 하늘 쪽에서 한 번 더 하면 두 값이 갈라지고, 갈라지는 순간
     * 지평선에서 하늘과 안개가 다른 색이 된다. 빌려 오는지를 못 박는다.
     */
    expect(dome, "안개를 읽지 않는다").toContain("scene.fog");
    expect(dome, "tintRatio를 쓰지 않는다").toContain("tintRatio");
  });

  it("매 프레임 새 Color를 만들지 않는다", () => {
    // 60fps에서 초당 예순 개가 쓰레기로 쌓인다
    const frameBody = dome.slice(dome.indexOf("useFrame("));
    expect(frameBody).not.toContain("new THREE.Color(");
  });

  it("안개가 없어도 터지지 않는다", () => {
    // 씬에 안개가 없는 상태(포토 모드 전환·컨텍스트 복구)가 실제로 있다
    expect(dome).toContain("instanceof THREE.Fog");
  });
});
