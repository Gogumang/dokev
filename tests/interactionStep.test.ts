import { describe, expect, it } from "vitest";

import { CLUES } from "@/game/quest/clues";
import { stepInteraction, type InteractionFrame } from "@/game/scene/interactionStep";
import { TALK_LINE_SECONDS } from "@/game/world/residentTalk";

/*
 * 상호작용 한 프레임.
 *
 * 흔적 조사·말 걸기·간판 살펴보기가 키 하나로 지나는 길목인데, **계산해 놓고
 * 전하지 않아도** 아무 검사가 몰랐다. 셋이 뚫려 있었다:
 *
 *   - `playerLink.cluesFound`를 안 실으면 **여정이 흔적을 찾은 줄 모른다.**
 *     조사는 되는데 단계가 영영 안 끝난다 — 진행이 막히는 급이다.
 *   - `talkView.nearby`가 흔적을 안 세면 **조사할 수 있다는 안내가 안 뜬다.**
 *     플레이어는 그 앞에 서 있어도 누를 이유를 모른다.
 *   - 시간이 다한 대사를 안 지우면 다음에 누를 때 **이전 줄이 잠깐 보인다.**
 *
 * 셋 다 「값이 맞는가」가 아니라 **「밖으로 나갔는가」**의 문제다. 이 저장소에서
 * 가장 자주 나온 결함 모양이다.
 */

const FRAME = 1 / 60;
const SAMPLE = CLUES[0];

function makeFrame(overrides: Partial<InteractionFrame> = {}): InteractionFrame {
  return {
    x: SAMPLE.x,
    z: SAMPLE.z,
    dt: FRAME,
    input: { talkQueued: false },
    talkView: { line: null, speaker: "", remaining: 0, nearby: false },
    clueView: { found: [] },
    playerLink: { cluesFound: 0 },
    // 실제 호출부는 **늘 객체를 넘긴다** — 멀리 있으면 거리로 걸러진다.
    // null로 두면 실제와 다른 모양을 검사하게 된다.
    residentCandidate: { index: 0, distanceSquared: 10_000 },
    signCandidate: null,
    ...overrides,
  };
}

describe("흔적 조사", () => {
  it("흔적 앞에 서면 조사할 수 있다고 알린다 — 아니면 누를 이유를 모른다", () => {
    const frame = makeFrame();
    stepInteraction(frame);
    expect(frame.talkView.nearby, "흔적 앞인데 안내가 없다").toBe(true);
  });

  it("멀리 있으면 알리지 않는다", () => {
    const frame = makeFrame({ x: SAMPLE.x + 60, z: SAMPLE.z + 60 });
    stepInteraction(frame);
    expect(frame.talkView.nearby).toBe(false);
  });

  it("조사하면 여정에 전해진다 — 안 전하면 단계가 영영 안 끝난다", () => {
    const frame = makeFrame({ input: { talkQueued: true } });
    stepInteraction(frame);

    expect(frame.clueView.found, "흔적이 기록되지 않았다").toContain(SAMPLE.id);
    expect(
      frame.playerLink.cluesFound,
      `여정이 아는 수 ${frame.playerLink.cluesFound}, 실제 ${frame.clueView.found.length}`,
    ).toBe(frame.clueView.found.length);
  });

  it("여러 개를 찾아도 수가 따라간다", () => {
    const found: string[] = [];
    const link = { cluesFound: 0 };
    for (const clue of CLUES) {
      stepInteraction(
        makeFrame({
          x: clue.x,
          z: clue.z,
          input: { talkQueued: true },
          clueView: { found },
          playerLink: link,
        }),
      );
    }
    expect(found.length, `찾은 흔적 ${found.length}`).toBe(CLUES.length);
    expect(link.cluesFound, `여정이 아는 수 ${link.cluesFound}`).toBe(CLUES.length);
  });

  it("같은 흔적을 두 번 세지 않는다", () => {
    const found = [SAMPLE.id];
    const frame = makeFrame({
      input: { talkQueued: true },
      clueView: { found },
      playerLink: { cluesFound: 1 },
    });
    stepInteraction(frame);
    expect(found.length, `기록 ${found.join(", ")}`).toBe(1);
  });

  it("배열을 갈아 끼우지 않는다 — 새로 만들면 HUD가 보던 것과 갈라진다", () => {
    const found: string[] = [];
    const frame = makeFrame({ input: { talkQueued: true }, clueView: { found } });
    stepInteraction(frame);
    // HUD는 처음 받은 배열을 계속 들고 있다. 그 배열이 자라야 화면이 따라온다
    expect(frame.clueView.found, "다른 배열로 바뀌었다").toBe(found);
    expect(found).toContain(SAMPLE.id);
  });
});

