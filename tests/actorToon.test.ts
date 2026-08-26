import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

/*
 * 액터도 도시와 같은 음영을 쓰는가.
 *
 * 도시는 진작 4단 셀 셰이딩이었는데 캐릭터·적·차량·시민은 Lambert였다.
 * City.tsx가 주석으로 걱정해 둔 상태 — *"건물만 계단이고 소품은 매끈하면
 * 소품이 다른 게임에서 온 것처럼 떠 보인다"* — 가 실제로 화면에서 벌어지고
 * 있었고, 3인칭이라 그 차이가 화면 한가운데에 늘 있었다.
 */

const sources = collectSources("src/game").filter((path) => path.endsWith(".tsx"));

describe("음영이 한 계열인가", () => {
  it("Lambert가 남아 있지 않다", () => {
    const offenders = sources.filter((path) => readCode(path).includes("meshLambertMaterial"));
    expect(offenders, `Lambert가 남은 파일:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("조명을 받는 액터가 공용 툰 재질을 쓴다", () => {
    /*
     * 파일마다 `getToonGradientTexture()`를 부르고 useMemo로 감싸는 코드를
     * 여덟 번 반복하지 않는다 — 한 곳이 빠지면 그 액터만 매끈해진다.
     */
    const actors = [
      "src/game/player/Character.tsx",
      "src/game/player/RiddenVehicle.tsx",
      "src/game/dokebi/CompanionLantern.tsx",
      "src/game/dokebi/Shrine.tsx",
      "src/game/combat/Boss.tsx",
      "src/game/combat/Enemies.tsx",
      "src/game/world/Traffic.tsx",
      "src/game/world/Crowd.tsx",
    ];

    for (const path of actors) {
      const code = readCode(path);
      expect(code, `${path}에 ToonMaterial이 없다`).toContain("<ToonMaterial");
      expect(code, `${path}가 ToonMaterial을 import하지 않는다`).toContain(
        'from "@/game/scene/ToonMaterial"',
      );
    }
  });

  it("공용 재질이 도시와 같은 그라데이션 맵을 쓴다", () => {
    // 따로 만들면 단수가 갈라져 액터만 다른 계단을 갖는다
    const shared = readFileSync("src/game/scene/ToonMaterial.tsx", "utf8");
    expect(shared).toContain("getToonGradientTexture");
  });
});

describe("GLB 액터", () => {
  /*
   * 툰·림라이트·외곽선은 `toonModel.ts`가 정본이다. 대장도 GLB가 되면서
   * **두 벌이 될 참**이었고, 그러면 한쪽만 고쳐져 주인공은 셀 셰이딩인데
   * 대장만 매끈해지는 날이 온다.
   */
  const model = readFileSync("src/game/scene/toonModel.ts", "utf8");

  it("불러온 재질을 툰으로 갈아 끼운다", () => {
    // 주인공만 PBR로 남으면 화면 한가운데가 다른 게임이 된다
    expect(model).toContain("MeshToonMaterial");
    expect(model).toContain("getToonGradientTexture");
  });

  it("텍스처를 물려받는다", () => {
    // 색만 옮기면 얼굴과 옷 무늬가 사라져 단색 인형이 된다
    expect(model).toContain("map: source.map");
  });

  it("갈아 끼운 원본 재질을 놓는다", () => {
    // GLB는 한 번 로드해 계속 쓴다 — 놓지 않으면 그대로 남는다
    expect(model).toContain("source.dispose()");
  });

  it("셰이더 chunk 이름이 현재 three의 것이다", () => {
    /*
     * `output_fragment`는 three r152에서 `opaque_fragment`로 바뀌었다.
     * 옛 이름으로 `replace`하면 **아무 일도 일어나지 않고 그대로 컴파일된다**
     * — 셰이더는 멀쩡하고 림라이트만 사라진다. 화면을 아주 유심히 보지 않으면
     * 모른다.
     */
    expect(model).toContain("#include <opaque_fragment>");
    expect(model, "옛 chunk 이름이 남아 있다").not.toContain("#include <output_fragment>");
  });

  it("three의 toon 셰이더에 그 chunk가 실제로 있다", () => {
    /*
     * 우리 소스만 보는 검사는 반쪽이다. 이름을 정하는 쪽은 three이고,
     * 버전을 올릴 때 바뀌면 우리 문자열은 그대로인 채 효과만 사라진다.
     * **계약의 양쪽을 대조한다.**
     */
    const toon = THREE.ShaderLib.toon.fragmentShader;
    expect(toon, "three의 toon 셰이더가 비어 있다").toBeTruthy();
    expect(
      toon,
      "three가 chunk 이름을 바꿨다 — CharacterModel의 replace 대상이 맞지 않는다",
    ).toContain("#include <opaque_fragment>");
  });

  it("림라이트가 노멀과 시선을 모두 쓴다", () => {
    // 하나만 쓰면 가장자리가 아니라 그냥 밝기 한 겹이 된다
    expect(model).toContain("vNormal");
    expect(model).toContain("vViewPosition");
  });
});
