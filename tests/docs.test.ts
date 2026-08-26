import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { collectSources } from "./support/source";

import { describe, expect, it } from "vitest";

import { BOSS_QUEST, FIRST_RUN_QUEST, QUEST_CHAIN } from "@/game/quest/questContent";
import { LOCOMOTION } from "@/game/config/tuning";

import { BLIPS } from "@/game/systems/minimap";
import { QUALITY_PRESETS } from "@/game/systems/quality";
import { DOKEBI, DOKEBI_ORDER, type DokebiSpirit } from "@/game/dokebi/roster";
import { CONTROLS } from "@/game/systems/controls";
import { PHOTO_FILTER_ORDER } from "@/game/systems/photoFilter";
import { PHOTO_POSE_ORDER } from "@/game/player/photoPose";
import { DISTRICTS } from "@/game/world/districts";
import { TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";

/*
 * 문서 ↔ 코드 대조.
 *
 * 프로젝트 규칙: "구조·계약이 바뀌면 코드와 같은 커밋에서 문서를 갱신한다."
 * 지키려면 어긋난 것을 알아챌 수단이 있어야 한다 — 문서는 조용히 낡는다.
 * 여기서는 **숫자와 이름**만 본다. 문장까지 검사하면 문서를 고칠 때마다
 * 테스트가 깨져 아무도 문서를 안 고치게 된다.
 */
const plan = readFileSync("docs/PROJECT_PLAN.md", "utf8");

/**
 * 이 저장소의 문서 전부 (루트 + `docs/`).
 *
 * 기획 문서를 `docs/`로 옮겼을 때 루트만 훑던 검사 둘이 **아무것도 못 찾은
 * 채로** 통과할 뻔했다. 「어느 문서를 볼지」를 손으로 적지 않는 이유와 같은
 * 이유로 **어느 디렉터리를 볼지도** 한 곳에만 적는다.
 */
function markdownFiles(): string[] {
  const roots = [".", "docs"];
  return roots.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => (dir === "." ? name : `${dir}/${name}`)),
  );
}

/**
 * 문서에 적힌 테스트 수와 비교할 기준값 — 소스에서 센다.
 *
 * 손으로 적은 상수였다. 그런데 검사는 25% 오차를 허용하므로 대부분의 반복에서
 * **고칠 필요가 없는 값을 고치고 있었다.** 하지 않아도 될 일을 매번 하게 만드는
 * 검사는 그 자체가 비용이다.
 *
 * `it(`를 세면 반복문으로 만들어 내는 테스트는 실제보다 적게 잡히지만, 25%
 * 오차 안에서는 문제가 되지 않는다. 문서가 자릿수를 틀리는 것만 잡으면 된다.
 */
