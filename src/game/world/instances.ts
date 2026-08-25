/**
 * 인스턴스 채우기 — 여러 렌더 컴포넌트가 함께 쓴다.
 *
 * `City.tsx`에 있었는데 지면·인도를 따로 떼면서(GroundSurfaces) 두 파일이
 * 같은 함수를 필요로 하게 됐다. 한쪽이 다른 쪽을 import하면 순환이 되므로
 * 공유 지점을 따로 만든다.
 */

import * as THREE from "three";

import type { DetailInstance } from "@/game/world/cityDetails";
import { terrainHeight } from "@/game/world/terrain";

/** 아틀라스는 셀에 색이 이미 들어 있으므로 인스턴스 색을 흰색으로 통일한다. */
export const WHITE_PALETTE = ["#ffffff"];

/**
 * 인스턴스 행렬과 색을 채운다.
 *
 * 이름이 `project`로 시작하는 이유: 이 저장소는 **넘겨받은 객체를 고치는
 * 함수**를 project/record/reset/consume 넷으로 묶어 둔다(`stateBoundaries`
 * 테스트가 강제한다). 배치 데이터를 인스턴스 메시에 투영하는 일이라 project다.
 *
 * 회전 순서를 YXZ로 두는 이유: 먼저 벽을 향해 y로 돌린 다음(rotationY),
 * 그 로컬 축을 기준으로 앞으로 기울여야(tiltX) 차양이 벽에서 아래로 처진다.
 * 기본 XYZ 순서로는 벽을 향해 돌린 뒤 월드 x축으로 기울어져 엉뚱하게 눕는다.
 */
export function projectInstances(
  mesh: THREE.InstancedMesh,
  items: readonly DetailInstance[],
  palette: readonly string[],
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  items.forEach((item, index) => {
    /*
     * 지형 높이를 여기서 한 번에 더한다.
     *
     * 배치 데이터(cityLayout·cityDetails)는 **평지 기준**으로 y를 적는다.
     * 그 편이 읽기 쉽고, 무엇보다 y를 적는 자리가 수십 곳이라 거기서
     * 지형을 더하면 한 곳만 빠뜨려도 그 소품만 공중에 뜬다 — 그리고 그건
     * 도시를 한 바퀴 돌아야 발견된다.
     */
    // 파묻는 깊이만큼 아래로만 늘린다 — 위쪽(옥상·간판)은 그대로 있어야 한다
    const sink = item.sink ?? 0;
    position.set(item.x, item.y + terrainHeight(item.x, item.z) - sink / 2, item.z);
    scale.set(item.width, item.height + sink, item.depth);
    euler.set(item.tiltX ?? 0, item.rotationY ?? 0, item.tiltZ ?? 0, "YXZ");
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    color.set(palette[item.tone % palette.length]);
    mesh.setColorAt(index, color);
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // 절두체 컬링이 동작하려면 인스턴스 전체를 감싸는 경계구가 필요하다.
  mesh.computeBoundingSphere();
}
