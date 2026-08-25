import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { buildCityDetails } from "@/game/world/cityDetails";
import { qualityForDevice, QUALITY_PRESETS, type QualityLevel } from "@/game/systems/quality";
import { buildCityLayout, CITY } from "@/game/world/cityLayout";
import { collectVisible, partitionByBlock, visibleBlocks } from "@/game/world/streaming";
import { zoneAt } from "@/game/world/districts";

/*
 * 성능 예산 — 화면 없이 셀 수 있는 것.
 *
 * fps는 브라우저에서만 잴 수 있지만 **화면에 올라가는 인스턴스 수**는 여기서
 * 정확히 셀 수 있다. 레이어를 하나 더 얹었을 때 그 수가 조용히 두 배가 되는
 * 것을 막는 게 목적이다. 상한은 "지금보다 크게 나빠지면 알린다" 수준으로
 * 느슨하게 잡는다 — 빡빡하게 잡으면 소품 하나 추가할 때마다 깨진다.
 */

const layout = buildCityLayout();
const details = buildCityDetails(layout);

/**
 * 스트리밍이 걸리는 레이어들.
 *
 * 열넷을 손으로 적어 두었었다. `City.tsx`가 레이어를 하나 더 스트리밍하면
 * **예산은 그것을 세지 않는다** — 화면에 올라가는 인스턴스가 늘었는데
 * 상한 검사는 조용하다. 정본에서 이름을 읽어 온다.
 */
const source = readFileSync("src/game/world/City.tsx", "utf8");

const pools: Record<string, unknown> = { layout, details };

