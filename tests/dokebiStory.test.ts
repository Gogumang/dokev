import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { DOKEBI, DOKEBI_ORDER, storyFor } from "@/game/dokebi/roster";

/*
 * 도깨비의 사연.
 *
 * 한 줄 소개와 능력만 있을 때 도감은 **카탈로그**로 읽혔다 — 모으고 싶은
 * 대상이 아니라 목록이었다. 원작에서 도깨비와 친해지는 조건에 「사연을 읽는
 * 것」이 들어간다는 정리가 이 항목의 근거다(DOKEV_VIDEO_STUDY 「3. 원작 ↔ 우리
 * 대조표」).
 *
 * 검사의 핵심은 **안 넘기는가**다. 화면에서 가리는 것과 데이터가 안 가는 것은
 * 다르다 — 가리기만 하면 조건 한 줄이 어긋나는 순간 못 만난 도깨비의 사연이
 * 그대로 뜬다.
 */
describe("사연이 있는가", () => {
  it("모두에게 사연이 있다", () => {
    for (const id of DOKEBI_ORDER) {
      expect(DOKEBI[id].story.length, `${id}에 사연이 없다`).toBeGreaterThan(1);
    }
  });

  it("빈 줄이 섞여 있지 않다", () => {
    // 빈 문자열은 화면에서 빈 줄로 남아 「덜 쓴 글」로 보인다
    for (const id of DOKEBI_ORDER) {
      for (const line of DOKEBI[id].story) {
        expect(line.trim().length, `${id}에 빈 줄이 있다`).toBeGreaterThan(0);
      }
    }
  });

  it("서로 다른 이야기다", () => {
    // 복붙한 사연은 넷을 모을 이유를 오히려 없앤다
    const all = DOKEBI_ORDER.flatMap((id) => DOKEBI[id].story);
    expect(new Set(all).size, "같은 문장이 두 번 쓰였다").toBe(all.length);
  });

  it("한 줄 소개를 그대로 옮기지 않았다", () => {
    for (const id of DOKEBI_ORDER) {
      expect(DOKEBI[id].story, `${id}의 사연이 소개와 같다`).not.toContain(DOKEBI[id].tagline);
    }
  });

  it("읽을 만한 길이다 — 길면 아무도 안 읽는다", () => {
    for (const id of DOKEBI_ORDER) {
      const total = DOKEBI[id].story.join("").length;
      expect(total, `${id}: ${total}자`).toBeLessThan(200);
    }
  });
});

describe("만나기 전에는 넘어가지 않는가", () => {
  it("못 만난 도깨비의 사연은 빈 목록이다", () => {
    for (const id of DOKEBI_ORDER) {
      expect(storyFor(id, []), `${id}의 사연이 그냥 나온다`).toEqual([]);
    }
  });

  it("만난 도깨비의 사연만 나온다", () => {
    const [first, second] = DOKEBI_ORDER;
    expect(storyFor(first, [first]), "만났는데 사연이 없다").toEqual(DOKEBI[first].story);
    expect(storyFor(second, [first]), "안 만난 쪽 사연이 샜다").toEqual([]);
  });

  it("도감이 이 문을 지나서 읽는다", () => {
    /*
     * 도감이 `DOKEBI[id].story`를 직접 읽으면 이 문은 장식이 된다. 화면이
     * **없는 것을 그릴 수 없게** 하려면 반드시 여기를 지나야 한다.
     */
    const codex = readCode("src/components/hud/CodexEntryBody.tsx");
    expect(codex, "도감이 사연 문을 안 쓴다").toMatch(/storyFor\(/);
    expect(codex, "도감이 사연을 직접 읽는다").not.toMatch(/\.story\b/);
  });
});
