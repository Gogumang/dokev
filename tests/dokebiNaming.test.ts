import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";

import { collectSources, readCode } from "./support/source";

/*
 * 특정 도깨비 이름이 화면 문구에 박히지 않았는지.
 *
 * 도깨비가 하나였을 때 쓴 문구들이 셋이 된 뒤 거짓말을 하기 시작했다.
 * 실제로 네 곳에서 걸렸다 — 터치 버튼, 말풍선 화자, 퀘스트 완료 문구,
 * 그리고 조작표(반복 32에서 고친 능력 이름까지 하면 다섯 곳).
 *
 * 이름은 데이터에서만 나와야 한다. 이 테스트가 다음 도깨비를 추가할 때
 * 같은 실수를 막는다.
 */

/** 이름 정의가 있어도 되는 곳 — 여기가 정본이다 */
const DEFINITION_FILES = ["src/game/dokebi/roster.ts", "src/game/dokebi/companionMotion.ts"];

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** 주석을 걷어낸 코드만 남긴다 — 왜 고쳤는지 적어 둔 문장까지 걸리면 기록을 못 남긴다 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("도깨비 이름", () => {
  const names = DOKEBI_ORDER.map((id) => DOKEBI[id].name);

  it("정의 파일 밖에서는 이름을 문자열로 쓰지 않는다", () => {
    const offenders: string[] = [];

    for (const file of [...collect("src/game"), ...collect("src/components")]) {
      if (DEFINITION_FILES.includes(file)) continue;
      const code = codeOnly(readFileSync(file, "utf8"));
      for (const name of names) {
        if (code.includes(name)) offenders.push(`${file}: "${name}"`);
      }
    }

    expect(offenders, `hardcoded dokebi names:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("정본에는 세 이름이 모두 있다", () => {
    // 위 검사가 통과하는 가장 쉬운 방법은 이름을 다 지우는 것이다. 그건 아니다.
    const roster = readFileSync("src/game/dokebi/roster.ts", "utf8");
    const motion = readFileSync("src/game/dokebi/companionMotion.ts", "utf8");
    const combined = roster + motion;

    for (const name of names) {
      expect(combined.includes(name), `${name} missing from the roster`).toBe(true);
    }
  });

  it("화면에 이름을 보여 주는 통로가 있다", () => {
    /*
     * 이름을 못 쓰게만 하면 아무 데도 안 나오게 된다. HUD가 데이터에서
     * 받아 쓰는 경로가 실제로 있는지 확인한다.
     */
    const hud = collectSources("src/components/hud").map(readCode).join("\n");
    expect(hud).toContain("dokebiName");

    // 터치 버튼도 같은 경로를 쓴다 — 「초롱」을 박으면 다른 동료일 때 거짓말이 된다
    const touch = readFileSync("src/components/hud/TouchButtons.tsx", "utf8");
    expect(touch).toContain("dokebiName");

    // 말풍선의 화자 이름도 데이터에서 온다
    const speech = readFileSync("src/components/hud/views/Speech.tsx", "utf8");
    expect(speech).toContain("speaker");
  });
});
