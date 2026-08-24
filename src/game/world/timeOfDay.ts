/**
 * 시간대 프리셋 — 순수 데이터와 계산.
 *
 * 같은 도시라도 빛이 바뀌면 다른 곳이 된다. 포토 모드에서 시간대를 고를 수
 * 있으면 한 장소로 네 장의 다른 사진이 나온다.
 *
 * **후처리 필터가 아니라 실제 조명을 바꾼다.** 캔버스에 CSS 필터를 씌우면
 * 화면은 변하지만 `toBlob`으로 저장한 사진에는 남지 않는다 — 보이는 것과
 * 저장되는 것이 달라지는 편이 훨씬 나쁘다.
 *
 * three.js에 의존하지 않는다. 색과 각도만 들고 있고 조명 노드는 City가 만든다.
 */

export type TimeOfDayId = "dawn" | "noon" | "sunset" | "night";

export interface TimeOfDayPreset {
  id: TimeOfDayId;
  /** 화면에 띄우는 이름 */
  name: string;
  /** 하늘과 안개 색. 둘을 같게 두어야 먼 곳이 안개 속으로 자연스럽게 사라진다 */
  sky: string;
  /** 반구광 — 위(하늘빛) / 아래(지면 반사광) */
  /**
   * 하늘 돔 꼭대기 색.
   *
   * `sky` 하나로 배경·안개를 겸하던 것을 나눈다 — 한 색이면 하늘이 페인트를
   * 칠한 판이 되고, 그게 이 화면과 실제 도깨비 트레일러를 가르는 큰 차이였다.
   * 지평선 색은 `sky`가 그대로 맡는다(안개와 같아야 먼 건물이 자연스럽게
   * 사라진다 — 아래 sky 주석).
   */
  skyTop: string;
  /**
   * 구름 양(0~1). 0이면 구름을 그리지 않는다.
   *
   * 밤에는 낮추어야 한다 — 어두운 하늘에 흰 구름이 그대로 떠 있으면 종잇장을
   * 붙인 것처럼 보인다.
   */
  cloudiness: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  /** 주광. 밤에는 달빛이다 */
  sunColor: string;
  sunIntensity: number;
  /** 주광 고도(rad). 0이 지평선, PI/2가 머리 위 */
  sunElevation: number;
  /** 주광 방위(rad) */
  sunAzimuth: number;
  /** 반대편 보조광 — 그림자 쪽이 완전히 죽지 않게 한다 */
  fillColor: string;
  fillIntensity: number;
  /**
   * 카메라 쪽에서 비추는 보조광의 세기.
   *
   * 다른 광원은 전부 월드 고정 방향이라, 플레이어가 어느 쪽을 보느냐에 따라
   * **카메라가 보는 면이 통째로 죽는다.** 밤에 재 보니 후드와 먼 보도블록의
   * 명암비가 1.03이었다 — 자기 캐릭터가 배경에 완전히 묻힌다.
   *
   * 낮에는 필요 없다(0). 어두운 시간대에만 바닥을 깔아 준다.
   */
  cameraFillIntensity: number;
  /**
   * 도시가 스스로 빛나는 정도(0~1). 창문·가로등·전조등이 함께 쓴다.
   *
   * 한낮에도 0이 아니다 — 완전히 0이면 창이 벽과 같은 평면으로 눌려 건물이
   * 밋밋해진다. 아주 약하게 남겨 유리라는 것만 읽히게 한다.
   */
  nightGlow: number;
}

/*
 * 광량에 대하여 — 값이 예전의 절반인 이유.
 *
 * 톤매핑(ACES)을 끄면서 전부 다시 잡았다. 켜져 있을 때는 합이 2를 넘어도
 * 곡선이 눌러 주었지만, 끈 지금은 1을 넘는 만큼이 그대로 흰색으로 날아간다.
 * 세기를 그대로 두고 톤매핑만 끄면 도시가 하얗게 탄다 — 실제로 그랬다.
 *
 * 대신 얻은 것이 카툰 룩의 전제다: 벽에 칠한 색이 화면에 그 색으로 나온다.
 */
