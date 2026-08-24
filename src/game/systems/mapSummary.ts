/**
 * 지도를 말로 옮긴다.
 *
 * 전체 지도는 캔버스다 — **낭독기에는 아무것도 없다.** 키보드로 열면
 * 「구역 색과 목표 위치를 표시한다」는 설명만 듣고 아무것도 모른 채 닫게 된다.
 * 지도의 요점은 세 가지뿐이다: 지금 어디고, 목표가 어느 쪽이며, 가까이에
 * 무엇이 있는가. 그 셋은 글로 옮길 수 있다.
 *
 * 눈으로 보는 사람에게도 쓸모가 있어서 화면에도 그대로 띄운다 — 색으로만
 * 알던 것을 「북동쪽 84m」로 못 박아 준다.
 *
 * 순수 함수다. 화면 없이 문장 자체를 검사할 수 있어야 문구가 조용히
 * 망가지지 않는다.
 */

import { districtAt } from "@/game/world/districts";

/**
 * 여덟 방위.
 *
 * 월드에서 +z가 북(지도 위쪽), +x가 동이다 — 지도가 북쪽 고정이므로
 * 화면에서 본 방향과 말이 어긋나지 않는다.
 */
const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;

export function compassFrom(dx: number, dz: number): string {
  // atan2(동, 북)이라 0이 북, 시계 방향으로 커진다
  const sector = Math.round(Math.atan2(dx, dz) / (Math.PI / 4));
  return COMPASS[((sector % 8) + 8) % 8];
}

export interface MapSummaryInput {
  x: number;
  z: number;
  targetX?: number;
  targetZ?: number;
  bossX: number;
  bossZ: number;
  /** 지도에 찍힌 고물 로봇 수 */
  enemyCount: number;
  /**
   * 아직 찾아가지 않은 도깨비 자리들.
   *
   * 지도에는 몸 색 동그라미로 찍히는데 **말로는 한마디도 없었다** — 수집이
   * 이 게임의 축인데, 눈으로 못 보는 사람에게는 갈 곳이 없는 도시가 된다.
   */
  shrines?: readonly { name: string; x: number; z: number }[];
  /**
   * 아직 조사하지 않은 흔적 자리.
   *
   * 지도에는 마름모로 찍히는데 글에는 없었다 — 도깨비 자리에서 이미 같은
   * 누락을 겪었다. 표식을 더할 때 **말도 함께 더해야** 눈으로 못 보는
   * 사람에게 갈 곳이 생긴다.
   */
  clues?: readonly { x: number; z: number }[];
}

/** 방향과 거리를 한 조각으로. 거리는 미터 단위 정수 — 소수점은 읽는 데 방해만 된다 */
function bearing(fromX: number, fromZ: number, toX: number, toZ: number): string {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.round(Math.hypot(dx, dz));
  // 바로 위에 서 있으면 방향이 무의미하다 — atan2가 아무 값이나 낸다
  if (distance < 3) return "바로 여기";
  return `${compassFrom(dx, dz)}쪽 ${distance}m`;
}

/**
 * 지도 한 장을 문장 몇 개로.
 *
 * 목표가 없는 구간(여정 사이)에서는 목표 문장을 빼고 있는 것만 말한다 —
 * 「목표 없음」이라고 말해 봐야 알려 주는 것이 없다.
 */
export function describeMap(input: MapSummaryInput): string {
  const parts = [`지금 ${districtAt(input.x, input.z).name}에 있다.`];

  if (input.targetX !== undefined && input.targetZ !== undefined) {
    parts.push(`목표는 ${bearing(input.x, input.z, input.targetX, input.targetZ)}.`);
  }

  /*
   * 흔적은 여정이 지금 시킨 일이라 도깨비 자리보다 먼저 말한다. 자리와 같은
   * 이유로 가장 가까운 하나만 말한다.
   */
  const clues = input.clues ?? [];
  if (clues.length > 0) {
    const nearest = clues.reduce((best, next) =>
      Math.hypot(next.x - input.x, next.z - input.z) <
      Math.hypot(best.x - input.x, best.z - input.z)
        ? next
        : best,
    );
    const where = bearing(input.x, input.z, nearest.x, nearest.z);
    parts.push(
      clues.length > 1
        ? `조사할 흔적 ${clues.length}곳, 가장 가까운 곳은 ${where}.`
        : `조사할 흔적은 ${where}.`,
    );
  }

  /*
   * 가장 가까운 자리 하나만 말한다. 넷을 다 읊으면 어디로 갈지 고르는 데
   * 더 오래 걸린다 — 지도를 보는 사람도 결국 가까운 것부터 간다.
   */
  const shrines = input.shrines ?? [];
  if (shrines.length > 0) {
    const nearest = shrines.reduce((best, next) =>
      Math.hypot(next.x - input.x, next.z - input.z) <
      Math.hypot(best.x - input.x, best.z - input.z)
        ? next
        : best,
    );
    const where = bearing(input.x, input.z, nearest.x, nearest.z);
    parts.push(
      shrines.length > 1
        ? `찾아갈 도깨비 자리 ${shrines.length}곳, 가장 가까운 ${nearest.name}은 ${where}.`
        : `찾아갈 도깨비 자리는 ${nearest.name}, ${where}.`,
    );
  }

  parts.push(`고물 대장은 ${bearing(input.x, input.z, input.bossX, input.bossZ)}.`);

  parts.push(
    input.enemyCount > 0 ? `주변에 고물 로봇 ${input.enemyCount}기.` : "주변에 고물 로봇이 없다.",
  );

  return parts.join(" ");
}
