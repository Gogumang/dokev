import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BOSS, type BossPhase } from "@/game/combat/bossSim";
import { BOSS_CLIP, bossClipFor, bossPlaybackRate, holdsLastFrame } from "@/game/combat/bossClips";

/*
 * 대장의 동작이 실제 파일과 맞는가.
 *
 * 이름이 한 글자만 달라도 **재생이 조용히 안 된다** — 예외도 오류도 없이
 * 대장이 굳은 채로 미끄러진다. 플레이어에서 이미 겪은 자리라 같은 방식으로
 * 막는다(`characterClips.test.ts`).
 */

const PHASES: BossPhase[] = ["idle", "chase", "windup", "slam", "recover", "stagger", "down"];

describe("동작 이름이 실제 파일과 맞는가", () => {
  /*
   * GLB 전체를 파싱하는 대신 JSON 청크만 읽는다. 헤더 12바이트 뒤에 길이가
   * 있고 그다음이 JSON이다 — 동작 이름은 거기 들어 있다.
   */
  const names: string[] = (() => {
    const buf = readFileSync("public/models/boss-scrap-foreman.glb");
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    return (json.animations ?? []).map((animation: { name: string }) => animation.name);
  })();

  const used: string[] = Object.values(BOSS_CLIP);

  it("파일에서 동작을 실제로 읽었다", () => {
    // 못 읽으면 빈 목록과 대조하며 조용히 통과한다
    expect(names.length, `읽은 동작 ${names.length}개`).toBeGreaterThan(3);
  });

  it("코드가 쓰는 이름이 모두 파일에 있다", () => {
    const missing = used.filter((name) => !names.includes(name));
    expect(missing, `파일에 없는 동작:\n${missing.join("\n")}`).toEqual([]);
  });

  it("파일에 있는데 안 쓰는 동작이 없다", () => {
    /*
     * 안 쓰는 동작은 받기만 하고 안 트는 용량이다. 원본에는 열여덟이 있었고
     * `Running`도 그중 하나였다 — 대장은 2.2m/s라 걷는다.
     */
    const unused = names.filter((name) => !used.includes(name));
    expect(unused, `안 쓰는 동작:\n${unused.join("\n")}`).toEqual([]);
  });
});

describe("단계마다 고를 것이 있는가", () => {
  it("일곱 단계가 모두 동작을 얻는다", () => {
    // 하나라도 비면 그 단계에서 대장이 굳는다
    for (const phase of PHASES) {
      expect(bossClipFor(phase), `${phase}에 동작이 없다`).toBeTruthy();
    }
  });

  it("서로 다른 단계가 같은 동작을 쓰지 않는다", () => {
    /*
     * 예고와 내려치기가 같은 동작이면 **언제 피해야 하는지 볼 수 없다.**
     * 단계를 일곱으로 나눈 이유가 화면에 없으면 나눈 뜻이 사라진다.
     */
    const clips = PHASES.map(bossClipFor);
    expect(new Set(clips).size, `동작 ${new Set(clips).size}종 / 단계 ${PHASES.length}개`).toBe(
      PHASES.length,
    );
  });

  it("쓰러짐만 끝 자세에서 멈춘다", () => {
    // 반복하면 넘어진 대장이 25초 동안 계속 다시 넘어진다
    expect(holdsLastFrame(BOSS_CLIP.down)).toBe(true);
    for (const phase of PHASES.filter((p) => p !== "down")) {
      expect(holdsLastFrame(bossClipFor(phase)), `${phase}가 멈춘다`).toBe(false);
    }
  });
});

describe("예고가 예고 시간과 맞는가", () => {
  it("동작이 길면 빠르게, 짧으면 느리게 튼다", () => {
    /*
     * 예고는 **정확히 `BOSS.windupSeconds` 동안** 팔이 올라가야 한다. 그보다
     * 길면 다 올라가기 전에 판정이 오고, 짧으면 팔을 든 채로 기다린다 — 둘 다
     * 「보고 피한다」를 무너뜨린다.
     */
    expect(bossPlaybackRate(2.2, BOSS.windupSeconds)).toBeCloseTo(2, 6);
    expect(bossPlaybackRate(0.55, BOSS.windupSeconds)).toBeCloseTo(0.5, 6);
  });

  it("맞출 시간이 없으면 원래 속도로 튼다", () => {
    // 지속이 정해지지 않은 단계(쫓기·서 있기)는 늘리거나 줄일 이유가 없다
    expect(bossPlaybackRate(3, 0)).toBe(1);
    expect(bossPlaybackRate(0, 1.1)).toBe(1);
  });
});
