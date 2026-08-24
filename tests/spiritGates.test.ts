import { describe, expect, it } from "vitest";

import { BASE_LIGHT_RANGE, DOKEBI, DOKEBI_ORDER } from "@/game/dokebi/roster";
import { resolveHorizontalCollisions } from "@/game/player/locomotion";
import { buildCityLayout } from "@/game/world/cityLayout";
import {
  GATE_HEIGHT,
  GATE_REACH,
  gateCollider,
  isGateOpen,
  nearestGate,
  SPIRIT_GATES,
} from "@/game/world/spiritGates";

/*
 * 빛으로 여는 문.
 *
 * 이 기능이 실패하는 방식은 둘이다: **아무 때나 열려서** 퍼즐이 아니게 되거나,
 * **아무 도깨비로도 못 열어서** 지나갈 수 없는 벽이 되거나. 둘 다 화면을 보고
 * 알기 어려우므로 여기서 잰다.
 */
describe("문 정의", () => {
  it("문마다 필요한 빛이 다르다", () => {
    // 같으면 도깨비를 바꿀 이유가 없다 — 그러면 퍼즐이 아니라 버튼이다
    const required = SPIRIT_GATES.map((gate) => gate.requiredLightRange);
    expect(new Set(required).size, `요구 빛 ${required.join(", ")}`).toBe(required.length);
  });

  it("id가 겹치지 않는다", () => {
    const ids = SPIRIT_GATES.map((gate) => gate.id);
    expect(new Set(ids).size, `ids=${ids.join(", ")}`).toBe(ids.length);
  });

  it("문마다 이름과 대사가 있다", () => {
    // 막혀 있는데 아무 말도 없으면 그냥 벽으로 보인다
    for (const gate of SPIRIT_GATES) {
      expect(gate.name.length, `${gate.id} 이름`).toBeGreaterThan(0);
      expect(gate.line.length, `${gate.id} 대사`).toBeGreaterThan(0);
    }
  });

  it("문이 도로 위에 있다 — 건물 안이면 닿을 수 없다", () => {
    /*
     * 도깨비 자리를 교차로로 잡은 것과 같은 이유다. 건물에 박힌 문은 열든
     * 말든 아무 일도 일어나지 않고, 그것을 화면에서 알아채기는 어렵다.
     */
    const layout = buildCityLayout();
    for (const gate of SPIRIT_GATES) {
      const inside = layout.colliders.some(
        (box) =>
          gate.x >= box.minX && gate.x <= box.maxX && gate.z >= box.minZ && gate.z <= box.maxZ,
      );
      expect(inside, `${gate.id}가 건물 안에 있다 (${gate.x}, ${gate.z})`).toBe(false);
    }
  });
});

describe("여는 조건", () => {
  const gate = SPIRIT_GATES[0];

  it("빛이 모자라면 앞에 서 있어도 안 열린다", () => {
    const open = isGateOpen(gate, gate.x, gate.z, gate.requiredLightRange - 0.1);
    expect(open, "빛이 모자란데 열렸다").toBe(false);
  });

  it("빛이 충분하고 앞에 서면 열린다", () => {
    const open = isGateOpen(gate, gate.x, gate.z, gate.requiredLightRange);
    expect(open, "조건을 다 채웠는데 안 열린다").toBe(true);
  });

  it("멀리서 능력을 켜도 열리지 않는다", () => {
    /*
     * 도시 반대편에서 열리면 **열린 것을 볼 수 없다.** 인과가 화면에 없으면
     * 플레이어는 자기가 무엇을 했는지 알 수 없다.
     */
    const far = isGateOpen(gate, gate.x + GATE_REACH + 1, gate.z, 999);
    expect(far, "먼 데서 열렸다").toBe(false);
  });

  it("능력을 끄면 다시 닫힌다", () => {
    // 켜 두면 열리고 끄면 닫힌다. 한 번 열고 끝이면 동료를 바꿀 이유가 없다
    expect(isGateOpen(gate, gate.x, gate.z, 0), "능력이 꺼졌는데 열려 있다").toBe(false);
  });
});

