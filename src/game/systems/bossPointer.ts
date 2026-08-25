/**
 * 고물 대장이 어느 쪽에 있는지 — 순수 계산.
 *
 * DESIGN_GUIDE 「월드 안내」의 **「화면 밖 중요 대상에는 방향 표시를 함께
 * 제공한다」**를 대장에 적용한 것이다. 그전까지 대장의 자리를 알리는 것은
 * 미니맵의 붉은 삼각형 하나였고, 퀘스트 힌트도 「지도의 붉은 삼각형이 서 있는
 * 자리입니다」라고 그 표식을 가리킬 뿐이었다 — 지도를 안 보는 사람에게는
 * 아무 안내가 없었다.
 *
 * 미니맵과 **같은 변환**(`toMapPoint`)을 쓴다. 각도를 두 번 계산하면 화살표와
 * 지도가 서로 다른 쪽을 가리키는 날이 온다.
 */

import { BOSS } from "@/game/combat/bossSim";
import { toMapPoint } from "@/game/systems/minimap";

export const BOSS_POINTER = {
  /**
   * 이 거리(m) 안에서만 화살표를 띄운다.
   *
   * 도시 반대편에서까지 뜨면 「지금 할 일」이 아닌 것이 늘 화면에 있는 셈이라,
   * 줄이려던 상시 표시를 하나 더 만드는 것이 된다. 미니맵 반경(80m)보다 조금
   * 좁게 두어 **지도에 이미 보이는 것만** 화살표로도 알린다.
   */
  showRadius: 70,
  /** 화면 중심에서 화살표까지의 비율(0~1). 1이면 가장자리에 닿는다 */
  ringX: 0.74,
  ringY: 0.66,
  /**
   * 이 각도(rad) 안쪽이면 「정면」으로 본다.
   *
   * 정면에 있고 가깝기까지 하면 대장이 화면에 실제로 보인다. 그 위에 화살표를
   * 겹치면 체력 막대와 같은 자리에서 부딪히기만 한다.
   */
  aheadAngle: 0.55,
} as const;

export interface BossPointerFrame {
  visible: boolean;
  /** 정면을 0으로 한 방위(rad). 오른쪽이 양수 — CSS 회전과 같은 방향이다 */
  bearing: number;
  /** 화면 중심 기준 비율 좌표(-1~1). 오른쪽·아래쪽이 양수 */
  offsetX: number;
  offsetY: number;
  /** 대장까지의 거리(m) */
  distance: number;
  /** 시야 정면에 있는지 */
  ahead: boolean;
}

export interface BossPointerInput {
  playerX: number;
  playerZ: number;
  /**
   * **화면이 보는** 방향(rad). 미니맵이 지도를 돌릴 때 쓰는 값과 같다.
   *
   * 몸이 향한 쪽(`facing`)이 아니다 — 제자리에서 시점만 돌리면 그 값은 안
   * 바뀌어서, 눈앞의 대장을 화살표가 뒤쪽으로 가리켰다.
   */
  viewYaw: number;
  bossX: number;
  bossZ: number;
  /** 살아 있는지. 눕혀 둔 동안과 처치한 뒤에는 false */
  alive: boolean;
}

/**
 * 화살표를 어디에 어느 쪽으로 그릴지 정한다.
 *
 * 눕힌 뒤에는 `visible`이 false다 — 없는 것을 계속 가리키면 지도가 거짓말을
 * 하는 것과 같다.
 */
export function bossPointerFrame(input: BossPointerInput): BossPointerFrame {
  const point = toMapPoint(input.bossX, input.bossZ, input.playerX, input.playerZ, input.viewYaw);
  const distance = Math.hypot(point.u, point.v);
  const bearing = Math.atan2(point.u, point.v);
  const ahead = Math.abs(bearing) <= BOSS_POINTER.aheadAngle;

  return {
    visible:
      input.alive &&
      distance <= BOSS_POINTER.showRadius &&
      !(ahead && distance <= BOSS.aggroRadius),
    bearing,
    offsetX: Math.sin(bearing) * BOSS_POINTER.ringX,
    offsetY: -Math.cos(bearing) * BOSS_POINTER.ringY,
    distance,
    ahead,
  };
}
