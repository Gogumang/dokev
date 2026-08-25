import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { BOSS_HOME } from "@/game/combat/bossSim";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import { CITY, ROAD_CENTERS } from "@/game/world/cityLayout";

/*
 * 구성이 바뀌어도 무너지지 않는가.
 *
 * 도로 좌표 배열에서 인덱스로 꺼내 쓰는 상수들이 있다(보스 자리, 도깨비 자리).
 * 격자 크기를 줄이면 그 인덱스가 범위를 벗어나 `undefined`가 되고, 좌표가
 * NaN이 되어 **오브젝트가 화면에서 사라진다.** 타입은 통과한다 — 배열
 * 인덱싱은 undefined를 반환해도 number로 취급되기 때문이다.
 */

describe("좌표 상수", () => {
  it("보스 자리가 유한한 수다", () => {
    expect(Number.isFinite(BOSS_HOME.x), `x=${BOSS_HOME.x}`).toBe(true);
    expect(Number.isFinite(BOSS_HOME.z), `z=${BOSS_HOME.z}`).toBe(true);
  });

  it("도깨비 자리가 모두 유한한 수다", () => {
    for (const id of DOKEBI_ORDER) {
      const home = DOKEBI[id].home;
      if (!home) continue;
      expect(Number.isFinite(home.x), `${id}.x=${home.x}`).toBe(true);
      expect(Number.isFinite(home.z), `${id}.z=${home.z}`).toBe(true);
    }
  });

  it("도로 좌표 배열이 인덱스를 감당할 만큼 길다", () => {
    /*
     * 지금 쓰는 가장 큰 인덱스는 5다(보스 자리). 격자를 줄이면 여기서 먼저
     * 걸린다 — 화면이 아니라 테스트에서.
     */
    expect(
      ROAD_CENTERS.length,
      `length=${ROAD_CENTERS.length}, grid=${CITY.gridSize}`,
    ).toBeGreaterThan(5);
    for (const value of ROAD_CENTERS) {
      expect(Number.isFinite(value), `road center ${value}`).toBe(true);
    }
  });
});

describe("오류 경계", () => {
  const play = readFileSync("src/app/play/PlayClient.tsx", "utf8");

  it("3D 화면을 경계로 감싼다", () => {
    /*
     * useFrame에서 예외가 나면 React가 트리를 통째로 걷어낸다. 경계가 없으면
     * 빈 페이지가 남고, 사용자는 무슨 일인지도 무엇을 하면 되는지도 모른다.
     */
    expect(play).toContain("SceneErrorBoundary");
  });

  it("오류를 기록으로 남긴다", () => {
    // 이 이벤트가 없으면 사용자가 사라진 이유를 알 수 없다
    expect(play).toContain("scene_error");
  });

  it("경계가 다시 시도할 방법을 준다", () => {
    const boundary = readFileSync("src/components/ErrorBoundary.tsx", "utf8");
    expect(boundary, "새로고침 버튼이 없다").toContain("location.reload");
    expect(boundary, "무엇을 하면 되는지 알려 주지 않는다").toContain("새로고침하면");
  });

  it("오류를 삼키고 계속 돌리지 않는다", () => {
    /*
     * 시뮬레이션이 한 번 깨지면 그 다음 프레임의 상태를 믿을 수 없다.
     * 반쯤 망가진 채로 도는 게임이 멈춘 게임보다 낫다는 보장이 없다.
     */
    const boundary = readFileSync("src/components/ErrorBoundary.tsx", "utf8");
    expect(boundary).toContain("getDerivedStateFromError");
  });
});

