import { readCode } from "./support/source";

import { describe, expect, it } from "vitest";

import { buildCityDetails } from "@/game/world/cityDetails";
import { buildCityLayout } from "@/game/world/cityLayout";

import { LOCOMOTION } from "@/game/config/tuning";
import {
  createVendingState,
  drink,
  machineInReach,
  speedScale,
  stepVending,
  VENDING,
  type Machine,
} from "@/game/systems/vending";

const MACHINES: Machine[] = [
  { x: 0, z: 0 },
  { x: 30, z: 0 },
];

describe("machineInReach", () => {
  it("가까이 가면 잡힌다", () => {
    expect(machineInReach(MACHINES, 1, 1, createVendingState())).toBe(0);
  });

  it("멀면 잡히지 않는다", () => {
    expect(machineInReach(MACHINES, 10, 10, createVendingState())).toBe(-1);
  });

  it("둘 중 가까운 쪽을 고른다", () => {
    // 나란히 서 있어도 어느 것을 뽑는지 모호하면 안 된다
    expect(machineInReach(MACHINES, 29, 0, createVendingState())).toBe(1);
  });

  it("대기 중인 자판기는 없는 것처럼 다룬다", () => {
    // 안내가 떴는데 안 되면 고장으로 보인다
    const used = drink(createVendingState(), 0);
    expect(machineInReach(MACHINES, 0, 0, used)).toBe(-1);
  });
});

describe("drink", () => {
  it("뽑으면 효과가 붙는다", () => {
    const state = drink(createVendingState(), 0);
    expect(state.boostRemaining).toBe(VENDING.boostSeconds);
    expect(state.drinks).toBe(1);
  });

  it("손이 닿지 않으면 아무 일도 없다", () => {
    const fresh = createVendingState();
    expect(drink(fresh, -1)).toBe(fresh);
  });

  it("효과가 쌓이지 않는다", () => {
    /*
     * 더하면 자판기를 여러 대 돌며 도시 절반을 부스트로 가로지르게 된다.
     * 덮어쓰기여야 한다.
     */
    let state = drink(createVendingState(), 0);
    state = stepVending(state, 2);
    state = drink(state, 1);
    expect(state.boostRemaining, `remaining=${state.boostRemaining}`).toBe(VENDING.boostSeconds);
  });

  it("같은 자판기를 연타할 수 없다", () => {
    const state = drink(createVendingState(), 0);
    expect(state.cooldowns.get(0)).toBe(VENDING.cooldownSeconds);
  });

  it("원본을 바꾸지 않는다", () => {
    const fresh = createVendingState();
    drink(fresh, 0);
    expect(fresh.drinks).toBe(0);
    expect(fresh.cooldowns.size).toBe(0);
  });
});

describe("stepVending", () => {
  it("시간이 지나면 효과가 끝난다", () => {
    let state = drink(createVendingState(), 0);
    state = stepVending(state, VENDING.boostSeconds + 0.1);
    expect(state.boostRemaining).toBe(0);
    expect(speedScale(state)).toBe(1);
  });

  it("대기가 끝난 자판기는 목록에서 사라진다", () => {
    // 남겨 두면 판이 길어질수록 Map이 계속 자란다
    let state = drink(createVendingState(), 0);
    state = stepVending(state, VENDING.cooldownSeconds + 0.1);
    expect(state.cooldowns.size, `size=${state.cooldowns.size}`).toBe(0);
  });

  it("뽑은 수는 줄지 않는다", () => {
    let state = drink(createVendingState(), 0);
    state = stepVending(state, 100);
    expect(state.drinks).toBe(1);
  });
});

describe("속도 배율", () => {
  it("효과 중에만 오른다", () => {
    expect(speedScale(createVendingState())).toBe(1);
    expect(speedScale(drink(createVendingState(), 0))).toBe(VENDING.boostScale);
  });

  it("보드보다 빨라지지 않는다", () => {
    /*
     * 이동 수단의 서열이 뒤집히면 보드를 탈 이유가 사라진다.
     * 달리기 최고 속도에 배율을 걸어도 보드 아래여야 한다.
     */
    const boosted = LOCOMOTION.run.maxSpeed * VENDING.boostScale;
    expect(boosted, `boosted run=${boosted}, board=${LOCOMOTION.skateboard.maxSpeed}`).toBeLessThan(
      LOCOMOTION.skateboard.maxSpeed,
    );
  });

  it("눈에 띌 만큼은 오른다", () => {
    // 5% 정도면 마셨는지도 모른다
    expect(VENDING.boostScale).toBeGreaterThan(1.15);
  });
});

