import { describe, expect, it } from "vitest";

import { stableClueList } from "@/app/play/useFoundClues";
import { progressChanged } from "@/app/play/useProgressSave";

import { readCode } from "./support/source";

import { CLUES, pendingClues } from "@/game/quest/clues";
import { revealedClues } from "@/game/quest/clueReveal";

/*
 * 도감이 초롱을 「주변에 숨은 흔적을 잠깐 빛나게 한다」고 소개하는데, 흔적은
 * 월드에 그려지지도 않았다 — 없는 기능을 약속하고 있었다. 그 약속을 지키는
 * 계산이다.
 */

describe("revealedClues", () => {
  it("반경 안의 흔적만 고른다", () => {
    // Arrange
    const clues = [
      { x: 3, z: 4 }, // 5m
      { x: 0, z: 12 }, // 12m
    ];

    // Act
    const found = revealedClues(clues, 0, 0, 6);

    // Assert
    expect(found, `고른 것: ${JSON.stringify(found)}`).toEqual([{ x: 3, z: 4 }]);
  });

  it("경계 위의 흔적은 드러난다", () => {
    // 딱 걸치는 자리에서 「보였다 안 보였다」 하면 고장으로 읽힌다
    expect(revealedClues([{ x: 5, z: 0 }], 0, 0, 5)).toHaveLength(1);
  });

  it("능력이 꺼져 있으면 아무것도 드러나지 않는다", () => {
    /*
     * 반경 0이 「능력 꺼짐」이다. 부르는 쪽이 조건을 한 번 더 쓰지 않아도
     * 되도록 여기서 끝낸다 — 조건이 두 곳에 있으면 한쪽만 고쳐진다.
     */
    const clues = [{ x: 0, z: 0 }];
    expect(revealedClues(clues, 0, 0, 0), "반경 0인데 드러났다").toEqual([]);
    expect(revealedClues(clues, 0, 0, -3), "음수 반경인데 드러났다").toEqual([]);
    expect(revealedClues(clues, 0, 0, Number.NaN), "NaN인데 드러났다").toEqual([]);
  });

  it("동료 자리를 기준으로 잰다", () => {
    /*
     * 플레이어가 아니라 **동료**가 빛을 낸다. 플레이어 기준으로 재면 동료가
     * 뒤처져 있을 때 없는 빛으로 흔적이 드러난다.
     */
    const clue = [{ x: 20, z: 0 }];
    expect(revealedClues(clue, 0, 0, 6), "먼 곳에서 드러났다").toEqual([]);
    expect(revealedClues(clue, 18, 0, 6), "동료 옆인데 안 드러났다").toHaveLength(1);
  });

  it("이미 찾은 흔적은 애초에 넘어오지 않는다", () => {
    // 목록을 거르는 책임은 `pendingClues`에 있다 — 두 곳에서 거르지 않는다
    const remaining = pendingClues([CLUES[0].id]);
    expect(
      remaining.map((clue) => clue.id),
      "찾은 것이 남아 있다",
    ).not.toContain(CLUES[0].id);
    expect(remaining.length, `남은 흔적 ${remaining.length}곳`).toBe(CLUES.length - 1);
  });

  it("아주 넓은 빛이면 남은 흔적을 모두 드러낸다", () => {
    // 자정의 「골목 구석까지 한꺼번에 드러난다」가 문자 그대로 맞아야 한다
    const remaining = pendingClues([]);
    const all = revealedClues(remaining, remaining[0].x, remaining[0].z, 10_000);
    expect(all.length, `${all.length} / ${remaining.length}`).toBe(remaining.length);
  });
});

