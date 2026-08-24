/**
 * 흔적 — 도시에 남은 세 자리.
 *
 * PROJECT_PLAN의 핵심 루프: 「세 개의 흔적을 조사한다」. 여정이 이동과 전투로만
 * 되어 있어서 **찾아보는 대목이 없었다** — 도시가 넓은 이유가 달리기 위해서만
 * 있었다.
 *
 * 자리는 도로 격자에서 유도한다. 좌표를 손으로 박으면 도시 크기를 바꿀 때
 * 흔적만 건물 안에 남는다 — 이 저장소에서 좌표를 두 번 적어 어긋난 적이 있다.
 *
 * 살펴보기(주민·간판)와 같은 키를 쓴다. 흔적이 가장 우선한다 — 여정이 시킨
 * 일이고, 옆에 주민이 서 있다고 진행이 막히면 안 된다.
 */

import { ROAD_CENTERS } from "@/game/world/cityLayout";

/*
 * 흔적을 조사할 수 있는 거리(m). 살펴보기와 같아야 손이 헷갈리지 않는다.
 *
 * 내보내지 않는다 — 판정은 `clueAt`이 한다. 값을 밖에 내면 부르는 쪽마다
 * 비교를 다시 쓰게 되고 규칙이 갈라진다(주민 쪽에서 같은 판단을 했다).
 */
export const CLUE_RADIUS = 3.4;

export interface Clue {
  id: string;
  /** 조사했을 때 나오는 말 */
  line: string;
  x: number;
  z: number;
}

/**
 * 교차로 좌표.
 *
 * 도로 중심선이 만나는 자리라 어느 방향에서 와도 닿는다. 건물 안이 될 수
 * 없다는 것도 격자에서 곧바로 따라온다.
 */
function crossing(col: number, row: number): { x: number; z: number } {
  return { x: ROAD_CENTERS[col], z: ROAD_CENTERS[row] };
}

/**
 * 세 흔적.
 *
 * 광장에서 서로 다른 방향으로 흩어 둔다 — 한 줄로 세우면 지나가다 전부
 * 주워져서 찾아본 기억이 남지 않는다.
 */
export const CLUES: readonly Clue[] = [
  {
    id: "scratch",
    line: "가로등 기둥에 긁힌 자국. 사람 손이 닿는 높이가 아니다.",
    ...crossing(1, 2),
  },
  {
    id: "footprint",
    line: "젖은 발자국이 여기서 끊긴다. 위로 올라간 것 같다.",
    ...crossing(4, 3),
  },
  {
    id: "bulb",
    line: "깨진 전구 조각. 아직 따뜻하다.",
    ...crossing(3, 5),
  },
];

/**
 * 지금 조사할 수 있는 흔적.
 *
 * 이미 찾은 것은 후보에서 뺀다 — 같은 자리를 두 번 조사해도 수가 늘지 않는데
 * 왜 안 되는지 알 수 없다.
 */
export function clueAt(x: number, z: number, found: readonly string[]): Clue | null {
  const taken = new Set(found);
  for (const clue of CLUES) {
    if (taken.has(clue.id)) continue;
    const dx = clue.x - x;
    const dz = clue.z - z;
    if (dx * dx + dz * dz <= CLUE_RADIUS * CLUE_RADIUS) return clue;
  }
  return null;
}

/** 아직 찾지 않은 흔적들. 지도가 이 목록만 표시한다 */
export function pendingClues(found: readonly string[]): Clue[] {
  const taken = new Set(found);
  return CLUES.filter((clue) => !taken.has(clue.id));
}
