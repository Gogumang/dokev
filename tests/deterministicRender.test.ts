import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectSources } from "./support/source";

/*
 * 같은 판을 두 번 돌리면 같은 그림이 나와야 한다.
 *
 * 시연 영상을 **프레임 단위로 뽑기** 위해서다. 실시간 녹화는 프레임이 한 번
 * 떨어지면 그게 그대로 영상에 남는데(이 게임은 저사양에서 품질을 스스로
 * 낮추기까지 한다), 프레임을 하나씩 그려 붙이면 한 장에 10초가 걸려도
 * 결과물은 완벽한 60fps다.
 *
 * 그 방식이 성립하려면 **세계가 흐른 시간만 보고 그려져야 한다.** 벽시계를
 * 직접 보는 코드가 한 줄이라도 있으면 그 부분만 매번 다르게 나온다 —
 * 화면으로는 절대 못 잡는다. 실제로 둘 있었다: 카메라 착지 흔들림과 부두
 * 찌의 물결. 둘 다 「똑같아 보이는데 매번 다른」 종류였다.
 */

const WALL_CLOCK = /\b(?:performance\.now|Date\.now)\s*\(/;

/**
 * 화면에 그려지는 세계 — `src/game`.
 *
 * HUD(`src/components`)와 계측은 뺀다. 저쪽은 벽시계를 봐도 된다: 시연
 * 안내가 몇 초 지났는지 세는 것은 **실제로 흐른 시간**이 맞고, 3D 그림에
 * 끼어들지도 않는다.
 */
const WORLD = collectSources("src/game");

/**
 * 벽시계를 봐도 되는 곳.
 *
 * 목록으로 두고 **이유를 적는다.** 「systems 폴더는 통째로 뺀다」처럼 넓게
 * 잡으면 나중에 입력이나 조작이 벽시계를 봐도 조용히 넘어간다.
 */
const ALLOWED: Record<string, string> = {
  "src/game/systems/analytics.ts":
    "계측은 그림이 아니다. 게다가 벽시계를 **주입받고**(`options.now`) 기본값으로만 쓴다 — 검사는 이미 가짜 시계를 넣어 돌린다.",
};

/** 주석 안의 언급은 세지 않는다 — 「예전에는 이랬다」를 적어 두는 것이 규칙이다 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("세계는 벽시계를 보지 않는다", () => {
  it("훑을 파일을 실제로 찾았다", () => {
    // 경로가 바뀌면 빈 목록을 훑으며 조용히 통과한다
    expect(WORLD.length, `${WORLD.length}개 파일`).toBeGreaterThan(60);
  });

  it("이 검사가 벽시계를 실제로 알아본다", () => {
    /*
     * 정규식이 헛돌면 위 검사가 늘 통과한다. 진짜 한 줄을 넣어 보고
     * 걸리는지 확인한다.
     */
    expect(WALL_CLOCK.test("const t = performance.now();"), "performance.now를 못 본다").toBe(true);
    expect(WALL_CLOCK.test("const t = Date.now();"), "Date.now를 못 본다").toBe(true);
    expect(codeOnly("/* performance.now() */\ncode"), "주석을 안 지운다").not.toMatch(WALL_CLOCK);
  });

  it("봐도 되는 목록이 낡지 않았다", () => {
    /*
     * 예외가 사라졌는데 목록만 남으면, 다음에 같은 파일이 다시 벽시계를
     * 봐도 그냥 통과한다.
     */
    for (const [path, why] of Object.entries(ALLOWED)) {
      expect(WORLD, `${path}가 사라졌는데 예외만 남았다`).toContain(path);
      expect(
        WALL_CLOCK.test(codeOnly(readFileSync(path, "utf8"))),
        `${path}는 이제 벽시계를 안 본다 — 예외를 지워라`,
      ).toBe(true);
      expect(why.length, `${path}에 이유가 없다`).toBeGreaterThan(20);
    }
  });

  it("아무 파일도 벽시계를 직접 보지 않는다", () => {
    const offenders = WORLD.filter(
      (path) => !(path in ALLOWED) && WALL_CLOCK.test(codeOnly(readFileSync(path, "utf8"))),
    );
    expect(
      offenders,
      `벽시계를 직접 본다 — 같은 판을 두 번 돌려도 다르게 그려진다:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("난수는 씨앗에서만 나온다", () => {
    /*
     * `Math.random()`도 같은 문제다. 저장소가 이미 시드 난수만 쓰기로
     * 했지만(`createSeededRandom`), 그 규칙을 여기서도 못 박아 둔다 —
     * 결정적 재생이 깨지는 두 번째 경로다.
     */
    const offenders = WORLD.filter((path) =>
      /\bMath\.random\s*\(/.test(codeOnly(readFileSync(path, "utf8"))),
    );
    expect(offenders, `씨앗 없는 난수:\n${offenders.join("\n")}`).toEqual([]);
  });
});
