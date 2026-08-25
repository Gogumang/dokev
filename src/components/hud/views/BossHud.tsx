/**
 * 고물 대장에 대한 표시 — 모양만.
 *
 * 체력 막대는 가까이 갔을 때만, 방향 화살표는 화면 밖에 있을 때만 뜬다.
 * 그 「때」를 여기서 정하지 않는다 — `hudViews.bossHealthView`와
 * `bossPointer.bossPointerFrame`이 정해서 넘긴다.
 */

import type { BossPointerFrame } from "@/game/systems/bossPointer";
import type { BossHealthView } from "@/game/systems/hudViews";

/**
 * 미니 보스 체력 막대.
 *
 * 예고 중에는 색이 바뀌어, 막대만 보고 있어도 피할 때를 안다.
 */
export function BossHealth({ view }: { view: BossHealthView }) {
  if (!view.visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ width: "min(40ch, 80vw)" }}
      role="status"
      aria-live="polite"
      /*
       * 이름을 고정한다.
       *
       * `고물 대장 체력 87퍼센트`처럼 퍼센트를 넣어 두었는데, 이 값은 120ms마다
       * 바뀐다 — `aria-live` 영역의 이름이 계속 바뀌면 낭독기가 숫자만 끝없이
       * 읽는다. 정작 들어야 할 「내려친다 — 피해!」가 그 사이에 묻힌다.
       *
       * 퍼센트는 눈으로만 본다. 소리로 필요한 것은 **지금 피해야 하는가**다.
       */
      aria-label="고물 대장 체력"
    >
      <p className="m-0 flex items-baseline justify-between text-xs">
        <span className="font-semibold">고물 대장</span>
        {view.telegraph && <span className="text-sunset">내려친다 — 피해!</span>}
      </p>
      <span
        aria-hidden="true"
        className="mt-1 block h-2 w-full overflow-hidden rounded-[var(--radius-round)] bg-[rgba(255,255,255,0.16)]"
      >
        <span
          className="block h-full rounded-[var(--radius-round)] transition-[width] duration-200"
          style={{
            width: `${view.percent}%`,
            background: view.telegraph ? "#ff8a3d" : "#ff5d6c",
          }}
        />
      </span>
    </div>
  );
}

/**
 * 대장이 어느 쪽에 있는지 알리는 화살표.
 *
 * DESIGN_GUIDE 「월드 안내」의 「화면 밖 중요 대상에는 방향 표시를 함께
 * 제공한다」. 그전까지 대장을 찾는 길은 미니맵의 삼각형 하나뿐이었고, 퀘스트
 * 힌트마저 그 표식을 가리켰다 — 지도를 안 보는 사람에게는 안내가 없었다.
 */
export function BossPointer({
  frame,
  reducedMotion,
}: {
  frame: BossPointerFrame;
  reducedMotion: boolean;
}) {
  if (!frame.visible) return null;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% + ${(frame.offsetX * 50).toFixed(2)}%)`,
        top: `calc(50% + ${(frame.offsetY * 50).toFixed(2)}%)`,
        transform: "translate(-50%, -50%)",
      }}
      /*
       * 낭독기에는 내보내지 않는다.
       *
       * 거리가 초당 여덟 번 바뀌므로 `aria-live` 영역이 되면 숫자만 끝없이
       * 읽힌다 — 보스 체력 막대에서 이미 겪었다. 같은 내용은 미니맵의 설명
       * (`describeMap`)이 「고물 대장은 북쪽 38m」로 이미 말하고 있고, 그쪽은
       * 초점이 닿을 때만 읽힌다.
       */
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-1">
        <span
          className="block h-0 w-0"
          style={{
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderBottom: "12px solid var(--color-status-danger)",
            transform: `rotate(${frame.bearing}rad)`,
            transition: reducedMotion ? undefined : "transform 120ms linear",
          }}
        />
        <span className="hud-scrim tabular rounded-[var(--radius-round)] px-2 py-0.5 text-xs font-semibold">
          고물 대장 {Math.round(frame.distance)}m
        </span>
      </div>
    </div>
  );
}
