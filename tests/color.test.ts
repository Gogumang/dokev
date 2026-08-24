import { describe, expect, it } from "vitest";

import { mixHex } from "@/game/core/color";

describe("mixHex", () => {
  it("양 끝에서는 원래 색을 그대로 준다", () => {
    expect(mixHex("#102030", "#a0b0c0", 0)).toBe("#102030");
    expect(mixHex("#102030", "#a0b0c0", 1)).toBe("#a0b0c0");
  });

  it("가운데는 두 색의 중간이다", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("범위를 벗어난 t는 잘라 낸다", () => {
    // 넘치면 채널이 255를 넘어 색이 뒤집힌다
    expect(mixHex("#000000", "#ffffff", 5)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
  });

  it("항상 6자리 hex를 돌려준다", () => {
    // 짧으면 three가 색을 잘못 읽는다
    const mixed = mixHex("#010203", "#040506", 0.5);
    expect(mixed, `mixed was: ${mixed}`).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("파싱에 실패하면 첫 색으로 물러선다", () => {
    // 색 하나 때문에 화면이 사라지는 것보다 낫다
    expect(mixHex("#123456", "not-a-color", 0.5)).toBe("#123456");
    expect(mixHex("rgb(0,0,0)", "#123456", 0.5)).toBe("rgb(0,0,0)");
  });

  it("대문자 hex도 읽는다", () => {
    expect(mixHex("#FFFFFF", "#000000", 0)).toBe("#ffffff");
  });
});
