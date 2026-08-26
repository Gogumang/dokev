import { describe, expect, it } from "vitest";

import {
  autopilotFrame,
  DEMO_ACTS,
  GLIDE_WINDOW,
  pressesBetween,
  steerToward,
  targetAt,
  type ReelAct,
} from "@/game/demo/autopilot";
import { LOCOMOTION } from "@/game/config/tuning";
import { buildDemoRoute, DEMO_SECONDS } from "@/game/systems/demoRoute";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 자동 조종.
 *
 * 사람이 90초를 똑같이 두 번 조작할 수 없어서 넣었다 — 영상을 다시 뽑을
 * 때마다 다른 판이 나오면 음악에 맞춰 편집할 수 없고, 게임을 고친 뒤 같은
 * 영상을 다시 뽑는 일도 못 한다.
 *
 * 코스는 `demoRoute`가 정본이다. 여기서 재는 것은 **그 자리로 실제로 가는가**와
 * **대본에 적힌 키를 실제로 누르는가** 둘이다.
 */

const layout = buildCityLayout();
const beats = buildDemoRoute(layout);

/** `locomotion`이 입력을 월드로 바꾸는 식 그대로 — 되풀기가 맞는지 이걸로 잰다 */
function toWorld(moveX: number, moveZ: number, yaw: number) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: moveX * cos - moveZ * sin, z: -(moveX * sin + moveZ * cos) };
}

describe("월드 방향을 카메라 기준 입력으로 되푼다", () => {
  /*
   * 이 되풀기가 틀리면 캐릭터가 **엉뚱한 쪽으로 달린다.** 부호 하나만 틀려도
   * W가 카메라 쪽으로 다가오는데(저장소가 실제로 겪은 버그다), 화면을 봐야만
   * 알 수 있다. 그래서 여러 시점에서 왕복시켜 본다.
   */
  it("어느 시점에서 밀어도 목표 쪽으로 간다", () => {
    const targets = [
      { x: 10, z: 0 },
      { x: 0, z: 10 },
      { x: -7, z: -7 },
      { x: 30, z: -12 },
    ];
    let checked = 0;

    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.2, 5.9]) {
      for (const to of targets) {
        const { moveX, moveZ } = steerToward({ x: 0, z: 0 }, to, yaw);
        const world = toWorld(moveX, moveZ, yaw);
        const want = Math.atan2(to.x, to.z);
        const got = Math.atan2(world.x, world.z);
        let off = want - got;
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        expect(
          Math.abs(off),
          `yaw ${yaw.toFixed(2)}에서 (${to.x}, ${to.z})로 가려는데 ${(got * 57.3).toFixed(1)}°로 갔다`,
        ).toBeLessThan(1e-9);
        checked += 1;
      }
    }
    expect(checked, "이 검사가 실제로 방향을 훑었다").toBe(24);
  });

  it("미는 세기가 1이다 — 약하게 밀면 제시간에 못 간다", () => {
    const { moveX, moveZ } = steerToward({ x: 0, z: 0 }, { x: 12, z: -5 }, 1.3);
    expect(Math.hypot(moveX, moveZ)).toBeCloseTo(1, 9);
  });

  it("다 왔으면 밀지 않는다 — 목표 위에서 좌우로 떨린다", () => {
    expect(steerToward({ x: 0, z: 0 }, { x: 0.4, z: 0.2 }, 0)).toEqual({ moveX: 0, moveZ: 0 });
  });
});

describe("코스를 따라간다", () => {
  it("현재가 아니라 **다음** 자리를 향한다", () => {
    /* 현재 구간 자리로 가면 이미 지나온 곳을 향한다 */
    expect(targetAt(beats, beats[0].at + 1)).toEqual({ x: beats[1].x, z: beats[1].z });
  });

  it("구간이 바뀌는 **그 순간**에 바로 다음을 향한다", () => {
    /*
     * 경계에서 한 프레임이라도 방금 도착한 자리를 향하면, 그 프레임에 스틱이
     * 뒤로 꺾인다 — 구간마다 캐릭터가 한 번씩 움찔한다.
     */
    expect(targetAt(beats, beats[1].at), `${beats[1].at}초 정각`).toEqual({
      x: beats[2].x,
      z: beats[2].z,
    });
  });

  it("마지막 구간에서는 제자리다 — 갈 곳이 없다", () => {
    const last = beats[beats.length - 1];
    expect(targetAt(beats, DEMO_SECONDS + 5)).toEqual({ x: last.x, z: last.z });
  });

  it("늘 달린다 — 코스가 최고 속도의 80%로 잡혀 있다", () => {
    const frame = autopilotFrame(beats, 0, 1 / 60, { x: 0, z: 0 }, 0);
    expect(frame.run).toBe(true);
    expect(LOCOMOTION.run.maxSpeed, "달리기가 걷기보다 안 빠르다").toBeGreaterThan(
      LOCOMOTION.walk.maxSpeed,
    );
  });
});