export const TIME_OF_DAY: Record<TimeOfDayId, TimeOfDayPreset> = {
  dawn: {
    id: "dawn",
    name: "여명",
    sky: "#e9c3c6",
    skyTop: "#b9a6cf",
    cloudiness: 0.5,
    hemisphereSky: "#ffe3d4",
    hemisphereGround: "#4b4a63",
    hemisphereIntensity: 0.42,
    sunColor: "#ffd9b0",
    sunIntensity: 0.72,
    // 갓 떠오른 해라 낮게 깔린다. 그림자가 길어야 아침으로 읽힌다.
    sunElevation: 0.24,
    sunAzimuth: 1.15,
    fillColor: "#8fb8ff",
    fillIntensity: 0.2,
    cameraFillIntensity: 0.08,
    nightGlow: 0.42,
  },
  noon: {
    id: "noon",
    name: "한낮",
    sky: "#7fc4f5",
    skyTop: "#2f7fd8",
    cloudiness: 0.72,
    hemisphereSky: "#dff3ff",
    /*
     * 아래에서 올라오는 빛을 푸르게 든다.
     *
     * 회색(#5a5f6b)이면 그늘이 그냥 어두워지기만 한다. 하늘빛이 반사되어
     * 돌아오는 색을 넣어야 **그늘에서도 벽 색이 남는다** — 밝은 대낮 룩의
     * 절반은 해가 아니라 이 그늘 색이다.
     */
    hemisphereGround: "#a8bcd8",
    /*
     * 그늘의 밝기다. 해를 올리면 밝은 면이 날아가지만(톤매핑을 껐다),
     * 이 값은 **그늘만** 들어 올린다.
     *
     * 참고하는 트레일러의 한낮 화면과 이쪽을 나란히 놓고 보면 가장 큰 차이가
     * 해가 아니라 **그늘**이었다 — 저쪽 그늘에는 하늘빛이 가득 차 있는데
     * 이쪽 그늘은 검게 눌려 있었다. 나무 그늘이 도로를 덮으면 그 자리가
     * 통째로 사라져 보였다.
     */
    hemisphereIntensity: 0.9,
    sunColor: "#fff6e2",
    sunIntensity: 1.42,
    // 머리 위에 가까워 그림자가 짧다.
    sunElevation: 1.15,
    sunAzimuth: 2.4,
    fillColor: "#b9d4ff",
    fillIntensity: 0.22,
    cameraFillIntensity: 0,
    nightGlow: 0.06,
  },
  sunset: {
    id: "sunset",
    name: "노을",
    sky: "#f0a06a",
    skyTop: "#8f6fb8",
    cloudiness: 0.55,
    hemisphereSky: "#ffd9a8",
    hemisphereGround: "#4a3f5c",
    hemisphereIntensity: 0.48,
    sunColor: "#ffb066",
    sunIntensity: 0.95,
    // 기존 방향 (0.7, 0.9, -0.5)을 고도·방위로 옮긴 값이다.
    sunElevation: 0.8082,
    sunAzimuth: 2.191,
    fillColor: "#7fd4ff",
    fillIntensity: 0.2,
    cameraFillIntensity: 0.07,
    nightGlow: 0.2,
  },
  night: {
    id: "night",
    name: "밤",
    sky: "#1b2140",
    skyTop: "#0b0f24",
    cloudiness: 0.18,
    hemisphereSky: "#4a5a8f",
    hemisphereGround: "#141a2e",
    hemisphereIntensity: 0.24,
    sunColor: "#9fb8ff",
    sunIntensity: 0.26,
    sunElevation: 0.75,
    sunAzimuth: -1,
    // 밤의 보조광만 따뜻하다 — 도시의 간판빛이 아래에서 올라오는 셈이다.
    fillColor: "#ff8a5c",
    fillIntensity: 0.13,
    cameraFillIntensity: 0.24,
    nightGlow: 1,
  },
};

/** 순환 순서. 하루가 흐르는 순서대로 둔다 */
export const TIME_OF_DAY_ORDER: readonly TimeOfDayId[] = ["dawn", "noon", "sunset", "night"];

/**
 * 기본값은 한낮이다.
 *
 * 오래 노을이 기본이었다 — 만들어 온 화면이 그 빛이었기 때문이다. 그런데
 * 노을은 **모든 것을 주황 한 겹으로 덮는다.** 파사드를 크림·민트·코랄·라벤더로
 * 갈라 놓아도 화면에서는 전부 같은 주황으로 읽히고, 그늘은 갈색으로 눌린다.
 * 색으로 화면을 지탱하기로 한 이상 기본은 색이 가장 안 뭉개지는 시간대여야
 * 한다. 노을은 시간대 전환(T)으로 그대로 남아 있다.
 */
export const DEFAULT_TIME_OF_DAY: TimeOfDayId = "noon";

/** 다음 시간대. 마지막이면 처음으로 돌아온다 */
export function nextTimeOfDay(id: TimeOfDayId): TimeOfDayId {
  const index = TIME_OF_DAY_ORDER.indexOf(id);
  // 모르는 값이 들어오면 기본값으로 되돌린다 — 저장된 설정이 깨져도 화면은 나와야 한다.
  if (index < 0) return DEFAULT_TIME_OF_DAY;
  return TIME_OF_DAY_ORDER[(index + 1) % TIME_OF_DAY_ORDER.length];
}

/**
 * 프리셋을 안전하게 꺼낸다. 모르는 id면 기본값.
 *
 * `??`만 쓰면 **프로토타입의 것이 딸려 나와** 안전하지 않았다 —
 * `timeOfDayPreset("constructor")`가 `Object` 함수를 돌려줬고, 호출부가
 * 읽는 `sky`는 undefined였다. 「모르는 id면 기본값」이라는 이 함수의
 * 약속이 그 자리에서 깨진다. 자기 것만 본다.
 */
export function timeOfDayPreset(id: string): TimeOfDayPreset {
  return Object.hasOwn(TIME_OF_DAY, id)
    ? TIME_OF_DAY[id as TimeOfDayId]
    : TIME_OF_DAY[DEFAULT_TIME_OF_DAY];
}

/**
 * 고도·방위를 좌표로 편다.
 *
 * 거리는 방향광에 영향을 주지 않지만 그림자 카메라의 범위에는 영향을 준다 —
 * 월드 크기에 비례해 잡는다.
 */
export function sunPosition(
  preset: TimeOfDayPreset,
  radius: number,
): { x: number; y: number; z: number } {
  const horizontal = Math.cos(preset.sunElevation) * radius;
  return {
    x: horizontal * Math.sin(preset.sunAzimuth),
    y: Math.sin(preset.sunElevation) * radius,
    z: horizontal * Math.cos(preset.sunAzimuth),
  };
}
