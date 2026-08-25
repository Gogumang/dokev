/**
 * 배경 차량의 **차종** — 어느 차에 어느 모델을 붙이고, 어떤 색으로 물들일지.
 *
 * 지금까지 달리는 차는 상자 두 개였다(차체 + 캐빈). 상자로도 「차가 다닌다」는
 * 읽혔지만, 도시의 나머지가 GLB로 바뀌고 나니 **도로 위만 프로토타입**으로
 * 남았다 — 주인공도 대장도 둥근데 차만 각졌다.
 *
 * 모델을 세 종으로 나눈 이유는 값이 아니라 **눈**이다. 한 종만 있으면 차선마다
 * 같은 차가 줄지어 달리는 것이 바로 보인다. 승용차·미니버스·배달 밴은 실루엣이
 * 서로 크게 달라서, 셋만 있어도 「여러 대가 다닌다」로 읽힌다.
 *
 * 치수는 **반입할 때 이미 맞춰 두었다.** 원본 Meshy 출력은 폭 2.3~3.3m로
 * 차선(`TRAFFIC.laneOffset` 1.6 → 마주 오는 차와 1.2m)에 안 들어갔고, 미니버스는
 * 상점 차양보다 높았다. 런타임에서 눌러 맞추면 그 배율이 코드 세 군데에 흩어지고
 * 어느 하나가 낡는다 — 그래서 정점을 미리 눌러 넣었고, 여기 적힌 수는 **파일이
 * 실제로 그 크기라는 기록**이다(`tests/trafficFleet.test.ts`가 대조한다).
 */

export interface VehicleModel {
  /** `public/` 아래 경로. 받는 일은 `scene/modelCache.ts`가 한다 */
  readonly url: string;
  readonly label: string;
  /** 진행 축(+Z) 길이. 전조등을 코앞에 붙이는 데 쓴다 */
  readonly length: number;
  /** 차선 폭 검사가 보는 값 */
  readonly width: number;
  readonly height: number;
  /** 전조등을 다는 높이(바닥에서) */
  readonly beamY: number;
}

/**
 * 세 차종.
 *
 * 바닥이 y=0에 오고 앞이 +Z를 보도록 반입해 두었다. 그래서 런타임에서 하는
 * 일은 자리와 yaw뿐이고, 배율은 손대지 않는다 — 배율을 만지기 시작하면
 * 「모델이 실제로 몇 미터인가」가 코드에서 사라진다.
 */
export const VEHICLE_MODELS: readonly VehicleModel[] = [
  {
    url: "/models/traffic-compact-car.glb",
    label: "소형 승용차",
    length: 3.6,
    width: 1.7,
    height: 1.5,
    beamY: 0.55,
  },
  {
    url: "/models/traffic-city-minibus.glb",
    label: "시내 미니버스",
    length: 5.2,
    width: 2.1,
    height: 2.6,
    beamY: 0.9,
  },
  {
    url: "/models/traffic-delivery-van.glb",
    label: "동네 배달 밴",
    length: 4.2,
    width: 1.9,
    height: 2.1,
    beamY: 0.82,
  },
] as const;

/** 차마다 뽑는 난수의 폭. 이 값 하나가 차종과 색을 함께 정한다 */
export const CAR_TONE_COUNT = 6;

/**
 * 톤 → 차종.
 *
 * 여섯 중 넷이 승용차다. 실제 도로가 그렇고, 무엇보다 **미니버스가 흔하면 안
 * 된다** — 5.2m짜리가 차선에 줄지어 서면 차간 거리(`followGap` 8m)를 거의 다
 * 채워서 도로가 막힌 것처럼 보인다.
 */
const MODEL_FOR_TONE = [0, 0, 0, 0, 1, 2] as const;

export function modelIndexForTone(tone: number): number {
  return MODEL_FOR_TONE[((tone % CAR_TONE_COUNT) + CAR_TONE_COUNT) % CAR_TONE_COUNT];
}

/**
 * 차마다 곱하는 색.
 *
 * **덧칠이 아니라 곱셈이다.** 모델은 알베도에 산호색·청록·크림·검정이 이미
 * 칠해져 있어서(Meshy 출력이 그대로 셀 셰이딩 팔레트다), 예전처럼 차체 색을
 * 통째로 지정하면 창문과 타이어까지 한 색이 된다.
 *
 * 그래서 흰색 근처만 쓴다. 검정은 검정으로 남고 크림만 살짝 기울어서, 같은
 * 승용차 넷이 줄지어 달려도 **같은 차 넷**으로는 안 보인다.
 *
 * 예전 `MOVING_CAR_PALETTE`가 갓길 주차 색과 계열을 맞춘 것과 같은 뜻인데,
 * 이제 맞출 대상이 모델의 알베도라 값이 흰색 쪽으로 옮겨 왔다.
 */
export const CAR_TINTS = [
  "#ffffff",
  "#ffe6dc",
  "#dcecff",
  "#e6ffe8",
  "#fff4d6",
  "#ece0ff",
] as const;

export function tintForTone(tone: number): string {
  return CAR_TINTS[((tone % CAR_TINTS.length) + CAR_TINTS.length) % CAR_TINTS.length];
}

/**
 * 차를 차종별로 나눈다 — 인스턴싱은 한 모델에 하나씩이라 미리 갈라 둔다.
 *
 * 돌려주는 것은 **원래 배열에서의 자리**다. 주행 계산은 여전히 한 배열로
 * 돌아가고(같은 차선의 앞차를 찾아야 한다), 나뉘는 것은 그리는 쪽뿐이다.
 */
export function partitionFleet(tones: readonly number[]): number[][] {
  const groups: number[][] = VEHICLE_MODELS.map(() => []);
  tones.forEach((tone, index) => {
    groups[modelIndexForTone(tone)].push(index);
  });
  return groups;
}

/**
 * 한 대의 자세 — 주행 쪽이 쓰고 그리는 쪽이 읽는다.
 *
 * 이 저장소가 매 프레임 값을 넘기는 방식이다. `setState`로 올리면 초당 60회
 * 리렌더가 된다.
 *
 * `y`는 **바퀴가 닿는 땅**이다. 상자 시절에는 차체 중심(`bodyCenterY`)이었는데,
 * 모델은 바닥이 원점에 오도록 반입해서 중심을 따로 셀 필요가 없어졌다.
 */
export interface CarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  visible: boolean;
}

export function createPoses(count: number): CarPose[] {
  return Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, yaw: 0, visible: false }));
}
