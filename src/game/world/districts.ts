/**
 * 구역 이름표 — `zones.ts`로 가는 얇은 통로.
 *
 * 원래 이 파일이 성격을 **정했다.** 격자 중심에서의 고리 거리로 광장·번화가·
 * 변두리 셋을 나눴는데, 그 모델의 한계가 화면에 그대로 나왔다: 이름은 셋인데
 * 건물 만드는 규칙은 하나라 **어디를 달려도 같은 상자 밭**이었다. 고리는
 * 방향을 구분하지 못한다 — 북쪽 끝과 남쪽 끝이 같은 고리라 같은 동네가 된다.
 *
 * 지금 정본은 `zones.ts`의 손으로 그린 6x6 지도다. 이 파일에 남은 일은 둘이다:
 * 이름을 계속 쓰는 곳(HUD·오디오·지도·미니맵 열 군데 넘는다)에 이름표를 주는
 * 것과, **좌표로 구역을 찾는 것**(`zoneAt`).
 *
 * 좌표 조회가 `zones.ts`가 아니라 여기 있는 이유는 순환 때문이다. 좌표를
 * 구역 번호로 바꾸려면 `streaming`이 필요한데, `streaming`은 모듈 최상단에서
 * `CITY`를 읽는다. `cityLayout`이 건물 규칙 때문에 `zones`를 부르므로,
 * `zones`가 `streaming`을 부르는 순간 `CITY`가 undefined가 된다. 이 파일은
 * `cityLayout`이 부르지 않으므로 안전하다.
 */

import { blockIndexFromPosition } from "@/game/world/streaming";
import type { Zone, ZoneId } from "@/game/world/zones";
import { ZONES, zoneForBlock } from "@/game/world/zones";

/** 구역 식별자. 정본은 `ZoneId`다. */
export type DistrictId = ZoneId;

/**
 * 화면에 뜨는 이름표.
 *
 * `Zone`에서 이름 셋만 뽑은 모양이다 — HUD는 바닥 재질이나 나무 밀도를
 * 알 필요가 없고, 알게 두면 HUD 코드가 배치 규칙에 묶인다.
 */
export interface District {
  id: DistrictId;
  name: string;
  subtitle: string;
}

function label(zone: Zone): District {
  return { id: zone.id, name: zone.name, subtitle: zone.subtitle };
}

export const DISTRICTS: Record<DistrictId, District> = Object.fromEntries(
  Object.values(ZONES).map((zone) => [zone.id, label(zone)]),
) as Record<DistrictId, District>;

/**
 * 좌표 → 구역.
 *
 * 배치 규칙·바닥 재질·나무 밀도까지 전부 들어 있는 쪽이다. 이름만 필요하면
 * `districtAt`을 쓴다 — HUD가 건물 규칙을 알게 두면 HUD가 배치에 묶인다.
 */
export function zoneAt(x: number, z: number): Zone {
  return zoneForBlock(blockIndexFromPosition(x, z));
}

/** 구역 번호 → 이름표. */
export function districtForBlock(blockIndex: number): District {
  return DISTRICTS[zoneForBlock(blockIndex).id];
}

/** 좌표 → 이름표. */
export function districtAt(x: number, z: number): District {
  return DISTRICTS[zoneAt(x, z).id];
}
