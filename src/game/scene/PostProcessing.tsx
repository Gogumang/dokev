"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * `PlayerRig`와 같은 이유다. 공유 stats 객체를 고치는 곳이 렌더가 아니라
 * 렌더 밖의 `useFrame` 콜백이고, 이것을 setState로 옮기면 초당 60회
 * 리렌더가 된다. three/R3F의 표준 패턴이다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 블룸 + 색보정 — three 코어만으로 만든 후처리.
 *
 * 이 프로젝트가 지금까지 후처리를 피해 온 이유는 `FilterOverlay` 주석에 적혀
 * 있다: 실패하면 화면이 통째로 검게 나간다. 그래도 넣는 이유는, **빛이 번지지
 * 않는 것**이 참고하는 카툰 렌더와의 가장 큰 남은 차이이기 때문이다. 간판도
 * 창문도 해도 자기 밝기까지만 그려지고 주변으로 새어 나오지 않으면, 아무리
 * 색을 올려도 "조명이 꺼진 3D"로 보인다.
 *
 * `@react-three/postprocessing`을 쓰지 않는다. `/play` 청크가 gzip 283KB이고
 * 상한이 400KB인데(bundleBudget) 그 라이브러리가 여유분보다 크다. 필요한 것은
 * 패스 셋뿐이라 직접 짠다.
 *
 * ## 파이프라인
 *
 *   씬 → sceneRT → (밝은 부분만) brightRT → 가로 블러 → 세로 블러 → 합성 → 화면
 *
 * ## 색공간 — 여기서 한 번 크게 틀렸다
 *
 * 렌더타깃을 sRGB로 두면 저장은 sRGB로, **샘플링은 선형으로** 돌아온다
 * (하드웨어가 변환한다). 그래서 밝기 추출과 블러는 저절로 선형 공간에서
 * 계산된다 — 물리적으로도 맞는 자리다.
 *
 * 함정은 마지막이다. three는 렌더타깃에 그릴 때 셰이더 출력 변환을 끄고,
 * **화면에 그릴 때만** sRGB로 변환한다. 그런데 그 변환은 내장 재질의
 * `colorspace_fragment`가 하는 일이라 직접 만든 ShaderMaterial에는 없다.
 * 빠뜨리면 선형 값이 sRGB 화면에 그대로 나가 **도시 전체가 밤처럼 어두워진다**
 * — 실제로 그 화면을 보고서야 알았다. 합성 셰이더 끝의 `#include`가 그것이다.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { GRADE, MAX_DELTA_SECONDS } from "@/game/config/tuning";
import type { RuntimeStats } from "@/game/scene/sceneTypes";
import { createFlare, recordFlare } from "@/game/scene/screenFlare";
import { beatPulse } from "@/game/systems/audio/music";
import type { TimeOfDayId } from "@/game/world/timeOfDay";

/**
 * 블룸 버퍼 해상도 배율.
 *
 * 블러는 어차피 뭉개는 연산이라 절반 해상도로 충분하고, 픽셀 수가 1/4이라
 * 비용도 1/4이다. 1/4 해상도까지 내리면 밝은 창문 하나가 사각형 얼룩으로
 * 보이기 시작한다.
 */
const BLOOM_SCALE = 0.5;

/**
 * 이 밝기부터 번진다.
 *
 * 낮추면 벽까지 빛나 도시가 안개 속에 잠기고, 1에 붙이면 완전히 흰 픽셀만
 * 남아 간판 글자가 사라진다. 0.72는 「해를 받은 흰 벽」은 놔두고
 * 「간판·창문·하이라이트」만 잡는 자리다.
 */
const BLOOM_THRESHOLD = 0.72;

/** 문턱값 부근을 부드럽게 넘기는 폭. 0이면 밝기 경계에 계단이 생긴다 */
const BLOOM_KNEE = 0.2;

/** 번진 빛을 원본에 얼마나 더할지 */
const BLOOM_STRENGTH = 0.62;

/**
 * 박마다 블룸이 얼마나 더 세지는지(비율).
 *
 * 0.35다. 더 키우면 박마다 화면이 하얗게 뜨고, 그건 연출이 아니라 **깜빡임**이다.
 */
const BLOOM_PULSE = 0.35;

