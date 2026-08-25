import { describe, expect, it } from "vitest";

import { readCode } from "./support/source";

import { BOSS_HOME } from "@/game/combat/bossSim";
import { compassFrom, describeMap } from "@/game/systems/mapSummary";
import { toFullMapPixel } from "@/game/systems/minimap";
import { districtAt } from "@/game/world/districts";

/*
 * 지도를 말로 옮긴 것.
 *
 * 전체 지도는 캔버스라 낭독기에는 아무것도 아니다 — 키보드로 열면 「지도가
 * 있다」까지만 알고 닫게 된다. 문장이 그 구멍을 메우는데, 문장은 조용히
 * 틀리기 쉽다(방위가 뒤집혀도 화면은 멀쩡하다).
 */

describe("방위", () => {
  it("+z가 북, +x가 동이다", () => {
    expect(compassFrom(0, 10)).toBe("북");
    expect(compassFrom(10, 0)).toBe("동");
    expect(compassFrom(0, -10)).toBe("남");
    expect(compassFrom(-10, 0)).toBe("서");
  });

  it("대각선도 갈린다", () => {
    expect(compassFrom(10, 10)).toBe("북동");
    expect(compassFrom(10, -10)).toBe("남동");
    expect(compassFrom(-10, -10)).toBe("남서");
    expect(compassFrom(-10, 10)).toBe("북서");
  });

  it("여덟 방위를 모두 낸다", () => {
    // 하나라도 못 내면 그 방향은 영영 다른 이름으로 불린다
    const seen = new Set<string>();
    for (let deg = 0; deg < 360; deg += 5) {
      const radian = (deg * Math.PI) / 180;
      seen.add(compassFrom(Math.sin(radian), Math.cos(radian)));
    }
    expect([...seen].sort(), `나온 방위: ${[...seen].join(", ")}`).toHaveLength(8);
  });

  it("말한 방향이 지도에 그린 방향과 같다", () => {
    /*
     * 문장과 그림이 어긋나면 둘 중 하나는 거짓말이다. 「북」이라고 말한 지점이
     * 캔버스에서 실제로 **위쪽**(y가 작은 쪽)에 찍히는지 대조한다.
     */
    const center = toFullMapPixel(0, 0, 420);
    const north = toFullMapPixel(0, 40, 420);
    const east = toFullMapPixel(40, 0, 420);

    expect(compassFrom(0, 40)).toBe("북");
    expect(north.y, `북이 위가 아니다 (${north.y} vs ${center.y})`).toBeLessThan(center.y);

    expect(compassFrom(40, 0)).toBe("동");
    expect(east.x, `동이 오른쪽이 아니다 (${east.x} vs ${center.x})`).toBeGreaterThan(center.x);
  });
});

