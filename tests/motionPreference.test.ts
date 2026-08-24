import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MINIMAP } from "@/game/systems/minimap";

import { prefersReducedMotion } from "@/game/systems/motionPreference";
import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";

/*
 * 저감 모션은 신호가 둘이라 조합에서 사고가 났다 — 운영체제 설정이 바뀌는
 * 순간 게임에서 켜 둔 저감 모션이 조용히 풀렸다. 조합 규칙을 못 박아 둔다.
 */

describe("저감 모션 판단", () => {
  it("어느 쪽이든 줄여 달라면 줄인다", () => {
    expect(prefersReducedMotion(true, false), "게임 설정만 켠 경우").toBe(true);
    expect(prefersReducedMotion(false, true), "운영체제 설정만 켠 경우").toBe(true);
    expect(prefersReducedMotion(true, true)).toBe(true);
  });

  it("둘 다 아니라면 줄이지 않는다", () => {
    expect(prefersReducedMotion(false, false)).toBe(false);
  });
});

describe("플레이 중 반영", () => {
  const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");

  it("운영체제 신호만 그대로 넣지 않는다", () => {
    /*
     * `setReducedMotion(motionQuery.matches)`가 사고의 원인이었다. 게임 설정을
     * 빼고 덮어쓰기 때문이다. 다시 들어오면 걸린다.
     */
    expect(client, "게임 설정을 무시하고 덮어쓴다").not.toMatch(
      /setReducedMotion\(\s*motionQuery\.matches\s*\)/,
    );
    expect(client).toContain("prefersReducedMotion(");
  });

  it("설정 변경도 구독한다", () => {
    // 구독이 없으면 HUD 토글을 눌러도 다음 판까지 반영되지 않는다
    expect(client).toContain("subscribeSettings(sync)");
  });
});

describe("HUD 버튼 줄이 화면 안에 들어오는가", () => {
  /*
   * 브라우저에서 직접 재 봤다. 버튼 하나가 58~71px이고, 우상단 일곱 개가
   * 간격까지 **480px**다. 폰 가로 폭에서 안전 영역을 빼면 328px이므로
   * 150px이 화면 밖으로 밀려 **아예 누를 수 없었다.** 중앙 정렬인 포토 모드
   * 줄(6개)은 양쪽이 동시에 잘렸다.
   *
   * 고친 뒤 328px로 좁혀 재현하니 4개+3개 두 줄로 접혔다. 버튼이 늘어날 때
   * 다시 걸리도록 규칙으로 남긴다.
   */
  const MAX_BUTTONS_IN_ONE_ROW = 4;

  /*
   * HUD 폴더 전체를 훑는다.
   *
   * 파일 두 개를 손으로 적어 두었더니, 우상단 버튼 묶음이 `TouchMenu`로
   * 옮겨 간 순간 훑을 줄이 하나도 안 남아 검사가 헛돌았다 — 규칙이 지켜져서가
   * 아니라 보고 있지 않아서였다.
   */
  const sources = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join("src/components/hud", name));

  /*
   * 훑을 것이 실제로 있는지 먼저 본다.
   *
   * 아래 검사는 **버튼이 넷을 넘는 줄에만** 생긴다. 우상단 메뉴를 걷어내자
   * 그런 줄이 하나도 남지 않아 스위트가 통째로 비었고, vitest가 "테스트 없음"
   * 으로 실패했다 — 규칙이 지켜져서가 아니라 볼 것이 없어져서다. 훑기 자체가
   * 헛돌지 않는지 여기서 고정한다.
   */
  it("가로로 늘어놓는 줄을 실제로 찾았다", () => {
    const found = sources.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return source.split(/<div\s/).filter((chunk) => {
        const attributes = chunk.slice(0, chunk.indexOf(">"));
        return (
          attributes.includes("absolute") &&
          /\bflex\b/.test(attributes) &&
          !attributes.includes("flex-col")
        );
      });
    });
    expect(found.length, `가로 줄 ${found.length}개`).toBeGreaterThan(0);
  });

  for (const path of sources) {
    const source = readFileSync(path, "utf8");
    // 가로로 늘어놓는 컨테이너만 본다 — 세로(flex-col)나 격자는 대상이 아니다
    const rows = source.split(/<div\s/).filter((chunk) => {
      const attributes = chunk.slice(0, chunk.indexOf(">"));
      return (
        attributes.includes("absolute") &&
        /\bflex\b/.test(attributes) &&
        !attributes.includes("flex-col")
      );
    });

    for (const [index, row] of rows.entries()) {
      const body = row.slice(0, row.indexOf("</div>"));
      const buttons = body.match(/<(HudButton|SoundToggle|MotionToggle|button\b)/g) ?? [];
      if (buttons.length <= MAX_BUTTONS_IN_ONE_ROW) continue;

      it(`${path} ${index}번째 줄의 버튼이 폰 화면 두 줄 안에 들어간다`, () => {
        /*
         * 실측: 버튼 하나가 58~71px, 폰에서 쓸 수 있는 폭은 328px. 한 줄에
         * 넷이 들어가므로 여덟 개까지가 두 줄이다.
         *
         * 두 줄을 넘기면 월드 위를 덮는 면적이 커진다 — HUD는 세계를 가리지
         * 않는 것이 원칙이다(DESIGN_GUIDE 「2.1 세계가 먼저, UI는 나중에」).
         * 더 필요하면 버튼을 늘릴 것이 아니라 묶어야 한다.
         */
        expect(buttons.length, `버튼 ${buttons.length}개 — 세 줄이 된다`).toBeLessThanOrEqual(8);
      });

      it(`${path} ${index}번째 줄(버튼 ${buttons.length}개)이 줄바꿈된다`, () => {
        const attributes = row.slice(0, row.indexOf(">"));
        expect(attributes, `버튼 ${buttons.length}개가 한 줄에 있다`).toContain("flex-wrap");
        expect(attributes, "폭 상한이 없으면 줄바꿈이 일어나지 않는다").toMatch(/max-w-\[/);
      });
    }
  }
});