describe("도깨비와 문", () => {
  /**
   * 능력을 켰을 때 그 도깨비의 빛이 닿는 거리.
   *
   * 씬이 쓰는 식과 **같은 정본**을 읽는다. 여기에 9를 손으로 적으면 기본값이
   * 바뀌는 순간 이 검사가 조용히 거짓말을 한다.
   */
  function reachOf(id: (typeof DOKEBI_ORDER)[number]): number {
    return BASE_LIGHT_RANGE * DOKEBI[id].effect.lightRangeScale;
  }

  it("혼자 다니는 도깨비로도 첫 문은 열린다", () => {
    /*
     * 처음부터 함께 있는 동료(초롱)로 하나도 못 열면 이 기능을 만나 볼
     * 방법이 없다 — 배우는 자리가 필요하다.
     */
    const first = SPIRIT_GATES[0];
    expect(
      reachOf("chorong"),
      `초롱 빛 ${reachOf("chorong").toFixed(1)}m < 첫 문 ${first.requiredLightRange}m`,
    ).toBeGreaterThanOrEqual(first.requiredLightRange);
  });

  it("모든 문이 적어도 한 도깨비로는 열린다", () => {
    // 아무도 못 여는 문은 퍼즐이 아니라 그냥 벽이다
    const best = Math.max(...DOKEBI_ORDER.map((id) => reachOf(id)));
    for (const gate of SPIRIT_GATES) {
      expect(
        best,
        `${gate.id}: 가장 밝은 빛 ${best.toFixed(1)}m < 필요 ${gate.requiredLightRange}m`,
      ).toBeGreaterThanOrEqual(gate.requiredLightRange);
    }
  });

  it("첫 동료로 다 열리지는 않는다", () => {
    /*
     * 하나로 전부 열리면 도깨비를 모을 이유가 다시 사라진다. 적어도 하나는
     * **다른 동료를 데려와야** 하는 문이어야 한다.
     */
    const locked = SPIRIT_GATES.filter((gate) => reachOf("chorong") < gate.requiredLightRange);
    expect(locked.length, "초롱 혼자 전부 열린다").toBeGreaterThan(0);
  });
});

describe("문이 실제로 길을 막는가", () => {
  const gate = SPIRIT_GATES[0];

  it("닫힌 문은 걸어서 통과할 수 없다", () => {
    /*
     * 판정 상자를 만들어 두고 아무도 쓰지 않으면 문이 **그림**이 된다.
     * 실제 충돌 해소 함수에 넣어 밀려나는지 본다.
     */
    const box = gateCollider(gate, false);
    const walked = resolveHorizontalCollisions({ x: gate.x, y: 0.9, z: gate.z }, 0.4, [box]);
    const moved = Math.hypot(walked.x - gate.x, walked.z - gate.z);
    expect(moved, `밀려난 거리 ${moved.toFixed(2)}m`).toBeGreaterThan(0);
  });

  it("열린 문은 그대로 지나간다", () => {
    const box = gateCollider(gate, true);
    const walked = resolveHorizontalCollisions({ x: gate.x, y: 0.9, z: gate.z }, 0.4, [box]);
    expect(walked.x, "열렸는데 밀려났다").toBeCloseTo(gate.x);
    expect(walked.z, "열렸는데 밀려났다").toBeCloseTo(gate.z);
  });

  it("옥상 높이보다 낮게 서 있어야 막힌다 — 문이 하늘까지 솟지 않는다", () => {
    // top이 0이면 어떤 높이에서도 통과한다. 넘어갈 수 없을 만큼은 높아야 한다
    expect(gateCollider(gate, false).top, "문 높이가 0이다").toBe(GATE_HEIGHT);
  });
});

describe("어느 문 앞인가", () => {
  it("가까이 가면 그 문을 알려 준다", () => {
    const gate = SPIRIT_GATES[1];
    expect(nearestGate(gate.x, gate.z)?.id, "앞에 섰는데 못 찾는다").toBe(gate.id);
  });

  it("아무 문도 없는 자리에서는 없음이다", () => {
    // 아무 데서나 안내가 뜨면 그 안내를 아무도 안 읽는다
    expect(nearestGate(9999, 9999), "빈 자리에서 문을 찾았다").toBeNull();
  });
});
