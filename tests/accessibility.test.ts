import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HUD_FOCUS } from "@/game/systems/hudFocus";

import { collectSources, readCode } from "./support/source";

/**
 * 함수 하나의 본문만 잘라 낸다.
 *
 * 「앞에서부터 N자」로 자르면 주석을 늘렸다는 이유로 검사가 깨진다 — 규칙이
 * 아니라 글자 수를 재게 된다.
 */
function section(text: string, header: string): string {
  const start = text.indexOf(header);
  const next = text.indexOf("\nexport function", start + header.length);
  return next === -1 ? text.slice(start) : text.slice(start, next);
}

/** 화면을 그리는 소스 전부 */
function sourceFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(join(dir, entry.name))
        : /\.tsx$/.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
    );
  return walk("src/components");
}

/*
 * 접근성 정적 점검 — DESIGN_GUIDE의 WCAG 2.2 AA 요구와 실제 마크업 대조.
 *
 * 화면 낭독기를 실제로 돌려 보는 것을 대신하지는 못한다. 다만 "아이콘만 있는
 * 버튼에 이름이 없다" 같은 것은 소스만 봐도 확실히 알 수 있고, 그건 실기기
 * 테스트를 기다릴 이유가 없다.
 *
 * 검사 대상을 컴포넌트 디렉터리로 한정한다. 3D 씬 안에는 DOM이 없다.
 */

function collectTsx(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectTsx(path));
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

const sources = collectTsx("src/components").map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

/**
 * 여는 태그 하나를 통째로 잘라 낸다.
 *
 * 첫 `>`에서 자르면 안 된다 — `onClick={() => ...}`의 화살표가 먼저 걸린다.
 * 실제로 그렇게 만들었다가 이름이 멀쩡히 있는 버튼 셋을 오탐했다.
 * 중괄호 깊이를 세면서 깊이 0에서 만난 `>`가 진짜 끝이다.
 */
function openingTags(text: string, tag: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`<${tag}[\\s>]`, "g");
  let match = pattern.exec(text);

  while (match) {
    let depth = 0;
    for (let i = match.index; i < text.length; i += 1) {
      const char = text[i];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) {
        found.push(text.slice(match.index, i + 1));
        break;
      }
    }
    match = pattern.exec(text);
  }
  return found;
}

/** 여는 태그부터 닫는 태그까지. 자식에 글자가 있는지 보는 데 쓴다 */
function elements(text: string, tag: string): string[] {
  const found: string[] = [];
  for (const open of openingTags(text, tag)) {
    const start = text.indexOf(open);
    const close = text.indexOf(`</${tag}>`, start);
    if (close > 0) found.push(text.slice(start, close));
  }
  return found;
}

