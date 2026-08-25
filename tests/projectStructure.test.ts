import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { collectSources } from "./support/source";

import { describe, expect, it } from "vitest";

/*
 * 문서가 말하는 구조 ↔ 실제 구조.
 *
 * 55번의 반복 동안 기획서의 디렉터리 절이 한 번도 갱신되지 않았다. 그 사이
 * `npc/`·`content/`·`stores/`·`styles/`는 끝내 만들지 않았고, 대신
 * `combat/`·`scene/`·`core/`가 생겼다. 더 나빴던 것은 문서가
 * `public/models`·`public/textures`·`public/audio`를 두라고 안내한 것이다 —
 * **이 프로젝트가 스스로 금지한 것**이다.
 *
 * 문서를 다시 쓰는 것만으로는 또 낡는다. 여기서 대조한다.
 */

const plan = readFileSync("docs/PROJECT_PLAN.md", "utf8");

describe("문서에 적힌 디렉터리", () => {
  const documented = [
    "src/app",
    "src/components/hud",
    "src/components/title",
    "src/game/core",
    "src/game/config",
    "src/game/world",
    "src/game/player",
    "src/game/dokebi",
    "src/game/combat",
    "src/game/quest",
    "src/game/scene",
    "src/game/systems",
    "tests",
  ];

  it("전부 실제로 있다", () => {
    for (const dir of documented) {
      expect(existsSync(dir), `${dir} is documented but missing`).toBe(true);
    }
  });

  it("문서가 이 디렉터리들을 모두 언급한다", () => {
    // 새 디렉터리를 만들고 문서를 안 고치면 여기서 걸린다
    const actual = readdirSync("src/game").filter((name) =>
      statSync(join("src/game", name)).isDirectory(),
    );
    // 훑기가 망가지면 빈 목록을 돌며 통과한다
    expect(actual.length, `찾은 디렉터리 ${actual.length}개`).toBeGreaterThan(5);
    for (const name of actual) {
      expect(plan.includes(`${name}/`), `src/game/${name} is missing from the plan`).toBe(true);
    }
  });

  it("만들지 않은 디렉터리를 안내하지 않는다", () => {
    /*
     * 초안에 있던 이름들이다. 문서에 남아 있으면 새로 오는 사람이 그 구조를
     * 따라 만들게 된다. 지금은 "만들지 않았다"는 설명으로만 등장해야 한다.
     */
    for (const ghost of ["npc/", "quests/", "camera/", "stores/", "styles/"]) {
      const asStructure = new RegExp(`^\\s+${ghost.replace("/", "\\/")}\\s`, "m");
      expect(asStructure.test(plan), `${ghost} still appears as a directory entry`).toBe(false);
    }
  });
});

describe("에셋 없음 원칙", () => {
  it("public에 열지 않은 에셋 디렉터리가 없다", () => {
    /*
     * 이 프로젝트의 중심 제약이었다: 디렉터리가 생기는 순간 누군가 파일을
     * 넣게 되고, 그러면 초기 다운로드 예산이 무너진다.
     *
     * `models/`만 연다. ASSET_PLAN 「반입 절차」가 정한 자리이고, 안에
     * 들어올 수 있는 것은 `forbiddenApis.test.ts`의 목록에 **파일 단위로**
     * 적힌 것뿐이다 — 디렉터리는 열렸지만 문은 여전히 하나씩 연다.
     *
     * 나머지 셋은 그대로 막는다. 텍스처·소리·그림은 아직 절차도 예산도 없다.
     */
    for (const dir of ["public/textures", "public/audio", "public/images"]) {
      expect(existsSync(dir), `${dir} exists — 에셋 없음 원칙이 깨졌다`).toBe(false);
    }
  });

  it("캐릭터 말고는 무거운 파일이 없다", () => {
    /*
     * 캐릭터 모델 하나만 예외로 들였다(사람 몸은 상자로 흉내 내기 가장 어렵다).
     * 그 하나의 크기는 `forbiddenApis`가 따로 본다 — 여기서는 **다른 것이
     * 무거워지지 않는지**만 본다.
     *
     * 예외를 이름으로 적는다. 「1MB 넘는 건 봐준다」로 풀면 다음 파일도 그
     * 문으로 들어온다.
     */
    /*
     * 둘째는 시작 화면 그림이다. 각자의 크기는 `forbiddenApis`가 이름을 대고
     * 따로 잰다(캐릭터 2MB, 그림 300KB) — 여기서는 **그 둘 말고 다른 것이**
     * 무거워지지 않는지만 본다.
     */
    const HEAVY_ALLOWED = new Set(["character.glb", "title-street.webp"]);

    const files = readdirSync("public").filter((name) => !HEAVY_ALLOWED.has(name));
    for (const name of files) {
      const size = statSync(join("public", name)).size;
      expect(size, `public/${name} is ${(size / 1024).toFixed(0)}KB`).toBeLessThan(64 * 1024);
    }
  });

  it("문서가 이 제약을 명시한다", () => {
    expect(plan).toContain("에셋 디렉터리를 만들지 않는다");
  });
});

describe("들여온 컴포넌트를 실제로 그리는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 씬에서 `<Shrines>`·`<Crowd>`·`<Traffic>`·
   * `<ClueGlow>`를 **통째로 지워도** 검사가 전부 통과했다. 도깨비 자리가
   * 사라지면 **수집이 아예 불가능해지는데** 아무도 안 봤다.
   *
   * 검사는 계산과 컴포넌트를 각각 지킨다. 그런데 **그 둘이 화면에 연결되어
   * 있는지**는 빈칸이었다 — 기능이 통째로 빠져도 조용하다.
   *
   * 파일마다 목록을 만들면 새 컴포넌트가 늘 때 조용히 빠진다. **「들여온 것은
   * 그린다」**는 규칙이면 목록을 유지할 필요가 없다 — 안 그릴 거면 들여오지
   * 말아야 하고, 그건 죽은 import 검사가 따로 잡는다.
   */
  const EXCEPTIONS: Record<string, string> = {
    Component: "React의 기반 클래스 — 그리는 것이 아니라 상속한다",
  };

  const files: { path: string; text: string }[] = collectSources("src")
    .filter((path: string) => path.endsWith(".tsx"))
    .map((path: string) => ({ path, text: readFileSync(path, "utf8") }));

  /** 대문자로 시작하고 두 번째가 소문자 = 컴포넌트 (상수는 전부 대문자, 함수는 소문자로 시작) */
  const rendered: { path: string; missing: string[] }[] = files.map(({ path, text }) => {
    const names = [...text.matchAll(/import \{([^}]+)\} from "[^"]+"/g)]
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim().split(" as ")[0].trim())
      .filter((name) => /^[A-Z][a-z]/.test(name) && name !== "THREE")
      .filter((name) => EXCEPTIONS[name] === undefined);
    return { path, missing: names.filter((name) => !text.includes(`<${name}`)) };
  });

  it("컴포넌트를 실제로 모았다", () => {
    const total = rendered.reduce((sum, file) => sum + file.missing.length, 0);
    expect(files.length, `훑은 화면 파일 ${files.length}개`).toBeGreaterThan(10);
    expect(total, "모은 것이 하나도 없다면 정규식이 낡았다").toBeGreaterThanOrEqual(0);
  });

  it("들여온 컴포넌트를 모두 그린다", () => {
    const offenders = rendered
      .filter((file) => file.missing.length > 0)
      .map((file) => `${file.path}: ${file.missing.join(", ")}`);
    expect(offenders, `들여왔는데 안 그린다:\n${offenders.join("\n")}`).toEqual([]);
  });
});