describe("자판기를 실제로 마주치는가", () => {
  /*
   * 음료는 `F`로 뽑는데, 자판기가 변두리에만 있으면 그 기능을 배울 기회가
   * 없다 — 조작표에 적혀 있어도 눌러 볼 자판기를 못 만나면 없는 것과 같다.
   *
   * 재 보니 80대가 있고 스폰에서 가장 가까운 것이 17m다. 그 성질을 지킨다.
   */
  const layout = buildCityLayout();
  const machines = buildCityDetails(layout).vendingMachines;

  it("도시에 넉넉히 있다", () => {
    expect(machines.length, `${machines.length}대`).toBeGreaterThan(20);
  });

  it("시작하자마자 하나는 눈에 들어온다", () => {
    const nearest = Math.min(
      ...machines.map((m) => Math.hypot(m.x - layout.spawn.x, m.z - layout.spawn.z)),
    );
    expect(nearest, `가장 가까운 자판기가 ${nearest.toFixed(0)}m`).toBeLessThan(40);
  });

  it("한곳에 몰려 있지 않다", () => {
    /*
     * 전부 광장 주변에 있으면 멀리 나갔을 때 회복 수단이 사라진다.
     * 도시 절반 너머에도 있어야 한다.
     */
    const far = machines.filter(
      (m) => Math.hypot(m.x - layout.spawn.x, m.z - layout.spawn.z) > layout.halfExtent,
    );
    expect(far.length, `먼 쪽 자판기 ${far.length}대`).toBeGreaterThan(5);
  });

  it("닿는 거리가 자판기 간격보다 좁다", () => {
    /*
     * 반경이 너무 넓으면 지나가기만 해도 뽑히고, 좁으면 붙어도 안 뽑힌다.
     * 가장 가까운 두 대 사이보다는 좁아야 한 대를 고른다는 말이 성립한다.
     */
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < machines.length; i += 1) {
      for (let j = i + 1; j < machines.length; j += 1) {
        const gap = Math.hypot(machines[i].x - machines[j].x, machines[i].z - machines[j].z);
        if (gap < closest) closest = gap;
      }
    }
    expect(VENDING.reachMeters, `반경 ${VENDING.reachMeters}m, 최소 간격 ${closest.toFixed(1)}m`).toBeLessThan(closest);
  });
});

describe("음료 효과가 실제로 이동에 닿는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 이동 입력의 `speedScale`을 `1`로 박아도 검사가
   * 전부 통과했다 — 계산(`vending.speedScale`)은 지켜지는데 **그 값을 이동에
   * 넘기는 일**은 아무도 안 봤다.
   *
   * 그러면 조작 안내는 「F 음료」라 말하고 자판기는 반응하는데 **몸은 안 빨라진다.**
   * 흔적 표식이 씬에 안 붙어 있던 것과 같은 종류다 — 모듈은 맞고 **배선이 없다.**
   *
   * 동료 능력(인지·회복)은 `playerLink`를 거쳐 매 프레임 합쳐지므로 되돌리기
   * 검사가 따로 지킨다. 여기서 보는 것은 **음료 → 이동** 한 줄이다.
   */
  const rig = readCode("src/game/scene/PlayerRig.tsx");

  it("이동 입력이 음료 계산에서 온다", () => {
    expect(rig, "음료 효과를 박아 두었다").toMatch(/speedScale: speedScale\(/);
  });

  it("속도 배율을 숫자로 박지 않는다", () => {
    // `speedScale: 1`처럼 박으면 음료가 아무 일도 안 한다
    expect(rig, "속도 배율을 숫자로 박았다").not.toMatch(/speedScale: [\d.]/);
  });
});
