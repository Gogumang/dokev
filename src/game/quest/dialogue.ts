/**
 * 동료의 대사 — 순수 선택 규칙 + 내용.
 *
 * 동료가 옆에 떠 있기만 하고 아무 말도 하지 않으면 장식이 된다. 짧은 한 줄이
 * 붙는 것만으로 "같이 다니는 존재"가 된다.
 *
 * 규칙과 내용을 같은 파일에 둔 이유: 퀘스트(questRunner/questContent)와 달리
 * 여기서 규칙은 "직전과 같은 줄을 피한다" 한 가지뿐이다. 파일을 둘로 쪼개면
 * 읽는 사람이 두 곳을 오가야 하는 비용이 더 크다.
 */

/** 대사가 붙는 순간 */
export type DialogueCue =
  | "start"
  | "step:run"
  | "step:board"
  | "step:travel"
  | "step:fight"
  | "step:glide"
  | "step:clues"
  | "step:find-boss"
  | "step:beat-boss"
  | "bossWarning"
  | "complete"
  | "completeBoss"
  | "release"
  | "downed"
  | "dismissed"
  | "discovered"
  | "drink"
  | "dance"
  | "wave"
  | "sit";

/**
 * 상황별 대사 후보.
 *
 * 성격 설정(호기심 많고 성급함)이 문장 길이와 어미에 드러나야 한다 —
 * 설정만 문서에 적어 두고 대사가 밋밋하면 아무 의미가 없다.
 */
/** 상황별 대사. 검사가 「한 줄뿐인 상황이 없는가」를 여기서 센다 */
export const LINES: Record<DialogueCue, readonly string[]> = {
  start: ["가자! 오늘은 어디부터 볼까?", "해 지기 전에 한 바퀴 돌자.", "따라와, 길은 내가 밝힐게."],
  "step:run": ["더 빨리! 그 정도로는 안 데워져.", "달려 봐, 바람 소리 들어 보자."],
  "step:board": ["보드! 그거 타면 진짜 빨라져.", "굴러가는 거 좋아. 꺼내 봐."],
  "step:travel": ["저 끝까지 가 보자. 멀어 보여도 금방이야.", "큰길로 가면 더 빨라."],
  "step:fight": ["어, 저것들 또 말썽이네.", "장난감 주제에 시끄럽다. 혼내 주자."],
  "step:glide": ["높은 데서 뛰어! 내가 받쳐 줄게.", "떨어질 때 손 놓지 마. 떠오를 거야."],
  "step:clues": [
    "이 냄새… 아까 그 녀석이 지나갔어. 자국을 찾아보자.",
    "지도에 노란 게 세 개 떴어. 하나씩 보면 알 거야.",
  ],
  "step:find-boss": ["저쪽에서 쿵쿵 소리가 나. 큰 놈인가 봐.", "지도에 붉은 게 떴어. 가 보자."],
  "step:beat-boss": ["덩치만 컸지. 잘 보고 피해.", "느려. 휘두르고 나면 그때야."],
  /*
   * 예고 링을 처음 봤을 때 한 번만. 매번 말하면 1초짜리 예고마다 말풍선이
   * 떠 정작 봐야 할 바닥이 가려진다.
   */
  /*
   * 일부러 한 줄이다.
   *
   * 여러 줄로 늘리려다 되돌렸다 — 매번 다른 말을 하면 「무엇을 피하라는
   * 것」인지 흐려진다. 이건 대사가 아니라 **신호**이고, 신호는 같은 소리로
   * 반복되어야 배운다.
   */
  bossWarning: ["바닥! 빨간 거 피해!"],
  complete: ["오늘 잘했다. 내일도 오지?", "봐, 다 했잖아. 이제 마음대로 다녀."],
  /*
   * 보스를 넘긴 뒤에는 다른 말을 한다.
   *
   * 몸풀기 산책과 고물 대장을 눕힌 순간에 같은 대사가 나왔다 — 가장 큰
   * 사건이 가장 작은 사건과 같은 무게로 끝났다.
   */
  completeBoss: [
    "저 덩치를 눕혔네. 동네가 조용해졌어.",
    "고물 대장이 누웠다. 이제 진짜 우리 동네야.",
  ],
  /*
   * 로봇을 눕힌 순간, 가슴에서 빛이 빠져나갈 때.
   *
   * 우리 로봇은 이유 없이 서 있었다 — 도깨비도 있고 로봇도 있는데 **둘을 잇는
   * 문장이 하나도 없었다.** 가슴의 점(`emberRelease`)이 그 자리를 화면으로
   * 메웠고, 이 한 줄이 그것을 말로 확인해 준다.
   *
   * 매번 나오면 시끄럽다 — 부르는 쪽이 처치 때마다가 아니라 **처음 몇 번만**
   * 말하게 한다.
   */
  release: [
    "봤어? 저 안에서 뭔가 빠져나갔어.",
    "저 빛… 우리 쪽 아이 같은데.",
    "가둬 놨던 거야. 저 안에.",
  ],
  downed: ["아야… 괜찮아?", "일어나, 별거 아니야."],
  /*
   * C로 자주 누르는 자리다. 매번 같은 말이면 사람이 아니라 버튼처럼 들린다.
   */
  dismissed: ["갈게. 부르면 다시 올게.", "잠깐 쉬고 있을게.", "혼자 다녀와. 근처에 있을게."],
  // 새 도깨비를 만난 순간. 초롱이 먼저 아는 척한다 — 동료가 늘어난다는 것을
  // 알림 한 장이 아니라 목소리로 알려야 사건이 된다.
  // 자판기에서 음료를 뽑은 순간. 놀이는 반응이 있어야 놀이가 된다.
  drink: ["한 입만!", "그거 차갑겠다.", "다 마시면 뛰자."],
  // 춤. 동료가 같이 신나야 감정 표현이 되고, 아니면 애니메이션 재생이다.
  dance: ["오, 나도 나도!", "박자 맞네.", "누가 보면 어때."],
  /*
   * 감정 표현마다 다른 말을 한다.
   *
   * 셋 다 「dance」 대사를 쓰고 있었다 — 앉았는데 「박자 맞네」라고 하면
   * 동료가 이쪽을 보고 있지 않다는 뜻이 된다.
   */
  wave: ["누구한테 손 흔들어?", "나도 봤어. 아는 사람이야?", "여기선 다들 그렇게 인사해."],
  sit: ["좀 쉬자. 나도 앉을래.", "여기 앉으면 하늘이 잘 보여.", "숨 돌리고 가자."],
  discovered: [
    "어! 너 여기 있었구나.",
    "얘도 같이 다니자. 자리는 넉넉해.",
    "오래 기다렸나 보다. 미안.",
  ],
};