describe("라우트 오류 경계", () => {
  const route = readFileSync("src/app/error.tsx", "utf8");
  const global = readFileSync("src/app/global-error.tsx", "utf8");

  it("라우트와 최상위 두 겹이 있다", () => {
    /*
     * `error.tsx`는 레이아웃 **안쪽**에서 난 오류만 잡는다. 레이아웃 자체가
     * 터지면 그것마저 못 뜨므로 `global-error.tsx`가 필요하다.
     */
    expect(route.length).toBeGreaterThan(0);
    expect(global.length).toBeGreaterThan(0);
  });

  it("둘 다 클라이언트 컴포넌트다", () => {
    // 오류 경계는 상태를 갖고 이벤트를 다룬다. 서버 컴포넌트로는 안 된다.
    expect(route.startsWith('"use client"')).toBe(true);
    expect(global.startsWith('"use client"')).toBe(true);
  });

  it("다시 시도할 방법을 준다", () => {
    expect(route).toContain("reset");
    expect(global).toContain("reset");
  });

  it("최상위 경계는 프로젝트 CSS에 기대지 않는다", () => {
    /*
     * 레이아웃이 터진 상황에서는 스타일이 실려 있다는 보장이 없다.
     * 토큰(var(--...))을 쓰면 글자가 배경과 같은 색으로 나올 수 있다.
     */
    expect(global.includes("var(--"), "global-error가 CSS 토큰에 기대고 있다").toBe(false);
    expect(global, "html/body를 직접 그려야 한다").toContain("<html");
  });

  it("오류 원문과 digest를 남긴다", () => {
    // digest는 서버 로그와 대조하는 열쇠다
    expect(route).toContain("error.digest");
    expect(global).toContain("error.digest");
  });

  it("오류 화면에서 또 다른 모듈을 부르지 않는다", () => {
    /*
     * 오류가 난 상황에서 분석 모듈을 불러오다 두 번째 오류가 나면 이 화면조차
     * 못 띄운다. 최상위 경계는 import를 최소로 유지한다.
     */
    const imports = global.match(/^import .*/gm) ?? [];
    expect(imports, `global-error imports: ${imports.join(", ")}`).toEqual([]);
  });
});