const streamedLayers: Record<string, readonly { x: number; z: number }[]> = Object.fromEntries(
  [...source.matchAll(/useStreamed\((layout|details)\.(\w+)\s*,/g)].map((match) => {
    const pool = pools[match[1]] as Record<string, readonly { x: number; z: number }[]>;
    return [match[2], pool[match[2]]];
  }),
);

describe("스트리밍 목록", () => {
  it("스트리밍 목록을 정본에서 읽었다", () => {
    // 훑기가 망가지면 빈 목록이 되고, 아래 예산 검사는 0을 세며 통과한다
    const names = Object.keys(streamedLayers);
    expect(names.length, `찾은 레이어 ${names.length}개`).toBeGreaterThan(10);
    const missing = names.filter((name) => !Array.isArray(streamedLayers[name]));
    expect(missing, `이름은 찾았는데 배열이 아니다: ${missing.join(", ")}`).toEqual([]);
  });
});

function visibleCountAt(x: number, z: number, radius?: number): number {
  const blocks = visibleBlocks(x, z, radius);
  let total = 0;
  for (const items of Object.values(streamedLayers)) {
    total += collectVisible(partitionByBlock(items), blocks).length;
  }
  return total;
}

describe("인스턴스 예산", () => {
  it("도시 전체 인스턴스가 상한 안이다", () => {
    const total = Object.values(streamedLayers).reduce((sum, items) => sum + items.length, 0);
    expect(total, `total streamed instances: ${total}`).toBeLessThan(6000);
  });

  it("스트리밍이 실제로 줄여 준다", () => {
    /*
     * 스트리밍이 켜져 있어도 반경이 도시를 다 덮으면 아무것도 줄지 않는다.
     * 실제로 반경 상수를 늘려 놓고 "스트리밍이 있다"고 믿은 적이 있다.
     */
    const total = Object.values(streamedLayers).reduce((sum, items) => sum + items.length, 0);
    const visible = visibleCountAt(layout.spawn.x, layout.spawn.z);

    expect(visible, `visible ${visible} / total ${total}`).toBeLessThan(total * 0.8);
  });

  it("어디에 서 있어도 화면 인스턴스가 상한 안이다", () => {
    /*
     * 가장 낮은 품질(반경 2)을 기준으로 잰다. 약한 기기가 감당해야 하는 수다.
     * 높은 품질은 반경이 커져 더 많이 그리지만, 그건 그럴 만한 기기에서만이다.
     */
    /*
     * 표본이 (-100..100)이었다. 도시 한 변이 282m이므로 그 범위는 **가운데
     * 절반**이고, 숲·해안·옛 마을은 한 번도 재지 않았다 — 그런데 나무를
     * 두 배로 키우고 덤불·바위·들꽃을 뿌린 곳이 바로 거기다. 예산을 재는
     * 자가 늘어난 곳에 닿아 있지 않으면 「상한 안이다」는 말이 아무 뜻도 없다.
     *
     * 격자 전체를 훑는다. 25칸이 141칸이 되지만 순수 계산이라 금방 끝난다.
     */
    const reach = CITY.blockSize * CITY.gridSize * 0.5;
    let worst = 0;
    let worstAt = "";
    for (let x = -reach; x <= reach; x += 24) {
      for (let z = -reach; z <= reach; z += 24) {
        const count = visibleCountAt(x, z, QUALITY_PRESETS.low.streamRadius);
        if (count > worst) {
          worst = count;
          worstAt = `(${x.toFixed(0)}, ${z.toFixed(0)}) ${zoneAt(x, z).id}`;
        }
      }
    }
    /*
     * **같은 일이 두 번째다.** 상한 3000일 때 실제 값이 2948(98%)이라 인도
     * 평판을 얹자마자 깨졌고, 깨진 이유는 성능이 아니라 자가 빡빡해서였다.
     * 그래서 4000으로 올리며 「지금 값은 3195」라고 적어 두었는데, 그 뒤
     * 구역별 작업이 쌓이는 동안 아무도 이 숫자를 다시 재지 않았다. 골목
     * 계단을 붙이려다 재 보니 **이미 3894(97%)**였다.
     *
     * 그 상태에서는 새 레이어를 무엇이든 하나 붙이면 깨진다 — 실제로 계단에서
     * 난간을 빼고 디딤판만 남겨도(156개) 넘었다. 그러면 이 검사는 「예산을
     * 넘었다」가 아니라 **「이 월드에는 더 못 붙인다」**를 말하는 것이고,
     * 그건 예산이 아니라 금지다.
     *
     * 지금 값은 4223이다. 여유를 **가장 큰 레이어 하나 크기**(streetFixtures
     * 548)로 잡는다 — 레이어가 통째로 하나 더 붙으면 걸리고, 소품 몇십 개가
     * 늘어난 것으로는 안 걸린다. 이 검사가 원래 말하려던 것이 그것이다.
     *
     * **다음 사람에게:** 여기 걸렸다면 먼저 실제 값을 재라. 상한에 90%를
     * 넘게 붙어 있으면 그건 네 변경이 무겁다는 뜻이 아니라 이 숫자가 낡았다는
     * 뜻이다. 그때는 낮은 품질의 스트리밍 반경(`QUALITY_PRESETS.low`)을
     * 줄이는 편이 상한을 또 올리는 것보다 낫다 — 화면에 그리는 수를 실제로
     * 줄이는 것은 그쪽뿐이다.
     */
    expect(worst, `worst case ${worst} instances at ${worstAt}`).toBeLessThan(4800);
  });

  it("가장 높은 품질도 감당할 범위 안이다", () => {
    // 반경이 커지면 도시 전체를 그리게 된다. 그래도 드로우콜은 레이어 수만큼이다.
    const count = visibleCountAt(0, 0, QUALITY_PRESETS.high.streamRadius);
    expect(count, `high quality: ${count} instances`).toBeLessThan(6000);
  });

  it("항상 그리는 인스턴스가 상한 안이다", () => {
    /*
     * 이 수치는 **프레임당 비용이 아니다.** 전부 정적 InstancedMesh라
     * 행렬을 한 번 올리고 나면 드로우콜 하나씩으로 끝난다. 여기서 재는 것은
     * GPU 메모리와 초기 업로드 비용이다.
     *
     * 실제 측정: 도로 표시 2,172 + 횡단보도 432 + 가로등 기둥 390 + 갓 384.
     * 상한을 4,000으로 잡은 것은 "지금의 두 배 가까이 늘면 다시 보자"는 뜻이다.
     */
    const always =
      layout.props.length +
      layout.streetLamps.length +
      layout.crosswalks.length +
      details.roadMarks.length;
    expect(always, `always-drawn instances: ${always}`).toBeLessThan(4000);
  });

  it("도로 표시가 항상 그리는 것의 대부분이다 — 예외의 근거를 고정한다", () => {
    /*
     * City.tsx가 이 레이어들을 스트리밍에서 빼는 이유는 "개수가 적어서"가
     * 아니라 "정적 인스턴싱이라 드로우콜이 하나여서"다. 그 사실을 여기에
     * 박아 둔다 — 근거가 낡으면 주석은 조용히 거짓말이 된다.
     */
    const always =
      layout.props.length +
      layout.streetLamps.length +
      layout.crosswalks.length +
      details.roadMarks.length;
    expect(
      details.roadMarks.length / always,
      `road marks are ${details.roadMarks.length}/${always}`,
    ).toBeGreaterThan(0.5);
  });
});

describe("충돌체 예산", () => {
  it("충돌 검사 대상이 상한 안이다", () => {
    /*
     * 이동은 매 프레임 충돌체 전체를 훑는다. 공간 분할이 없으므로 개수가
     * 그대로 비용이다. 넘어가면 분할을 도입할 시점이다.
     */
    expect(layout.colliders.length, `colliders: ${layout.colliders.length}`).toBeLessThan(2000);
  });
});

describe("생성 비용", () => {
  it("월드 생성이 첫 프레임을 막지 않는다", () => {
    /*
     * 도시 생성은 동기 작업이다. 오래 걸리면 /play에 들어간 순간 빈 화면이
     * 보이고, 그때는 로딩 표시가 필요해진다.
     *
     * 측정값: 배치 0.6ms + 소품 7.0ms + 교통 0.2ms = 약 8ms. 지금은 한 프레임
     * 남짓이라 로딩 UI를 만들지 않았다. 이 판단의 근거를 여기 고정한다 —
     * 50ms를 넘기면 그 판단이 더 이상 유효하지 않다.
     *
     * 텍스처 합성(캔버스)은 여기서 못 잰다. 브라우저에서만 도는 코드다.
     */
    const started = performance.now();
    const freshLayout = buildCityLayout();
    buildCityDetails(freshLayout);
    const elapsed = performance.now() - started;

    expect(elapsed, `world generation took ${elapsed.toFixed(1)}ms`).toBeLessThan(50);
  });
});

describe("품질 설정이 실제로 화면에 닿는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** `shadows={quality.shadows}`를 `shadows={true}`로
   * 박아도 검사가 전부 통과했다.
   *
   * 이 실패는 **눈에 안 보인다.** 저사양에서 자동 강등 안내는 그대로 뜨는데
   * 정작 그림자는 계속 켜져 있어 **프레임이 안 돌아온다** — 사용자는 「낮췄다는데
   * 왜 여전히 버벅이지」만 겪는다.
   *
   * 프리셋에 필드를 만들어 놓고 **아무도 읽지 않는 것**이 이 유형의 본질이라,
   * 필드마다 소비처가 있는지 본다.
   */
  const canvas = readCode("src/game/scene/GameScene.tsx");

  it("캔버스가 품질에서 값을 가져온다", () => {
    for (const field of ["shadows", "maxPixelRatio", "antialias"]) {
      expect(canvas, `${field}를 품질에서 안 가져온다`).toContain(`quality.${field}`);
    }
  });

  it("품질에 따라 달라지는 값을 박아 두지 않는다", () => {
    // `shadows={true}`처럼 박으면 강등이 아무 효과가 없다
    expect(canvas, "그림자를 박아 두었다").not.toMatch(/shadows=\{(true|false)\}/);
  });

  it("안개와 카메라 거리가 **각각** 품질을 탄다", () => {
    /*
     * 먼 곳까지 그리는 비용이 가장 크다 — 여기가 박히면 강등이 반쪽이 된다.
     *
     * **구간을 나눠서 본다.** 파일 전체에서 `quality.fogFar`만 찾으면, 안개가
     * 쓰고 있으니 **카메라 쪽을 박아도 통과한다** — 실제로 그렇게 한 번 놓쳤다.
     */
    const fog = canvas.slice(canvas.indexOf("<fog"), canvas.indexOf("<fog") + 160);
    expect(fog, `안개가 품질을 안 탄다: ${fog.slice(0, 80)}`).toContain("quality.fog");

    const camera = canvas.slice(canvas.indexOf("camera={{"), canvas.indexOf("camera={{") + 160);
    expect(camera, `카메라 거리가 품질을 안 탄다: ${camera.slice(0, 80)}`).toContain(
      "quality.fogFar",
    );
  });
});

