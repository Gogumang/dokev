/**
 * 상호작용 한 프레임 — 흔적 조사, 주민에게 말 걸기, 간판 살펴보기.
 *
 * 키 하나로 셋을 다룬다. 대상마다 키가 다르면 무엇 앞에 서 있는지 먼저
 * 판단하고 나서 눌러야 하고, 그러면 아무것도 누르지 않게 된다.
 *
 * 소비하는 곳이 하나여야 한다. 둘이 각자 큐를 가져가면 같은 프레임에 서로의
 * 줄을 덮어써 화면이 깜빡인다 — 실제로 군중이 따로 소비하다 그렇게 될 뻔했다.
 *
 * PlayerRig의 프레임 콜백에서 떼어 냈다. 그 파일이 800줄 상한을 넘어서기도
 * 했지만, 그보다 이 규칙만 따로 읽을 수 있는 편이 낫다.
 */

import { clueAt } from "@/game/quest/clues";
import { chooseInteraction, type Candidate } from "@/game/world/interaction";
import { TALK_LINE_SECONDS } from "@/game/world/residentTalk";

export interface InteractionFrame {
  x: number;
  z: number;
  dt: number;
  input: { talkQueued: boolean };
  talkView: { line: string | null; speaker: string; remaining: number; nearby: boolean };
  clueView: { found: string[] };
  playerLink: { cluesFound: number };
  residentCandidate: Candidate;
  signCandidate: Candidate | null;
}

export function stepInteraction(frame: InteractionFrame): void {
  const { input, talkView, clueView, playerLink } = frame;

  /*
   * 흔적이 가장 우선한다. 여정이 시킨 일이고, 옆에 주민이 서 있다고 진행이
   * 막히면 안 된다.
   */
  const clue = clueAt(frame.x, frame.z, clueView.found);
  const other = chooseInteraction(frame.residentCandidate, frame.signCandidate);
  talkView.nearby = clue !== null || other !== null;

  if (input.talkQueued) {
    // 누른 프레임에 대상이 없으면 그냥 사라진다. 「나중에 발화」는 예상 밖이다
    input.talkQueued = false;

    if (clue) {
      // 제자리에서 밀어 넣는다 — 새 배열을 만들면 HUD가 보던 것과 갈라진다
      clueView.found.push(clue.id);
      playerLink.cluesFound = clueView.found.length;
      talkView.line = clue.line;
      talkView.speaker = "흔적";
      talkView.remaining = TALK_LINE_SECONDS;
    } else if (other) {
      talkView.line = other.line;
      talkView.speaker = other.speaker;
      talkView.remaining = TALK_LINE_SECONDS;
    }
  }

  if (talkView.remaining > 0) {
    talkView.remaining -= frame.dt;
    // 시간이 다하면 지운다. 남겨 두면 다음에 누를 때 이전 줄이 잠깐 보인다
    if (talkView.remaining <= 0) talkView.line = null;
  }
}
