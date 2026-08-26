/**
 * 도깨비마다 어떤 몸을 입는가 — GLB 주소와 동작 이름.
 *
 * 동료는 원래 절차적 등불이었다(구 + 부적 고리 + 꼬리 불꽃). 메인 그림에
 * 나온 넷을 모델로 들이면서 그중 셋이 도착했고, 아직 안 온 하나는 등불로
 * 남는다 — 그래서 `url`이 `null`일 수 있다.
 *
 * **이름과 사연은 바꾸지 않았다.** ASSET_PLAN 3.1은 「반입 때 roster의 이름·
 * 사연도 외형에 맞게 바꾼다」고 적어 두었지만, 실제로 넷을 놓고 보니 사연은
 * 종(種)이 아니라 **태어난 자리**에 대한 이야기였다 — 「가로등이 나가던 골목에서
 * 혼자 켜져 있었다」는 버섯이어도 그대로 성립한다. 도깨비는 무엇이든 그 모습을
 * 할 수 있다. 지어 둔 글을 종에 맞추려고 다시 쓸 이유가 없었다.
 *
 * 짝은 색으로 맞췄다. 그을음은 검은 몸(#57505f)이라 검은 고양이, 물비늘은
 * 물빛(#2f9fd4)이라 청록 패딩을 입은 흰곰, 초롱은 크림 몸에 잎 싹을 단 버섯,
 * 자정은 아직 안 온 로봇이다.
 */

import type { CompanionMood } from "@/game/dokebi/companionMotion";
import type { DokebiId } from "@/game/dokebi/roster";

export interface CompanionShape {
  /** `public/` 아래 경로. null이면 절차적 등불로 남는다 */
  readonly url: string | null;
  readonly label: string;
  /** 걸을 때 */
  readonly walk: string;
  /** 달릴 때 */
  readonly run: string;
  /** 능력을 켠 동안 */
  readonly ability: string;
}

/** 모델 원본의 키(m). Meshy 규약이라 캐릭터·대장과 같다 */
export const COMPANION_MODEL_HEIGHT = 1.7;

/**
 * 게임에서의 키(m).
 *
 * 주인공이 1.5m다. 같은 키로 두면 **동료가 둘째 주인공처럼 보이고**, 넷이
 * 따라다니면 화면이 사람으로 꽉 찬다. 0.95는 주인공 가슴께로, 옆에 섰을 때
 * 「데리고 다니는 쪽」이 한눈에 읽히는 비율이다.
 */
export const COMPANION_HEIGHT = 0.95;

export const COMPANION_SHAPE: Record<DokebiId, CompanionShape> = {
  /*
   * 버섯 — 청록 갓, 크림 몸, 잎 싹, 목걸이 카메라.
   *
   * **걷는 동작이 없다.** 원본에 온 것은 달리기·쿵후 펀치·일어서기·돌진뿐이라,
   * 걸을 때도 달리기를 느리게 튼다(`companionPlaybackRate`). 셋 중 이것만
   * 그렇고, 다음에 다시 받을 때 `Walking`을 함께 뽑는 것이 맞다.
   */
  chorong: {
    url: "/models/companion-mushroom.glb",
    label: "버섯",
    walk: "Running",
    run: "Running",
    ability: "Kung_Fu_Punch",
  },
  geueum: {
    url: "/models/companion-cat.glb",
    label: "검은 고양이",
    walk: "Walking",
    run: "Running",
    ability: "Sword_Judgment",
  },
  mulbineul: {
    url: "/models/companion-bear.glb",
    label: "흰곰",
    walk: "Walking",
    run: "Running",
    ability: "Attack",
  },
  /*
   * 로봇은 아직 파일이 없다. 등불 몸이 그대로 남는다 — 넷 중 하나만 없다고
   * 자정을 안 보여 줄 수는 없다.
   */
  jajeong: {
    url: null,
    label: "로봇",
    walk: "",
    run: "",
    ability: "",
  },
};

/**
 * 지금 틀 동작.
 *
 * 능력이 켜져 있으면 그것이 이긴다 — 능력은 **플레이어가 누른 것**이라
 * 화면에 반응이 없으면 눌린 줄 모른다.
 *
 * 서 있는 동작은 없다. 셋 다 원본에 `Idle`이 안 왔고, 대신 멈춰 있어도 동료는
 * 플레이어 주위를 돈다(`idleOrbitRate` 0.45rad/s ≈ 0.9m/s) — 실제로 걷고 있는
 * 것이라 걷는 동작이 맞다.
 */
export function companionClipFor(
  shape: CompanionShape,
  mood: CompanionMood,
  abilityActive: boolean,
): string | null {
  if (!shape.url) return null;
  if (abilityActive && shape.ability) return shape.ability;
  return mood === "rush" ? shape.run : shape.walk;
}

/**
 * 동작을 얼마나 빨리 틀 것인가.
 *
 * 발이 땅에 붙어 있어야 한다. 속도와 무관하게 1배로 틀면 **느리게 갈 때는
 * 미끄러지고 빠를 때는 종종거린다** — 걷는 동료에서 가장 먼저 눈에 띄는
 * 어색함이 이것이다.
 *
 * 기준 속도는 `runSpeedReference`(7.4m/s)로 잡는다. 완전히 멈추면 0이 되어
 * 동작이 굳으므로 아래를 0.45로 막는다.
 */
export function companionPlaybackRate(speed: number, mood: CompanionMood): number {
  const reference = mood === "rush" ? 7.4 : 3.2;
  return Math.max(0.45, Math.min(1.8, speed / reference));
}