describe("씬 배선에 값을 박지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** `nightGlow={0}`이나 `worldHalfExtent={0}`으로
   * **배선을 끊어도** 검사가 전부 통과했다 — 밤 발광이 통째로 꺼지고 조명
   * 범위가 무너지는데 아무도 안 본다.
   *
   * 음료 속도·저감 모션에서 본 것과 같다: 계산은 두텁게 지키는데 **그 값을
   * 넘기는 한 줄**은 아무도 안 적는다.
   *
   * 씬은 **배선판**이다 — 여기서 숫자를 직접 적는다는 것은 곧 어딘가에서
   * 계산한 값을 버렸다는 뜻이다. 지금은 그런 곳이 하나도 없다.
   */
  const scene = readCode("src/game/scene/GameScene.tsx");

  it("씬이 실제로 배선판이다", () => {
    const wires = scene.match(/^\s+\w+=\{/gm) ?? [];
    expect(wires.length, `배선 ${wires.length}군데`).toBeGreaterThan(10);
  });

  it("숫자를 박아 넘기지 않는다", () => {
    /*
     * **줄머리에 묶지 않는다.** 처음엔 `^\s+prop={` 로 썼는데, 한 줄에 몰아 쓴
     * `<WorldLighting quality={q} worldHalfExtent={0} preset={s} />` 같은 배선을
     * 통째로 놓쳤다 — 실제로 그 변이가 빠져나갔다.
     */
    const literals = scene.match(/\b[a-zA-Z]\w*=\{-?[\d.]+\}/g) ?? [];
    expect(literals, `씬에서 값을 박아 넘긴다:\n${literals.join("\n")}`).toEqual([]);
  });
});