describe("대사가 머물다 사라지는가", () => {
  it("조사하면 그 자리에서 한 줄이 뜬다", () => {
    const frame = makeFrame({ input: { talkQueued: true } });
    stepInteraction(frame);
    expect(frame.talkView.line, "대사가 안 떴다").toBe(SAMPLE.line);
    expect(frame.talkView.remaining, "머무는 시간이 안 잡혔다").toBeGreaterThan(0);
  });

  it("시간이 다하면 지워진다 — 남으면 다음에 누를 때 이전 줄이 잠깐 보인다", () => {
    const frame = makeFrame({ input: { talkQueued: true } });
    stepInteraction(frame);

    // 대사가 머무는 시간을 넉넉히 넘긴다
    for (let i = 0; i < Math.ceil(TALK_LINE_SECONDS / FRAME) + 5; i += 1) {
      frame.input.talkQueued = false;
      stepInteraction(frame);
    }
    expect(frame.talkView.line, `${TALK_LINE_SECONDS}초 뒤에도 남아 있다`).toBeNull();
  });

  it("머무는 동안에는 안 지워진다 — 바로 사라지면 못 읽는다", () => {
    const frame = makeFrame({ input: { talkQueued: true } });
    stepInteraction(frame);

    // 절반쯤 지난 시점
    for (let i = 0; i < Math.floor(TALK_LINE_SECONDS / FRAME / 2); i += 1) {
      stepInteraction(frame);
    }
    expect(frame.talkView.line, "절반도 안 돼서 사라졌다").toBe(SAMPLE.line);
  });

  it("누르지 않은 프레임에는 아무 일도 없다", () => {
    const frame = makeFrame();
    stepInteraction(frame);
    expect(frame.talkView.line).toBeNull();
    expect(frame.clueView.found, "누르지도 않았는데 조사됐다").toEqual([]);
  });
});

describe("주민·간판에게 말 걸기", () => {
  /*
   * 처음 쓴 검사가 **흔적 경로만** 봤다. 배선 훑기를 다시 돌렸더니 주민·간판
   * 경로의 네 줄(`speaker`, `line`, `remaining`)이 여전히 지워도 통과했다 —
   * 「한 경로를 막았으니 됐다」가 아니었다.
   *
   * 사람이 겪는 모습: 주민에게 말을 걸면 **말풍선이 뜨긴 하는데 누가 말하는지가
   * 비거나**, 아예 아무 줄도 안 뜬다. 간판도 마찬가지다 — 도시를 읽는 재미가
   * 통째로 사라지는데 화면은 멀쩡하다.
   */
  const NEAR = { index: 3, distanceSquared: 1 };
  const FAR_AWAY = { x: SAMPLE.x + 80, z: SAMPLE.z + 80 };

  it("주민에게 말을 걸면 줄과 말하는 이가 함께 나간다", () => {
    const frame = makeFrame({
      ...FAR_AWAY,
      input: { talkQueued: true },
      residentCandidate: NEAR,
    });
    stepInteraction(frame);

    expect(frame.talkView.line, "주민 대사가 안 떴다").toBeTruthy();
    expect(frame.talkView.speaker, "누가 말하는지가 비었다").toBe("주민");
    expect(frame.talkView.remaining, "머무는 시간이 안 잡혔다").toBeGreaterThan(0);
  });

  it("간판을 살펴보면 간판이 말한다", () => {
    const frame = makeFrame({
      ...FAR_AWAY,
      input: { talkQueued: true },
      residentCandidate: { index: 0, distanceSquared: 10_000 },
      signCandidate: NEAR,
    });
    stepInteraction(frame);

    expect(frame.talkView.line, "간판 대사가 안 떴다").toBeTruthy();
    expect(frame.talkView.speaker, "누가 말하는지가 비었다").toBe("간판");
  });

  it("흔적이 주민보다 먼저다 — 옆에 주민이 서 있다고 여정이 막히면 안 된다", () => {
    const frame = makeFrame({
      input: { talkQueued: true },
      residentCandidate: NEAR,
    });
    stepInteraction(frame);

    expect(frame.talkView.speaker, "주민이 흔적을 가로챘다").toBe("흔적");
    expect(frame.clueView.found, "흔적이 기록되지 않았다").toContain(SAMPLE.id);
  });

  it("말하는 이가 대상마다 다르다 — 늘 같으면 누구 말인지 알 수 없다", () => {
    const speakers = new Set<string>();

    const clue = makeFrame({ input: { talkQueued: true } });
    stepInteraction(clue);
    speakers.add(clue.talkView.speaker);

    const resident = makeFrame({
      ...FAR_AWAY,
      input: { talkQueued: true },
      residentCandidate: NEAR,
    });
    stepInteraction(resident);
    speakers.add(resident.talkView.speaker);

    const sign = makeFrame({
      ...FAR_AWAY,
      input: { talkQueued: true },
      residentCandidate: { index: 0, distanceSquared: 10_000 },
      signCandidate: NEAR,
    });
    stepInteraction(sign);
    speakers.add(sign.talkView.speaker);

    expect(speakers.size, `말하는 이: ${[...speakers].join(", ")}`).toBe(3);
  });

  it("멀리 있으면 안내도 대사도 없다", () => {
    const frame = makeFrame({ ...FAR_AWAY, input: { talkQueued: true } });
    stepInteraction(frame);

    expect(frame.talkView.nearby).toBe(false);
    expect(frame.talkView.line).toBeNull();
  });
});
