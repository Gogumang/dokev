import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 선언한 의존성이 실제로 쓰이는가.
 *
 * 안 쓰는 패키지는 번들에 들어가지 않으니 성능에는 영향이 없다. 대신 두 가지가
 * 나빠진다: 설치가 무거워지고, **의존성 목록이 구조에 대해 거짓말을 한다.**
 *
 * 실제로 `zustand`가 들어 있었다. 기획서가 "클라이언트 상태 — Zustand"라고
 * 적었지만 구현은 공유 가변 객체를 택했고(매 프레임 setState 금지), 패키지만
 * 남아 있었다. 읽는 사람은 전역 스토어가 있는 줄 안다.
 */

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * import 없이도 필요한 패키지들.
 *
 * 타입 정의는 컴파일러가, react-dom은 Next가, 나머지는 설정 파일이 쓴다 —
 * 소스에 이름이 등장하지 않는 것이 정상이다.
 */
const IMPLICIT = new Set([
  "react-dom",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@types/three",
]);

function collect(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) files.push(path);
  }
  return files;
}

const blob = [
  ...collect("src", [".ts", ".tsx", ".css"]),
  ...collect("tests", [".ts"]),
  "next.config.ts",
  "eslint.config.mjs",
  "vitest.config.ts",
  "postcss.config.mjs",
]
  .filter((path) => {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  })
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

describe("의존성", () => {
  it("선언한 패키지를 모두 쓴다", () => {
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    const unused = Object.keys(declared).filter(
      (name) => !IMPLICIT.has(name) && !blob.includes(name),
    );

    expect(unused, `declared but never used: ${unused.join(", ")}`).toEqual([]);
  });

  it("상태 관리 라이브러리를 두지 않는다", () => {
    /*
     * 이 프로젝트는 전역 스토어를 쓰지 않는다. 매 프레임 setState를 하지
     * 않기 위해 공유 가변 객체를 렌더 루프가 직접 읽는 방식을 택했다.
     * 스토어 라이브러리가 들어오면 그 판단이 흔들린다 — 들어올 때는
     * 의식적으로 들어와야 한다.
     */
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const store of ["zustand", "jotai", "redux", "@reduxjs/toolkit", "valtio"]) {
      expect(declared, `${store}가 다시 들어왔다`).not.toContain(store);
    }
  });

  it("런타임 의존성이 적게 유지된다", () => {
    /*
     * 다섯 개(next, react, react-dom, three, @react-three/fiber)로 충분하다.
     * 늘어난다면 그만한 이유가 있어야 한다 — 초기 다운로드 예산이 이
     * 프로젝트의 중심 제약이다.
     */
    const runtime = Object.keys(pkg.dependencies ?? {});
    expect(runtime.length, `runtime deps: ${runtime.join(", ")}`).toBeLessThanOrEqual(6);
  });
});
