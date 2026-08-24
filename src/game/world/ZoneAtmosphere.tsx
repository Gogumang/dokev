"use client";

/**
 * 구역별 공기 — 안개 거리와 색조를 걸어가는 동안 바꾼다.
 *
 * 건물과 나무를 갈라 놓아도 **공기가 같으면 같은 날씨의 같은 도시**다. 숲은
 * 이름이 「안개 숲」인데 번화가와 똑같이 맑았고, 해안은 「윤슬」이라면서 시야가
 * 도심과 같았다.
 *
 * 두 가지를 지켜야 한다:
 *
 * 1. **매 프레임 setState 금지.** 구역이 바뀔 때마다 리렌더하면 씬 전체가
 *    다시 조립된다. `scene.fog`를 직접 고친다.
 * 2. **경계에서 튀지 않기.** 구역 경계는 도로 한가운데라 한 걸음에 넘나든다.
 *    목표값으로 즉시 옮기면 안개가 깜빡인다 — 시간 상수를 두고 따라가게 한다.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { QualityPreset } from "@/game/systems/quality";
import type { TimeOfDayPreset } from "@/game/world/timeOfDay";
import { ZONES, type ZoneId } from "@/game/world/zones";

/**
 * 목표 공기에 얼마나 빨리 다가갈지(초당 비율).
 *
 * 1.4는 **한 구역을 가로지르는 시간**(34m를 달리기 7.4m/s로 4.6초)보다 조금
 * 빠르다. 더 느리면 숲을 다 지나도록 안개가 안 짙어지고, 더 빠르면 도로에서
 * 구역이 갈릴 때 안개가 눈에 띄게 출렁인다.
 */
const EASE_PER_SECOND = 1.4;

/**
 * 안개가 시작·끝 거리를 뒤집지 않도록 두는 최소 간격(m).
 *
 * 숲은 시작을 0.46배까지 당기는데, 품질 프리셋에 따라서는 끝보다 앞서 나갈 수
 * 있다. `near >= far`가 되면 three가 안개를 **통째로 꺼 버린다** — 가장 짙어야
 * 할 곳이 가장 맑아지는, 부호 하나 뒤집힌 종류의 결함이다.
 */
const MIN_FOG_SPAN = 12;

interface AtmosphereState {
  base: THREE.Color;
  target: THREE.Color;
  tint: THREE.Color;
  near: number;
  far: number;
  started: boolean;
}

export function ZoneAtmosphere({
  quality,
  preset,
  /**
   * 지금 서 있는 구역을 매 프레임 알려 주는 공유 객체.
   *
   * `RuntimeStats`를 통째로 받지 않고 **읽는 칸만** 적어 둔다 — 이 컴포넌트가
   * 씬 상태 전체에 묶이면 다른 칸이 바뀔 때마다 여기까지 따라 읽게 된다.
   */
  viewer,
}: {
  quality: QualityPreset;
  preset: TimeOfDayPreset;
  viewer: { readonly district: ZoneId };
}) {
  /*
   * 매 프레임 고칠 값들.
   *
   * `useMemo`로 만들면 **컴파일러가 고치는 것을 막는다** — 훅에 넘긴 값을
   * 나중에 바꾸면 메모가 낡는지 알 수 없기 때문이다(`Sea`에서 같은 벽을
   * 만났다). ref에 `null`을 넣어 두고 첫 프레임에 만든다.
   *
   * 매 프레임 새로 만들지는 않는다 — 60fps에서 초당 240개의 Color가 쓰레기로
   * 쌓인다.
   */
  const stateRef = useRef<AtmosphereState | null>(null);

  useFrame(({ scene }, delta) => {
    const fog = scene.fog;
    if (!(fog instanceof THREE.Fog)) return;

    const state = (stateRef.current ??= {
      base: new THREE.Color(),
      target: new THREE.Color(),
      tint: new THREE.Color(),
      near: quality.fogNear,
      far: quality.fogFar,
      started: false,
    });
    const mood = (ZONES[viewer.district] ?? ZONES.plaza).mood;

    // 시간대가 정한 색과 거리가 바탕이다. 구역은 그 위에 얹힌다.
    state.base.set(preset.sky);
    state.tint.set(mood.tint);
    state.target.copy(state.base).lerp(state.tint, mood.tintStrength);

    const targetNear = quality.fogNear * mood.fogNearScale;
    const targetFar = quality.fogFar * mood.fogFarScale;

    /*
     * 첫 프레임은 즉시 맞춘다.
     *
     * 따라가게만 두면 어디서 시작하든 **광장의 공기에서 출발해** 몇 초 동안
     * 흘러간다. 숲에서 이어하기로 시작한 사람은 그동안 맑은 숲을 본다.
     */
    const step = state.started ? Math.min(1, delta * EASE_PER_SECOND) : 1;
    state.started = true;

    state.near += (targetNear - state.near) * step;
    state.far += (targetFar - state.far) * step;

    fog.near = state.near;
    // 시작이 끝을 앞지르면 three가 안개를 통째로 끈다 (MIN_FOG_SPAN 주석)
    fog.far = Math.max(state.far, state.near + MIN_FOG_SPAN);
    fog.color.lerp(state.target, step);
  });

  return null;
}
