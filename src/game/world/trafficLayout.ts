/**
 * 주행 차량·신호등 배치 — 순수 데이터 생성.
 *
 * 차량은 도로 한 줄을 따라 직진만 한다. 교차로에서 회전시키려면 경로 그래프와
 * 회전 보간이 필요한데, 스쳐 지나가는 배경 차량에는 그만한 값을 하지 않는다.
 *
 * 위치는 세계 좌표가 아니라 **진행 거리 u**로 다룬다. u는 진행 방향으로만 증가하는
 * 스칼라라서 앞차와의 간격도, 정지선까지의 거리도 같은 뺄셈 한 번으로 구해진다.
 * 방향이 다른 차를 같은 식으로 처리할 수 있는 것이 이 표현의 이점이다.
 */

import { createSeededRandom } from "@/game/core/mathx";
import { CITY } from "@/game/world/cityLayout";

/**
 * 주행 차량 색.
 *
 * cityDetails의 갓길 주차 팔레트와 같은 계열로 맞춘다. import하지 않고 따로 두는
 * 이유는 배치 데이터 모듈끼리 서로를 끌어오면 한쪽 리팩토링이 다른 쪽을 깨뜨리기
 * 때문이다 — 여섯 개짜리 색표를 공유하려고 감수할 결합이 아니다.
 */
export const MOVING_CAR_PALETTE = [
  "#e8e6e1",
  "#2c2f38",
  "#8f9499",
  "#3a5a8c",
  "#8c3a3a",
  "#4a6b4a",
] as const;

const blockPitch = CITY.blockSize + CITY.roadWidth;

export const TRAFFIC = {
  seed: 20260818,
  /** 인스턴스 상한 */
  maxCars: 48,
  carsPerLane: 3,
  /**
   * 도로 중심선에서 차선 중심까지의 거리.
   *
   * 갓길 주차가 중심선 ±3.0을 차지하므로(cityDetails의 SIDEWALK_EDGE + 1.6)
   * 남는 폭은 6m뿐이다. 1.6이면 마주 오는 차와 차체 간격이 1.2m 남는다.
   */
  laneOffset: 1.6,
  minCruiseSpeed: 7.5,
  maxCruiseSpeed: 11,
  /** 앞차와 이 거리 안으로 붙으면 멈춘다. 이 두 배 거리부터 감속을 시작한다 */
  followGap: 8,
  /**
   * 정지선까지 이 거리 안에서 적색이면 감속을 시작한다.
   *
   * 감쇠 감속이라 멈추는 데 3m 이상이 필요하다. 이 값이 짧으면 신호를 밟고
   * 지나간 뒤에야 멈춰 선다.
   */
  stopLookahead: 14,
  /** 정지선 앞 이 거리 안에서는 목표 속도가 0이다 */
  stopMargin: 1.5,
  /** 교차로 중심에서 정지선까지 */
  stopLineOffset: 5.4,
  /** 가감속 감쇠 계수. 낮을수록 굼뜨게 붙는다 */
  speedLambda: 2.8,
  /**
   * 순환 구간을 월드 경계보다 이만큼 넓게 잡는다.
   *
   * u가 한 바퀴 돌 때 차가 반대편 끝으로 순간이동한다. 그 지점이 플레이어가
   * 갈 수 있는 범위 안이면 눈에 띄므로 밖으로 밀어낸다.
   */
  wrapMargin: 14,
  bodyWidth: 1.7,
  bodyHeight: 0.82,
  bodyLength: 3.9,
  bodyCenterY: 0.46,
  cabinWidth: 1.5,
  cabinHeight: 0.6,
  cabinLength: 2.0,
  cabinCenterY: 1.17,
  /** 이 거리 밖의 차량은 인스턴스를 접는다 */
  cullDistance: 150,
} as const;

/** 신호 주기. 한쪽이 녹색인 동안 반대쪽은 적색이다 */
export const SIGNAL = {
  greenSeconds: 9,
  yellowSeconds: 2.4,
  /** 전 방향 적색. 교차로를 비우는 시간이다 */
  allRedSeconds: 1,
  poleHeight: 4,
  poleWidth: 0.14,
  headWidth: 0.32,
  headHeight: 0.92,
  headDepth: 0.3,
  lampSize: 0.19,
  lampGap: 0.27,
  /** 교차로 중심에서 신호등 기둥까지. 인도 모서리(4.5) 안쪽이어야 한다 */
  cornerOffset: 4.1,
} as const;

/** 진행 축. "z"는 남북(세로) 도로, "x"는 동서(가로) 도로를 뜻한다 */
export type RoadAxis = "x" | "z";

export type SignalColor = "green" | "yellow" | "red";

export interface SignalState {
  alongZ: SignalColor;
  alongX: SignalColor;
}

export interface CarSpec {
  axis: RoadAxis;
  /** 진행 축과 직교하는 고정 좌표 */
  lanePosition: number;
  direction: 1 | -1;
  startU: number;
  cruiseSpeed: number;
  tone: number;
  /** 이 차가 만나는 정지선들의 u 좌표. 매 프레임 다시 구하지 않으려고 미리 계산한다 */
  stopLineUs: number[];
}

export interface TrafficPlan {
  cars: CarSpec[];
  /** 차선별 차량 인덱스 — 진행 순서(u 오름차순). 앞차는 배열의 다음 원소다 */
  lanes: number[][];
  /** u가 한 바퀴 도는 길이 */
  loopLength: number;
}

export interface SignalPostSpec {
  x: number;
  z: number;
  /** 이 기둥이 통제하는 진행 축 */
  axis: RoadAxis;
}

