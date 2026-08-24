/**
 * 보행자 배치·경로 — 순수 데이터 생성.
 *
 * cityLayout.ts와 같은 원칙이다. 이 모듈은 three.js를 모르고, Crowd.tsx가 결과를
 * 인스턴싱한다.
 *
 * 경로는 "구역 둘레를 한 바퀴 도는 직사각형 트랙" 하나뿐이다. 인도가 구역 둘레에만
 * 있으므로 경로 탐색을 만들 이유가 없고, 트랙 좌표를 닫힌 식으로 계산할 수 있어
 * 웨이포인트 배열조차 들고 있을 필요가 없다.
 */

import { createSeededRandom, TAU } from "@/game/core/mathx";
import { CITY } from "@/game/world/cityLayout";
import type { TimeOfDayId } from "@/game/world/timeOfDay";

/** 구역 중심 간 거리 — cityLayout과 같은 정의 */
const blockPitch = CITY.blockSize + CITY.roadWidth;

export const CROWD = {
  seed: 20260817,
  /** 인스턴스 상한. 품질 등급이 아무리 높아도 이 수를 넘기지 않는다 */
  maxPedestrians: 64,
  perBlock: 4,
  /**
   * 트랙 반경(구역 중심 기준). 구역 경계선에서 바깥으로 얼마나 나가는지로 정의한다.
   *
   * 건물 바깥면은 경계선 안쪽(최대 16.5), 가로수 기둥은 18.4, 인도 상판 끝은 19에
   * 있다. 두 트랙 모두 그 사이에 있어야 보행자가 벽이나 나무를 통과하지 않는다.
   */
  innerTrackRadius: CITY.blockSize / 2 + 0.1,
  outerTrackRadius: CITY.blockSize / 2 + 0.9,
  /** 인도 상판 윗면 높이. 정본은 CITY.sidewalkHeight다 — 다르면 발이 뜨거나 잠긴다 */
  groundY: CITY.sidewalkHeight,
  minSpeed: 0.95,
  maxSpeed: 1.75,
  /** 걸음 한 주기가 도는 데 필요한 이동 거리(m). 속도로 나누면 주기가 나온다 */
  strideLength: 1.35,
  /** 이 거리 밖의 보행자는 인스턴스를 접고 행렬 갱신을 건너뛴다 */
  cullDistance: 120,
  /** 이 거리 밖에서는 행렬을 두 프레임에 한 번만 쓴다 — 멀면 30Hz로 움직여도 티가 안 난다 */
  halfRateDistance: 45,
  /** 모서리에서 방향이 튀지 않게 감쇠하는 계수 */
  turnLambda: 9,
  /**
   * 플레이어의 춤에 합류하는 거리(m).
   *
   * 트레일러의 인상은 **혼자 추는 춤이 번지는 것**이다. 우리 춤은 혼자 추고
   * 끝났다 — 같은 동작인데 화면이 전혀 달랐던 이유가 이것이다.
   *
   * 컬링 거리(120m)보다 훨씬 좁게 둔다. 안 보이는 사람이 춤추는 것은 아무
   * 의미가 없고, 넓으면 광장 하나가 통째로 흔들려 **내가 시작했다는 인과**가
   * 사라진다.
   */
  danceRadius: 9,
  /**
   * 지나가는 나를 쳐다보는 거리(m).
   *
   * 원작 도시가 「살아 있다」고 읽히는 이유는 사람 **수**가 아니라 반응이다.
   * 우리 보행자는 옆에서 로봇과 싸워도 앞만 보고 걸었다.
   */
  glanceRadius: 6,
  /** 전투가 이 거리 안에서 벌어지면 물러선다(m) */
  fleeRadius: 13,
  /**
   * 물러설 때의 속도 배율.
   *
   * 걸음보다 빨라야 「피한다」로 보이고, 너무 빠르면 도망 경주가 된다.
   */
  fleeSpeedScale: 1.7,
  /**
   * 이 압력부터 전투로 본다(0~1).
   *
   * 0으로 두면 인지 반경 끝에 로봇 하나만 있어도 온 동네가 물러선다 —
   * 그건 반응이 아니라 소란이다.
   */
  fleeThreshold: 0.25,
} as const;

