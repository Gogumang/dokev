import { describe, expect, it } from "vitest";

import { SHOP_BRANDS } from "@/game/world/cityContent";

import { collectSources, readCode } from "./support/source";

import { chooseInteraction, nearestStatic } from "@/game/world/interaction";

/*
 * 상호작용 — 주민에게 말 걸기, 간판 살펴보기.
 *
 * 키를 둘로 나누지 않는다. 대상마다 키가 다르면 무엇 앞에 서 있는지 먼저
 * 판단하고 눌러야 하고, 그러면 아무것도 누르지 않게 된다.
 *
 * 그래서 「누가 반응하는가」가 규칙이 된다. 규칙이 흔들리면 같은 자리에서
 * 눌렀는데 어떤 때는 주민이, 어떤 때는 간판이 답한다.
 */

const near = { index: 0, distanceSquared: 1 };
const far = { index: 1, distanceSquared: 4 };
const outOfRange = { index: 2, distanceSquared: 400 };

describe("무엇이 반응하는가", () => {
  it("가까운 쪽이 반응한다", () => {
    expect(chooseInteraction(near, far)?.speaker).toBe("주민");
    expect(chooseInteraction(far, near)?.speaker).toBe("간판");
  });

  it("거리가 같으면 사람이 이긴다", () => {
    // 사람이 서 있는데 간판이 대답하면 이상하다
    const same = { index: 3, distanceSquared: 2 };
    expect(chooseInteraction(same, { ...same, index: 4 })?.speaker).toBe("주민");
  });

  it("한쪽만 있어도 된다", () => {
    expect(chooseInteraction(near, null)?.speaker).toBe("주민");
    expect(chooseInteraction(null, near)?.speaker).toBe("간판");
  });

  it("둘 다 멀면 아무 일도 없다", () => {
    // 누른 프레임에 대상이 없으면 그냥 사라진다
    expect(chooseInteraction(outOfRange, outOfRange)).toBeNull();
    expect(chooseInteraction(null, null)).toBeNull();
  });

  it("사거리 밖은 가까워도 무시한다", () => {
    // 「더 가까운 쪽」만 보면 사거리 밖 대상이 이길 수 있다
    expect(chooseInteraction(outOfRange, far)?.speaker).toBe("간판");
  });

  it("같은 대상은 늘 같은 말을 한다", () => {
    const first = chooseInteraction(null, { index: 5, distanceSquared: 1 });
    const second = chooseInteraction(null, { index: 5, distanceSquared: 2 });
    expect(first?.line).toBe(second?.line);
  });

  it("간판마다 다른 말이 나온다", () => {
    const lines = new Set(
      Array.from(
        { length: 12 },
        (_, i) => chooseInteraction(null, { index: i, distanceSquared: 1 })?.line,
      ),
    );
    expect(lines.size, `서로 다른 문구 ${lines.size}종`).toBeGreaterThan(3);
  });
});

describe("가장 가까운 정적 대상", () => {
  const points = [
    { x: 10, z: 0 },
    { x: 1, z: 1 },
    { x: -5, z: 5 },
  ];

  it("가장 가까운 것을 고른다", () => {
    expect(nearestStatic(points, 0, 0)?.index).toBe(1);
    expect(nearestStatic(points, 12, 0)?.index).toBe(0);
  });

  it("비어 있으면 null", () => {
    // 품질 등급에 따라 간판이 하나도 없을 수 있다
    expect(nearestStatic([], 0, 0)).toBeNull();
  });

  it("거리 제곱을 그대로 돌려준다", () => {
    // 제곱근은 고르는 데 필요 없다. 판정도 제곱끼리 비교한다
    expect(nearestStatic([{ x: 3, z: 4 }], 0, 0)?.distanceSquared).toBe(25);
  });
});

describe("살펴볼 대상이 실제로 있는가", () => {
  it("간판을 렌더 데이터에서 가져온다", () => {
    /*
     * 좌표를 두 번 계산하면 어긋난다 — 도로 좌표가 그렇게 어긋난 적이 있어
     * 자판기도 렌더와 같은 코드에서 채운다. 간판도 같은 규칙을 따른다.
     */
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    expect(rig, "간판 목록을 만들지 않는다").toContain("details.signsHorizontal");
  });

  it("군중은 후보만 올리고 소비하지 않는다", () => {
    // 두 곳이 각자 소비하면 같은 프레임에 서로의 줄을 덮어써 화면이 깜빡인다
    const crowd = readCode("src/game/world/Crowd.tsx");
    expect(crowd, "군중이 큐를 소비한다").not.toContain("talkQueued = false");
    expect(crowd, "후보를 올리지 않는다").toContain("talk.candidate");
  });

  it("고르는 규칙이 한 곳에만 있다", () => {
    const users = collectSources("src").filter((path) =>
      readCode(path).includes("chooseInteraction("),
    );
    // 정의 한 곳 + 부르는 한 곳
    expect(users, `쓰는 파일: ${users.join(", ")}`).toHaveLength(2);
  });
});

describe("간판이 보이는 대로 말하는가", () => {
  /*
   * **치킨집 앞에서 「약국」이라고 읽어 주고 있었다.**
   *
   * 간판에 그려지는 가게는 `cell`(무작위 브랜드)로 정해지는데, 살펴보기 대사는
   * **배열 순서**로 골랐다. 둘이 무관해서 보이는 간판과 읽히는 말이 어긋났다.
   * 게다가 대사 목록에는 「이용원」·「철물」처럼 **월드에 없는 가게**가 있었다.
   *
   * 이제 대사는 `SHOP_BRANDS`와 같은 순서로 놓이고 `cell`로 고른다.
   */
  it("가게 수와 대사 수가 같다", () => {
    const source = readCode("src/game/world/interaction.ts");
    const lines = source.slice(
      source.indexOf("const SIGN_LINES"),
      source.indexOf("];", source.indexOf("const SIGN_LINES")),
    );
    const count = (lines.match(/^\s*"/gm) ?? []).length;
    expect(count, `대사 ${count}줄, 가게 ${SHOP_BRANDS.length}종`).toBe(SHOP_BRANDS.length);
  });

  it("각 대사가 그 자리 가게를 부른다", () => {
    /*
     * 순서만 맞추면 다음에 가게를 하나 끼워 넣을 때 조용히 한 칸씩 밀린다.
     * **이름이 실제로 들어 있는지**까지 본다.
     */
    const source = readCode("src/game/world/interaction.ts");
    const lines = source.slice(
      source.indexOf("const SIGN_LINES"),
      source.indexOf("];", source.indexOf("const SIGN_LINES")),
    );
    const texts = [...lines.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    SHOP_BRANDS.forEach((brand, index) => {
      expect(texts[index], `${index}번 가게 ${brand.long}의 대사가 다른 가게를 부른다`).toContain(
        brand.long,
      );
    });
  });

  it("무엇인지로 고르고 순서로 고르지 않는다", () => {
    // `cell`을 떨어뜨리면 다시 순서로 돌아간다 — 그 회귀를 막는다
    const source = readCode("src/game/world/interaction.ts");
    expect(source, "간판 종류를 보지 않는다").toContain("points[index].cell ?? index");
    const rig = readCode("src/game/scene/PlayerRig.tsx");
    expect(rig, "간판 종류를 넘기지 않는다").toMatch(
      /signsHorizontal[\s\S]{0,120}cell: sign\.cell/,
    );
  });
});