export interface DialogueState {
  /** 지금 보여 줄 대사. 없으면 null */
  line: string | null;
  /** 남은 표시 시간(초) */
  remaining: number;
  /** 직전에 쓴 대사 — 같은 줄이 연달아 나오지 않게 한다 */
  lastLine: string | null;
}

/** 한 줄이 화면에 머무는 시간(초) */
export const DIALOGUE_SECONDS = 4;

export function createDialogueState(): DialogueState {
  return { line: null, remaining: 0, lastLine: null };
}

/**
 * 상황에 맞는 대사를 고른다.
 *
 * 난수를 쓰지 않고 카운터로 고른다 — 같은 상황에서 매번 다른 말이 나오되,
 * 재생할 때마다 순서가 달라지지는 않는다. 재현 가능해야 대사를 검토할 수 있다.
 */
export function pickLine(cue: DialogueCue, counter: number, lastLine: string | null): string {
  const candidates = LINES[cue];
  const index = ((counter % candidates.length) + candidates.length) % candidates.length;
  const chosen = candidates[index];

  // 직전과 같으면 다음 후보로 민다. 후보가 하나뿐이면 그대로 쓴다.
  if (chosen === lastLine && candidates.length > 1) {
    return candidates[(index + 1) % candidates.length];
  }
  return chosen;
}

/** 새 대사를 띄운다. */
export function speak(state: DialogueState, cue: DialogueCue, counter: number): DialogueState {
  const line = pickLine(cue, counter, state.lastLine);
  return { line, remaining: DIALOGUE_SECONDS, lastLine: line };
}

/** 시간을 흘려보낸다. 남은 시간이 다하면 대사가 사라진다. */
export function stepDialogue(state: DialogueState, dt: number): DialogueState {
  if (!state.line) return state;
  const remaining = state.remaining - dt;
  if (remaining > 0) return { ...state, remaining };
  return { ...state, line: null, remaining: 0 };
}

/** 퀘스트 단계 id를 대사 시점으로 바꾼다. 모르는 단계면 null */
export function cueForStep(stepId: string): DialogueCue | null {
  const cue = `step:${stepId}` as DialogueCue;
  return cue in LINES ? cue : null;
}