/**
 * 보행자 비율.
 *
 * 골반(hip)을 기준점으로 잡는다. 다리 회전 원점이 골반이라 여기서 재는 편이
 * 값을 고칠 때 어긋날 여지가 적다. 전체 키는 약 1.5m로 플레이어와 같은 눈높이다.
 */
export const PED_BODY = {
  hipHeight: 0.5,
  legLength: 0.5,
  legWidth: 0.16,
  legDepth: 0.18,
  legSpread: 0.11,
  torsoWidth: 0.42,
  torsoHeight: 0.52,
  torsoDepth: 0.26,
  /** 골반에서 몸통 중심까지. 다리 윗면(골반)과 몸통 아랫면이 붙어야 틈이 안 보인다 */
  torsoOffsetY: 0.26,
  headSize: 0.29,
  headOffsetY: 0.66,
  armLength: 0.42,
  armWidth: 0.13,
  armDepth: 0.14,
  armOffsetY: 0.48,
  armSpread: 0.27,
} as const;

/** 옷 색. 시드 난수로 고르며, 노을빛 아래에서 구분되는 채도로 맞춘다 */
export const SHIRT_PALETTE = [
  "#e0563f",
  "#3f6ea8",
  "#d9a441",
  "#5f8f6a",
  "#8c5aa8",
  "#d5d0c4",
  "#2f3448",
  "#c96f9b",
] as const;

export const PANTS_PALETTE = ["#3b4a6b", "#4a4451", "#7a6a58", "#2b2f3a"] as const;

export const SKIN_PALETTE = ["#f0c9a8", "#d8a67c", "#a97b55"] as const;

/**
 * 보행자가 하는 일.
 *
 * 트레일러 프레임에서 나온 규칙이다 — 원작 낮 거리에는 **걷기만 반복하는
 * 인물이 사실상 없다.** 한 화면에 걷기·앉기·서서 대화가 동시에 있다. 우리는
 * 전원이 같은 걸음으로 트랙을 돌았고, 그래서 수를 늘려도 인상이 그대로였다.
 *
 * 넷으로 나눈 기준은 **몸이 무엇을 하느냐**다. 이름만 다르고 화면이 같으면
 * 늘린 값이 없다:
 *
 * - `walk` — 트랙을 돈다. 다수여야 한다. 다 서 있으면 도시가 멈춘다.
 * - `talk` — **둘이 마주 본다.** 트랙 안팎에 하나씩 서서 서로를 향한다.
 * - `sit` — 주저앉는다. 골반이 내려가고 다리가 접힌다.
 * - `linger` — 그냥 서 있다. 걸음이 멎어 있을 뿐이라 가장 싸다.
 * - `play` — **제자리에서 폴짝인다.** 놀이터에 둘러서서 논다. 미끄럼틀과
 *   그네를 세워 놓고 아무도 놀지 않으면 그건 놀이터가 아니라 조형물이다.
 */
export const PEDESTRIAN_ACTIVITIES = ["walk", "talk", "sit", "linger", "play"] as const;

export type PedestrianActivity = (typeof PEDESTRIAN_ACTIVITIES)[number];

/**
 * 시간대별로 거리에 나와 있는 비율.
 *
 * 프레임에서 밤 구간은 인물이 **1명으로 뚝 떨어진다.** 북적임과 적막의 대비가
 * 낮/밤 국면 전환 장치다 — 우리는 시간대를 넷 만들어 두고 군중은 그것을 몰랐다.
 *
 * 새 시간대를 넣고 여기를 빠뜨리면 그 시간대에 군중이 사라진다. 검사가 본다.
 */
const CROWD_PRESENCE: Record<TimeOfDayId, number> = {
  dawn: 0.4,
  noon: 1,
  sunset: 0.8,
  night: 0.25,
};

/**
 * 이 시간대에 거리에 나와 있을 보행자 수.
 *
 * 배치를 다시 만들지 않는다 — 목록 앞에서부터 세는 것뿐이다. 시간대가 바뀔
 * 때마다 새로 뽑으면 **같은 사람이 다른 자리에서 다시 나타난다.**
 */
