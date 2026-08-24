/**
 * 1분 30초 시연 코스 — 순수 데이터.
 *
 * 시연 영상을 찍으려니 **무엇을 어느 순서로 보여 줄지가 아무 데도 없었다.**
 * 기능은 흩어져 있고(놀이터는 공원 구석, 제트스키는 물가, 대장은 반대편
 * 교차로), 한 판에 다 보여 주려면 동선을 미리 알아야 한다. 문서로만 적으면
 * 지형·배치를 만질 때마다 조용히 틀린 글이 된다.
 *
 * 그래서 **좌표를 배치에서 끌어온다.** 광장·놀이터·물가·대장 자리는 각자
 * 정본이 있고, 여기서는 그것을 가리키기만 한다. 중간 경유지만 손으로 적는데,
 * 그 값도 검사가 「그 시간 안에 실제로 갈 수 있는가」로 붙잡는다 —
 * 자전거로 12초에 200m를 가는 대본은 쓸 수 없다.
 *
 * three.js도 React도 모른다.
 */

import { BOSS_HOME } from "@/game/combat/bossSim";
import type { LocomotionMode } from "@/game/config/tuning";
import type { CityLayout } from "@/game/world/cityLayout";
import { shoreLanding } from "@/game/world/waterRide";

/** 시연 한 편의 길이(초) */
export const DEMO_SECONDS = 90;

/**
 * 시연에서 보여 줘야 하는 것.
 *
 * 목록으로 두는 이유: **빠뜨린 것을 검사가 잡게** 하기 위해서다. 기능을
 * 하나 더 만들고 대본에 넣는 것을 잊으면, 그 기능은 시연 영상에 없다.
 */
export const DEMO_TOPICS = [
  "달리기 카메라",
  "언덕 지형",
  "탈것",
  "그래플·활강",
  "놀이터",
  "제트스키",
  "무기",
  "도깨비 소환",
  "마무리 연출",
] as const;

export type DemoTopic = (typeof DEMO_TOPICS)[number];

export interface DemoBeat {
  /** 시작 시각(초) */
  at: number;
  /** 한 줄 제목 — 편집자가 읽는다 */
  title: string;
  /** 여기서 보여 주는 것 */
  topics: readonly DemoTopic[];
  /** 이 구간을 어떻게 이동하는가. 다음 지점까지 갈 수 있는지 검사가 이것으로 잰다 */
  mode: LocomotionMode;
  /** 이 구간이 시작되는 자리 */
  x: number;
  z: number;
  /** 눌러야 하는 키 — 없으면 이동만 한다 */
  keys?: string;
}

/**
 * 이동 여유 배수.
 *
 * 최고 속도로 직선을 달릴 수는 없다 — 붙는 데 시간이 걸리고, 길이 휘고,
 * 사람이 조작한다. 최고 속도의 80%를 실제 낼 수 있는 속도로 본다.
 */
export const DEMO_PACE = 0.8;

/**
 * 시연 코스를 만든다.
 *
 * 배치를 받아 자리를 끌어온다 — 광장이 옮겨 가거나 놀이터가 다른 구역에
 * 생기면 대본이 **저절로 따라간다.**
 */
