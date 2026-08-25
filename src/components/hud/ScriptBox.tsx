"use client";

/**
 * 대본 상자 — 앞뒤가 있는 대화를 화면 아래에 띄운다.
 *
 * 주민 말풍선(`ResidentSpeech`)과 나누는 이유: 저쪽은 **한 줄이 지나가는 것**이고
 * 이쪽은 여러 줄이 이어진다. 같은 모양으로 띄우면 「지금 읽어야 하는 말」과
 * 「지나가도 되는 말」이 구분되지 않는다.
 *
 * 그래서 이 상자는 **화면 아래를 가로지르는 띠**다. 말풍선보다 크고 자리가
 * 고정돼 있어, 뜨는 순간 「이건 읽는 것」으로 읽힌다.
 *
 * 조작을 막지 않는다. 이 게임의 싸움은 바깥에서 일어나므로, 대사가 뜨는 동안
 * 발이 묶이면 그 자리에서 맞는다.
 *
 * **누를 수 없다.** 처음에 「눌러서 넘기기」를 버튼으로 만들었다가 검사에
 * 걸렸다 — 알림 더미는 뒤의 3D 월드로 클릭을 통과시켜야 하는데, 그 안에 버튼이
 * 하나라도 있으면 통과가 막힌다. 대사는 3.2초마다 스스로 넘어가므로 누를 일도
 * 없다.
 */

import type { ScriptLine } from "@/game/quest/script";

export function ScriptBox({ line }: { line: ScriptLine | null }) {
  if (!line) return null;

  const narration = line.speaker === "";

  return (
    <div
      aria-live="polite"
      className="block w-full text-left"
      style={{
        background: "rgba(9,7,14,0.86)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4) var(--space-6)",
      }}
    >
      {!narration && (
        <span className="block text-sm font-bold" style={{ color: "var(--color-action-primary)" }}>
          {line.speaker}
        </span>
      )}
      {/*
       * 지문은 기울여 대사와 갈라 둔다. 같은 모양이면 누가 말한 것인지
       * 헷갈리고, 헷갈리면 세계관을 전하려던 말이 그냥 글이 된다.
       */}
      <span
        className="block text-base leading-relaxed"
        style={{
          color: narration ? "var(--color-text-secondary)" : "var(--color-text-primary)",
          fontStyle: narration ? "italic" : "normal",
        }}
      >
        {line.text}
      </span>
    </div>
  );
}