/** 도로 중심선 좌표 — 구역 사이마다 하나씩 */
export function roadCenters(): number[] {
  const offset = (CITY.gridSize - 1) / 2;
  const centers: number[] = [];
  for (let g = 0; g < CITY.gridSize - 1; g += 1) {
    centers.push((g - offset + 0.5) * blockPitch);
  }
  return centers;
}

/**
 * 진행 거리 u를 세계 좌표로 바꾼다.
 *
 * 방향과 무관하게 u는 증가하므로, 역방향 차는 좌표를 뒤집어 읽는다.
 */
export function coordinateFromU(u: number, direction: 1 | -1, halfSpan: number): number {
  return direction > 0 ? -halfSpan + u : halfSpan - u;
}

function uFromCoordinate(coordinate: number, direction: 1 | -1, halfSpan: number): number {
  return direction < 0 ? coordinate + halfSpan : halfSpan - coordinate;
}

/**
 * 신호 상태를 시간으로부터 계산한다.
 *
 * 상태를 들고 있지 않는다 — 시간만 넣으면 결정되므로 저장할 이유가 없고,
 * 탭이 백그라운드로 갔다 돌아와도 어긋나지 않는다.
 */
export function sampleSignal(time: number): SignalState {
  const half = SIGNAL.greenSeconds + SIGNAL.yellowSeconds + SIGNAL.allRedSeconds;
  const cycle = half * 2;
  let t = time % cycle;
  if (t < 0) t += cycle;

  const inFirstHalf = t < half;
  const local = inFirstHalf ? t : t - half;

  let active: SignalColor;
  if (local < SIGNAL.greenSeconds) active = "green";
  else if (local < SIGNAL.greenSeconds + SIGNAL.yellowSeconds) active = "yellow";
  else active = "red";

  return inFirstHalf ? { alongZ: active, alongX: "red" } : { alongZ: "red", alongX: active };
}

/**
 * 통행 가능 여부.
 *
 * 황색은 통과시킨다. 황색에 세우면 정지선을 넘은 차가 교차로 한복판에 갇힌다 —
 * 정지선 판정이 "앞에 있을 때만" 성립하는 구조라 한 번 넘으면 되돌릴 수 없다.
 */
export function canProceed(state: SignalState, axis: RoadAxis): boolean {
  return (axis === "z" ? state.alongZ : state.alongX) !== "red";
}

/**
 * 차량을 배치한다.
 *
 * 한 차선에 같은 간격으로 깔면 서로 추월할 일이 없어 초기 순서가 영원히 유지된다.
 * 앞차 판정이 배열의 다음 원소 하나로 끝나는 것이 이 배치 덕분이다.
 */
export function buildTraffic(halfExtent: number, budget: number): TrafficPlan {
  const random = createSeededRandom(TRAFFIC.seed);
  const halfSpan = halfExtent + TRAFFIC.wrapMargin;
  const loopLength = halfSpan * 2;
  const centers = roadCenters();
  const limit = Math.min(budget, TRAFFIC.maxCars);

  const cars: CarSpec[] = [];
  const lanes: number[][] = [];

  const axes: RoadAxis[] = ["z", "x"];

  for (const axis of axes) {
    for (const center of centers) {
      for (const direction of [1, -1] as const) {
        if (cars.length >= limit) break;

        // 우측통행. 진행 방향 오른쪽이 z축 진행에서는 -x, x축 진행에서는 +z다.
        const lanePosition =
          axis === "z"
            ? center - direction * TRAFFIC.laneOffset
            : center + direction * TRAFFIC.laneOffset;

        const stopLineUs = centers
          .map((crossing) =>
            uFromCoordinate(crossing - direction * TRAFFIC.stopLineOffset, direction, halfSpan),
          )
          .sort((a, b) => a - b);

        const lane: number[] = [];
        const spacing = loopLength / TRAFFIC.carsPerLane;
        const laneStart = random() * spacing;

        for (let k = 0; k < TRAFFIC.carsPerLane && cars.length < limit; k += 1) {
          lane.push(cars.length);
          cars.push({
            axis,
            lanePosition,
            direction,
            startU: (laneStart + k * spacing) % loopLength,
            cruiseSpeed:
              TRAFFIC.minCruiseSpeed + random() * (TRAFFIC.maxCruiseSpeed - TRAFFIC.minCruiseSpeed),
            // 갓길 주차와 같은 팔레트를 쓴다 — 주행 차량만 색이 튀면 붙여 넣은 것처럼 보인다.
            tone: Math.floor(random() * MOVING_CAR_PALETTE.length),
            stopLineUs,
          });
        }

        if (lane.length > 0) lanes.push(lane);
      }
    }
  }

  return { cars, lanes, loopLength };
}

/**
 * 신호등 기둥 배치.
 *
 * 교차로마다 마주 보는 두 모서리에 하나씩 세우고, 서로 다른 축을 통제하게 한다.
 * 네 모서리를 다 채우면 기둥만 36개가 되는데 화면에서 얻는 것이 없다.
 */
export function buildSignalPosts(): SignalPostSpec[] {
  const centers = roadCenters();
  const posts: SignalPostSpec[] = [];

  for (const cx of centers) {
    for (const cz of centers) {
      posts.push({ x: cx - SIGNAL.cornerOffset, z: cz - SIGNAL.cornerOffset, axis: "z" });
      posts.push({ x: cx + SIGNAL.cornerOffset, z: cz + SIGNAL.cornerOffset, axis: "x" });
    }
  }

  return posts;
}
