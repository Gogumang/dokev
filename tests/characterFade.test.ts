import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CAMERA, CHARACTER_FADE, PLAYER_HEIGHT } from "@/game/config/tuning";
import { characterAlpha } from "@/game/scene/cameraRig";

/*
 * 카메라가 가까울 때 캐릭터를 지우는 것.
 *
 * **달려 보고서야 나온 문제다.** 벽에서 밀려난 카메라는 플레이어 쪽으로
 * 당겨져 화면이 뒤통수로 가득 찬다 — 벽 안보다는 낫지만 앞이 안 보이는 것은
 * 마찬가지다.
 *
 * 카메라를 억지로 물리려다 한 번 실패했다(위로 올렸더니 벽면을 정면으로
 * 보게 됐다). **위치를 옮기는 대신 가리는 것을 지운다.**
 */

/** 씬이 쓰는 것과 **같은 함수**다 — 식을 여기 다시 적으면 갈라진다 */
const alphaAt = (distance: number) => characterAlpha(distance, CHARACTER_FADE);

describe("가까우면 캐릭터가 사라진다", () => {
  it("평소 거리에서는 멀쩡히 보인다", () => {
    // 여기서 흐려지면 늘 반투명한 캐릭터를 보게 된다
    expect(alphaAt(CAMERA.distanceBase), `기본 거리 ${CAMERA.distanceBase}m`).toBe(1);
    expect(alphaAt(CAMERA.distanceMax)).toBe(1);
  });

  it("머리 안까지 들어오면 완전히 사라진다", () => {
    expect(alphaAt(CHARACTER_FADE.end)).toBe(0);
    expect(alphaAt(0)).toBe(0);
  });

  it("사이에서는 서서히 사라진다 — 툭 꺼지지 않는다", () => {
    /*
     * 한 지점에서 켜고 끄면 벽을 스칠 때마다 캐릭터가 깜빡인다. 구간이
     * 있어야 부드럽다.
     */
    const middle = (CHARACTER_FADE.start + CHARACTER_FADE.end) / 2;
    const alpha = alphaAt(middle);
    expect(alpha, `중간 ${alpha.toFixed(2)}`).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThan(0.8);
    expect(CHARACTER_FADE.start - CHARACTER_FADE.end, "구간이 너무 짧다").toBeGreaterThan(0.5);
  });

  it("사라지는 거리가 캐릭터 키보다 작다", () => {
    /*
     * 키보다 먼 데서 사라지면 멀쩡히 서 있는데도 몸이 없어진다. 카메라가
     * 사실상 몸 안에 들어왔을 때만 지워야 한다.
     */
    expect(CHARACTER_FADE.end, `사라지는 거리 ${CHARACTER_FADE.end}m / 키 ${PLAYER_HEIGHT}m`).toBeLessThan(
      PLAYER_HEIGHT,
    );
  });

  it("씬이 실제로 값을 먹인다", () => {
    /*
     * 값만 계산하고 넘기지 않으면 검사는 통과하는데 화면은 그대로다 — 이
     * 저장소에서 가장 흔했던 결함 모양이다.
     */
    const rig = readFileSync("src/game/scene/PlayerRig.tsx", "utf8");
    expect(rig, "페이드를 계산하지 않는다").toContain("CHARACTER_FADE");
    expect(rig, "캐릭터에 넘기지 않는다").toMatch(/fade=\{characterFade\}/);

    const model = readFileSync("src/game/player/CharacterModel.tsx", "utf8");
    expect(model, "받은 값을 재질에 먹이지 않는다").toContain("applyAlpha(");
    expect(model, "외곽선이 함께 사라지지 않는다").toContain("outlineAlpha");
  });

  it("실제로 그려진 자리로 잰다 — 원하는 자리가 아니다", () => {
    /*
     * 카메라는 원하는 자리로 **부드럽게 따라온다**. 원하는 자리로 재면 따라오는
     * 동안 값이 어긋나 캐릭터가 깜빡인다.
     */
    const rig = readFileSync("src/game/scene/PlayerRig.tsx", "utf8");
    expect(rig).toMatch(/cameraPosition\.current\.distanceTo\(scratch\.playerHead\)/);
    expect(rig, "씬이 자기 식을 따로 쓴다").toContain("characterAlpha(");
  });
});
