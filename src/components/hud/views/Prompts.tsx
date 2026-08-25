/**
 * 「지금 여기서 무엇을 할 수 있는가」를 말하는 안내들 — 모양만.
 *
 * 셋의 공통 규칙: **손이 닿을 때만 뜬다.** 도시 어딘가에 자판기가 있다는
 * 사실이나 도깨비 자리가 있다는 사실을 상시 알려 줄 이유가 없다
 * (DESIGN_GUIDE 「세계가 먼저, UI는 나중에」).
 */

import type { VendingView } from "@/game/systems/hudViews";

/** 자판기 안내와 남은 효과 시간 */
export function VendingPrompt({ view }: { view: VendingView }) {
  if (!view.visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-sm"
      role="status"
      /*
       * 세는 동안에는 알리지 않는다.
       *
       * 남은 시간이 초당 여덟 번쯤 바뀌는데 그대로 `polite`로 두면 낭독기가
       * 숫자만 끝없이 읽는다 — 보스 체력 막대에서 겪은 것과 같다.
       *
       * 정작 들어야 할 것은 **뽑을 수 있게 됐다**는 사실이다. 그 순간에만 알린다.
       */
      aria-live={view.remaining !== null ? "off" : "polite"}
    >
      {view.remaining !== null ? (
        <span>
          <span className="text-[var(--color-action-primary)]">시원하다</span> —{" "}
          <span className="tabular-nums">{view.remaining.toFixed(1)}</span>초
        </span>
      ) : (
        <span>
          <kbd className="font-semibold text-[var(--color-action-primary)]">F</kbd> 음료 뽑기
        </span>
      )}
    </div>
  );
}

/**
 * 「손을 내밀라」.
 *
 * 누르지 않으면 안 열리게 바꾸고 나니 처음 오는 사람은 **무엇을 눌러야 할지
 * 알 수 없었다** — 규칙만 지키고 안내가 없으면 그건 잠긴 문이다.
 *
 * 이름은 밝히지 않는다. 아직 만나지 않은 도깨비이고, 누구인지는 만나서 알아야
 * 한다 — 자리 알림(`ShrineNotice`)이 이미 같은 규칙을 쓴다.
 */
export function ShrinePrompt({ visible, talkKey }: { visible: boolean; talkKey: string }) {
  if (!visible) return null;

  return (
    <div className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-center">
      <div className="text-sm font-semibold">여기 무언가 있다</div>
      <div className="text-xs text-[var(--color-text-secondary)]">{talkKey}로 손을 내밀어 보자</div>
    </div>
  );
}

/**
 * 「찾아갈 자리가 생겼다」 알림.
 *
 * 조건을 채워 도깨비 자리가 드러나도 **아무도 말해 주지 않았다.** 보스를
 * 눕혀도, 로봇 열두 기를 잡아도, 지도를 직접 열어 보기 전에는 몰랐다 —
 * 보상이 있는데 보상이 있다는 사실이 전달되지 않았다.
 *
 * 이름은 밝히지 않는다. 찾아가는 것이 그 자체로 놀이다 — 미리 말하면 도착이
 * 확인 절차가 된다.
 */
export function ShrineNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-lg)] px-5 py-3 text-center"
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">어딘가에 빛기둥이 섰다</p>
      <p className="m-0 mt-1 text-lg font-bold">찾아갈 자리가 생겼다</p>
      <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">
        지도에서 위치를 볼 수 있다
      </p>
    </div>
  );
}