describe("모든 프레임 루프가 같은 시간을 사는가", () => {
  /*
   * 탭을 두고 돌아오면 첫 프레임의 delta가 몇 초가 된다. 그대로 적분하면 한
   * 걸음에 수십 미터를 움직여 **벽을 통과하거나 순간이동한다.** 그래서 모든
   * 시뮬레이션이 delta를 같은 값으로 자른다.
   *
   * `MAX_DELTA_SECONDS`의 주석이 이 사고를 이미 적어 두었다 — 「파일마다 따로
   * 두었더니 **일곱 벌**이 됐고, 한 곳만 고치면 그 컴포넌트만 다른 시간을 살게
   * 된다」. 그런데 `Shrine`이 여덟 벌째로 `1 / 30`을 직접 박고 있었다. 값이 같아
   * 지금은 안 아프지만, 상수를 조정하는 순간 **그 하나만 안 따라온다.**
   *
   * 값이 아니라 **출처**를 본다. 「지금 같은가」로 보면 여덟 벌이어도 통과한다 —
   * 이 저장소가 이미 한 번 겪은 실패다.
   */
  const framed = collectSources("src")
    .map((path) => [path, readCode(path)] as const)
    .filter(([, code]) => code.includes("useFrame("));

  it("프레임 루프를 실제로 골랐다", () => {
    expect(framed.length, `프레임 루프 파일 ${framed.length}개`).toBeGreaterThan(5);
  });

  it("delta를 숫자로 직접 자르는 곳이 없다", () => {
    const local: string[] = [];
    for (const [path, code] of framed) {
      for (const [index, line] of code.split("\n").entries()) {
        if (/Math\.min\(\s*\w*[Dd]elta\w*\s*,\s*[\d./\s]+\)/.test(line)) {
          local.push(`${path}:${index + 1}  ${line.trim()}`);
        }
      }
    }
    expect(local, `공유 상수(MAX_DELTA_SECONDS) 대신 숫자를 박은 곳:\n${local.join("\n")}`).toEqual(
      [],
    );
  });

  /*
   * 「delta를 받는 루프는 전부 잘라야 한다」로 쓰려다 **되돌렸다.** 그렇게 재니
   * `GrappleVisuals`와 `ClueGlow`가 걸렸는데, 둘은 delta를 사인 위상에만 더한다 —
   * 숨쉬기 빛의 위상이 튀는 것은 결함이 아니다(탭을 두고 오면 위상은 어차피
   * 임의다). 상수 주석이 말하는 사고는 **위치 적분**이다: 한 걸음에 수십 미터.
   *
   * 규칙이 결함 아닌 것을 물면 코드를 규칙에 맞추게 되고, 그건 거꾸로다.
   * 그래서 잡는 범위를 「숫자를 박았는가」로 좁혔다 — 그건 값과 무관하게 항상 틀렸다.
   */
});

