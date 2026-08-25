import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 문서 인용이 살아 있는지.
 *
 * 주석이 기획 문서를 인용할 때 **행 번호**를 쓰면 문서를 한 줄만 고쳐도
 * 전부 어긋난다. 실제로 그렇게 됐다 — PROJECT_PLAN에 18절을 덧붙이자
 * 그 뒤를 가리키던 인용 여덟 개가 전혀 다른 줄을 가리켰다.
 * ("비주얼 키워드"라던 85행은 빈 줄이 됐고, "구역 단위 로딩"이라던 257행은
 * 데이터베이스 표를 가리켰다.)
 *
 * 그래서 절 이름으로 인용한다. 절 이름은 내용이 바뀌면 같이 바뀌므로
 * 어긋나면 여기서 잡힌다.
 */

const DOCS = [
  "docs/PROJECT_PLAN.md",
  "docs/DESIGN_GUIDE.md",
  "docs/TRAILER_FEATURE_ANALYSIS.md",
] as const;

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const sources = collect("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));

/**
 * 제목에서 앞의 번호를 뗀다.
 *
 * "10. 성능 예산"과 "성능 예산"을 같게 본다 — 절 번호는 절이 하나 끼어들면
 * 바뀌고, 그건 인용이 가리키는 내용이 달라진 것이 아니다. 행 번호를 버린
 * 것과 같은 이유로 번호도 무시한다.
 */
function normalizeHeading(title: string): string {
  return title.replace(/^\d+(\.\d+)*\.?\s*/, "").trim();
}

/** 문서에 실제로 있는 제목들 */
function headings(doc: string): Set<string> {
  return new Set(
    readFileSync(doc, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("## ") || line.startsWith("### "))
      .map((line) => normalizeHeading(line.replace(/^#+\s*/, ""))),
  );
}

describe("문서 인용", () => {
  it("행 번호로 인용하지 않는다", () => {
    const offenders: string[] = [];
    const pattern =
      /(PROJECT_PLAN|DESIGN_GUIDE|TRAILER_FEATURE_ANALYSIS)[^\n]{0,16}?\d+\s*~?\s*\d*행/g;

    for (const { path, text } of sources) {
      for (const match of text.match(pattern) ?? []) offenders.push(`${path}: ${match}`);
    }
    expect(offenders, `line-number citations:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("인용한 절이 문서에 실제로 있다", () => {
    /*
     * 절 이름을 「」로 감싸 인용한다. 절 제목이 바뀌거나 사라지면 여기서
     * 걸린다 — 그때 주석을 고칠지 문서를 되돌릴지 판단하면 된다.
     */
    const known = new Map(DOCS.map((doc) => [doc.replace(".md", ""), headings(doc)]));
    const offenders: string[] = [];
    /*
     * 정규식이 깨지면 인용을 하나도 못 찾고 **0건으로 조용히 통과한다.**
     * 이번 세션에 같은 실패를 다섯 번 겪었으므로 찾은 개수를 함께 센다.
     */
    let checked = 0;
    const pattern = /(PROJECT_PLAN|DESIGN_GUIDE|TRAILER_FEATURE_ANALYSIS)\s*「([^」]+)」/g;

    for (const { path, text } of sources) {
      for (const match of text.matchAll(pattern)) {
        checked += 1;
        const titles = known.get(match[1]);
        // 「A · B」처럼 두 절을 묶어 인용한 경우 앞쪽만 확인한다
        const cited = normalizeHeading(match[2].split("·")[0]);
        if (titles && !titles.has(cited)) offenders.push(`${path}: ${match[0]}`);
      }
    }
    expect(offenders, `unknown sections:\n${offenders.join("\n")}`).toEqual([]);
    expect(checked, `인용을 ${checked}건 찾았다 — 0이면 정규식이 깨진 것이다`).toBeGreaterThan(10);
  });

  it("인용이 실제로 남아 있다", () => {
    // 전부 지워 버리면 위 두 검사는 통과한다. 근거를 남기라는 규칙이 목적이다.
    const citations = sources.filter(({ text }) => /「[^」]+」/.test(text));
    expect(citations.length, "문서 인용이 하나도 없다").toBeGreaterThan(8);
  });
});
