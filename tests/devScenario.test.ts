import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BOSS_HOME } from "@/game/combat/bossSim";
import { companionParty, DOKEBI_ORDER, revealedDokebi } from "@/game/dokebi/roster";
import { CLUES } from "@/game/quest/clues";
import { FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { readCode } from "./support/source";

import { parseScenario, SCENARIOS } from "@/game/systems/devScenario";
import { TIME_OF_DAY, TIME_OF_DAY_ORDER } from "@/game/world/timeOfDay";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 확인용 시작 상태.
 *
 * 이 목록은 백로그의 "눈이 필요한 것"과 짝을 이룬다. 어긋나면 확인하려는 것과
 * 실제로 가는 곳이 달라진다 — 그러면 확인 도구가 아니라 혼란의 원인이다.
 */

const layout = buildCityLayout();

describe("parseScenario", () => {
  it("개발 빌드에서만 동작한다", () => {
    /*
     * 배포된 게임에서 주소만으로 진행을 건너뛸 수 있으면 확인 도구가 아니라
     * 치트다.
     */
    expect(parseScenario("?see=boss", false), "프로덕션에서 시나리오가 열렸다").toBeNull();

    /*
     * 모든 지점을 확인한다. 하나만 보면 새 지점이 추가될 때 빠진다 —
     * 배포된 게임에서 주소만으로 보스 앞이나 완주 화면으로 건너뛸 수 있으면
     * 처음 하는 사람의 경험이 무너진다.
     */
    for (const id of Object.keys(SCENARIOS)) {
      expect(parseScenario(`?see=${id}`, false), `${id}이 프로덕션에서 열린다`).toBeNull();
    }
    expect(parseScenario("?see=boss", true)?.id).toBe("boss");
  });

  it("모르는 이름은 무시한다", () => {
    // 오타로 엉뚱한 상태에서 시작하면 무엇을 보고 있는지 알 수 없다
    expect(parseScenario("?see=bosss", true)).toBeNull();
    expect(parseScenario("?see=", true)).toBeNull();
    expect(parseScenario("", true)).toBeNull();
  });

  it("다른 파라미터에 반응하지 않는다", () => {
    expect(parseScenario("?debug=1&x=2", true)).toBeNull();
  });

  it.each(["summon", "ability"])("%s 확인 지점은 한 도깨비의 능력만 떼어 볼 수 있다", (id) => {
    // Given
    const search = `?see=${id}&dokebi=mulbineul`;

    // When
    const scenario = parseScenario(search, true);

    // Then
    expect(scenario?.dokebi).toBe("mulbineul");
    expect(scenario?.metDokebi).toEqual(["mulbineul"]);
    expect(
      scenario
        ? companionParty(
            "mulbineul",
            {
              defeatedTotal: scenario.defeatedTotal ?? 0,
              questCompleted: scenario.questCompleted === true,
              bossDefeated: scenario.bossDefeated,
            },
            scenario.metDokebi ?? [],
          )
        : [],
    ).toContain("mulbineul");
  });

  it("모르는 도깨비로 능력 확인을 열지 않는다", () => {
    // Given / When / Then
    expect(parseScenario("?see=summon&dokebi=unknown", true)).toBeNull();
    expect(parseScenario("?see=ability&dokebi=unknown", true)).toBeNull();
  });

  it("프로토타입에 있는 이름도 없는 것으로 본다", () => {
    /*
     * `SCENARIOS[value]`만 쓰면 자기 것이 아닌 것까지 딸려 나온다 —
     * `?see=constructor`가 `Object` 함수를 시나리오로 돌려줬다. 뒤쪽 코드는
     * `scenario.timeOfDay`를 읽으므로 전부 undefined가 되어 조용히 이상한
     * 상태로 시작한다.
     */
    for (const key of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      expect(parseScenario(`?see=${key}`, true), `${key}가 시나리오로 통했다`).toBeNull();
    }
  });
});

describe("확인 지점", () => {
  it("이름과 설명이 모두 있다", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      expect(scenario.label.length, `${scenario.id}`).toBeGreaterThan(5);
      expect(scenario.id.length).toBeGreaterThan(0);
    }
  });

  it("시작 위치가 월드 안이다", () => {
    // 밖에서 시작하면 경계 클램프가 끌어와 엉뚱한 곳에 선다
    for (const scenario of Object.values(SCENARIOS)) {
      if (!scenario.spawn) continue;
      expect(Math.abs(scenario.spawn.x), `${scenario.id}.x`).toBeLessThan(layout.halfExtent);
      expect(Math.abs(scenario.spawn.z), `${scenario.id}.z`).toBeLessThan(layout.halfExtent);
    }
  });

  it("보스 확인 지점이 보스 근처다", () => {
    /*
     * 너무 멀면 걸어가야 하고, 너무 가까우면 시작하자마자 맞는다.
     * 예고 링이 보이는 거리여야 한다.
     */
    const boss = SCENARIOS.boss.spawn;
    expect(boss, "보스 확인 지점에 위치가 없다").toBeTruthy();
    if (!boss) return;

    const distance = Math.hypot(boss.x - BOSS_HOME.x, boss.z - BOSS_HOME.z);
    expect(distance, `${distance.toFixed(1)}m`).toBeGreaterThan(8);
    expect(distance, `${distance.toFixed(1)}m`).toBeLessThan(30);
  });

  it("시간대·도깨비 이름이 실제로 존재한다", () => {
    for (const scenario of Object.values(SCENARIOS)) {
      if (scenario.timeOfDay) {
        expect(TIME_OF_DAY_ORDER, `${scenario.id}`).toContain(scenario.timeOfDay);
      }
      for (const id of scenario.metDokebi ?? []) {
        expect(DOKEBI_ORDER, `${scenario.id}`).toContain(id);
      }
    }
  });

  it("백로그가 확인 지점을 안내한다", () => {
    /*
     * 만들어 두고 알려 주지 않으면 없는 것과 같다 — 보스를 지도에 표시하지
     * 않았던 것(반복 63)과 같은 종류다.
     */
    const backlog = readFileSync("docs/RALPH_BACKLOG.md", "utf8");
    expect(backlog, "확인 지점 사용법이 백로그에 없다").toContain("?see=");

    /*
     * **안내표 안**을 본다. 파일 전체에서 이름만 찾던 때는, 표에 없는 지점도
     * 다른 문장에 이름이 나오기만 하면 통과했다 — 실제로 `air`와 `result`가
     * 표에서 빠진 채로 검사를 통과하고 있었다. 「어딘가에 적혀 있다」와
     * 「안내표에 있다」는 다르다.
     */
    const heading = "### 확인 지점으로 바로 가기";
    const start = backlog.indexOf(heading);
    expect(start, "안내표 제목이 없다").toBeGreaterThan(-1);
    const guide = backlog.slice(start, backlog.indexOf("\n## ", start));

    // 정본을 그대로 순회한다 — 감싸는 함수는 같은 일을 하면서 제품에만 남았다
    for (const name of Object.keys(SCENARIOS)) {
      expect(guide, `${name} 지점이 안내표에 빠졌다`).toContain(`?see=${name}`);
    }
  });
});

