import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CAR_TINTS,
  CAR_TONE_COUNT,
  createPoses,
  modelIndexForTone,
  partitionFleet,
  tintForTone,
  VEHICLE_MODELS,
} from "@/game/world/trafficFleet";
import { buildTraffic, TRAFFIC } from "@/game/world/trafficLayout";

/*
 * 배경 차량 모델이 도로에 맞는가.
 *
 * 여기서 지키려는 것은 **적어 둔 치수와 파일이 같은 말을 하는가**다. 코드는
 * 모델을 배율 1로 세운다 — 파일이 곧 크기다. 그래서 파일이 바뀌면(다시 반입하면)
 * 차가 조용히 차선을 넘거나 차양을 뚫는데, 화면을 안 보면 알 수 없다.
 *
 * 실제로 첫 반입이 그랬다. 길이만 맞추고 넣었더니 폭이 2.3~3.3m로 나왔고,
 * 마주 오는 차와의 간격이 1.2m뿐이라 **두 차가 겹친 채로 지나갔다.**
 */

/**
 * GLB에서 실제 크기를 잰다.
 *
 * 전체를 파싱하지 않고 JSON 청크만 읽는다(`bossClips.test.ts`와 같은 방식).
 * 반입 때 `quantize`를 걸어서 정점이 정규화 정수로 저장돼 있고 실제 크기는
 * 노드 배율에 들어 있다 — 둘을 곱해야 미터가 된다.
 */
function measure(path: string) {
  const buf = readFileSync(path);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));

  const node = json.nodes[0];
  const primitive = json.meshes[0].primitives[0];
  const position = json.accessors[primitive.attributes.POSITION];
  const indices = json.accessors[primitive.indices];

  // 정규화 SHORT는 값을 32767로 나눈 것이 실제 좌표다
  const unit = position.componentType === 5122 ? 32767 : 1;
  const span = (axis: number) =>
    ((position.max[axis] - position.min[axis]) / unit) * node.scale[axis];

  return {
    width: span(0),
    height: span(1),
    length: span(2),
    floor: (position.min[1] / unit) * node.scale[1] + node.translation[1],
    meshes: json.meshes.length,
    materials: json.materials.length,
    triangles: indices.count / 3,
  };
}

describe("모델이 적어 둔 치수와 같은가", () => {
  for (const model of VEHICLE_MODELS) {
    const measured = measure(`public${model.url}`);

    it(`${model.label}의 크기가 표와 맞는다`, () => {
      /*
       * 배율 1로 세우므로 파일이 곧 크기다. 어긋나면 표를 고칠 것이 아니라
       * **다시 반입해야** 한다 — 런타임에서 눌러 맞추기 시작하면 「모델이 실제로
       * 몇 미터인가」가 코드에서 사라진다.
       */
      expect(measured.length, `길이 ${measured.length.toFixed(2)}m`).toBeCloseTo(model.length, 1);
      expect(measured.width, `폭 ${measured.width.toFixed(2)}m`).toBeCloseTo(model.width, 1);
      expect(measured.height, `높이 ${measured.height.toFixed(2)}m`).toBeCloseTo(model.height, 1);
    });

    it(`${model.label}이 땅에 붙어 선다`, () => {
      // 자세의 y가 지면이다. 바닥이 원점에서 떠 있으면 차가 공중에 뜬다
      expect(Math.abs(measured.floor), `바닥 ${measured.floor.toFixed(3)}m`).toBeLessThan(0.05);
    });

    it(`${model.label}이 마주 오는 차와 안 겹친다`, () => {
      /*
       * 차선 중심이 도로 중심선 ±`laneOffset`이므로 두 차선 사이는 그 두 배다.
       * 차체 폭의 절반씩을 빼고도 남아야 지나갈 수 있다.
       */
      const gap = TRAFFIC.laneOffset * 2 - measured.width;
      expect(gap, `${model.label} 간격 ${gap.toFixed(2)}m`).toBeGreaterThan(0.3);
    });

    it(`${model.label}이 한 메시·한 재질이다`, () => {
      // 인스턴싱은 지오메트리 하나·재질 하나를 가져간다. 쪼개져 있으면 첫 조각만 선다
      expect(measured.meshes, `메시 ${measured.meshes}개`).toBe(1);
      expect(measured.materials, `재질 ${measured.materials}개`).toBe(1);
    });

    it(`${model.label}이 삼각형 예산 안이다`, () => {
      /*
       * ASSET_PLAN 5절이 배경 차량에 준 것은 800~1,500이다. 지금은 1,778~1,988로
       * 조금 넘는데, 더 줄이면 지붕 곡면이 각지기 시작한다.
       *
       * 상한을 2,500으로 둔다 — 단순화를 빼먹고 반입하면(첫 시도가 8,220이었다)
       * 걸린다. 36대가 도는 자리라 한 대의 초과가 서른여섯 배가 된다.
       */
      expect(measured.triangles, `${measured.triangles}삼각형`).toBeLessThan(2500);
    });

    it(`${model.label}의 전조등이 차 안에 붙는다`, () => {
      expect(model.beamY).toBeGreaterThan(0);
      expect(model.beamY, `beamY ${model.beamY} / 높이 ${model.height}`).toBeLessThan(model.height);
    });
  }
});

