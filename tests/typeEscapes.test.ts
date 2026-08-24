import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectSources } from "./support/source";

/*
 * 타입 검사를 우회한 자리.
 *
 * `as`는 "컴파일러야, 내가 안다"는 선언이다. 대부분은 정당하다(three.js의
 * material·attribute처럼 런타임 타입을 라이브러리가 좁혀 주지 않는 경우).
 * 문제는 **없는 필드를 지어내는 캐스트**다.
 *
 * 실제로 보스가 `{x, z} as EnemyState`로 열두 필드짜리 타입을 두 필드로
 * 단언하고 있었다. 판정 함수가 다른 필드를 읽기 시작하는 순간 조용히
 * undefined를 읽는다 — 타입은 통과하고 게임만 이상해진다.
 */

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** 주석을 걷어낸다 — 왜 고쳤는지 적어 둔 문장까지 걸리면 기록을 못 남긴다 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sources = collect("src").map((path) => ({
  path,
  text: codeOnly(readFileSync(path, "utf8")),
}));

describe("타입 우회", () => {
  it("any를 쓰지 않는다", () => {
    const offenders = sources
      .filter(({ text }) => /[:<(]\s*any\b/.test(text))
      .map(({ path }) => path);
    expect(offenders, `uses any: ${offenders.join(", ")}`).toEqual([]);
  });

  it("컴파일러를 끄지 않는다", () => {
    const offenders = sources
      .filter(({ text }) => text.includes("@ts-ignore") || text.includes("@ts-expect-error"))
      .map(({ path }) => path);
    expect(offenders, `suppresses the compiler: ${offenders.join(", ")}`).toEqual([]);
  });

  it("이중 캐스트로 타입을 갈아끼우지 않는다", () => {
    /*
     * `as unknown as T`는 "무슨 타입이든 상관없다"는 뜻이다. 테스트에서
     * 최소 스텁을 만들 때는 정당하지만, 소스에 있으면 거의 실수다.
     */
    const offenders = sources
      .filter(({ text }) => text.includes("as unknown as"))
      .map(({ path }) => path);
    expect(offenders, `double casts: ${offenders.join(", ")}`).toEqual([]);
  });

  it("객체 리터럴을 큰 타입으로 단언하지 않는다", () => {
    /*
     * `{ a, b } as SomeState` 형태를 잡는다. 필드가 빠진 채로 통과하므로
     * 나중에 그 필드를 읽는 코드가 생기면 조용히 깨진다.
     */
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/\{[^{}\n]*\}\s+as\s+[A-Z]\w+/g)) {
        offenders.push(`${path}: ${match[0].slice(0, 60)}`);
      }
    }
    expect(offenders, `object literal casts:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("검사를 끄는 주석", () => {
  /*
   * 이 저장소에는 `react-hooks/immutability`를 파일째 끈 곳이 여덟이다.
   * 그건 **구조적 선택**이다 — 절대 규칙 4가 「매 프레임 setState 금지,
   * 공유 가변 객체를 `useFrame`에서 직접 읽고 쓴다」로 정해 두었고, 그
   * 규칙과 이 린트 규칙은 정면으로 부딪힌다.
   *
   * 문제는 **그 옆에 다른 억제가 조용히 끼어드는 것**이다. 실제로 이번에
   * `exhaustive-deps`를 하나 끄게 됐는데, 코드를 단순하게 고치니 필요가
   * 없어졌다 — 억제가 늘어난다는 것은 대개 설계가 어긋났다는 신호다.
   *
   * 끌 수 있는 규칙 이름을 좁혀 둔다. 새 이름을 더하는 것은 **의도적인
   * 행동**이어야 한다.
   */
  const ALLOWED = new Set(["react-hooks/immutability"]);

  const suppressions = collectSources("src").flatMap((path) => {
    /*
     * **원본 그대로 읽는다.** `readCode`는 주석을 걷어내는데, 억제 주석이
     * 바로 그 주석이라 0곳이 나온다 — 위 「실제로 훑었다」가 바로 잡았다.
     * 이 파일이 다루는 대상은 코드가 아니라 주석이다.
     */
    const source = readFileSync(path, "utf8");
    return [...source.matchAll(/eslint-disable(?:-next-line)?\s+([\w/-]+)/g)].map((match) => ({
      path,
      rule: match[1],
    }));
  });

  it("억제를 실제로 훑었다", () => {
    // 정규식이 낡으면 빈 목록이 되고 아래 검사가 아무것도 안 본다
    expect(suppressions.length, `찾은 억제 ${suppressions.length}곳`).toBeGreaterThan(3);
  });

  it("억제가 조용히 늘지 않는다", () => {
    /*
     * 이 저장소의 규칙: **억제가 늘어난다는 것은 대개 설계가 어긋났다는 신호다.**
     * 그런데 위 검사는 **새로운 종류**만 잡고 같은 종류가 몇 개로 불어나든
     * 통과한다 — 규칙을 적어 두고 강제하지 않고 있었다.
     *
     * 지금 여덟 곳은 전부 **프레임마다 공유 객체를 고쳐 쓰는 렌더러**다
     * (적·보스·군중·차량·동료·플레이어·포토 조작·터치 조작). 이 프로젝트가
     * 매 프레임 `setState`를 하지 않기로 한 결과이고, 의도된 것이다.
     *
     * 아홉 번째가 생기면 여기서 멈춘다. **둘 중 하나를 하라** — 그것도
     * 프레임마다 고쳐 쓰는 렌더러가 맞으면 한도를 올리고 **왜인지 적는다**,
     * 아니면 억제하지 말고 설계를 고친다.
     */
    /*
     * 9로 올린다(2026-08-24). 아홉 번째는 `world/SpiritGate.tsx`다 — 빛으로
     * 여는 문이 매 프레임 **충돌 상자와 안내 객체를 제자리에서** 고친다.
     * 새 객체를 만들면 그 배열을 함께 보는 플레이어 충돌이 낡은 상자를 보게
     * 되고, setState로 옮기면 문 앞을 지날 때마다 초당 60회 리렌더가 난다.
     * 앞의 여덟과 같은 종류(프레임 루프에서 공유 객체를 고치는 렌더러)다.
     */
    /*
     * 한때 10이었다(부두). 상호작용 신호를 `consumeInteract` 한 곳으로 모으자
     * 그 파일이 공유 객체를 직접 고치지 않게 되어 억제가 필요 없어졌다 —
     * **한도를 올리기 전에 설계를 고칠 수 있는지 먼저 본다**는 이 검사의 요지가
     * 실제로 그렇게 쓰였다.
     */
    const LIMIT = 9;
    const files = [...new Set(suppressions.map((item) => item.path))];
    expect(
      files.length,
      `억제한 파일 ${files.length}곳 (한도 ${LIMIT}):\n${files.join("\n")}`,
    ).toBeLessThanOrEqual(LIMIT);
  });

  it("허용한 규칙만 끈다", () => {
    const unexpected = suppressions
      .filter((item) => !ALLOWED.has(item.rule))
      .map((item) => `${item.path}: ${item.rule}`);
    expect(unexpected, `허용 목록에 없는 억제:\n${unexpected.join("\n")}`).toEqual([]);
  });
});