describe("확인 지점이 자기 질문에 답할 수 있는가", () => {
  /*
   * `?see=shrine`은 「빛기둥이 골목에서 보이는지」를 묻는다. 그런데 자리는
   * 해금 조건을 채워야 보이므로, 시나리오가 조건을 못 주면 **빈 골목만 보고
   * 오게 된다.** 브라우저에서 실제로 그런 화면이 나와 확인하게 됐다.
   */
  it("도깨비 자리 확인 지점은 그 자리를 드러낸다", () => {
    const scenario = SCENARIOS.shrine;
    const revealed = revealedDokebi({
      defeatedTotal: scenario.defeatedTotal ?? 0,
      questCompleted: false,
    });
    expect(revealed, `드러난 도깨비: ${revealed.join(", ") || "없음"}`).toContain("geueum");
  });

  it("도깨비 자리 확인 지점은 아직 만나지 않은 상태로 간다", () => {
    // 이미 만났으면 자리가 사라져 있다 — 보러 갈 것이 없다
    expect(SCENARIOS.shrine.metDokebi ?? []).not.toContain("geueum");
  });

  it("흔적 확인 지점이 흔적 단계에서 시작한다", () => {
    /*
     * 흔적은 여정의 마지막 단계다. 앞 단계를 다 거치려면 10분이 걸리는데,
     * 그 앞에 그걸 두고 「봐 달라」고 하는 것은 앞뒤가 맞지 않는다.
     *
     * 단계 번호가 실제로 흔적 단계를 가리키는지 본다 — 여정에 단계가 하나
     * 끼면 조용히 다른 목표가 열린다.
     */
    const index = SCENARIOS.clues.questStepIndex;
    expect(index, "단계를 지정하지 않았다").toBeGreaterThanOrEqual(0);
    if (index === undefined) return;
    expect(FIRST_RUN_QUEST.steps[index]?.objective.kind, `단계 ${index}`).toBe("clue");
  });

  it("흔적 확인 지점이 흔적 근처에서 시작한다", () => {
    // 멀면 걸어가야 하고, 그러면 확인하려던 것 앞에 다시 절차가 생긴다
    const spawn = SCENARIOS.clues.spawn;
    expect(spawn, "위치가 없다").toBeTruthy();
    if (!spawn) return;
    const distance = Math.min(
      ...CLUES.map((clue) => Math.hypot(spawn.x - clue.x, spawn.z - clue.z)),
    );
    expect(distance, `가장 가까운 흔적까지 ${distance.toFixed(1)}m`).toBeLessThan(30);
  });

  it("공중 확인 지점은 실제로 공중에서 시작한다", () => {
    /*
     * 땅에 세워 두면 캐릭터 뒤에 늘 건물이나 바닥이 온다 — 하늘을 등진 모습은
     * 확인할 수가 없다. 「한낮」 지점이 그 이름을 달고 있다가 못 지켰다.
     */
    const scenario = SCENARIOS.air;
    expect(scenario.spawnHeight ?? 0, "땅에서 시작하면 하늘을 등질 수 없다").toBeGreaterThan(10);
  });

  it("공중 확인 지점은 어려운 쪽(밝은 하늘)을 본다", () => {
    // 어두운 하늘에서는 주황 후드가 당연히 보인다. 묻힌다면 밝은 쪽에서 묻힌다
    const preset = TIME_OF_DAY[SCENARIOS.air.timeOfDay ?? "sunset"];
    const brightest = Math.max(...TIME_OF_DAY_ORDER.map((id) => TIME_OF_DAY[id].sunIntensity));
    expect(preset.sunIntensity, `${preset.name}은 가장 밝은 시간대가 아니다`).toBe(brightest);
  });

  it("동행 확인 지점은 모든 도깨비를 데리고 간다", () => {
    /*
     * 「셋」을 박아 두었더니 넷이 된 뒤 거짓이 됐다. 정본에서 유도한다 —
     * 도깨비가 늘 때 이 지점이 따라오지 않으면 새 도깨비를 볼 방법이 없다.
     */
    const scenario = SCENARIOS.party;
    for (const id of DOKEBI_ORDER) {
      expect(scenario.metDokebi ?? [], `${id}가 빠졌다`).toContain(id);
      expect(
        /*
         * 조건을 직접 참으로 넣지 않는다. `questCompleted: true`를 손으로
         * 넣었더니 시나리오가 그 값을 주지 않는데도 통과했고, 실제 화면에서는
         * 물비늘이 「???」로 잠겨 있었다 — **시나리오가 실제로 만드는 상태**를
         * 그대로 넣어야 검사가 의미를 가진다.
         */
        revealedDokebi({
          defeatedTotal: scenario.defeatedTotal ?? 0,
          questCompleted: scenario.questCompleted === true,
          bossDefeated: scenario.bossDefeated,
        }),
      ).toContain(id);
    }
  });
});

