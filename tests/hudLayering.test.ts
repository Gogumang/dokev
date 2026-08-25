import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

/*
 * HUD의 층이 실제로 나뉘어 있는가.
 *
 * 나누기 전에는 컴포넌트 하나가 셋을 다 했다: 공유 가변 객체를 자기 주기로
 * 들여다보고(`setInterval` 스물여섯 개), 무엇을 보여 줄지 판단하고, JSX까지
 * 만들었다. 그래서 「체력을 언제 보여 주는가」·「완주 기록을 언제 굳히는가」
 * 같은 것이 **브라우저를 띄우지 않고는 확인할 수 없는 자리**에 있었고, 실제로
 * 그중 둘은 화면에서 결함으로 발견됐다.
 *
 * 지금 층은 셋이다.
 *
 *   src/game/systems/hud*.ts        기능 — 순수 함수. 시계도 React도 모른다
 *   src/components/hud/*.tsx        연결 — 표본을 떠서 값으로 옮긴다
 *   src/components/hud/views/*.tsx  모양 — 값을 받아 그린다. 그것뿐이다
 *
 * 이 검사가 없으면 층은 일주일이면 무너진다. 급할 때 `useState` 한 줄을 모양
 * 쪽에 넣는 것이 늘 가장 빠른 길이기 때문이다.
 */

/*
 * 주석은 걷어내고 본다. **왜 그렇게 고쳤는지** 적어 둔 글이 코드로 잡히면,
 * 검사가 좋은 기록을 방해하게 된다 — 이 저장소가 이미 다섯 번 겪은 잘못이다.
 */
const views = collectSources("src/components/hud/views").map((path) => ({
  path,
  text: readCode(path),
}));

describe("모양 쪽은 모양만 한다", () => {
  it("훑을 파일이 실제로 있다", () => {
    // 디렉터리 이름이 바뀌면 빈 목록을 훑으며 조용히 통과한다 — 자부터 확인한다
    expect(views.length, `views ${views.length}개`).toBeGreaterThan(3);
  });

  it("상태도 효과도 들지 않는다", () => {
    /*
     * 훅이 하나라도 들어오는 순간 그 컴포넌트는 **언제 무엇을 읽는지**를 알게
     * 되고, 그때부터 화면 없이 검사할 수 없다.
     */
    const offenders: string[] = [];
    for (const { path, text } of views) {
      for (const hook of ["useState", "useEffect", "useRef", "useLayoutEffect", "useReducer"]) {
        if (new RegExp(`\\b${hook}\\s*\\(`).test(text)) offenders.push(`${path}: ${hook}`);
      }
    }
    expect(offenders, `모양 쪽이 상태를 든다:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("스스로 시간을 재지 않는다", () => {
    const offenders: string[] = [];
    for (const { path, text } of views) {
      for (const timer of [
        "setInterval",
        "setTimeout",
        "requestAnimationFrame",
        "performance.now",
        "Date.now",
      ]) {
        if (text.includes(timer)) offenders.push(`${path}: ${timer}`);
      }
    }
    expect(offenders, `모양 쪽이 시계를 읽는다:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("게임 쪽에서 값을 직접 끌어오지 않는다", () => {
    /*
     * 타입은 가져와도 된다 — 모양이 무엇을 받는지 적는 일이라 런타임 의존이
     * 아니다. 함수나 상수를 가져오기 시작하면 **모양이 규칙을 다시 판단하게
     * 되고**, 잇는 쪽과 두 벌이 된다.
     *
     * `src/components` 안에서 가져오는 것은 막지 않는다. 모양이 모양을 부르는
     * 것은 합성이다(`views/ResultPanel`이 `HudButton`을 쓴다).
     */
    const offenders: string[] = [];
    for (const { path } of views) {
      // 주석이 아니라 실제 import 줄을 봐야 하므로 원본을 읽는다
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const match = /^import\s+(type\s+)?([^;]*?)from\s+"(@\/game\/[^"]+)"/.exec(line);
        if (!match) continue;
        const typeOnly = Boolean(match[1]) || /^\s*\{\s*type\s/.test(match[2]);
        if (!typeOnly) offenders.push(`${path}: ${match[3]}`);
      }
    }
    expect(offenders, `모양 쪽이 게임을 실행한다:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("시간을 다루는 곳이 한 군데인가", () => {
  /*
   * 스물여섯 곳에서 각자 주기와 비교와 정리를 정하고 있었다. 그중 비교를
   * 빠뜨린 곳이 있었고, 아무 일도 없는 동안 초당 여덟 번씩 HUD 전체가 다시
   * 그려졌다.
   *
   * 아래 목록은 **표본 뜨기가 아닌** 이유로 타이머를 쓰는 곳이다. 늘어날 때
   * 눈에 띄라고 손으로 적어 둔다.
   */
  const ALLOWED = new Map([
    ["src/components/hud/useSampled.ts", "표본을 뜨는 자리 그 자체"],
    ["src/components/hud/useHeld.ts", "같은 자리 — 표본을 상태에 접는다"],
    ["src/components/hud/useSampledSince.ts", "같은 자리 — 바뀐 뒤 흐른 시간을 잰다"],
    ["src/components/hud/Minimap.tsx", "캔버스를 다시 칠한다 — React 상태가 아니다"],
    ["src/components/hud/CityMapCanvas.tsx", "같은 이유"],
    ["src/components/hud/MenuToggles.tsx", "입력 큐를 비운다 — 읽어서 그리는 일이 아니다"],
    ["src/components/hud/DemoGuide.tsx", "시연 코스의 경과 시간을 센다"],
    ["src/components/hud/SpeedLines.tsx", "속도선을 rAF로 직접 칠한다 — 리렌더를 피한다"],
  ]);

  const hud = collectSources("src/components/hud").map((path) => ({
    path,
    text: readCode(path),
  }));

  it("적어 두지 않은 곳에서 타이머를 걸지 않는다", () => {
    const offenders = hud
      .filter(
        ({ path, text }) => !ALLOWED.has(path) && /setInterval|requestAnimationFrame/.test(text),
      )
      .map(({ path }) => path);

    expect(offenders, `표본을 스스로 뜨는 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("허용 목록이 낡지 않았다", () => {
    // 이유가 사라졌는데 목록에 남아 있으면, 다음 사람은 그 파일이 특별하다고 믿는다
    const stale = [...ALLOWED.keys()].filter((path) => {
      const found = hud.find((file) => file.path === path);
      return !found || !/setInterval|requestAnimationFrame/.test(found.text);
    });

    expect(stale, `타이머가 없는데 목록에 남았다:\n${stale.join("\n")}`).toEqual([]);
  });
});