/**
 * 시간대별 맥동 세기.
 *
 * 밤에만 온전히 나온다. 낮에는 간판이 꺼져 있어 맥동할 것도 없다 —
 * 그런데도 블룸만 오르내리면 노출이 흔들리는 것처럼 보인다.
 */
const PULSE_BY_TIME: Record<TimeOfDayId, number> = {
  dawn: 0.35,
  noon: 0,
  sunset: 0.5,
  night: 1,
};

/**
 * 색보정.
 *
 * 채도는 톤매핑을 끄면서 이미 살아났으므로 조금만 올린다. 대비는 1을 넘기면
 * 그늘이 검게 눌려, 애써 들어 올린 반사광(hemisphereGround)이 도로 사라진다.
 */
/*
 * 색보정은 이제 상수가 아니다. 평상시와 절정은 `config/tuning.ts`의 `GRADE`에
 * 있고, 그 사이 어디인지는 전투 사건이 정한다(`screenFlare.ts`).
 */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform float threshold;
  uniform float knee;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tScene, vUv).rgb;
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    // 문턱 아래는 0, 위는 서서히 1 — 경계에 계단이 생기지 않게 한다
    float weight = smoothstep(threshold, threshold + knee, luminance);
    gl_FragColor = vec4(color * weight, 1.0);
  }
`;

/*
 * 가우시안 블러를 가로·세로로 나눠 두 번 돌린다.
 *
 * 2차원으로 한 번에 하면 표본이 9x9=81개지만, 나누면 9+9=18개로 같은 결과가
 * 나온다. 계수는 선형 보간을 이용해 표본 다섯 개로 아홉 개 몫을 하는 값이다.
 */
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 direction;
  varying vec2 vUv;

  void main() {
    vec3 sum = texture2D(tSource, vUv).rgb * 0.2270270270;
    sum += texture2D(tSource, vUv + direction * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tSource, vUv - direction * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tSource, vUv + direction * 3.2307692308).rgb * 0.0702702703;
    sum += texture2D(tSource, vUv - direction * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float strength;
  uniform float saturation;
  uniform float contrast;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * strength;

    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, saturation);

    /*
     * 대비의 기준점은 0.5가 아니라 0.18이다.
     *
     * 여기는 선형 공간이다(렌더타깃 샘플링이 이미 풀어 준다). 선형 0.5는
     * 화면에서 sRGB 0.73 — 눈으로 보는 중간 회색보다 한참 밝다. 0.5를 기준으로
     * 잡으면 화면의 거의 전부가 그 아래에 있어 **대비를 올릴수록 도시가
     * 어두워진다.** 실제로 그 화면을 보고 알았다. 18% 회색이 사진·영화에서
     * 쓰는 기준점이고, 선형 공간에서 그것이 0.18이다.
     */
    color = (color - 0.18) * contrast + 0.18;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);

    // 선형 → 화면 색공간(sRGB). 이 줄이 없으면 화면 전체가 어두워진다
    #include <colorspace_fragment>
  }
`;

/** 8비트 sRGB 렌더타깃. 색공간을 지정하지 않으면 합성 결과가 한 번 더 변환된다 */
function createTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    // 깊이는 씬을 그릴 때만 필요하다. 블러 버퍼에도 달면 대역폭만 쓴다.
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.texture.generateMipmaps = false;
  return target;
}

/** 씬 뒤에 붙는 풀스크린 패스 수(밝기 추출 + 가로 블러 + 세로 블러 + 합성) */
const POST_PASS_COUNT = 4;