describe("확인 지점을 여는 조건", () => {
  /*
   * 게이트가 `process.env.NODE_ENV !== "production"`이다. Next가 빌드 때
   * 상수로 바꿔 넣으므로 배포본에서는 조건이 통째로 거짓이 된다.
   *
   * 이 조건식이 바뀌면(예: 다른 환경변수로 옮기거나 기본값을 참으로 두면)
   * 배포된 게임에서 확인 지점이 열린다 — 조용히 일어나므로 여기서 지킨다.
   */
  it("호출부가 프로덕션을 명시적으로 배제한다", () => {
    const client = readFileSync("src/app/play/PlayClient.tsx", "utf8");
    expect(client).toContain('process.env.NODE_ENV !== "production"');
  });

  it("기본값으로 열리지 않는다", () => {
    // 인자를 빠뜨렸을 때 열리는 쪽으로 기울면 안 된다
    const source = readFileSync("src/game/systems/devScenario.ts", "utf8");
    expect(source, "isDevelopment에 기본값이 있다").not.toMatch(/isDevelopment\s*=\s*true/);
  });
});

describe("차단이 실제로 걸리는가 — 호출부", () => {
  /*
   * 함수는 `isDevelopment`가 거짓이면 무조건 null을 준다. 그런데 **부르는
   * 쪽이 참을 넘기면** 그 차단은 없는 것과 같다. 선언과 호출을 대조한다.
   *
   * 확인 지점은 이제 여정·만난 도깨비·흔적을 **만들어 주고** 저장과도 주고받는다.
   * 프로덕션에서 열리면 아무나 `?see=party`로 전부 열 수 있다.
   */
  const client = readCode("src/app/play/PlayClient.tsx");

  it("호출부가 빌드 환경을 보고 넘긴다", () => {
    const call = client.slice(client.indexOf("parseScenario("));
    expect(call.slice(0, 160), "환경을 보지 않고 시나리오를 연다").toContain(
      'process.env.NODE_ENV !== "production"',
    );
  });

  it("참을 박아 넘기지 않는다", () => {
    // 디버깅하다 `true`로 두고 잊는 것이 가장 그럴듯한 사고다
    const call = client.slice(client.indexOf("parseScenario("));
    expect(call.slice(0, 160), "차단을 껐다").not.toMatch(/parseScenario\([^)]*,\s*true\s*\)/);
  });
});