describe("버튼", () => {
  it("모든 button에 접근 가능한 이름이 있다", () => {
    /*
     * 아이콘이나 짧은 기호만 든 버튼은 화면 낭독기에서 "버튼"으로만 읽힌다.
     * 공용 HudButton은 label prop을 aria-label로 넘기므로, 여기서 걸리는 것은
     * 직접 쓴 <button>뿐이다.
     */
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      for (const element of elements(text, "button")) {
        if (element.includes("aria-label")) continue;
        /*
         * 눈에 보이는 글자가 있으면 그것이 곧 이름이 된다. 문제는 아이콘만
         * 든 버튼이다. 여는 태그를 제외한 나머지에서 글자를 찾는다.
         */
        const openTag = openingTags(element, "button")[0] ?? "";
        const children = element.slice(openTag.length);
        if (!/[가-힣A-Za-z]/.test(children)) {
          offenders.push(`${path}: ${openTag.slice(0, 80).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(offenders, `buttons without an accessible name:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("터치 최소 크기를 토큰으로 지정한다", () => {
    // 손가락이 닿을 크기를 각 파일이 픽셀로 적으면 기준이 흩어진다
    const hudButton = sources.find((file) => file.path.endsWith("HudButton.tsx"));
    expect(hudButton, "HudButton.tsx를 찾지 못했다").toBeDefined();
    expect(hudButton?.text).toContain("--touch-min");
  });
});

describe("대화 상자", () => {
  it("role=dialog에는 이름이 붙어 있다", () => {
    // 이름 없는 대화 상자는 낭독기가 "대화 상자"라고만 읽는다
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      for (const tag of openingTags(text, "div")) {
        if (tag.includes('role="dialog"') && !tag.includes("aria-label")) {
          offenders.push(`${path}: ${tag.replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(offenders, `unnamed dialogs:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("캔버스", () => {
  it("정보를 담은 캔버스에 대체 텍스트가 있다", () => {
    /*
     * 지도는 캔버스로 그린다. 낭독기에는 아무것도 안 보이므로 최소한
     * "무엇을 그린 그림인지"는 알려 줘야 한다.
     */
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      if (!text.includes("<canvas")) continue;
      const described = text.includes("aria-label") && text.includes('role="img"');
      if (!described) offenders.push(path);
    }
    expect(offenders, `canvases without a description: ${offenders.join(", ")}`).toEqual([]);
  });

  it("지도 캔버스는 이름만 대지 않고 무엇이 있는지 말한다", () => {
    /*
     * 큰 지도는 표식을 말하도록 고쳤는데(`describeMap`), 정작 **늘 보이는**
     * 미니맵은 `aria-label="주변 지도"` 한 줄뿐이었다 — 이름은 있고 내용은
     * 없는 그림이라, 눈으로 못 보는 사람에게는 로봇이 몇 기인지도 목표가
     * 어느 쪽인지도 없었다. 위 검사는 「대체 텍스트가 있는가」만 보므로
     * 고정 문자열로도 통과한다.
     *
     * 지도 화면은 **손으로 적지 않고** 찾는다: 내용을 글로 내려면
     * `describeMap`을 불러야 한다. 지도가 하나 더 생겨도 같은 규칙을 받는다.
     *
     * 전에는 「캔버스가 있고 지도 변환을 가져오는 파일」로 찾았다. 칠하는 일을
     * 떼어 내자 캔버스와 문장이 다른 파일로 갈라졌고, 검사는 지도 하나를
     * 놓쳤다 — 표시로 삼은 것이 지도의 성질이 아니라 그때의 구현이었다.
     */
    const maps = sources.filter((file) => file.text.includes("describeMap("));
    /*
     * 하나다. 미니맵을 걷어내면서 둘에서 하나가 됐다 — 늘 떠 있는 148px짜리
     * 판은 「세계가 먼저, UI는 나중에」와 어긋난다(DESIGN_GUIDE). 규칙은
     * 그대로다: 지도를 그리는 화면은 **글로도** 내야 한다.
     */
    expect(maps.length, `찾은 지도 화면 ${maps.length}개`).toBeGreaterThan(0);

    /*
     * 만들기만 하고 화면에 안 내보내면 없는 것과 같다. 내는 방법은 둘 다
     * 옳다 — 큰 지도는 **눈에 보이는 글**로(그쪽이 더 낫다), 미니맵은
     * 계산된 `aria-label`로 낸다.
     */
    const unused = maps
      .filter((file) => !/aria-label=\{|\{summary\}/.test(file.text))
      .map((file) => file.path);
    expect(unused, `요약을 만들고 내보내지 않는 지도: ${unused.join(", ")}`).toEqual([]);
  });
});

describe("상태 알림", () => {
  it("스스로 사라지는 알림은 live region이다", () => {
    /*
     * 대사·구역 배너·해금 알림은 사용자가 조작하지 않아도 나타났다 사라진다.
     * live region이 아니면 낭독기 사용자에게는 아예 없는 정보가 된다.
     */
    /*
     * 예전에는 `Notices.tsx` **한 파일만** 봤다. 그 뒤로 알림이 쪼개져
     * `CaptureNotice`·`ShrineNotice`가 따로 나갔고, 둘은 이 검사를 받지
     * 않았다(지금은 우연히 짝이 맞다).
     *
     * `role="status"`를 쓰는 곳을 **전부** 찾아 짝을 맞춘다 — 화면 조각이
     * 어떻게 나뉘든 규칙은 같다.
     */
    const speaking = [
      ...sources,
      ...collectSources("src/app").map((path) => ({ path, text: readCode(path) })),
    ]
      .map((file) => ({
        path: file.path,
        status: (file.text.match(/role="status"/g) ?? []).length,
        live: (file.text.match(/aria-live=/g) ?? []).length,
      }))
      .filter((file) => file.status > 0);

    expect(speaking.length, `role=status를 쓰는 파일 ${speaking.length}개`).toBeGreaterThan(4);

    const unpaired = speaking
      .filter((file) => file.live !== file.status)
      .map((file) => `${file.path}: status ${file.status} / aria-live ${file.live}`);
    expect(unpaired, `짝이 안 맞는 알림:\n${unpaired.join("\n")}`).toEqual([]);
  });
});

describe("장식 요소", () => {
  it("의미 없는 그래픽은 aria-hidden이다", () => {
    /*
     * 색 점·실루엣·구도 보조선은 낭독기에 읽힐 이유가 없다. 안 가리면
     * 목록을 훑을 때 빈 항목이 계속 끼어든다.
     */
    for (const { path, text } of sources) {
      const decorative = (text.match(/aria-hidden="true"/g) ?? []).length;
      // 지도·도감처럼 색으로 정보를 주는 화면에는 반드시 하나 이상 있다
      // 도감의 색 점은 항목 카드로 내려갔다 — 「색으로 정보를 주는 화면」은 그쪽이다
      if (path.endsWith("CodexEntry.tsx") || path.endsWith("CityMapLegend.tsx")) {
        expect(decorative, `${path} has no aria-hidden decoration`).toBeGreaterThan(0);
      }
    }
  });
});

describe("키보드만으로 시작할 수 있는가", () => {
  /*
   * 브라우저에서 확인했다 — 시작 화면의 초점 대상은 셋(「동네로 들어가기」·
   * 「조작법」·「설정」)이고, 가장 중요한 것이 먼저 온다. Tab을 누르면
   * `:focus-visible`이 붙어 3px 링이 보인다.
   *
   * 이 링이 사라지는 방식은 조용하다 — 누가 `outline: none`을 넣으면 키보드
   * 사용자는 자기가 어디 있는지 알 수 없게 되는데, 마우스로는 아무 차이가 없다.
   */
  const css = readFileSync("src/app/globals.css", "utf8");

  it("초점 표시 규칙이 있다", () => {
    expect(css).toContain(":focus-visible");
    const rule = css.slice(css.indexOf(":focus-visible"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body, "초점 표시가 테두리를 그리지 않는다").toMatch(/outline:\s*\d+px/);
  });

  it("한국어가 어절 중간에서 끊기지 않는다", () => {
    /*
     * 브라우저 기본값은 한글을 **글자 아무 데서나** 자른다. 랜딩에서
     * 「숨어 있던 도깨비/와」, 「광장에서 시작합니/다.」로 나왔다.
     *
     * 화면이 전부 한국어이므로 `body`에서 정한다. 짝인 `overflow-wrap`이
     * 없으면 반대 사고가 난다 — 띄어쓰기 없는 긴 문자열이 끊길 데가 없어
     * 상자를 뚫는다. 둘을 함께 요구한다.
     */
    const body = css.slice(css.indexOf("\nbody {"));
    const rule = body.slice(0, body.indexOf("\n}"));

    expect(rule, "한글이 아무 데서나 끊긴다").toMatch(/word-break:\s*keep-all/);
    expect(rule, "긴 문자열이 상자를 뚫는다").toMatch(/overflow-wrap:\s*(break-word|anywhere)/);
  });

  it("초점 표시를 지우는 규칙이 없다", () => {
    /*
     * `outline: none`을 어딘가에 넣으면 위 규칙이 무력해진다. 대체 표시
     * (box-shadow 등)를 함께 두는 경우만 예외인데, 지금은 그런 곳이 없다.
     */
    const killers = [...css.matchAll(/outline:\s*none/g)];
    expect(killers.length, `outline: none이 ${killers.length}곳`).toBe(0);
  });

  it("시작 버튼이 첫 초점이다", () => {
    // 키보드 사용자가 Tab 한 번으로 게임에 들어갈 수 있어야 한다
    const title = readFileSync("src/components/title/TitleScreen.tsx", "utf8");
    const enter = title.indexOf("동네로 들어가기");
    const controls = title.indexOf("조작법");
    expect(enter, "시작 버튼을 찾지 못했다").toBeGreaterThan(-1);
    expect(enter, "조작법이 시작 버튼보다 앞에 있다").toBeLessThan(controls);
  });
});

describe("열린 패널에서 빠져나올 수 있는가", () => {
  /*
   * 도감은 `role="dialog"`인데 Escape가 어디에도 없었다 — 키보드 사용자는
   * 도깨비 항목을 전부 지나 「닫기」까지 Tab해야 빠져나온다. 마우스로는 아무
   * 불편이 없어 눈에 띄지 않는 종류다.
   *
   * 브라우저에서 확인했다: 페이지 안에서 Escape를 보내면 도감이 닫힌다.
   * (자동화 도구의 특수 키는 페이지에 닿지 않아 그 경로로는 검증이 안 됐다.)
   */
  const hud = readFileSync("src/components/hud/useHudPanels.ts", "utf8");

  it("Escape로 패널을 닫는다", () => {
    expect(hud, "Escape 처리가 없다").toContain('event.code === "Escape"');
    expect(hud, "닫는 길이 없다").toContain("setCodexOpen(false)");
    expect(hud).toContain("setMapOpen(false)");
  });

  it("패널이 닫혀 있으면 듣지 않는다", () => {
    /*
     * 항상 듣고 있으면 월드에서 Escape를 다른 용도로 쓸 수 없게 되고,
     * 리스너도 계속 붙어 있는다.
     */
    expect(hud).toContain("if (!codexOpen && !mapOpen) return;");
  });

  it("리스너를 뗀다", () => {
    const at = hud.indexOf('event.code === "Escape"');
    const around = hud.slice(at, at + 500);
    expect(around, "keydown 리스너가 남는다").toContain("removeEventListener");
  });
});

describe("대화상자가 초점을 옮기고 돌려주는가", () => {
  /*
   * `role="dialog"`를 붙여 놓고 초점은 바깥 버튼에 남겨 두었었다 — 키보드
   * 사용자는 패널이 떴는지 알 수 없고, Tab을 눌러도 화면에 없는 것들을
   * 먼저 지난다. 마우스로는 아무 차이가 없어 눈에 띄지 않는다.
   *
   * 브라우저에서 확인했다: 열면 초점이 「도깨비 도감」으로, Escape로 닫으면
   * 「도감」 버튼으로 돌아온다.
   */
  const hook = readFileSync("src/components/hud/useDialogFocus.ts", "utf8");

  it("열릴 때 안으로 옮기고 닫힐 때 돌려준다", () => {
    expect(hook).toContain("panelRef.current?.focus()");
    const cleanup = hook.slice(hook.indexOf("return () => {"));
    expect(cleanup.slice(0, 200), "정리에서 초점을 되돌리지 않는다").toContain("opener?.focus");
  });

  it("모든 대화상자가 같은 처리를 쓴다", () => {
    /*
     * 도감만 고쳐 두면 다음에 추가되는 패널이 어느 쪽을 따라야 할지 알 수 없다.
     * `role="dialog"`를 쓰는 곳은 전부 이 훅을 써야 한다.
     */
    /*
     * 손으로 적은 목록이었다 — 지금은 맞지만 **세 번째 대화창이 생기면
     * 조용히 빠진다.** 목록은 아는 것만 담고 규칙은 모르는 것까지 잡는다.
     *
     * 주석을 걷어낸 소스에서 찾는다. 「예전에 `role="dialog"`를 붙여 놓고」
     * 같은 기록이 대화창으로 잡히면 안 된다.
     */
    const dialogs = collectSources("src").filter((path) =>
      readCode(path).includes('role="dialog"'),
    );

    expect(dialogs.length, `찾은 대화창 ${dialogs.length}개`).toBeGreaterThan(1);
    for (const path of dialogs) {
      const source = readCode(path);
      expect(source, `${path}가 초점을 옮기지 않는다`).toContain("useDialogFocus()");
      expect(source, `${path}가 초점을 받지 못한다`).toContain("tabIndex={-1}");
    }
  });

  it("탭 순서에 끼어들지 않는다", () => {
    // tabIndex -1은 "Tab으로는 못 가지만 프로그램으로는 갈 수 있다"는 뜻이다
    const dialogs = collectSources("src").filter((path) =>
      readCode(path).includes('role="dialog"'),
    );
    expect(dialogs.length, `찾은 대화창 ${dialogs.length}개`).toBeGreaterThan(1);
    for (const path of dialogs) {
      expect(readCode(path), `${path}`).not.toContain("tabIndex={0}");
    }
  });
});

describe("낭독기가 쉼 없이 떠들지 않는가", () => {
  /*
   * 보스 체력 막대가 `aria-live` 영역인데 이름이 `고물 대장 체력 87퍼센트`였다.
   * 이 값은 120ms마다 바뀐다 — 낭독기가 숫자만 끝없이 읽고, 정작 들어야 할
   * 「내려친다 — 피해!」가 그 사이에 묻힌다.
   *
   * 소리로 필요한 것은 **지금 피해야 하는가**이지 남은 체력의 정확한 값이 아니다.
   */
  it("live 영역의 이름이 값에 따라 바뀌지 않는다", () => {
    let checked = 0;
    for (const path of sourceFiles()) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/aria-live="polite"/g)) {
        checked += 1;
        const around = source.slice(Math.max(0, match.index - 700), match.index + 400);
        expect(
          /aria-label=\{`[^`]*\$\{/.test(around),
          `${path}: live 영역 이름이 계속 바뀐다`,
        ).toBe(false);
      }
    }
    expect(checked, `live 영역을 ${checked}개 확인했다`).toBeGreaterThan(3);
  });

  it("가까이 갔다는 표시는 알리지 않는다", () => {
    /*
     * 주민 대사 상자에 「T 살펴보기」 안내와 대사를 함께 넣고 `aria-live`를
     * 걸었다. 주민은 걸어 다니므로 안내가 켜졌다 꺼졌다 하며 **낭독기가
     * 끝없이 읽었다.**
     *
     * 앞선 두 검사(이름이 바뀐다·본문 숫자가 흐른다)로는 안 걸린다 — 여기서
     * 흔들리는 것은 값이 아니라 **영역의 존재 자체**다.
     *
     * live 영역은 사건을 알린다. 「지금 누를 수 있다」는 상태이지 사건이 아니고,
     * 눈으로 보는 안내다.
     */
    /*
     * 신호는 **대체 문구**다. 알릴 것이 없을 때 다른 것을 그리는 영역은,
     * 곧 「알릴 것이 없는 상태」까지 알리고 있다는 뜻이다.
     *
     * 처음엔 「`nearby`라는 낱말이 영역 안에 있는가」로 짰는데, 그 낱말은
     * 영역보다 **앞줄**에 있어서 실제 결함을 못 잡았다 — 검사가 헛돌 뻔했다.
     */
    let checked = 0;
    for (const path of sourceFiles()) {
      const source = readFileSync(path, "utf8");
      /*
       * 늘 켜 있는 영역만 본다. 자판기 안내처럼 **`aria-live`를 조건부로
       * 끄는** 곳은 알릴 것이 없는 동안 이미 조용하다 — 그쪽은 다른 검사가
       * 지킨다.
       */
      for (const match of source.matchAll(/aria-live="polite"/g)) {
        checked += 1;
        const inside = source.slice(match.index, match.index + 600);
        const body = inside.slice(inside.indexOf(">"));
        expect(
          /\? \([\s\S]*?\) : \(/.test(body),
          `${path}: live 영역이 알릴 것이 없을 때 다른 것을 그린다`,
        ).toBe(false);
      }
    }
    expect(checked, `live 영역을 ${checked}개 확인했다`).toBeGreaterThan(3);
  });

  it("숫자가 흐르는 동안에는 알리지 않는다", () => {
    /*
     * 반복 160에서 보스 체력 막대의 **이름**이 계속 바뀌는 것을 막았다.
     * 그런데 자판기 안내는 **본문 글자**가 초당 여덟 번쯤 바뀌고 있었다 —
     * 이름만 보던 검사는 그걸 놓쳤다.
     *
     * 세는 동안에는 `off`, 뽑을 수 있게 된 순간에만 `polite`가 맞다.
     */
    const prompts = readCode("src/components/hud/views/Prompts.tsx");
    const prompt = section(prompts, "export function VendingPrompt");
    expect(prompt, "세는 동안에도 계속 읽는다").toContain(
      'aria-live={view.remaining !== null ? "off" : "polite"}',
    );
  });

  it("자주 바뀌는 표시는 live가 아니다", () => {
    /*
     * 체력·성능처럼 매 순간 변하는 값은 `aria-live="off"`여야 한다.
     * 켜 두면 게임 내내 숫자가 읽힌다.
     */
    /*
     * 함수 하나만 잘라 본다. 앞에서부터 1,200자를 보고 있었는데, 주석과 표시
     * 조건이 늘자 `aria-live`가 그 창 밖으로 밀려 **고친 적 없는 규칙이
     * 깨졌다고** 나왔다 — 글자 수는 규칙이 아니다.
     */
    const panels = readFileSync("src/components/hud/views/HealthPanel.tsx", "utf8");
    const health = section(panels, "export function HealthPanel");
    expect(health, "체력 표시가 계속 읽힌다").toContain('aria-live="off"');
  });
});

describe("3D 화면에 이름이 있는가", () => {
  /*
   * 화면 대부분을 차지하는 캔버스에 이름이 없었다 — 낭독기에는 정체불명의
   * 그래픽 하나로만 잡혀, 무엇을 하는 화면인지 알 방법이 없었다.
   *
   * 캔버스 자체에 붙이려다 실패했다: R3F가 `role`·`aria-label`을 DOM으로
   * 넘기지 않는다. 감싸는 요소에 두고 브라우저에서 확인했다.
   */
  const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");

  it("HUD를 삼키지 않는다", () => {
    /*
     * 처음에는 바깥 컨테이너에 `role="img"`를 붙였는데 그 안에 HUD가 통째로
     * 들어 있었다 — **`role="img"`의 자손은 낭독기에 노출되지 않는다.**
     * 목표·체력·버튼이 전부 사라졌다. 접근성을 고치려다 없앤 셈이다.
     *
     * 브라우저에서 확인했다: 이름 붙은 요소는 캔버스만 감싸고, HUD 버튼
     * 일곱 개는 전부 바깥에 있다.
     */
    const wrapper = client.slice(client.indexOf('role="img"'));
    const body = wrapper.slice(0, wrapper.indexOf("</div>"));
    expect(body, "HUD가 그림 안에 들어 있다").not.toContain("<WorldHud");
    expect(body, "감싼 것이 3D 화면이 아니다").toContain("<GameScene");
  });

  it("감싸는 요소가 이름을 갖는다", () => {
    expect(client).toContain('role="img"');
    expect(client, "이름이 무엇을 하는 화면인지 말하지 않는다").toMatch(/aria-label="[^"]*3D 화면/);
  });

  it("조작 방법을 함께 알린다", () => {
    // "그림이 있다"만으로는 무엇을 해야 할지 알 수 없다
    expect(client).toMatch(/aria-label="[^"]*(키보드|버튼)/);
  });

  it("캔버스에 직접 붙이지 않는다", () => {
    /*
     * R3F의 Canvas는 이 속성들을 DOM으로 넘기지 않는다 — 붙여도 사라지고,
     * 사라진 줄 모른 채 「했다」고 믿게 된다. 실제로 한 번 겪었다.
     */
    const scene = readFileSync("src/game/scene/GameScene.tsx", "utf8");
    const canvas = scene.slice(scene.indexOf("<Canvas"), scene.indexOf("<color"));
    expect(canvas, "Canvas에 직접 붙였다 — DOM에 남지 않는다").not.toContain("aria-label");
  });
});

describe("패널을 여는 버튼이 상태를 알리는가", () => {
  /*
   * 지도·도감 버튼의 이름이 열려 있어도 「열기」였다 — 이미 연 사람에게
   * 「도감 열기」라고 말하면 아직 닫혀 있는 줄 안다. 소리·모션 토글은
   * 이름을 바꾸는데 이 둘만 그러지 않았다.
   *
   * 역할도 달랐다. `aria-pressed`는 "눌린 상태"이고, 패널을 여는 버튼은
   * `aria-expanded` + `aria-haspopup="dialog"`가 맞다.
   */
  const hud = readFileSync("src/components/hud/useHudPanels.ts", "utf8");
  const button = readFileSync("src/components/hud/HudButton.tsx", "utf8");

  it("이름이 지금 상태를 말한다", () => {
    /*
     * 지도·도감 버튼으로 재던 규칙이다. 우상단 메뉴를 걷어내면서 그 버튼들이
     * 사라졌으므로, **문구 두 개를 찾는 대신 규칙 자체를 잰다**: `expanded`를
     * 쓰는 버튼은 label이 상태에 따라 갈라져야 한다(삼항).
     *
     * 버튼이 하나도 없으면 이 검사는 아무것도 지키지 않으므로, 그때는
     * `HudButton`이 그 수단(`expanded`)을 여전히 제공하는지만 확인한다 —
     * 다시 버튼을 달 때 규칙이 살아 있어야 한다.
     */
    const expandedButtons = hud.match(/expanded=\{[^}]+\}[\s\S]{0,200}?label=\{[^}]+\}/g) ?? [];

    for (const snippet of expandedButtons) {
      expect(snippet, "펼침 버튼인데 이름이 상태에 따라 갈리지 않는다").toMatch(/label=\{[^}]*\?/);
    }

    if (expandedButtons.length === 0) {
      expect(button, "펼침 상태를 표현할 수단 자체가 사라졌다").toContain("expanded");
    }
  });

  it("펼침 상태를 알린다", () => {
    expect(button).toContain("aria-expanded={expanded}");
    expect(button, "대화상자를 연다는 것을 알리지 않는다").toContain("aria-haspopup");
  });

  it("눌림과 펼침을 함께 쓰지 않는다", () => {
    /*
     * 둘 다 붙으면 낭독기가 "눌림" 과 "펼쳐짐"을 함께 읽어 무엇을 뜻하는지
     * 흐려진다. 하나를 쓰면 다른 하나는 비워야 한다.
     */
    expect(button).toContain("aria-pressed={expanded === undefined ? pressed : undefined}");
  });
});

describe("화면에 제목이 있는가", () => {
  /*
   * 낭독기 사용자는 제목으로 화면을 훑는다. 그런데 월드에는 제목이 하나도
   * 없고 도감·지도만 h2를 갖고 있었다 — h1 없이 h2가 떠 있으니 계층이
   * 끊기고, "여기가 어디인가"를 알 방법도 없었다.
   *
   * 브라우저에서 확인했다: 1×1px이라 눈에는 보이지 않고, `display:none`이
   * 아니라 낭독기에는 남는다. `role="img"` 바깥이라 삼켜지지도 않는다.
   */
  it("월드에 h1이 있다", () => {
    const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");
    expect(client, "월드에 제목이 없다").toMatch(/<h1[^>]*>[^<]+<\/h1>/);
  });

  it("월드 제목이 화면을 가리지 않는다", () => {
    /*
     * 월드 위에 글자를 얹으면 게임을 가린다 — 눈에는 안 보여야 한다.
     *
     * 같은 파일에 h1이 하나 더 있다: WebGL을 못 여는 기기에 뜨는 안내다.
     * 그건 **보여야 맞으므로** 대상이 아니다. 그 안내문에도 「월드」가 들어 있어
     * 낱말로 거르려다 두 번 잘못 잡았다 — 제목 그대로로 찾는다.
     */
    const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");
    const worldHeading = [...client.matchAll(/<h1([^>]*)>([^<]+)<\/h1>/g)].find(([, , text]) =>
      text.startsWith("Doke"),
    );
    expect(worldHeading, "월드 제목을 찾지 못했다").toBeDefined();
    expect(worldHeading?.[1], "제목이 화면에 그대로 그려진다").toContain("sr-only");
  });

  it("h2가 h1 없이 떠 있지 않다", () => {
    /*
     * 도감·지도는 h2다. 화면에 h1이 없으면 계층이 h2에서 시작한다 —
     * 훑어 내려가는 사람에게는 한 단계가 통째로 빠진 것으로 보인다.
     */
    for (const path of [
      "src/components/hud/CodexEntry.tsx",
      "src/components/hud/CityMapLegend.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      if (!source.includes("<h2")) continue;
      const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");
      expect(client, `${path}가 h2를 쓰는데 화면에 h1이 없다`).toContain("<h1");
    }
  });
});

describe("본문 랜드마크가 있는가", () => {
  /*
   * 시작 화면은 `<main>`·`<header>`·`<footer>`를 쓰는데 월드만 그냥 `<div>`였다 —
   * 낭독기 사용자가 「본문으로 건너뛰기」를 할 수 없고, 화면 구조도 평평하게 읽힌다.
   *
   * 브라우저에서 확인했다: `<main>`이 캔버스·제목·버튼 일곱 개를 모두 담는다.
   */
  /*
   * 손으로 적은 목록이었다 — 시작 화면과 월드 둘뿐. 그래서 **오류 화면 둘에
   * 랜드마크가 없는 것을 아무도 몰랐다.** `role="alert"`는 내용을 읽어 주지만
   * 구조를 주지 않아, 낭독기 사용자가 「본문으로 건너뛰기」를 할 수 없다.
   *
   * 규칙으로 바꾼다: **자기 제목(`<h1>`)을 그리는 것은 한 화면**이고, 화면에는
   * 본문이 있어야 한다. 조각(패널·알림)은 제목을 그리지 않으므로 걸리지 않는다.
   */
  const screens = collectSources("src").filter((path) => /<h1[\s>]/.test(readCode(path)));

  it("화면을 실제로 찾았다", () => {
    expect(screens.length, `찾은 화면: ${screens.join(", ")}`).toBeGreaterThan(2);
  });

  for (const path of screens) {
    it(`${path}에 main이 있다`, () => {
      expect(readCode(path), `${path}에 본문 랜드마크가 없다`).toMatch(/<main[\s>]/);
    });
  }

  it("한 화면에 main이 겹치지 않는다", () => {
    /*
     * 둘 이상이 **동시에** 뜨면 「본문」이 여럿이라 건너뛰기가 의미를 잃는다.
     * 다만 한 파일에 여러 개가 있을 수는 있다 — `PlayClient`는 월드와
     * WebGL 미지원 화면을 각각 그리고, 둘은 절대 함께 뜨지 않는다.
     *
     * 그래서 개수가 아니라 **중첩**을 본다: 여는 태그 뒤 닫는 태그가 오기
     * 전에 또 열리면 겹친 것이다.
     */
    for (const path of screens) {
      const code = readCode(path);
      let depth = 0;
      for (const token of code.match(/<main[\s>]|<\/main>/g) ?? []) {
        depth += token.startsWith("</") ? -1 : 1;
        expect(depth, `${path}: main이 main 안에 있다`).toBeLessThanOrEqual(1);
      }
      expect(depth, `${path}: main 태그가 짝이 맞지 않는다`).toBe(0);
    }
  });

  it("본문이 하나도 없는 화면이 없다", () => {
    for (const path of screens) {
      const opens = (readCode(path).match(/<main[\s>]/g) ?? []).length;
      expect(opens, `${path}에 본문 랜드마크가 없다`).toBeGreaterThan(0);
    }
  });
});

describe("누르는 자리가 충분히 큰가", () => {
  /*
   * 디자인 가이드가 「모바일 터치 영역은 최소 44×44 CSS px」이라고 정한다.
   * 검사는 `HudButton` **하나만** 보고 있었다 — 그래서 도감의 「데리고 다니기」가
   * `text-xs underline`뿐인 채로 남아 있었다(높이 약 16px). 손가락으로는
   * 옆 카드가 눌린다.
   *
   * 버튼을 그리는 **모든 파일**을 훑는다. 토큰(`--touch-min`)을 쓰든 값을
   * 직접 적든 상관없다 — `global-error`는 앱 스타일시트 없이 뜰 수 있어
   * 일부러 리터럴을 쓴다.
   */
  const withButtons = collectSources("src").filter((path) => readCode(path).includes("<button"));

  it("버튼을 그리는 파일을 실제로 찾았다", () => {
    expect(withButtons.length, `찾은 파일 ${withButtons.length}개`).toBeGreaterThan(5);
  });

  it("모두 최소 크기를 잡는다", () => {
    const minimum = /--touch-min|minHeight:\s*"44px"|min-h-\[44px\]/;
    const small = withButtons.filter((path) => !minimum.test(readCode(path)));
    expect(small, `최소 크기를 안 잡는 파일:\n${small.join("\n")}`).toEqual([]);
  });

  it("가이드가 말하는 값과 토큰이 같다", () => {
    // 가이드만 고치고 토큰이 남으면 두 문장이 서로 다른 약속을 한다
    const guide = readFileSync("docs/DESIGN_GUIDE.md", "utf8");
    const claimed = /최소 (\d+)×\d+ CSS px/.exec(guide);
    expect(claimed, "가이드에서 터치 기준을 못 찾았다").not.toBeNull();

    const token = /--touch-min:\s*(\d+)px/.exec(readFileSync("src/app/globals.css", "utf8"));
    expect(token, "토큰을 못 찾았다").not.toBeNull();
    expect(Number(token?.[1]), `가이드 ${claimed?.[1]}px vs 토큰 ${token?.[1]}px`).toBe(
      Number(claimed?.[1]),
    );
  });
});

describe("색을 토큰으로만 쓰는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 컴포넌트에 `text-[#ff00ff]`처럼 색을 박아도
   * 검사가 전부 통과했다 — 명암비 검사는 **토큰만** 보므로, 박아 둔 색은
   * 아예 검사 밖으로 나간다.
   *
   * 실제로 하나 있었고 **하필 가장 중요한 글자**였다: 보스의 「내려친다 — 피해!」
   * 경고가 `text-[#ff8a3d]`였다. 그 값은 이미 토큰(`--color-brand-sunset`)인데
   * 값을 복사해 둔 것이라, 토큰을 바꾸면 **이 경고만 안 따라온다.**
   *
   * 일러스트(시작 화면의 노을 그라디언트)는 예술 자산이라 막지 않는다 — 막는
   * 것은 **글자와 면에 색을 박는 유틸리티**다. 그쪽이 명암비가 걸리는 자리다.
   */
  const uiFiles = collectSources("src").filter((path) => path.endsWith(".tsx"));

  it("화면 파일을 실제로 훑었다", () => {
    expect(uiFiles.length, `훑은 파일 ${uiFiles.length}개`).toBeGreaterThan(10);
  });

  it("글자·면 색을 박아 두지 않는다", () => {
    const offenders = uiFiles.flatMap((path) => {
      const found =
        readFileSync(path, "utf8").match(
          /(text|bg|border|fill|stroke|ring|shadow|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g,
        ) ?? [];
      return found.map((hit) => `${path}: ${hit}`);
    });
    expect(offenders, `색을 박아 둔 곳:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("누를 것의 최소 크기가 토큰을 거치는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 시작 화면의 `minHeight`를 `16px`로 줄여도
   * 통과했다(오류 화면 쪽은 잡혔다) — **목록이지 규칙이 아니었다.**
   *
   * 최소 터치 크기는 손가락 크기에서 온 값이라 화면마다 다르게 정할 이유가
   * 없다. 토큰(`--touch-min`)을 거치면 한 곳에서 바꾸고 모두 따라온다.
   *
   * `global-error.tsx`만 예외다 — 앱 스타일시트가 실리지 않는 화면이라 토큰을
   * 쓸 수 없어 값을 직접 적는다(그 파일 안에 이유가 적혀 있다).
   */
  const TOKEN_FREE = "src/app/global-error.tsx";

  const declarations = collectSources("src")
    .filter((path) => path.endsWith(".tsx") && !path.endsWith("global-error.tsx"))
    .flatMap((path) => {
      const found = readFileSync(path, "utf8").match(/minHeight: "[^"]+"/g) ?? [];
      return found.map((hit) => ({ path, hit }));
    });

  it("최소 크기 선언을 실제로 모았다", () => {
    expect(declarations.length, `찾은 선언 ${declarations.length}개`).toBeGreaterThan(3);
  });

  it("px로 박아 두지 않는다", () => {
    /*
     * `dvh`·`rem` 같은 것은 레이아웃이라 놔둔다. **px로 적은 최소 높이**가
     * 곧 「손가락 크기를 손으로 정했다」는 뜻이다.
     */
    const offenders = declarations
      .filter((item) => /\d+px/.test(item.hit))
      .map((item) => `${item.path}: ${item.hit}`);
    expect(
      offenders,
      `최소 크기를 px로 박았다(${TOKEN_FREE}만 예외):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("스스로 사라지는 안내가 읽을 시간을 주는가", () => {
  /*
   * 대사에는 「0이면 뜨자마자 사라진다」는 검사가 있었는데, **화면 안내 둘에는
   * 없었다** — 0.05초로 줄여도 전부 통과했다. 0.05초짜리 안내는 사람 눈에
   * 안 뜬 것과 같다.
   *
   * 무엇을 잃는지가 크다: 해금 알림은 **수집의 순간 그 자체**다(그 파일 주석이
   * 「이게 없으면 도감을 열기 전까지 아무도 알려 주지 않는다」고 적어 뒀다).
   * 구역 배너는 넓은 도시에서 「어디쯤 왔다」를 알려 주는 유일한 단서다.
   *
   * 값의 범위와 **둘 사이의 관계**를 함께 본다. 관계는 이미 글로 적혀 있었다 —
   * 「해금 알림은 구역 배너보다 길다, 처음 보는 이름이라」. 글로만 있으면 지켜지지
   * 않는다는 것을 이 세션에 여러 번 봤다.
   */
  it("두 안내 모두 읽을 만큼 머문다", () => {
    // 한글 한 줄을 읽는 데 최소 이 정도는 걸린다. 아래로 내려가면 못 읽는다
    const MIN_READABLE_SECONDS = 1.5;
    expect(
      HUD_FOCUS.districtBannerSeconds,
      `구역 배너 ${HUD_FOCUS.districtBannerSeconds}초`,
    ).toBeGreaterThan(MIN_READABLE_SECONDS);
    expect(
      HUD_FOCUS.unlockNoticeSeconds,
      `해금 알림 ${HUD_FOCUS.unlockNoticeSeconds}초`,
    ).toBeGreaterThan(MIN_READABLE_SECONDS);
  });

  it("계속 떠 있지는 않는다 — 화면을 가리면 도시가 안 보인다", () => {
    expect(HUD_FOCUS.districtBannerSeconds).toBeLessThan(10);
    expect(HUD_FOCUS.unlockNoticeSeconds).toBeLessThan(10);
  });

  it("해금 알림이 구역 배너보다 오래 머문다 — 처음 보는 이름이다", () => {
    expect(
      HUD_FOCUS.unlockNoticeSeconds,
      `해금 ${HUD_FOCUS.unlockNoticeSeconds}초 vs 구역 ${HUD_FOCUS.districtBannerSeconds}초`,
    ).toBeGreaterThan(HUD_FOCUS.districtBannerSeconds);
  });
});
