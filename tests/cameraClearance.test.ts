import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CAMERA_COLLIDER_RADIUS, PLAYER_RADIUS } from "@/game/config/tuning";
import { resolveHorizontalCollisions } from "@/game/player/locomotion";
import { buildCityLayout } from "@/game/world/cityLayout";

/*
 * 카메라가 벽 안으로 들어가는 문제.
 *
 * **달려 보고서야 찾았다.** 스물일곱 번의 반복에서 화면을 본 것은 전부
 * 「세워 놓고 찍은 것」이었는데, 실제로 달려 옛 마을 집에 붙었더니 **화면이
 * 통째로 벽 내부**가 됐다. 서 있을 때는 한 번도 안 나오던 그림이다.
 *
 * 원인은 카메라 충돌이 없어서가 아니라 **최소 거리(1.4m)가 바닥**이어서였다 —
 * 벽에 바짝 붙으면 그 1.4m 지점이 벽 안이다.
 */

const layout = buildCityLayout();

describe("카메라가 벽 안에 남지 않는다", () => {
  /** 그 점이 어느 충돌체 안인가 (해소기와 같은 판정) */
  function insideBox(x: number, y: number, z: number, radius: number) {
    return layout.colliders.find((box) => {
      if (y >= box.top) return false;
      const dx = Math.max(box.minX - x, 0, x - box.maxX);
      const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
      return Math.hypot(dx, dz) < radius - 1e-6;
    });
  }

  it("건물 한복판에 둔 카메라가 밖으로 밀려난다", () => {
    /*
     * 건물마다 그 중심에 카메라를 두고 밀어낸다. 하나라도 안에 남으면
     * 그 자리에서 화면이 벽으로 막힌다.
     */
    let checked = 0;
    for (const building of layout.buildings.slice(0, 40)) {
      const box = layout.colliders.find(
        (item) =>
          Math.abs((item.minX + item.maxX) / 2 - building.x) < 0.001 &&
          Math.abs((item.minZ + item.maxZ) / 2 - building.z) < 0.001,
      );
      if (!box) continue;

      const inside = { x: building.x, y: box.top - 1, z: building.z };
      const cleared = resolveHorizontalCollisions(inside, CAMERA_COLLIDER_RADIUS, layout.colliders);
      expect(
        insideBox(cleared.x, inside.y, cleared.z, CAMERA_COLLIDER_RADIUS),
        `건물 (${building.x.toFixed(1)}, ${building.z.toFixed(1)}) 안에 카메라가 남았다`,
      ).toBeUndefined();
      checked += 1;
    }
    expect(checked, "건물 충돌체를 하나도 못 찾았다").toBeGreaterThan(20);
  });

  it("옥상 위 카메라는 밀려나지 않는다", () => {
    /*
     * 건물보다 높으면 벽이 아니라 하늘이다. 거기서도 밀어내면 옥상을 내려다볼
     * 때마다 카메라가 옆으로 튄다.
     */
    for (const building of layout.buildings.slice(0, 20)) {
      const box = layout.colliders.find(
        (item) =>
          Math.abs((item.minX + item.maxX) / 2 - building.x) < 0.001 &&
          Math.abs((item.minZ + item.maxZ) / 2 - building.z) < 0.001,
      );
      if (!box) continue;

      /*
       * **그 자리의 모든 충돌체보다** 위여야 한다. 건물 하나의 옥상만 보고
       * 잡았더니 옥탑(setback)이 더 높아 여전히 안이었고, 검사가 「밀리면
       * 안 된다」로 잘못 걸렸다.
       */
      const ceiling = Math.max(
        ...layout.colliders
          /*
           * 반지름 안에 드는 것까지 본다. 점을 품는 상자만 셌더니 **바로 옆에
           * 붙은 더 높은 건물**이 남아 0.06m 밀렸다 — 해소기는 닿기만 해도
           * 밀어내므로, 「위에 아무것도 없다」는 그 판정과 같은 기준으로 잡아야 한다.
           */
          .filter((item) => {
            const dx = Math.max(item.minX - building.x, 0, building.x - item.maxX);
            const dz = Math.max(item.minZ - building.z, 0, building.z - item.maxZ);
            return Math.hypot(dx, dz) < CAMERA_COLLIDER_RADIUS;
          })
          .map((item) => item.top),
      );
      const above = { x: building.x, y: ceiling + 2, z: building.z };
      const cleared = resolveHorizontalCollisions(above, CAMERA_COLLIDER_RADIUS, layout.colliders);
      expect(cleared.x, `옥상 위에서 x가 밀렸다`).toBeCloseTo(above.x, 6);
      expect(cleared.z, `옥상 위에서 z가 밀렸다`).toBeCloseTo(above.z, 6);
    }
  });

  it("카메라 반지름이 플레이어보다 작다", () => {
    /*
     * 카메라는 몸이 아니라 점이다. 플레이어와 같게 잡으면 좁은 골목에서
     * 필요 이상으로 튕겨 나가 구도가 흔들린다.
     */
    expect(
      CAMERA_COLLIDER_RADIUS,
      `카메라 ${CAMERA_COLLIDER_RADIUS} / 플레이어 ${PLAYER_RADIUS}`,
    ).toBeLessThan(PLAYER_RADIUS);
    expect(CAMERA_COLLIDER_RADIUS, "0이면 아무것도 밀어내지 않는다").toBeGreaterThan(0);
  });

  it("PlayerRig가 플레이어와 같은 함수로 카메라를 밀어낸다", () => {
    /*
     * 카메라만 따로 밀어내는 식을 새로 쓰면 두 판정이 갈라지고, 그러면
     * 플레이어는 못 들어가는 자리에 **카메라만 들어가는 자리**가 생긴다.
     * 배선을 확인한다 — 함수만 있고 걸지 않으면 화면은 그대로다.
     */
    /*
     * 둘 다 프레임 루프에서 떼어 냈다 — 순서가 곧 정확성인 단계들이라
     * 늘어놓으면 그 순서가 코드로 드러나지 않았다. 플레이어는 `groundStep`
     * (이동 → 밀어내기 → 발밑 정착), 카메라는 `cameraFrame`(당기기 →
     * 지면 여유 → 밀어내기 → 클로즈업 섞기).
     *
     * **같은 함수를 쓰는지**가 이 검사의 요점이다. 카메라만 따로 밀어내는
     * 식을 새로 쓰면 두 판정이 갈라지고, 그러면 플레이어는 못 들어가는
     * 자리에 카메라만 들어가는 자리가 생긴다.
     */
    const frame = readFileSync("src/game/scene/cameraFrame.ts", "utf8");
    const step = readFileSync("src/game/player/groundStep.ts", "utf8");
    expect(frame, "카메라를 밀어내지 않는다").toContain("CAMERA_COLLIDER_RADIUS");

    const frameUses = (frame.match(/resolveHorizontalCollisions\(/g) ?? []).length;
    const stepUses = (step.match(/resolveHorizontalCollisions\(/g) ?? []).length;
    expect(frameUses, `카메라 밀어내기 ${frameUses}회 — 1회여야 한다`).toBe(1);
    expect(stepUses, `플레이어 밀어내기 ${stepUses}회 — 1회여야 한다`).toBe(1);
  });
});