describe("차종을 어떻게 나누는가", () => {
  it("모든 톤이 차종을 얻는다", () => {
    for (let tone = 0; tone < CAR_TONE_COUNT; tone += 1) {
      const index = modelIndexForTone(tone);
      expect(VEHICLE_MODELS[index], `톤 ${tone}에 차종이 없다`).toBeTruthy();
    }
  });

  it("세 차종이 모두 쓰인다", () => {
    /*
     * 하나라도 안 쓰이면 받기만 하고 안 세우는 100KB다. 셋을 들인 이유가
     * 실루엣을 섞는 것이라, 하나가 빠지면 들인 뜻이 절반 사라진다.
     */
    const used = new Set(
      Array.from({ length: CAR_TONE_COUNT }, (_, tone) => modelIndexForTone(tone)),
    );
    expect(used.size, `쓰이는 차종 ${used.size}종`).toBe(VEHICLE_MODELS.length);
  });

  it("승용차가 가장 흔하다", () => {
    /*
     * 5.2m짜리 미니버스가 흔하면 차간 거리(`followGap` 8m)를 거의 다 채워서
     * 도로가 막힌 것처럼 보인다.
     */
    const counts = VEHICLE_MODELS.map(
      (_, index) =>
        Array.from({ length: CAR_TONE_COUNT }, (_, tone) => modelIndexForTone(tone)).filter(
          (picked) => picked === index,
        ).length,
    );
    expect(counts[0], `승용차 ${counts[0]}/${CAR_TONE_COUNT}`).toBeGreaterThan(CAR_TONE_COUNT / 2);
  });

  it("톤이 범위를 벗어나도 고른다", () => {
    // 배치 쪽이 난수 폭을 바꾸면 여기로 흘러든다. 빈 칸이 나오면 그 차가 안 선다
    for (const tone of [-1, -7, CAR_TONE_COUNT, 99]) {
      expect(VEHICLE_MODELS[modelIndexForTone(tone)], `톤 ${tone}`).toBeTruthy();
      expect(tintForTone(tone), `톤 ${tone}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("곱하는 색이라 어두운 것이 없다", () => {
    /*
     * 모델 알베도에 이미 색이 칠해져 있어서 이 값은 **곱해진다.** 어두운 값을
     * 넣으면 차가 통째로 탁해진다 — 예전처럼 차체 색을 지정하는 것이 아니다.
     */
    for (const tint of CAR_TINTS) {
      const channels = [1, 3, 5].map((at) => Number.parseInt(tint.slice(at, at + 2), 16));
      expect(Math.min(...channels), `${tint}가 어둡다`).toBeGreaterThan(0xd0);
    }
  });
});

describe("나눈 뒤에도 다 세는가", () => {
  const plan = buildTraffic(120, TRAFFIC.maxCars);
  const groups = partitionFleet(plan.cars.map((car) => car.tone));
  const flat = groups.flat();

  it("한 대도 빠지지 않는다", () => {
    // 빠진 차는 주행 계산은 되는데 화면에 없다 — 앞차만 있고 보이지 않는 벽이 된다
    expect(flat.length, `나눈 ${flat.length}대 / 전체 ${plan.cars.length}대`).toBe(
      plan.cars.length,
    );
    expect(new Set(flat).size).toBe(plan.cars.length);
  });

  it("차종마다 자기 것만 가진다", () => {
    groups.forEach((slots, index) => {
      for (const car of slots) {
        expect(modelIndexForTone(plan.cars[car].tone), `${car}번 차가 남의 무리에 있다`).toBe(
          index,
        );
      }
    });
  });

  it("자세 배열이 전체 대수만큼이다", () => {
    // 나눈 결과는 이 배열의 **자리**를 가리킨다. 짧으면 뒤쪽 차가 undefined가 된다
    const poses = createPoses(plan.cars.length);
    expect(poses.length).toBe(plan.cars.length);
    expect(
      poses.every((pose) => !pose.visible),
      "처음부터 보이면 원점에 한 무더기가 선다",
    ).toBe(true);
  });
});
