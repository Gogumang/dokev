import { describe, expect, it } from "vitest";

import {
  projectCharacterCues,
  projectCombatView,
  projectDistrictView,
  projectSummaryView,
  projectVendingView,
  type CharacterCueFields,
  type CombatViewFields,
  type DistrictViewFields,
  type SummaryViewFields,
  type VendingViewFields,
} from "@/game/scene/hudProjection";
import { createEmoteState } from "@/game/player/emote";
import { DISTRICTS } from "@/game/world/districts";
import { watchReads } from "./support/readsAll";
import { sameFields, staleCopy } from "./support/stale";

/*
 * 씬 → HUD 옮기기.
 *
 * 계산이 없는 대입뿐이라 「검사할 게 있나」 싶지만, **바로 그래서 비어 있었다.**
 * 공유 객체에 쓰는 줄을 하나씩 지워 보니 이 열네 줄이 전부 아무도 모르는 채였다.
 * 화면이 조용히 옛 값을 계속 보여 주는 것이 이 저장소에서 가장 자주 나온 결함이다.
 *
 * 초기값을 **기대값과 다르게** 둔다. 0·false·빈 문자열로 시작하면 안 옮긴 칸이
 * 옮긴 것처럼 보인다 — 여정 화면에서 실제로 그렇게 두 칸을 놓쳤다.
 *
 * 구역 이름은 손으로 적지 않고 `DISTRICTS`에서 가져온다. 여기에 베껴 두면 이름을
 * 바꿀 때 검사만 옛 이름을 들고 통과한다.
 */

describe("전투 상태를 HUD로 옮기는가", () => {
  const BUFFER = new Float32Array([1, 2, 3, 4]);

  const LIVE: CombatViewFields = {
    playerHp: 3,
    playerDowned: false,
    enemyBlips: BUFFER,
    enemyBlipCount: 2,
    companionX: 11,
    companionZ: -4,
    companionVisible: false,
    companionAbilityReady: false,
  };

  /*
   * 낡은 화면은 손으로 적지 않고 **원본에서 만든다.** 손으로 적으면 어느 칸
   * 하나가 기대값과 같아져도 모른다 — 실제로 `bossDefeated`에서 그렇게 뚫렸다.
   */
  const stale = () => staleCopy(LIVE);

  it("낡은 화면의 모든 칸이 실제로 다르다", () => {
    // 이 검사가 없으면 헬퍼가 못 다루는 타입이 늘 때 조용히 눈이 먼다
    expect(sameFields(stale(), LIVE), "원본과 같은 값이 섞였다").toEqual([]);
  });

  it("여덟 칸이 모두 옮겨진다", () => {
    const view = stale();
    projectCombatView(view, LIVE);

    expect(view.playerHp, "하트가 안 줄어든다").toBe(3);
    expect(view.playerDowned, "쓰러져도 표시가 없다").toBe(false);
    expect(view.enemyBlipCount, "지도에 적이 안 뜬다").toBe(2);
    expect(view.companionX, "지도의 동료 점이 안 움직인다").toBe(11);
    expect(view.companionZ, "지도의 동료 점이 안 움직인다").toBe(-4);
    expect(view.companionVisible, "사라진 동료가 점으로 남는다").toBe(false);
    expect(view.companionAbilityReady, "능력 버튼이 잘못 켜져 있다").toBe(false);
  });

  it("표식 버퍼가 옮겨지고, 복사되지 않는다", () => {
    /*
     * 참조 칸은 `staleCopy`가 일부러 안 건드린다(같은 객체인지 보는 검사를
     * 망치지 않으려고). 그래서 **이 검사가 스스로 다른 버퍼로 시작해야** 한다 —
     * 그냥 두면 처음부터 같은 버퍼라 옮기지 않아도 통과한다.
     */
    const view = { ...stale(), enemyBlips: new Float32Array([9, 9]) };
    projectCombatView(view, LIVE);

    expect(view.enemyBlips, "버퍼가 안 옮겨졌다 — 지도가 옛 표식을 그린다").toBe(BUFFER);
  });

  it("두 번 옮겨도 최신 값이 남는다 — 한 번만 옮기면 화면이 멈춘다", () => {
    const view = stale();
    projectCombatView(view, LIVE);
    projectCombatView(view, { ...LIVE, playerHp: 1, enemyBlipCount: 5 });

    expect(view.playerHp, `체력 ${view.playerHp}`).toBe(1);
    expect(view.enemyBlipCount, `표식 ${view.enemyBlipCount}`).toBe(5);
  });
});

