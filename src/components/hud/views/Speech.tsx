/**
 * 말풍선 — 모양만.
 *
 * 좌상단 목표 아래에 쌓인다. 둘 다 「지금 무엇을 하나」를 말하므로 눈이 한 곳에
 * 머물러야 한다 — 화면 반대편에 두면 대사를 놓친다.
 */

/**
 * 동료의 말풍선.
 *
 * 목표 패널 아래에 붙인다 — 둘 다 「지금 무엇을 하나」를 말하므로 눈이 한 곳에
 * 머물러야 한다. 화면 반대편에 두면 대사를 놓친다.
 */
export function CompanionSpeech({ speaker, line }: { speaker: string; line: string | null }) {
  if (!line) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ maxWidth: "min(34ch, 70vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">{speaker}</p>
      <p className="m-0 mt-0.5 text-sm">{line}</p>
    </div>
  );
}

/**
 * 주민 대사와 「말 걸 수 있음」 표시.
 *
 * 두 가지를 한 자리에서 보여 준다. 나눠 두면 대사가 뜨는 순간 안내가 사라지면서
 * 화면이 두 번 움직인다.
 *
 * 안내와 대사를 **다른 영역**에 둔다. 하나로 묶고 `aria-live`를 걸었더니,
 * 주민이 걸어 다니므로 「살펴보기」 안내가 켜졌다 꺼졌다 하며 낭독기가 끝없이
 * 읽었다 — 읽어 줄 가치가 있는 것은 **말한 내용**뿐이다.
 */
export function ResidentSpeech({
  line,
  speaker,
  nearby,
  talkKey,
}: {
  line: string | null;
  speaker: string;
  nearby: boolean;
  /** 안내에 넣을 키 표기. 코드에서 만든다 — 「T」를 박으면 키를 옮길 때 거짓이 된다 */
  talkKey: string;
}) {
  if (!line && !nearby) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ maxWidth: "min(34ch, 70vw)" }}
    >
      {line ? (
        <div role="status" aria-live="polite">
          <p className="m-0 text-xs text-[var(--color-text-secondary)]">{speaker}</p>
          <p className="m-0 mt-0.5 text-sm">{line}</p>
        </div>
      ) : (
        <p className="m-0 text-sm text-[var(--color-text-secondary)]">{talkKey} 살펴보기</p>
      )}
    </div>
  );
}
