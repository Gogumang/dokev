import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import {
  consumeGrapple,
  consumeJump,
  consumeLookDelta,
  consumeZoom,
  createInputState,
  projectCommands,
  type CommandLink,
} from "@/game/systems/input";

/*
 * 입력 상태.
 *
 * 이 객체는 **여러 곳이 말없이 합의한 계약**이다. 터치 UI가 버튼의 초기
 * 눌림 상태를 여기에 맞추고, 씬이 매 프레임 큐를 비우고, 키보드 핸들러가
 * 채운다. 기본값 하나가 어긋나면 버튼이 실제와 반대로 표시된다.
 */

describe("createInputState", () => {
  it("동료가 처음부터 소환된 상태다", () => {
    /*
     * TouchControls가 `useState(true)`로 버튼의 눌림 상태를 시작한다.
     * 여기가 false가 되면 버튼은 "소환됨"인데 동료는 없다.
     */
    expect(createInputState().companionSummoned).toBe(true);
  });

  it("터치 UI의 초기값과 실제로 같다", () => {
    // 주석으로만 맞춰 두면 한쪽만 바뀐다
    const touch = readFileSync("src/components/hud/TouchControls.tsx", "utf8");
    // summoned 상태만 본다 — 같은 파일에 boardOn 등 다른 useState가 있다
    const initial = /const \[summoned, [^\]]+\] = useState\((true|false)\)/.exec(touch)?.[1];

    expect(initial, "TouchControls에서 summoned 초기값을 찾지 못했다").toBeTruthy();
    expect(initial, `TouchControls: summoned=${initial}`).toBe(
      String(createInputState().companionSummoned),
    );
  });

  it("모든 큐가 비어 있다", () => {
    /*
     * 하나라도 true로 시작하면 첫 프레임에 저절로 공격하거나 점프한다 —
     * 사용자는 아무것도 누르지 않았는데.
     */
    const state = createInputState();
    for (const key of [
      "jumpQueued",
      "attackQueued",
      "companionAbilityQueued",
      "grappleQueued",
      "drinkQueued",
      "danceQueued",
      "soundToggleQueued",
    ] as const) {
      expect(state[key], `${key}가 눌린 채로 시작한다`).toBe(false);
    }
  });

  it("이동과 시점이 0에서 시작한다", () => {
    const state = createInputState();
    expect(state.moveX).toBe(0);
    expect(state.moveZ).toBe(0);
    expect(state.lookDeltaX).toBe(0);
    expect(state.lookDeltaY).toBe(0);
    expect(state.zoomDelta).toBe(0);
  });

  it("호출마다 새 객체를 준다", () => {
    // 공유하면 한 판의 입력이 다음 판에 남는다
    const first = createInputState();
    first.moveX = 1;
    expect(createInputState().moveX).toBe(0);
  });
});

describe("소비 함수", () => {
  it("시점 이동량을 읽고 비운다", () => {
    /*
     * 소비하지 않으면 관성처럼 계속 돈다 — 마우스를 놓아도 화면이 흐른다.
     */
    const state = createInputState();
    state.lookDeltaX = 12;
    state.lookDeltaY = -4;

    const delta = consumeLookDelta(state);

    expect(delta).toEqual({ x: 12, y: -4 });
    expect(state.lookDeltaX).toBe(0);
    expect(state.lookDeltaY).toBe(0);
  });

  it("두 번째 소비는 0이다", () => {
    const state = createInputState();
    state.lookDeltaX = 5;
    consumeLookDelta(state);
    expect(consumeLookDelta(state)).toEqual({ x: 0, y: 0 });
  });

  it("줌도 읽고 비운다", () => {
    const state = createInputState();
    state.zoomDelta = 3;
    expect(consumeZoom(state)).toBe(3);
    expect(state.zoomDelta).toBe(0);
  });
});