describe("자판기 상태를 HUD로 옮기는가", () => {
  const LIVE: VendingViewFields = { machineInReach: false, boostRemaining: 4.5, drinks: 2 };
  const stale = () => staleCopy(LIVE);

  it("낡은 화면의 모든 칸이 실제로 다르다", () => {
    expect(sameFields(stale(), LIVE), "원본과 같은 값이 섞였다").toEqual([]);
  });

  it("세 칸이 모두 옮겨진다", () => {
    const view = stale();
    projectVendingView(view, false, 4.5, 2);

    expect(view.machineInReach, "자판기 앞이 아닌데 안내가 뜬다").toBe(false);
    expect(view.boostRemaining, "언제 끝나는지 알 수 없다").toBe(4.5);
    expect(view.drinks, "마신 수가 안 나갔다").toBe(2);
  });

  it("가까이 가면 안내가 켜진다 — 안 켜지면 마실 수 있다는 걸 모른다", () => {
    const view = stale();
    projectVendingView(view, false, 0, 0);
    expect(view.machineInReach).toBe(false);

    projectVendingView(view, true, 0, 0);
    expect(view.machineInReach, "가까이 갔는데 안내가 안 뜬다").toBe(true);
  });
});

describe("구역을 HUD로 옮기는가", () => {
  const HERE = DISTRICTS.downtown;
  const THERE = DISTRICTS.residential;

  it("세 칸이 모두 옮겨진다 — 하나만 빠져도 옛 이름이 남는다", () => {
    const view: DistrictViewFields = { id: "plaza", name: "옛-이름", subtitle: "옛-부제" };
    projectDistrictView(view, HERE);

    expect(view.id, "구역 id가 안 나갔다").toBe(HERE.id);
    expect(view.name, "배너가 옛 이름을 달고 있다").toBe(HERE.name);
    expect(view.subtitle, "부제가 옛 것으로 남았다").toBe(HERE.subtitle);
  });

  it("구역을 옮겨 다니면 따라온다", () => {
    const view: DistrictViewFields = { id: "plaza", name: "", subtitle: "" };
    projectDistrictView(view, HERE);
    const first = view.name;

    projectDistrictView(view, THERE);
    expect(view.name, `${first} → ${view.name}`).not.toBe(first);
    expect(view.id).toBe(THERE.id);
  });
});