describe("대본이 시키는 것을 실제로 누른다", () => {
  it("한 동작은 **한 번만** 눌린다", () => {
    /*
     * 「지금 시각이 `at`보다 크다」로 판단하면 그 뒤로 매 프레임 다시 눌린다 —
     * 한 번 타야 할 자전거를 초당 60번 타고 내린다.
     */
    const act = DEMO_ACTS[0];
    const step = 1 / 60;
    let pressed = 0;
    for (let t = act.at - 1; t < act.at + 1; t += step) {
      pressed += pressesBetween(DEMO_ACTS, t, t + step).length > 0 ? 1 : 0;
    }
    expect(pressed, `${act.at}초의 ${act.act}가 ${pressed}번 눌렸다`).toBe(1);
  });

  it("90초를 다 돌리면 대본의 동작이 하나도 안 빠진다", () => {
    const step = 1 / 60;
    const seen: ReelAct[] = [];
    for (let t = 0; t < DEMO_SECONDS + 5; t += step) {
      seen.push(...pressesBetween(DEMO_ACTS, t, t + step));
    }
    expect(seen.length, `${seen.length}번 눌렀다`).toBe(DEMO_ACTS.length);
  });

  it("활강 구간에서만 점프를 잡고 있는다", () => {
    const mid = (GLIDE_WINDOW.from + GLIDE_WINDOW.to) / 2;
    const held = (t: number) => autopilotFrame(beats, t - 1 / 60, t, { x: 0, z: 0 }, 0).jumpHeld;
    expect(held(mid), "활강 중인데 안 잡고 있다").toBe(true);
    expect(held(GLIDE_WINDOW.from - 1), "구간 전인데 잡고 있다").toBe(false);
    expect(held(GLIDE_WINDOW.to + 1), "구간 후인데 잡고 있다").toBe(false);
  });

  /*
   * **이 검사가 이 파일의 요점이다.**
   *
   * `DemoBeat.keys`는 사람이 읽는 글이고 `DEMO_ACTS`는 기계가 읽는 목록이다.
   * 둘이 갈라지면 대본에는 「B를 눌러 자전거를 탄다」고 적혀 있는데 영상에서는
   * 걸어가고 있게 된다 — 영상을 다 뽑고 나서야 알아챈다.
   */
  it("키가 적힌 구간에는 동작이 있고, 그 반대도 맞다", () => {
    const withKeys = beats.filter((beat) => beat.keys);
    expect(withKeys.length, "키가 적힌 구간이 하나도 없다").toBeGreaterThan(4);

    /*
     * 이동 키는 동작이 아니다 — 스틱을 미는 일이라 매 프레임 `steerToward`가
     * 하고 있다. 「WASD + Shift」만 적힌 구간에 동작이 없는 것은 어긋남이 아니다.
     */
    const MOVE_KEYS = /\b(?:WASD|Shift)\b|[+\s]/g;
    const movesOnly = (keys: string) => keys.replace(MOVE_KEYS, "") === "";

    const mismatched: string[] = [];
    for (let i = 0; i < beats.length; i += 1) {
      const beat = beats[i];
      const until = beats[i + 1]?.at ?? DEMO_SECONDS + 10;
      const acts = DEMO_ACTS.filter((one) => one.at >= beat.at && one.at < until);
      /* 활강은 잡고 있는 것이라 `DEMO_ACTS`에 없다 — 그 구간만 따로 본다 */
      const glides = GLIDE_WINDOW.from < until && GLIDE_WINDOW.to > beat.at;

      if (beat.keys && !movesOnly(beat.keys) && acts.length === 0 && !glides) {
        mismatched.push(`${beat.at}초 「${beat.title}」 — 키(${beat.keys})는 있는데 동작이 없다`);
      }
      if (!beat.keys && acts.length > 0) {
        mismatched.push(`${beat.at}초 「${beat.title}」 — 동작은 있는데 키가 안 적혀 있다`);
      }
    }
    expect(mismatched, `대본과 조종이 갈라졌다:\n${mismatched.join("\n")}`).toEqual([]);
  });

  it("동작이 코스 안에서 일어난다 — 영상이 끝난 뒤에 누르지 않는다", () => {
    for (const one of DEMO_ACTS) {
      expect(one.at, `${one.act}가 ${one.at}초 — 코스 밖이다`).toBeLessThanOrEqual(
        DEMO_SECONDS + 10,
      );
      expect(one.at).toBeGreaterThanOrEqual(0);
    }
  });
});