describe("저장 안내가 사실인가", () => {
  /*
   * "진행 상황은 저장되지 않습니다"가 랜딩에 그대로 남아 있었다. 저장은 이미
   * 동작하고 있었으니 명백한 거짓이었고, 100번의 반복 동안 아무 테스트도
   * 걸러 내지 못했다 — 아무도 화면을 읽지 않았기 때문이다.
   */
  const title = readFileSync("src/components/title/TitleScreen.tsx", "utf8");
  const save = readFileSync("src/game/systems/saveGame.ts", "utf8");

  it("저장 기능이 있는 한 저장되지 않는다고 말하지 않는다", () => {
    const persists = save.includes("localStorage.setItem");
    expect(persists, "저장 구현이 사라졌다면 안내도 함께 고쳐야 한다").toBe(true);
    expect(title, "랜딩이 저장을 부정한다").not.toContain("저장되지 않습니다.");
  });

  it("저장되지 않는 것도 함께 밝힌다", () => {
    // 저장된다고만 하면 위치까지 이어질 것으로 기대하게 된다
    expect(title).toContain("저장되지 않아");
  });
});

describe("성능 패널이 보스 상태를 보여 준다", () => {
  /*
   * 브라우저에서 보스가 다가오지 않는 것을 40초간 보고도 원인을 못 찾았다.
   * 눈에 보이는 것이 "안 움직인다"뿐이라 매번 계측을 새로 붙여야 했다.
   * 거리와 단계가 보이면 인지 범위 밖인지, 쫓다 멈춘 것인지 즉시 갈린다.
   */
  const hud = readFileSync("src/components/hud/PerfPanel.tsx", "utf8");

  it("거리와 단계를 함께 띄운다", () => {
    expect(hud).toContain("bossDistance");
    expect(hud).toContain("bossPhase");
  });

  it("재기 전에는 0을 보여 주지 않는다", () => {
    /*
     * 「FPS 0 · 드로우콜 0 · 삼각형 0」을 띄우는 것을 보고 렌더 루프가 죽은 줄
     * 알고 한참을 뒤졌다 — 화면은 멀쩡히 그려지고 있었고, 그냥 아직 첫 계측
     * 주기(0.5초)가 안 돈 것이었다. 패널이 보이는 동안 FPS가 진짜 0일 수는 없다.
     */
    expect(hud).toContain("아직 재는 중");
    expect(hud).toContain("snapshot.fps > 0");
  });

  it("보스를 만나기 전에는 거리를 지어내지 않는다", () => {
    // 0m로 표시하면 바로 앞에 있는 것으로 읽힌다
    expect(hud).toContain("Number.isFinite(snapshot.bossDistance)");
  });
});