export function crowdCountFor(total: number, timeOfDay: TimeOfDayId): number {
  if (total <= 0) return 0;
  // 밤에도 하나는 남긴다. 완전히 비면 유령 도시가 되고, 그건 다른 게임이다
  return Math.max(1, Math.round(total * CROWD_PRESENCE[timeOfDay]));
}

/**
 * 이 시민이 지금 플레이어의 춤에 합류하는가.
 *
 * 상태를 들고 있지 않다 — **추는 동안만 합류하고 멈추면 돌아간다.** 한 번
 * 합류한 사람을 계속 춤추게 두면 도시가 서서히 멈춘다.
 */
export function joinsDance(
  pedestrianX: number,
  pedestrianZ: number,
  playerX: number,
  playerZ: number,
  /** 플레이어가 춤추는 중인지. 손 흔들기·앉기에는 아무도 따라 하지 않는다 */
  dancing: boolean,
  radius: number,
): boolean {
  if (!dancing) return false;
  return Math.hypot(pedestrianX - playerX, pedestrianZ - playerZ) <= radius;
}

/**
 * 보행자가 지금 무엇에 반응하는가.
 *
 * 셋을 한 함수에서 정하는 이유: **동시에 일어날 수 없기 때문**이다. 물러서는
 * 중에 고개를 돌리면 뒷걸음질 치며 쳐다보는 그림이 되고, 그건 사람이 아니라
 * 게처럼 보인다.
 */
export type CrowdReaction = "none" | "glance" | "flee";

/**
 * 전투가 가까우면 물러서고, 가까이 지나가면 쳐다본다.
 *
 * 전투가 먼저다 — 로봇이 코앞인데 나를 구경하고 있으면 그건 반응이 아니라 배경이다.
 */
export function crowdReaction(
  pedestrianX: number,
  pedestrianZ: number,
  playerX: number,
  playerZ: number,
  /** 지금 전투가 얼마나 가까운가 0~1 (`combatLink.combatPressure`) */
  combat01: number,
): CrowdReaction {
  const distance = Math.hypot(pedestrianX - playerX, pedestrianZ - playerZ);
  if (combat01 >= CROWD.fleeThreshold && distance <= CROWD.fleeRadius) return "flee";
  if (distance <= CROWD.glanceRadius) return "glance";
  return "none";
}

/**
 * 물러설 때 트랙의 어느 쪽으로 갈지(+1 / -1).
 *
 * 트랙 위를 도는 사람이라 아무 데로나 갈 수 없다 — **두 방향 중 멀어지는 쪽**을
 * 고른다. 방향을 안 고르면 절반은 전투 쪽으로 뛰어들고, 그건 도망이 아니다.
 */
export function fleeDirection(
  pedestrianX: number,
  pedestrianZ: number,
  playerX: number,
  playerZ: number,
  /** 지금 서 있는 자리의 트랙 접선 방향(rad) */
  trackYaw: number,
): 1 | -1 {
  const awayX = pedestrianX - playerX;
  const awayZ = pedestrianZ - playerZ;
  // 접선 방향과 「멀어지는 방향」의 내적. 양수면 그대로 가면 멀어진다
  const along = Math.sin(trackYaw) * awayX + Math.cos(trackYaw) * awayZ;
  return along >= 0 ? 1 : -1;
}

export interface PedestrianSpec {
  /** 순회하는 구역의 중심 */
  cx: number;
  cz: number;
  trackRadius: number;
  /** +1이면 트랙 진행 방향, -1이면 역방향 */
  direction: 1 | -1;
  speed: number;
  startU: number;
  shirtTone: number;
  pantsTone: number;
  skinTone: number;
  /** 시작 걸음 위상. 전원이 같은 발을 내딛으면 군무처럼 보인다 */
  startPhase: number;
  /** 무엇을 하고 있는지. `walk`가 아니면 자리에 머문다 */
  activity: PedestrianActivity;
  /**
   * 트랙 접선에서 몸을 얼마나 틀지(rad).
   *
   * 대화하는 둘은 서로를 봐야 한다. 렌더가 「안쪽 트랙이면 바깥을 본다」처럼
   * 추측하게 두지 않는다 — 배치가 정한 것을 그대로 넘긴다.
   */
  yawOffset: number;
}

export interface TrackSample {
  x: number;
  z: number;
  /** +z를 정면으로 보는 좌표계 기준 y축 회전 */
  yaw: number;
}

