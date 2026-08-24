import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

/*
 * 공유와 첫인상.
 *
 * 링크를 받은 사람이 보는 것은 게임이 아니라 **카드 한 장**이다. 제목도
 * 설명도 없으면 열지 않는다 — 이 게임은 사진과 클립을 공유하라고 만들었는데
 * 정작 게임 링크가 그랬다.
 */

/*
 * **주석을 걷어내고 읽는다.**
 *
 * 화면 문구를 소스에서 찾는 검사라, 그냥 읽으면 문구를 지우고 「예전에 이런
 * 안내가 있었다」는 주석만 남겨도 통과한다 — 이 프로젝트가 접근성 검사에서
 * 이미 겪은 함정이다(「예전에 role=dialog를 붙여 놓고」가 대화창으로 잡혔다).
 */
const layout = readCode("src/app/layout.tsx");
const shell = readCode("src/app/play/PlayShell.tsx");

describe("공유 카드", () => {
  it("Open Graph와 트위터 카드가 있다", () => {
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
  });

  it("제목과 설명이 비어 있지 않다", () => {
    const title = /const TITLE = "([^"]+)"/.exec(layout);
    const description = /const DESCRIPTION =\s*\n?\s*"([^"]+)"/.exec(layout);

    expect(title?.[1], "제목이 없다").toBeTruthy();
    expect(description?.[1]?.length ?? 0, "설명이 너무 짧다").toBeGreaterThan(20);
  });

  it("제목과 설명을 한 곳에서만 정의한다", () => {
    /*
     * 같은 문자열을 metadata·openGraph·twitter 세 곳에 각자 적으면 하나만
     * 고쳤을 때 카드마다 다른 제목이 뜬다 — 도로 좌표와 같은 종류의 함정이다.
     */
    const titleLiterals = layout.match(/"DokeV"/g) ?? [];
    expect(titleLiterals.length, `제목 문자열이 ${titleLiterals.length}번 적혀 있다`).toBe(1);
  });

  it("언어와 지역을 밝힌다", () => {
    // 한국어 설명인데 locale이 없으면 카드가 엉뚱한 언어로 취급된다
    expect(layout).toContain("ko_KR");
    expect(layout).toContain('lang="ko"');
  });
});

describe("첫 화면", () => {
  it("월드를 불러오는 동안 안내가 있다", () => {
    /*
     * three.js 청크는 무겁다. 그동안 빈 화면이면 사용자는 고장으로 본다.
     */
    expect(shell).toContain("loading:");
    expect(shell).toContain("불러오는 중");
  });

  it("불러오는 중임을 낭독기에도 알린다", () => {
    expect(shell).toContain('role="status"');
    expect(shell).toContain("aria-live");
  });

  it("확대를 완전히 막지 않는다", () => {
    /*
     * 두 손가락 확대가 카메라 조작과 충돌하지만, 확대를 0으로 막는 것은
     * 접근성 위반이다. 최대 배율을 남겨 둬야 한다.
     */
    expect(layout).toContain("maximumScale");
    const scale = /maximumScale:\s*(\d+)/.exec(layout);
    expect(Number(scale?.[1] ?? 0), "최대 배율이 너무 낮다").toBeGreaterThanOrEqual(2);
  });
});