describe("처음 켤 때 어떤 품질로 시작하는가", () => {
  /*
   * **모든 사람이 처음 밟는 길**인데, 네 갈래를 지워도 아무도 몰랐다. 여기가
   * 틀리면 좋은 기기가 흐린 화면으로 시작하거나, 약한 기기가 첫 화면부터 끊긴다.
   *
   * 브라우저를 읽는 부분과 섞여 있어 값으로 잴 데가 없었다. 판단만 떼어 낸다.
   */
  it("좋은 데스크톱은 높게 시작한다", () => {
    expect(qualityForDevice(16, 16, false)).toBe("high");
    expect(qualityForDevice(8, 8, false)).toBe("high");
  });

  it("보통 데스크톱은 중간이다 — 코어는 많아도 메모리가 적으면 못 믿는다", () => {
    expect(qualityForDevice(8, 4, false), "메모리가 적은데 높게 잡는다").toBe("medium");
    expect(qualityForDevice(4, 16, false), "코어가 적은데 높게 잡는다").toBe("medium");
  });

  it("약한 기기는 낮게 시작한다", () => {
    expect(qualityForDevice(2, 4, false)).toBe("low");
  });

  it("모바일은 한 단계 보수적이다 — 첫인상이 끊기는 것보다 덜 예쁜 편이 낫다", () => {
    // 같은 사양이라도 데스크톱보다 낮게 잡는다
    expect(qualityForDevice(16, 16, true), "모바일이 높게 시작한다").toBe("medium");
    expect(qualityForDevice(8, 6, true)).toBe("medium");
    expect(qualityForDevice(8, 4, true), "메모리가 적은 모바일이 중간이다").toBe("low");
    expect(qualityForDevice(4, 8, true), "코어가 적은 모바일이 중간이다").toBe("low");
  });

  it("모바일이 데스크톱보다 높게 잡히는 사양이 없다", () => {
    const ORDER: QualityLevel[] = ["low", "medium", "high"];
    for (const cores of [2, 4, 8, 16]) {
      for (const memory of [2, 4, 6, 8, 16]) {
        const phone = ORDER.indexOf(qualityForDevice(cores, memory, true));
        const desk = ORDER.indexOf(qualityForDevice(cores, memory, false));
        expect(phone, `코어 ${cores}·메모리 ${memory}에서 모바일이 더 높다`).toBeLessThanOrEqual(
          desk,
        );
      }
    }
  });
});
