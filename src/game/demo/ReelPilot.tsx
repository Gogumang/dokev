"use client";

/**
 * 촬영 모드의 **손과 시계.**
 *
 * 둘을 한 컴포넌트에 둔다: 매 프레임 스틱을 미는 손(`autopilotFrame`)과,
 * 바깥에서 「한 프레임 진행해라」를 받는 시계(`window`의 손잡이).
 *
 * 나뉘면 시계가 흐른 만큼과 손이 본 시각이 갈라진다 — 영상 중간부터 조종이
 * 반 박자씩 밀린다.
 *
 * 촬영 모드가 아니면 **아무것도 하지 않는다.** 켜는 판단을 부르는 쪽에 맡기지
 * 않는 이유: 씬은 이미 상한에 닿아 있고, 무엇보다 「꺼져 있을 때 아무 일도
 * 안 일어난다」는 것이 이 파일 안에서 읽혀야 한다.
 */

import { advance, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";

import { autopilotFrame, recordReelFrame } from "@/game/demo/autopilot";
import { REEL_HANDLE, REEL_STEP_SECONDS, REEL_TOTAL_SECONDS } from "@/game/demo/reelMode";
import { buildDemoRoute } from "@/game/systems/demoRoute";
import type { InputState } from "@/game/systems/input";
import type { CityLayout } from "@/game/world/cityLayout";
import type { RuntimeStats } from "@/game/scene/sceneTypes";

export interface ReelPilotProps {
  /** 촬영 모드인가. 아니면 이 컴포넌트는 없는 것과 같다 */
  on: boolean;
  input: InputState;
  stats: RuntimeStats;
  layout: CityLayout;
}

export function ReelPilot({ on, input, stats, layout }: ReelPilotProps) {
  const seconds = useRef(0);
  const beats = useMemo(() => buildDemoRoute(layout), [layout]);

  useEffect(() => {
    if (!on) return;
    /*
     * 시각을 **초**로 넘긴다. R3F는 `frameloop="never"`에서 넘긴 값을
     * `clock.elapsedTime`(초)에서 빼 delta를 만든다 — ms를 넘기면 첫 프레임에
     * 1000초가 흐른다.
     */
    window[REEL_HANDLE] = {
      step: () => {
        seconds.current += REEL_STEP_SECONDS;
        advance(seconds.current);
        return seconds.current;
      },
      seconds: () => seconds.current,
      total: REEL_TOTAL_SECONDS,
    };
    return () => {
      delete window[REEL_HANDLE];
    };
  }, [on]);

  useFrame(() => {
    if (!on) return;
    /*
     * `seconds`는 이미 이번 프레임 끝으로 옮겨져 있다(`step`이 먼저 더한다).
     * 그래서 이번에 처음 지나친 동작은 [직전, 지금] 사이에 있다.
     */
    const to = seconds.current;
    recordReelFrame(
      input,
      autopilotFrame(beats, to - REEL_STEP_SECONDS, to, { x: stats.x, z: stats.z }, stats.viewYaw),
    );
  });

  return null;
}