describe("상태 갱신 함수는 순수한가", () => {
  /*
   * React는 `setX((current) => ...)`의 갱신 함수를 **렌더 도중에** 실행한다.
   * 그 안에서 설정을 바꾸면 구독자에게 알림이 가고, 렌더 중에 다른 컴포넌트를
   * 갱신하게 된다 — React가 오류를 낸다.
   *
   * 실제로 브라우저에서 포토 모드의 시간대 버튼을 누르자 났다. HUD에 설정을
   * 구독하는 버튼이 생기기 전에는 구독자가 없어 드러나지 않았을 뿐이다.
   */
  const SOURCES = [
    "src/app/play/PlayClient.tsx",
    "src/components/hud/WorldHud.tsx",
    "src/components/title/TitleScreen.tsx",
  ];

  for (const path of SOURCES) {
    it(`${path}의 갱신 함수가 설정을 건드리지 않는다`, () => {
      /*
       * 정규식이 낡으면 빈 목록이 되어 **아무것도 안 보며** 통과한다. 이 셋은
       * 모두 `setX((current) => ...)`를 쓰는 파일로 골라 둔 것이므로, 한 개도
       * 못 찾았다면 훑기가 망가진 것이다.
       */
      let seen = 0;
      /*
       * 주석을 먼저 걷어낸다. 이 버그를 설명하는 주석이 그대로 걸려서
       * 좋은 기록을 지우게 만들었다 — 검사가 기록을 방해하면 검사가 틀린 것이다.
       */
      const source = readCode(path);

      // setTimeout·setInterval의 콜백은 렌더 중에 돌지 않는다 — 대상이 아니다
      const TIMERS = new Set(["setTimeout", "setInterval", "setImmediate"]);
      const updaters = [...source.matchAll(/(set[A-Z]\w*)\(\s*\([^)]*\)\s*=>\s*\{/g)].filter(
        (match) => !TIMERS.has(match[1]),
      );

      seen += updaters.length;
      for (const match of updaters) {
        const start = match.index + match[0].length;
        let depth = 1;
        let end = start;
        while (end < source.length && depth > 0) {
          if (source[end] === "{") depth += 1;
          if (source[end] === "}") depth -= 1;
          end += 1;
        }
        const body = source.slice(start, end);
        expect(seen, `${path}에서 훑은 갱신 함수 ${seen}개`).toBeGreaterThan(0);
        expect(body, `갱신 함수 안에서 설정을 바꾼다:\n${body.trim().slice(0, 160)}`).not.toContain(
          "updateSettings(",
        );
      }
    });
  }
});

describe("오류 화면이 사람을 도와주는가", () => {
  /*
   * 오류 화면은 **문제가 생겼을 때만** 보인다 — 평소에 아무도 열어 보지
   * 않으므로 조용히 나빠진다. 그런데 그때가 사람에게 가장 중요한 순간이다.
   *
   * 셋 다 같은 조건을 지켜야 한다: 무슨 일인지 알리고(제목), 낭독기에도
   * 알리고(alert), 빠져나갈 길을 준다(버튼).
   */
  /*
   * 목록을 손으로 적지 않는다.
   *
   * 셋을 박아 두었더니 「새 오류 화면이 생기면?」이 열린 채였다 — 이번
   * 세션에서 손으로 적은 목록이 하나를 빠뜨리는 것을 여러 번 봤다
   * (README 지점, 터치 파일, 도깨비 검사).
   *
   * 이름으로 찾는다. 처음에는 `role="alert"`을 쓰는 파일도 함께 골랐는데
   * HUD의 그래픽 끊김 안내까지 「오류 화면」으로 잡혔다 — 그건 화면 하나가
   * 아니라 월드 위에 뜨는 알림이라 제목이나 본문 랜드마크를 가질 이유가 없다.
   */
  const SCREENS: Array<readonly [string, string]> = collectSources("src")
    .filter((path) => /error/i.test(path))
    .map((path) => [path.split("/").pop() ?? path, path] as const);

  /*
   * WebGL 미지원 화면은 오류가 아니라 「이 기기로는 안 된다」는 안내다.
   * `role="alert"`을 요구하지 않는 대신, 빠져나갈 길은 같은 기준으로 본다.
   */
  const NOTICE = "src/app/play/PlayClient.tsx";

  it("오류 화면을 실제로 찾았다", () => {
    // 찾기가 실패하면 빈 목록을 훑으며 「전부 통과」가 된다
    expect(SCREENS.length, `찾은 화면 ${SCREENS.length}개`).toBeGreaterThanOrEqual(3);
  });

  for (const [name, path] of SCREENS) {
    it(`${name} 화면이 세 가지를 갖춘다`, () => {
      const source = readCode(path);
      expect(source, `${name}: 무슨 일인지 알리는 제목이 없다`).toMatch(/<h1[\s>]/);
      expect(source, `${name}: 낭독기에 알리지 않는다`).toContain('role="alert"');
      expect(source, `${name}: 빠져나갈 길이 없다`).toContain("<button");
    });
  }

  it("복구 버튼에 이름이 있다", () => {
    /*
     * 아이콘만 있거나 이름이 없으면 낭독기에는 「버튼」으로만 들린다 —
     * 무엇을 누르는지 모르는 채 오류 화면에 갇힌다.
     */
    for (const [name, path] of SCREENS) {
      const source = readCode(path);
      const buttons = (source.match(/<button/g) ?? []).length;
      const named = (source.match(/aria-label=|>\s*[가-힣]/g) ?? []).length;
      expect(
        named,
        `${name}: 버튼 ${buttons}개인데 이름 있는 것이 ${named}개`,
      ).toBeGreaterThanOrEqual(buttons);
    }
  });

  it("WebGL 미지원 화면도 새로고침을 준다", () => {
    /*
     * 「랜딩으로 돌아가기」뿐이었다. 그런데 WebGL은 일시적으로도 죽는다
     * (GPU 프로세스가 내려가는 경우) — 그때는 새로고침 한 번이면 열리는데,
     * 그 길이 없어 되돌아가는 수밖에 없었다.
     */
    const source = readCode(NOTICE);
    const panel = source.slice(source.indexOf("function UnsupportedPanel"));
    const body = panel.slice(0, panel.indexOf("\n}"));
    expect(body, "새로고침 수단이 없다").toContain("location.reload()");
    expect(body, "돌아갈 길이 없다").toContain("onExit");
  });

  it("오류 내용을 그대로 쏟아내지 않는다", () => {
    /*
     * 스택 전체를 화면에 뿌리면 사람은 무엇을 해야 할지 모르고, 내부 구조만
     * 드러난다. digest 같은 짧은 식별자까지가 적당하다.
     */
    for (const [name, path] of SCREENS) {
      const source = readCode(path);
      expect(source, `${name}: 스택을 화면에 뿌린다`).not.toContain("error.stack");
    }
  });
});