/** 트랙 한 바퀴 길이 */
export function trackPerimeter(radius: number): number {
  return radius * 8;
}

/**
 * 직사각형 트랙 위의 한 점을 구한다.
 *
 * 매 프레임 보행자 수만큼 불리므로 객체를 새로 만들지 않고 `out`에 채운다.
 * 반환 좌표는 구역 중심 기준 상대값이다.
 */
export function samplePerimeter(radius: number, u: number, out: TrackSample): TrackSample {
  const side = radius * 2;
  const perimeter = side * 4;
  let t = u % perimeter;
  if (t < 0) t += perimeter;

  const segment = Math.floor(t / side);
  const local = t - segment * side;

  if (segment === 0) {
    out.x = -radius + local;
    out.z = -radius;
    out.yaw = Math.PI / 2;
  } else if (segment === 1) {
    out.x = radius;
    out.z = -radius + local;
    out.yaw = 0;
  } else if (segment === 2) {
    out.x = radius - local;
    out.z = radius;
    out.yaw = -Math.PI / 2;
  } else {
    out.x = -radius;
    out.z = radius - local;
    out.yaw = Math.PI;
  }

  return out;
}

/**
 * 보행자를 배치한다.
 *
 * 구역마다 같은 수를 깔되 `budget`에 도달하면 멈춘다. 품질 등급이 낮은 기기에서
 * 인원을 줄여도 도시 한쪽만 비지 않도록, 구역을 돌면서 한 명씩 채우지 않고
 * 앞 구역부터 채우는 대신 방향·트랙을 섞어 밀도가 균일해 보이게 한다.
 */
/**
 * 놀이터 수치.
 *
 * 트랙 기계를 그대로 쓴다 — 「구역 중심 둘레의 직사각 트랙 위 한 점」이
 * 이미 있는데, 중심을 놀이터로 바꾸고 반지름을 줄이면 그것이 곧 놀이터를
 * 둘러선 원이다. 새 배치 규칙을 만들면 걷기와 놀기가 다른 좌표계를 살게
 * 되고, 그러면 놀던 아이가 도망갈 때 순간이동한다.
 */
export const PLAYGROUND = {
  /** 놀이터 한 곳에 몇 명이 노는가. 둘이면 형제, 넷이면 놀이터다 */
  kidsPerSpot: 4,
  /** 놀이기구를 둘러서는 반지름(m). 미끄럼틀·그네 밖이어야 몸이 안 겹친다 */
  ringRadius: 4.2,
  /** 폴짝이는 속도(rad/s). 걷기 위상보다 빨라야 뛰는 것으로 읽힌다 */
  hopRate: 7.4,
  /** 뛰어오르는 높이 배수. 걷기 흔들림(bob)에 곱한다 */
  hopScale: 2.6,
} as const;

/**
 * 놀이터에 모여 노는 사람들.
 *
 * 보행자와 **같은 타입**을 쓴다. 그래야 도망·쳐다봄·춤 합류가 저절로 따라온다 —
 * 로봇이 오면 놀던 아이도 흩어져야 하는데, 별도 목록으로 두면 그 반응을
 * 한 벌 더 적게 되고 한쪽만 고쳐진다.
 */
export function buildPlaygroundKids(
  spots: readonly { x: number; z: number }[],
  budget: number,
): PedestrianSpec[] {
  const random = createSeededRandom(CROWD.seed + 1);
  const specs: PedestrianSpec[] = [];
  const perimeter = trackPerimeter(PLAYGROUND.ringRadius);

  for (const spot of spots) {
    for (let i = 0; i < PLAYGROUND.kidsPerSpot && specs.length < budget; i += 1) {
      specs.push({
        cx: spot.x,
        cz: spot.z,
        trackRadius: PLAYGROUND.ringRadius,
        activity: "play",
        /*
         * 안쪽을 본다. 직사각 트랙의 접선 방향에서 -90도가 언제나 중심
         * 쪽이다(`samplePerimeter`의 네 구간이 모두 그렇다).
         */
        yawOffset: -Math.PI / 2,
        direction: 1,
        speed: 0,
        // 둘레를 고르게 나눠 선다. 겹쳐 서면 한 사람으로 보인다
        startU: (perimeter * i) / PLAYGROUND.kidsPerSpot,
        shirtTone: Math.floor(random() * SHIRT_PALETTE.length),
        pantsTone: Math.floor(random() * PANTS_PALETTE.length),
        skinTone: Math.floor(random() * SKIN_PALETTE.length),
        // 같이 뛰면 군무다. 위상을 흩어 각자 다른 박자로 뛴다
        startPhase: random() * TAU,
      });
    }
  }

  return specs;
}

