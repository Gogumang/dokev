import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

import { DOKEBI_ORDER, nextDokebi } from "@/game/dokebi/roster";
import { PHOTO_POSE_ORDER, nextPhotoPose } from "@/game/player/photoPose";
import { PHOTO_FILTER_ORDER, nextPhotoFilter, photoFilterOrder } from "@/game/systems/photoFilter";
import { TIME_OF_DAY_ORDER, nextTimeOfDay } from "@/game/world/timeOfDay";
import { WEAPON_ORDER, nextWeapon } from "@/game/combat/weapons";

/*
 * 버튼을 눌러 돌리는 것들.
 *
 * 화면에 있는 것은 버튼 하나뿐이고, 그 버튼이 목록을 순환한다. 하나라도
 * 건너뛰면 **만들어 두고 아무도 못 보는 항목**이 된다 — 이 저장소에서
 * 「만들어 두고 연결하지 않으면 없는 것과 같다」를 여러 번 만났다.
 *
 * 조건식을 읽지 않고 실제로 눌러 본다.
 */

function walk<T extends string>(order: readonly T[], step: (id: T) => T): Set<T> {
  const seen = new Set<T>();
  let current = order[0];
  // 목록 길이의 두 배만 눌러도 한 바퀴는 돈다. 안 돌면 그것이 결함이다
  for (let i = 0; i < order.length * 2; i += 1) {
    seen.add(current);
    current = step(current);
  }
  return seen;
}

const CYCLES: {
  name: string;
  /** 정본과 대조할 때 쓰는 함수 이름 */
  fn: string;
  order: readonly string[];
  step: (id: string) => string;
}[] = [
  {
    name: "시간대",
    fn: "nextTimeOfDay",
    order: TIME_OF_DAY_ORDER,
    step: (id) => nextTimeOfDay(id as (typeof TIME_OF_DAY_ORDER)[number]),
  },
  {
    name: "무기",
    fn: "nextWeapon",
    order: WEAPON_ORDER,
    step: (id) => nextWeapon(id as (typeof WEAPON_ORDER)[number]),
  },
  {
    name: "포토 포즈",
    fn: "nextPhotoPose",
    order: PHOTO_POSE_ORDER,
    step: (id) => nextPhotoPose(id as (typeof PHOTO_POSE_ORDER)[number]),
  },
  /*
   * 색보정은 **고를 수 있는 것**을 훑는다. 톤 항목(흑백·또렷하게)은 2D 캔버스가
   * `ctx.filter`를 먹는 곳에서만 존재하므로, 「전체 목록」으로 재면 못 쓰는
   * 환경에서 늘 실패한다. 두 갈래를 각각 본다 — 어느 쪽이든 **고를 수 있는
   * 것은 전부 버튼으로 나와야 한다**는 규칙은 같다.
   */
  {
    name: "색보정(톤 있음)",
    fn: "nextPhotoFilter",
    order: photoFilterOrder(true),
    step: (id) => nextPhotoFilter(id as (typeof PHOTO_FILTER_ORDER)[number], true),
  },
  {
    name: "색보정(톤 없음)",
    fn: "nextPhotoFilter",
    order: photoFilterOrder(false),
    step: (id) => nextPhotoFilter(id as (typeof PHOTO_FILTER_ORDER)[number], false),
  },
];

describe("돌리는 것을 빠뜨리지 않았는가", () => {
  /*
   * 셋을 손으로 적어 두었다. 새 순환(`next*`)이 생기면 조용히 빠지는데,
   * 그러면 그 목록의 항목 하나가 영영 안 나와도 아무도 모른다 — 목록은 아는
   * 것만 담는다.
   *
   * 정본에서 찾아 대조한다. 여기서 다루지 않는 것은 **이유와 함께** 적는다.
   */
  const HANDLED_ELSEWHERE: Record<string, string> = {
    nextDokebi: "잠긴 것을 건너뛰므로 「전부 나온다」가 아니다 — 아래에서 따로 본다",
    nextQuest: "여정은 끝이 있어 순환하지 않는다 — 마지막에서 null을 돌려준다",
  };

  it("정본의 순환을 모두 다룬다", () => {
    const declared = collectSources("src")
      .flatMap((path) => [...readCode(path).matchAll(/export function (next[A-Z]\w*)/g)])
      .map((match) => match[1]);

    expect(declared.length, `찾은 순환 ${declared.length}개`).toBeGreaterThan(3);

    const covered = new Set([
      ...CYCLES.map((cycle) => cycle.fn),
      ...Object.keys(HANDLED_ELSEWHERE),
    ]);
    const missing = declared.filter((name) => !covered.has(name));
    expect(missing, `다루지 않는 순환: ${missing.join(", ")}`).toEqual([]);
  });

  it("예외 목록이 낡지 않았다", () => {
    // 사라진 함수를 계속 면제해 두면 목록이 거짓이 된다
    const sources = collectSources("src").map((path) => readCode(path)).join("\n");
    for (const name of Object.keys(HANDLED_ELSEWHERE)) {
      expect(sources, `${name}이 없다`).toContain(`export function ${name}`);
    }
  });
});

describe("버튼으로 모든 항목에 닿는가", () => {
  it("돌릴 것을 실제로 찾았다", () => {
    // 목록이 비면 아무것도 안 돌면서 통과한다
    for (const cycle of CYCLES) {
      expect(cycle.order.length, `${cycle.name} 목록이 ${cycle.order.length}개`).toBeGreaterThan(1);
    }
  });

  for (const { name, order, step } of CYCLES) {
    it(`${name}를 눌러 나가면 전부 나온다`, () => {
      const seen = walk(order, step);
      const missing = order.filter((id) => !seen.has(id));
      expect(missing, `${name}에서 못 보는 항목: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${name}가 제자리에 머물지 않는다`, () => {
      // 자기 자신을 돌려주면 버튼을 눌러도 화면이 그대로다
      for (const id of order) {
        expect(step(id), `${name} ${id}에서 안 넘어간다`).not.toBe(id);
      }
    });
  }
});

describe("동료 바꾸기가 해금된 것만 돈다", () => {
  /*
   * 동료는 앞의 셋과 다르다 — 잠긴 것을 건너뛰어야 한다. 그래서 「전부
   * 나온다」가 아니라 「**해금된 것은** 전부 나오고, 잠긴 것은 안 나온다」다.
   */
  const ALL = { defeatedTotal: 999, questCompleted: true, bossDefeated: true };

  it("전부 열렸으면 전부 나온다", () => {
    const met = [...DOKEBI_ORDER];
    const seen = new Set<string>();
    let current = DOKEBI_ORDER[0];
    for (let i = 0; i < DOKEBI_ORDER.length * 2; i += 1) {
      seen.add(current);
      current = nextDokebi(current, ALL, met);
    }
    expect([...DOKEBI_ORDER].filter((id) => !seen.has(id)), "못 보는 도깨비").toEqual([]);
  });

  it("잠긴 것은 나오지 않는다", () => {
    // 아무것도 못 만난 상태 — 자리가 있는 도깨비는 전부 잠겨 있다
    const fresh = { defeatedTotal: 0, questCompleted: false, bossDefeated: false };
    const seen = new Set<string>();
    let current = DOKEBI_ORDER[0];
    for (let i = 0; i < DOKEBI_ORDER.length * 2; i += 1) {
      seen.add(current);
      current = nextDokebi(current, fresh, []);
    }
    expect(seen.size, `돌아본 도깨비 ${seen.size}종`).toBe(1);
  });
});
