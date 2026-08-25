/**
 * 포토 모드의 구도 보조선 — 모양만.
 *
 * 삼분할 선과 가장자리 어둠. 낭독기에는 아무 뜻이 없으므로 통째로 가린다
 * (DESIGN_GUIDE 「아이콘과 일러스트」의 장식 규칙).
 */

export function PhotoGuides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {[33.33, 66.66].map((percent) => (
        <div
          key={`v${percent}`}
          className="absolute top-0 bottom-0 w-px bg-white/20"
          style={{ left: `${percent}%` }}
        />
      ))}
      {[33.33, 66.66].map((percent) => (
        <div
          key={`h${percent}`}
          className="absolute right-0 left-0 h-px bg-white/20"
          style={{ top: `${percent}%` }}
        />
      ))}
    </div>
  );
}