describe("소리 토글", () => {
  it("큐로 시작하지 않는다", () => {
    // true로 시작하면 첫 프레임에 소리가 꺼진다
    expect(createInputState().soundToggleQueued).toBe(false);
  });

  it("HUD가 설정만 바꾸고 소리를 직접 다루지 않는다", () => {
    /*
     * 끄는 경로가 둘이면 서로 어긋난다 — 버튼은 껐는데 설정은 켜져 있고,
     * 다음 판에서 다시 켜지는 식이다. 오디오는 설정을 구독한다.
     */
    /*
     * HUD 폴더 전체를 읽는다.
     *
     * 한 파일만 보고 있었더니 소리 토글이 `TouchMenu`로 옮겨 갔을 때
     * 「없다」고 잡혔다 — 규칙은 그대로인데 파일이 나뉘었을 뿐이다.
     * `tests/controls.test.ts`가 같은 이유로 이미 폴더 전체를 읽는다.
     */
    const hud = readdirSync("src/components/hud")
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => readFileSync(join("src/components/hud", name), "utf8"))
      .join("\n");
    expect(hud).toContain("updateSettings({ sound:");
    expect(hud, "HUD가 오디오를 직접 만진다").not.toContain("setEnabled");
  });
});

describe("시점 조작 계산", () => {
  const source = readFileSync("src/game/systems/input.ts", "utf8");

  it("좌표 차이로 계산한다", () => {
    /*
     * `event.movementX`를 쓰고 있었다. 포인터 잠금 없이 쓰는 값이라 환경에
     * 따라 0으로만 오고, 그러면 **시점이 아예 돌지 않는데 원인을 알 방법이
     * 없다.** 터치 조작은 처음부터 좌표 차이로 계산하고 있었다.
     */
    expect(source, "마우스와 터치가 서로 다른 방식을 쓴다").not.toContain("event.movementX");
    expect(source).toContain("event.clientX - lastLook.x");
  });

  it("누르는 순간 기준점을 잡는다", () => {
    // 기준점 없이 첫 이동을 받으면 화면 좌표가 통째로 델타가 되어 시점이 튄다
    const down = source.slice(source.indexOf("const onPointerDown"));
    expect(down.slice(0, down.indexOf("};"))).toContain("lastLook = { x: event.clientX");
  });

  it("포인터 잠금을 쓰지 않는다 — 쓰면 이 계산이 무너진다", () => {
    expect(source).not.toContain("requestPointerLock");
  });
});