describe("지도 문장", () => {
  const base = { x: 0, z: 0, bossX: BOSS_HOME.x, bossZ: BOSS_HOME.z, enemyCount: 0 };

  it("지금 있는 구역을 말한다", () => {
    const text = describeMap(base);
    expect(text, `문장: ${text}`).toContain(districtAt(0, 0).name);
  });

  it("목표가 있으면 방향과 거리를 말한다", () => {
    const text = describeMap({ ...base, targetX: 0, targetZ: 60 });
    expect(text, `문장: ${text}`).toContain("목표는 북쪽 60m");
  });

  it("목표가 없으면 목표를 말하지 않는다", () => {
    // 「목표 없음」은 알려 주는 것이 없다. 있는 것만 말한다
    expect(describeMap(base)).not.toContain("목표");
  });

  it("바로 위에 서 있으면 방향을 말하지 않는다", () => {
    /*
     * 거리가 0이면 atan2가 아무 값이나 낸다 — 목표에 도착했는데 「남서쪽 0m」로
     * 들리면 아직 갈 곳이 있는 줄 안다.
     */
    const text = describeMap({ ...base, targetX: 1, targetZ: 1 });
    expect(text, `문장: ${text}`).toContain("목표는 바로 여기");
  });

  it("고물 대장은 목표가 없어도 늘 말한다", () => {
    // 지도에 삼각형으로 늘 찍혀 있다. 그림에 있는 것은 글에도 있어야 한다
    expect(describeMap(base)).toContain("고물 대장은");
  });

  it("적이 없을 때와 있을 때가 다르다", () => {
    const empty = describeMap(base);
    const busy = describeMap({ ...base, enemyCount: 3 });
    expect(empty).toContain("고물 로봇이 없다");
    expect(busy, `문장: ${busy}`).toContain("고물 로봇 3기");
  });

  it("찾아갈 자리를 말한다", () => {
    /*
     * 지도에는 몸 색 동그라미로 찍히는데 말로는 한마디도 없었다 — 수집이
     * 이 게임의 축인데 눈으로 못 보는 사람에게는 갈 곳이 없는 도시가 된다.
     */
    const text = describeMap({
      ...base,
      shrines: [
        { name: "그믐", x: 0, z: 80 },
        { name: "물비늘", x: 0, z: 20 },
      ],
    });
    expect(text, `문장: ${text}`).toContain("2곳");
    // 가장 가까운 것을 말해야 한다 — 넷을 다 읊으면 고르는 데 더 걸린다
    expect(text, `문장: ${text}`).toContain("물비늘");
    expect(text).not.toContain("그믐");
  });

  it("자리가 하나면 개수를 세지 않는다", () => {
    // 「1곳, 가장 가까운」은 사람 말이 아니다
    const text = describeMap({ ...base, shrines: [{ name: "그믐", x: 0, z: 30 }] });
    expect(text, `문장: ${text}`).toContain("찾아갈 도깨비 자리는 그믐, 북쪽 30m");
  });

  it("다 만났으면 말하지 않는다", () => {
    // 갈 곳이 없는데 「0곳」이라고 말하면 아직 남은 줄 안다
    expect(describeMap({ ...base, shrines: [] })).not.toContain("도깨비 자리");
  });

  it("조사할 흔적을 말한다", () => {
    /*
     * 지도에 마름모로 찍히는데 글에는 없었다 — 도깨비 자리에서 이미 같은
     * 누락을 겪고도 표식을 더할 때 또 빠뜨렸다.
     */
    const text = describeMap({
      ...base,
      clues: [
        { x: 0, z: 90 },
        { x: 0, z: 30 },
      ],
    });
    expect(text, `문장: ${text}`).toContain("흔적 2곳");
    expect(text, `문장: ${text}`).toContain("북쪽 30m");
  });

  it("여정이 시킨 것을 먼저 말한다", () => {
    // 흔적은 지금 하라고 한 일이다. 도깨비 자리보다 앞에 와야 한다
    const text = describeMap({
      ...base,
      clues: [{ x: 0, z: 30 }],
      shrines: [{ name: "그믐", x: 0, z: 40 }],
    });
    expect(text.indexOf("흔적"), `문장: ${text}`).toBeLessThan(text.indexOf("도깨비 자리"));
  });

  it("다 조사했으면 말하지 않는다", () => {
    expect(describeMap({ ...base, clues: [] })).not.toContain("흔적");
  });

  it("거리가 정수로 나온다", () => {
    // 「52.34999999m」는 읽는 데 방해만 된다
    const text = describeMap({ ...base, targetX: 12.3, targetZ: 45.6 });
    expect(text, `문장: ${text}`).not.toMatch(/\d\.\d+m/);
  });
});

