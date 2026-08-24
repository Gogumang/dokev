import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SCENARIOS } from "@/game/systems/devScenario";

/*
 * README ↔ 실제 명령.
 *
 * 프로젝트 규칙: "문서에 적힌 명령이 실제로 실행되는지까지 확인한다."
 * README가 `create-next-app` 템플릿 그대로 82번의 반복 동안 방치돼 있었고,
 * 쓰지도 않는 next/font를 쓴다고 적혀 있었다.
 */

const readme = readFileSync("README.md", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("README의 명령", () => {
  it("적혀 있는 pnpm 명령이 모두 실제로 있다", () => {
    // 없는 명령을 안내하면 첫 시도부터 막힌다
    const mentioned = [...readme.matchAll(/`pnpm ([a-z:]+)`/g)].map((match) => match[1]);
    expect(mentioned.length, "명령 안내가 하나도 없다").toBeGreaterThan(3);

    for (const name of mentioned) {
      if (name === "install") continue;
      expect(pkg.scripts[name], `pnpm ${name} 스크립트가 없다`).toBeDefined();
    }
  });

  it("검증 명령이 네 가지를 모두 돈다", () => {
    /*
     * 이 프로젝트는 매 변경마다 타입·린트·테스트·빌드를 전부 통과시킨다.
     * 한 명령으로 묶어 두지 않으면 새로 오는 사람은 그 규칙을 모른다.
     */
    const verify = pkg.scripts.verify ?? "";
    for (const step of ["typecheck", "lint", "test", "build"]) {
      expect(verify, `verify가 ${step}을 빠뜨렸다: ${verify}`).toContain(step);
    }
  });

  it("안내하는 포트가 실제 dev 스크립트와 같다", () => {
    // 문서의 주소로 들어갔는데 아무것도 없으면 고장으로 본다
    const documented = /localhost:(\d+)/.exec(readme)?.[1];
    const configured = /--port (\d+)/.exec(pkg.scripts.dev ?? "")?.[1];

    expect(documented, "README에 주소가 없다").toBeTruthy();
    expect(configured, `dev 스크립트: ${pkg.scripts.dev}`).toBe(documented);
  });
});

describe("README의 내용", () => {
  it("템플릿 문구가 남아 있지 않다", () => {
    // create-next-app 기본 문구는 이 프로젝트에 대해 아무것도 알려 주지 않는다
    expect(readme.includes("bootstrapped with"), "템플릿 문구가 남아 있다").toBe(false);
    expect(readme.includes("next/font"), "쓰지 않는 기능을 쓴다고 적혀 있다").toBe(false);
  });

  it("이 프로젝트의 제약을 밝힌다", () => {
    // 외부 에셋 0개는 모든 판단의 근거다. 모르고 오면 GLB를 추가하려 든다.
    expect(readme).toContain("외부 에셋");
  });

  it("아직 플레이해 본 적이 없다는 사실을 숨기지 않는다", () => {
    /*
     * 이게 이 저장소에서 가장 중요한 한 줄이다. 831개 테스트가 통과한다는
     * 사실이 "잘 돌아간다"로 읽히면 안 된다.
     */
    expect(readme).toContain("플레이해 본 적이 없다");
  });

  it("문서 링크가 실제 파일을 가리킨다", () => {
    const links = [...readme.matchAll(/\]\(\.\/((?:docs\/)?[A-Z_]+\.md)\)/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThan(2);
    for (const file of links) {
      expect(() => readFileSync(file, "utf8"), `${file}가 없다`).not.toThrow();
    }
  });
});

describe("확인 지점 목록이 정본과 맞는가", () => {
  /*
   * README에 `?see=air`가 빠져 있었고 한낮 설명은 바꾸기 전 문구였다.
   * 확인하러 오는 사람이 없는 지점을 못 찾거나, 확인할 수 없는 것을
   * 확인하러 간다 — 랜딩의 거짓 저장 안내와 같은 종류다.
   */
  const readme = readFileSync("README.md", "utf8");

  it("모든 확인 지점이 이름과 함께 적혀 있다", () => {
    for (const [id, scenario] of Object.entries(SCENARIOS)) {
      expect(readme, `${id} 지점이 README에 없다`).toContain(`/play?see=${id}`);
      expect(readme, `${id}의 설명이 정본과 다르다`).toContain(scenario.label);
    }
  });

  it("없는 지점을 안내하지 않는다", () => {
    const listed = [...readme.matchAll(/\/play\?see=(\w+)/g)].map((m) => m[1]);
    // 정규식이 안 맞으면 빈 목록을 돌며 「없는 지점을 안내하지 않는다」가 통과한다
    expect(listed.length, `README가 안내하는 지점 ${listed.length}개`).toBeGreaterThan(5);
    for (const id of listed) {
      expect(SCENARIOS[id], `README가 없는 지점 ${id}을 안내한다`).toBeDefined();
    }
  });
});

describe("README의 명령이 실제로 있는가", () => {
  /*
   * 문서가 안내하는 명령이 없으면 처음 온 사람은 첫 5분에서 막힌다.
   * 반대로 스크립트를 지웠는데 문서가 남아도 같은 일이 벌어진다.
   */
  const readme = readFileSync("README.md", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;

  it("README가 안내하는 pnpm 명령이 전부 존재한다", () => {
    const mentioned = new Set(
      [...readme.matchAll(/`pnpm ([\w:]+)`/g)].map((m) => m[1]),
    );
    for (const name of mentioned) {
      expect(scripts[name], `README가 없는 명령 pnpm ${name}을 안내한다`).toBeDefined();
    }
    expect(mentioned.size, "README에 pnpm 명령이 하나도 없다").toBeGreaterThan(3);
  });

  it("verify가 네 검증을 모두 돈다", () => {
    /*
     * 커밋 전 검증은 이 한 줄에 걸려 있다. 하나라도 빠지면 통과했다고 믿고
     * 커밋하게 된다 — 빠진 줄 모르는 것이 가장 나쁘다.
     */
    for (const step of ["typecheck", "lint", "test", "build"]) {
      expect(scripts.verify, `verify에 ${step}이 없다`).toContain(step);
    }
  });

  it("README가 적은 verify 순서가 실제 순서와 같다", () => {
    /*
     * 순서를 **손으로 적어** 두었더니, 번들 검사가 빌드를 보게 하려고 순서를
     * 바꾸는 순간 이 검사가 「문서와 다르다」며 막았다 — 정작 문서는 같이
     * 고쳤는데도. 검사가 정본이 되어 버린 셈이다.
     *
     * 스크립트에서 순서를 **읽어** 문서와 대조한다. 어느 쪽으로 바꾸든
     * 둘이 같기만 하면 된다.
     */
    const steps = [...scripts.verify.matchAll(/pnpm (\w+)/g)].map((match) => match[1]);
    expect(steps.length, `verify에서 읽은 단계 ${steps.length}개`).toBeGreaterThan(2);

    const sentence = `\`${steps.join(" → ")}\` 순으로 돈다`;
    expect(readme, `문서가 ${sentence}를 말하지 않는다`).toContain(sentence);
  });
});

describe("사람에게 넘기는 목록이 지금 상태를 반영하는가", () => {
  /*
   * 2분 확인 목록은 한 번 쓰고 60여 반복 동안 그대로였다 — 그 사이에 넣은
   * 것들(네 번째 도깨비, 완주 화면, 키보드 조작)은 목록에 없어서, 봐 달라고
   * 부탁하면서 정작 새것은 빼놓고 있었다.
   */
  const readme = readFileSync("README.md", "utf8");

  it("확인 지점을 실제로 쓸 수 있게 적는다", () => {
    // 「보스 앞을 보라」가 아니라 어떻게 가는지가 적혀 있어야 한다
    const section = readme.slice(readme.indexOf("사람이 봐 줘야 하는 것"));
    expect(section, "확인 지점 주소가 없다").toContain("/play?see=");
  });

  it("수집 표기에 숫자를 박아 두지 않는다", () => {
    /*
     * 원래 이 검사는 「n/전체 수」가 들어 있는지 봤다. 그런데 그 표기 자체가
     * 틀렸다 — 초롱은 처음부터 함께 있어 만남 목록에 들어가지 않으므로,
     * 전체 수로 세면 **다 모아도 가득 차지 않는다.** 화면 쪽을 고친 뒤에도
     * 문서는 그대로였고, 이 검사가 오히려 그 상태를 붙들고 있었다.
     *
     * 이제는 숫자를 적지 않는 것을 확인한다 — 세는 방식이 또 바뀌어도
     * 문서가 거짓이 되지 않는다.
     */
    const section = readme.slice(readme.indexOf("사람이 봐 줘야 하는 것"));
    const rows = section.split("\n").filter((row) => row.includes("만난 도깨비"));
    expect(rows.length, "수집 안내가 없다").toBeGreaterThan(0);
    for (const row of rows) {
      expect(row, `숫자를 박아 두었다: ${row}`).not.toMatch(/\/\s*\d/);
    }
  });
});

describe("사람에게 부탁하는 시간이 정직한가", () => {
  /*
   * 「2분」이라고 적어 두고 항목이 열일곱 개가 됐다. 다 보려면 15분쯤 걸리는데,
   * **거짓 시간표는 아무도 시작하지 않게 만든다** — 2분인 줄 알고 열었다가
   * 끝이 안 보이면 덮는다.
   *
   * 「2분」 묶음이 실제로 2분어치인지, 그리고 적어 둔 개수가 실제와 맞는지 본다.
   */
  const section = readme.slice(readme.indexOf("## 사람이 봐 줘야 하는 것"));
  const body = section.slice(0, section.indexOf("\n## ", 1));

  it("목록을 실제로 잘라냈다", () => {
    expect(body.length, `잘라낸 길이 ${body.length}`).toBeGreaterThan(500);
    expect(body, "묶음이 나뉘어 있지 않다").toContain("### 2분");
  });

  it("2분 묶음이 다섯 개를 넘지 않는다", () => {
    /*
     * 항목 하나에 확인 지점 로딩과 조작이 붙으므로 넉넉히 20초씩 잡는다.
     * 여섯 개면 이미 2분이 아니다.
     */
    /*
     * **경계는 사라질 수 있는 이름이 아니라 구조로 잡는다.**
     *
     * 예전에는 `### 여유`까지 잘랐는데 그 제목이 없어졌다 — `indexOf`가 -1을
     * 주니 절 전체를 세고 있었고, 뒤쪽 항목이 마침 글머리표라 **우연히**
     * 통과했다. 다음 `###`까지 자르면 제목이 바뀌어도 범위가 맞는다.
     */
    const from = body.indexOf("### 2분");
    const nextHeading = body.indexOf("\n### ", from + 1);
    const quick = body.slice(from, nextHeading < 0 ? undefined : nextHeading);
    const items = quick.match(/^\d+\. /gm) ?? [];

    expect(nextHeading, "2분 묶음 뒤에 다른 묶음이 없다 — 범위를 못 잡는다").toBeGreaterThan(from);
    expect(items.length, `2분 묶음에 ${items.length}개`).toBeGreaterThan(2);
    expect(items.length, `2분 묶음에 ${items.length}개 — 2분이 아니다`).toBeLessThanOrEqual(5);
  });

  it("적어 둔 전체 개수가 실제와 맞는다", () => {
    // 「열일곱 개」라고 적어 두고 스물이 되면 그 문장이 또 거짓이 된다
    const NUMBERS: Record<string, number> = {
      열: 10, 열하나: 11, 열둘: 12, 열셋: 13, 열넷: 14, 열다섯: 15,
      열여섯: 16, 열일곱: 17, 열여덟: 18, 열아홉: 19,
      /*
       * 스물은 단위 앞에서 **스무**가 된다(「스무 개」). 목록에 `스물`만
       * 두었더니 스무 번째 항목을 더한 순간 「개수를 못 읽었다」로 실패했다 —
       * 문서가 맞는 말을 썼는데 검사가 못 읽은 것이다.
       */
      스물: 20, 스무: 20,
      스물하나: 21, 스물둘: 22, 스물셋: 23,
    };
    const claimed = /항목이 (\S+?) 개가/.exec(body)?.[1] ?? "";
    expect(NUMBERS[claimed], `적어 둔 개수 「${claimed}」를 못 읽었다`).toBeGreaterThan(0);

    /*
     * **이 절 안의 글머리표만 센다.** 예전에는 도구 설명(`### 검사가 정말
     * 잡는지…`)이 같은 절 안에 있어서, 거기에 글머리표를 하나 더하면 사람
     * 몫이 늘어난 것처럼 나왔다 — 실제로 15개가 19개로 틀어졌다.
     *
     * 절을 분리해 고쳤지만, 다시 누가 이 절 안에 사람 몫이 아닌 목록을 쓰면
     * 같은 일이 난다. 그때는 **개수를 고치지 말고 그 목록을 절 밖으로 옮겨라.**
     */
    const actual = (body.match(/^\d+\. /gm) ?? []).length + (body.match(/^- \*\*/gm) ?? []).length;
    expect(actual, `적힌 ${NUMBERS[claimed]}개 vs 실제 ${actual}개`).toBe(NUMBERS[claimed]);
  });
});
