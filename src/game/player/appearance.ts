/**
 * 캐릭터 외형 프리셋 — 순수 데이터.
 *
 * PROJECT_PLAN 「주요 화면」이 캐릭터 설정 화면을 예정해 두었는데, 색이 렌더
 * 파일에 상수로 박혀 있어 고를 수가 없었다.
 *
 * **모델은 하나다.** 체형이나 머리 모양을 바꾸지 않고 색만 고른다 — 절차적
 * 실루엣이라 형태를 늘리면 자세 코드가 그만큼 늘어나고, 그건 지금 감당할
 * 범위가 아니다. 색만으로도 "내 캐릭터"라는 감각은 생긴다.
 */

export type AppearanceId = "sunset" | "mint" | "plum" | "sky";

export interface Appearance {
  id: AppearanceId;
  /** 고르는 화면에 띄우는 이름 */
  name: string;
  skin: string;
  hair: string;
  /** 후드 본색과 그늘색. 그늘이 본색보다 어두워야 접힌 부분이 읽힌다 */
  hoodie: string;
  hoodieDark: string;
  pants: string;
  shoe: string;
  /** 가방 — 실루엣의 포인트 색 */
  bag: string;
}

export const APPEARANCES: Record<AppearanceId, Appearance> = {
  sunset: {
    id: "sunset",
    name: "노을",
    // 지금까지의 기본값이다. 처음 고르는 사람이 보던 화면과 같아야 한다.
    skin: "#f2caa6",
    hair: "#2a1f2b",
    hoodie: "#ff8a3d",
    hoodieDark: "#e0702a",
    pants: "#3b4a6b",
    shoe: "#22202a",
    bag: "#2fd4c4",
  },
  mint: {
    id: "mint",
    name: "민트",
    skin: "#f6d7b8",
    hair: "#3a2b22",
    hoodie: "#2fd4c4",
    hoodieDark: "#22a89b",
    pants: "#2f3a56",
    shoe: "#1e1c26",
    bag: "#ffd23f",
  },
  plum: {
    id: "plum",
    name: "자두",
    skin: "#e8bd98",
    hair: "#1f1a2e",
    hoodie: "#a86bd6",
    hoodieDark: "#8850b4",
    pants: "#2b2740",
    shoe: "#221f2c",
    bag: "#7ef2c8",
  },
  sky: {
    id: "sky",
    name: "하늘",
    skin: "#f4d2b0",
    hair: "#2b2f3d",
    /*
     * 하늘보다 짙은 파랑이어야 한다.
     *
     * 예전 값(#5aa9ff)은 한낮 하늘을 밝게 올리자 하늘과 색 거리가 47까지
     * 좁아졌다 — 이름이 「하늘」인 옷이 실제로 하늘에 묻혔다. 3인칭이라
     * 캐릭터가 화면에서 사라지는 것과 같다.
     *
     * 한 번 더 옮긴 이유: 그냥 짙게만 하면(#2f6fd0) 이번에는 물비늘 도깨비
     * (#2f9fd4)와 붙는다. 하늘에서 떨어지면서 동료 넷과도 떨어지는 자리는
     * 청록이 아니라 **남색 쪽**이다.
     */
    hoodie: "#3a52c8",
    hoodieDark: "#2a3b94",
    pants: "#333a4d",
    shoe: "#20222b",
    bag: "#ff8a3d",
  },
};

export const APPEARANCE_ORDER: readonly AppearanceId[] = ["sunset", "mint", "plum", "sky"];

export const DEFAULT_APPEARANCE: AppearanceId = "sunset";

export function appearancePreset(id: string): Appearance {
  return Object.hasOwn(APPEARANCES, id)
    ? APPEARANCES[id as AppearanceId]
    : APPEARANCES[DEFAULT_APPEARANCE];
}