describe("문장이 화면에 닿아 있는가", () => {
  /*
   * 「만들어 두고 연결하지 않으면 없는 것과 같다」를 이번 세션에 여러 번
   * 만났다. 순수 함수는 테스트가 다 통과해도 아무도 안 부르면 그만이다.
   */
  /*
   * 문장은 컴포넌트가 만들고(공유 객체를 표본으로 뜬다), 표식은 그림 쪽이
   * 찍는다. 「그림에 있는 것은 글에도 있어야 한다」를 보려면 둘 다 읽어야 한다.
   */
  const map = readCode("src/components/hud/CityMap.tsx");
  const paint = readCode("src/game/systems/cityMapPaint.ts");

  it("전체 지도가 문장을 부른다", () => {
    expect(map, "describeMap을 부르는 곳이 없다").toContain("describeMap(");
  });

  it("지도에 찍는 표식은 모두 말로도 나온다", () => {
    const map = paint;
    /*
     * 표식을 더할 때 말을 빠뜨리는 일이 두 번 있었다(도깨비 자리, 흔적).
     * 개별 항목을 세는 대신 **표식 목록 자체**와 대조한다 — 다음에 표식이
     * 늘어도 여기서 걸린다.
     */
    const marks = map.slice(map.indexOf("const MARKS = {"), map.indexOf("} as const;"));
    const labels = [...marks.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length, `표식 ${labels.length}종`).toBeGreaterThan(3);

    const summary = readCode("src/game/systems/mapSummary.ts");
    /*
     * 「나」는 말할 것이 없다 — 문장 첫머리가 곧 내 위치다. 나머지는 낱말이
     * 그대로 나와야 한다.
     */
    for (const label of labels) {
      if (label === "나") continue;
      expect(summary, `「${label}」을 말하지 않는다`).toContain(label);
    }
  });

  it("그리는 것과 말하는 것이 같은 목록이다", () => {
    // 지도에 찍는 목록과 다른 것을 말하면 화면과 소리가 어긋난다
    const start = map.indexOf("describeMap({");
    const end = map.indexOf("SUMMARY_MS,", start);
    /*
     * 앵커를 못 찾으면 indexOf가 -1을 내고, slice가 파일 대부분을 돌려주며
     * **아무것도 확인하지 않고 통과한다.** 잘라낸 범위부터 본다.
     */
    expect(start, "문장을 만드는 곳을 못 찾았다").toBeGreaterThan(-1);
    expect(end, "끝 앵커를 못 찾았다").toBeGreaterThan(start);
    const summary = map.slice(start, end);
    expect(summary.length, `잘라낸 길이 ${summary.length}`).toBeLessThan(2000);
    expect(summary, "자리 목록을 넘기지 않는다").toContain("shrines:");
    expect(summary, "지도가 쓰는 목록과 다른 것을 넘긴다").toContain("discoveries");
  });

  it("문장을 실제로 그린다", () => {
    // 계산만 하고 안 그리면 화면에는 여전히 아무것도 없다
    expect(map, "만든 문장을 렌더하지 않는다").toContain("{summary}");
  });

  it("문장이 연 순간에 굳지 않는다", () => {
    /*
     * `stats`는 매 프레임 제자리에서 바뀌는 공유 객체라 리렌더가 없다.
     * 주기적으로 다시 만들지 않으면 지도를 여는 동안 캔버스만 움직이고
     * 글은 그대로다 — 눈으로는 알아채기 어렵다.
     *
     * 손으로 건 타이머를 찾고 있었다. 표본 뜨는 일이 `useSampled` 한 곳으로
     * 모이면서 그 모양이 사라졌다 — 지키려는 것은 **주기적으로 다시 만드는가**이지
     * `setInterval`이라는 글자가 아니다.
     */
    expect(map, "문장을 다시 만드는 주기가 없다").toMatch(/useSampled\([\s\S]*?SUMMARY_MS/);
  });

  it("문장 주기가 그림 주기보다 느리다", () => {
    // 낭독기는 초당 여덟 번 바뀌는 글을 따라올 수 없다
    // 칠하는 주기는 캔버스 쪽으로 옮겨갔다 — 둘이 다른 파일이어도 관계는 그대로다
    const canvas = readCode("src/components/hud/CityMapCanvas.tsx");
    const summaryMs = Number(/const SUMMARY_MS = (\d+)/.exec(map)?.[1]);
    const redrawMs = Number(/const REDRAW_MS = (\d+)/.exec(canvas)?.[1]);
    expect(summaryMs, `SUMMARY_MS=${summaryMs}`).toBeGreaterThan(redrawMs);
  });
});