describe("초점 잡힌 버튼을 가로채지 않는가", () => {
  /*
   * `Space`에 `preventDefault`를 걸고 있었는데, 브라우저는 그러면 **초점
   * 잡힌 버튼을 누르지 않는다.** 브라우저에서 확인했다: 도감을 열고 Tab으로
   * 「닫기」에 가서 Space를 눌러도 닫히지 않고(캐릭터가 뛰었다), 같은 자리에서
   * Enter는 닫혔다. 버튼은 Enter와 Space 둘 다로 눌려야 한다(WAI-ARIA).
   *
   * 폼 입력만 예외로 두고 있었는데, 버튼은 폼 입력이 아니다.
   */
  const source = readFileSync("src/game/systems/input.ts", "utf8");

  it("활성화 키를 버튼에 양보한다", () => {
    // 「어떤 키가 버튼을 누르는가」와 「누를 것이 무엇인가」를 둘 다 확인한다
    // 「어떤 키가 버튼을 누르는가」는 이름 붙은 상수에서 온다
    const codes = /ACTIVATION_CODES[^=]*=\s*\[([^\]]+)\]/.exec(source)?.[1] ?? "";
    for (const code of ["Space", "Enter"]) {
      expect(codes, `${code}를 버튼에 양보하지 않는다`).toContain(code);
    }

    // 선택자는 이름 붙은 상수에서 온다
    const guard = /CONTROL_SELECTOR = "([^"]+)"/.exec(source);
    expect(guard, "양보 대상 선택자를 못 찾았다").not.toBeNull();

    /*
     * 쉼표로 나눠 **정확히** 본다. 부분 문자열로 보면 `[role='button']`에도
     * 「button」이 들어 있어, `button`을 빼도 통과한다 — 되돌려 보고 알았다.
     */
    const parts = (guard?.[1] ?? "").split(",").map((piece) => piece.trim());
    for (const kind of ["button", "a[href]", "[role='button']", "summary"]) {
      expect(parts, `${kind}에 초점이 있어도 가져간다: ${parts.join(" | ")}`).toContain(kind);
    }
  });

  it("`closest`가 없는 대상에도 터지지 않는다", () => {
    /*
     * `target?.closest(...)`로 썼다가 **브라우저에서 터졌다** —
     * `closest is not a function`. `?.`는 null만 막는데, `window`에 직접
     * 보낸 키 이벤트의 target은 `Window`고 거기엔 `closest`가 없다.
     *
     * 전역 키 처리기에서 예외가 나면 그 키 입력이 통째로 사라진다. 실제로
     * 게임을 조작해 보다가 개발 오버레이의 「1 Issue」로 발견했다.
     */
    /*
     * **주석을 걷어내고 본다.** 처음엔 그냥 읽었다가 위 설명 안의
     * `target?.closest(...)`를 코드로 잡았다 — 바로 앞 반복에서 고친 함정에
     * 그대로 다시 빠졌다(`metadata.test.ts`).
     */
    const code = readCode("src/game/systems/input.ts");

    // 있는지 물어보고 쓴다 — `?.` 하나로 끝내지 않는다
    expect(code, "closest가 있는지 확인하지 않는다").toMatch(/typeof closest !== "function"/);

    const bare = /target\?\.closest\(/.test(code);
    expect(bare, "`target?.closest(...)`를 그대로 쓴다 — Window에서 터진다").toBe(false);
  });

  it("가드가 Space 처리보다 앞에 있다", () => {
    // 뒤에 있으면 이미 preventDefault가 걸린 뒤라 아무 소용이 없다
    const guardAt = source.indexOf("closest(");
    const spaceAt = source.indexOf('event.code === "Space"', guardAt);
    expect(guardAt, "가드를 찾지 못했다").toBeGreaterThan(-1);
    expect(guardAt, "가드가 Space 처리 뒤에 있다").toBeLessThan(spaceAt);
  });

  it("이동 키는 계속 받는다", () => {
    /*
     * 초점이 버튼에 있다고 **전부** 막으면 HUD 버튼을 한 번 누른 뒤로는
     * 걸어 다닐 수 없다 — 캔버스를 다시 클릭해야 한다. 양보는 활성화 키에만.
     */
    const codes = /ACTIVATION_CODES[^=]*=\s*\[([^\]]+)\]/.exec(source)?.[1] ?? "";
    expect(codes, "양보 목록을 찾지 못했다").not.toBe("");
    expect(codes, "이동 키까지 양보한다").not.toMatch(/Key[WASD]|Shift/);
  });
});

describe("한 번 누른 것이 한 번만 나가는가", () => {
  /*
   * `InputState`의 주석이 이미 못 박아 두었다 — 「누른 상태를 그대로 넘기면
   * 스페이스를 누르고 있을 때 점프 버퍼가 계속 채워져 **의도치 않은 연속
   * 점프**가 된다」. 그런데 소비 함수가 큐를 비우지 않게 바꿔도 전부 통과했다.
   * 검사가 이 이름들을 부른 적조차 없었다.
   *
   * 입력은 사람에게 가장 가까운 표면이고, 여기가 틀리면 **게임이 아니라 조작이
   * 고장 난 것처럼** 느껴진다. 점프를 안 비우면 한 번 눌러 계속 떠오르고,
   * 그래플을 안 보고 참을 돌려주면 누르지도 않은 갈고리가 매 프레임 날아간다.
   *
   * 「돌려주는 값이 맞는가」가 아니라 **「두 번째에도 나가는가」**를 잰다.
   * 한 번만 부르면 비우든 안 비우든 참이다 — 그래서 못 잡고 있었다.
   */
  it("점프는 한 번 누르면 한 번만 나간다 — 아니면 눌러 둔 채 계속 뜬다", () => {
    const input = createInputState();
    input.jumpQueued = true;

    expect(consumeJump(input), "첫 번째에 안 나갔다").toBe(true);
    expect(consumeJump(input), "누른 적 없는 두 번째가 나갔다").toBe(false);
  });

  it("그래플도 한 번만 나간다 — 아니면 매 프레임 갈고리가 날아간다", () => {
    const input = createInputState();
    input.grappleQueued = true;

    expect(consumeGrapple(input), "첫 번째에 안 나갔다").toBe(true);
    expect(consumeGrapple(input), "누른 적 없는 두 번째가 나갔다").toBe(false);
  });

  it("누르지 않았으면 나가지 않는다", () => {
    const input = createInputState();
    expect(consumeJump(input), "누르지 않은 점프가 나갔다").toBe(false);
    expect(consumeGrapple(input), "누르지 않은 그래플이 나갔다").toBe(false);
  });

  it("소비한 뒤 다시 누르면 또 나간다 — 한 번 쓰고 죽으면 조작이 멈춘다", () => {
    const input = createInputState();
    input.jumpQueued = true;
    consumeJump(input);

    input.jumpQueued = true;
    expect(consumeJump(input), "다시 누른 점프가 안 나갔다").toBe(true);
  });
});