describe("확인 지점이 설 수 있는 자리에서 시작하는가", () => {
  /*
   * 기존 검사는 **월드 범위 안**인지만 봤다. 범위 안이어도 **건물 안**이면
   * 사람은 벽에 갇힌 채 시작한다 — 확인하러 온 사람이 첫 화면에서 막힌다.
   *
   * 좌표는 손으로 고른다(`BOSS_HOME.z + 14`, `CLUES[0].z + 16` 처럼). 도시
   * 배치가 바뀌면 그 자리가 건물이 될 수 있는데, 지금은 아무도 다시 재지 않는다.
   *
   * 지금은 전부 정상이다. 이 검사는 **새 확인 지점을 더하는 날**을 위한 것이다.
   */
  it("좌표를 정한 지점이 있다", () => {
    const placed = Object.values(SCENARIOS).filter((scenario) => scenario.spawn);
    expect(placed.length, `자리를 정한 지점 ${placed.length}개`).toBeGreaterThan(1);
  });

  it("건물 안에서 시작하지 않는다", () => {
    const stuck = Object.values(SCENARIOS)
      .filter((scenario) => scenario.spawn)
      .filter((scenario) => {
        const spot = scenario.spawn as { x: number; z: number };
        return layout.colliders.some(
          (box) =>
            spot.x >= box.minX && spot.x <= box.maxX && spot.z >= box.minZ && spot.z <= box.maxZ,
        );
      })
      .map((scenario) => scenario.id);
    expect(stuck, `건물 안에서 시작한다: ${stuck.join(", ")}`).toEqual([]);
  });
});
