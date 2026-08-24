import { describe, expect, it, vi } from "vitest";

import { readCode } from "./support/source";

import {
  contextMessage,
  createContextLossView,
  watchContextLoss,
  type ContextLossView,
} from "@/game/systems/contextLoss";

/** addEventListener/removeEventListener만 흉내 내는 최소 캔버스 */
function fakeCanvas() {
  const handlers = new Map<string, EventListener[]>();
  return {
    handlers,
    addEventListener(type: string, handler: EventListener) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: EventListener) {
      handlers.set(type, (handlers.get(type) ?? []).filter((item) => item !== handler));
    },
    fire(type: string, event: Partial<Event> = {}) {
      for (const handler of handlers.get(type) ?? []) {
        handler({ preventDefault: () => {}, ...event } as Event);
      }
    },
  };
}

describe("contextMessage", () => {
  it("정상이면 아무것도 띄우지 않는다", () => {
    expect(contextMessage(createContextLossView())).toBeNull();
  });

  it("끊기면 무엇을 하면 되는지 알려 준다", () => {
    /*
     * "오류가 발생했습니다"만으로는 사용자가 할 수 있는 것이 없다.
     * 새로고침이 답이라면 그렇게 적어야 한다.
     */
    const message = contextMessage({ state: "lost", losses: 1 });
    expect(message).not.toBeNull();
    expect(message, `message: ${message}`).toContain("새로고침");
  });

  it("복구되어도 알린다", () => {
    // 화면이 돌아왔더라도 무슨 일이 있었는지 모르면 다음에 또 당황한다
    expect(contextMessage({ state: "restored", losses: 1 })).not.toBeNull();
  });
});

describe("watchContextLoss", () => {
  it("손실을 잡아 상태를 바꾼다", () => {
    const canvas = fakeCanvas();
    const view = createContextLossView();
    watchContextLoss(canvas as unknown as HTMLCanvasElement, view);

    canvas.fire("webglcontextlost");

    expect(view.state).toBe("lost");
    expect(view.losses).toBe(1);
  });

  it("기본 동작을 막아 복구 기회를 남긴다", () => {
    /*
     * webglcontextlost의 기본 동작은 "복구 시도 안 함"이다. preventDefault를
     * 부르지 않으면 브라우저가 restored 이벤트를 보내지 않는다.
     */
    const canvas = fakeCanvas();
    const prevented = vi.fn();
    watchContextLoss(canvas as unknown as HTMLCanvasElement, createContextLossView());

    canvas.fire("webglcontextlost", { preventDefault: prevented });

    expect(prevented).toHaveBeenCalled();
  });

  it("복구를 잡는다", () => {
    const canvas = fakeCanvas();
    const view = createContextLossView();
    watchContextLoss(canvas as unknown as HTMLCanvasElement, view);

    canvas.fire("webglcontextlost");
    canvas.fire("webglcontextrestored");

    expect(view.state).toBe("restored");
  });

  it("반복 손실을 센다", () => {
    // 반복되면 기기 문제일 가능성이 높다 — 나중에 판단할 근거를 남긴다
    const canvas = fakeCanvas();
    const view = createContextLossView();
    watchContextLoss(canvas as unknown as HTMLCanvasElement, view);

    canvas.fire("webglcontextlost");
    canvas.fire("webglcontextrestored");
    canvas.fire("webglcontextlost");

    expect(view.losses).toBe(2);
  });

  it("해제하면 더 이상 반응하지 않는다", () => {
    // 캔버스가 살아 있는 채로 컴포넌트만 바뀌면 리스너가 쌓인다
    const canvas = fakeCanvas();
    const view: ContextLossView = createContextLossView();
    const stop = watchContextLoss(canvas as unknown as HTMLCanvasElement, view);

    stop();
    canvas.fire("webglcontextlost");

    expect(view.state).toBe("ok");
    expect(view.losses).toBe(0);
  });

  it("바뀔 때만 알린다", () => {
    const canvas = fakeCanvas();
    const onChange = vi.fn();
    watchContextLoss(canvas as unknown as HTMLCanvasElement, createContextLossView(), onChange);

    canvas.fire("webglcontextlost");

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("끊겼을 때 빠져나갈 길이 있는가", () => {
  /*
   * 안내는 「새로고침하면 다시 시작할 수 있습니다」라고 말하면서 **누를 것을
   * 주지 않았다.** 모바일에서는 주소창을 다시 꺼내는 것부터 어렵고, 화면은
   * 검은 채로 남아 게임이 죽은 것으로 보인다.
   */
  const hud = readCode("src/components/hud/WorldHud.tsx");
  const notice = hud.slice(hud.indexOf("function ContextNotice"));
  const body = notice.slice(0, notice.indexOf("\n/**"));

  it("끊긴 동안에는 새로고침 버튼이 있다", () => {
    expect(body, "누를 것이 없다").toContain("location.reload()");
    expect(body, "끊긴 상태와 무관하게 뜬다").toContain('context.state === "lost"');
  });

  it("돌아온 뒤에는 권하지 않는다", () => {
    /*
     * 계속 놀 수 있는데 새로고침을 권하면 진행을 버리라는 말로 읽힌다.
     * 버튼은 끊긴 상태에서만 그린다.
     */
    expect(body).toContain("{lost && (");
  });

  it("안내가 실제로 새로고침을 말한다", () => {
    // 버튼만 있고 문장이 다른 이야기를 하면 무엇을 누르는지 알 수 없다
    expect(contextMessage({ state: "lost", losses: 1 })).toContain("새로고침");
  });
});