describe("전체 지도가 읽히는가", () => {
  /*
   * `clearRect`로 지우면 캔버스가 **투명하게** 남는다. 그 위에 알파 0.14~0.30
   * 구역 색만 얹으니 뒤의 3D 월드가 그대로 비쳐, 지도 위로 캐릭터와 간판이
   * 보였다 — 열어 보고서야 알았다.
   */
  const raw = readFileSync("src/components/hud/CityMap.tsx", "utf8");
  // 주석은 걷어낸다 — 왜 이렇게 고쳤는지 적어 둔 문장까지 걸리면 기록을 못 남긴다
  const map = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("바탕을 불투명하게 칠한다", () => {
    expect(map, "투명하게 지우면 뒤가 비친다").not.toContain("clearRect");
    expect(map).toContain("MAP_BACKGROUND");
  });

  it("바탕색이 반투명이 아니다", () => {
    const match = raw.match(/const MAP_BACKGROUND = "([^"]+)"/);
    expect(match, "바탕색 상수가 없다").not.toBeNull();
    expect(match?.[1], `바탕색 ${match?.[1]}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("구역 색은 반투명이라 바탕이 필요하다", () => {
    // 이 알파값들이 불투명해지면 바탕 규칙의 근거가 사라진다 — 함께 봐야 한다
    expect(raw).toMatch(/rgba\(\d+, ?\d+, ?\d+, ?0\.\d+\)/);
  });
});

describe("완주 화면이 다음 할 일을 알려 주는가", () => {
  /*
   * 걸린 시간·최고 속도·멈춘 로봇만 보여 주었다. 수집이 4종 루프가 된 뒤에도
   * **남은 도깨비가 있다는 사실을 마지막 화면이 말해 주지 않았다** — 거기서
   * 모르면 게임을 닫는다.
   */
  const panels = readFileSync("src/components/hud/StatusPanels.tsx", "utf8");

  it("두 번째 완주에도 화면이 뜬다", () => {
    /*
     * 「계속 탐험」을 누르면 닫힘 표시가 켜진 채 **다시 꺼지지 않았다** —
     * 첫 여정을 그렇게 닫은 사람에게는 보스를 눕힌 뒤의 완주 화면이 영영
     * 뜨지 않았다. 게임에서 가장 큰 순간의 보상이 통째로 사라진 셈이다.
     *
     * 여정이 끝나지 않은 동안(다음 여정 진행 중)에 되돌린다.
     */
    expect(panels, "닫힘 표시가 다시 꺼지지 않는다").toContain("setDismissed(false)");
    const at = panels.indexOf("setDismissed(false)");
    const before = panels.slice(Math.max(0, at - 200), at);
    expect(before, "완주 중에 닫힘을 되돌린다").toContain("if (!questView.completed)");
  });

  it("완주한 순간의 값을 굳힌다", () => {
    /*
     * 완주한 뒤에도 계속 다시 담고 있었다 — 「걸린 시간」이 화면을 보는 동안
     * 계속 올라가 **기록이 아니라 시계**가 됐고, 최고 속도·처치 수에도 그
     * 뒤에 놀면서 바뀐 값이 섞였다.
     *
     * 낭독기에도 아프다: 숫자가 계속 바뀌는 `aria-live` 영역은 끝없이 읽힌다.
     */
    expect(panels, "완주 뒤에도 값을 다시 담는다").toContain("!captured.current");
    expect(panels).toContain("captured.current = true");
    // 다음 완주를 위해 되돌리기도 해야 한다 — 안 그러면 두 번째에 첫 숫자가 뜬다
    expect(panels, "기록을 되돌리지 않아 두 번째 완주에 첫 숫자가 뜬다").toContain(
      "captured.current = false",
    );
  });

  it("만난 도깨비 수를 보여 준다", () => {
    expect(panels).toContain("만난 도깨비");
    /*
     * 분모는 **찾아갈 수 있는 수**다. 전체 수(`DOKEBI_ORDER.length`)로 세던
     * 때는 초롱이 만남 목록에 영영 안 들어가서 다 모아도 3/4에 멈췄다 —
     * 「남은 하나를 알려 주려고」 넣은 숫자가 반대로 거짓말을 했다.
     *
     * 박아 두지 말라는 원래 의도는 그대로다. 정본만 바뀐다.
     */
    expect(panels, "총 수를 박아 두면 도깨비가 늘 때 거짓이 된다").toContain(
      "FINDABLE_DOKEBI.length",
    );
  });

  it("완주하면 목표 패널이 비켜난다", () => {
    /*
     * 완주 화면이 「골목이 조용해졌다」를 가운데에 크게 띄우는데 좌상단
     * 목표 패널도 같은 문장을 보여 주고 있었다 — **한 화면에 같은 말이 두 번**
     * 있었다. 완주 화면을 처음 열어 보고 알았다.
     */
    expect(panels).toContain("if (snapshot.completed) return null;");
  });

  it("숫자 칸이 좁은 화면에서 접히지 않는다", () => {
    // 넷을 한 줄에 넣으면 좁은 화면에서 숫자가 접힌다
    const grid = panels.slice(panels.indexOf("걸린 시간") - 400, panels.indexOf("걸린 시간"));
    expect(grid, "네 칸을 한 줄에 넣었다").not.toContain("grid-cols-4");
  });
});

describe("같은 설정을 같은 이름으로 부르는가", () => {
  /*
   * 시작 화면은 「모션 줄이기」, 월드 HUD는 「흔들림」이었다. 같은 값을 다른
   * 이름으로 부르면 설정을 켜 둔 사람이 월드에서 그 버튼을 알아보지 못한다.
   */
  const title = readFileSync("src/components/title/TitleScreen.tsx", "utf8");
  const hud = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => readFileSync(join("src/components/hud", name), "utf8"))
    .join("\n");

  /*
   * 시작 화면에서 설정 패널을 들어냈다(주 행동 하나만 남기기로 했다). 그래서
   * **두 화면을 맞대는 검사가 성립하지 않는다** — 한 화면밖에 없다.
   *
   * 지우지 않고 방향을 바꾼다. 원래 지키려던 것은 「이름이 갈리지 않는가」가
   * 아니라 그 뒤의 것, **「설정에 닿을 수 있는가」**였다. 시작 화면이 빠진
   * 지금은 월드 HUD가 유일한 자리이므로 거기에 있는지를 본다. 사라지면
   * 저감 모션을 켠 사람이 끌 방법이 없어진다.
   */
  it("저감 모션은 월드 HUD에서 바꿀 수 있다", () => {
    expect(title, "시작 화면에 설정이 되살아났다면 두 화면 대조를 되살려라").not.toContain(
      'id="nickname"',
    );
    expect(hud, "월드 HUD에 모션 설정이 없다 — 켠 사람이 끌 곳이 없다").toMatch(/모션/);
  });

  it("소리도 월드 HUD에서 바꿀 수 있다", () => {
    /*
     * 이름이 「사운드」↔「소리」로 갈려 있던 적이 있다. 지금은 화면이 하나뿐이라
     * 갈릴 데가 없지만, **끌 수 있어야 한다**는 쪽은 그대로 지킨다.
     */
    expect(hud, "월드 HUD에 소리 설정이 없다").toMatch(/소리|사운드/);
  });
});

describe("위쪽 가운데가 겹치지 않는가", () => {
  /*
   * 보스 체력 막대(+96)와 구역 배너(+152)가 각자 좌표를 들고 있었고 간격은
   * 손으로 맞춘 값이었다. 좌상단 목표 패널은 좁은 화면에서 폭이 70vw까지
   * 늘어나 가운데까지 닿으므로, 시작 위치만 그 아래(+96)에 두면 된다.
   */
  it("쌓이는 요소가 스스로 좌표를 잡지 않는다", () => {
    /*
     * 파일 둘을 손으로 적어 두었었다 — `CaptureNotice`가 컨테이너 안에서
     * 떠 있던 것을 놓친 목록과 같은 종류다(반복 329·330).
     *
     * 쌓이는 컴포넌트를 `WorldHud`에서 읽어 전부 본다. 컴포넌트는 자기
     * 파일에 있을 수도, `WorldHud` 안에 있을 수도 있어 둘 다 찾는다.
     */
    const offenders: string[] = [];
    for (const name of stackedComponents()) {
      const source = definitionOf(name);
      if (!source) continue;
      const own = /(top|bottom|left|right):\s*"[^"]*var\(--safe/.exec(source);
      if (own) offenders.push(`${name}: ${own[1]}을 스스로 잡는다`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("한 컨테이너가 셋을 쌓는다", () => {
    /*
     * 이름 셋은 **의도한 배치**다(좌하단에 속도·체력·미니맵). 목록이 낡는
     * 종류가 아니라, 누가 하나를 컨테이너 밖으로 옮기는 것을 막는 검사다.
     *
     * 다만 본문을 「첫 `</div>`까지」로 자르고 있었다. 자식이 전부 자기닫음
     * 태그라 지금은 맞지만, 하나라도 `<div>`로 감싸면 본문이 거기서 끊겨
     * 뒤의 둘이 「밖에 있다」고 **거짓 실패**한다 — 확인해 보니 실제로
     * `HealthPanel`부터 안 보인다. 조용히 통과하는 쪽은 아니지만, 멀쩡한
     * 변경을 막는 검사는 결국 지워진다. 깊이로 자른다.
     */
    const body = containerBody("flex-col-reverse items-start");
    for (const name of ["SpeedReadout", "HealthPanel", "Minimap"]) {
      expect(body, `${name}이 컨테이너 밖에 있다`).toContain(`<${name}`);
    }
  });

  it("미니맵 크기가 커져도 간격이 따라온다", () => {
    // 컨테이너가 쌓으므로 크기 상한이 더는 필요 없다 — 다만 화면을 덮지는 않아야 한다
    expect(MINIMAP.sizePx, `미니맵 ${MINIMAP.sizePx}px`).toBeLessThan(240);
  });
});

describe("자리가 드러난 것을 알려 주는가", () => {
  /*
   * 조건을 채워도 **아무도 말해 주지 않았다.** 보스를 눕혀도, 로봇 열두 기를
   * 잡아도, 지도를 직접 열어 보기 전에는 새 자리가 생긴 줄 모른다 —
   * 보상이 있는데 보상이 있다는 사실이 전달되지 않았다.
   */
  const notice = readFileSync("src/components/hud/ShrineNotice.tsx", "utf8");

  it("만나기 전 단계를 알린다", () => {
    expect(notice).toContain("pendingDiscoveries");
    expect(notice).toContain("찾아갈 자리가 생겼다");
  });

  it("이름을 미리 밝히지 않는다", () => {
    /*
     * 아직 만나지 않은 도깨비다. 찾아가는 것이 그 자체로 놀이인데 이름을
     * 먼저 말하면 도착이 확인 절차가 된다.
     */
    // 넷을 손으로 적어 두었었다 — 다섯 번째 도깨비의 이름은 검사되지 않는다
    for (const id of DOKEBI_ORDER) {
      expect(notice, `${DOKEBI[id].name}을 미리 밝힌다`).not.toContain(DOKEBI[id].name);
    }
    expect(notice, "이름을 값으로 꺼내 쓴다").not.toContain("spirit.name");
  });

  it("이어서 하는 판에서 옛 자리를 새 것처럼 알리지 않는다", () => {
    // 첫 확인은 건너뛰어야 한다 — 안 그러면 들어갈 때마다 알림이 뜬다
    expect(notice).toContain("known.current === null");
  });

  it("알림이 스스로 자리를 잡지 않는다", () => {
    /*
     * 네 알림이 각자 절대 좌표를 들고 있었다 — 자판기 안내(+168)와 자리
     * 알림(+208)이 실제로 겹쳤고, 새 알림을 넣을 때마다 남은 틈을 찾아야 했다.
     * 이번 세션에서 HUD 겹침이 네 번 나왔고 전부 같은 원인이다.
     *
     * 이제 하단 중앙 컨테이너가 쌓는다. 알림이 다시 좌표를 들면 그 순간
     * 겹침이 돌아온다.
     */
    for (const path of [
      "src/components/hud/ShrineNotice.tsx",
      "src/components/hud/Notices.tsx",
    ]) {
      const source = readCode(path);
      const centered = source.match(/absolute left-1\/2 -translate-x-1\/2/g) ?? [];
      // Notices에는 위쪽 구역 배너가 하나 남아 있다
      expect(centered.length, `${path}에 스스로 자리 잡는 알림이 ${centered.length}개`).toBeLessThan(2);
    }
  });

  it("하단 중앙 알림을 한 컨테이너가 쌓는다", () => {
    // 좌하단 컨테이너도 flex-col-reverse를 쓴다 — 가운데 정렬로 구분한다
    const body = containerBody("flex-col-reverse items-center");
    for (const name of ["CaptureNotice", "UnlockNotice", "VendingPrompt", "ShrineNotice"]) {
      expect(body, `${name}이 컨테이너 밖에 있다`).toContain(`<${name}`);
    }
  });

  it("HUD에 실제로 달려 있다", () => {
    // 만들어만 두고 안 걸면 아무 일도 일어나지 않는다
    const hud = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => readFileSync(join("src/components/hud", name), "utf8"))
    .join("\n");
    expect(hud).toContain("<ShrineNotice");
  });
});

describe("우상단 패널이 포개지지 않는가", () => {
  /*
   * 도감과 성능 패널이 **완전히 같은 자리**(top +56px, right)에 있었다.
   * 둘 다 버튼으로 켜므로 함께 열면 정확히 포개진다 — 브라우저에서 재 보니
   * 고친 뒤에는 성능 72~96, 도감 104~596으로 나뉜다.
   *
   * 하단 알림과 같은 원인이라 같은 방식으로 고쳤다: 컨테이너가 쌓는다.
   */
  it("패널이 스스로 자리를 잡지 않는다", () => {
    for (const path of ["src/components/hud/Codex.tsx", "src/components/hud/PerfPanel.tsx"]) {
      const source = readCode(path);
      expect(source, `${path}가 스스로 위치를 잡는다`).not.toContain('top: "calc(var(--safe-top)');
    }
  });

  it("한 컨테이너가 둘을 쌓는다", () => {
    const hud = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => readFileSync(join("src/components/hud", name), "utf8"))
    .join("\n");
    const stack = hud.slice(hud.indexOf("flex flex-col items-end"));
    const body = stack.slice(0, stack.indexOf("</div>"));
    expect(body).toContain("<PerfPanel");
    expect(body).toContain("<Codex");
  });
});

describe("HUD 네 구역이 모두 컨테이너를 쓰는가", () => {
  /*
   * 겹침이 여섯 번 나왔고 전부 같은 원인이었다 — 요소가 각자 절대 좌표를 들고,
   * 새 요소를 넣을 때마다 남은 틈을 찾는 구조.
   *
   * 네 구역을 컨테이너로 바꿨으니, 다섯 번째 구역이 생기거나 누가 예전 방식으로
   * 되돌리면 여기서 걸린다.
   */
  const hud = readdirSync("src/components/hud")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => readFileSync(join("src/components/hud", name), "utf8"))
    .join("\n");

  it("네 구역이 모두 쌓는 컨테이너다", () => {
    const stacks = [
      ["위쪽 가운데", "flex-col items-center"],
      ["우상단", "flex flex-col items-end"],
      ["하단 가운데", "flex-col-reverse items-center"],
      ["좌하단", "flex-col-reverse items-start"],
    ] as const;

    for (const [name, marker] of stacks) {
      expect(hud, `${name} 컨테이너가 없다`).toContain(marker);
    }
  });

  it("쌓이는 요소가 스스로 자리를 잡지 않는다", () => {
    /*
     * 컨테이너 안에 있으면서 absolute를 들고 있으면 컨테이너를 무시하고
     * 예전처럼 떠 버린다 — 구조만 바뀌고 문제는 남는다.
     *
     * 예전에는 파일 넷을 손으로 적어 두었고, **그 넷은 원래 문제가 없던
     * 파일들이었다.** 정작 컨테이너 안에서 떠 있던 `CaptureNotice`는 목록에
     * 없어서 통과했다(자판기 앞에서 사진을 찍으면 자판기 안내와 겹친다).
     *
     * 「어떤 파일을 볼 것인가」를 `WorldHud`의 컨테이너에서 **직접 읽는다.**
     */
    const stacked = stackedComponents();
    expect(stacked.length, `컨테이너 안에서 찾은 것 ${stacked.length}개`).toBeGreaterThan(5);

    const floating = stacked.filter((name) => {
      const path = `src/components/hud/${name}.tsx`;
      return existsSync(path) && /className="[^"]*\babsolute\b/.test(readCode(path));
    });
    expect(floating, `컨테이너 안인데 스스로 뜬다: ${floating.join(", ")}`).toEqual([]);
  });
});


/**
 * 쌓는 컨테이너 안에 놓인 컴포넌트 이름들.
 *
 * 목록을 손으로 적지 않기 위한 것이다 — 새 알림을 하나 넣으면 그 순간부터
 * 같은 규칙을 받는다. 본문 경계는 `stackContainers()`가 `</div>` 깊이로
 * 정확히 잘라 준다(예전의 「다음 컨테이너까지」는 뒤 JSX를 끌어왔다).
 */
/**
 * 컴포넌트 하나의 정의를 찾아 그 **본문만** 돌려준다.
 *
 * 자기 파일에 있으면 그 파일을, `WorldHud` 안에 있으면 다음 최상위 함수
 * 선언 전까지를 자른다. 넉넉히 잘랐다가 옆 함수를 끌어와 멀쩡한 것을
 * 결함으로 본 적이 있다 — `SpeedReadout`을 보다가 `KeyboardHints`(독립
 * 배치라 정상)의 좌표를 읽었다.
 */
function definitionOf(name: string): string | null {
  const path = `src/components/hud/${name}.tsx`;
  if (existsSync(path)) return readCode(path);

  const hud = readCode("src/components/hud/WorldHud.tsx");
  const at = hud.search(new RegExp(`^function ${name}\\(`, "m"));
  if (at < 0) return null;

  const rest = hud.slice(at + 1);
  const next = rest.search(/^function \w+\(/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** 마커로 컨테이너 하나를 골라 그 본문을 돌려준다 (짝 맞는 `</div>`까지) */
function containerBody(marker: string): string {
  const found = stackContainers().find((container) => container.className.includes(marker));
  expect(found, `컨테이너를 찾지 못했다: ${marker}`).toBeDefined();
  return found?.body ?? "";
}

function stackedComponents(): string[] {
  const names = new Set<string>();
  for (const container of stackContainers()) {
    for (const tag of container.body.matchAll(/<([A-Z]\w+)/g)) names.add(tag[1]);
  }
  return [...names];
}

/** 쌓는 컨테이너 하나 — 여는 className과 그 안의 본문 */
interface StackContainer {
  marker: string;
  className: string;
  body: string;
}

/**
 * 여는 `<div` 하나의 본문을 짝이 맞는 `</div>`까지 잘라 낸다.
 *
 * 처음엔 「다음 컨테이너가 나올 때까지」로 잘랐는데, 그러면 **컨테이너가
 * 끝난 뒤의 JSX까지 딸려 들어온다** — 실제로 알림 컨테이너 안에 버튼이
 * 있다고 잘못 보고했다. 깊이를 세는 편이 짧고 정확하다.
 */
function bodyOf(source: string, openTagAt: number): string {
  const start = source.indexOf(">", openTagAt) + 1;
  let depth = 1;
  let cursor = start;

  while (depth > 0 && cursor < source.length) {
    const open = source.indexOf("<div", cursor);
    const close = source.indexOf("</div>", cursor);
    if (close < 0) break;

    if (open >= 0 && open < close) {
      depth += 1;
      cursor = open + 4;
    } else {
      depth -= 1;
      if (depth === 0) return source.slice(start, close);
      cursor = close + 6;
    }
  }
  return source.slice(start, cursor);
}

/**
 * `WorldHud`의 쌓는 컨테이너를 전부 찾는다.
 *
 * 이름을 손으로 적지 않기 위한 것이다 — 구역을 하나 더 만들면 그 순간부터
 * 같은 규칙을 받는다.
 */
function stackContainers(): StackContainer[] {
  const hud = readCode("src/components/hud/WorldHud.tsx");
  const opener = /className="([^"]*\bflex-col(?:-reverse)?\b[^"]*)"/g;

  return [...hud.matchAll(opener)].map((match) => ({
    // 실패 메시지에서 어느 컨테이너인지 알아볼 수 있어야 한다
    marker: match[1]
      .split(/\s+/)
      .filter((word) => word.startsWith("flex") || word.startsWith("items"))
      .join(" "),
    className: match[1],
    body: bodyOf(hud, match.index),
  }));
}

/**
 * 이 컨테이너 안에 누를 것이 있는가.
 *
 * 본문에 `<button`이 직접 없어도, **자식 컴포넌트가 버튼을 품고 있으면**
 * 누를 것이 있는 것이다 — 우상단 컨테이너에는 도감이 들어가고 도감 안에
 * 버튼이 넷 있다. 자식 파일까지 한 단계 들어가서 본다.
 */
function hasClickable(body: string): boolean {
  if (/<(button|HudButton)\b/.test(body)) return true;

  for (const tag of body.matchAll(/<([A-Z]\w+)/g)) {
    const path = `src/components/hud/${tag[1]}.tsx`;
    if (existsSync(path) && /<button\b/.test(readCode(path))) return true;
  }
  return false;
}

describe("컨테이너가 클릭을 막지 않는가", () => {
  /*
   * HUD를 컨테이너로 묶으면서 새 위험이 생겼다 — 컨테이너가 `pointer-events-none`
   * 없이 화면을 덮으면 뒤가 안 눌리고, 반대로 **버튼을 담은 컨테이너에 그것을
   * 붙이면 버튼이 통째로 죽는다.** 둘 다 조용히 일어난다.
   *
   * 도감은 안에 버튼이 넷 있다(도깨비 선택·닫기). 브라우저에서 실제로 눌러
   * 닫히는 것을 확인했다.
   */
  it("컨테이너를 실제로 찾았다", () => {
    expect(stackContainers().length, `찾은 컨테이너 ${stackContainers().length}개`).toBeGreaterThan(3);
  });

  it("버튼이 있으면 통과시키고 없으면 가로채지 않는다", () => {
    /*
     * 마커 셋을 손으로 적어 두었었다 — 구역이 넷인데 셋만 보고 있었고,
     * 새 구역을 만들면 그 구역은 아무 규칙도 받지 않는다.
     *
     * 규칙 자체는 컨테이너 내용에서 나온다: **누를 것이 있으면 통과시켜야
     * 하고, 없으면 뒤를 막지 말아야 한다.** 둘 다 화면에는 단서가 없다.
     */
    const wrong: string[] = [];
    for (const container of stackContainers()) {
      const clickable = hasClickable(container.body);
      const blocks = !container.className.includes("pointer-events-none");

      if (clickable && !blocks) wrong.push(`${container.marker}: 버튼이 있는데 클릭을 통과시킨다`);
      if (!clickable && blocks) wrong.push(`${container.marker}: 누를 것이 없는데 뒤를 막는다`);
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });
});

describe("좌상단이 겹치지 않는가", () => {
  /*
   * 이 모서리에는 목표 패널(위 끝, 높이 약 76px)과 말풍선들이 있다.
   *
   * 말풍선이 동료 대사 하나뿐일 때는 각자 좌표를 써도 됐다. 주민·간판 대사가
   * 들어오면서 둘이 됐고, 오늘은 6px 차이로 안 겹쳤지만 동료 대사가 좁은
   * 화면에서 한 줄 더 늘어나면 곧바로 밑을 덮는다 — 좌표를 손으로 맞추다
   * 여섯 번 겹쳤던 그 방식이다. 이제 컨테이너가 쌓는다.
   */
  const QUEST_PANEL_HEIGHT = 76;

  it("말풍선이 스스로 자리를 잡지 않는다", () => {
    /*
     * 원본을 읽는다. 좌표는 주석으로도 적히므로(왜 그 값인지 남기려고)
     * 주석을 걷어낸 것으로 보는 편이 맞지만, 여기서는 **주석에 좌표를 적어
     * 두면 오히려 걸려야** 한다 — 스스로 자리를 잡지 말라는 규칙이다.
     */
    const notices = readFileSync("src/components/hud/Notices.tsx", "utf8");
    for (const name of ["CompanionSpeech", "ResidentSpeech"]) {
      const start = notices.indexOf(`export function ${name}`);
      expect(start, `${name}을 못 찾았다`).toBeGreaterThan(-1);

      /*
       * 다음 함수 앞까지 자른다. `\n}`를 끝으로 삼았더니 **props 타입의 닫는
       * 괄호**에서 끊겨 JSX를 아예 안 봤다 — 좌표를 박아도 통과했다.
       */
      const next = notices.indexOf("\nexport function", start + 1);
      const own = notices.slice(start, next > -1 ? next : notices.length);
      expect(own.includes("return ("), `${name}의 JSX를 못 읽었다`).toBe(true);
      expect(own, `${name}이 스스로 자리를 잡는다`).not.toContain("--safe-top");
    }
  });

  it("한 컨테이너가 말풍선을 쌓는다", () => {
    const hud = readCode("src/components/hud/WorldHud.tsx");
    const stack = hud.slice(hud.indexOf("flex flex-col gap-[var(--space-2)]"));
    const body = stack.slice(0, stack.indexOf("</div>"));
    expect(body, "동료 대사가 더미에 없다").toContain("<CompanionSpeech");
    expect(body, "주민 대사가 더미에 없다").toContain("<ResidentSpeech");
  });

  it("말풍선 더미가 목표 패널 아래에서 시작한다", () => {
    const hud = readCode("src/components/hud/WorldHud.tsx");
    const stack = hud.slice(hud.indexOf("flex flex-col gap-[var(--space-2)]"));
    const offset = Number(stack.match(/top: "calc\(var\(--safe-top\) \+ (\d+)px\)"/)?.[1] ?? 0);
    expect(offset, "말풍선 더미 위치를 찾지 못했다").toBeGreaterThan(0);
    expect(
      offset,
      `더미가 +${offset}px — 목표 패널(약 ${QUEST_PANEL_HEIGHT}px)을 가린다`,
    ).toBeGreaterThan(QUEST_PANEL_HEIGHT);
  });

  it("목표 패널이 화면 맨 위에 붙는다", () => {
    // 아래로 내려오면 대사와의 간격 계산이 통째로 어긋난다
    const panels = readCode("src/components/hud/StatusPanels.tsx");
    const quest = panels.slice(panels.indexOf("export function QuestPanel"));
    expect(quest.slice(0, 1200)).toContain('top: "var(--safe-top)"');
  });
});

describe("완주 화면이 대화창과 부딪히지 않는가", () => {
  /*
   * 화면에서 봤다 — 완주하고 도감을 열면 **둘이 정면으로 겹쳐** 「최고 속도」와
   * 「만난 도깨비」가 가려졌다. 완주 뒤 도감을 여는 것은 가장 자연스러운
   * 동작인데 거기서 부딪힌다.
   *
   * 완주 화면은 화면 가운데(가로 50%)에 뜨고 도감·지도는 오른쪽·가운데를
   * 차지한다. 좌표를 서로 피하게 맞추는 것은 이 저장소에서 여섯 번 실패한
   * 방식이라, **한쪽을 비켜 준다**로 푼다.
   */
  const hud = readCode("src/components/hud/WorldHud.tsx");

  it("대화창이 열려 있으면 완주 화면을 그리지 않는다", () => {
    const at = hud.indexOf("<ResultPanel");
    expect(at, "완주 화면을 못 찾았다").toBeGreaterThan(-1);

    // 바로 앞의 조건을 본다 — 「열려 있지 않을 때만」이어야 한다
    const before = hud.slice(Math.max(0, at - 200), at);
    expect(before, "도감이 열려도 함께 뜬다").toContain("!codexOpen");
    expect(before, "지도가 열려도 함께 뜬다").toContain("!mapOpen");
  });

  it("연 쪽이 이긴다 — 대화창은 그대로 뜬다", () => {
    /*
     * 반대로 풀면(대화창을 숨기면) 사람이 방금 누른 것이 안 열려 고장으로
     * 보인다. 대화창 쪽에는 그런 조건이 붙지 않아야 한다.
     */
    for (const tag of ["<CityMap", "<Codex"]) {
      const at = hud.indexOf(tag);
      expect(at, `${tag}을 못 찾았다`).toBeGreaterThan(-1);
      const before = hud.slice(Math.max(0, at - 160), at);
      expect(before, `${tag}이 완주 화면에 밀린다`).not.toContain("questView.completed");
    }
  });
});

describe("사고 알림이 무엇에도 가리지 않는가", () => {
  /*
   * 이 프로젝트는 z-index를 쓰지 않는다 — 겹침은 **DOM 순서**로 정한다.
   * 그래서 「먼저 그린 것이 아래로 깔린다」가 규칙이고, 그 규칙을 모르면
   * 조용히 깔린다.
   *
   * 실제로 그래픽 연결 끊김 알림이 중간에 있어 완주 화면이 그 위를 덮었다.
   * 「그래픽 연결이 끊겼습니다」와 새로고침 버튼이 가려졌다 — 컨텍스트를
   * 강제로 끊어 화면에서 봤다. 게임이 죽었다는 소식은 무엇에도 가리면 안 된다.
   */
  const hud = readCode("src/components/hud/WorldHud.tsx");

  it("사고 알림을 맨 마지막에 그린다", () => {
    const notice = hud.lastIndexOf("<ContextNotice");
    expect(notice, "사고 알림을 찾지 못했다").toBeGreaterThan(-1);

    /*
     * 뒤에 오는 다른 화면 조각이 있으면 그것이 위를 덮는다. 이름을 손으로
     * 적지 않는다 — 새 패널이 뒤에 붙어도 같은 규칙을 받아야 한다.
     *
     * **같은 반환문 안만** 본다. 처음엔 파일 끝까지 훑었다가 뒤에 정의된
     * 도우미 함수들(`HudButton` 등)을 형제로 오인했다 — 그것들은 렌더
     * 트리의 형제가 아니라 그냥 아래에 적힌 함수다.
     */
    const closing = hud.indexOf("</>", notice);
    expect(closing, "반환문의 끝을 찾지 못했다").toBeGreaterThan(notice);

    const siblings = hud.slice(notice + "<ContextNotice".length, closing);
    const later = [...siblings.matchAll(/<([A-Z]\w+)/g)].map((match) => match[1]);
    expect(later, `사고 알림 뒤에 그리는 것: ${later.join(", ")}`).toEqual([]);
  });
});

describe("저감 모션 장치가 조용히 사라지지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 군중의 위아래 흔들림과 도깨비 자리의 흔들림에서
   * `reducedMotion` 게이트를 지웠는데 **검사 1692개가 전부 통과했다.**
   *
   * 파일 단위로 「`reducedMotion`을 언급하는가」를 보면 못 잡는다 — 게이트 하나를
   * 지워도 같은 파일 다른 곳에 이름이 남아 있다. **게이트 자체를 센다.**
   *
   * 저감 모션은 **접근성 약속**이다. 흔들림에 예민한 사람이 켜 놓은 설정이
   * 조용히 무력해지면, 그 사람은 이 게임을 못 한다.
   *
   * 줄이려면 **왜 그 장치가 필요 없어졌는지** 적고 수를 낮춰라. 늘리는 것은
   * 언제든 통과한다.
   */
  const GATES = 20;

  const gates = collectSources("src").flatMap((path) => {
    const found = readCode(path).match(/reducedMotion \?|if \(reducedMotion\)|!reducedMotion/g) ?? [];
    return found.map(() => path);
  });

  it("장치를 실제로 훑었다", () => {
    const files = new Set(gates);
    expect(files.size, `게이트를 가진 파일 ${files.size}개`).toBeGreaterThan(5);
  });

  it("장치 수가 줄지 않았다", () => {
    const byFile = [...new Set(gates)]
      .map((path) => `${path} (${gates.filter((g) => g === path).length})`)
      .join("\n");
    expect(gates.length, `저감 모션 장치 ${gates.length}개 (기준 ${GATES}):\n${byFile}`).toBeGreaterThanOrEqual(
      GATES,
    );
  });
});

describe("저감 모션이 모든 화면 조각에 전달되는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** `reducedMotion={false}`로 **배선을 끊어도**
   * 검사가 전부 통과했다(군중·차량 둘 다).
   *
   * 게이트 개수 래칫은 **컴포넌트 안의 장치**를 지킨다. 그런데 그 장치에
   * **값이 전달되지 않으면** 설정을 켜도 그 조각만 계속 흔들린다 — 장치는
   * 멀쩡한데 아무도 스위치를 안 눌러 준 꼴이다.
   *
   * 음료 속도가 배선에서 버려지던 것과 같은 종류다. 만든 것과 **연결한 것**은
   * 따로 지켜야 한다.
   */
  const literals = collectSources("src")
    .filter((path) => path.endsWith(".tsx"))
    .flatMap((path) => {
      const found = readCode(path).match(/reducedMotion=\{(?:true|false)\}/g) ?? [];
      return found.map((hit) => `${path}: ${hit}`);
    });

  const wired = collectSources("src")
    .filter((path) => path.endsWith(".tsx"))
    .flatMap((path) => readCode(path).match(/reducedMotion=\{/g) ?? []);

  it("전달하는 곳을 실제로 모았다", () => {
    expect(wired.length, `전달하는 곳 ${wired.length}군데`).toBeGreaterThan(5);
  });

  it("값을 박아 넘기지 않는다", () => {
    expect(literals, `저감 모션을 박아 넘긴다:\n${literals.join("\n")}`).toEqual([]);
  });
});
