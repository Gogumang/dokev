import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { collectSources, readCode } from "./support/source";

import {
  DEFAULT_PHOTO_FILTER,
  isTransparentFilter,
  nextPhotoFilter,
  PHOTO_FILTER_ORDER,
  PHOTO_FILTERS,
  photoFilterOrder,
  photoFilterPreset,
  supportsCanvasTone,
  type PhotoFilterId,
} from "@/game/systems/photoFilter";

/*
 * 흑백·대비는 색을 덧칠해 만들 수 없다 — 뒤에 있는 것의 채도를 낮춰야 한다.
 * 그래서 화면은 CSS `filter`, 사진은 2D 캔버스의 `ctx.filter`로 만든다.
 *
 * **이 방식의 유일한 위험은 둘이 갈라지는 것이다.** 화면만 흑백이고 사진은
 * 컬러로 저장되는 사고 — 이 저장소가 `timeOfDay.ts` 첫 줄에 적어 둔 그것이다.
 * 아래 검사는 대부분 그 한 가지를 지킨다.
 */

const toneIds = PHOTO_FILTER_ORDER.filter((id) => PHOTO_FILTERS[id].tone !== undefined);

describe("톤 항목", () => {
  it("톤을 쓰는 필터가 있다", () => {
    // 필터가 전부 걸러지면 아래 검사들이 조용히 사라진다
    expect(toneIds.join(","), "톤 항목이 하나도 없다").not.toBe("");
  });

  it("톤 항목은 색을 얹지 않는다", () => {
    /*
     * 색까지 얹으면 두 방식이 겹쳐 무엇이 화면을 바꾸는지 알 수 없게 된다.
     * 톤은 톤만 한다.
     */
    for (const id of toneIds) {
      const filter = PHOTO_FILTERS[id];
      expect(isTransparentFilter(filter), `${id}이 색을 얹는다`).toBe(true);
    }
  });

  it("색을 얹는 필터는 톤을 쓰지 않는다", () => {
    for (const id of PHOTO_FILTER_ORDER) {
      const filter = PHOTO_FILTERS[id];
      if (isTransparentFilter(filter)) continue;
      expect(filter.tone, `${id}이 색과 톤을 함께 쓴다`).toBeUndefined();
    }
  });

  it("톤 문자열이 CSS filter로 쓸 수 있는 모양이다", () => {
    // `ctx.filter`에 그대로 들어가는 값이라 함수 표기여야 한다
    for (const id of toneIds) {
      expect(PHOTO_FILTERS[id].tone, `${id}의 톤이 이상하다`).toMatch(
        /^[a-z-]+\([^)]+\)( [a-z-]+\([^)]+\))*$/,
      );
    }
  });
});

describe("못 쓰는 곳에서는 없는 것으로 다룬다", () => {
  /*
   * 「되는 척하고 다르게 저장하기」보다 「없다고 말하기」가 낫다. 지원을
   * 확인할 수 없는 곳(테스트·서버)에서는 거짓이어야 한다.
   */
  it("브라우저가 없으면 지원하지 않는다고 답한다", () => {
    expect(supportsCanvasTone(), "document가 없는데 된다고 답했다").toBe(false);
  });

  it("못 쓰면 고를 수 있는 목록에서 빠진다", () => {
    const usable = photoFilterOrder(false);
    for (const id of toneIds) {
      expect(usable, `못 쓰는데 ${id}이 목록에 남았다`).not.toContain(id);
    }
    expect(usable.length, "톤을 빼니 고를 것이 없다").toBeGreaterThan(1);
  });

  it("못 쓰면 순환이 톤을 건너뛴다", () => {
    /*
     * 목록에서만 빼고 순환이 그대로면 버튼을 누르다 톤에 걸린다 — 목록과
     * 순환이 같은 정본을 봐야 한다.
     */
    let id: PhotoFilterId = DEFAULT_PHOTO_FILTER;
    const seen = new Set<PhotoFilterId>();
    for (let step = 0; step < PHOTO_FILTER_ORDER.length * 2; step += 1) {
      id = nextPhotoFilter(id, false);
      seen.add(id);
    }
    for (const tone of toneIds) {
      expect([...seen], `순환이 ${tone}에 걸렸다`).not.toContain(tone);
    }
  });

  it("못 쓰면 저장에 남은 톤 항목에서 톤을 뗀다", () => {
    // 옛 저장이나 다른 브라우저에서 고른 값이 그대로 들어올 수 있다
    for (const id of toneIds) {
      expect(photoFilterPreset(id, false).tone, `${id}의 톤이 남았다`).toBeUndefined();
      /*
       * 이름도 함께 돌아가야 한다. 톤만 떼고 이름을 남기면 버튼에 「흑백」이라
       * 적힌 채 화면은 컬러다 — 버튼이 화면과 다른 말을 하면 안 된다.
       */
      expect(photoFilterPreset(id, false).name, `${id}의 이름이 남았다`).toBe(
        PHOTO_FILTERS[DEFAULT_PHOTO_FILTER].name,
      );
    }
  });

  it("쓸 수 있으면 그대로 돌려준다", () => {
    for (const id of toneIds) {
      expect(photoFilterPreset(id, true).tone, `${id}의 톤이 사라졌다`).toBe(
        PHOTO_FILTERS[id].tone,
      );
    }
  });
});

