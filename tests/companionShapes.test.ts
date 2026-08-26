import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPANION_HEIGHT,
  COMPANION_MODEL_HEIGHT,
  COMPANION_SHAPE,
  companionClipFor,
  companionPlaybackRate,
} from "@/game/dokebi/companionShapes";
import {
  COMPANION_TUNING,
  createCompanionState,
  stepCompanion,
} from "@/game/dokebi/companionMotion";
import { DOKEBI_ORDER } from "@/game/dokebi/roster";
import { PLAYER_HEIGHT } from "@/game/config/tuning";
import { terrainHeight } from "@/game/world/terrain";

/*
 * 동료가 땅에 제대로 서는가, 그리고 동작 이름이 파일과 맞는가.
 *
 * 둘 다 **화면을 봐야만 알던 것**이다. 실제로 한 번씩 겪었다: 반 키를 잘못
 * 빼서 동료 셋이 목까지 파묻힌 채로 검사 2,891개가 전부 통과했고, 대장에서는
 * 동작 이름이 한 글자 달라 조용히 굳은 채 미끄러졌다.
 */

describe("발이 땅에 닿는가", () => {
  const target = {
    // PlayerRig가 넘기는 것은 **발** 높이다 — 몸통을 그릴 때 여기에 반 키를 더한다
    position: { x: 12, y: terrainHeight(12, -8), z: -8 },
    speed: 0,
    facing: 0,
    grounded: true,
  };

  it("플레이어 발과 같은 높이에서 시작한다", () => {
    const state = createCompanionState(target.position, 0, 1);
    const gap = state.position.y - target.position.y;
    expect(gap, `${gap.toFixed(2)}m 떠 있다`).toBeLessThan(0.1);
    expect(gap, `${gap.toFixed(2)}m 파묻혔다`).toBeGreaterThanOrEqual(0);
  });

  it("따라다니는 동안에도 땅을 유지한다", () => {
    /*
     * 한 번은 맞고 그 뒤로 가라앉는 경우가 있다 — 목표 높이와 초기 높이를
     * 서로 다른 식으로 구하면 그렇게 된다. 2초를 돌려 본다.
     */
    let state = createCompanionState(target.position, 0, 1);
    for (let step = 0; step < 120; step += 1) {
      state = stepCompanion(
        state,
        target,
        1 / 60,
        { summoned: true, abilityRequests: 0 },
        undefined,
        0,
        1,
      );
    }
    const ground = terrainHeight(state.position.x, state.position.z);
    const gap = state.position.y - ground;
    expect(gap, `2초 뒤 ${gap.toFixed(2)}m`).toBeLessThan(0.25);
    expect(gap, `2초 뒤 ${gap.toFixed(2)}m 파묻힘`).toBeGreaterThan(-0.15);
  });

  it("머리 높이에 떠 있지 않다", () => {
    // 예전 값(1.7m)으로 되돌아가면 걷는 동작이 공중에서 돈다
    expect(COMPANION_TUNING.groundClearance, "지면 간격이 사람 키만 하다").toBeLessThan(0.2);
  });
});

describe("키가 주인공과 구분되는가", () => {
  it("주인공보다 작다", () => {
    // 같은 키면 둘째 주인공처럼 보이고, 넷이 붙으면 화면이 사람으로 찬다
    expect(COMPANION_HEIGHT).toBeLessThan(PLAYER_HEIGHT * 0.75);
  });

  it("발밑 소품에 묻힐 만큼 작지도 않다", () => {
    expect(COMPANION_HEIGHT).toBeGreaterThan(0.6);
  });
});

