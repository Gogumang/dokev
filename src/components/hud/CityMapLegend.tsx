/**
 * 도시 지도의 범례.
 *
 * 색을 캔버스에 직접 쓰면 범례가 조용히 어긋난다 — 실제로 그랬다. 「네모 하나 =
 * 고물 대장」이라고 적혀 있었는데 대장과 일반 로봇은 **같은 빨강**이고 구분은
 * 원/삼각형이라, 지도에 흩어진 빨간 점을 전부 대장으로 읽게 됐다.
 *
 * 그래서 표식은 그림 쪽(`cityMapPaint`)이 정본이고 여기는 **그것을 읽기만**
 * 한다. 색만으로 구분하지 않는다는 원칙과도 맞는다.
 */

import { DISTRICTS, type DistrictId } from "@/game/world/districts";
import { DISTRICT_COLOR, MARKS, SHAPE_CLIP } from "@/game/systems/cityMapPaint";

export function CityMapLegend() {
  return (
    <ul className="m-0 mt-[var(--space-3)] flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
      {(Object.keys(DISTRICT_COLOR) as DistrictId[]).map((id) => (
        <li key={id} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ background: DISTRICT_COLOR[id] }}
          />
          {DISTRICTS[id].name}
        </li>
      ))}
      {Object.entries(MARKS).map(([key, mark]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3"
            style={{ background: mark.color, clipPath: SHAPE_CLIP[mark.shape] }}
          />
          {mark.label}
        </li>
      ))}
    </ul>
  );
}
