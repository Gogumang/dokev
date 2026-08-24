import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 파일 크기.
 *
 * 코딩 규칙: 200~400줄이 보통, **800줄을 넘기지 않는다.** 넘으면 책임 단위로
 * 쪼갠다.
 *
 * 이 규칙을 세 번 어겼다 — WorldHud를 두 번, GameScene을 한 번. 매번 "조금만
 * 더"가 쌓여서 넘었고, 넘은 줄도 몰랐다. 사람이 세지 않게 여기서 센다.
 */

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const LIMIT = 800;

describe("파일 크기", () => {
  it("소스 파일이 상한을 넘지 않는다", () => {
    const oversized = collect("src")
      .map((path) => ({ path, lines: readFileSync(path, "utf8").split("\n").length }))
      .filter((file) => file.lines > LIMIT)
      .map((file) => `${file.path} (${file.lines})`);

    expect(oversized, `over ${LIMIT} lines:\n${oversized.join("\n")}`).toEqual([]);
  });

  it("테스트 파일도 지나치게 길지 않다", () => {
    /*
     * 테스트는 사례 목록이라 소스보다 길어도 된다. 다만 한 파일이 1,200줄을
     * 넘으면 무엇을 검증하는 파일인지 알 수 없어진다 — 주제가 섞였다는 뜻이다.
     */
    const oversized = collect("tests")
      .map((path) => ({ path, lines: readFileSync(path, "utf8").split("\n").length }))
      .filter((file) => file.lines > 1200)
      .map((file) => `${file.path} (${file.lines})`);

    expect(oversized, `over 1200 lines:\n${oversized.join("\n")}`).toEqual([]);
  });
});
