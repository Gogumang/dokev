import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { buildCaptureFilename } from "@/game/systems/capture";
import { NICKNAME_MAX_LENGTH, sanitizeNickname } from "@/game/systems/settings";

/*
 * 플레이어 이름.
 *
 * 이 게임에서 사용자가 직접 넣는 **유일한 자유 문자열**이고, 화면과
 * **저장 파일 이름**에 모두 들어간다. 그래서 경계에서 다듬는다 —
 * 다운로드 이름에 경로 구분자가 들어가는 것을 브라우저가 막아 주더라도
 * 그건 우리 책임이 아니다.
 */

describe("이름 다듬기", () => {
  it("한글·영문·숫자·공백은 남긴다", () => {
    expect(sanitizeNickname("신성수 Kim 3")).toBe("신성수 Kim 3");
  });

  it("경로 구분자와 상위 경로를 지운다", () => {
    // 파일 이름으로 나가는 값이다
    expect(sanitizeNickname("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizeNickname("a/b\\c")).toBe("abc");
  });

  it("제어 문자와 기호를 지운다", () => {
    // 기호를 지운 뒤 길이 제한까지 걸린다 — 둘이 함께 동작해야 한다
    expect(sanitizeNickname("<b>hi</b>")).toBe("bhib");
    expect(sanitizeNickname("이름\u0000\n\t")).toBe("이름");
  });

  it("앞뒤 공백을 없애고 사이 공백은 하나로 줄인다", () => {
    expect(sanitizeNickname("  긴   이름  ")).toBe("긴 이름");
  });

  it("길이를 자른다", () => {
    /*
     * 붙여넣기와 IME는 입력칸의 maxLength를 지나칠 수 있다. 저장할 때
     * 다시 거는 것이 실제 제한이다.
     */
    const long = "가".repeat(200);
    expect(sanitizeNickname(long).length).toBe(NICKNAME_MAX_LENGTH);
  });

  it("문자열이 아니면 빈 값이다", () => {
    // 손으로 고친 저장값에는 무엇이든 들어올 수 있다
    for (const value of [null, undefined, 42, {}, []]) {
      expect(sanitizeNickname(value), `${String(value)}`).toBe("");
    }
  });

  it("전부 걸러지면 빈 값이다", () => {
    // 기호만 넣은 이름은 이름이 없는 것과 같다
    expect(sanitizeNickname("!!!///")).toBe("");
  });
});

describe("저장 파일 이름", () => {
  const at = new Date(2026, 7, 17, 5, 6, 7);

  it("이름이 없으면 예전과 같다", () => {
    // 이름을 안 넣은 사람의 파일 이름이 바뀔 이유가 없다
    expect(buildCaptureFilename("photo", "png", at)).toBe("dokev-photo-20260817-050607.png");
  });

  it("이름을 넣으면 파일에도 들어간다", () => {
    expect(buildCaptureFilename("photo", "png", at, "성수")).toBe(
      "dokev-성수-photo-20260817-050607.png",
    );
  });

  it("공백은 붙임표가 된다", () => {
    expect(buildCaptureFilename("clip", "mp4", at, "긴 이름")).toContain("dokev-긴-이름-clip-");
  });

  it("파일 이름에 경로가 끼어들 수 없다", () => {
    /*
     * 여기서 한 번 더 다듬는 이유: 저장된 값을 거쳐 들어와도 그대로 믿지
     * 않는다. 설정 검증이 언젠가 느슨해져도 이 자리는 버텨야 한다.
     */
    const name = buildCaptureFilename("photo", "png", at, "../../evil");
    expect(name, name).not.toContain("/");
    expect(name, name).not.toContain("..");
    expect(name.endsWith(".png"), name).toBe(true);
  });

  it("같은 초에 찍어도 확장자가 유지된다", () => {
    const name = buildCaptureFilename("clip", "webm", at, "이름");
    expect(name.endsWith(".webm"), name).toBe(true);
  });
});

describe("이름이 화면에 닿아 있는가", () => {
  it("시작 화면에서 입력한다", () => {
    const title = readCode("src/components/title/TitleScreen.tsx");
    expect(title, "입력칸이 없다").toContain('id="nickname"');
    // 요구하면 「시작」까지 한 걸음이 늘고, 그 한 걸음에서 사람이 떠난다
    expect(title, "선택이라는 표시가 없다").toContain("선택");
    expect(title, "어디로 가는지 밝히지 않는다").toContain("어디로도 보내지 않습니다");
  });

  it("완주 화면이 이름을 부른다", () => {
    const panels = readCode("src/components/hud/StatusPanels.tsx");
    expect(panels, "완주 화면이 이름을 쓰지 않는다").toContain("의 완주");
  });

  it("사진과 클립 모두 이름을 넘긴다", () => {
    /*
     * 한쪽만 넘기면 사진에는 이름이 있고 클립에는 없다.
     *
     * 줄 단위로 보면 안 된다 — 클립 호출은 인자가 여러 줄에 걸쳐 있어서
     * 이름이 다음 줄에 있다. 실제로 그렇게 짰다가 「호출 0건」으로 걸렸다.
     * 호출 지점부터 닫는 괄호까지를 통째로 본다.
     */
    const source = readCode("src/app/play/useCapture.ts");
    const calls: string[] = [];
    let at = source.indexOf("buildCaptureFilename(", source.indexOf("export function"));
    while (at > -1) {
      calls.push(source.slice(at, source.indexOf(");", at)));
      at = source.indexOf("buildCaptureFilename(", at + 1);
    }

    expect(calls.length, `호출 ${calls.length}건`).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call, `이름 없이 저장한다: ${call.replace(/\s+/g, " ")}`).toContain("nickname");
    }
  });
});
