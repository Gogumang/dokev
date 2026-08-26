/**
 * 스스로 떴다 사라지는 알림들 — 모양만.
 *
 * 언제 뜨고 언제 사라지는지는 여기 없다. 전부 `hudHold`의 걸쇠가 정하고,
 * 이 컴포넌트들은 **이미 정해진 것**을 받아 그린다.
 *
 * 나누기 전에는 셋이 각자 `useRef`로 이전 값을 들고, 각자 감출 시각을 계산하고,
 * 각자 `setInterval` 안에서 비교했다 — 같은 규칙인데 고칠 곳이 셋이었다.
 */

import type { DokebiSpirit } from "@/game/dokebi/roster";

/**
 * 새 도깨비 해금 알림.
 *
 * 이게 없으면 도감을 열어 보기 전까지 아무도 알려 주지 않는다 — 수집의 순간이
 * 사라진다. 조건을 채운 그 자리에서 알아야 「그래서 그랬구나」가 된다.
 */
export function UnlockNotice({ spirit }: { spirit: DokebiSpirit | null }) {
  if (!spirit) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-lg)] px-5 py-3 text-center"
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs text-[var(--color-action-primary)]">새 도깨비를 만났다</p>
      <p className="m-0 mt-1 flex items-center justify-center gap-2 text-lg font-bold">
        <span
          aria-hidden="true"
          className="inline-block rounded-[var(--radius-round)]"
          style={{
            width: "16px",
            height: "16px",
            background: spirit.bodyColor,
            boxShadow: `0 0 10px ${spirit.accentColor}`,
          }}
        />
        {spirit.name}
      </p>
      <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">{spirit.tagline}</p>
      <p className="m-0 mt-1 text-xs">도감에서 데리고 다닐 수 있다</p>
    </div>
  );
}

/**
 * 구역 진입 배너.
 *
 * 넓은 도시에서 「어디쯤 왔다」를 알려 주는 유일한 단서다. 상단 중앙에 두고
 * 잠깐만 띄운다 — 계속 떠 있으면 화면을 가리고, 안 뜨면 도시가 균질해 보인다.
 */
export function DistrictBanner({
  district,
}: {
  district: { name: string; subtitle: string } | null;
}) {
  if (!district) return null;

  return (
    <div className="pointer-events-none text-center" role="status" aria-live="polite">
      <p className="m-0 text-2xl font-semibold tracking-[0.2em]">{district.name}</p>
      <p className="m-0 mt-1 text-xs opacity-70">{district.subtitle}</p>
    </div>
  );
}

/**
 * 무기를 바꾸면 잠깐 이름을 띄운다.
 *
 * 알아야 하는 순간은 `Q`를 누른 직후뿐이다 — 활과 광선총은 사거리와 길이가
 * 다를 뿐 화면에 다른 물건이 들리지 않아, 바꾼 것이 통했는지 그때 확인할 수
 * 없으면 만들어 두고 안 보이는 것과 같다. 나머지 시간에는 화면을 차지하기만
 * 했다 (DESIGN_GUIDE 「세계가 먼저, UI는 나중에」).
 */
export function WeaponNotice({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <span className="text-[var(--color-text-secondary)]">무기</span>
      <span className="ml-2 font-semibold">{label}</span>
    </div>
  );
}
