import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 검사가 실제로 무언가를 확인하는가.
 *
 * 1,000개가 넘는 검사가 있고, 그중 하나가 아무것도 확인하지 않아도 눈에 띄지
 * 않는다. 통과하는 숫자가 커질수록 **거짓 안심**의 값도 커진다.
 *
 * 이 세션에서 실제로 겪었다 — 「소리도 마찬가지다」라는 검사가 주석으로는
 * 불일치를 지적하면서 정작 `expect(hud).toContain("소리")` 하나만 하고 있었다.
 */

/**
 * 주석과 문자열을 걷어낸다.
 *
 * 주석만 지웠더니 이번에는 **문자열 안의 중괄호**가 본문 범위를 끊었다 —
 * `indexOf("\\n}")` 같은 코드가 있는 검사가 「단언이 없다」로 잡혔다.
 * 중괄호 깊이로 본문을 자르는 이상, 코드가 아닌 중괄호는 전부 지워야 한다.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

function testFiles(): string[] {
  return readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => join("tests", name));
}

/*
 * 단언의 **강도**는 자동으로 판정하지 않는다.
 *
 * 처음에는 `toBe`·`toEqual` 같은 것만 「의미 있다」고 보고 `toBeDefined`를
 * 뺐더니 멀쩡한 검사 8개가 걸렸다 — 조회가 성공했는지 보는 자리에서는
 * `toBeDefined`가 정확한 도구다. 무엇이 약한지는 사람이 읽어야 안다.
 *
 * 자동으로 확실히 말할 수 있는 것은 하나뿐이다: **단언이 아예 없으면
 * 그 검사는 절대 실패하지 않는다.**
 */

describe("검사가 실제로 확인하는가", () => {
  it("모든 it에 단언이 하나 이상 있다", () => {
    const empty: string[] = [];

    for (const path of testFiles()) {
      // 주석은 걷어낸다 — 설명에 적은 예시 코드가 검사 대상으로 잡힌다(이번 세션에서 네 번째다)
      const source = stripComments(readFileSync(path, "utf8"));
      // it("...", () => { ... }) 본문을 중괄호 깊이로 잘라 낸다
      for (const match of source.matchAll(/\bit\("([^"]+)",\s*(?:async\s*)?\(\)\s*=>\s*\{/g)) {
        const start = match.index + match[0].length;
        let depth = 1;
        let end = start;
        while (end < source.length && depth > 0) {
          if (source[end] === "{") depth += 1;
          if (source[end] === "}") depth -= 1;
          end += 1;
        }
        const body = source.slice(start, end);
        if (!body.includes("expect(")) empty.push(`${path}: ${match[1]}`);
      }
    }

    expect(empty, `단언이 없어 절대 실패하지 않는 검사:\n${empty.join("\n")}`).toEqual([]);
  });

  it("이 검사가 실제로 본문을 읽고 있다", () => {
    /*
     * 위 검사가 `it(`를 하나도 못 찾으면 빈 목록으로 조용히 통과한다 —
     * 이 세션에서 여러 번 겪은 실패 방식이라 개수를 함께 확인한다.
     */
    const found = testFiles().reduce(
      (total, path) =>
        total + (stripComments(readFileSync(path, "utf8")).match(/\bit\("/g)?.length ?? 0),
      0,
    );
    expect(found, `찾은 it ${found}개`).toBeGreaterThan(500);
  });
});

describe("소스를 훑는 검사가 주석에 걸리지 않는가", () => {
  /*
   * 이 세션에서 **다섯 번** 같은 실수를 했다 — 검사가 「왜 그렇게 고쳤는지
   * 적어 둔 주석」을 실제 코드로 잡아, 좋은 기록을 지우게 만들 뻔했다.
   *
   * 매번 주석 제거를 손으로 붙이는 대신 `readCode`로 모았다. 손으로 붙이는
   * 방식이 돌아오면 여섯 번째가 온다.
   */
  it("주석 제거를 각자 손으로 하지 않는다", () => {
    const offenders: string[] = [];
    for (const path of testFiles()) {
      if (path.endsWith("testQuality.test.ts")) continue;
      const source = stripComments(readFileSync(path, "utf8"));
      if (source.includes("/\\*[\\s\\S]*?\\*/")) offenders.push(path);
    }
    expect(offenders, `주석 제거를 직접 쓴 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("공용 도우미가 실제로 쓰이고 있다", () => {
    // 만들어만 두고 아무도 안 쓰면 다음 사람은 다시 손으로 붙인다
    const users = testFiles().filter((path) => readFileSync(path, "utf8").includes("readCode("));
    expect(users.length, `${users.length}개 파일이 쓴다`).toBeGreaterThan(2);
  });
});