/**
 * 여정을 마쳤을 때 할 말.
 *
 * 여정 id로 고른다. 모르는 여정이면 일반 완주 대사로 떨어진다 — 새 여정을
 * 추가했을 때 **말이 없는 것보다 평범한 말이라도 하는 편**이 낫다.
 */
export function completionCue(questId: string): DialogueCue {
  return questId === BOSS_QUEST_ID ? "completeBoss" : "complete";
}

/** 보스 여정의 id. `questContent`를 참조하면 순환 의존이 생긴다 — 테스트가 대조한다 */
export const BOSS_QUEST_ID = "boss-hunt";

/** 동료 대사가 화면으로 나가는 자리 */
export interface DialogueView {
  line: string | null;
}

/**
 * 동료가 지금 하는 말을 화면으로 옮긴다.
 *
 * 화면 안(프레임 루프)에서 손으로 적을 때는 **지워도 아무도 몰랐다.** 그러면
 * 동료가 **입을 다문다** — 부르고 보내고 능력을 써도 아무 말이 없다. 이 도시에서
 * 동료가 사람처럼 느껴지는 거의 유일한 통로다.
 *
 * 시간이 다한 대사는 `null`이 되고, 그것도 그대로 내보낸다 — 안 내보내면
 * 마지막 말이 화면에 **영영 붙어 있는다.**
 */
export function projectDialogue(view: DialogueView, state: DialogueState): void {
  view.line = state.line;
}

/* ------------------------------------------------------------------ *
 * 언제 말하나
 *
 * 무엇을 말할지(위 표)와 **언제 말할지**는 다른 문제다. 「언제」가 프레임 루프
 * 안에 손으로 적혀 있었고, 거기서는 잴 수가 없었다 — 「대장 예고는 처음 한 번만」
 * 「빛 이야기는 처음 몇 번만」이 화면을 오래 보고 있어야만 확인되는 규칙이었다.
 * ------------------------------------------------------------------ */

/** 빠져나가는 빛을 몇 번까지 말할지. 그 뒤로는 화면만 말한다 */
const LIGHT_REMARK_LIMIT = 3;

/** 동료가 무엇을 이미 말했는지. 부르는 쪽이 들고 있다 */
export interface RemarkMemory {
  /** 지난 프레임에 예고 링이 떠 있었는지 */
  sawTelegraph: boolean;
  /** 대장 경고를 이미 했는지 */
  warnedBoss: boolean;
  /** 마지막으로 본 누적 처치 수 */
  seenDefeats: number;
  /** 빛 이야기를 몇 번 했는지 */
  spokeOfLight: number;
}

export function createRemarkMemory(): RemarkMemory {
  return { sawTelegraph: false, warnedBoss: false, seenDefeats: 0, spokeOfLight: 0 };
}

/**
 * 이번 프레임에 무엇을 말할지 **정하고 기억한다.** 말할 것이 없으면 null.
 *
 * 이름이 `record`로 시작하는 이유: 넘겨받은 기억을 제자리에서 고치기 때문이다.
 * 이 저장소는 그런 함수의 이름을 네 동사(project·record·reset·consume)로 묶어
 * 두었다 — 배선을 읽을 때 「이게 무언가를 바꾸는가」가 이름에서 보여야 한다.
 *
 * **기억을 제자리에서 고친다.** 프레임마다 새 객체를 만들면 전투 중에 초당
 * 60개가 쌓인다.
 *
 * 한 프레임에 하나만 돌려준다 — 대장이 팔을 드는 순간에 로봇도 눕으면 두 마디가
 * 겹쳐 어느 쪽도 안 들린다. 대장 쪽이 먼저다(그쪽이 위험을 알리는 말이라서).
 */
export function recordRemark(
  memory: RemarkMemory,
  event: { bossTelegraph: boolean; defeats: number },
): DialogueCue | null {
  const rising = event.bossTelegraph && !memory.sawTelegraph;
  memory.sawTelegraph = event.bossTelegraph;

  if (rising && !memory.warnedBoss) {
    memory.warnedBoss = true;
    return "bossWarning";
  }

  if (event.defeats > memory.seenDefeats) {
    memory.seenDefeats = event.defeats;
    if (memory.spokeOfLight < LIGHT_REMARK_LIMIT) {
      memory.spokeOfLight += 1;
      return "release";
    }
  }

  return null;
}