describe("입력이 전투·동료로 건너가는가", () => {
  /*
   * 누르는 곳(키보드·터치)과 쓰는 곳(적·동료)이 멀어서 공유 객체를 한 번
   * 거친다. 그 옮기는 세 줄이 프레임 루프 안에 있을 때는 **지워도 아무도
   * 몰랐다.**
   *
   *   - `attackQueued` — 안 넘기면 **J를 눌러도 아무 일이 없다.**
   *   - `summoned` — 안 넘기면 동료를 불러도 안 오고, 보내도 안 간다.
   *   - `abilityRequests` — 안 넘기면 **능력이 영영 안 나간다.** 버튼은 켜져 있다.
   *   - `weapon` — 안 돌리면 **Q를 눌러도 계속 방망이다.**
   */
  function link(): CommandLink {
    return { attackQueued: false, summoned: false, abilityRequests: 0, weapon: "bat" };
  }

  it("공격이 건너간다", () => {
    const out = link();
    const input = createInputState();
    input.attackQueued = true;

    projectCommands(out, input);
    expect(out.attackQueued, "J를 눌러도 아무 일이 없다").toBe(true);
    expect(input.attackQueued, "옮기면서 안 비웠다 — 매 프레임 다시 휘두른다").toBe(false);
  });

  it("공격은 켜기만 한다 — 여기서 끄면 아직 못 읽은 입력이 사라진다", () => {
    const out = { ...link(), attackQueued: true };
    const input = createInputState();

    projectCommands(out, input);
    expect(out.attackQueued, "쓰는 쪽이 읽기 전에 꺼졌다").toBe(true);
  });

  it("소환 상태가 그대로 건너간다", () => {
    const out = link();
    const input = createInputState();

    projectCommands(out, input);
    expect(out.summoned, "부른 상태가 안 넘어갔다").toBe(input.companionSummoned);

    input.companionSummoned = !input.companionSummoned;
    projectCommands(out, input);
    expect(out.summoned, "보낸 상태가 안 넘어갔다").toBe(input.companionSummoned);
  });

  it("능력 요청이 한 번에 하나씩 는다 — 안 늘면 능력이 영영 안 나간다", () => {
    const out = link();
    const input = createInputState();
    input.companionAbilityQueued = true;

    projectCommands(out, input);
    expect(out.abilityRequests, "요청이 안 늘었다").toBe(1);
    expect(input.companionAbilityQueued, "옮기면서 안 비웠다").toBe(false);

    // 누르지 않은 프레임들
    projectCommands(out, input);
    projectCommands(out, input);
    expect(out.abilityRequests, `요청 ${out.abilityRequests}번 — 초당 60번 쌓인다`).toBe(1);
  });

  it("다시 누르면 또 는다", () => {
    const out = link();
    const input = createInputState();

    input.companionAbilityQueued = true;
    projectCommands(out, input);
    input.companionAbilityQueued = true;
    projectCommands(out, input);

    expect(out.abilityRequests, `요청 ${out.abilityRequests}`).toBe(2);
  });
});
