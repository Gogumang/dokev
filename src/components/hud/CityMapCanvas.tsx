"use client";

/**
 * 도시 지도의 캔버스.
 *
 * 다시 칠하는 일만 한다 — 대화창의 틀·문장·범례와 섞여 있으면 「무엇이 언제
 * 다시 그려지는가」가 마크업 사이에 묻힌다.
 *
 * rAF가 아니라 타이머다. 지도는 초당 여덟 번이면 충분하고, 렌더 루프와 같은
 * 프레임에 끼어들 이유가 없다.
 */

import { useEffect, useRef } from "react";

import { MAP_SIZE, paintCityMap, type CityMapScene } from "@/game/systems/cityMapPaint";

/** 다시 그리는 주기(ms) */
const REDRAW_MS = 120;

export function CityMapCanvas({ scene }: { scene: CityMapScene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(scene);

  useEffect(() => {
    latest.current = scene;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 고해상도 화면에서 선이 뭉개지지 않게 배율을 곱해 둔다.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => paintCityMap(ctx, latest.current);
    draw();
    const id = window.setInterval(draw, REDRAW_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="도시 전체 지도. 구역 색과 목표 위치를 표시한다"
      className="mt-[var(--space-3)] block"
      style={{ width: "min(70vw, 60vh, 420px)", height: "min(70vw, 60vh, 420px)" }}
    />
  );
}
