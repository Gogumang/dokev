import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/game/core/color";

/*
 * 색 대비 — DESIGN_GUIDE 「5.3 색상」의 WCAG AA 요구를 실제 토큰으로 검증한다.
 *
 * 지금까지 "AA를 목표로 한다"고 문서에 적어 두기만 했고 값을 재 본 적이 없다.
 * 대비는 눈으로 어림잡기 가장 어려운 항목이다 — 밝아 보이는 회색이 기준
 * 미달인 경우가 흔하다.
 */

const css = readFileSync("src/app/globals.css", "utf8");

/** :root에서 토큰 값을 읽는다 */
function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`${name} 토큰을 찾지 못했다`);
  return match[1];
}

const BG = token("--color-bg-canvas");
const SURFACE = token("--color-bg-surface");
const PRIMARY = token("--color-text-primary");
const SECONDARY = token("--color-text-secondary");
const ACTION = token("--color-action-primary");
const INVERSE = token("--color-text-inverse");

describe("본문 글자", () => {
  it("기본 글자가 배경에서 AA를 넘는다", () => {
    const ratio = contrastRatio(PRIMARY, BG);
    expect(ratio, `${PRIMARY} on ${BG}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("보조 글자도 AA를 넘는다", () => {
    /*
     * 보조 글자는 일부러 흐리게 만든다. 그래도 읽혀야 한다 — 흐림은 위계를
     * 위한 것이지 읽지 말라는 뜻이 아니다.
     */
    const ratio = contrastRatio(SECONDARY, BG);
    expect(ratio, `${SECONDARY} on ${BG}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("패널 위에서도 유지된다", () => {
    // HUD 패널은 캔버스보다 밝다. 거기서 대비가 무너지면 정작 읽을 곳이 안 읽힌다
    expect(contrastRatio(PRIMARY, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(SECONDARY, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("강조색", () => {
  it("배경에서 큰 글자 기준(3:1)을 넘는다", () => {
    // 강조색은 짧은 라벨과 숫자에 쓴다
    const ratio = contrastRatio(ACTION, BG);
    expect(ratio, `${ACTION} on ${BG}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it("강조색 버튼의 글자가 읽힌다", () => {
    /*
     * 선택된 버튼은 배경이 강조색이고 글자가 반전색이다. 이 조합이 가장
     * 놓치기 쉽다 — 밝은 배경에 밝은 글자를 얹기 쉬운 자리다.
     */
    const ratio = contrastRatio(INVERSE, ACTION);
    expect(ratio, `${INVERSE} on ${ACTION}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("색만으로 구분하지 않는가", () => {
  it("강조색과 기본 글자가 서로 구분된다", () => {
    // 둘이 비슷하면 "강조"가 강조가 아니게 된다
    expect(contrastRatio(ACTION, PRIMARY), `${ACTION} vs ${PRIMARY}`).toBeGreaterThan(1.2);
  });
});

describe("contrastRatio", () => {
  it("검정과 흰색이 21:1이다", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("같은 색은 1:1이다", () => {
    expect(contrastRatio("#3a2b1c", "#3a2b1c")).toBeCloseTo(1, 6);
  });

  it("순서가 결과를 바꾸지 않는다", () => {
    expect(contrastRatio("#123456", "#eeddcc")).toBeCloseTo(contrastRatio("#eeddcc", "#123456"), 9);
  });

  it("파싱에 실패하면 1로 본다", () => {
    // 모르면 실패로 보는 쪽이 안전하다
    expect(contrastRatio("rgb(0,0,0)", "#ffffff")).toBe(1);
  });
});

describe("월드 위에 뜨는 패널", () => {
  /*
   * HUD 패널은 배경색 위가 아니라 **3D 화면 위**에 뜬다. 반투명이므로
   * 뒤에 오는 것이 그대로 섞인다 — 지도 구역 색과 같은 문제다.
   *
   * 하늘 위에서만 재고 있었다면 통과했을 것이다(최저 4.89). 실제로 뒤에
   * 오는 것은 **간판**이고, 흰 간판(#f6f3e9) 앞에서 도감을 열면 보조
   * 글자가 3.93까지 떨어졌다. 화면에서 읽기 어려운 것을 보고 알았다.
   */
  const overlay = /--color-bg-overlay:\s*([^;]+);/.exec(css)?.[1].trim() ?? "";

  /** 뒤에 올 수 있는 가장 밝은 것들 — 흰 간판·미색 벽·노란 불빛 */
  const BEHIND = ["#ffffff", "#f6f3e9", "#f4f1e8", "#ffd24a", "#f0a06a"];

  /** 밝은 배경 위에 반투명 패널을 얹은 결과 */
  function panelOver(behind: string): string {
    const parts = overlay
      .replace(/rgba?\(|\)|\//g, " ")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const alpha = parts[3] ?? 1;
    const channel = (from: number, to: number) =>
      Math.round(from * (1 - alpha) + to * alpha)
        .toString(16)
        .padStart(2, "0");
    return `#${channel(Number.parseInt(behind.slice(1, 3), 16), parts[0])}${channel(
      Number.parseInt(behind.slice(3, 5), 16),
      parts[1],
    )}${channel(Number.parseInt(behind.slice(5, 7), 16), parts[2])}`;
  }

  it("패널 바탕을 실제로 읽었다", () => {
    expect(overlay, "패널 바탕 토큰을 못 찾았다").toMatch(/^rgba?\(/);
  });

  it("무엇이 뒤에 와도 글자가 읽힌다", () => {
    for (const behind of BEHIND) {
      const panel = panelOver(behind);
      for (const [name, color] of [
        ["본문", PRIMARY],
        ["보조", SECONDARY],
      ] as const) {
        const ratio = contrastRatio(color, panel);
        expect(
          ratio,
          `${behind} 앞 패널(${panel})에서 ${name} 대비 ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
