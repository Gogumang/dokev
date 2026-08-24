import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/*
 * 백로그의 **요약 문장**이 항목 표시와 어긋나지 않는지.
 *
 * 이 문서는 위쪽에 「무엇이 남았다」를 요약해 두고 아래에 항목을 나열한다.
 * 다음 사람은 대개 요약만 읽고 일을 고른다 — 그래서 요약이 낡으면 **이미 끝난
 * 일을 다시 하거나**, 반대로 남은 일을 없다고 믿는다.
 *
 * 실제로 그렇게 됐다. 11번(배경 결)과 12번(물 위)을 끝내고 제목에 ✅를 달았는데
 * 요약은 「남은 것은 11번과 12번뿐이다」인 채로 있었다. 항목 쪽만 고치고 요약은
 * 잊는 것이 기본값이다 — 두 곳이 떨어져 있기 때문이다.
 *
 * 여기서는 **문장의 내용을 검사하지 않는다.** 「남았다」고 지목된 번호가 정말
 * 안 끝났는지만 본다. 문장까지 검사하면 문서를 손볼 때마다 깨져서 아무도
 * 문서를 안 고치게 된다(`docs` 검사가 같은 이유로 숫자와 이름만 본다).
 */

const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");

/** 완료 표시. 제목 줄에 이것이 있으면 끝난 항목이다 */
const DONE_MARK = "✅";

/**
 * 항목 번호 → 끝났는가.
 *
 * 제목은 `### 11. 배경의 결…` 또는 `### A-1. 평상시 색…` 꼴이다. 두 갈래를
 * 한 번에 잡는다 — 접두사가 있든 없든 요약은 같은 번호로 부른다.
 */
function itemsByNumber(): Map<string, boolean> {
  const items = new Map<string, boolean>();

  for (const line of backlog.split("\n")) {
    const heading = /^###\s+((?:[A-Z]-)?\d+)\.\s/.exec(line);
    if (!heading) continue;

    const number = heading[1];
    /*
     * 같은 번호가 여러 절에 나온다(옛 백로그에도 「1.」이 있다). 하나라도 안
     * 끝난 것이 있으면 「남았다」는 주장이 참일 수 있으므로 덜 엄격한 쪽으로
     * 합친다 — 검사가 거짓으로 사람을 붙잡지 않게.
     */
    const done = line.includes(DONE_MARK);
    items.set(number, (items.get(number) ?? true) && done);
  }

  return items;
}

/**
 * 「남은 것은 …」이라고 지목된 번호들.
 *
 * 문장 끝(마침표)까지만 본다. 뒤 문단의 다른 번호를 끌어오면 없는 모순을
 * 만든다.
 */
function claimedRemaining(): string[] {
  const numbers: string[] = [];

  for (const sentence of backlog.match(/남은 것은[^.。\n]*/g) ?? []) {
    for (const hit of sentence.match(/\*\*((?:[A-Z]-)?\d+)번/g) ?? []) {
      numbers.push(hit.replace(/^\*\*/, "").replace(/번$/, ""));
    }
  }

  return numbers;
}

describe("백로그 요약", () => {
  it("남았다고 적은 항목이 실제로 안 끝난 것이다", () => {
    const items = itemsByNumber();

    const contradictions = claimedRemaining().filter((number) => items.get(number) === true);

    expect(
      contradictions,
      `요약은 남았다고 하는데 제목에는 ${DONE_MARK}가 달려 있다: ${contradictions.join(", ")}`,
    ).toEqual([]);
  });

  it("항목 번호를 실제로 읽어 낸다", () => {
    const items = itemsByNumber();

    /*
     * 위 검사는 읽어 낸 것이 없어도 통과한다. 정규식이 문서 형식 변화로
     * 아무것도 못 잡게 되면 **조용히 아무것도 안 지키는 검사**가 된다 —
     * 이 저장소에서 여러 번 겪은 실패다.
     */
    expect(items.size, "제목에서 항목 번호를 하나도 못 찾았다").toBeGreaterThan(10);
    expect(items.get("11"), "11번(배경 결)은 반복 19에서 끝났다").toBe(true);
  });
});
