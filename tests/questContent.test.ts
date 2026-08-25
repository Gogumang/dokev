import { readFileSync } from "node:fs";

import { readCode } from "./support/source";

import { describe, expect, it } from "vitest";

import { BOSS } from "@/game/combat/bossSim";

import { COMBAT_TUNING } from "@/game/combat/combatSim";
import { GRAPPLE, LOCOMOTION } from "@/game/config/tuning";
import { createLocomotionState, stepLocomotion } from "@/game/player/locomotion";
import { buildCityDetails } from "@/game/world/cityDetails";
import { buildCityLayout, ROAD_CENTERS } from "@/game/world/cityLayout";
import { BOSS_QUEST, FIRST_RUN_QUEST } from "@/game/quest/questContent";
import { CONTROL_CODES, CONTROLS } from "@/game/systems/controls";

describe("안내문이 실제 규칙과 맞는가", () => {
  /*
   * 랜딩에 「진행 상황은 저장되지 않습니다」가 남아 있던 것과 같은 종류다.
   * 안내문은 코드가 아니라 사람이 읽는 약속이고, 규칙이 바뀌어도 따라오지
   * 않는다. 숫자와 모양을 못 박아 둔다.
   */
  const steps = [...FIRST_RUN_QUEST.steps, ...BOSS_QUEST.steps];
  const hints = steps.map((step) => step.hint).join("\n");

  /** 안내문에 쓰는 우리말 수 */
  const COUNT_WORDS: Record<string, number> = {
    한: 1,
    두: 2,
    세: 3,
    네: 4,
    다섯: 5,
  };

  it("「n번 때리면」이 적 체력과 맞는다", () => {
    /*
     * 예전에는 「두 번 때리면」이라는 **그 문장이 있는지**만 봤다. 그러면
     * 누가 힌트를 「세 번 때리면」으로 고쳐 적는 순간 `includes`가 거짓이
     * 되어 검사가 **조용히 사라진다** — 틀린 안내를 막으려던 검사가 틀린
     * 안내에만 반응하지 않는 꼴이다.
     *
     * 문장에서 수를 읽어 비교한다. 어떤 낱말을 쓰든 숫자가 맞아야 한다.
     */
    const claim = /(한|두|세|네|다섯|\d+)\s*번 때리면/.exec(hints);
    expect(claim, `때리는 횟수를 말하는 힌트가 없다:\n${hints}`).not.toBeNull();
    if (!claim) return;

    const said = COUNT_WORDS[claim[1]] ?? Number(claim[1]);
    expect(said, `수를 못 읽었다: ${claim[0]}`).toBeGreaterThan(0);
    expect(said, `안내문은 ${claim[0]}인데 체력은 ${COMBAT_TUNING.maxHp}`).toBe(
      COMBAT_TUNING.maxHp,
    );
  });

  it("힌트가 말하는 표식 모양이 지도의 정본과 같다", () => {
    /*
     * 예전에는 「삼각형」이라는 낱말이 **있는지만** 봤다. 누가 힌트를
     * 「붉은 마름모」로 고쳐 적으면 `includes`가 거짓이 되어 검사가 조용히
     * 사라진다 — 위 「n번 때리면」과 같은 구멍이다.
     *
     * 힌트에 나오는 모양 낱말을 읽어 `MARKS.boss`와 대조한다.
     */
    const SHAPE_WORDS: Record<string, string> = {
      삼각형: "triangle",
      동그라미: "circle",
      원: "circle",
      마름모: "diamond",
      화살표: "arrow",
    };

    const said = Object.keys(SHAPE_WORDS).find((word) => hints.includes(word));
    expect(said, `힌트가 표식 모양을 말하지 않는다:\n${hints}`).toBeDefined();
    if (!said) return;

    const map = readFileSync("src/game/systems/cityMapPaint.ts", "utf8");
    const marks = map.slice(map.indexOf("const MARKS = {"), map.indexOf("} as const;"));
    const boss = /boss: \{ color: "(#[0-9a-fA-F]{6})", shape: "(\w+)"/.exec(marks);
    expect(boss, "지도의 대장 표식을 못 읽었다").toBeTruthy();
    if (!boss) return;

    expect(SHAPE_WORDS[said], `힌트는 ${said}인데 지도 정본은 ${boss[2]}`).toBe(boss[2]);

    // 「붉은」도 안내문의 약속이다
    expect(boss[1], `보스 표식 색: ${boss[1]}`).toMatch(/#ff[0-9a-f]{4}/i);

    /*
     * 정본이 그렇다고 적어 둔 것과 실제로 그리는 것은 다르다. 그리는 자리를
     * 직접 가리킨다 — 앵커는 **그 코드에만 있는 모양**이어야 한다(예전에
     * 「BOSS_HOME.x의 첫 등장」으로 잘랐다가 엉뚱한 데를 검사했다).
     */
    const bossDraw = map.slice(map.indexOf("toFullMapPixel(boss.x"));
    const body = bossDraw.slice(0, 400);
    expect(body, "보스 표식이 삼각형이 아니다").toContain("lineTo");
    expect(body, "보스가 표식 상수를 쓰지 않는다").toContain("MARKS.boss.color");
  });

  it("달리기 목표 속도에 실제로 닿을 수 있다", () => {
    const speedStep = FIRST_RUN_QUEST.steps.find((s) => s.objective.kind === "reachSpeed");
    const target = speedStep?.objective.kind === "reachSpeed" ? speedStep.objective.speed : 0;
    expect(
      LOCOMOTION.run.maxSpeed,
      `목표 ${target}m/s인데 달리기 최고 속도는 ${LOCOMOTION.run.maxSpeed}`,
    ).toBeGreaterThan(target);
  });
});

describe("다시 일어난다는 것을 알려 주는가", () => {
  /*
   * 고물 대장은 25초 뒤 다시 선다. 그런데 완주 문구는 「이제 도시는 온전히
   * 놀이터다」라고만 했다 — 다시 마주친 사람은 이겼는데 왜 또 있는지 알 수
   * 없어 버그로 읽는다.
   *
   * 반복해서 싸울 수 있다는 것은 **알려 주면 기능이고 숨기면 결함**이다.
   */
  it("보스가 다시 서는 규칙이 실제로 있다", () => {
    // 문구만 그렇게 적고 규칙이 없으면 반대 방향의 거짓말이 된다
    expect(BOSS.downSeconds, `${BOSS.downSeconds}초`).toBeGreaterThan(0);
  });

  it("완주 문구가 그 사실을 담는다", () => {
    expect(BOSS_QUEST.completionHint, "다시 일어난다는 말이 없다").toMatch(/다시 (일어나|서)/);
  });

  it("첫 여정 문구는 그런 약속을 하지 않는다", () => {
    // 첫 여정에는 되살아나는 상대가 없다 — 없는 것을 말하면 찾아 헤맨다
    expect(FIRST_RUN_QUEST.completionHint).not.toMatch(/다시 (일어나|서)/);
  });
});

describe("활강 목표에 실제로 닿을 수 있는가", () => {
  /*
   * 목표가 2초였는데, 도시에서 걸 수 있는 가장 높은 곳(가로등 5.4m)에서
   * 뛰어내려도 1.92초, 공중 점프까지 써야 2.12초였다 — **여유 0.12초.**
   * 게다가 힌트는 「점프한 뒤 떨어질 때」라고만 적어, 그대로 하면 0.83초로
   * 영원히 못 채웠다. 첫 여정의 마지막 단계에서 그러면 그냥 벽이다.
   *
   * 조건식으로 추론하지 않는다. 실제 이동 규칙을 돌려서 잰다.
   */
  const layout = buildCityLayout();
  const anchorHeight = Math.max(
    ...layout.props.filter((prop) => prop.tone === 0 && prop.height > 4).map((prop) => prop.height),
  );

  /** 주어진 높이에서 뛰어내려 활강을 유지한 시간(초) */
  function glideSeconds(startY: number, useAirJump: boolean): number {
    const dt = 1 / 60;
    let state = createLocomotionState({ x: 0, y: startY, z: 0 });
    const input = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      jumpHeld: false,
      grappleRequested: false,
      run: false,
      vehicle: null,
      cameraYaw: 0,
    };
    // 그 자리에서 뛴다 — 발밑이 그 높이라고 보고 한 번 점프시킨다
    state = stepLocomotion(state, { ...input, jump: true, jumpHeld: true }, dt, startY);

    let gliding = 0;
    let usedAirJump = false;
    for (let i = 0; i < 60 * 15; i += 1) {
      // 공중 점프는 떨어지기 시작한 뒤 한 번만 쓴다
      const airJump = useAirJump && !usedAirJump && state.velocity.y < 0;
      if (airJump) usedAirJump = true;
      state = stepLocomotion(state, { ...input, jump: airJump, jumpHeld: true }, dt, 0);
      if (state.gliding) gliding += dt;
      if (state.grounded && i > 5) break;
    }
    return gliding;
  }

  /*
   * 같은 단계를 두 번 찾아 놓고 한 번은 옵셔널로, 한 번은 단언으로 읽고 있었다 —
   * 단계가 사라지면 앞은 undefined를 흘리고 뒤는 그것을 객체로 우겼다. 한 번만
   * 찾고, 좁히는 일은 타입이 하게 둔다.
   */
  const glideStep = FIRST_RUN_QUEST.steps.find((step) => step.objective.kind === "glide");
  const target = glideStep?.objective.kind === "glide" ? glideStep.objective.seconds : 0;

  it("활강 목표가 실제로 있다", () => {
    // 단계가 사라지면 아래 검사들이 0을 상대로 조용히 통과한다
    expect(target, `목표 ${target}초`).toBeGreaterThan(0);
  });

  it("걸 수 있는 가장 높은 곳을 도시에서 찾았다", () => {
    expect(anchorHeight, `앵커 높이 ${anchorHeight}`).toBeGreaterThan(4);
  });

  it("공중 점프 없이도 채울 수 있다", () => {
    /*
     * 공중 점프까지 써야 겨우 되면 조작을 막 익힌 사람에게는 안 되는 것과
     * 같다. 여유를 두고 확인한다.
     */
    const plain = glideSeconds(anchorHeight, false);
    expect(plain, `${anchorHeight}m에서 ${plain.toFixed(2)}초, 목표 ${target}초`).toBeGreaterThan(
      target * 1.2,
    );
  });

  it("힌트가 말한 걸 곳에 실제로 닿는다", () => {
    /*
     * 활강 목표는 높은 데서 뛰어내려야 채워지고, 올라갈 길은 그래플뿐이다.
     * 그런데 **그래플이 가로등에 닿는지**는 아무도 확인하지 않았다 —
     * 사거리를 1m로 줄여도 모든 검사가 통과했다.
     *
     * 닿지 않으면 힌트가 시키는 대로 해도 안 되는 것이고, 그건 이 저장소에서
     * 이미 두 번 겪은 결함이다.
     */
    /*
     * 예전에는 `props`에서 `tone === 0 && height > 4`로 추려 냈다. 배치가
     * 앵커를 명시하게 바뀐 뒤에도 그 추측을 계속 썼다면, **자연 구역의 선돌은
     * 세어지지 않아** 숲이 통째로 사거리 밖으로 보였을 것이다 — 실제로 그렇게
     * 걸렸다. 제품이 읽는 목록을 그대로 쓴다.
     */
    const anchors = layout.grappleAnchors.map((anchor) => ({
      x: anchor.x,
      y: anchor.height,
      z: anchor.z,
    }));
    expect(anchors.length, `걸 수 있는 곳 ${anchors.length}개`).toBeGreaterThan(10);

    /*
     * 도로 위 몇 곳에서 재 본다. 사람 눈높이(1.5m)에서 가장 가까운 기둥
     * 꼭대기까지의 거리가 사거리 안이어야 한다.
     */
    const spots = ROAD_CENTERS.flatMap((x) => ROAD_CENTERS.map((z) => ({ x, z })));
    expect(spots.length, `잰 지점 ${spots.length}곳`).toBeGreaterThan(4);

    for (const spot of spots) {
      const nearest = Math.min(
        ...anchors.map((anchor) =>
          Math.hypot(anchor.x - spot.x, anchor.y - 1.5, anchor.z - spot.z),
        ),
      );
      expect(
        nearest,
        `(${spot.x.toFixed(0)}, ${spot.z.toFixed(0)})에서 가장 가까운 기둥이 ${nearest.toFixed(1)}m — 사거리 ${GRAPPLE.maxRange}m 밖이다`,
      ).toBeLessThanOrEqual(GRAPPLE.maxRange);
    }
  });

  it("평지에서는 못 채운다 — 그래서 힌트가 올라가는 길을 말해야 한다", () => {
    /*
     * 이게 뒤집히면(평지로도 가능해지면) 힌트에서 가로등을 빼야 한다.
     * 지금은 평지가 안 되므로 올라가는 수단을 반드시 적어야 한다.
     */
    const flat = glideSeconds(0, true);
    expect(flat, `평지 2단 점프로 ${flat.toFixed(2)}초`).toBeLessThan(target);

    const step = FIRST_RUN_QUEST.steps.find((s) => s.objective.kind === "glide");
    expect(step?.hint, `힌트: ${step?.hint}`).toMatch(/가로등|높은|올라/);
  });
});

describe("목표 종류마다 닿을 수 있는가", () => {
  /*
   * 달성 가능성 검사가 「달리기 목표 속도」 하나뿐이었다. 그 사이 활강 목표는
   * 사실상 벽이 되어 있었다(2초인데 가장 높은 곳에서 뛰어도 1.92초).
   *
   * 나머지 종류도 같은 방식으로 지킨다 — **막힌 뒤에 알면 늦다.**
   */
  const layout = buildCityLayout();
  const quests = [FIRST_RUN_QUEST, BOSS_QUEST];

  const reachSteps = quests.flatMap((quest) =>
    quest.steps.filter((step) => step.objective.kind === "reach"),
  );

  it("도착 목표를 실제로 찾았다", () => {
    // 목표가 사라지면 아래 검사가 빈 목록을 훑으며 통과한다
    expect(reachSteps.length, `도착 목표 ${reachSteps.length}개`).toBeGreaterThan(0);
  });

  it("도착 지점 반경 안에 설 수 있는 땅이 있다", () => {
    /*
     * 지점이 건물 안이어도 반경이 넉넉하면 채워진다. 문제는 반경 **전체가**
     * 막히는 경우 — 그러면 여정이 그 자리에서 끝난다.
     *
     * 도시가 바뀔 때 조용히 그렇게 될 수 있어서 좌표가 아니라 빈 땅으로 본다.
     */
    const blocked = (x: number, z: number) =>
      layout.colliders.some((box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ);

    for (const step of reachSteps) {
      if (step.objective.kind !== "reach") continue;
      const { x, z, radius } = step.objective;

      let nearest = Number.POSITIVE_INFINITY;
      for (let dx = -radius; dx <= radius; dx += 0.5) {
        for (let dz = -radius; dz <= radius; dz += 0.5) {
          const distance = Math.hypot(dx, dz);
          if (distance > radius || blocked(x + dx, z + dz)) continue;
          nearest = Math.min(nearest, distance);
        }
      }

      expect(
        nearest,
        `${step.id}: 반경 ${radius}m 안에 설 자리가 없다 (가장 가까운 빈 땅 ${nearest.toFixed(1)}m)`,
      ).toBeLessThan(radius);
    }
  });

  it("처치 목표보다 로봇이 많다", () => {
    /*
     * 가장 가벼운 품질 등급에서도 목표 수보다 많아야 한다. 낮은 등급에서만
     * 모자라면 사양이 낮은 기기에서만 막힌다 — 가장 늦게 발견되는 종류다.
     */
    const source = readCode("src/game/combat/Enemies.tsx");
    const counts = [...source.matchAll(/(low|medium|high): (\d+)/g)].map((m) => Number(m[2]));
    expect(counts.length, `찾은 등급 ${counts.length}개`).toBeGreaterThan(2);

    const fewest = Math.min(...counts);
    for (const quest of quests) {
      for (const step of quest.steps) {
        if (step.objective.kind !== "defeat") continue;
        expect(
          fewest,
          `${step.id}: ${step.objective.count}기를 잡아야 하는데 가장 적을 때 ${fewest}기뿐이다`,
        ).toBeGreaterThanOrEqual(step.objective.count);
      }
    }
  });
});

describe("힌트가 말하는 키가 실제로 묶여 있는가", () => {
  /*
   * 힌트는 사람이 그대로 따라 하는 문장이다. 없는 키를 적으면 **아무 일도
   * 일어나지 않고**, 사람은 자기가 잘못 눌렀다고 생각한다 — 활강 힌트가
   * 그랬듯 화면·타입·테스트 어디서도 드러나지 않는다.
   *
   * 키 표기를 바꿀 때(예: 공격을 다른 자판으로 옮길 때) 힌트가 따라오지
   * 않는 것을 막는다.
   */

  /** 코드가 없는 키들. CONTROLS 표가 문구로만 들고 있다 */
  const NAMED = new Set(["Shift", "Space", "WASD", "Ctrl", "Alt", "Esc"]);
  const bound = new Set<string>(Object.values(CONTROL_CODES));

  const hintTexts = [FIRST_RUN_QUEST, BOSS_QUEST].flatMap((quest) =>
    quest.steps.map((step) => ({ id: step.id, hint: step.hint })),
  );

  it("힌트를 실제로 읽었다", () => {
    const withKeys = hintTexts.filter(({ hint }) => /[A-Z]/.test(hint));
    expect(withKeys.length, `키를 말하는 힌트 ${withKeys.length}개`).toBeGreaterThan(2);
  });

  it("모든 키 표기가 묶인 키다", () => {
    const unknown: string[] = [];

    for (const { id, hint } of hintTexts) {
      for (const match of hint.matchAll(/[A-Z][A-Za-z0-9]*/g)) {
        const token = match[0];
        if (NAMED.has(token)) continue;
        // 한 글자는 KeyX로, F3 같은 것은 그대로 묶여 있어야 한다
        if (/^[A-Z]$/.test(token) && bound.has(`Key${token}`)) continue;
        if (bound.has(token)) continue;
        unknown.push(`${id}: "${token}" (${hint})`);
      }
    }

    expect(unknown, `묶이지 않은 키를 안내한다:\n${unknown.join("\n")}`).toEqual([]);
  });

  it("표가 전제하는 물건이 도시에 있다", () => {
    /*
     * 「F (자판기 앞에서)」·「G (가로등을 보고)」처럼 표는 **세계에 무엇이
     * 있다는 것을 전제**한다. 도시 생성이 바뀌어 그 물건이 사라지면 표는
     * 그대로 남아 거짓말이 된다 — 눌러 봐야만 알게 된다.
     */
    const city = buildCityLayout();
    const details = buildCityDetails(city);
    const rows = CONTROLS.map((row) => row.keyboard).join(" ");

    if (rows.includes("자판기")) {
      expect(details.vendingMachines.length, "자판기를 안내하는데 도시에 없다").toBeGreaterThan(0);
    }
    if (rows.includes("가로등")) {
      const poles = city.props.filter((prop) => prop.tone === 0 && prop.height > 4);
      expect(poles.length, "가로등을 안내하는데 걸 수 있는 기둥이 없다").toBeGreaterThan(0);
    }
    // 둘 다 사라지면 위 두 검사가 조용히 건너뛰어진다
    expect(rows, "표가 전제하는 물건이 하나도 없다").toMatch(/자판기|가로등/);
  });

  it("조작 표의 키 표기도 같은 코드를 가리킨다", () => {
    /*
     * 표와 실제 코드가 어긋나면 도움말 전체가 거짓이 된다. 코드가 있는
     * 항목만 본다 — 이동·시점처럼 코드가 없는 것은 문구로만 존재한다.
     */
    let checked = 0;
    for (const row of CONTROLS) {
      const code = CONTROL_CODES[row.id as keyof typeof CONTROL_CODES];
      if (!code) continue;
      checked += 1;
      const letter = /^Key([A-Z])$/.exec(code)?.[1] ?? code;
      expect(row.keyboard, `${row.id}: 표는 "${row.keyboard}"인데 코드는 ${code}`).toContain(
        letter,
      );
    }
    expect(checked, `대조한 항목 ${checked}개`).toBeGreaterThan(8);
  });
});

describe("안내가 말하는 표식이 지도에 실제로 있는가", () => {
  /*
   * 「붉은 삼각형」 하나만 개별로 보고 있었다. 그래서 흔적 안내를 「노란
   * 물음표」로 적고 지도에는 **마름모**를 그렸는데 아무 검사도 걸리지
   * 않았다 — 지도를 펴 놓고 없는 표식을 찾게 된다.
   *
   * 안내에 모양이 나오면 그 모양이 실제 표식에 있어야 한다.
   */
  const map = readCode("src/game/systems/cityMapPaint.ts");
  const marks = map.slice(map.indexOf("const MARKS = {"), map.indexOf("} as const;"));
  const shapes = new Set([...marks.matchAll(/shape: "(\w+)"/g)].map((match) => match[1]));

  /** 안내에 쓰는 말 → 표식의 모양 이름 */
  const SHAPE_WORDS: Record<string, string> = {
    삼각형: "triangle",
    마름모: "diamond",
    동그라미: "circle",
    화살표: "arrow",
  };

  const hints = [FIRST_RUN_QUEST, BOSS_QUEST]
    .flatMap((quest) => quest.steps)
    .map((step) => ({ id: step.id, hint: step.hint }));

  it("표식 모양을 실제로 읽었다", () => {
    // 상수 이름이 바뀌면 빈 집합을 훑으며 통과한다
    expect(shapes.size, `찾은 모양: ${[...shapes].join(", ") || "없음"}`).toBeGreaterThan(2);
  });

  it("안내에 나온 모양이 지도에 있다", () => {
    const missing: string[] = [];
    let checked = 0;

    for (const { id, hint } of hints) {
      for (const [word, shape] of Object.entries(SHAPE_WORDS)) {
        if (!hint.includes(word)) continue;
        checked += 1;
        if (!shapes.has(shape)) missing.push(`${id}: 「${word}」인데 지도에 ${shape}이 없다`);
      }
    }

    expect(checked, "모양을 말하는 안내가 하나도 없다").toBeGreaterThan(0);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("모양을 말하지 않는 낱말을 쓰지 않는다", () => {
    /*
     * 「물음표」처럼 지도에 없는 모양을 적으면 이 목록에 없어서 위 검사를
     * 통과한다. 지도가 그리는 모양 낱말만 쓰도록 못 박는다.
     */
    const SHAPE_LIKE = /물음표|별표|네모|사각형|십자/;
    for (const { id, hint } of hints) {
      expect(hint, `${id}: 지도에 없는 모양을 안내한다 — ${hint}`).not.toMatch(SHAPE_LIKE);
    }
  });
});

describe("여러 번 해야 하는 목표에 계수기가 있는가", () => {
  /*
   * 흔적 단계를 넣고 계수기를 빼먹었다 — 셋을 흩어 놓고 몇 개 남았는지
   * 알려 주지 않으면 도시를 통째로 다시 돌게 된다. 처치 단계에는 있었는데
   * 새 종류가 그 자리를 지나쳤다.
   *
   * 「수를 가진 목표」를 정본에서 훑는다 — 다음 종류가 늘어도 걸린다.
   */
  const counted = [FIRST_RUN_QUEST, BOSS_QUEST]
    .flatMap((quest) => quest.steps)
    .filter((step) => "count" in step.objective && step.objective.count > 1);

  it("수를 가진 목표를 실제로 찾았다", () => {
    expect(counted.length, `찾은 단계 ${counted.length}개`).toBeGreaterThan(1);
  });

  it("각 단계가 화면에 진행 수를 낸다", () => {
    const runner = readCode("src/game/quest/questRunner.ts");
    const start = runner.indexOf('let counter = "";');
    expect(start, "계수기를 만드는 곳을 못 찾았다").toBeGreaterThan(-1);
    const body = runner.slice(start, runner.indexOf("return {", start));
    expect(body.length, `잘라낸 길이 ${body.length}`).toBeGreaterThan(80);

    for (const step of counted) {
      expect(body, `${step.id}(${step.objective.kind}) 단계에 계수기가 없다`).toContain(
        `"${step.objective.kind}"`,
      );
    }
  });

  it("진행 수가 목표 수를 넘지 않는다", () => {
    // 「4 / 3」은 다 했는데 안 끝난 것처럼 보인다
    const runner = readCode("src/game/quest/questRunner.ts");
    const clamps = (runner.match(/Math\.min\(step\.objective\.count/g) ?? []).length;
    expect(clamps, `상한을 거는 곳 ${clamps}곳`).toBeGreaterThanOrEqual(counted.length);
  });
});
