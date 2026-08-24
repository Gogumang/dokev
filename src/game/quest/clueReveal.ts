/**
 * 동료의 빛이 흔적을 드러낸다.
 *
 * 도감이 초롱을 이렇게 소개한다 — 「주변에 숨은 흔적을 잠깐 빛나게 한다」.
 * 그런데 흔적은 **월드에 아예 그려지지 않았다.** 지도의 마름모와 `T` 판정만
 * 있었으니, 능력을 써도 눈앞에서는 아무 일도 일어나지 않았다. 도감이 없는
 * 기능을 약속하고 있었던 셈이다.
 *
 * 도깨비마다 목록을 두지 않는다. **드러나는 범위는 그 도깨비의 빛이 닿는
 * 거리**다 — 그러면 네 도깨비의 소개가 저절로 참이 된다:
 *
 * - 초롱(빛 ×3.2, 범위 ×2.2): 가장 잘 드러낸다
 * - 자정(범위 ×2.6): 「골목 구석까지 한꺼번에」가 문자 그대로 맞는다
 * - 그을음(범위 ×0.7): 몸을 감추는 능력이라 오히려 덜 보인다
 * - 물비늘(범위 ×1.3): 조금 넓어진다
 */

/** 흔적 한 자리 — 아직 못 찾은 것만 넘어온다 */
export interface CluePoint {
  x: number;
  z: number;
}

/**
 * 동료 빛 반경 안의 흔적을 고른다.
 *
 * 반경이 0 이하면(능력이 꺼져 있으면) 아무것도 돌려주지 않는다 — 부르는 쪽이
 * 「능력이 꺼짐」을 따로 구분하지 않아도 되게 한다.
 */
export function revealedClues(
  clues: readonly CluePoint[],
  companionX: number,
  companionZ: number,
  radius: number,
): CluePoint[] {
  // NaN이 들어와도 아무것도 드러내지 않는다 — `radius > 0`은 NaN에서 거짓이다
  if (!(radius > 0)) return [];

  const limit = radius * radius;
  return clues.filter((clue) => {
    const dx = clue.x - companionX;
    const dz = clue.z - companionZ;
    return dx * dx + dz * dz <= limit;
  });
}
