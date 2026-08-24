import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { consumeCues, createCombatCues, hasCues } from "@/game/systems/audio/combat";

describe("consumeCues", () => {
  it("차이만큼만 낸다", () => {
    const before = { hits: 3, defeats: 1, hurts: 0, slams: 0 };
    const now = { hits: 5, defeats: 1, hurts: 2, slams: 0 };
    expect(consumeCues(before, now)).toEqual({ hits: 2, defeats: 0, hurts: 2, slams: 0 });
  });

  it("변화가 없으면 아무것도 안 낸다", () => {
    const same = { hits: 7, defeats: 2, hurts: 1, slams: 1 };
    expect(hasCues(consumeCues(same, same))).toBe(false);
  });

  it("한 프레임에 나는 소리 수를 제한한다", () => {
    /*
     * 탭이 오래 멈춰 있다 돌아오면 그 사이 쌓인 사건이 한꺼번에 터진다.
     * 상한이 없으면 수십 개가 같은 시각에 겹쳐 굉음이 된다.
     */
    const fired = consumeCues(createCombatCues(), { hits: 40, defeats: 9, hurts: 8, slams: 5 });
    expect(fired.hits, `hits=${fired.hits}`).toBeLessThanOrEqual(3);
    expect(fired.defeats).toBeLessThanOrEqual(3);
    expect(fired.slams).toBeLessThanOrEqual(3);
  });

  it("수가 줄어도 음수가 되지 않는다", () => {
    // 진행을 지우면 누적 수가 0으로 돌아간다. 음수면 루프가 돌지 않는다.
    const fired = consumeCues({ hits: 10, defeats: 4, hurts: 3, slams: 2 }, createCombatCues());
    expect(fired).toEqual({ hits: 0, defeats: 0, hurts: 0, slams: 0 });
  });

  it("종류를 섞지 않는다", () => {
    // 때린 소리와 맞은 소리가 섞이면 귀로 구분할 수 없다
    const fired = consumeCues(createCombatCues(), { hits: 0, defeats: 0, hurts: 1, slams: 0 });
    expect(fired.hits).toBe(0);
    expect(fired.hurts).toBe(1);
  });
});

describe("hasCues", () => {
  it("하나라도 있으면 참", () => {
    expect(hasCues({ hits: 0, defeats: 0, hurts: 0, slams: 1 })).toBe(true);
  });

  it("전부 0이면 거짓", () => {
    expect(hasCues(createCombatCues())).toBe(false);
  });
});