describe("화면과 사진이 갈라지지 않는다", () => {
  const capture = readCode("src/game/systems/capture.ts");

  it("사진에 넣을 톤을 화면에서 읽는다", () => {
    /*
     * 고른 id를 따로 넘기면 화면을 칠하는 값과 사진에 넣는 값이 두 곳에
     * 생기고, 한쪽만 고치는 날 둘이 갈라진다.
     */
    const caller = readCode("src/app/play/useCapture.ts");
    expect(caller, "화면에서 읽지 않고 사진을 만든다").toMatch(
      /canvasToPng\(\s*canvas\s*,\s*activeTone\(canvas\)\s*\)/,
    );
    expect(capture, "화면의 계산된 스타일을 읽지 않는다").toContain("getComputedStyle");
  });

  it("몇 단계까지 올라갈지를 숫자로 박지 않는다", () => {
    /*
     * 「캔버스와 그 위 두 단계」처럼 세어 두면 래퍼가 하나 늘어나는 날 조용히
     * 못 찾고 **사진만 컬러**가 된다. 멈추는 자리는 문서 구조(`body`)여야 한다.
     */
    const fn = capture.slice(capture.indexOf("export function activeTone"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "올라갈 단계를 숫자로 정해 두었다").not.toMatch(/depth\s*<\s*\d/);
    expect(body, "body에서 멈추지 않는다").toContain("document.body");
  });

  it("조상에 걸린 필터를 모두 겹친다", () => {
    // CSS가 실제로 그렇게 한다 — 하나만 집으면 겹친 화면과 사진이 달라진다
    const fn = capture.slice(capture.indexOf("export function activeTone"));
    expect(fn.slice(0, fn.indexOf("\n}")), "첫 번째만 쓰고 만다").toContain("join(");
  });

  it("톤을 못 먹이면 원본을 저장한다", () => {
    /*
     * 넣은 값이 남지 않는 브라우저에서는 필터가 무시된다. 그때 사본을 쓰면
     * 사진만 컬러가 되는 것이 아니라 **아무 확인 없이** 그렇게 된다.
     */
    expect(capture, "필터가 먹었는지 확인하지 않는다").toMatch(
      /ctx\.filter === "none"[\s\S]{0,200}return null/,
    );
  });

  it("옮기다 실패해도 사진은 나온다", () => {
    // 색이 다른 사진이라도 사진이 없는 것보다 낫다
    expect(capture, "사본 실패 시 원본으로 돌아가지 않는다").toMatch(
      /toned\([^)]*\)\s*\?\?\s*canvas/,
    );
  });

  it("정본 기록을 밖에서 직접 꺼내 쓰지 않는다", () => {
    /*
     * **이 저장소의 해석 함수 다섯 중 넷은 모르는 id에 대한 폴백일 뿐이다**
     * (`timeOfDayPreset`·`dokebiPreset`·`appearancePreset`·`photoPosePreset`).
     * 타입이 보장하는 id로 기록을 바로 꺼내도 결과가 같으므로 아무도 신경
     * 쓰지 않았다.
     *
     * `photoFilterPreset`만 다르다 — **값을 바꾼다.** 톤을 못 쓰는 브라우저에서
     * 기본값으로 되돌린다. 그래서 이것만은 건너뛰면 안 되는데, 나머지 넷을 보고
     * 「그냥 폴백이겠지」 하고 건너뛰기 딱 좋다. 실제로 버튼 이름이 그렇게
     * 새어 나가 **「흑백」이라 적힌 채 화면은 컬러**였다.
     *
     * 한 호출부가 아니라 규칙으로 막는다 — 다음에 생길 호출부까지 잡아야 한다.
     */
    const offenders = collectSources("src")
      .filter((file) => !file.endsWith("photoFilter.ts"))
      .filter((file) => /\bPHOTO_FILTERS\[[a-z]/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(/\\/g, "/"));

    expect(offenders, `해석을 건너뛰고 정본에서 바로 꺼낸다:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("화면은 포토 모드에서만 톤을 건다", () => {
    // 평소에도 걸리면 저장된 설정 하나로 게임 전체가 흑백이 된다
    const scene = readCode("src/game/scene/GameScene.tsx");
    expect(scene, "포토 모드가 아닐 때도 톤을 건다").toMatch(
      /filter:\s*props\.photoMode && filter\.tone/,
    );
  });
});

describe("클립도 화면과 같아야 한다", () => {
  const capture = readCode("src/game/systems/capture.ts");

  /*
   * `captureStream`은 캔버스 픽셀만 가져간다 — 조상에 걸린 CSS `filter`는
   * 담기지 않는다. 사진에서 막은 사고를 클립에 남기면 「어떤 저장은 맞고
   * 어떤 저장은 틀린」 상태가 되어 더 나쁘다.
   */
  it("톤이 있으면 거울 캔버스를 녹화한다", () => {
    expect(capture, "원본에서 바로 스트림을 뜬다").toMatch(
      /\(mirror\?\.canvas \?\? canvas\)\.captureStream/,
    );
  });

  it("클립도 화면에서 읽은 톤을 받는다", () => {
    const caller = readCode("src/app/play/useCapture.ts");
    const call = caller.slice(caller.indexOf("startClipRecording("));
    expect(call.slice(0, 220), "클립에 톤을 넘기지 않는다").toContain("activeTone(canvas)");
  });

  it("톤이 없으면 거울을 만들지 않는다", () => {
    // 쓰지도 않을 그리기를 매 프레임 할 이유가 없다
    expect(capture, "톤이 없어도 거울을 만든다").toMatch(/tone \? mirrorCanvas\(/);
  });

  it("녹화를 멈추면 거울도 멈춘다", () => {
    // 남겨 두면 남은 세션 내내 매 프레임 그린다 — 이 저장소가 겪은 누수와 같은 꼴이다
    const release = capture.slice(capture.indexOf("const release = ()"));
    expect(release.slice(0, 220), "거울을 놓지 않는다").toContain("mirror?.stop()");
  });

  it("크기가 바뀌어도 톤이 유지된다", () => {
    /*
     * 캔버스 크기를 바꾸면 2D 상태가 초기화되어 `filter`가 날아간다. 한 번만
     * 걸어 두면 창 크기가 바뀌는 순간 조용히 컬러로 돌아간다.
     */
    const mirror = capture.slice(capture.indexOf("function mirrorCanvas"));
    const draw = mirror.slice(
      mirror.indexOf("const draw = ()"),
      mirror.indexOf("requestAnimationFrame(draw);\n    };"),
    );
    expect(draw, "그릴 때마다 톤을 다시 걸지 않는다").toContain("ctx.filter = tone;");
    expect(draw, "크기 변화를 보지 않는다").toContain("copy.width !== source.width");
  });
});

describe("거울이 살아남지 않는가", () => {
  /*
   * 거울은 **매 프레임 그리는 루프**다. 녹화를 멈추면 `release`가 놓지만,
   * 사용자가 녹화 중에 화면을 떠나면 `stop`을 부르는 쪽이 없으면 남는다.
   *
   * 이 고리는 전부터 있었지만 그때는 스트림 하나만 걸려 있었다. 이제는 매
   * 프레임 2560×1626을 그리는 루프가 걸려 있어 **잊었을 때의 값이 훨씬 비싸다.**
   */
  it("화면을 떠날 때 녹화기를 멈춘다", () => {
    const caller = readCode("src/app/play/useCapture.ts");
    const cleanup = caller.slice(caller.lastIndexOf("useEffect("));
    expect(cleanup, "언마운트 정리에서 녹화기를 멈추지 않는다").toMatch(
      /return \(\) => \{[\s\S]{0,120}recorder\.current\?\.stop\(\)/,
    );
  });

  it("멈추는 길이 하나뿐이다", () => {
    /*
     * `release`를 거치지 않고 끝나는 길이 생기면 거울만 남는다. 스트림을 놓는
     * 곳과 거울을 놓는 곳이 **같은 함수**여야 한다.
     */
    const capture = readCode("src/game/systems/capture.ts");
    const stops = capture.match(/mirror\?\.stop\(\)/g) ?? [];
    // 스트림 생성 실패 경로와 release 두 곳 — 그 밖에 흩어지면 빠뜨린다
    expect(stops.length, `거울을 놓는 곳 ${stops.length}군데`).toBeLessThanOrEqual(2);
    expect(capture, "트랙을 놓는 곳에서 거울을 놓지 않는다").toMatch(
      /track\.stop\(\);[\s\S]{0,120}mirror\?\.stop\(\)/,
    );
  });
});