describe("완주 집계를 쌓는가", () => {
  /*
   * 옮기기만 하는 위 함수들과 달리 **쌓는다.** 그래서 규칙이 둘 있는데 둘 다
   * 주석에만 있었다:
   *
   *   - 완주한 뒤에는 시간을 더 세지 않는다. 안 그러면 완주 화면을 열어 둔 채로
   *     기록이 계속 늘어난다 — **「1분 12초에 끝냈다」가 볼 때마다 달라진다.**
   *   - 최고 속도는 줄지 않는다. 지금 속도를 그대로 쓰면 결과 화면에
   *     **「최고 0.0 m/s」**가 뜬다(멈춰 서서 화면을 여니까).
   */
  const FRAME = 1 / 60;

  // 쌓는 함수라 시간·속도는 0에서 시작해야 뜻이 맞는다. 옮기기만 하는 두 칸은 뒤집어 둔다
  function fresh(): SummaryViewFields {
    return { ...staleCopy({ defeated: 0, bossDefeated: false }), elapsedSeconds: 0, maxSpeed: 0 };
  }

  const NOBODY = { defeatedTotal: 0, bossDefeated: false };

  it("진행 중에는 시간이 쌓인다", () => {
    const view = fresh();
    for (let i = 0; i < 60; i += 1) projectSummaryView(view, NOBODY, 3, FRAME, false);
    expect(view.elapsedSeconds, `${view.elapsedSeconds}초`).toBeCloseTo(1, 1);
  });

  it("완주한 뒤에는 시간이 멈춘다 — 안 멈추면 기록이 볼 때마다 달라진다", () => {
    const view = fresh();
    for (let i = 0; i < 60; i += 1) projectSummaryView(view, NOBODY, 3, FRAME, false);
    const atFinish = view.elapsedSeconds;

    for (let i = 0; i < 600; i += 1) projectSummaryView(view, NOBODY, 3, FRAME, true);
    expect(view.elapsedSeconds, `완주 후 ${view.elapsedSeconds}초 (완주 시점 ${atFinish})`).toBe(
      atFinish,
    );
  });

  it("최고 속도는 줄지 않는다 — 줄면 결과 화면에 「최고 0.0」이 뜬다", () => {
    const view = fresh();
    projectSummaryView(view, NOBODY, 7.4, FRAME, false);
    projectSummaryView(view, NOBODY, 0, FRAME, false);

    expect(view.maxSpeed, `최고 ${view.maxSpeed}`).toBeCloseTo(7.4, 6);
  });

  it("처치 수와 대장 기록이 같은 출처에서 온다 — 어긋나면 도감과 다른 말을 한다", () => {
    /*
     * 불리언은 **두 방향을 다 재야 한다.** 처음엔 참만 넣었다가 그 줄을 지워도
     * 통과했다 — 초기값이 마침 참이라 안 옮긴 것과 옮긴 것이 같아 보였다.
     * 「초기값을 기대값과 다르게」를 적어 두고도 같은 함정에 다시 빠졌다.
     */
    const view = fresh();
    projectSummaryView(view, { defeatedTotal: 12, bossDefeated: true }, 0, FRAME, false);
    expect(view.defeated, "처치 수가 안 나갔다").toBe(12);
    expect(view.bossDefeated, "대장 기록이 안 나갔다").toBe(true);

    projectSummaryView(view, { defeatedTotal: 12, bossDefeated: false }, 0, FRAME, false);
    expect(view.bossDefeated, "대장을 안 잡았는데 잡은 것으로 남았다").toBe(false);
  });

  it("완주 뒤에도 처치 수는 따라간다 — 시간만 멈추는 것이다", () => {
    const view = fresh();
    projectSummaryView(view, { defeatedTotal: 3, bossDefeated: false }, 0, FRAME, true);
    expect(view.defeated, `처치 ${view.defeated}`).toBe(3);
  });
});

describe("캐릭터 자세 신호를 옮기는가", () => {
  /*
   * 셋 다 **몸이 어떻게 움직이는지**를 정한다. 안 옮기면 춤을 춰도 가만히 서
   * 있고, 휘둘러도 팔이 안 나가고, 동료를 불러도 캐릭터가 모른 척한다.
   *
   * `emote`는 **객체를 그대로 넘긴다** — 안쪽 값(경과 시간)이 매 프레임 바뀌므로
   * 복사하면 한 프레임 낡은 자세를 그린다.
   */
  const DANCING = { ...createEmoteState(), elapsed: 0.4 };

  function stale(): CharacterCueFields {
    return {
      emote: createEmoteState(),
      attackElapsed: -1,
      companionPresent: true,
      downed: true,
      weapon: "beam",
    };
  }

  it("다섯이 모두 옮겨진다", () => {
    const view = stale();
    projectCharacterCues(view, DANCING, 0.2, false, false, "bow");

    expect(view.emote, "춤을 춰도 가만히 서 있다").toBe(DANCING);
    expect(view.attackElapsed, "휘둘러도 팔이 안 나간다").toBe(0.2);
    expect(view.companionPresent, "동료를 불렀는지 캐릭터가 모른다").toBe(false);
    expect(view.downed, "쓰러졌는지 캐릭터가 모른다 — 서서 미끄러진다").toBe(false);
    expect(view.weapon, "무기를 바꿔도 자세가 예전 길이로 그려진다").toBe("bow");
  });

  it("감정 객체를 복사하지 않는다 — 복사하면 한 프레임 낡은 자세를 그린다", () => {
    const view = stale();
    projectCharacterCues(view, DANCING, null, true, false, "bow");
    expect(view.emote, "감정 상태가 복사됐다").toBe(DANCING);
  });

  it("안 휘두르면 없음이 그대로 간다 — 0으로 바꾸면 늘 시작 자세다", () => {
    const view = stale();
    projectCharacterCues(view, DANCING, null, true, false, "bow");
    expect(view.attackElapsed).toBeNull();
  });
});

