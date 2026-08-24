/**
 * 빛으로 여는 문 — 순수 데이터·판정.
 *
 * TRAILER_FEATURE_ANALYSIS 「3.5 도깨비 소환과 협동」이 근거다. 저기 적어 둔
 * 「도깨비 능력으로 길을 열거나 퍼즐을 푸는 활용」이 우리 쪽에는 없었다 —
 * 능력은 밝기·은신·회복 **배율**로만 쓰여서, 도깨비를 모으는 이유가 전투
 * 수치 말고는 없었다. 수집이 곧 열쇠가 되어야 도감이 카드가 아니라 동료다.
 *
 * 규칙은 하나뿐이다: **동료의 빛이 그 문에 닿으면 열린다.** 빛이 닿는
 * 거리는 도깨비마다 다르므로(`roster.ts`의 `lightRangeScale`), 누구와
 * 다니느냐에 따라 열리는 문이 달라진다. 새 상태를 만들지 않는다 — 이미
 * 매 프레임 계산되는 값(`companionLightRange`)을 읽기만 한다.
 *
 * three.js도 React도 모른다.
 */

import type { Aabb } from "@/game/player/locomotion";
import { BASE_LIGHT_RANGE } from "@/game/dokebi/roster";
import { CITY, ROAD_CENTERS } from "@/game/world/cityLayout";

export interface SpiritGate {
  id: string;
  /** 화면에 뜨는 이름 */
  name: string;
  /** 열렸을 때, 또는 빛이 모자랄 때 동료가 하는 말 */
  line: string;
  /** 문의 한가운데 */
  x: number;
  z: number;
  /**
   * 문이 가로지르는 축. "x"면 x 방향으로 넓고 z 방향으로 얇다.
   *
   * 도로를 막는 판이라 **길과 직각**이어야 한다. 나란히 두면 옆으로 그냥
   * 돌아갈 수 있어 문이 아니라 벽 조각이 된다.
   */
  axis: "x" | "z";
  /**
   * 열려면 빛이 이만큼은 닿아야 한다(m).
   *
   * 셋이 서로 다르다. 같으면 도깨비를 바꿀 이유가 없고, 그러면 이 문은
   * 「능력 버튼을 누르는 자리」일 뿐 퍼즐이 아니다.
   */
  requiredLightRange: number;
}

/** 문 두께(m). 얇아야 벽이 아니라 문으로 보인다 */
export const GATE_THICKNESS = 0.8;

/** 문 높이(m). 넘어갈 수 없어야 하므로 캐릭터보다 훨씬 높다 */
export const GATE_HEIGHT = 4.2;

/**
 * 이 거리 안에 들어와야 판정한다(m).
 *
 * 빛이 닿는지만 보면 **도시 반대편에서 능력을 켜도 문이 열린다** — 열린 것을
 * 볼 수 없으니 무슨 일이 일어났는지 알 수 없다. 문 앞에서 열려야 인과가 보인다.
 */
export const GATE_REACH = 9;

/** 도로 폭의 절반 — 문은 길을 딱 막는다 */
const HALF_ROAD = CITY.roadWidth / 2;

/**
 * 문 셋.
 *
 * 도로 위(교차로 사이)에 둔다. 건물을 막으면 갈 곳이 사라지지만, 길을 막으면
 * **돌아가면 그만**이다 — 못 여는 문 때문에 진행이 멎지 않는다. 문은 벽이
 * 아니라 지름길이다.
 */
