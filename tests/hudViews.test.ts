import { describe, expect, it } from "vitest";

import { createHold, createSince, secondsSince, stepHold, stepSince } from "@/game/systems/hudHold";
import {
  bossHealthView,
  createResultLatch,
  dismissResult,
  healthPanelView,
  questPanelView,
  resultVisible,
  stepResultLatch,
  vendingView,
  weaponNoticeView,
} from "@/game/systems/hudViews";
import type { QuestView } from "@/game/quest/questRunner";

/*
 * HUD의 기능 쪽.
 *
 * 이 규칙들은 전부 컴포넌트의 `setInterval` 안에 있었다 — 「완주 기록을 언제
 * 굳히는가」·「목표 패널을 언제 접는가」·「알림의 첫 표본을 삼키는가」가 JSX
 * 바로 위 열 줄에 섞여 있어서 **브라우저를 띄우지 않고는 확인할 방법이 없었다.**
 * 실제로 그중 둘은 화면에서 결함으로 발견됐다.
 *
 * 밖으로 꺼낸 지금은 값으로 잰다.
 */

function quest(overrides: Partial<QuestView> = {}): QuestView {
  return {
    title: "첫 번째 산책",
    hint: "Shift를 누른 채 WASD로 달리세요",
    counter: "",
    ratio: 0.5,
    completed: false,
    firstQuestDone: false,
    ...overrides,
  } as QuestView;
}

describe("목표 패널", () => {
  it("다 마치면 비운다", () => {
    // 같은 문장을 완주 화면이 가운데에 크게 띄운다 — 한 화면에 같은 말이 두 번 있었다
    expect(questPanelView(quest({ completed: true }), 0).visible).toBe(false);
  });

  it("바뀐 직후에는 펼치고 지나면 접는다", () => {
    expect(questPanelView(quest(), 0).expanded).toBe(true);
    expect(questPanelView(quest(), 60).expanded).toBe(false);
  });

  it("진행도를 0~1로 가둔다", () => {
    // 화면이 다시 자르지 않아도 되도록 여기서 가둔다 — 막대가 상자를 뚫고 나가던 종류다
    expect(questPanelView(quest({ ratio: 1.4 }), 0).ratio).toBe(1);
    expect(questPanelView(quest({ ratio: -0.2 }), 0).ratio).toBe(0);
  });
});

describe("체력 패널", () => {
  it("가득 차 있고 아무 일도 없으면 감춘다", () => {
    expect(healthPanelView(5, 5, false, false, 99).visible).toBe(false);
  });

  it("맞으면 나타나고 칸 수가 맞는다", () => {
    const view = healthPanelView(3, 5, false, false, 0);

    expect(view.visible).toBe(true);
    expect(view.filled).toBe(3);
    expect(view.total).toBe(5);
  });

  it("소수점 체력도 칸을 채운 쪽으로 센다", () => {
    // 2.3칸 남았는데 2칸만 그리면 「다음 대에 죽는다」로 잘못 읽힌다
    expect(healthPanelView(2.3, 5, false, false, 0).filled).toBe(3);
  });
});

describe("완주 걸쇠", () => {
  const record = { elapsedSeconds: 90, maxSpeed: 14.2, defeated: 7 };

  it("완주하기 전에는 아무것도 없다", () => {
    expect(resultVisible(stepResultLatch(createResultLatch(), false, record))).toBe(false);
  });

  it("완주한 순간의 값만 굳는다", () => {
    /*
     * 완주한 뒤에도 계속 다시 담고 있었다 — 「걸린 시간」이 화면을 보는 동안
     * 계속 올라가 **기록이 아니라 시계**가 됐다.
     */
    // Given
    const captured = stepResultLatch(createResultLatch(), true, record);

    // When — 계속 놀아서 숫자가 커진다
    const later = stepResultLatch(captured, true, {
      elapsedSeconds: 400,
      maxSpeed: 20,
      defeated: 30,
    });

    // Then
    expect(later.record?.elapsedSeconds).toBe(90);
    expect(later.record?.defeated).toBe(7);
  });

  it("「계속 탐험」으로 닫으면 사라진다", () => {
    const closed = dismissResult(stepResultLatch(createResultLatch(), true, record));

    expect(resultVisible(closed)).toBe(false);
  });

  it("닫아 둔 뒤에도 다음 완주에는 다시 뜬다", () => {
    /*
     * 첫 여정을 그렇게 닫은 사람에게는 보스를 눕힌 뒤의 완주 화면이 **영영 뜨지
     * 않았다** — 게임에서 가장 큰 순간의 보상이 통째로 사라졌다.
     */
    // Given — 첫 여정을 완주하고 닫았다
    const closed = dismissResult(stepResultLatch(createResultLatch(), true, record));

    // When — 다음 여정이 시작되고, 그것도 완주한다
    const playing = stepResultLatch(closed, false, record);
    const again = stepResultLatch(playing, true, {
      elapsedSeconds: 200,
      maxSpeed: 18,
      defeated: 12,
    });

    // Then
    expect(resultVisible(again)).toBe(true);
    expect(again.record?.elapsedSeconds, "두 번째 완주에 첫 숫자가 뜬다").toBe(200);
  });
});

