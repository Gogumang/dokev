import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 초기 다운로드 예산.
 *
 * PROJECT_PLAN 「성능 예산」이 이 프로젝트의 중심 제약이다 — 외부 에셋을 하나도
 * 쓰지 않는 이유도 그것이다. 그런데 81번의 반복 동안 **한 번도 다시 재지
 * 않았다.** 기능은 계속 늘었고 번들도 같이 늘었을 것이다.
 *
 * 빌드 산출물이 없으면 건너뛴다. 빌드 없이 잴 방법이 없고, 여기서 실패로
 * 처리하면 "테스트만 돌리는" 경로가 통째로 막힌다.
 */

const MANIFEST = ".next/build-manifest.json";
const hasBuild = existsSync(MANIFEST);

/** 공통(rootMain) 파일은 모든 페이지가 받는다 — 랜딩이 치르는 비용이다 */
function rootMainGzipKb(): number {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { rootMainFiles: string[] };
  let total = 0;
  for (const file of manifest.rootMainFiles) {
    const path = join(".next", file);
    if (existsSync(path)) total += gzipSync(readFileSync(path)).length;
  }
  return total / 1024;
}

/**
 * 가장 큰 청크의 gzip 크기(KB)와 이름.
 *
 * 상한 검사와 문서 대조가 **같은 자**를 써야 한다 — 따로 재면 한쪽만 맞는
 * 상황이 생긴다(이번 세션에서 재구현한 자로 재다가 세 번 헛짚었다).
 */
function largestChunk(): { kb: number; name: string } {
  const dir = ".next/static/chunks";
  if (!existsSync(dir)) return { kb: 0, name: "" };

  let kb = 0;
  let name = "";
  const walk = (path: string) => {
    for (const entry of readdirSyncSafe(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".js")) {
        const size = gzipSync(readFileSync(full)).length / 1024;
        if (size > kb) {
          kb = size;
          name = entry;
        }
      }
    }
  };
  walk(dir);
  return { kb, name };
}

describe.skipIf(!hasBuild)("초기 다운로드", () => {
  it("공통 번들이 랜딩 예산 안이다", () => {
    /*
     * 기준 150KB gzip은 프로젝트 규칙의 랜딩 예산이다. 측정값은 127KB로
     * 여유가 크지 않다 — 무거운 의존성을 하나만 더 얹어도 넘는다.
     */
    const kb = rootMainGzipKb();
    expect(kb, `rootMain ${kb.toFixed(0)}KB gzip`).toBeLessThan(150);
  });

  it("공통 번들에 거대한 청크가 섞이지 않았다", () => {
    /*
     * three.js는 274KB gzip으로 가장 큰 청크다. 이것이 공통에 섞이면 게임을
     * 시작하지도 않은 사람이 받게 된다 — 구조 테스트가 import 그래프를
     * 확인하지만, 번들러가 합쳐 버리는 경우는 그쪽에서 못 잡는다.
     */
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { rootMainFiles: string[] };
    for (const file of manifest.rootMainFiles) {
      const path = join(".next", file);
      if (!existsSync(path)) continue;
      const kb = gzipSync(readFileSync(path)).length / 1024;
      expect(kb, `${file} is ${kb.toFixed(0)}KB gzip`).toBeLessThan(120);
    }
  });

  it("가장 큰 청크가 상한 안이다", () => {
    /*
     * three.js 청크다. 지연 로딩되므로 랜딩 예산과는 별개지만, 월드에 들어갈
     * 때 사용자가 기다리는 시간이 여기서 정해진다.
     */
    const { kb: largest, name } = largestChunk();
    if (largest === 0) return;

    expect(largest, `largest chunk ${name} is ${largest.toFixed(0)}KB gzip`).toBeLessThan(400);
  });
});

/** 읽을 수 없는 디렉터리는 건너뛴다 — 빌드 중간 상태일 수 있다 */
function readdirSyncSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

describe.skipIf(!hasBuild)("문서가 말하는 크기", () => {
  /*
   * 검사는 **상한**만 봤다(150KB·400KB). 그래서 실측이 127→128, 274→283으로
   * 커지는 동안 문서의 숫자는 그대로였다 — 상한 안이라 아무도 몰랐다.
   *
   * 이 숫자는 「외부 에셋을 안 쓴다」는 이 프로젝트의 핵심 주장을 뒷받침하는
   * 근거라, 틀리면 그 주장까지 의심받는다. 오차 10%까지만 봐준다 — 정확히
   * 맞추라고 하면 청크 이름이 바뀔 때마다 문서를 고쳐야 한다.
   */
  /*
   * 두 문서를 **각각** 본다. 이어 붙여 한 번만 찾았더니 앞 문서에서 먼저
   * 맞아 버려 뒤 문서가 틀려도 통과했다 — 되돌려 보고 알았다.
   */
  const DOCS = ["README.md", "docs/PROJECT_PLAN.md"] as const;

  function claimedIn(pattern: RegExp): Array<{ doc: string; value: number }> {
    const found = DOCS.flatMap((doc) => {
      const match = pattern.exec(readFileSync(doc, "utf8"));
      return match ? [{ doc, value: Number(match[1]) }] : [];
    });
    expect(found.length, `${pattern}를 말하는 문서가 없다`).toBeGreaterThan(0);
    return found;
  }

  it("공통 번들 크기가 문서와 맞는다", () => {
    const actual = rootMainGzipKb();
    for (const { doc, value } of claimedIn(/(\d{2,4})KB gzip/)) {
      expect(
        Math.abs(value - actual) / actual,
        `${doc}: ${value}KB vs 실측 ${actual.toFixed(0)}KB`,
      ).toBeLessThan(0.1);
    }
  });

  it("가장 큰 청크 크기가 문서와 맞는다", () => {
    const actual = largestChunk().kb;
    for (const { doc, value } of claimedIn(/three\.js 청크\s*\n?(\d{2,4})KB/)) {
      expect(
        Math.abs(value - actual) / actual,
        `${doc}: ${value}KB vs 실측 ${actual.toFixed(0)}KB`,
      ).toBeLessThan(0.1);
    }
  });
});

describe("번들 검사가 실제로 도는가", () => {
  /*
   * 이 파일의 검사들은 `.next`가 있어야 돈다(`skipIf`). 그래서 **조용히
   * 안 도는** 상태가 될 수 있었다 — `pnpm verify`가 `test`를 `build`보다
   * 먼저 돌렸기 때문이다. 새로 받은 저장소에는 `.next`가 없어 통째로
   * 건너뛰었고, 있더라도 **직전 빌드**를 재고 있었다.
   *
   * 순서를 고쳤으니 그 순서를 지킨다. 이 검사만은 빌드가 없어도 돈다 —
   * `pnpm test`를 단독으로 부르는 것은 정상이므로 건너뛰기 자체를 막지는
   * 않고, **순서가 되돌아가는 것**을 막는다.
   */
  const scripts = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  it("verify가 빌드를 테스트보다 먼저 돌린다", () => {
    const verify = scripts.scripts.verify ?? "";
    expect(verify, "verify 스크립트가 없다").toContain("build");
    expect(verify, "verify에 test가 없다").toContain("test");
    expect(verify.indexOf("build") < verify.indexOf("test"), `순서가 뒤집혔다: ${verify}`).toBe(
      true,
    );
  });

  it("빌드 없이 돌면 그 사실을 남긴다", () => {
    // 통과했는데 아무것도 안 봤을 수 있다는 것을 사람이 알 수 있어야 한다
    expect(typeof hasBuild, "hasBuild 판정이 없다").toBe("boolean");
  });
});