export function PostProcessing({
  stats,
  timeOfDay,
}: {
  stats: RuntimeStats;
  /** 지금 시간대. 맥동은 **밤 연출**이라 낮에는 거의 티가 나지 않아야 한다 */
  timeOfDay: TimeOfDayId;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  /*
   * 실제 프레임버퍼 크기로 만든다.
   *
   * CSS 픽셀(size)로 만들면 DPR 2인 화면에서 절반 해상도로 그린 뒤 늘려
   * 붙이게 된다 — 도시 전체가 흐려지고, 원인은 "후처리를 켰더니 흐려졌다"는
   * 말로만 남는다.
   */
  const width = Math.round(size.width * dpr);
  const height = Math.round(size.height * dpr);

  const passes = useMemo(() => {
    const bloomWidth = Math.max(1, Math.round(width * BLOOM_SCALE));
    const bloomHeight = Math.max(1, Math.round(height * BLOOM_SCALE));

    const sceneTarget = createTarget(width, height);
    // 블러는 두 버퍼를 오가며 돈다(ping-pong). 하나로는 읽으면서 쓸 수 없다.
    const bloomTargetA = createTarget(bloomWidth, bloomHeight);
    const bloomTargetB = createTarget(bloomWidth, bloomHeight);
    bloomTargetA.depthBuffer = false;
    bloomTargetB.depthBuffer = false;

    const bright = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: BRIGHT_FRAGMENT,
      uniforms: {
        tScene: { value: sceneTarget.texture },
        threshold: { value: BLOOM_THRESHOLD },
        knee: { value: BLOOM_KNEE },
      },
      depthTest: false,
      depthWrite: false,
    });

    /*
     * 가로·세로 블러를 **각각 만든다.**
     *
     * 재질 하나를 두고 매 프레임 유니폼을 갈아 끼우는 편이 짧다. 그런데 그건
     * 렌더 밖에서 만든 것을 렌더 루프가 고치는 일이고, 이 저장소의 린트가
     * (정당하게) 막는다. 방향과 입력이 패스마다 고정이므로 애초에 바꿀 이유가
     * 없다 — 만들 때 박아 두면 프레임 루프에는 그리기만 남는다.
     */
    const makeBlur = (source: THREE.Texture, dx: number, dy: number) =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX,
        fragmentShader: BLUR_FRAGMENT,
        uniforms: {
          tSource: { value: source },
          direction: { value: new THREE.Vector2(dx, dy) },
        },
        depthTest: false,
        depthWrite: false,
      });

    const blurHorizontal = makeBlur(bloomTargetA.texture, 1 / bloomWidth, 0);
    const blurVertical = makeBlur(bloomTargetB.texture, 0, 1 / bloomHeight);

    const composite = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: {
        tScene: { value: sceneTarget.texture },
        tBloom: { value: bloomTargetA.texture },
        strength: { value: BLOOM_STRENGTH },
        saturation: { value: GRADE.saturationCalm },
        contrast: { value: GRADE.contrastCalm },
      },
      depthTest: false,
      depthWrite: false,
    });

    /*
     * 화면을 덮는 삼각형 하나.
     *
     * 사각형(두 삼각형)보다 낫다 — 대각선에서 픽셀이 두 번 계산되지 않고,
     * 정점도 셋뿐이다. 좌표를 -1..3으로 잡아 화면 밖으로 넘긴다.
     */
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

    /*
     * 패스마다 씬을 따로 만든다.
     *
     * 하나를 두고 재질만 바꿔 끼우는 편이 짧지만, 그러면 매 프레임 메모된
     * 객체를 고치게 된다. 렌더 루프가 렌더 밖에서 만든 것을 손대기 시작하면
     * 무엇이 언제 바뀌는지 추적이 끊긴다 — 지오메트리는 셋이 함께 쓰므로
     * 실제 비용은 THREE.Mesh 객체 두 개뿐이다.
     */
    const makeScene = (material: THREE.Material) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      const container = new THREE.Scene();
      container.add(mesh);
      return container;
    };

    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
      sceneTarget,
      bloomTargetA,
      bloomTargetB,
      bright,
      blurHorizontal,
      blurVertical,
      composite,
      geometry,
      brightScene: makeScene(bright),
      blurHorizontalScene: makeScene(blurHorizontal),
      blurVerticalScene: makeScene(blurVertical),
      compositeScene: makeScene(composite),
      quadCamera,
    };
  }, [width, height]);

  /*
   * 성능 계측 소유권을 가져온다.
   *
   * three는 `render()`를 부를 때마다 통계를 지운다. 한 프레임에 네 번 부르는
   * 지금, 프레임이 끝난 시점에 남는 것은 **마지막 합성 패스 하나**다 —
   * 성능 패널이 도시를 눈앞에 두고 「드로우콜 1, 삼각형 1」을 표시했다.
   * 계측이 거짓말을 하면 성능 판단이 통째로 무너진다.
   *
   * 렌더러의 `autoReset`을 끄는 방법도 있지만 그건 훅이 준 객체를 고치는
   * 일이라 이 저장소가 막는다. 대신 **씬 패스 직후**의 값을 직접 읽어
   * 넘긴다 — 어차피 의미 있는 수는 그것이다.
   */
  useEffect(() => {
    stats.renderStatsOwned = true;
    return () => {
      stats.renderStatsOwned = false;
    };
  }, [stats]);

  useEffect(
    () => () => {
      passes.sceneTarget.dispose();
      passes.bloomTargetA.dispose();
      passes.bloomTargetB.dispose();
      passes.bright.dispose();
      passes.blurHorizontal.dispose();
      passes.blurVertical.dispose();
      passes.composite.dispose();
      passes.geometry.dispose();
    },
    [passes],
  );

  /*
   * priority 1 — R3F의 자동 렌더가 꺼지고 여기가 유일한 렌더 지점이 된다.
   *
   * 저장소의 다른 `useFrame`은 전부 priority 0이라 **이 콜백보다 먼저** 돈다.
   * GameScene이 문서화해 둔 컴포넌트 순서 의존(되돌리기 → 합치기 → 읽기)이
   * 그대로 유지된다.
   */
  // 얼마나 터져 있는가. 프레임마다 고쳐 쓰므로 useMemo로 한 번만 만든다
  const flare = useMemo(() => createFlare(), []);

  useFrame(({ clock }, delta) => {
    /*
     * 곡의 박에 맞춰 블룸이 맥동한다.
     *
     * 시계는 **렌더 시계**다(`clock.elapsedTime`). 오디오 컨텍스트를 보면
     * 소리를 끈 사람의 화면이 멈춘다 — `music.ts`의 위상 함수가 순수한 이유다.
     *
     * 낮에는 거의 티가 나지 않는다. 밤 번화가에서 간판빛이 숨 쉬는 연출이지,
     * 한낮 하늘까지 함께 밝아지면 그건 노출이 흔들리는 것으로 보인다.
     */
    /*
     * 사건이 터진 만큼 채도·대비를 올렸다 되돌린다. 평상시는 예전보다 차분하고,
     * 로봇을 눕히는 순간에만 화면이 짧게 진해진다.
     */
    recordFlare(flare, stats.combat, Math.min(delta, MAX_DELTA_SECONDS));
    passes.composite.uniforms.saturation.value =
      GRADE.saturationCalm + (GRADE.saturationPeak - GRADE.saturationCalm) * flare.level;
    passes.composite.uniforms.contrast.value =
      GRADE.contrastCalm + (GRADE.contrastPeak - GRADE.contrastCalm) * flare.level;

    passes.composite.uniforms.strength.value =
      BLOOM_STRENGTH * (1 + BLOOM_PULSE * PULSE_BY_TIME[timeOfDay] * beatPulse(clock.elapsedTime));

    const {
      sceneTarget,
      bloomTargetA,
      bloomTargetB,
      brightScene,
      blurHorizontalScene,
      blurVerticalScene,
      compositeScene,
      quadCamera,
    } = passes;

    gl.setRenderTarget(sceneTarget);
    gl.render(scene, camera);

    /*
     * 여기가 통계를 읽을 수 있는 유일한 순간이다.
     *
     * 다음 `render()`가 이 값을 지운다. 후처리 패스 셋은 각각 화면을 덮는
     * 삼각형 하나라 더해 준다 — 「후처리를 켜면 드로우콜이 셋 는다」가
     * 패널에 그대로 보여야 판단이 선다.
     */
    stats.drawCalls = gl.info.render.calls + POST_PASS_COUNT;
    stats.triangles = gl.info.render.triangles + POST_PASS_COUNT;

    // 밝은 부분만 뽑는다 (A로)
    gl.setRenderTarget(bloomTargetA);
    gl.render(brightScene, quadCamera);

    // 가로 블러: A를 읽어 B로
    gl.setRenderTarget(bloomTargetB);
    gl.render(blurHorizontalScene, quadCamera);

    // 세로 블러: B를 읽어 다시 A로. 합성은 A를 본다
    gl.setRenderTarget(bloomTargetA);
    gl.render(blurVerticalScene, quadCamera);

    /*
     * 마지막은 기본 프레임버퍼로 그린다.
     *
     * 여기가 화면이고, 동시에 **사진 저장이 읽는 곳**이다
     * (`preserveDrawingBuffer` + `toBlob`). 렌더타깃에 남겨 두면 사진이
     * 빈 이미지로 나온다.
     */
    gl.setRenderTarget(null);
    gl.render(compositeScene, quadCamera);
  }, 1);

  return null;
}