describe("대장 체력 막대", () => {
  it("멀면 뜨지 않는다", () => {
    expect(bossHealthView({ engaged: false, healthRatio: 1, telegraph: false }).visible).toBe(
      false,
    );
  });

  it("퍼센트를 정수로 준다", () => {
    // 화면이 반올림을 다시 하지 않도록 여기서 만든다
    expect(bossHealthView({ engaged: true, healthRatio: 0.666, telegraph: false }).percent).toBe(
      67,
    );
  });
});

describe("자판기 안내", () => {
  it("손이 닿지 않고 효과도 없으면 뜨지 않는다", () => {
    expect(vendingView({ machineInReach: false, boostRemaining: 0 }).visible).toBe(false);
  });

  it("효과가 남아 있으면 멀어져도 남은 시간을 보여 준다", () => {
    const view = vendingView({ machineInReach: false, boostRemaining: 3.4 });

    expect(view.visible).toBe(true);
    expect(view.remaining).toBeCloseTo(3.4, 5);
  });

  it("손이 닿았을 때는 남은 시간이 아니라 안내다", () => {
    expect(vendingView({ machineInReach: true, boostRemaining: 0 }).remaining).toBeNull();
  });
});

describe("무기 알림", () => {
  it("한 번도 안 바꿨으면 뜨지 않는다", () => {
    // 흐른 시간이 무한대다 — 시작하자마자 무기 이름이 뜨면 「지금 바꿨다」가 흐려진다
    expect(weaponNoticeView("bow", Number.POSITIVE_INFINITY).visible).toBe(false);
  });

  it("바꾼 직후에는 이름과 사거리를 함께 준다", () => {
    const view = weaponNoticeView("bow", 0);

    expect(view.visible).toBe(true);
    expect(view.label).toContain("m");
  });
});

describe("걸쇠 — 값이 바뀐 순간을 붙잡는다", () => {
  it("첫 표본을 조용히 삼킬 수 있다", () => {
    /*
     * 해금 알림은 **이미 갖고 있던 도깨비**까지 「새로 만났다」고 하면 안 된다.
     * 반대로 구역 배너는 처음 들어선 구역의 이름을 반드시 띄워야 한다 — 이
     * 차이가 두 파일에 각자 적혀 있었다.
     */
    const quiet = stepHold(createHold<string>(true), "chorong", "초롱", 0, 5000);
    const loud = stepHold(createHold<string>(false), "hongdae", "홍대", 0, 5000);

    expect(quiet.shown).toBeNull();
    expect(loud.shown).toBe("홍대");
  });

  it("삼킨 뒤 바뀌면 알린다", () => {
    const seeded = stepHold(createHold<string>(true), "chorong", "초롱", 0, 5000);
    const changed = stepHold(seeded, "chorong,geueum", "그을음", 100, 5000);

    expect(changed.shown).toBe("그을음");
  });

  it("시간이 다하면 스스로 사라진다", () => {
    const shown = stepHold(createHold<string>(false), "hongdae", "홍대", 0, 3200);

    expect(stepHold(shown, "hongdae", "홍대", 3000, 3200).shown).toBe("홍대");
    expect(stepHold(shown, "hongdae", "홍대", 3300, 3200).shown).toBeNull();
  });

  it("빠르게 오가면 시각을 다시 잡는다", () => {
    // 타이머를 따로 걸면 구역을 빠르게 오갈 때 배너가 겹친다
    const first = stepHold(createHold<string>(false), "hongdae", "홍대", 0, 3200);
    const second = stepHold(first, "seongsu", "성수", 1000, 3200);

    expect(second.shown).toBe("성수");
    expect(second.until).toBe(4200);
  });
});

describe("바뀐 뒤 흐른 시간", () => {
  it("한 번도 안 바뀌었으면 무한대다", () => {
    // 0을 돌려주면 시작하자마자 「방금 바뀌었다」가 되어 알림이 제멋대로 뜬다
    expect(secondsSince(createSince(), 1000)).toBe(Number.POSITIVE_INFINITY);
  });

  it("같은 값이 계속 오면 시각을 안 건드린다", () => {
    const first = stepSince(createSince(), "bat", 1000);
    const again = stepSince(first, "bat", 5000);

    expect(again).toBe(first);
    expect(secondsSince(again, 5000)).toBe(4);
  });

  it("바뀌면 처음부터 다시 센다", () => {
    const first = stepSince(createSince(), "bat", 1000);
    const changed = stepSince(first, "hammer", 5000);

    expect(secondsSince(changed, 5000)).toBe(0);
  });
});