function countTests(): number {
  return readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"))
    .reduce(
      (total, name) =>
        total + (readFileSync(`tests/${name}`, "utf8").match(/\bit\(/g)?.length ?? 0),
      0,
    );
}

describe("PROJECT_PLAN 18절", () => {
  it("도깨비 수가 맞다", () => {
    expect(plan, `roster has ${DOKEBI_ORDER.length}`).toContain(`**${DOKEBI_ORDER.length}종**`);
  });

  it("모든 도깨비 이름이 적혀 있다", () => {
    // 이름을 바꾸고 문서를 안 고치면 도감과 기획서가 다른 게임을 말한다
    for (const id of DOKEBI_ORDER) {
      const name = { chorong: "초롱", geueum: "그을음", mulbineul: "물비늘", jajeong: "자정" }[id];
      expect(plan.includes(name ?? ""), `${id} (${name}) missing from the plan`).toBe(true);
    }
  });

  it("구역 이름이 모두 적혀 있다", () => {
    for (const district of Object.values(DISTRICTS)) {
      expect(plan.includes(district.name), `district ${district.name} missing`).toBe(true);
    }
  });

  it("시간대 수가 맞다", () => {
    expect(TIME_OF_DAY_ORDER.length, "시간대가 늘거나 줄면 18절 표를 고쳐야 한다").toBe(4);
    expect(plan).toContain("여명·한낮·노을·밤");
  });

  it("포토 모드 항목 수가 맞다", () => {
    expect(plan).toContain(`색보정 ${PHOTO_FILTER_ORDER.length}종`);
    expect(plan).toContain(`포즈 ${PHOTO_POSE_ORDER.length}종`);
  });

  it("테스트 수가 실제와 크게 어긋나지 않는다", () => {
    /*
     * 정확히 맞추라고 하면 테스트를 하나 추가할 때마다 문서를 고쳐야 한다.
     * 자릿수만 본다 — 238개라고 적힌 문서가 538개인 코드를 설명할 수는 없다.
     */
    const match = /테스트 \*\*(\d+)개 \/ (\d+) 파일\*\*/.exec(plan);
    expect(match, "18절에 테스트 수 표기가 없다").not.toBeNull();
    if (!match) return;

    const documented = Number(match[1]);
    const files = readdirSync("tests").filter((name) => name.endsWith(".test.ts")).length;
    const counted = countTests();

    expect(Number(match[2]), `documented ${match[2]} files, actual ${files}`).toBe(files);
    expect(
      Math.abs(documented - counted) / counted,
      `documented ${documented} tests, roughly ${counted} exist`,
    ).toBeLessThan(0.25);
  });

  it("테스트 수를 말하는 다른 문서도 같이 늙지 않는다", () => {
    /*
     * 기획서 하나만 보고 있었다. README는 **831개**라고 적어 둔 채 실제가 그
     * 두 배 가까이 되도록 아무도 몰랐다 — 이 프로젝트를 처음 보는 사람이
     * 읽는 것은 README다.
     *
     * 「어느 문서가 숫자를 말하는가」를 손으로 적지 않는다. 루트의 모든 문서를
     * 훑어 **말한 곳이면 어디든** 검사한다.
     */
    const counted = countTests();
    const claims = markdownFiles().flatMap((name) => {
      const text = readFileSync(name, "utf8");
      return [...text.matchAll(/(?:테스트 \*\*|\*\*)?(\d{2,})개(?:\*\*)? 테스트/g)].map((m) => ({
        name,
        number: Number(m[1]),
      }));
    });

    expect(claims.length, "테스트 수를 말하는 문서가 하나도 없다").toBeGreaterThan(0);
    for (const claim of claims) {
      expect(
        Math.abs(claim.number - counted) / counted,
        `${claim.name}이 ${claim.number}개라고 하는데 실제는 ${counted}개쯤이다`,
      ).toBeLessThan(0.25);
    }
  });
});

describe("백로그의 한계 기록", () => {
  const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");

  it("화면을 확인하지 않았다는 사실을 맨 앞에 둔다", () => {
    /*
     * 900개가 넘는 테스트가 통과한다는 사실이 "잘 돌아간다"로 읽히면 안 된다.
     * 이 저장소에서 가장 중요한 한 줄이다.
     */
    const limits = backlog.slice(backlog.indexOf("## 반복 작업의 한계"));
    expect(limits, "한계 절이 없다").toContain("화면을 한 번도 확인하지 않았다");
  });

  it("고정된 값과 눈이 필요한 값을 구분한다", () => {
    /*
     * "전부 추측"이라고만 적으면 무엇을 먼저 봐야 하는지 알 수 없다.
     * 관계로 묶인 값과 느낌으로만 알 수 있는 값은 다른 종류의 미확인이다.
     */
    expect(backlog).toContain("이제는 추측이 아닌 것");
    expect(backlog).toContain("여전히 눈이 필요한 것");
  });

  it("가장 먼저 볼 것을 지목한다", () => {
    // 목록만 있으면 어디서 시작할지 모른다
    expect(backlog).toContain("가장 먼저 볼 것");
  });
});

describe("트레일러 기능 분석", () => {
  const trailer = readFileSync("docs/TRAILER_FEATURE_ANALYSIS.md", "utf8");

  it("구현 현황이 적혀 있다", () => {
    // 반복 3에서 쓴 뒤 53번 동안 갱신되지 않았다. 다시 낡지 않게 표시를 고정한다.
    expect(trailer).toContain("구현 현황");
  });

  it("체크한 항목 수가 실제와 크게 어긋나지 않는다", () => {
    /*
     * 정확히 맞추라고 하면 기능 하나 추가할 때마다 문서를 고쳐야 한다.
     * 자릿수만 본다 — 하나도 안 체크된 문서가 지금 코드를 설명할 수는 없다.
     */
    const checked = (trailer.match(/^- \[x\]/gm) ?? []).length;
    expect(checked, `${checked} items checked`).toBeGreaterThan(12);
  });

  it("GLB 계획이 폐기됐음을 명시한다", () => {
    /*
     * 8·9절은 GLB 제작 계획이다. 그대로 두면 새로 오는 사람이 모델 파일을
     * 만들기 시작한다 — 기획서가 public/models를 안내하던 것과 같은 함정이다.
     */
    expect(trailer).toContain("채택하지 않은 계획");
    expect(trailer, "폐기 이유가 없으면 나중에 되살아난다").toContain("다운로드 예산");
  });

  it("남은 격차를 숨기지 않는다", () => {
    // 다 됐다고 적힌 문서는 무엇을 더 해야 하는지 알려 주지 못한다
    expect(trailer).toContain("미구현");
  });
});

describe("조작 안내 문서", () => {
  it("정본에 있는 기능이 기획서 조작 설명과 충돌하지 않는다", () => {
    // 문서가 없는 키를 안내하면 그대로 따라 하다 아무 일도 안 일어난다
    const documented = ["WASD", "Shift", "Space"];
    for (const key of documented) {
      const known = CONTROLS.some((row) => row.keyboard.includes(key));
      expect(known, `plan mentions ${key} but no control uses it`).toBe(true);
    }
  });
});

describe("문서가 적은 숫자가 상수와 맞는가", () => {
  /*
   * 랜딩의 「저장되지 않습니다」, README의 낡은 확인 지점 목록과 같은 종류다.
   * 숫자는 특히 조용히 틀어진다 — 상수를 조정할 때 문서까지 여는 사람은 드물다.
   */
  it("표식 반경", () => {
    expect(plan, `실제 ${BLIPS.rangeMeters}m`).toContain(`반경 ${BLIPS.rangeMeters}m`);
  });

  it("여정 단계 수", () => {
    /*
     * 「첫 산책 **5단계**」라고 적혀 있었는데 실제는 여섯이었다 — 흔적 조사가
     * 늘어난 뒤로 문서만 그대로였다. 18절은 스스로 「이 절만이 코드의 실제
     * 상태를 기술한다」고 밝히는 절이라, 여기가 틀리면 그 선언이 무너진다.
     */
    const claimed = /여정 (\d+)개\*\*\(첫 산책 (\d+)단계 → 고물 대장 (\d+)단계\)/.exec(plan);
    expect(claimed, "여정 문장을 못 찾았다").not.toBeNull();

    expect(Number(claimed?.[1]), `문서 ${claimed?.[1]}개`).toBe(QUEST_CHAIN.length);
    expect(Number(claimed?.[2]), `첫 산책: 문서 ${claimed?.[2]}단계`).toBe(
      FIRST_RUN_QUEST.steps.length,
    );
    expect(Number(claimed?.[3]), `고물 대장: 문서 ${claimed?.[3]}단계`).toBe(
      BOSS_QUEST.steps.length,
    );
  });

  it("이동 속도", () => {
    // 세 값 다 화면의 조작감을 좌우한다 — 문서만 남고 값이 바뀌면 판단이 틀어진다
    for (const [name, speed] of [
      ["걷기", LOCOMOTION.walk.maxSpeed],
      ["달리기", LOCOMOTION.run.maxSpeed],
      ["보드", LOCOMOTION.skateboard.maxSpeed],
    ] as const) {
      expect(plan, `${name} ${speed}가 문서에 없다`).toContain(String(speed));
    }
  });

  it("품질 단계 수", () => {
    const levels = Object.keys(QUALITY_PRESETS).length;
    expect(plan, `실제 ${levels}단계`).toContain(`품질 ${levels}단계`);
  });
});

describe("기획서가 해금 구조를 적는가", () => {
  /*
   * 「4종」이라고만 적혀 있었다. 그런데 **무엇으로 열리는가**가 이 게임의
   * 수집 설계 자체다 — 자정은 보스를 눕혀야 열린다. 숫자만 맞추고 구조를
   * 빠뜨리면 다음 사람이 조건을 마음대로 바꾼다.
   */
  /*
   * 조건 이름을 **타입에서** 뽑는다.
   *
   * 예전에는 세 낱말을 손으로 적어 두었다. 네 번째 조건이 생기면 그 조건은
   * 기획서에 없어도 아무도 모른다 — 목록은 아는 것만 담기 때문이다.
   * 아래 `Record`는 조건 키를 모두 요구하므로, `requires*` 필드를 하나
   * 늘리는 순간 **타입 검사가 먼저 막는다.**
   */
  type UnlockKey = Extract<keyof DokebiSpirit, `requires${string}` | "requiredDefeats">;

  const CONDITION_WORD: Record<UnlockKey, string> = {
    requiredDefeats: "처치 수",
    requiresQuest: "첫 여정",
    requiresBoss: "고물 대장",
  };

  /** 그 조건을 실제로 쓰는 도깨비가 있는가 */
  function isUsed(key: UnlockKey): boolean {
    return DOKEBI_ORDER.some((id) => {
      const value = DOKEBI[id][key];
      return typeof value === "number" ? value > 0 : value;
    });
  }

  it("쓰이는 해금 조건이 모두 적혀 있다", () => {
    const used = (Object.keys(CONDITION_WORD) as UnlockKey[]).filter(isUsed);
    expect(used.length, "해금 조건을 쓰는 도깨비가 없다").toBeGreaterThan(0);

    for (const key of used) {
      expect(plan, `해금 조건 ${key}(「${CONDITION_WORD[key]}」)가 기획서에 없다`).toContain(
        CONDITION_WORD[key],
      );
    }
  });

  it("보스 조건 도깨비가 실제로 있다", () => {
    // 문서만 그렇게 적고 로스터에 없으면 거짓말이 된다
    const byBoss = DOKEBI_ORDER.filter((id) => DOKEBI[id].requiresBoss);
    expect(byBoss.length, "보스로 열리는 도깨비가 없다").toBeGreaterThan(0);
  });

  it("완주 화면이 수집 현황을 적는다", () => {
    expect(plan).toContain("만난 도깨비 수");
  });
});

describe("백로그를 훑을 수 있는가", () => {
  /*
   * 표가 186행이 됐다. 다음 사람이 「무엇이 잘못돼 있었나」를 알려면 전부
   * 읽어야 하는데, 그러면 아무도 안 읽는다.
   *
   * 요약이 있고, 그 요약이 실제 항목을 가리키는지 본다.
   */
  const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");

  it("결함 요약이 앞에 있다", () => {
    const summary = backlog.indexOf("사용자에게 영향이 있던 결함");
    const table = backlog.indexOf("## 이후 반복에서 처리한");
    expect(summary, "요약이 없다").toBeGreaterThan(-1);
    expect(summary, "요약이 표 뒤에 있어 훑을 수 없다").toBeLessThan(table);
  });

  it("요약이 표 전체를 덮는다", () => {
    /*
     * 요약을 「반복 100~194」로 써 두고 그 뒤로 60행이 늘었다. 다음 사람이
     * 읽는 것은 요약이므로, 뒤쪽 절반이 요약에 없으면 **없는 것과 같다.**
     *
     * 마지막 행 번호가 요약이 밝힌 범위 안에 드는지 본다.
     */
    const numbers = [...backlog.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
    expect(numbers.length, `표 ${numbers.length}행`).toBeGreaterThan(10);
    const last = Math.max(...numbers);

    // 「반복 195~」처럼 열린 범위도, 「100~194」처럼 닫힌 범위도 받는다
    const ranges = [...backlog.matchAll(/반복 (\d+)~(\d*)/g)].map((m) => ({
      from: Number(m[1]),
      to: m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY,
    }));
    expect(ranges.length, "요약이 다루는 범위를 밝히지 않았다").toBeGreaterThan(0);

    const covered = ranges.some((range) => last >= range.from && last <= range.to);
    expect(
      covered,
      `마지막 행 ${last}이 요약 범위 밖이다 (${ranges.map((r) => `${r.from}~${r.to}`).join(", ")})`,
    ).toBe(true);
  });

  it("행 번호가 겹치지 않는다", () => {
    /*
     * 300부터 여덟 행이 같은 번호를 쓰고 있었다. 요약이 「(반복 300)」이라고
     * 적으면 여덟 중 어느 것인지 알 수 없고, 바로 위의 「요약이 실제 반복
     * 번호를 가리킨다」는 그중 아무거나 하나만 있어도 통과한다 —
     * **번호가 가리키는 곳이 하나임을 아무도 확인하지 않았다.**
     */
    const numbers = [...backlog.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
    const seen = new Set<number>();
    const duplicated: number[] = [];
    for (const n of numbers) {
      if (seen.has(n)) duplicated.push(n);
      else seen.add(n);
    }
    expect(duplicated, `겹친 번호: ${[...new Set(duplicated)].join(", ")}`).toEqual([]);
  });

  it("요약이 실제 반복 번호를 가리킨다", () => {
    /*
     * 「(반복 132)」처럼 적어 두고 그 행이 없으면 따라갈 수가 없다.
     * 요약에 적힌 번호가 표에 실재하는지 본다.
     */
    const summary = backlog.slice(
      backlog.indexOf("사용자에게 영향이 있던 결함"),
      backlog.indexOf("## 이후 반복에서 처리한"),
    );
    /*
     * 「(6건)」 같은 개수를 반복 번호로 세면 안 된다 — 처음에 그렇게 짰다가
     * 「반복 6 행이 없다」로 실패했다. 두 가지 인용 형식만 받는다:
     * 「(반복 100)」과 「(137·138·151)」.
     */
    const cited = [
      ...[...summary.matchAll(/반복 (\d+)/g)].map((m) => m[1]),
      ...[...summary.matchAll(/\((\d+(?:·\d+)*)\)/g)].flatMap((m) => m[1].split("·")),
    ];
    expect(cited.length, `인용한 반복 ${cited.length}개`).toBeGreaterThan(5);
    for (const number of cited) {
      expect(backlog, `반복 ${number} 행이 표에 없다`).toMatch(
        new RegExp(`\\|\\s*${number}\\s*\\|`),
      );
    }
  });
});

describe("README가 게임과 같은 숫자를 말하는가", () => {
  /*
   * 「만난 도깨비 n/4」라고 적혀 있었는데 분모를 바꾼 뒤에도 그대로였고,
   * 2분 체크리스트는 활강을 2단 점프로 안내했다 — 그렇게 하면 0.83초라
   * 목표에 닿지 않는다. **사람에게 부탁하는 문서가 안 되는 방법을 알려
   * 주고 있었다.**
   *
   * 문서가 숫자를 말하면 정본과 묶는다.
   */
  const readme = readFileSync("README.md", "utf8");

  it("활강 시간이 여정 목표와 같다", () => {
    const step = FIRST_RUN_QUEST.steps.find((s) => s.objective.kind === "glide");
    const seconds = step?.objective.kind === "glide" ? step.objective.seconds : 0;
    expect(seconds, "활강 목표를 못 찾았다").toBeGreaterThan(0);
    expect(readme, `문서가 ${seconds}초를 말하지 않는다`).toContain(`${seconds}초`);
  });

  it("활강을 평지 점프로 안내하지 않는다", () => {
    // 평지에서는 0.83초뿐이다. 올라가는 수단을 말해야 한다
    const line = readme.split("\n").find((row) => row.includes("활강")) ?? "";
    expect(line, `체크리스트: ${line}`).toMatch(/가로등|높은|올라/);
  });

  it("수집 숫자를 박아 두지 않는다", () => {
    /*
     * 「n/4」처럼 적으면 도깨비가 늘거나 세는 방식이 바뀔 때 조용히 거짓이
     * 된다. 실제로 분모를 바꾼 뒤 그대로 남아 있었다.
     */
    const collection = readme.split("\n").filter((row) => row.includes("만난 도깨비"));
    expect(collection.length, "수집 안내가 없다").toBeGreaterThan(0);
    for (const row of collection) {
      expect(row, `숫자를 박아 두었다: ${row}`).not.toMatch(/\/\s*\d/);
    }
  });
});

describe("MVP 목록이 실제 상태를 말하는가", () => {
  /*
   * 요구 목록이 **전부 미완**으로 남아 있었다. 도감도 저장도 포토 모드도
   * 다 있는데 문서만 보면 아무것도 없는 프로젝트다 — 처음 오는 사람이
   * 이미 있는 것을 다시 만들거나, 없는 것을 있다고 믿는다.
   *
   * 체크를 붙였으니 이제는 **체크한 것이 실제로 있는지**를 지킨다.
   */
  const plan = readFileSync("docs/PROJECT_PLAN.md", "utf8");
  const section = plan.slice(plan.indexOf("### 반드시 포함"), plan.indexOf("### MVP에서 제외"));

  it("목록을 실제로 읽었다", () => {
    const items = section.match(/^- \[[ x]\]/gm) ?? [];
    expect(items.length, `항목 ${items.length}개`).toBeGreaterThan(10);
  });

  it("전부 체크했다면 못 한 것을 본문에 적는다", () => {
    /*
     * 처음엔 「체크한 것과 아닌 것이 둘 다 있어야 한다」고 못 박았다. 그런데
     * 항목이 실제로 다 구현되자 이 검사가 **사실을 거짓으로 만들라고**
     * 요구하게 됐다 — 검사가 결함을 붙들던 경우들과 같은 실수다.
     *
     * 진짜 위험은 「전부 체크」가 **「다 됐다」로 읽히는 것**이다. 그건
     * 빈 체크박스가 아니라 문장으로 막는다: 못 한 부분은 그 줄에 적는다.
     */
    expect(section, "체크한 항목이 없다").toMatch(/^- \[x\]/m);

    const unchecked = section.match(/^- \[ \]/gm) ?? [];
    if (unchecked.length > 0) return;

    // 전부 체크된 상태라면, 못 한 부분을 밝힌 줄이 있어야 한다
    expect(section, "전부 체크했는데 한계를 밝힌 줄이 없다").toMatch(/\*\*[^*]*없다\*\*|해당 없음/);
  });

  it("체크가 무엇을 뜻하는지 밝힌다", () => {
    // 「구현됐다」와 「사람이 확인했다」는 다르다. 이 프로젝트에서는 특히
    expect(section, "체크의 의미가 없다").toContain("사람이 플레이해 확인했다는");
  });

  it("체크한 기능이 실제로 코드에 있다", () => {
    /*
     * 목록의 낱말과 코드를 잇는다. 지금은 대표적인 셋만 본다 — 이름이
     * 바뀌면 여기서 걸리고, 그때 목록도 함께 손보게 된다.
     */
    const anchors: [string, string][] = [
      ["도깨비 도감", "src/components/hud/Codex.tsx"],
      ["포토 모드", "src/components/hud/PhotoControls.tsx"],
      ["진행 상황 자동 저장", "src/app/play/useProgressSave.ts"],
    ];
    for (const [label, path] of anchors) {
      const row = section.split("\n").find((line) => line.includes(label)) ?? "";
      expect(row, `${label} 항목이 없다`).not.toBe("");
      expect(row.startsWith("- [x]"), `${label}이 체크되어 있지 않다`).toBe(true);
      expect(() => readFileSync(path, "utf8"), `${path}가 없다`).not.toThrow();
    }
  });
});

describe("백로그 요약이 행 번호를 빠짐없이 덮는가", () => {
  /*
   * 백로그가 길어지면 구간마다 요약을 둔다. 그런데 **요약을 더하는 일 자체가
   * 앞 요약을 낡게 만든다** — 열린 범위(`195~`) 뒤에 새 절을 붙이면 앞 절이
   * 「그 뒤 전부」를 주장하는 채로 남아 둘 다 참일 수 없게 된다. 실제로 그렇게
   * 한 번 어긋났다.
   *
   * 사람이 셀 일이 아니라 여기서 센다: 구간이 **이어지고**, 겹치지 않고,
   * 마지막만 열려 있어야 한다.
   */
  const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");
  const headings = [...backlog.matchAll(/^## .*\(반복 (\d+)~(\d*) 요약\)/gm)].map((match) => ({
    from: Number(match[1]),
    to: match[2] === "" ? null : Number(match[2]),
  }));

  it("요약 구간을 실제로 읽었다", () => {
    // 제목 형식이 바뀌면 빈 목록이 되고 아래 검사가 아무것도 안 본다
    expect(headings.length, `찾은 요약 구간 ${headings.length}개`).toBeGreaterThan(1);
  });

  it("구간이 끊기지도 겹치지도 않는다", () => {
    for (let i = 1; i < headings.length; i += 1) {
      const previous = headings[i - 1];
      const current = headings[i];
      expect(
        previous.to,
        `${previous.from}~ 구간이 열린 채로 뒤에 ${current.from}~ 구간이 왔다`,
      ).not.toBeNull();
      expect(
        current.from,
        `${previous.from}~${previous.to} 다음이 ${current.from}에서 시작한다`,
      ).toBe((previous.to ?? 0) + 1);
    }
  });

  it("마지막 구간만 열려 있다", () => {
    // 닫아 두면 다음 행을 더하는 순간 거짓이 된다
    const last = headings[headings.length - 1];
    expect(last.to, `마지막 구간이 ${last.from}~${last.to}로 닫혀 있다`).toBeNull();
  });

  it("행 번호가 겹치지 않는다", () => {
    /*
     * 요약과 본문이 서로를 **번호로** 가리킨다(「반복 495에서 고쳤다」). 같은
     * 번호가 둘이면 그 참조가 어느 쪽을 말하는지 알 수 없다.
     *
     * 빠진 번호는 괜찮다 — 옛 정리에서 지워진 자리다. 겹치는 것만 막는다.
     */
    const rows = [...backlog.matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
    const seen = new Set<number>();
    const duplicates: number[] = [];
    for (const row of rows) {
      if (seen.has(row)) duplicates.push(row);
      else seen.add(row);
    }
    expect(duplicates, `번호가 겹친다: ${[...new Set(duplicates)].join(", ")}`).toEqual([]);
  });

  it("열린 구간이 실제 행 번호 안에서 시작한다", () => {
    const rows = [...backlog.matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
    const newest = Math.max(...rows);
    const last = headings[headings.length - 1];
    expect(
      last.from,
      `마지막 요약은 ${last.from}~인데 행은 ${newest}까지 있다`,
    ).toBeLessThanOrEqual(newest);
  });
});

describe("검사가 짚는 이정표가 실제로 있는가", () => {
  /*
   * **이정표가 사라져도 검사는 조용하다.**
   *
   * 「2분 묶음이 다섯을 넘지 않는가」가 `### 여유`까지 잘랐는데 그 제목이
   * 없어졌다. `indexOf`가 -1을 주니 절 전체를 셌고, 뒤쪽 항목이 마침
   * 글머리표라 **우연히 통과**했다 — 아무도 몰랐다.
   *
   * 검사들이 `indexOf`로 짚는 문자열을 모아 **소스나 문서에 실제로 있는지**
   * 확인한다. 이름을 바꾸는 사람이 여기서 멈추고 검사도 함께 고치게 된다.
   *
   * **건초더미를 넓게 잡는 것이 중요하다.** 처음엔 `src`의 `.ts`만 봤다가
   * CSS 선택자(`:focus-visible`)와 문서 제목을 「죽었다」고 잘못 골라냈다.
   * 이스케이프(`\n`)도 풀어야 실제 문자열과 맞는다.
   */
  const haystack = [
    ...collectSources("src").map((path) => readFileSync(path, "utf8")),
    readFileSync("src/app/globals.css", "utf8"),
    // 문서를 손으로 적지 않는다 — 새 문서가 생기면 목록이 낡아 없는 이정표를 만들어 낸다
    ...markdownFiles().map((name) => readFileSync(name, "utf8")),
  ].join("\n");

  const landmarks = readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"))
    .flatMap((name) =>
      [
        ...readFileSync(join("tests", name), "utf8").matchAll(/indexOf\("((?:[^"\\]|\\.){6,})"\)/g),
      ].map((match) => ({
        file: name,
        literal: match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      })),
    );

  it("짚는 이정표를 실제로 모았다", () => {
    // 정규식이 낡으면 빈 목록이 되고 아래 검사가 아무것도 안 본다
    expect(landmarks.length, `찾은 이정표 ${landmarks.length}개`).toBeGreaterThan(30);
  });

  it("모두 소스나 문서에 있다", () => {
    const missing = landmarks
      .filter((item) => !haystack.includes(item.literal))
      .map((item) => `${item.file}: ${JSON.stringify(item.literal).slice(0, 60)}`);
    expect(missing, `사라진 이정표를 짚는다:\n${missing.join("\n")}`).toEqual([]);
  });
});

describe("길잡이 절이 수를 들고 있지 않은가", () => {
  /*
   * 백로그 맨 위의 「지금 상태」는 **가리키는 자리**다 — 어디를 보라고만 한다.
   * 거기에 수를 적으면 그 수의 사본이 하나 더 생기고, **검사가 안 보는 사본은
   * 반드시 낡는다.**
   *
   * 실제로 이 절을 쓰면서 사람 몫 개수를 두 번 적었고, 한 번 지우고도
   * 문단에 남은 것을 못 봤다. **수는 눈에 안 띈다.**
   *
   * 과거 기록(「스물한 번 뚫어 다섯 구멍」처럼 이미 일어난 일)은 낡지 않으므로
   * 막지 않는다. 막는 것은 **살아 있는 개수**다 — 「N개」·「N 질문」.
   */
  const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");
  const from = backlog.indexOf("## 지금 상태");
  const block = backlog.slice(from, backlog.indexOf("\n## ", from + 1));

  it("길잡이 절을 실제로 찾았다", () => {
    expect(from, "「지금 상태」 절이 없다").toBeGreaterThan(0);
    expect(block.length, `길잡이 절 ${block.length}자`).toBeGreaterThan(200);
  });

  it("살아 있는 개수를 적지 않는다", () => {
    const counts = block.match(/[0-9한두세네다섯여섯일곱여덟아홉열스물]+\s*(개|질문)/g) ?? [];
    expect(counts, `길잡이 절이 수를 들고 있다: ${counts.join(", ")}`).toEqual([]);
  });
});
