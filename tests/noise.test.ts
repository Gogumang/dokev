import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { createNoiseBuffer } from "@/game/systems/audio/noise";

/*
 * 노이즈 버퍼.
 *
 * 검사가 하나도 없었다. 그런데 이 모듈의 주석에는 **숫자로 된 주장**이 셋
 * 있다 — 「2.5초면 반복을 인지하지 못한다」, 「경계를 이어 붙이지 않으면 한
 * 바퀴마다 틱 소리가 난다」, 「핑크 필터 출력은 ±9라 0.11로 되돌린다」.
 *
 * 앞의 둘은 귀로만 알 수 있지만 **셋째는 돌려 보면 확인된다.** 정규화가
 * 어긋나면 이후 게인들이 전부 클리핑 근처에서 놀게 되고, 그건 「지직거린다」로
 * 나타난다.
 *
 * 오디오 노드는 필요 없다. `createBuffer`만 흉내 내면 실제 데이터가 나온다.
 */

/** `createBuffer`만 있는 최소 컨텍스트. 실제 계산은 모듈이 한다 */
function fakeContext(sampleRate = 8000): BaseAudioContext {
  return {
    sampleRate,
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return {
        length,
        sampleRate,
        getChannelData: () => data,
      };
    },
  } as unknown as BaseAudioContext;
}

describe("노이즈 버퍼", () => {
  it("같은 시드는 같은 소리를 만든다", () => {
    /*
     * 세션마다 달라지면 소리 문제를 재현할 수 없다 — 도시 배치와 같은 이유다.
     */
    const a = createNoiseBuffer(fakeContext(), "white", 42).getChannelData(0);
    const b = createNoiseBuffer(fakeContext(), "white", 42).getChannelData(0);
    expect(Array.from(a.slice(0, 50))).toEqual(Array.from(b.slice(0, 50)));
  });

  it("시드가 다르면 다른 소리가 난다", () => {
    const a = createNoiseBuffer(fakeContext(), "white", 1).getChannelData(0);
    const b = createNoiseBuffer(fakeContext(), "white", 2).getChannelData(0);
    expect(Array.from(a.slice(0, 50))).not.toEqual(Array.from(b.slice(0, 50)));
  });

  it("버퍼가 비어 있지 않다", () => {
    // 길이가 0이면 소리가 아예 안 난다 — 배선은 멀쩡한 채로
    const data = createNoiseBuffer(fakeContext(), "pink", 7).getChannelData(0);
    expect(data.length, `표본 ${data.length}개`).toBeGreaterThan(1000);
    const loudest = Math.max(...Array.from(data, Math.abs));
    expect(loudest, `가장 큰 값 ${loudest.toFixed(3)}`).toBeGreaterThan(0.05);
  });

  for (const color of ["white", "pink"] as const) {
    it(`${color} 노이즈가 -1..1 안에 있다`, () => {
      /*
       * 이 범위를 넘으면 이후 게인이 전부 클리핑 근처에서 놀고, 귀에는
       * 「지직거린다」로 들린다. 핑크 쪽 정규화 계수(0.11)가 실제로 맞는지를
       * 여기서 확인한다 — 주석의 주장이 참인지 돌려 보는 것이다.
       */
      const data = createNoiseBuffer(fakeContext(), color, 20260818).getChannelData(0);
      const loudest = Math.max(...Array.from(data, Math.abs));
      expect(loudest, `${color}의 가장 큰 값 ${loudest.toFixed(3)}`).toBeLessThanOrEqual(1);
    });
  }

  it("루프 경계를 이어 붙일 여분을 남긴다", () => {
    /*
     * 원래는 「경계가 실제로 이어져 있는가」를 표본 차이로 재려 했다. 그런데
     * **교차 페이드를 지워도 통과했다** — 재 보니 핑크는 오히려 없을 때 경계
     * 차이가 더 작았고(0.05 vs 0.09), 흰 노이즈는 매 표본이 크게 튀어 경계가
     * 유난해 보이지 않았다.
     *
     * 이어 붙였는지는 **귀로 판단할 문제**다(한 바퀴마다 「틱」이 들리는가).
     * 여기서는 확인할 수 있는 것만 확인한다: 여분 구간이 존재하고, 버퍼보다
     * 짧아 앞머리를 통째로 덮지 않는가.
     *
     * 확인할 수 없는 것을 확인한다고 적어 두면 그 자체가 거짓말이 된다.
     */
    const source = readCode("src/game/systems/audio/noise.ts");
    const fade = Number(/const LOOP_CROSSFADE_SECONDS = ([\d.]+)/.exec(source)?.[1]);
    const seconds = Number(/const NOISE_SECONDS = ([\d.]+)/.exec(source)?.[1]);

    expect(fade, `교차 페이드 ${fade}초`).toBeGreaterThan(0);
    expect(fade, `교차 페이드 ${fade}초, 버퍼 ${seconds}초`).toBeLessThan(seconds / 4);
  });
});
