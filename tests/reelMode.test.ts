import { describe, expect, it } from "vitest";

import { createInputState } from "@/game/systems/input";
import { recordReelFrame, type AutopilotFrame } from "@/game/demo/autopilot";
import { parseReel, REEL_STEP_SECONDS, REEL_TOTAL_SECONDS } from "@/game/demo/reelMode";
import { DEMO_SECONDS } from "@/game/systems/demoRoute";

/*
 * 촬영 모드.
 *
 * 프레임을 실시간으로 그리지 않고 바깥이 한 장씩 넘겨 받는다 — 한 장에
 * 10초가 걸려도 결과물은 완벽한 60fps다.
 */

describe("촬영 모드는 개발 빌드에서만 켜진다", () => {
  it("`?reel`이 있으면 켠다", () => {
    expect(parseReel("?reel=1", true)).toBe(true);
    expect(parseReel("?see=demo&reel=1", true)).toBe(true);
  });

  it("없으면 꺼진다", () => {
    expect(parseReel("", true)).toBe(false);
    expect(parseReel("?see=demo", true)).toBe(false);
  });

  /*
   * 배포된 게임에서 주소만으로 시계를 뺏을 수 있으면 그건 촬영 도구가 아니라
   * 결함이다 — `?see=`가 지키는 것과 같은 선이다.
   */
  it("배포 빌드에서는 주소가 있어도 안 켜진다", () => {
    expect(parseReel("?reel=1", false)).toBe(false);
  });

  it("망가진 주소에도 게임이 뜬다", () => {
    /* 여기서 예외를 던지면 확인 도구 때문에 본편이 안 뜬다 */
    expect(() => parseReel("?%", true)).not.toThrow();
  });
});

describe("한 프레임의 길이", () => {
  it("60fps다 — ffmpeg에 넘길 값과 같아야 한다", () => {
    expect(1 / REEL_STEP_SECONDS).toBeCloseTo(60, 9);
  });

  it("코스가 끝날 때까지 돈다 — 마무리 연출이 잘리면 안 된다", () => {
    expect(REEL_TOTAL_SECONDS).toBeGreaterThan(DEMO_SECONDS);
  });
});

describe("지시를 입력에 적는다", () => {
  const base: AutopilotFrame = {
    moveX: 0.5,
    moveZ: -0.5,
    run: true,
    jumpHeld: false,
    presses: [],
  };

  it("스틱과 달리기가 그대로 간다", () => {
    const input = createInputState();
    recordReelFrame(input, base);
    expect([input.moveX, input.moveZ, input.run]).toEqual([0.5, -0.5, true]);
  });

  /*
   * **이 검사가 이 파일의 요점이다.**
   *
   * 대본이 시키는 것과 `InputState`의 칸을 잇는 자리는 여기 하나뿐이다.
   * 하나를 안 이으면 화면에서는 **그 동작만 조용히 빠진 영상**이 나오고,
   * 90초를 다 뽑고 나서야 알아챈다.
   */
  it("누르는 것마다 실제로 칸이 채워진다", () => {
    const wired: [
      AutopilotFrame["presses"][number],
      (i: ReturnType<typeof createInputState>) => unknown,
    ][] = [
      ["vehicle", (i) => i.vehicleQueued],
      ["attack", (i) => i.attackQueued],
      ["jump", (i) => i.jumpQueued],
      ["dance", (i) => i.danceQueued],
      ["grapple", (i) => i.grappleQueued],
      ["bow", (i) => i.weaponSlotQueued],
      ["beam", (i) => i.weaponSlotQueued],
    ];

    for (const [act, read] of wired) {
      const before = createInputState();
      const after = createInputState();
      recordReelFrame(after, { ...base, presses: [act] });
      expect(read(after), `${act}를 눌렀는데 입력이 그대로다`).not.toEqual(read(before));
    }
    expect(wired.length, "이을 것이 하나도 없다").toBeGreaterThan(5);
  });

  it("활과 광선총이 서로 다른 칸을 고른다", () => {
    const bow = createInputState();
    const beam = createInputState();
    recordReelFrame(bow, { ...base, presses: ["bow"] });
    recordReelFrame(beam, { ...base, presses: ["beam"] });
    expect(bow.weaponSlotQueued).not.toBe(beam.weaponSlotQueued);
  });

  it("안 누른 것은 안 채운다 — 매 프레임 전부 눌리면 대본이 뜻이 없다", () => {
    const input = createInputState();
    recordReelFrame(input, base);
    expect([input.attackQueued, input.danceQueued, input.vehicleQueued]).toEqual([
      false,
      false,
      false,
    ]);
  });
});