describe("소리가 서로 구분되는가", () => {
  /*
   * 검사가 **세는 쪽**만 보고 있었다 — 몇 번 울릴지는 지키는데 **무슨 소리가
   * 나는지**는 아무도 안 봤다. 값이 겹치면 「내가 맞았다」와 「적을 때렸다」가
   * 같은 소리가 되고, 세기가 0이면 아예 안 들린다.
   *
   * 의도는 이미 소스 주석에 있다: 「내가 맞은 소리는 높고 짧다 — 적을 때린
   * 소리와 섞이면 안 된다」, 「보스의 내려침은 가장 낮고 길다」. 그 문장을
   * 검사로 옮긴다.
   *
   * 소리는 이 저장소에서 **아무도 들어 본 적이 없는** 감각이다. 값으로 지킬
   * 수 있는 것만 지키고, 실제로 구분되는지는 사람이 들어야 한다.
   */
  const source = readCode("src/game/systems/audio/combat.ts");

  /** `play` 안의 네 신호를 순서대로 뽑는다 */
  const cues = [...source.matchAll(/frequency: (\d+),\s*duration: ([\d.]+),\s*peak: ([\d.]+),/g)].map(
    (match) => ({
      frequency: Number(match[1]),
      duration: Number(match[2]),
      peak: Number(match[3]),
    }),
  );

  it("네 신호를 실제로 읽었다", () => {
    // 형태가 바뀌면 빈 목록을 훑으며 통과한다
    expect(cues.length, `찾은 신호 ${cues.length}개`).toBe(4);
  });

  it("모두 들리는 세기다", () => {
    // 세기가 0이면 만들어 두고 아무도 못 듣는 신호가 된다
    for (const [index, cue] of cues.entries()) {
      expect(cue.peak, `${index}번째 신호의 세기 ${cue.peak}`).toBeGreaterThan(0.1);
      expect(cue.duration, `${index}번째 신호의 길이 ${cue.duration}초`).toBeGreaterThan(0.05);
    }
  });

  it("높이가 서로 충분히 다르다", () => {
    /*
     * 가까운 두 소리는 같은 소리로 들린다. 음높이는 비율로 느끼므로 차이가
     * 아니라 **비**로 잰다 — 1.3배면 대략 단3도 위다.
     */
    const sorted = [...cues].map((cue) => cue.frequency).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const ratio = sorted[i] / sorted[i - 1];
      expect(ratio, `${sorted[i - 1]}Hz와 ${sorted[i]}Hz가 ${ratio.toFixed(2)}배`).toBeGreaterThan(
        1.3,
      );
    }
  });

  it("보스의 내려침이 가장 낮고 길다", () => {
    /*
     * 「거리와 무관하게 들려야 피할 수 있다」고 적어 둔 신호다. 다른 소리에
     * 묻히면 예고를 놓친다.
     */
    const lowest = Math.min(...cues.map((cue) => cue.frequency));
    const longest = Math.max(...cues.map((cue) => cue.duration));
    const slam = cues.find((cue) => cue.frequency === lowest);
    expect(slam, "가장 낮은 신호를 못 찾았다").toBeTruthy();
    expect(slam?.duration, `가장 낮은 신호의 길이 ${slam?.duration}초`).toBe(longest);
    expect(slam?.peak, "가장 낮은 신호가 가장 세지 않다").toBe(
      Math.max(...cues.map((cue) => cue.peak)),
    );
  });
});

describe("소리 끄기가 실제로 막는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 재생 판단에서 `enabled`를 빼도(즉 음소거가
   * 아예 안 먹어도) 검사가 전부 통과했다.
   *
   * 소리 버튼은 사용자와의 약속이다 — 도서관에서, 옆에 자는 사람이 있을 때,
   * 소리에 예민할 때 누르는 버튼이다. **안 먹으면 게임을 끄는 수밖에 없다.**
   *
   * 오디오는 노드에서 돌릴 수 없어(브라우저 API) 소스에서 지킨다. 판단이
   * **한 곳(`shouldPlay`)에 모여 있다는 것**과 그 판단이 세 조건을 모두
   * 본다는 것을 확인한다.
   */
  const source = readCode("src/game/systems/audio/index.ts");

  it("재생 판단이 한 곳에 모여 있다", () => {
    /*
     * 조건이 흩어지면 새 소리를 더할 때 하나를 빠뜨린다 — 그 소리만 음소거를
     * 무시하게 되고, 왜 한 종류만 나는지 알 수 없다.
     */
    expect(source, "재생 판단이 없다").toContain("const shouldPlay = ()");
    const calls = source.match(/shouldPlay\(\)/g) ?? [];
    expect(calls.length, `재생 판단을 ${calls.length}곳에서 쓴다`).toBeGreaterThan(1);
  });

  it("그 판단이 소리 설정을 본다", () => {
    const decision = source.slice(source.indexOf("const shouldPlay = ()"));
    const line = decision.slice(0, decision.indexOf(";"));
    expect(line, `판단: ${line}`).toContain("enabled");
  });

  it("그 판단이 탭이 보이는지도 본다", () => {
    // 안 보이는 탭에서 소리를 내면 사용자는 어디서 나는지 못 찾는다
    const decision = source.slice(source.indexOf("const shouldPlay = ()"));
    const line = decision.slice(0, decision.indexOf(";"));
    expect(line, `판단: ${line}`).toContain("visible");
  });

  it("끄면 이미 나던 소리도 멈춘다", () => {
    // 새 소리만 막고 울리던 것을 두면 「껐는데 계속 난다」가 된다
    expect(source, "설정을 바꿔도 나던 소리를 멈추지 않는다").toMatch(
      /setEnabled\([\s\S]{0,400}(stop|gain|suspend)/,
    );
  });
});