export function buildPedestrians(budget: number): PedestrianSpec[] {
  const random = createSeededRandom(CROWD.seed);
  const specs: PedestrianSpec[] = [];
  const limit = Math.min(budget, CROWD.maxPedestrians);
  const totalBlocks = CITY.gridSize * CITY.gridSize;
  const offset = (CITY.gridSize - 1) / 2;

  for (let round = 0; round < CROWD.perBlock && specs.length < limit; round += 1) {
    for (let blockIndex = 0; blockIndex < totalBlocks && specs.length < limit; blockIndex += 1) {
      const cx = ((blockIndex % CITY.gridSize) - offset) * blockPitch;
      const cz = (Math.floor(blockIndex / CITY.gridSize) - offset) * blockPitch;

      // 진행 방향마다 트랙을 나눈다. 같은 선 위에서 마주 오면 서로를 통과해 지나간다.
      const direction: 1 | -1 = random() < 0.5 ? 1 : -1;
      const trackRadius = direction > 0 ? CROWD.outerTrackRadius : CROWD.innerTrackRadius;

      specs.push({
        cx,
        cz,
        trackRadius,
        // 행동은 아래에서 구역 단위로 정한다 — 짝이 필요한 것이 있어서다
        activity: "walk",
        yawOffset: 0,
        direction,
        speed: CROWD.minSpeed + random() * (CROWD.maxSpeed - CROWD.minSpeed),
        startU: random() * trackPerimeter(trackRadius),
        shirtTone: Math.floor(random() * SHIRT_PALETTE.length),
        pantsTone: Math.floor(random() * PANTS_PALETTE.length),
        skinTone: Math.floor(random() * SKIN_PALETTE.length),
        startPhase: random() * TAU,
      });
    }
  }

  return assignActivities(specs);
}

/**
 * 같은 구역에 선 사람들에게 할 일을 나눠 준다.
 *
 * **뽑을 때가 아니라 뽑은 뒤에 정한다.** 대화는 둘이 필요한데, 예산이 중간에
 * 끊기면 짝이 하나만 남는다 — 허공에 대고 서 있는 사람이 생긴다.
 *
 * 난수를 쓰지 않고 구역 순서로 가른다. 이웃한 구역이 서로 다른 일을 하게 되고,
 * 무엇보다 **같은 시드에서 늘 같다.**
 */
function assignActivities(specs: PedestrianSpec[]): PedestrianSpec[] {
  const byBlock = new Map<string, PedestrianSpec[]>();
  for (const spec of specs) {
    const key = `${spec.cx},${spec.cz}`;
    const group = byBlock.get(key) ?? [];
    group.push(spec);
    byBlock.set(key, group);
  }

  let blockOrder = 0;
  for (const group of byBlock.values()) {
    const turn = blockOrder % 4;
    blockOrder += 1;
    // 혼자 있는 구역은 걷는다. 앉아 있기만 한 동네는 비어 보인다
    if (group.length < 2) continue;

    const [first, second] = group;
    if (turn === 0) {
      /*
       * 마주 보고 선 둘. 트랙 안팎에 하나씩 세우고 같은 자리(u)에 둔다 —
       * 인도 폭만큼 떨어져 서로를 본다.
       */
      first.activity = "talk";
      second.activity = "talk";
      second.startU = first.startU;
      first.trackRadius = CROWD.outerTrackRadius;
      second.trackRadius = CROWD.innerTrackRadius;
      first.yawOffset = -Math.PI / 2;
      second.yawOffset = Math.PI / 2;
    } else if (turn === 1) {
      second.activity = "sit";
    } else if (turn === 3) {
      second.activity = "linger";
    }
    // turn === 2는 둘 다 걷는다 — 걷는 사람이 다수여야 도시가 움직인다
  }

  return specs;
}