const LIVE_FOR_READS: CombatViewFields = {
  playerHp: 3,
  playerDowned: false,
  enemyBlips: new Float32Array([1, 2]),
  enemyBlipCount: 2,
  companionX: 11,
  companionZ: -4,
  companionVisible: false,
  companionAbilityReady: false,
};

describe("검사가 채워진 칸을 다 보고 있는가", () => {
  /*
   * 비교 방향 훑기에서 나온 결함 셋이 전부 **「값은 재고 있었는데 옆 칸을 안
   * 봤다」**였다. 한 칸만 읽는 검사는 나머지 칸이 무엇으로 바뀌든 통과한다.
   *
   * 그래서 **실행 중에** 읽힌 칸을 센다(`tests/support/readsAll.ts`).
   * 위 검사들이 실제로 모든 칸을 읽는지 여기서 확인한다.
   */
  it("도구 자체가 읽기를 제대로 센다", () => {
    /*
     * 도구가 늘 「다 읽었다」고 하면 아래 검사가 통째로 눈이 먼다.
     * `staleCopy`·`bothWays`에서 배운 대로 도구를 먼저 잰다.
     */
    const watch = watchReads({ a: 1, b: 2, c: 3 });
    expect(watch.unreadFields().sort(), "아무것도 안 읽었는데 읽었다고 한다").toEqual([
      "a",
      "b",
      "c",
    ]);

    void watch.watched.a;
    expect(watch.readFields(), "읽은 것을 안 센다").toEqual(["a"]);
    expect(watch.unreadFields().sort(), "안 읽은 것을 못 센다").toEqual(["b", "c"]);
  });

  it("쓰기는 읽기로 안 센다 — 채우는 함수를 그대로 감쌀 수 있어야 한다", () => {
    const watch = watchReads({ playerHp: 0, playerDowned: false });
    watch.watched.playerHp = 3;
    expect(watch.readFields(), "쓰기를 읽기로 셌다").toEqual([]);
  });

  it("전투 상태 검사가 여덟 칸을 다 본다", () => {
    const watch = watchReads<CombatViewFields>({
      playerHp: -1,
      playerDowned: true,
      enemyBlips: new Float32Array(0),
      enemyBlipCount: -1,
      companionX: -999,
      companionZ: -999,
      companionVisible: true,
      companionAbilityReady: true,
    });

    projectCombatView(watch.watched, LIVE_FOR_READS);

    // 위 「여덟 칸이 모두 옮겨진다」가 실제로 읽는 칸들
    void watch.watched.playerHp;
    void watch.watched.playerDowned;
    void watch.watched.enemyBlips;
    void watch.watched.enemyBlipCount;
    void watch.watched.companionX;
    void watch.watched.companionZ;
    void watch.watched.companionVisible;
    void watch.watched.companionAbilityReady;

    expect(watch.unreadFields(), "아무도 안 보는 칸이 있다").toEqual([]);
  });
});
