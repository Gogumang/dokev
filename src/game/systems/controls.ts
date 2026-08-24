/**
 * 조작 정본 — 키 코드와 안내 문구를 한 곳에 둔다.
 *
 * 지금까지 조작표가 세 곳에 각자 적혀 있었다: 실제 키 바인딩(input.ts),
 * 시작 화면의 표, HUD의 조작 힌트. 키를 바꾸면 세 곳을 다 고쳐야 하고,
 * 실제로 포토 모드(P)는 바인딩만 있고 두 표 어디에도 없었다 — 조작표를
 * 읽어서는 알 수 없는 기능이었다.
 *
 * 이제 바인딩이 이 코드를 참조하고 두 표가 이 목록을 렌더한다. 도로 좌표를
 * cityLayout 하나로 모은 것과 같은 이유다.
 */

/**
 * 단발 입력의 KeyboardEvent.code.
 *
 * `code`를 쓰는 이유: `key`는 자판 배열과 한/영 상태에 따라 달라진다.
 * 한글 입력 상태에서 J를 누르면 key는 "ㅓ"지만 code는 그대로 KeyJ다.
 */
export const CONTROL_CODES = {
  board: "KeyB",
  attack: "KeyJ",
  weapon: "KeyQ",
  grapple: "KeyG",
  companion: "KeyC",
  ability: "KeyE",
  dance: "KeyR",
  drink: "KeyF",
  talk: "KeyT",
  photo: "KeyP",
  zoomIn: "KeyZ",
  zoomOut: "KeyX",
  sound: "KeyM",
  perf: "F3",
} as const;

/**
 * 키 코드를 사람이 읽는 표기로.
 *
 * 화면에 「T」를 박아 두면 키를 옮길 때 안내만 남아 거짓이 된다 — 이 세션에서
 * 같은 종류를 여러 번 만났다. 코드에서 만든다.
 */
export function keyLabel(code: string): string {
  return /^Key([A-Z])$/.exec(code)?.[1] ?? code;
}

export type ControlId = keyof typeof CONTROL_CODES | "move" | "look" | "run" | "jump" | "glide";

export interface ControlRow {
  id: ControlId;
  /** 무엇을 하는지 */
  action: string;
  /** 키보드 표기 — 사람이 읽는 문구 */
  keyboard: string;
  /** 터치 표기 */
  touch: string;
  /**
   * HUD 조작 힌트에 넣을 짧은 표기. 없으면 힌트에서 뺀다 —
   * 화면 아래 한 줄에 열한 개를 다 넣으면 아무것도 안 읽힌다.
   */
  hint?: { key: string; label: string };
}

export const CONTROLS: readonly ControlRow[] = [
  {
    id: "move",
    action: "이동",
    keyboard: "WASD / 방향키",
    touch: "좌측 가상 스틱",
    hint: { key: "WASD", label: "이동" },
  },
  {
    id: "look",
    action: "시점",
    keyboard: "마우스 드래그",
    touch: "우측 화면 드래그",
    hint: { key: "드래그", label: "시점" },
  },
  {
    id: "run",
    action: "달리기",
    keyboard: "Shift",
    touch: "스틱 끝까지 밀기",
    hint: { key: "Shift", label: "달리기" },
  },
  {
    id: "board",
    action: "탈것 타기·내리기",
    keyboard: "B",
    touch: "탈것 버튼",
    hint: { key: "B", label: "탈것" },
  },
  {
    id: "jump",
    action: "점프 · 이단 점프",
    keyboard: "Space (공중에서 한 번 더)",
    touch: "점프 버튼",
    hint: { key: "Space", label: "점프 · 이단" },
  },
  {
    id: "glide",
    action: "활강",
    keyboard: "떨어질 때 Space 유지",
    touch: "점프 버튼 길게",
    hint: { key: "Space 유지", label: "활강" },
  },
  {
    id: "attack",
    action: "공격",
    keyboard: "J",
    touch: "공격 버튼",
    hint: { key: "J", label: "공격" },
  },
  {
    id: "companion",
    action: "도깨비 부르기 · 보내기",
    keyboard: "C",
    touch: "동료 버튼",
    hint: { key: "C", label: "동료 부르기" },
  },
  {
    // 능력 이름은 동행 중인 도깨비마다 다르다. HUD는 이 id를 보고 실제
    // 이름으로 바꿔 넣는다.
    id: "ability",
    action: "동료 능력",
    keyboard: "E",
    touch: "능력 버튼",
    hint: { key: "E", label: "동료 능력" },
  },
  {
    id: "dance",
    action: "감정 표현 (춤 · 손 흔들기 · 앉기)",
    keyboard: "R (멈춰 있을 때, 누를 때마다 다음 동작)",
    touch: "춤 버튼",
    hint: { key: "R", label: "춤" },
  },
  {
    id: "drink",
    action: "음료 뽑기",
    keyboard: "F (자판기 앞에서)",
    touch: "음료 버튼",
    hint: { key: "F", label: "음료" },
  },
  {
    id: "grapple",
    action: "그래플",
    keyboard: "G (가로등을 보고)",
    touch: "그래플 버튼",
    hint: { key: "G", label: "그래플" },
  },
  {
    id: "weapon",
    action: "무기 바꾸기",
    keyboard: "Q",
    touch: "무기 버튼",
    hint: { key: "Q", label: "무기" },
  },
  {
    id: "talk",
    action: "말 걸기 · 살펴보기",
    keyboard: "T (주민이나 간판 가까이에서)",
    touch: "살펴보기 버튼",
  },
  {
    id: "photo",
    action: "포토 모드",
    keyboard: "P",
    touch: "사진 버튼",
  },
  {
    id: "zoomIn",
    action: "포토 모드 — 가까이",
    keyboard: "Z",
    touch: "가까이 버튼",
  },
  {
    id: "zoomOut",
    action: "포토 모드 — 멀리",
    keyboard: "X",
    touch: "멀리 버튼",
  },
  {
    id: "sound",
    action: "소리 켜기 · 끄기",
    keyboard: "M",
    touch: "소리 버튼",
  },
  {
    id: "perf",
    action: "성능 표시",
    keyboard: "F3",
    touch: "성능 버튼",
  },
];

/** HUD 조작 힌트에 넣을 행들 */
export function hintRows(): ControlRow[] {
  return CONTROLS.filter((row) => row.hint !== undefined);
}
