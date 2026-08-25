/**
 * 대본 — 여러 줄이 이어지는 대화. 순수 규칙 + 내용.
 *
 * `dialogue.ts`와 나누는 이유가 분명하다. 저쪽은 **한 줄이 지나가는 것**이다 —
 * 달리면 "더 빨리!", 넘어뜨리면 "혼내 주자". 상황에 얹히는 추임새라 앞뒤가 없다.
 *
 * 여기는 **앞뒤가 있는 말**이다. 그리고 이 대본이 지는 몫은 하나뿐이다:
 * 이 게임의 세계관을 전하는 것 (DESIGN_GUIDE 「세계관 — 도깨비란 무엇인가」).
 *
 *   아이들의 세상에서는 주변에 문제가 생기면 그것이 도깨비의 모습으로 보인다.
 *   그 도깨비를 물리치고 나면 친구가 된다.
 *
 * 이 말이 화면에서 나오지 않으면 플레이어는 끝까지 「몬스터를 잡아 동료로 만드는
 * 게임」으로 이해한다. 그건 다른 게임이다.
 *
 * **선택지도 분기도 없다.** 고르게 하려고 있는 것이 아니다. 갈래를 넣는 순간
 * 「무엇을 고를까」가 화면의 주제가 되고, 전하려던 말은 뒤로 밀린다.
 *
 * three.js도 React도 모른다.
 */

import { DOKEBI } from "@/game/dokebi/roster";

/**
 * 화자 이름은 **정본에서 가져온다.**
 *
 * "초롱"이라고 적어 두었다가 검사에 걸렸다. 이름을 문자열로 박으면 도감에서
 * 이름을 고쳤을 때 대사만 옛 이름으로 남고, 그러면 같은 존재로 안 읽힌다.
 */
const CHORONG = DOKEBI.chorong.name;
const PLAYER = "나";

/** 대본이 붙는 자리 */
export type ScriptId = "firstProblem" | "firstFriend" | "friend" | "bossBefore" | "bossAfter";

export interface ScriptLine {
  /** 누가 말하는가. 빈 문자열이면 화자 없이 지문으로 뜬다 */
  speaker: string;
  text: string;
}

/**
 * 한 줄이 화면에 머무는 시간(초).
 *
 * 3.2초는 한국어 30자 안팎을 읽고 한 박자 쉬는 길이다. 짧으면 읽다 놓치고,
 * 길면 다음 줄을 기다리게 된다 — 기다리게 하는 순간 대사는 방해물이 된다.
 */
export const SCRIPT_LINE_SECONDS = 3.2;

/**
 * 대본.
 *
 * 「도깨비가 무엇인가」를 **설명하지 않는다.** 아이 둘이 눈앞의 것을 두고 하는
 * 말 안에 들어 있어야 한다 — 설명문이 뜨는 순간 게임이 아니라 안내판이 된다.
 */
export const SCRIPTS: Record<ScriptId, readonly ScriptLine[]> = {
  /* 첫 문제와 마주치는 자리. 이 게임의 규칙을 말로 처음 꺼낸다 */
  firstProblem: [
    { speaker: CHORONG, text: "저기 봐. 뭔가 잔뜩 어질러져 있지." },
    { speaker: PLAYER, text: "…고장 난 자판기 아니야?" },
    { speaker: CHORONG, text: "어른 눈에는 그렇게 보여. 근데 넌 지금 뭐가 보여?" },
    { speaker: "", text: "고물 더미가 몸을 일으켜 이쪽을 본다." },
    { speaker: CHORONG, text: "여기서 뭔가 어긋나면 저렇게 모습을 갖춰. 그게 도깨비야." },
    { speaker: CHORONG, text: "무서워할 것 없어. 등지고 도망치면 계속 커질 뿐이야." },
  ],

  /* 처음으로 친구가 되는 자리. 「이긴다」의 뜻을 여기서 뒤집는다 */
  firstFriend: [
    { speaker: "", text: "쓰러진 자리에서 작은 빛이 떠오른다." },
    { speaker: PLAYER, text: "어… 안 사라지네?" },
    { speaker: CHORONG, text: "없앤 게 아니니까. 마주 본 거야." },
    { speaker: CHORONG, text: "한 번 마주 본 건 다음부터 네 편이 돼." },
    { speaker: "", text: "빛이 어깨 옆으로 다가와 자리를 잡는다." },
    { speaker: CHORONG, text: "봐, 벌써 길을 밝혀 주잖아." },
  ],

  /* 두 번째부터. 짧게 — 같은 말을 길게 되풀이하면 다음부터 읽지 않는다 */
  friend: [
    { speaker: CHORONG, text: "또 하나 마주 봤네." },
    { speaker: CHORONG, text: "이제 저 아이가 할 수 있는 건 너도 할 수 있어." },
  ],

  bossBefore: [
    { speaker: "", text: "골목 끝이 통째로 어두워져 있다." },
    { speaker: CHORONG, text: "이건… 오래 두고 본 거야. 그래서 이만큼 커졌어." },
    { speaker: PLAYER, text: "그럼 더 늦기 전에." },
    { speaker: CHORONG, text: "응. 크다고 다른 건 아니야. 똑같이 마주 보면 돼." },
  ],

  bossAfter: [
    { speaker: "", text: "어둠이 걷히고 골목 끝까지 불이 들어온다." },
    { speaker: CHORONG, text: "봤지? 큰 것도 결국 하나였어." },
    { speaker: PLAYER, text: "이제 여기 지나다닐 수 있겠다." },
    { speaker: CHORONG, text: "다음에 또 뭔가 어긋나면, 그때도 같이 가자." },
  ],
};

export interface ScriptState {
  /** 지금 돌고 있는 대본. 없으면 null */
  id: ScriptId | null;
  /** 지금 줄 번호 */
  index: number;
}

export function createScriptState(): ScriptState {
  return { id: null, index: 0 };
}

/**
 * 대본을 시작한다.
 *
 * **이미 돌고 있으면 새로 시작하지 않는다.** 대본이 대본을 끊으면 앞의 말이
 * 무슨 뜻이었는지 알 수 없게 된다 — 이 게임에서 대사는 세계관을 전하는 유일한
 * 통로라, 끊기면 그 몫을 잃는다.
 */
export function startScript(state: ScriptState, id: ScriptId): ScriptState {
  if (state.id !== null) return state;
  return { id, index: 0 };
}

/** 지금 보여 줄 줄. 돌고 있지 않으면 null */
export function currentLine(state: ScriptState): ScriptLine | null {
  if (state.id === null) return null;
  return SCRIPTS[state.id][state.index] ?? null;
}

/**
 * 다음 줄로 넘긴다.
 *
 * **dt를 받지 않는다.** 대사는 시간을 적분하는 시뮬레이션이 아니라 한 줄씩
 * 넘어가는 것이다 — 처음에 `stepScript(state, dt)`로 만들었다가, 프레임 시간
 * 상한을 요구하는 검사에 걸리고 나서야 모양 자체가 틀렸다는 것을 알았다.
 * 넘기는 때(3.2초 타이머)는 부르는 쪽이 정한다.
 *
 * 마지막 줄이면 스스로 닫는다 — 닫는 일을 부르는 쪽에 맡기면 한 곳만 잊어도
 * 대사가 화면에 영영 남는다.
 */
export function advanceLine(state: ScriptState): ScriptState {
  if (state.id === null) return state;

  const next = state.index + 1;
  if (next >= SCRIPTS[state.id].length) return createScriptState();
  return { ...state, index: next };
}
