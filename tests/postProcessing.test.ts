import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { QUALITY_PRESETS } from "@/game/systems/quality";

/*
 * 후처리(블룸 + 색보정).
 *
 * 이 프로젝트는 후처리를 오래 피해 왔다 — `FilterOverlay` 주석이 이유를
 * 적어 두었다: 실패하면 화면이 통째로 검게 나간다. 실제로 넣는 과정에서
 * **두 번** 그 근처까지 갔다:
 *
 * 1. 합성 셰이더에 색공간 변환을 빠뜨려 선형 값이 sRGB 화면에 그대로 나갔다
 *    — 도시 전체가 밤처럼 어두워졌다.
 * 2. 대비 기준점을 0.5로 잡았다. 여기는 선형 공간이라 0.5는 화면의 중간이
 *    아니라 한참 위다 — 대비를 올릴수록 어두워졌다.
 *
 * 둘 다 테스트로는 안 잡히고 화면을 봐야 아는 종류였다. 그래서 여기서
 * 잡는 것은 결과 픽셀이 아니라 **그 실패로 되돌아가는 경로**다.
 */

const source = readFileSync("src/game/scene/PostProcessing.tsx", "utf8");
const scene = readFileSync("src/game/scene/GameScene.tsx", "utf8");

describe("렌더 순서", () => {
  it("priority 1로 렌더를 넘겨받는다", () => {
    /*
     * priority가 0이면 R3F가 자동으로도 그려서 한 프레임에 두 번 그린다.
     * 1이어야 자동 렌더가 꺼지고 여기가 유일한 렌더 지점이 된다.
     */
    expect(source).toMatch(/useFrame\([\s\S]*?\},\s*1\)/);
  });

  it("마지막 패스를 기본 프레임버퍼에 그린다", () => {
    /*
     * 렌더타깃에 남겨 두면 화면이 비고, **사진 저장도 빈 이미지가 된다**
     * (preserveDrawingBuffer + toBlob이 읽는 곳이 여기다).
     */
    const composite = source.slice(source.lastIndexOf("gl.setRenderTarget(null)"));
    expect(composite, "null 타깃 설정이 없다").toContain("gl.setRenderTarget(null)");
    expect(composite).toContain("compositeScene");
  });

  it("합성이 마지막이다", () => {
    // 합성 뒤에 다른 렌더타깃을 걸면 화면에 그 결과가 남지 않는다
    const lastNull = source.lastIndexOf("gl.setRenderTarget(null)");
    const lastTarget = source.lastIndexOf("gl.setRenderTarget(bloom");
    expect(lastNull, "블룸 패스가 합성 뒤에 있다").toBeGreaterThan(lastTarget);
  });
});

describe("색공간", () => {
  it("합성 셰이더가 화면 색공간으로 변환한다", () => {
    /*
     * three는 렌더타깃에 그릴 때 셰이더 출력 변환을 끄고 화면에 그릴 때만
     * 켠다. 그 변환은 내장 재질의 chunk가 하는 일이라 직접 만든
     * ShaderMaterial에는 없다 — 빠뜨리면 도시가 밤처럼 어두워진다.
     */
    expect(source).toContain("#include <colorspace_fragment>");
  });

  it("렌더타깃이 sRGB로 저장한다", () => {
    // 선형 8비트로 두면 어두운 쪽에 띠가 생긴다
    expect(source).toContain("THREE.SRGBColorSpace");
  });

  it("대비 기준점이 선형 중간값이다", () => {
    /*
     * 0.5는 sRGB의 중간이지 선형의 중간이 아니다. 여기는 선형 공간이므로
     * 18% 회색(0.18)이 기준이어야 한다.
     */
    expect(source).toContain("0.18) * contrast + 0.18");
    expect(source, "0.5 기준으로 되돌아갔다").not.toContain("0.5) * contrast + 0.5");
  });
});

describe("품질 배선", () => {
  it("저사양에서는 끈다", () => {
    // 풀스크린 패스가 넷이다. 그림자도 못 켜는 기기가 감당할 비용이 아니다
    expect(QUALITY_PRESETS.low.postProcessing).toBe(false);
    expect(QUALITY_PRESETS.medium.postProcessing).toBe(true);
    expect(QUALITY_PRESETS.high.postProcessing).toBe(true);
  });

  it("씬이 조건부로 단다", () => {
    /*
     * 끌 때 **컴포넌트 자체를 떼야** 한다. 달아 둔 채 내부에서 분기하면
     * priority 1 구독이 남아 R3F의 자동 렌더가 계속 꺼져 있고, 화면이
     * 검게 나간다.
     */
    expect(scene).toContain("quality.postProcessing && <PostProcessing");
  });

  it("그림자를 켜는 품질에서만 켠다", () => {
    // 후처리가 그림자보다 싸지 않다 — 순서가 뒤집히면 예산 판단이 어긋난다
    for (const preset of Object.values(QUALITY_PRESETS)) {
      if (preset.postProcessing) {
        expect(preset.shadows, `${preset.level}`).toBe(true);
      }
    }
  });
});

describe("만든 자원을 놓는가", () => {
  it("렌더타깃 셋과 재질 넷을 전부 해제한다", () => {
    /*
     * 렌더타깃은 화면 크기가 바뀔 때마다 다시 만든다. 놓지 않으면 창을
     * 몇 번 줄였다 늘리는 것만으로 GPU 메모리가 쌓인다.
     */
    const created = (source.match(/new THREE\.(WebGLRenderTarget|ShaderMaterial|BufferGeometry)\(/g) ?? [])
      .length;
    const disposed = (source.match(/\.dispose\(\)/g) ?? []).length;
    expect(disposed, `만든 ${created}개 / 놓은 ${disposed}개`).toBeGreaterThanOrEqual(created);
  });

  it("정리를 언마운트 시점에 건다", () => {
    // useMemo 안에서 정리하면 쓰고 있는 것을 해제한다
    expect(source).toMatch(/useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>/);
  });
});
