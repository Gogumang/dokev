import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { bothWays, describeSplit } from "./support/bothWays";

import {
  CLIP,
  clipFor,
  freezes,
  holdsLastFrame,
  playbackRate,
  type ClipInput,
} from "@/game/player/characterClips";
import { POSE_TUNING } from "@/game/player/characterPose";
import { createEmoteState } from "@/game/player/emote";

/*
 * 캐릭터 동작 고르기.
 *
 * 모델이 들고 온 동작은 여섯인데 게임의 상태는 그보다 많다. 무엇을 무엇으로
 * 대신할지가 규칙이고, 그 규칙이 틀리면 **화면에서만** 드러난다 — 가만히 서
 * 있는 사람이 계속 바닥에서 일어나는 것을 실제로 봤다.
 */

function at(overrides: Partial<ClipInput> = {}): ClipInput {
  return {
    mode: "walk",
    speed: 0,
    grounded: true,
    gliding: false,
    attackElapsed: null,
    emote: createEmoteState(),
    downed: false,
    ...overrides,
  };
}

describe("동작 이름이 실제 파일과 맞는가", () => {
  /*
   * 이름이 한 글자만 달라도 **재생이 조용히 안 된다** — 예외도 오류도 없이
   * 캐릭터가 굳은 채로 미끄러진다. 코드의 상수와 파일 속 이름을 대조한다.
   *
   * GLB 전체를 파싱하는 대신 JSON 청크만 읽는다. 헤더 12바이트 뒤에 길이가
   * 있고 그다음이 JSON이다 — 동작 이름은 거기 들어 있다.
   */
  const names: string[] = (() => {
    const buf = readFileSync("public/character.glb");
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    return (json.animations ?? []).map((animation: { name: string }) => animation.name);
  })();

  const used: string[] = Object.values(CLIP);

  it("파일에서 동작을 실제로 읽었다", () => {
    // 못 읽으면 빈 목록과 대조하며 조용히 통과한다
    expect(names.length, `읽은 동작 ${names.length}개`).toBeGreaterThan(3);
  });

  it("코드가 쓰는 이름이 모두 파일에 있다", () => {
    const missing = used.filter((name) => !names.includes(name));
    expect(missing, `파일에 없는 동작:\n${missing.join("\n")}`).toEqual([]);
  });

  it("파일에 있는데 안 쓰는 동작이 없다", () => {
    // 안 쓰는 동작은 받기만 하고 안 트는 용량이다
    const unused = names.filter((name) => !used.includes(name));
    expect(unused, `안 쓰는 동작:\n${unused.join("\n")}`).toEqual([]);
  });
});

describe("무엇을 재생하는가", () => {
  it("가만히 있으면 서 있는다", () => {
    expect(clipFor(at())).toBe(CLIP.idle);
  });

  it("걸으면 걷고 달리면 달린다", () => {
    expect(clipFor(at({ speed: 2 }))).toBe(CLIP.walk);
    expect(clipFor(at({ speed: POSE_TUNING.runSpeed + 1 }))).toBe(CLIP.run);
  });

  it("쓰러지면 다른 무엇보다 먼저다 — 쓰러진 채로 달릴 수는 없다", () => {
    expect(clipFor(at({ downed: true, speed: 9, attackElapsed: 0.2 }))).toBe(CLIP.dead);
  });

  it("휘두르면 이동을 덮는다 — 달리면서 쳐도 팔이 먼저다", () => {
    expect(clipFor(at({ speed: 9, attackElapsed: 0.1 }))).toBe(CLIP.attack);
  });

  it("감정 표현은 멈춰 서 있을 때만 — 달리다 추면 발이 미끄러진다", () => {
    const dancing = { ...createEmoteState(), elapsed: 0.3 };
    expect(clipFor(at({ emote: dancing }))).toBe(CLIP.skill);
    expect(clipFor(at({ emote: dancing, speed: 6 })), "달리는데 춤이 나왔다").toBe(CLIP.run);
  });

  it("공중에서는 달리기 자세를 쓴다 — 맞는 동작이 없다", () => {
    expect(clipFor(at({ grounded: false, speed: 0 }))).toBe(CLIP.run);
  });

  it("상황에 따라 실제로 갈린다 — 늘 같은 것을 돌려주면 규칙이 없는 것이다", () => {
    const cases = [
      at(),
      at({ speed: 2 }),
      at({ speed: 9 }),
      at({ downed: true }),
      at({ attackElapsed: 0.1 }),
    ];
    const clips = new Set(cases.map(clipFor));
    expect(clips.size, `나온 동작: ${[...clips].join(", ")}`).toBe(5);
  });
});

describe("언제 멈춰 세우는가", () => {
  /*
   * 공중에서 발을 계속 구르면 허공에서 헤엄치는 그림이 된다 — 3D 게임에서
   * 가장 흔한 어색함이다.
   */
  it("공중에서는 세운다", () => {
    expect(freezes(at({ grounded: false }))).toBe(true);
  });

  it("땅에서는 안 세운다", () => {
    expect(freezes(at({ speed: 5 }))).toBe(false);
  });

  it("공중에서 맞거나 휘둘러도 그 동작은 이어진다", () => {
    expect(freezes(at({ grounded: false, downed: true })), "쓰러지는 동작이 멈췄다").toBe(false);
    expect(freezes(at({ grounded: false, attackElapsed: 0.1 })), "휘두르다 멈췄다").toBe(false);
  });

  it("상황에 따라 갈린다", () => {
    const cases = [at(), at({ grounded: false }), at({ grounded: false, downed: true })];
    expect(bothWays(cases, freezes), describeSplit(cases, freezes)).toBe(true);
  });
});

describe("얼마나 빨리 재생하는가", () => {
  /*
   * 고정 속도로 돌리면 발이 땅과 따로 놀아 미끄러지는 것처럼 보인다.
   */
  it("빨리 달릴수록 빨리 재생한다", () => {
    const slow = playbackRate(at({ speed: 1 }));
    const fast = playbackRate(at({ speed: POSE_TUNING.runSpeed + 3 }));
    expect(fast, `느릴 때 ${slow}, 빠를 때 ${fast}`).toBeGreaterThan(slow);
  });

  it("너무 느리거나 빠르지 않다 — 정지 화면이나 떨림이 된다", () => {
    for (const speed of [0.5, 1, 3, 8, 40]) {
      const rate = playbackRate(at({ speed }));
      expect(rate, `속도 ${speed} → ${rate}배`).toBeGreaterThanOrEqual(0.6);
      expect(rate, `속도 ${speed} → ${rate}배`).toBeLessThanOrEqual(1.8);
    }
  });

  it("멈춰 있거나 공중이면 원래 속도다", () => {
    expect(playbackRate(at())).toBe(1);
    expect(playbackRate(at({ grounded: false, speed: 9 }))).toBe(1);
  });
});

describe("끝 자세에서 멈추는 동작", () => {
  it("서 있기와 쓰러짐은 멈춘다", () => {
    expect(holdsLastFrame(CLIP.idle), "서 있기가 반복되면 계속 일어난다").toBe(true);
    expect(holdsLastFrame(CLIP.dead), "쓰러짐이 반복되면 죽었다 살아난다").toBe(true);
  });

  it("걷기·달리기는 반복한다 — 멈추면 한 걸음 뒤 굳는다", () => {
    expect(holdsLastFrame(CLIP.walk)).toBe(false);
    expect(holdsLastFrame(CLIP.run)).toBe(false);
  });
});
