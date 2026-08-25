import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/*
 * 캐릭터가 걷는 방향을 향하는가.
 *
 * 오래 **문워크**를 하고 있었다. 이동·회전 계산은 처음부터 옳았고
 * (`facing`이 매 프레임 속도 방향과 정확히 일치한다), 그 값은 씬의 그룹에도
 * 제대로 실렸다. 틀린 것은 마지막 한 줄이었다 — GLB에 `rotation={[0, π, 0]}`
 * 보정을 걸어 두어서, 모델이 **자기 등 방향으로** 걸었다.
 *
 * 앞으로 갈 때는 얼굴이 카메라를 보고, 뒤로 갈 때는 등을 보인 채 다가온다.
 * 「뒤로 가면 사람이 안 돌아선다」는 그 모습을 말한 것이었다. 회전이 안 된
 * 게 아니라 **모델이 반대로 붙어 있었다.**
 *
 * 이건 렌더링 계약이라 단위 테스트로 픽셀을 확인할 수는 없다. 대신 이 판단이
 * 딛고 선 **전제**를 고정한다: 모델 루트에 회전이 구워져 있지 않다는 것.
 * 모델을 다시 뽑아 축이 바뀌면 여기가 먼저 깨진다.
 */

describe("GLB 축", () => {
  /** glTF는 JSON 청크가 앞에 온다. 헤더 12바이트 + 청크 헤더 8바이트 뒤부터다 */
  function readGltfJson(path: string): {
    scenes?: Array<{ nodes?: number[] }>;
    nodes: Array<{ name?: string; rotation?: number[] }>;
  } {
    const binary = readFileSync(path);
    const jsonLength = binary.readUInt32LE(12);
    return JSON.parse(binary.subarray(20, 20 + jsonLength).toString("utf8"));
  }

  const gltf = readGltfJson("public/character.glb");

  it("루트 노드에 회전이 구워져 있지 않다", () => {
    /*
     * 여기에 180° 회전이 들어오면 화면에서 캐릭터가 반대로 돌아선다. 그때는
     * `CharacterModel`의 보정도 함께 바꿔야 하고, 그 판단은 **화면을 보고**
     * 해야 한다 — 아래 검사의 주석에 방법을 적어 두었다.
     */
    const roots = (gltf.scenes?.[0]?.nodes ?? []).map((index) => gltf.nodes[index]);
    expect(roots.length, "씬 루트가 없다").toBeGreaterThan(0);

    for (const node of roots) {
      expect(node.rotation, `${node.name}에 회전이 구워져 있다`).toBeUndefined();
    }
  });
});

describe("모델 방향 보정", () => {
  const source = readFileSync("src/game/player/CharacterModel.tsx", "utf8");

  it("GLB에 y축 보정을 걸지 않는다", () => {
    /*
     * 확인하는 방법(브라우저):
     *   1. `/play`를 새로 연다 (정지 상태에서 시작해야 한다)
     *   2. W를 누른다 — 카메라 반대쪽으로 가므로 **등**이 보여야 한다
     *   3. S를 누른다 — 돌아서서 **얼굴**을 보이며 다가와야 한다
     *
     * 보정이 있으면 2에서 얼굴이, 3에서 등이 보인다.
     */
    const primitive = source.slice(source.lastIndexOf("<primitive"));
    expect(primitive, "primitive를 찾지 못했다").toContain("object={loaded.scene}");
    expect(primitive, "y축 보정이 다시 붙었다").not.toMatch(
      /rotation=\{\[[^\]]*Math\.PI[^\]]*\]\}/,
    );
  });

  it("발바닥 기준을 가운데로 내리는 보정은 남아 있다", () => {
    // 이건 다른 문제다 — 빼면 캐릭터가 키의 절반만큼 공중에 뜬다
    expect(source).toContain("position={[0, -PLAYER_HEIGHT / 2, 0]}");
  });
});