export function buildDemoRoute(layout: CityLayout): DemoBeat[] {
  const shore = shoreLanding(layout.halfExtent);
  /*
   * 놀이터는 여럿이다. 광장에서 제일 가까운 곳을 고른다 — 먼 곳을 잡으면
   * 12초 안에 못 가고, 그 사실이 대본에는 안 보인다.
   */
  const playground = nearestSpot(layout.playSpots, layout.spawn.x, layout.spawn.z);

  return [
    {
      at: 0,
      title: "광장에서 출발 — 걷다가 달린다",
      topics: ["달리기 카메라"],
      mode: "run",
      x: layout.spawn.x,
      z: layout.spawn.z,
      keys: "WASD + Shift",
    },
    {
      at: 8,
      title: "큰길로 나와 자전거를 탄다 — 언덕을 오르내린다",
      topics: ["탈것", "언덕 지형"],
      mode: "bike",
      // 광장 남쪽 큰길. 손으로 적은 경유지다
      x: 0,
      z: -10,
      keys: "B",
    },
    {
      at: 20,
      title: "공원 놀이터 — 아이들이 논다. 춤을 추면 합류한다",
      topics: ["놀이터"],
      mode: "bike",
      x: playground.x,
      z: playground.z,
      keys: "R",
    },
    {
      at: 30,
      title: "전깃줄에 갈고리를 걸어 날고, 떨어지며 활강한다",
      topics: ["그래플·활강"],
      mode: "bike",
      // 공원과 해안 사이의 골목. 전깃줄이 지나가는 구간이다
      x: -80,
      z: -40,
      keys: "G → Space 유지",
    },
    {
      at: 38,
      title: "물가에서 제트스키로 갈아탄다",
      topics: ["제트스키"],
      mode: "bike",
      x: shore.x,
      z: shore.z,
      keys: "B (내리기) → B (타기)",
    },
    {
      at: 48,
      title: "바다로 나간다 — 뭍 탈것은 여기 못 온다",
      topics: ["제트스키"],
      mode: "jetski",
      // 물가에서 바다 쪽으로. 경계 밖이라 제트스키만 닿는다
      x: -180,
      z: shore.z,
    },
    {
      at: 56,
      title: "돌아와 로봇 무리와 붙는다 — 장난감 칼로 넓게 벤다",
      topics: ["무기"],
      // 내려서 싸운다. 다음 장면이 같은 자리라 이동은 없다
      mode: "walk",
      x: -78,
      z: 84,
      keys: "B (내리기) → 2 → J",
    },
    {
      at: 64,
      title: "광선총으로 끌어당기고, 활로 멀리서 눕힌다",
      topics: ["무기"],
      // 싸움을 끝내고 대장에게 달려간다 — 39m를 8초에
      mode: "run",
      x: -78,
      z: 84,
      keys: "5 → J, 6 → J",
    },
    {
      at: 72,
      title: "고물 대장 — 만난 도깨비가 전부 나와 함께 돈다",
      topics: ["도깨비 소환"],
      mode: "run",
      x: BOSS_HOME.x,
      z: BOSS_HOME.z + 14,
      keys: "J",
    },
    {
      at: 82,
      title: "마지막 한 방 — 시간이 늦춰지고 카메라가 얼굴로 붙는다",
      topics: ["마무리 연출"],
      mode: "walk",
      x: BOSS_HOME.x,
      z: BOSS_HOME.z + 14,
    },
  ];
}

/** 광장에서 가장 가까운 자리. 먼 곳을 잡으면 시간 안에 못 간다 */
function nearestSpot(
  spots: readonly { x: number; z: number }[],
  x: number,
  z: number,
): { x: number; z: number } {
  let best = spots[0];
  let bestDistance = Infinity;
  for (const spot of spots) {
    const distance = Math.hypot(spot.x - x, spot.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return best;
}

/**
 * 이 시각에 보여 주고 있는 장면. 아직 시작 전이면 첫 장면이다.
 *
 * 화면 안내(`DemoGuide`)가 읽는다. 「지금 몇 번째인가」를 화면 쪽에서 세면
 * 대본과 표시가 갈라진다 — 장면을 하나 끼워 넣었는데 안내는 옛 번호를
 * 부르는 식이다.
 */
export function beatAt(beats: readonly DemoBeat[], seconds: number): DemoBeat {
  let current = beats[0];
  for (const beat of beats) {
    if (beat.at <= seconds) current = beat;
  }
  return current;
}

/**
 * 시연 시작 자리 — 코스의 첫 장면.
 *
 * 확인 지점 표(`SCENARIOS`)에 좌표를 적지 않는 이유: 광장이 옮겨 가면
 * 대본과 시작 자리가 갈라진다. 배치를 받아 여기서 정한다.
 */
export function demoSpawn(layout: CityLayout): { x: number; y: number; z: number } {
  const first = buildDemoRoute(layout)[0];
  return { x: first.x, y: layout.spawn.y, z: first.z };
}

/** 한 구간에서 실제로 내야 하는 속도(m/s). 마지막 구간은 이동이 없으므로 0 */
export function beatSpeed(beats: readonly DemoBeat[], index: number): number {
  const beat = beats[index];
  const next = beats[index + 1];
  if (!next) return 0;

  const distance = Math.hypot(next.x - beat.x, next.z - beat.z);
  const seconds = next.at - beat.at;
  if (seconds <= 0) return Infinity;
  return distance / seconds;
}
