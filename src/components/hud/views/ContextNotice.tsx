/**
 * 그래픽 연결 안내 — 모양만.
 *
 * 다른 안내와 따로 두는 이유: 이것만은 **사고**를 알린다. 나머지는 「지금 여기서
 * 무엇을 할 수 있는가」이고, 이건 「게임이 멈췄다」이다.
 */

/**
 * 그래픽 연결 안내.
 *
 * 컨텍스트가 끊기면 캔버스는 검은 채로 남고 아무 일도 일어나지 않는다.
 * 사용자에게는 게임이 죽은 것으로 보이므로, 무슨 일인지와 무엇을 하면 되는지를
 * 알려 준다. 이 안내는 3D 밖(DOM)에 있어 컨텍스트가 없어도 보인다.
 */
export function ContextNotice({
  message,
  lost,
  onReload,
}: {
  message: string | null;
  lost: boolean;
  onReload: () => void;
}) {
  if (!message) return null;

  return (
    <div
      className="hud-scrim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] px-[var(--space-6)] py-[var(--space-4)] text-center"
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="alert"
    >
      <p className="m-0 text-sm">{message}</p>
      {/*
        끊긴 동안에는 누를 것을 준다.

        「새로고침하면 다시 시작할 수 있습니다」라고 적어 두고 누를 것이 없었다 —
        모바일에서는 주소창을 다시 꺼내는 것부터 어렵고, 화면은 검은 채로 남아
        게임이 죽은 것으로 보인다.

        돌아온 뒤에는 버튼을 두지 않는다. 계속 놀 수 있는데 새로고침을 권하면
        진행을 버리라는 말로 읽힌다.
      */}
      {lost && (
        <button
          type="button"
          onClick={onReload}
          aria-label="새로고침"
          className="mt-[var(--space-3)] rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-sm font-semibold"
          style={{ minHeight: "var(--touch-min)" }}
        >
          새로고침
        </button>
      )}
    </div>
  );
}