describe("동작 이름이 실제 파일과 맞는가", () => {
  /** GLB 전체를 파싱하지 않고 JSON 청크만 읽는다 (`bossClips.test.ts`와 같은 방식) */
  function readModel(path: string) {
    const buf = readFileSync(path);
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    const node = json.nodes.find((entry: { mesh?: number }) => entry.mesh !== undefined);
    return {
      clips: (json.animations ?? []).map((clip: { name: string }) => clip.name) as string[],
      scale: node?.scale?.[1] ?? 1,
    };
  }

  for (const id of DOKEBI_ORDER) {
    const shape = COMPANION_SHAPE[id];
    if (!shape.url) {
      it(`${id}는 아직 모델이 없다 — 등불로 남는다`, () => {
        // 없는 것도 적어 둔다. 조용히 빠지면 「왜 얘만 등불이지」가 미궁이 된다
        expect(shape.walk).toBe("");
        expect(companionClipFor(shape, "follow", false)).toBeNull();
      });
      continue;
    }

    const model = readModel(`public${shape.url}`);

    it(`${shape.label}에서 동작을 실제로 읽었다`, () => {
      /*
       * 못 읽으면 빈 목록과 대조하며 아래 검사들이 조용히 통과한다.
       *
       * 개수로 세지 않는다 — 안 쓰는 동작을 버리고 나면 버섯은 둘뿐이다
       * (달리기·쿵후 펀치). 「셋 이상」 같은 자를 대면 정리할 때마다 걸린다.
       */
      expect(model.clips.length, "동작을 하나도 못 읽었다").toBeGreaterThan(0);
      expect(
        model.clips.every((name) => typeof name === "string" && name.length > 0),
        `이름이 아닌 것이 섞였다: ${JSON.stringify(model.clips)}`,
      ).toBe(true);
    });

    it(`${shape.label}이 쓰는 이름이 모두 파일에 있다`, () => {
      /*
       * 한 글자만 달라도 재생이 조용히 안 된다 — 예외도 오류도 없이 T포즈로
       * 미끄러진다.
       */
      const used = [shape.walk, shape.run, shape.ability];
      const missing = used.filter((name) => !model.clips.includes(name));
      expect(missing, `파일에 없는 동작:\n${missing.join("\n")}`).toEqual([]);
    });

    it(`${shape.label}에 안 쓰는 동작이 없다`, () => {
      /*
       * 안 쓰는 동작은 받기만 하고 안 트는 용량이다 — 이 파일들은 절반 가까이가
       * 애니메이션이라 그 값이 크다. 원본에는 일어서기·넉다운·펀치 콤보·돌진이
       * 함께 왔는데 **대응하는 상태가 게임에 없다.** 셋을 버려 275KB를 돌려받았다.
       *
       * 대장에 걸어 둔 것과 같은 규칙이다(`bossClips.test.ts`). 반대 방향(코드가
       * 쓰는 이름이 파일에 있는가)만 재면, 안 쓰는 것이 조용히 쌓인다.
       */
      const used = new Set([shape.walk, shape.run, shape.ability]);
      const unused = model.clips.filter((name) => !used.has(name));
      expect(unused, `안 쓰는 동작:\n${unused.join("\n")}`).toEqual([]);
    });

    it(`${shape.label}의 어느 기분에도 빈 동작이 없다`, () => {
      for (const mood of ["idle", "follow", "rush", "airborne"] as const) {
        const clip = companionClipFor(shape, mood, false);
        expect(model.clips, `${mood}에 ${clip}이 없다`).toContain(clip);
      }
      expect(model.clips).toContain(companionClipFor(shape, "follow", true));
    });
  }
});

describe("동작을 얼마나 빨리 트는가", () => {
  it("빠를수록 빨리 튼다", () => {
    // 속도와 무관하게 1배로 틀면 느릴 때 미끄러지고 빠를 때 종종거린다
    expect(companionPlaybackRate(6, "follow")).toBeGreaterThan(companionPlaybackRate(2, "follow"));
  });

  it("멈춰도 굳지 않는다", () => {
    // 0배면 한 프레임에 멈춘 채로 미끄러진다 — 정지가 아니라 고장으로 보인다
    expect(companionPlaybackRate(0, "idle")).toBeGreaterThan(0.3);
  });

  it("아무리 빨라도 종종거리지 않는다", () => {
    expect(companionPlaybackRate(99, "rush")).toBeLessThan(2.5);
  });
});

describe("모델 원본 규약", () => {
  it("적어 둔 원본 키가 실제와 맞는다", () => {
    /*
     * 배율이 `COMPANION_HEIGHT / COMPANION_MODEL_HEIGHT`뿐이라, 원본 키가
     * 틀리면 동료가 통째로 커지거나 작아진다. Meshy 규약이 1.7이고
     * 캐릭터·대장도 같은 값을 쓴다.
     */
    expect(COMPANION_MODEL_HEIGHT).toBeCloseTo(1.7, 2);
  });
});
