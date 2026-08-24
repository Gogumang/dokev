import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

/*
 * 물가 거품선.
 *
 * 바다를 깔아 놓고 **물과 땅이 딱 맞닿아** 있었다. 잘라 붙인 파란 종이처럼
 * 보였는데, 실제 물가에서 눈이 먼저 잡는 것은 물색이 아니라 **하얗게 부서지는
 * 선**이다.
 *
 * 화면에만 나타나는 값이라 검사가 잡기 어렵다. 그래서 **관계와 배선**을 잰다.
 */

const sea = readCode("src/game/world/Sea.tsx");
const textures = readCode("src/game/world/textures.ts");

describe("거품 띠 배선", () => {
  it("바다가 실제로 거품을 그린다", () => {
    /*
     * 이 저장소에서 가장 흔했던 결함은 「값은 맞는데 화면에 안 나온다」였다.
     * 텍스처와 지오메트리를 만들어 놓고 걸지 않으면 검사는 통과하고 물가만
     * 예전 그대로다.
     */
    expect(sea, "거품 지오메트리를 만들지 않는다").toContain("buildFoamRibbon");
    expect(sea, "거품 텍스처를 안 가져온다").toContain("getFoamTexture");
    expect(sea, "거품 메시를 안 건다").toMatch(/geometry=\{foam\}/);
  });

  it("거품이 지면 위에 뜬다", () => {
    /*
     * 같은 높이에 두면 z-파이팅이 나 **거품이 지직거린다.** 화면에서는
     * 「물가가 깜빡인다」로 보이지 원인이 깊이 정밀도라고는 안 보인다.
     */
    expect(sea).toContain("FOAM_LIFT");
    expect(sea, "지면 높이에 그대로 둔다").toMatch(/terrainHeight\(p\.x, p\.z\) \+ FOAM_LIFT/);

    const lift = Number(/const FOAM_LIFT = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    expect(lift, `띄운 높이 ${lift}m`).toBeGreaterThan(0);
    // 너무 띄우면 물 위에 뜬 흰 판이 된다
    expect(lift, `띄운 높이 ${lift}m`).toBeLessThan(0.3);
  });

  it("양면으로 그린다", () => {
    /*
     * 한 면만 그렸더니 **띠가 통째로 안 보였다.** 감김 방향이 아래를 향해
     * 위에서 보면 뒷면이었던 것이다 — 빨간색으로 칠해 보고서야 「색이 옅어서
     * 안 보인다」가 아니라 「그려지지 않는다」임을 알았다. 되돌리면 같은 일이
     * 반복되므로 못 박는다.
     */
    expect(sea, "한 면만 그린다").toContain("side={THREE.DoubleSide}");
  });

  it("반투명이되 깊이에 써 넣지 않는다", () => {
    /*
     * 반투명인데 깊이에 쓰면 **뒤쪽 수면이 잘려 띠 안쪽에 구멍이 뚫린다.**
     * 물가를 고치려다 물에 구멍을 내는 셈이다.
     */
    expect(sea).toContain("transparent");
    expect(sea).toContain("depthWrite={false}");
  });

  it("거품이 물가를 따라서만 흐른다", () => {
    /*
     * 가로질러 흘리면 거품이 뭍으로 기어 올라가거나 바다로 밀려나는 것으로
     * 보인다. x(길이 방향)만 흘려야 한다.
     */
    expect(sea).toMatch(/foamMap\.offset\.x \+= delta \* FOAM_DRIFT/);
    expect(sea, "가로질러도 흘린다").not.toMatch(/foamMap\.offset\.y/);
  });

  it("거품이 수면보다 느리게 흐른다", () => {
    // 밀려드는 것으로 보이려면 수면을 앞지르면 안 된다
    const drift = Number(/const FOAM_DRIFT = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    const wave = Number(/const WAVE_SPEED = ([\d.]+);/.exec(sea)?.[1] ?? NaN);

    expect(Number.isFinite(drift) && Number.isFinite(wave), `${drift} / ${wave}`).toBe(true);
    expect(drift, `거품 ${drift} vs 수면 ${wave}`).toBeLessThan(wave);
  });

  it("거품이 지형을 따라간다", () => {
    /*
     * 수면처럼 평평하게 두면 마루에서는 땅에 파묻히고 골짜기에서는 공중에
     * 뜬다 — 벼랑 치마에서 이미 겪은 모양이다.
     */
    const ribbon = sea.slice(sea.indexOf("function buildFoamRibbon"));
    expect(ribbon, "지형 높이를 안 읽는다").toContain("terrainHeight(");
  });

  it("거품이 뭍 안쪽으로 뻗는다", () => {
    /*
     * 처음에는 바다 쪽에 깔았다. 물리적으로는 맞지만 **화면에서 한 번도 안
     * 보였다** — 뭍 가장자리가 수면보다 8~16m 높은 벼랑이라 뭍에서 보면
     * 그 벼랑이 물가를 통째로 가린다. 딱딱해 보이는 선은 뭍 쪽인데 거품은
     * 그 아래 숨어 있었다.
     *
     * 다시 바다 쪽으로 돌리면 같은 일이 반복되므로 방향을 못 박는다.
     */
    const ribbon = sea.slice(sea.indexOf("function buildFoamRibbon"));
    expect(ribbon, "바깥으로 뻗는다").toContain("halfExtent - FOAM_REACH");
    expect(ribbon).not.toContain("halfExtent + FOAM_REACH");
  });

  it("띠 폭이 사람 눈에 읽히는 크기다", () => {
    // 좁으면 흰 실 한 줄이고, 넓으면 바다 가장자리가 통째로 하얘진다
    const reach = Number(/const FOAM_REACH = ([\d.]+);/.exec(sea)?.[1] ?? NaN);
    expect(reach, `띠 폭 ${reach}m`).toBeGreaterThan(1.5);
    expect(reach, `띠 폭 ${reach}m`).toBeLessThan(12);
  });
});

describe("거품 텍스처", () => {
  it("세로로 반복하지 않는다", () => {
    /*
     * 세로는 뭍에서 바다로 가는 **그라데이션 한 번**이다. 반복시키면
     * 바다 한가운데 거품 줄이 또 생긴다.
     */
    const foam = textures.slice(textures.indexOf("export function getFoamTexture"));
    expect(foam).toContain("texture.wrapT = THREE.ClampToEdgeWrapping");
    expect(foam).toContain("texture.wrapS = THREE.RepeatWrapping");
  });

  it("바깥으로 흐려진다", () => {
    /*
     * 가장자리를 딱 끊으면 거품 띠의 바깥 선이 **또 하나의 딱딱한 경계**가
     * 되어, 고치려던 것을 한 칸 옮겨 놓는 꼴이 된다.
     */
    const foam = textures.slice(textures.indexOf("export function getFoamTexture"));
    expect(foam).toContain('addColorStop(1, "rgba(255, 255, 255, 0)")');
  });

  it("정리할 때 함께 놓아 준다", () => {
    // 캐시해 두고 안 지우면 컨텍스트를 다시 만들 때마다 쌓인다
    expect(textures).toContain("foamCache?.dispose();");
  });
});