export const SPIRIT_GATES: readonly SpiritGate[] = [
  {
    id: "plaza-alley",
    name: "광장 뒷길",
    line: "이 빛이면 열려. 뒤로 질러갈 수 있겠다.",
    x: ROAD_CENTERS[3],
    z: (ROAD_CENTERS[3] + ROAD_CENTERS[4]) / 2,
    axis: "x",
    /*
     * 요구치는 **기본 빛(9m)의 배수**로 적는다. 절대 숫자로 적어 두면
     * 기본값이 바뀌는 순간 문 셋이 한꺼번에 열리거나 한꺼번에 잠긴다.
     *
     * 1.5배 — 첫 문은 배우는 자리다. 처음부터 함께 있는 동료(초롱,
     * 배율 2.2)의 빛으로 열린다.
     */
    requiredLightRange: BASE_LIGHT_RANGE * 1.5,
  },
  {
    id: "market-gate",
    name: "시장 샛문",
    line: "여긴 더 밝아야 해. 빛이 센 애를 데려와.",
    x: (ROAD_CENTERS[4] + ROAD_CENTERS[5]) / 2,
    z: ROAD_CENTERS[2],
    axis: "z",
    // 2.1배 — 초롱(2.2)으로 아슬아슬하게 열린다
    requiredLightRange: BASE_LIGHT_RANGE * 2.1,
  },
  {
    id: "forest-gate",
    name: "숲 어귀 문",
    line: "숨 죽인 빛으로는 안 되겠는데. 제일 밝은 애가 필요해.",
    x: ROAD_CENTERS[1],
    z: (ROAD_CENTERS[4] + ROAD_CENTERS[5]) / 2,
    axis: "x",
    // 2.5배 — 가장 밝은 자정(2.6)만 연다. 하나는 다른 동료가 필요해야 한다
    requiredLightRange: BASE_LIGHT_RANGE * 2.5,
  },
];

/**
 * 지금 이 문이 열려 있는가.
 *
 * 상태를 들고 있지 않다 — **켜 두면 열리고 끄면 닫힌다.** 한 번 열면 영영
 * 열리는 편이 편하지만, 그러면 능력이 「한 번 누르는 스위치」가 되고 동료를
 * 바꿔 가며 다닐 이유가 사라진다.
 */
export function isGateOpen(
  gate: SpiritGate,
  playerX: number,
  playerZ: number,
  /** 지금 동료 빛이 닿는 거리(m). 능력이 꺼져 있으면 0이다 */
  lightRange: number,
): boolean {
  if (lightRange < gate.requiredLightRange) return false;
  return Math.hypot(playerX - gate.x, playerZ - gate.z) <= GATE_REACH;
}

/**
 * 가장 가까운 문. 이 거리 밖이면 null.
 *
 * HUD가 「빛이 모자란다」를 알려 주려면 **어느 문 앞인지**를 알아야 한다.
 * 아무 안내 없이 막혀 있으면 그냥 벽으로 보이고, 벽은 퍼즐이 아니다.
 */
export function nearestGate(
  playerX: number,
  playerZ: number,
  gates: readonly SpiritGate[] = SPIRIT_GATES,
): SpiritGate | null {
  let best: SpiritGate | null = null;
  let bestDistance = GATE_REACH;

  for (const gate of gates) {
    const distance = Math.hypot(playerX - gate.x, playerZ - gate.z);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = gate;
  }
  return best;
}

/**
 * 문이 막고 있는 자리.
 *
 * 열린 문은 상자를 목록에서 빼는 대신 **아주 먼 곳으로 밀어 둔다.** 목록
 * 길이가 프레임마다 바뀌면 이 배열을 공유하는 쪽(플레이어 충돌)이 매번 새
 * 배열을 받게 되고, 그러면 매 프레임 리렌더가 따라온다.
 */
export function gateCollider(gate: SpiritGate, open: boolean): Aabb {
  if (open) {
    // 도시 밖 먼 자리. 어떤 좌표와도 겹치지 않으므로 판정에서 자연히 빠진다.
    const away = 1e6;
    return { minX: away, maxX: away + 1, minZ: away, maxZ: away + 1, top: 0 };
  }

  const halfShort = GATE_THICKNESS / 2;
  const halfX = gate.axis === "x" ? HALF_ROAD : halfShort;
  const halfZ = gate.axis === "x" ? halfShort : HALF_ROAD;

  return {
    minX: gate.x - halfX,
    maxX: gate.x + halfX,
    minZ: gate.z - halfZ,
    maxZ: gate.z + halfZ,
    top: GATE_HEIGHT,
  };
}