describe("흔적 표식이 지키는 약속", () => {
  /*
   * 계산은 위에서 봤고, 여기서는 **화면 쪽 약속**을 본다. 소리와 마찬가지로
   * 「예쁜가」는 값으로 알 수 없지만, 적어 둔 관계는 지킬 수 있다.
   */
  const source = readCode("src/game/quest/ClueGlow.tsx");

  it("지도 범례와 같은 색을 쓴다", () => {
    /*
     * 지도에서 노란 마름모를 보고 찾아온 사람이 월드에서 다른 색을 만나면
     * 같은 것인 줄 모른다. 정본은 `CityMap`의 `MARKS.clue`다.
     */
    const map = readCode("src/game/systems/cityMapPaint.ts");
    const marks = map.slice(map.indexOf("const MARKS = {"), map.indexOf("} as const;"));
    const clue = /clue: \{ color: "(#[0-9a-fA-F]{6})"/.exec(marks);
    expect(clue, "지도의 흔적 색을 못 읽었다").toBeTruthy();

    const mark = /MARK_COLOR = "(#[0-9a-fA-F]{6})"/.exec(source);
    expect(mark, "표식 색을 못 읽었다").toBeTruthy();
    expect(mark?.[1]?.toLowerCase(), `지도 ${clue?.[1]}, 월드 ${mark?.[1]}`).toBe(
      clue?.[1]?.toLowerCase(),
    );
  });

  it("저감 모션에서는 숨쉬지 않는다", () => {
    // 깜빡이는 것에 예민한 사람이 있다 — 이 프로젝트의 다른 연출과 같은 규칙이다
    expect(source, "저감 모션을 보지 않는다").toContain("if (reducedMotion) return;");
  });

  it("매 프레임 지오메트리를 만들지 않는다", () => {
    /*
     * 자식을 매 프레임 다시 만들면 지오메트리가 쌓인다 — 이 프로젝트가 이미
     * 겪은 누수다. 보이기만 바꾸는지 본다.
     */
    const frame = source.slice(source.indexOf("useFrame("));
    expect(frame, "프레임 안에서 새로 만든다").not.toMatch(/new THREE\./);
    expect(frame, "보이기를 바꾸지 않는다").toContain("child.visible");
  });

  it("바닥에서 띄워 둔다", () => {
    // 0이면 바닥과 z-파이팅이 나서 지글거린다
    const height = /MARK_HEIGHT = ([\d.]+)/.exec(source);
    expect(height, "높이를 못 읽었다").toBeTruthy();
    expect(Number(height?.[1]), `높이 ${height?.[1]}m`).toBeGreaterThan(0);
  });
});

describe("흔적 표식이 씬에 붙어 있는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 씬에서 `<ClueGlow>`를 **통째로 지워도** 검사가
   * 전부 통과했다 — 계산과 컴포넌트는 검사가 지키는데 **씬에 붙어 있는지**는
   * 아무도 안 봤다.
   *
   * 그러면 도감이 「주변에 숨은 흔적을 잠깐 빛나게 한다」고 약속해 놓고 눈앞에서는
   * 아무 일도 안 난다 — **이 기능이 애초에 그 결함을 고치려고 생긴 것**이다.
   *
   * 순서도 함께 지킨다. 프레임 순서는 JSX 형제 순서다: `PlayerRig`가 되돌리고,
   * `Companion`이 빛 범위를 실어 주고, `ClueGlow`가 읽는다. 동료보다 먼저 등록되면
   * **되돌려진 0을 읽어** 원반이 영영 안 뜬다 — 실제로 한 번 그렇게 만들었다.
   */
  const scene = readCode("src/game/scene/GameScene.tsx");

  it("씬이 흔적 표식을 그린다", () => {
    expect(scene, "도감이 약속한 기능이 씬에 없다").toContain("<ClueGlow");
  });

  it("동료보다 뒤에 등록한다", () => {
    const companion = scene.indexOf("<Companion");
    const glow = scene.indexOf("<ClueGlow");
    expect(companion, "동료가 씬에 없다").toBeGreaterThan(0);
    expect(
      glow,
      `동료는 ${companion}번째, 표식은 ${glow}번째 — 표식이 먼저면 되돌려진 0을 읽는다`,
    ).toBeGreaterThan(companion);
  });

  it("플레이어 되돌리기보다 뒤에 등록한다", () => {
    // 되돌리기 → 합치기 → 읽기 순서의 첫 칸이다
    const rig = scene.indexOf("<PlayerRig");
    expect(scene.indexOf("<ClueGlow"), "표식이 되돌리기보다 먼저다").toBeGreaterThan(rig);
  });
});

describe("저장과 화면 갱신을 언제 하는가", () => {
  /*
   * 둘 다 「바뀐 게 없으면 아무것도 하지 않는다」는 판단이다. 훅 안에 있을 때는
   * **지워도 아무도 몰랐다.**
   *
   *   - 저장 — 매 주기 `localStorage`에 쓴다. 값은 같은데 쓰기만 쌓이고,
   *     저장이 느린 브라우저에서는 그 사이 프레임이 튄다.
   *   - 목록 — 매번 새 배열을 만들면 React가 「바뀌었다」로 읽어 **아무 일도
   *     없는데 화면이 계속 다시 그려진다.** 초당 세 번 도는 주기다.
   */
  it("바뀐 게 없으면 저장하지 않는다", () => {
    expect(progressChanged(2, 2, false, false), "그대로인데 저장한다").toBe(false);
    expect(progressChanged(0, 0, true, true), "이미 저장된 대장 기록으로 또 저장한다").toBe(false);
  });

  it("흔적이 늘면 저장한다", () => {
    expect(progressChanged(3, 2, false, false), "흔적을 찾았는데 저장 안 한다").toBe(true);
  });

  it("대장을 처음 눕히면 저장한다", () => {
    expect(progressChanged(0, 0, true, false), "대장 기록이 저장 안 된다").toBe(true);
  });

  it("저장을 되돌리지는 않는다 — 켜진 기록이 꺼지는 방향은 안 본다", () => {
    // 저장에는 있는데 지금 화면이 꺼져 있는 경우(확인 지점 등)에 덮어쓰면 기록이 사라진다
    expect(progressChanged(0, 0, false, true), "기록을 지우려 한다").toBe(false);
  });

  it("목록이 그대로면 같은 배열을 돌려준다", () => {
    const held = ["scratch", "puddle"];
    expect(stableClueList(held, ["scratch", "puddle"]), "새 배열을 만들었다").toBe(held);
  });

  it("목록이 늘면 새 배열을 돌려준다", () => {
    const held = ["scratch"];
    const next = stableClueList(held, ["scratch", "puddle"]);

    expect(next, "안 바뀌었다").not.toBe(held);
    expect(next, `${next.join(", ")}`).toEqual(["scratch", "puddle"]);
  });
});
