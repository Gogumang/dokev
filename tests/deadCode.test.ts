import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 선언만 하고 쓰지 않는 것.
 *
 * ESLint는 **파일 안**의 미사용만 잡는다. 다른 파일에서 아무도 import하지
 * 않는 export는 그대로 남는다 — 읽는 사람은 그것이 쓰인다고 믿는다.
 *
 * 실제로 여덟 개가 그랬고, 그중 둘은 **아무도 부르지 않는 정리 함수**였다.
 * 텍스처 캐시가 영영 해제되지 않고 있었다.
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

/**
 * 프레임워크가 이름으로 찾아 쓰는 export.
 *
 * import가 없어도 정상이다 — Next가 파일 규약으로 읽는다.
 */
const FRAMEWORK_EXPORTS = new Set(["metadata", "viewport", "generateMetadata"]);

const files = [...collect("src"), ...collect("tests")];
const sources = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));

describe("죽은 export", () => {
  it("다른 파일이 쓰지 않는 export가 없다", () => {
    const orphans: string[] = [];
    // 0건이면 정규식이 깨진 것이다 — 빈 목록은 통과가 아니라 신호다
    let checked = 0;

    for (const [path, text] of sources) {
      for (const match of text.matchAll(/^export (?:const|function|class) (\w+)/gm)) {
        checked += 1;
        const name = match[1];
        if (FRAMEWORK_EXPORTS.has(name)) continue;

        const usedElsewhere = [...sources].some(
          ([other, otherText]) => other !== path && new RegExp(`\\b${name}\\b`).test(otherText),
        );
        if (!usedElsewhere) orphans.push(`${path}: ${name}`);
      }
    }

    expect(orphans, `exported but never imported:\n${orphans.join("\n")}`).toEqual([]);
    expect(checked, `찾은 export ${checked}개`).toBeGreaterThan(50);
  });

  it("정리 함수는 실제로 호출된다", () => {
    /*
     * 만들어 두고 부르지 않으면 "정리하고 있다"는 착각만 남는다. 지오메트리
     * 해제(반복 76)와 같은 종류의 누락이다.
     */
    const play = sources.get("src/app/play/PlayClient.tsx") ?? "";
    expect(play, "파사드 텍스처 정리를 부르지 않는다").toContain("disposeFacadeTextures()");
    expect(play, "아틀라스 텍스처 정리를 부르지 않는다").toContain("disposeAtlasTextures()");
  });
});

describe("주석으로 남긴 코드", () => {
  /*
   * 주석 처리된 코드는 **왜 지웠는지도 언제 되살릴지도 말해 주지 않는다.**
   * 다음 사람은 지워도 되는지 판단할 수 없어 그대로 두고, 그렇게 쌓인다.
   * 되살릴 이유가 있으면 그 이유를 문장으로 적어야 한다.
   *
   * TODO·FIXME는 금지하지 않는다. 아는 빈틈을 적어 두는 것은 좋은 일이고,
   * 막으면 기록을 안 하게 될 뿐이다 — 이 프로젝트는 그 반대를 지향한다.
   */
  it("코드를 주석으로 남겨 두지 않는다", () => {
    const offenders: string[] = [];

    for (const file of collect("src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        // 문장이 아니라 코드로 보이는 한 줄 주석만 고른다
        if (/^\s*\/\/\s*(const|let|var|return|if|for|while|export|import|function)\s/.test(line)) {
          offenders.push(`${file}:${index + 1} ${line.trim().slice(0, 60)}`);
        }
      });
    }

    expect(offenders, `주석으로 남은 코드:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("테스트가 살려 두는 죽은 코드", () => {
  /*
   * 기존 검사는 「다른 파일이 쓰는가」만 본다. 그래서 **테스트가 import하면
   * 살아 있는 것으로 센다** — 제품에서 아무도 안 쓰는 코드가 계속 남는다.
   *
   * 실제로 `canUseAbility`가 그랬다. 「HUD가 버튼 활성화에 쓴다」고 적힌 채
   * 테스트만 부르고 있었고, 그동안 쿨다운은 화면에 보이지 않았다.
   *
   * 여기서는 지우라고 하지 않는다. **목록을 눈에 보이게** 두어 하나씩
   * 판단하게 한다 — 남길 이유가 있으면 여기에 이유를 적는다.
   */
  const KEPT: Record<string, string> = {
    viewport: "Next가 이름으로 찾아 쓴다",
    colorDistance: "설계 검사(색 구분)가 쓰는 측정 도구",
    contrastRatio: "설계 검사(명암비)가 쓰는 측정 도구",
    normalizeAngle: "각도 계산의 기준. 지우면 같은 식을 다시 손으로 쓴다",
    isPlayerVulnerable: "무적 시간 규칙의 정의. 전투 규칙 검사가 기준으로 쓴다",
    BLOCK_COUNT: "격자 크기의 정본. 배치 검사가 기준으로 쓴다",
    distanceToTarget: "동료 추적 규칙의 정의. 한 번 지웠다가 되살린 적이 있다",
    isEmoting: "감정 표현 상태의 정의. 자세 검사가 기준으로 쓴다",
    currentEmote: "지금 동작을 고르는 규칙. 대사 검사가 기준으로 쓴다",
    hintRows:
      "화면에 늘 떠 있던 조작 힌트를 요청으로 걷어내면서 제품에서 부르는 곳이 없어졌다. " +
      "그래도 남긴다 — 조작표(CONTROLS)에서 「힌트로 보여 줄 것」만 추리는 규칙이고, " +
      "조작 검사가 이 규칙을 기준으로 바인딩과 대조한다. 지우면 그 대조가 사라진다",
  };

  it("새로 죽은 코드가 조용히 늘지 않는다", () => {
    const sources = collect("src");
    const testText = collect("tests")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    const surprises: string[] = [];
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/^export (?:const|function|class) (\w+)/gm)) {
        const name = match[1];
        const ownUses = (text.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
        const usedElsewhere = sources.some(
          (other) =>
            other !== path && new RegExp(`\\b${name}\\b`).test(readFileSync(other, "utf8")),
        );
        const usedByTests = new RegExp(`\\b${name}\\b`).test(testText);
        if (ownUses <= 1 && !usedElsewhere && usedByTests && !(name in KEPT)) {
          surprises.push(`${path}: ${name}`);
        }
      }
    }

    expect(
      surprises,
      `제품에서 죽었는데 테스트만 살려 두는 코드:\n${surprises.join("\n")}\n` +
        "남길 이유가 있으면 KEPT에 이유와 함께 적는다.",
    ).toEqual([]);
  });

  it("남긴 이유가 사실이다", () => {
    /*
     * 「검사가 기준으로 쓴다」고 적어 두고 정작 아무 검사도 안 쓰면, 목록은
     * 판단이 아니라 면제 도장이 된다. 실제로 쓰이는지 센다.
     *
     * `viewport`만 예외다 — Next가 이름으로 찾으므로 테스트가 부를 일이 없다.
     */
    const testText = collect("tests")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const name of Object.keys(KEPT)) {
      if (name === "viewport") continue;
      const uses = (testText.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
      expect(uses, `${name}: 「검사가 쓴다」고 적었는데 ${uses}회`).toBeGreaterThan(1);
    }
  });

  it("목록이 낡지 않았다", () => {
    // 지워진 것을 계속 「남긴다」고 적어 두면 목록이 거짓이 된다
    const all = collect("src")
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const name of Object.keys(KEPT)) {
      expect(all, `KEPT에 있는 ${name}이 소스에 없다`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});
