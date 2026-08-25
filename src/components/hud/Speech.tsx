"use client";

/**
 * 말풍선을 **잇는** 자리 — 동료 대사, 주민 대사.
 *
 * 둘 다 매 프레임 바뀌는 공유 객체를 자기 주기로 들여다본다. 그리는 일은
 * `views/Speech`가 한다.
 */

import {
  CompanionSpeech as CompanionSpeechView,
  ResidentSpeech as ResidentSpeechView,
} from "@/components/hud/views/Speech";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";

/** 사람이 읽는 속도보다 빠르면 된다 */
const SPEECH_MS = 200;

export function CompanionSpeech({
  dialogue,
  speaker,
}: {
  dialogue: { line: string | null };
  /** 지금 데리고 다니는 도깨비 이름. 「초롱」을 박아 두면 다른 동료일 때 거짓말이 된다 */
  speaker: string;
}) {
  const line = useSampled(() => dialogue.line, SPEECH_MS);
  return <CompanionSpeechView speaker={speaker} line={line} />;
}

export function ResidentSpeech({
  talk,
  talkKey,
}: {
  talk: { line: string | null; speaker: string; nearby: boolean };
  /** 안내에 넣을 키 표기. 코드에서 만든다 — 「T」를 박으면 키를 옮길 때 거짓이 된다 */
  talkKey: string;
}) {
  const view = useSampled(
    () => ({ line: talk.line, speaker: talk.speaker, nearby: talk.nearby }),
    SPEECH_MS,
    shallowEqual,
  );

  return <ResidentSpeechView {...view} talkKey={talkKey} />;
}
