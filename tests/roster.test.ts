import { readFileSync } from "node:fs";


import { describe, expect, it } from "vitest";

import { readCode, collectSources } from "./support/source";


import {
  companionParty,
  DEFAULT_DOKEBI,
  DOKEBI,
  DOKEBI_ORDER,
  dokebiPreset,
  FINDABLE_DOKEBI,
  isUnlocked,
  discoverAt,
  DISCOVERY_RADIUS,
  newlyUnlocked,
  nextDokebi,
  pendingDiscoveries,
  projectDiscovery,
  consumeDiscovery,
  revealedDokebi,
  unlockedDokebi,
  unlockHint,
  unlockRatio,
  type DokebiId,
  type DokebiProgress,
} from "@/game/dokebi/roster";

const FRESH: DokebiProgress = { defeatedTotal: 0, questCompleted: false };
/*
 * 모든 조건을 채운 상태. 보스까지 눕힌 사람이다.
 *
 * `bossDefeated`를 빠뜨리면 「전부 채웠다」는 이름과 달리 네 번째가 빠진다 —
 * 조건을 늘릴 때 이 픽스처부터 고쳐야 한다.
 */
const VETERAN: DokebiProgress = { defeatedTotal: 40, questCompleted: true, bossDefeated: true };

describe("DOKEBI", () => {
  it("순서에 빠진 도깨비가 없다", () => {
    const ids = Object.keys(DOKEBI) as DokebiId[];
    expect([...DOKEBI_ORDER].sort()).toEqual([...ids].sort());
  });

  it("이름·소개·성격·능력이 모두 채워져 있다", () => {
    // 도감에 빈칸이 보이면 미완성으로 읽힌다
    for (const spirit of Object.values(DOKEBI)) {
      for (const key of ["name", "tagline", "personality", "abilityName", "ability"] as const) {
        expect(spirit[key].length, `${spirit.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("몸 색과 강조 색이 서로 다르다", () => {
    // 같으면 고리와 꼬리가 몸통에 묻혀 실루엣이 뭉친다
    for (const spirit of Object.values(DOKEBI)) {
      expect(spirit.bodyColor, `${spirit.id}`).not.toBe(spirit.accentColor);
    }
  });

  it("첫 도깨비는 조건 없이 함께 있다", () => {
    // 첫 동료가 잠겨 있으면 시작이 외롭다
    expect(DOKEBI[DEFAULT_DOKEBI].requiredDefeats).toBe(0);
    expect(DOKEBI[DEFAULT_DOKEBI].requiresQuest).toBe(false);
  });
});

describe("unlockedDokebi", () => {
  it("시작하면 초롱 하나만 있다", () => {
    expect(unlockedDokebi(FRESH, [])).toEqual([DEFAULT_DOKEBI]);
  });

  it("조건을 채우면 자리가 드러난다 — 아직 부를 수는 없다", () => {
    const progress = { defeatedTotal: DOKEBI.geueum.requiredDefeats, questCompleted: false };

    expect(revealedDokebi(progress), `defeated=${progress.defeatedTotal}`).toContain("geueum");
    // 조건만으로 열리면 도시를 돌 이유가 없다
    expect(unlockedDokebi(progress, [])).not.toContain("geueum");
  });

  it("찾아가 만나야 부를 수 있다", () => {
    const progress = { defeatedTotal: DOKEBI.geueum.requiredDefeats, questCompleted: false };
    expect(unlockedDokebi(progress, ["geueum"])).toContain("geueum");
  });

  it("만나도 조건이 풀리면 부를 수 없다", () => {
    // 진행을 지우면 처치 수가 0으로 돌아간다. 저장된 만남만으로 열리면 안 된다.
    expect(unlockedDokebi(FRESH, ["geueum"])).not.toContain("geueum");
  });

  it("한 기 모자라면 자리도 드러나지 않는다", () => {
    // 경계에서 어긋나면 조건이 사실상 한 기 어긋난 채로 굳는다
    const progress = { defeatedTotal: DOKEBI.geueum.requiredDefeats - 1, questCompleted: false };
    expect(revealedDokebi(progress)).not.toContain("geueum");
  });

  it("퀘스트를 마쳐야 물비늘 자리가 드러난다", () => {
    expect(revealedDokebi({ defeatedTotal: 999, questCompleted: false })).not.toContain(
      "mulbineul",
    );
    expect(revealedDokebi({ defeatedTotal: 0, questCompleted: true })).toContain("mulbineul");
  });

  it("전부 채우고 전부 만나면 모두 나온다", () => {
    expect(unlockedDokebi(VETERAN, [...DOKEBI_ORDER])).toEqual([...DOKEBI_ORDER]);
  });

  it("해금 순서를 유지한다", () => {
    // 도감에서 빈칸의 위치가 고정되어야 한다
    const unlocked = unlockedDokebi(VETERAN, [...DOKEBI_ORDER]);
    expect(unlocked).toEqual(DOKEBI_ORDER.filter((id) => unlocked.includes(id)));
  });
});

describe("nextDokebi", () => {
  it("하나뿐이면 그대로 둔다", () => {
    // 잠긴 도깨비로 바뀌었다가 되돌아오는 것보다 아무 일이 없는 편이 낫다
    expect(nextDokebi("chorong", FRESH, [])).toBe("chorong");
  });

  it("잠긴 도깨비는 건너뛴다", () => {
    const progress = { defeatedTotal: 0, questCompleted: true };
    // 만난 것: chorong, mulbineul (geueum은 처치 수 미달)
    expect(nextDokebi("chorong", progress, ["mulbineul"])).toBe("mulbineul");
    expect(nextDokebi("mulbineul", progress, ["mulbineul"])).toBe("chorong");
  });

  it("한 바퀴 돌면 제자리로 온다", () => {
    let id: DokebiId = DEFAULT_DOKEBI;
    const met = [...DOKEBI_ORDER];
    for (let i = 0; i < DOKEBI_ORDER.length; i += 1) id = nextDokebi(id, VETERAN, met);
    expect(id).toBe(DEFAULT_DOKEBI);
  });

  it("데리고 있던 도깨비가 잠겨 있으면 첫 번째로 되돌린다", () => {
    // 저장값이 낡았을 때 — 진행을 지우면 처치 수가 0으로 돌아간다
    expect(nextDokebi("mulbineul", FRESH, ["mulbineul"])).toBe("chorong");
  });
});

describe("능력 효과", () => {
  it("도깨비마다 효과가 다르다", () => {
    // 이름만 다르고 효과가 같으면 도감이 카탈로그일 뿐 고를 이유가 없다
    const shapes = DOKEBI_ORDER.map((id) => JSON.stringify(DOKEBI[id].effect));
    expect(new Set(shapes).size, `effects: ${shapes.join(" | ")}`).toBe(DOKEBI_ORDER.length);
  });

  it("모든 배율이 양수다", () => {
    // 0이면 빛이 꺼지고 음수면 회복이 피해가 된다
    for (const spirit of Object.values(DOKEBI)) {
      const { lightScale, lightRangeScale, aggroScale, regenScale } = spirit.effect;
      for (const [key, value] of Object.entries({
        lightScale,
        lightRangeScale,
        aggroScale,
        regenScale,
      })) {
        expect(value, `${spirit.id}.${key} = ${value}`).toBeGreaterThan(0);
      }
    }
  });

  it("대기가 지속보다 길다", () => {
    // 짧으면 능력이 끝나기 전에 다시 켤 수 있어 상시 발동이 된다
    for (const spirit of Object.values(DOKEBI)) {
      expect(
        spirit.effect.cooldownSeconds,
        `${spirit.id}: duration=${spirit.effect.durationSeconds}, cooldown=${spirit.effect.cooldownSeconds}`,
      ).toBeGreaterThan(spirit.effect.durationSeconds);
    }
  });

  it("그을음만 몸을 감춘다", () => {
    expect(DOKEBI.geueum.effect.aggroScale).toBeLessThan(1);
    expect(DOKEBI.chorong.effect.aggroScale).toBe(1);
    expect(DOKEBI.mulbineul.effect.aggroScale).toBe(1);
  });

  it("물비늘만 회복을 앞당긴다", () => {
    expect(DOKEBI.mulbineul.effect.regenScale).toBeGreaterThan(1);
    expect(DOKEBI.chorong.effect.regenScale).toBe(1);
    expect(DOKEBI.geueum.effect.regenScale).toBe(1);
  });

  it("초롱이 가장 밝다", () => {
    // 탐색형이라는 설명과 숫자가 어긋나면 안 된다
    for (const spirit of Object.values(DOKEBI)) {
      if (spirit.id === "chorong") continue;
      expect(spirit.effect.lightScale, `${spirit.id}`).toBeLessThan(
        DOKEBI.chorong.effect.lightScale,
      );
    }
  });
});

describe("unlockHint / unlockRatio", () => {
  it("모든 도깨비가 조건을 한 줄로 알려 준다", () => {
    // 조건을 숨기면 도감이 목표가 아니라 벽이 된다
    for (const spirit of Object.values(DOKEBI)) {
      expect(unlockHint(spirit).length, `${spirit.id}`).toBeGreaterThan(0);
    }
  });

  it("처치 조건은 숫자를 그대로 보여 준다", () => {
    // 막연한 문구면 몇 기가 남았는지 셀 수 없다
    expect(unlockHint(DOKEBI.geueum)).toContain(String(DOKEBI.geueum.requiredDefeats));
  });

  it("조건을 채운 도깨비의 진행도는 1이다", () => {
    expect(unlockRatio(DOKEBI.chorong, FRESH, [])).toBe(1);
    expect(unlockRatio(DOKEBI.geueum, VETERAN, [])).toBe(1);
  });

  it("처치 조건은 진행도가 비례해서 오른다", () => {
    const half = Math.floor(DOKEBI.geueum.requiredDefeats / 2);
    const ratio = unlockRatio(DOKEBI.geueum, { defeatedTotal: half, questCompleted: false }, []);
    expect(ratio, `ratio was: ${ratio}`).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });

  it("퀘스트 조건은 달성 전까지 0이다", () => {
    // 중간 단계를 진행률로 보여 주면 "거의 다 왔다"는 잘못된 인상을 준다
    const ratio = unlockRatio(DOKEBI.mulbineul, { defeatedTotal: 999, questCompleted: false }, []);
    expect(ratio, `ratio was: ${ratio}`).toBe(0);
  });

  it("진행도가 1을 넘지 않는다", () => {
    // 넘으면 막대가 칸 밖으로 삐져나간다
    const ratio = unlockRatio(DOKEBI.geueum, { defeatedTotal: 9999, questCompleted: false }, []);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

describe("newlyUnlocked", () => {
  it("새로 들어온 것만 알려 준다", () => {
    expect(newlyUnlocked(["chorong"], ["chorong", "geueum"])).toEqual(["geueum"]);
  });

  it("변화가 없으면 빈 배열", () => {
    // 매 확인마다 알림이 뜨면 화면이 시끄럽다
    expect(newlyUnlocked(["chorong", "geueum"], ["chorong", "geueum"])).toEqual([]);
  });

  it("한 번에 둘이 열릴 수도 있다", () => {
    expect(newlyUnlocked([], ["chorong", "geueum"])).toEqual(["chorong", "geueum"]);
  });

  it("사라진 것은 보고하지 않는다", () => {
    // 진행을 지우면 목록이 줄어든다. 그때 알림이 뜨면 안 된다.
    expect(newlyUnlocked(["chorong", "geueum"], ["chorong"])).toEqual([]);
  });

  it("순서를 현재 목록 기준으로 유지한다", () => {
    const fresh = newlyUnlocked(["chorong"], [...DOKEBI_ORDER]);
    expect(fresh).toEqual(DOKEBI_ORDER.filter((id) => id !== "chorong"));
  });
});

describe("isUnlocked / dokebiPreset", () => {
  it("해금 여부를 그대로 알려 준다", () => {
    expect(isUnlocked("geueum", FRESH, [])).toBe(false);
    expect(isUnlocked("geueum", VETERAN, ["geueum"])).toBe(true);
  });

  it("모르는 id는 기본값", () => {
    expect(dokebiPreset("ghost").id).toBe(DEFAULT_DOKEBI);
  });
});

describe("도깨비 찾아가기", () => {
  const READY: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  it("초롱은 찾아갈 자리가 없다", () => {
    // 처음부터 함께 있는 도깨비를 찾아가라고 하면 갈 곳이 없다
    expect(DOKEBI.chorong.home).toBeNull();
  });

  it("나머지는 자리가 있고 서로 떨어져 있다", () => {
    // 둘을 같은 방향에 두면 한 번에 지나친다
    const geueum = DOKEBI.geueum.home;
    const mulbineul = DOKEBI.mulbineul.home;
    expect(geueum).not.toBeNull();
    expect(mulbineul).not.toBeNull();
    if (!geueum || !mulbineul) return;

    const gap = Math.hypot(geueum.x - mulbineul.x, geueum.z - mulbineul.z);
    expect(gap, `gap was: ${gap}`).toBeGreaterThan(DISCOVERY_RADIUS * 6);
  });

  it("자리가 스폰 지점에서 멀다", () => {
    // 시작하자마자 둘 다 만나면 찾아가는 의미가 없다
    for (const spirit of pendingDiscoveries(READY, [])) {
      if (!spirit.home) continue;
      const fromSpawn = Math.hypot(spirit.home.x, spirit.home.z);
      expect(fromSpawn, `${spirit.id} was ${fromSpawn}m from spawn`).toBeGreaterThan(40);
    }
  });

  /*
   * 개수를 박아 두지 않는다. 도깨비를 하나 늘릴 때마다 관계없는 테스트를
   * 고쳐야 하면, 고치는 김에 의미까지 흐려진다 — 찾아갈 자리가 있는 도깨비
   * 전부가 표식이 된다는 것이 규칙이다.
   */
  const WITH_HOME = DOKEBI_ORDER.filter((id) => DOKEBI[id].home !== null);

  it("조건을 채워야 표식이 뜬다", () => {
    expect(pendingDiscoveries(FRESH, [])).toEqual([]);
    expect(pendingDiscoveries(READY, []).map((spirit) => spirit.id)).toEqual(WITH_HOME);
  });

  it("만난 뒤에는 표식이 사라진다", () => {
    // 갈 곳이 아닌데 계속 부르면 안 된다
    const met = WITH_HOME[0];
    const rest = pendingDiscoveries(READY, [met]);
    expect(rest.map((spirit) => spirit.id)).toEqual(WITH_HOME.filter((id) => id !== met));
  });

  it("자리에 닿으면 만난다", () => {
    const home = DOKEBI.geueum.home;
    if (!home) throw new Error("그을음의 자리가 없다");
    expect(discoverAt(home.x, home.z, READY, [])).toBe("geueum");
  });

  it("반경을 벗어나면 만나지 못한다", () => {
    const home = DOKEBI.geueum.home;
    if (!home) throw new Error("그을음의 자리가 없다");
    expect(discoverAt(home.x + DISCOVERY_RADIUS + 1, home.z, READY, [])).toBeNull();
  });

  it("자리에 다다르면 만난다 — 정확히 밟지 않아도", () => {
    /*
     * 반경 밖만 보고 있었다. 반경을 0.01m로 줄여도 통과했다 — 그러면 픽셀
     * 단위로 서야 만나는 도깨비가 된다.
     *
     * 달리기 속도는 초당 7.4m다. 한 프레임에 12cm를 지나가므로, 뛰어가다
     * 자리를 지나칠 때 걸릴 만큼은 넓어야 한다.
     */
    const spirit = DOKEBI[DOKEBI_ORDER.find((id) => DOKEBI[id].home !== null) ?? "geueum"];
    const home = spirit.home;
    expect(home, "자리가 있는 도깨비가 없다").toBeTruthy();
    if (!home) return;

    for (const offset of [1, 3, 5]) {
      expect(
        discoverAt(home.x + offset, home.z, READY, []),
        `${offset}m 옆에서 못 만난다 (반경 ${DISCOVERY_RADIUS}m)`,
      ).toBe(spirit.id);
    }
  });

  it("조건을 못 채웠으면 자리에 서 있어도 만나지 못한다", () => {
    const home = DOKEBI.geueum.home;
    if (!home) throw new Error("그을음의 자리가 없다");
    expect(discoverAt(home.x, home.z, FRESH, [])).toBeNull();
  });

  it("이미 만났으면 다시 만나지 않는다", () => {
    // 알림이 지나갈 때마다 다시 뜨면 시끄럽다
    const home = DOKEBI.geueum.home;
    if (!home) throw new Error("그을음의 자리가 없다");
    expect(discoverAt(home.x, home.z, READY, ["geueum"])).toBeNull();
  });
});

describe("companionParty", () => {
  const READY: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  it("고른 도깨비가 맨 앞이다", () => {
    // 데리고 다니기로 고른 동료가 뒤에 서 있으면 선택이 무의미해 보인다
    const party = companionParty("mulbineul", READY, [...DOKEBI_ORDER]);
    expect(party[0]).toBe("mulbineul");
  });

  it("해금된 도깨비만 따라온다", () => {
    /*
     * 만난 기록만 보고 데리고 다니면, 진행을 지운 뒤 도감에는 잠긴 것으로
     * 보이는 도깨비가 월드에서는 계속 따라다닌다.
     */
    const party = companionParty("chorong", FRESH, [...DOKEBI_ORDER]);
    expect(party, `party: ${party.join(",")}`).toEqual(["chorong"]);
  });

  it("고른 도깨비가 잠겼으면 첫 도깨비로 되돌린다", () => {
    // 아무도 안 따라오는 것보다 낫다
    const party = companionParty("geueum", FRESH, [...DOKEBI_ORDER]);
    expect(party[0]).toBe(DEFAULT_DOKEBI);
  });

  it("중복 없이 한 번씩만 나온다", () => {
    // 같은 도깨비가 두 자리에 서면 하나가 다른 하나를 그대로 가린다
    const party = companionParty("geueum", READY, [...DOKEBI_ORDER]);
    expect(new Set(party).size).toBe(party.length);
  });

  it("만난 도깨비가 모두 따라온다", () => {
    const party = companionParty("chorong", READY, [...DOKEBI_ORDER]);
    expect(party.length).toBe(DOKEBI_ORDER.length);
  });

  it("아무것도 못 만났어도 혼자는 아니다", () => {
    const party = companionParty("chorong", FRESH, []);
    expect(party.length).toBeGreaterThan(0);
  });
});

describe("자리와 표식이 같은 규칙을 쓰는가", () => {
  it("자리 오브젝트와 지도 표식이 같은 함수에서 나온다", () => {
    /*
     * 각자 목록을 만들면 표식은 있는데 자리가 없거나, 자리는 있는데 표식이
     * 없는 일이 생긴다. 소스를 읽어 같은 함수를 쓰는지 확인한다.
     */
    const shrine = readFileSync("src/game/dokebi/Shrine.tsx", "utf8");
    const hud = readFileSync("src/components/hud/WorldHud.tsx", "utf8");

    expect(shrine, "자리 오브젝트가 목록을 직접 만들고 있다").toContain("pendingDiscoveries");
    expect(hud, "지도가 목록을 직접 만들고 있다").toContain("pendingDiscoveries");
  });

  it("동행 목록도 정본을 거친다", () => {
    // 반복 67에서 잠긴 도깨비가 따라다니던 원인
    const play = readFileSync("src/app/play/PlayClient.tsx", "utf8");
    expect(play).toContain("companionParty");
  });
});

describe("보스 처치 보상", () => {
  /*
   * 절정을 넘긴 보상이 대사 한 줄뿐이었다. 네 번째 도깨비를 보스 조건으로
   * 걸어 수집 루프를 절정과 이었다.
   */
  it("보스를 눕히기 전에는 자리도 드러나지 않는다", () => {
    const before = revealedDokebi({ defeatedTotal: 9999, questCompleted: true });
    expect(before, "다른 조건만으로 열렸다").not.toContain("jajeong");
  });

  it("보스를 눕히면 자리가 드러난다", () => {
    const after = revealedDokebi({ defeatedTotal: 0, questCompleted: false, bossDefeated: true });
    expect(after).toContain("jajeong");
  });

  it("조건을 읽는 모든 곳이 보스 여부를 넘긴다", () => {
    /*
     * 한 곳이라도 빠지면 **도감은 잠겼다는데 자리에는 빛기둥이 서는** 식으로
     * 어긋난다. 이번 세션에서 같은 종류(이어받은 처치 수가 한 곳에만 반영됨)를
     * 이미 겪었다.
     */
    const missing: string[] = [];
    // 0건이면 정규식이 깨진 것이다 — 빈 목록은 통과가 아니라 신호다
    let checked = 0;
    for (const path of collectSources("src")) {
      const source = readCode(path);
      // `questCompleted:` 를 쓰는 객체 리터럴은 진행도를 만드는 곳이다
      for (const match of source.matchAll(/questCompleted[:,]/g)) {
        const around = source.slice(Math.max(0, match.index - 260), match.index + 260);
        // 저장 레코드에는 단계 번호가 함께 있다 — 해금 조건을 만드는 곳이 아니다
        if (around.includes("questStepIndex")) continue;
        checked += 1;
        if (!around.includes("bossDefeated")) missing.push(path);
      }
    }
    expect([...new Set(missing)], "보스 여부를 빠뜨린 곳").toEqual([]);
    expect(checked, `진행도를 만드는 곳을 ${checked}군데 찾았다`).toBeGreaterThan(4);
  });
});

describe("여정이 넘어가도 만난 도깨비가 남는가", () => {
  /*
   * 해금 조건이 **지금 여정의 완료 여부**를 읽고 있었다. 첫 여정을 마치면
   * 보스 여정으로 넘어가면서 그 값이 다시 거짓이 되고, **이미 만난 물비늘이
   * 사라졌다.** 도감에서도 「???」로 되돌아갔다.
   *
   * 화면(도감 3/4)을 보고서야 알았다 — 조건을 손으로 참으로 넣은 테스트는
   * 이 상황을 만들지 못했다.
   */
  it("첫 여정을 마친 뒤에는 조건이 유지되어야 한다", () => {
    const met: DokebiId[] = ["mulbineul"];
    const duringFirstQuest = unlockedDokebi({ defeatedTotal: 0, questCompleted: true }, met);
    expect(duringFirstQuest, "첫 여정을 막 마친 시점").toContain("mulbineul");

    // 보스 여정으로 넘어간 뒤에도 같아야 한다 — questCompleted는 유지된 값이다
    const afterChainAdvance = unlockedDokebi({ defeatedTotal: 0, questCompleted: true }, met);
    expect(afterChainAdvance, "여정이 바뀐 뒤").toContain("mulbineul");
  });

  it("첫 여정 완료가 여정이 바뀌어도 유지된다", () => {
    /*
     * 유지 규칙 자체는 이제 `projectQuestView`가 갖고 있고, 값으로 재는 검사는
     * `tests/questRunner.test.ts`의 「첫 여정을 마치면 켜진 채로 남는다」에 있다.
     * 원래 여기서는 `PlayerRig`가 그 코드를 담고 있는지 글자로 봤는데, 코드가
     * 모듈로 이사하면서 깨졌다 — **결함이 아니라 이사**다.
     *
     * 여기 남기는 것은 **다른 데서 되살아나는 것**을 막는 규칙이다: 어디서든
     * 해금 조건을 「지금 여정의 완료 여부」로 읽으면 같은 버그가 돌아온다.
     */
    const holder = readCode("src/game/quest/questRunner.ts");
    expect(holder, "유지 규칙을 아무도 안 갖고 있다").toContain("view.firstQuestDone");

    for (const path of collectSources("src")) {
      const source = readCode(path);
      expect(
        source.includes("questCompleted: questView.completed"),
        `${path}가 지금 여정의 완료 여부를 해금 조건으로 쓴다`,
      ).toBe(false);
    }
  });
});

describe("완주 화면의 수집 숫자가 도달 가능한가", () => {
  /*
   * 「만난 도깨비 n / 전체」로 세고 있었다. 그런데 초롱은 처음부터 함께 있어
   * `home`이 없고, `discoverAt`는 자리 있는 도깨비만 돌려주므로 **만남
   * 목록에 영영 들어가지 않는다** — 다 모아도 3/4에서 멈춰, 마지막 화면이
   * 아직 남았다고 거짓말을 했다. 정작 그 숫자를 넣은 이유가 「남은 하나를
   * 알려 주려고」였다.
   */
  it("만남 목록에 들어갈 수 있는 것만 센다", () => {
    for (const id of FINDABLE_DOKEBI) {
      expect(DOKEBI[id].home, `${id}에 자리가 없다`).not.toBeNull();
    }
  });

  it("자리 없는 도깨비는 분모에서 빠진다", () => {
    const homeless = DOKEBI_ORDER.filter((id) => DOKEBI[id].home === null);
    expect(homeless.length, "자리 없는 도깨비가 하나도 없다").toBeGreaterThan(0);
    for (const id of homeless) {
      expect(FINDABLE_DOKEBI, `${id}는 만날 수 없는데 분모에 있다`).not.toContain(id);
    }
  });

  it("전부 찾아가면 가득 찬다", () => {
    /*
     * 실제로 자리마다 걸어가 본다. 도달 가능성을 조건식으로 추론하지 않고
     * `discoverAt`가 정말 돌려주는지로 확인한다.
     */
    const progress = { defeatedTotal: 999, questCompleted: true, bossDefeated: true };
    const met: DokebiId[] = [];
    for (const id of FINDABLE_DOKEBI) {
      const home = DOKEBI[id].home;
      expect(home, `${id}에 자리가 없다`).toBeTruthy();
      if (!home) continue;
      const found = discoverAt(home.x, home.z, progress, met);
      expect(found, `${id} 자리에서 아무도 못 만났다`).toBe(id);
      met.push(id);
    }
    expect(met.length, `만난 수 ${met.length}`).toBe(FINDABLE_DOKEBI.length);
  });

  it("완주 화면이 그 분모를 쓴다", () => {
    // 정본을 만들어 두고 화면이 예전 숫자를 쓰면 고친 것이 아니다
    const panel = readCode("src/components/hud/StatusPanels.tsx");
    const row = panel.slice(panel.indexOf('"만난 도깨비"'), panel.indexOf('"만난 도깨비"') + 200);
    expect(row, "찾을 수 있는 수를 분모로 쓰지 않는다").toContain("FINDABLE_DOKEBI.length");
  });
});

describe("해금 안내가 실제 조건과 맞는가", () => {
  /*
   * 조건마다 `if`로 하나씩 돌려주다가 보스 조건을 빠뜨렸다. 그러면 마지막
   * 줄로 떨어져 **잠긴 도깨비가 「처음부터 함께 있다」고 안내했다** —
   * 「자정」이 도감에서 그렇게 보였다. 조건을 숨기면 도감이 목표가 아니라
   * 벽이 된다고 그 함수 위에 적어 두고서.
   *
   * 조건 종류가 늘 때 또 빠뜨리지 않도록 정본에서 훑는다.
   */
  it("조건이 있는 도깨비는 처음부터 함께 있다고 말하지 않는다", () => {
    const conditional = DOKEBI_ORDER.filter((id) => {
      const spirit = DOKEBI[id];
      return spirit.requiresQuest || spirit.requiresBoss || spirit.requiredDefeats > 0;
    });
    expect(conditional.length, "조건 있는 도깨비가 없다").toBeGreaterThan(0);
    for (const id of conditional) {
      expect(unlockHint(DOKEBI[id]), `${id}: ${unlockHint(DOKEBI[id])}`).not.toBe(
        "처음부터 함께 있다",
      );
    }
  });

  it("보스 조건은 대장을 언급한다", () => {
    const bossOnly = DOKEBI_ORDER.filter((id) => DOKEBI[id].requiresBoss);
    expect(bossOnly.length, "보스 조건 도깨비가 없다").toBeGreaterThan(0);
    for (const id of bossOnly) {
      expect(unlockHint(DOKEBI[id]), `${id} 안내: ${unlockHint(DOKEBI[id])}`).toContain("대장");
    }
  });

  it("처치 조건은 숫자를 그대로 말한다", () => {
    // 「여러 기」처럼 뭉개면 얼마나 남았는지 알 수 없다
    for (const id of DOKEBI_ORDER) {
      const spirit = DOKEBI[id];
      if (spirit.requiredDefeats <= 0) continue;
      expect(unlockHint(spirit), `${id} 안내`).toContain(String(spirit.requiredDefeats));
    }
  });

  it("여정 조건은 여정을 언급한다", () => {
    for (const id of DOKEBI_ORDER) {
      if (!DOKEBI[id].requiresQuest) continue;
      expect(unlockHint(DOKEBI[id]), `${id} 안내`).toContain("여정");
    }
  });

  it("조건이 둘이면 둘 다 말한다", () => {
    /*
     * 지금 정본에는 조건이 둘인 도깨비가 없다. 규칙 자체를 검사한다 —
     * 하나만 말하는 구현으로 되돌아가면 여기서 걸린다.
     */
    const both = { ...DOKEBI.jajeong, requiresQuest: true, requiredDefeats: 5 };
    const hint = unlockHint(both);
    expect(hint, `안내: ${hint}`).toContain("여정");
    expect(hint, `안내: ${hint}`).toContain("대장");
    expect(hint, `안내: ${hint}`).toContain("5");
  });

  it("조건이 없으면 처음부터 함께 있다", () => {
    const free = DOKEBI_ORDER.filter((id) => {
      const spirit = DOKEBI[id];
      return !spirit.requiresQuest && !spirit.requiresBoss && spirit.requiredDefeats === 0;
    });
    expect(free.length, "처음부터 함께 있는 도깨비가 없다").toBeGreaterThan(0);
    for (const id of free) {
      expect(unlockHint(DOKEBI[id])).toBe("처음부터 함께 있다");
    }
  });
});

describe("조건이 늘면 안내도 따라오는가", () => {
  /*
   * `requiresBoss`를 더하면서 판정(`revealedDokebi`)에만 넣고 안내
   * (`unlockHint`)에는 빠뜨렸다. 그래서 「자정」은 **잠긴 채로 「처음부터
   * 함께 있다」**고 안내됐다.
   *
   * 조건 필드가 늘 때 한쪽만 고치는 것을 막는다.
   */
  const source = readCode("src/game/dokebi/roster.ts");

  const fields = [
    ...source
      .slice(source.indexOf("export interface DokebiSpirit"), source.indexOf("export const DOKEBI"))
      .matchAll(/^\s+(requires\w+|required\w+):/gm),
  ].map((m) => m[1]);

  it("조건 필드를 실제로 읽었다", () => {
    // 인터페이스 이름이 바뀌면 빈 목록을 훑으며 통과한다
    expect(fields.length, `찾은 조건 필드: ${fields.join(", ") || "없음"}`).toBeGreaterThan(2);
  });

  function bodyOf(name: string): string {
    const start = source.indexOf(`export function ${name}`);
    expect(start, `${name}을 못 찾았다`).toBeGreaterThan(-1);
    const body = source.slice(start);
    return body.slice(0, body.indexOf("\n}"));
  }

  it("판정과 안내가 같은 조건을 본다", () => {
    const judge = bodyOf("revealedDokebi");
    const hint = bodyOf("unlockHint");
    for (const field of fields) {
      expect(judge, `판정이 ${field}를 안 본다`).toContain(field);
      expect(hint, `안내가 ${field}를 안 말한다`).toContain(field);
    }
  });
});

describe("능력이 실제로 무언가를 바꾸는가", () => {
  /*
   * 「자정」의 빛 범위 배율을 1로 되돌려도 모든 검사가 통과했다 — 능력 이름
   * 「먼 불빛」이 도감에 뜨고 버튼도 눌리는데 **아무 일도 일어나지 않는다.**
   * 조작표가 약속한 것이 값 때문에 헛말이 되는 유형이다.
   *
   * 도깨비마다 바꾸는 것이 다르므로(빛·인지·회복) 개별로 적지 않고,
   * **하나라도 1이 아닌 배율이 있는가**로 본다. 도깨비가 늘어도 따라온다.
   */
  const SCALES = ["lightScale", "lightRangeScale", "aggroScale", "regenScale"] as const;

  it("배율 이름이 실제 필드와 맞는다", () => {
    // 이름이 바뀌면 아무것도 훑지 않고 통과한다
    const effect = DOKEBI[DOKEBI_ORDER[0]].effect as unknown as Record<string, unknown>;
    for (const key of SCALES) {
      expect(effect[key], `${key} 필드가 없다`).toBeTypeOf("number");
    }
  });

  it("모든 도깨비가 무언가를 바꾼다", () => {
    for (const id of DOKEBI_ORDER) {
      const effect = DOKEBI[id].effect as unknown as Record<string, number>;
      const changed = SCALES.filter((key) => effect[key] !== 1);
      expect(
        changed.length,
        `${id}의 능력이 아무것도 바꾸지 않는다 (${SCALES.map((k) => `${k}=${effect[k]}`).join(", ")})`,
      ).toBeGreaterThan(0);
    }
  });

  it("이름이 말하는 것을 실제로 바꾼다", () => {
    /*
     * 위 규칙은 「아무것도 안 바꾸는 능력」만 잡는다. 「자정」은 빛 세기가
     * 1.2라서 **범위 배율을 1로 되돌려도** 통과했다 — 그런데 그 능력의 이름은
     * 「먼 불빛」이고, 파는 것은 세기가 아니라 **거리**다.
     *
     * 이름과 값을 잇는다. 낱말이 들어 있으면 그에 해당하는 배율이 살아 있어야
     * 한다 — 이름을 바꾸면 이 검사도 함께 봐야 한다는 뜻이고, 그것이 맞다.
     */
    const NAMED: { word: string; scale: keyof typeof DOKEBI.chorong.effect }[] = [
      { word: "먼", scale: "lightRangeScale" },
      { word: "불빛", scale: "lightScale" },
    ];

    let checked = 0;
    for (const id of DOKEBI_ORDER) {
      const spirit = DOKEBI[id];
      for (const { word, scale } of NAMED) {
        if (!spirit.abilityName.includes(word)) continue;
        checked += 1;
        expect(
          spirit.effect[scale],
          `${id}의 능력은 「${spirit.abilityName}」인데 ${scale}이 ${spirit.effect[scale]}이다`,
        ).not.toBe(1);
      }
    }
    expect(checked, `이름과 이은 능력 ${checked}개`).toBeGreaterThan(0);
  });

  it("능력이 잠깐이라도 지속된다", () => {
    // 0초면 눌린 프레임에만 걸려 사람 눈에는 아무 일도 없다
    for (const id of DOKEBI_ORDER) {
      expect(DOKEBI[id].effect.durationSeconds, `${id}`).toBeGreaterThan(1);
    }
  });

  it("다시 쓰기까지가 지속 시간보다 길다", () => {
    // 짧으면 끊김 없이 계속 켜 둘 수 있어 「능력」이 아니라 기본 상태가 된다
    for (const id of DOKEBI_ORDER) {
      const effect = DOKEBI[id].effect;
      expect(
        effect.cooldownSeconds,
        `${id}: 지속 ${effect.durationSeconds}초 vs 대기 ${effect.cooldownSeconds}초`,
      ).toBeGreaterThan(effect.durationSeconds);
    }
  });
});

describe("만난 목록을 빠뜨릴 수 없는가", () => {
  /*
   * `met`에 기본값 `[]`가 있었다. 빠뜨리면 **자리가 있는 도깨비는 이미 함께
   * 다녀도 「못 만난 것」**이 되는데, 타입도 검사도 아무 말을 하지 않는다 —
   * 실제로 도감이 진행도를 구할 때 빠뜨리고 있었다.
   *
   * 지금은 필수 인자라 빠뜨리면 컴파일이 막는다. 기본값이 다시 생기는 것을
   * 여기서 막는다.
   */
  const source = readCode("src/game/dokebi/roster.ts");

  it("해금 판정에 기본값이 없다", () => {
    const withDefault = [...source.matchAll(/met: readonly DokebiId\[\] = \[\]/g)];
    expect(
      withDefault.length,
      `기본값을 둔 곳 ${withDefault.length}군데 — 빠뜨려도 조용히 잠긴 것이 된다`,
    ).toBe(0);
  });

  it("만난 목록이 실제로 판정을 바꾼다", () => {
    /*
     * 기본값이 없어도 빈 목록을 넘기면 같은 일이 벌어진다. 값이 판정을
     * 바꾸는지 직접 확인한다.
     */
    const homed = DOKEBI_ORDER.find((id) => DOKEBI[id].home !== null);
    expect(homed, "자리가 있는 도깨비가 없다").toBeTruthy();
    if (!homed) return;

    const ready = { defeatedTotal: 999, questCompleted: true, bossDefeated: true };
    expect(isUnlocked(homed, ready, []), `${homed}: 안 만났는데 열렸다`).toBe(false);
    expect(isUnlocked(homed, ready, [homed]), `${homed}: 만났는데 잠겼다`).toBe(true);
  });

  it("진행도도 만난 목록을 본다", () => {
    // 도감 막대가 이미 함께 다니는 도깨비를 0%로 그리던 자리다
    const questOnly = DOKEBI_ORDER.find(
      (id) => DOKEBI[id].requiresQuest && DOKEBI[id].home !== null,
    );
    /*
     * 없으면 그냥 빠져나가고 있었다 — 명부가 바뀌어 해당하는 도깨비가
     * 사라지면 **검사가 조용히 사라진다.** 지금 이 규칙을 지키는 도깨비가
     * 있다는 것 자체가 검사의 전제다.
     */
    expect(questOnly, "여정 조건 + 자리를 가진 도깨비가 없다 — 검사가 아무것도 안 본다").toBeDefined();
    if (!questOnly) return;
    const ready = { defeatedTotal: 0, questCompleted: true };
    expect(unlockRatio(DOKEBI[questOnly], ready, [questOnly]), `${questOnly}`).toBe(1);
    expect(unlockRatio(DOKEBI[questOnly], ready, []), `${questOnly}`).toBe(0);
  });
});

describe("도감 설명이 실제 능력과 맞는가", () => {
  /*
   * **간판이 딴 가게를 읽어 주던 것과 같은 유형이다** — 글과 동작이 따로 논다.
   *
   * 기존 검사는 도깨비마다 숫자를 박아 둔다(`geueum.aggroScale < 1`). 그러면
   * **설명을 바꿔도 통과한다** — 그을음의 소개를 「빠르게 아물게 한다」로
   * 고쳐도 아무도 막지 않는다. 도감은 사람이 능력을 배우는 유일한 곳이라,
   * 거기서 거짓말하면 「눌렀는데 아무 일도 안 난다」가 된다.
   *
   * 그래서 **설명에서 기대를 끌어내** 양방향으로 본다. 새 도깨비가 늘어도
   * 규칙이 따라간다.
   */
  /*
   * 「숨」만 쓰면 초롱의 **「숨은 흔적」**을 맞힌다 — 숨는 것은 흔적이지
   * 도깨비가 아니다. **제 몸을 감추는 말**만 고른다.
   */
  const HIDES = /몸을 감춰|모습을 감춰|들키지/;
  const HEALS = /아물|낫게|치유|회복/;

  it("숨는다고 적었으면 실제로 덜 들킨다", () => {
    for (const spirit of Object.values(DOKEBI)) {
      if (!HIDES.test(spirit.ability)) continue;
      expect(
        spirit.effect.aggroScale,
        `${spirit.name}: "${spirit.ability}"인데 인지 반경이 그대로다`,
      ).toBeLessThan(1);
    }
  });

  it("덜 들키게 만들었으면 설명에 적혀 있다", () => {
    // 반대 방향도 본다 — 조용히 강해지면 사람은 왜 쉬워졌는지 모른다
    for (const spirit of Object.values(DOKEBI)) {
      if (spirit.effect.aggroScale >= 1) continue;
      expect(spirit.ability, `${spirit.name}: 숨는 능력인데 설명에 없다`).toMatch(HIDES);
    }
  });

  it("아물게 한다고 적었으면 실제로 빨리 낫는다", () => {
    for (const spirit of Object.values(DOKEBI)) {
      if (!HEALS.test(spirit.ability)) continue;
      expect(
        spirit.effect.regenScale,
        `${spirit.name}: "${spirit.ability}"인데 회복이 그대로다`,
      ).toBeGreaterThan(1);
    }
  });

  it("빨리 낫게 만들었으면 설명에 적혀 있다", () => {
    for (const spirit of Object.values(DOKEBI)) {
      if (spirit.effect.regenScale <= 1) continue;
      expect(spirit.ability, `${spirit.name}: 회복 능력인데 설명에 없다`).toMatch(HEALS);
    }
  });

  it("두 규칙이 실제로 무언가를 봤다", () => {
    // 정규식이 아무것도 안 맞으면 위 넷이 조용히 빈 반복이 된다
    const hides = Object.values(DOKEBI).filter((s) => HIDES.test(s.ability));
    const heals = Object.values(DOKEBI).filter((s) => HEALS.test(s.ability));
    expect(hides.length, "숨는다고 적은 도깨비가 없다").toBeGreaterThan(0);
    expect(heals.length, "아물게 한다고 적은 도깨비가 없다").toBeGreaterThan(0);
  });
});

describe("만남이 신호로 올라가는가", () => {
  /*
   * **이 한 줄이 수집의 유일한 입구다.** 화면 안(프레임 루프)에 있을 때는
   * 지워도 아무도 몰랐다 — 도깨비 자리에 가 서도 아무 일이 없고, **누구도 모을
   * 수 없는데 화면은 멀쩡하다.**
   *
   * 「이미 대기 중이면 건너뛴다」도 함께 잰다. `PlayClient`가 가져가기 전에
   * 덮어쓰면 만남이 하나 사라진다 — 두 자리가 가까우면 실제로 일어난다.
   */
  const OPEN: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  /** 조건을 다 채웠을 때 아직 안 만난, 자리가 있는 도깨비 하나 */
  function anyHome(): { id: DokebiId; x: number; z: number } {
    for (const spirit of pendingDiscoveries(OPEN, [])) {
      if (spirit.home) return { id: spirit.id, x: spirit.home.x, z: spirit.home.z };
    }
    throw new Error("자리 있는 도깨비가 없다");
  }

  it("자리에 서면 신호가 올라간다 — 안 올라가면 아무도 못 모은다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    const found = projectDiscovery(view, spot.x, spot.z, OPEN, [], true);

    expect(found, "만남이 안 잡혔다").toBe(spot.id);
    expect(view.pending, "신호가 안 올라갔다").toBe(spot.id);
  });

  it("멀리 있으면 안 올라간다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    const found = projectDiscovery(view, spot.x + 200, spot.z + 200, OPEN, [], true);

    expect(found).toBeNull();
    expect(view.pending, "멀리 있는데 만난 것으로 잡혔다").toBeNull();
  });

  it("이미 대기 중이면 덮어쓰지 않는다 — 덮으면 만남이 하나 사라진다", () => {
    const spot = anyHome();
    const waiting = { pending: "chorong" as DokebiId, nearby: null as DokebiId | null };

    const found = projectDiscovery(waiting, spot.x, spot.z, OPEN, [], true);

    expect(found, "대기 중인데 새 만남을 잡았다").toBeNull();
    expect(waiting.pending, "가져가기 전에 덮어썼다").toBe("chorong");
  });

  it("이미 만난 도깨비는 다시 안 올라간다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    projectDiscovery(view, spot.x, spot.z, OPEN, [spot.id], true);

    expect(view.pending, "만난 도깨비가 또 올라왔다").toBeNull();
  });

  it("조건을 안 채웠으면 자리에 서도 안 올라간다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };
    const locked: DokebiProgress = {
      defeatedTotal: 0,
      questCompleted: false,
      bossDefeated: false,
    };

    const found = projectDiscovery(view, spot.x, spot.z, locked, [], true);
    // 조건이 열린 도깨비가 있으면 그건 올라와도 맞다 — 잠긴 것이 올라오면 안 된다
    if (found) {
      expect(pendingDiscoveries(locked, []).map((s) => s.id), `${found}가 잠겨 있다`).toContain(
        found,
      );
    }
  });
});

describe("만남을 가져가는 짝", () => {
  /*
   * `projectDiscovery`의 **짝**이다. 저쪽은 신호를 올리고 여기서 가져간다.
   * 짝을 이루는 코드는 **짝으로 재야 한다** — 이 세션에 되돌리기/합치기에서
   * 한쪽만 검사가 있어 다른 쪽이 조용히 사라질 뻔한 적이 있다.
   *
   * 안 비우면 `projectDiscovery`가 「이미 대기 중」으로 보고 계속 건너뛴다 —
   * **도깨비를 하나 만난 뒤로는 아무도 못 만난다.** 첫 만남은 되니까
   * 「되긴 되는데 왜 더는 안 열리지」가 되고, 원인을 짚기가 특히 어렵다.
   */
  const OPEN: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  function homes(): Array<{ id: DokebiId; x: number; z: number }> {
    return pendingDiscoveries(OPEN, [])
      .filter((spirit) => spirit.home)
      .map((spirit) => ({ id: spirit.id, x: spirit.home!.x, z: spirit.home!.z }));
  }

  it("대기 중인 만남을 돌려주고 비운다", () => {
    const view = { pending: "chorong" as DokebiId | null };

    expect(consumeDiscovery(view), "만남이 안 나왔다").toBe("chorong");
    expect(view.pending, "가져갔는데 안 비웠다").toBeNull();
  });

  it("두 번째에는 없다 — 같은 만남을 두 번 세면 안 된다", () => {
    const view = { pending: "chorong" as DokebiId | null };
    consumeDiscovery(view);
    expect(consumeDiscovery(view), "같은 만남이 또 나왔다").toBeNull();
  });

  it("비어 있으면 아무 일도 없다", () => {
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };
    expect(consumeDiscovery(view)).toBeNull();
  });

  it("두 도깨비를 잇달아 만날 수 있다 — 짝이 어긋나면 하나로 끝난다", () => {
    // 올리기와 가져가기를 번갈아 돌린다. 이게 실제로 도는 방식이다
    const spots = homes();
    expect(spots.length, "자리 있는 도깨비가 둘 이상이어야 이 검사가 뜻이 있다").toBeGreaterThan(1);

    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };
    const met: DokebiId[] = [];
    for (const spot of spots) {
      projectDiscovery(view, spot.x, spot.z, OPEN, met, true);
      const taken = consumeDiscovery(view);
      if (taken) met.push(taken);
    }

    expect(met.length, `만난 도깨비: ${met.join(", ")}`).toBe(spots.length);
  });

  it("안 가져가면 다음 만남이 막힌다 — 짝이 필요한 이유", () => {
    const spots = homes();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    projectDiscovery(view, spots[0].x, spots[0].z, OPEN, [], true);
    // 일부러 안 가져간 채 다음 자리로 간다
    const second = projectDiscovery(view, spots[1].x, spots[1].z, OPEN, [], true);

    expect(second, "가져가기 전인데 덮어썼다").toBeNull();
    expect(view.pending, "첫 만남이 밀려났다").toBe(spots[0].id);
  });
});

describe("방어선이 왜 안 밟히는가", () => {
  /*
   * 조건문 훑기에서 네 줄이 「지워도 아무도 모른다」로 나왔다. 그런데 **넷 다
   * 결함이 아니었다** — 일어날 수 없는 상태를 막는 방어선이다:
   *
   *   - `if (!home) continue` — 자리 없는 도깨비(초롱)는 애초에 **만남 후보에
   *     안 들어간다**(처음부터 함께 있으니까).
   *   - `if (unlocked.length === 0)` 둘 — 초롱이 늘 열려 있어 **목록이 빌 수 없다**.
   *   - `if (index < 0) return unlocked[0]` — 없으면 `(-1 + 1) % n = 0`이라
   *     **결과가 같다**.
   *
   * 방어선을 지우는 대신 **왜 안 밟히는지**를 검사로 못 박는다. 로스터가 바뀌어
   * 그 전제가 깨지면(초롱에게 집이 생기거나, 기본 해금이 사라지거나) 여기서
   * 먼저 걸리고, 그때 방어선이 진짜 일하기 시작한다.
   */
  const LOCKED: DokebiProgress = {
    defeatedTotal: 0,
    questCompleted: false,
    bossDefeated: false,
  };
  const OPEN: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  it("자리 없는 도깨비는 만남 후보에 안 들어간다", () => {
    const homeless = DOKEBI_ORDER.filter((id) => !DOKEBI[id].home);
    expect(homeless.length, "자리 없는 도깨비가 없다 — 이 검사가 헛돈다").toBeGreaterThan(0);

    const pending = pendingDiscoveries(OPEN, []).map((spirit) => spirit.id);
    for (const id of homeless) {
      expect(pending, `${id}는 자리가 없는데 만남 후보에 있다`).not.toContain(id);
    }
  });

  it("자리 없는 도깨비는 도시 어디서도 안 만나진다", () => {
    const homeless = DOKEBI_ORDER.filter((id) => !DOKEBI[id].home);
    for (const [x, z] of [[0, 0], [40, 40], [-30, 10], [117.5, -70.5]]) {
      const found = discoverAt(x, z, OPEN, []);
      expect(homeless, `(${x}, ${z})에서 ${found}가 만나졌다`).not.toContain(found);
    }
  });

  it("아무 조건도 안 채웠어도 열린 도깨비가 있다", () => {
    // 이게 깨지면 「목록이 빈다」가 실제 상황이 되고, 두 방어선이 그때부터 일한다
    expect(unlockedDokebi(LOCKED, []).length, "처음부터 데리고 다닐 동료가 없다").toBeGreaterThan(
      0,
    );
  });

  it("그래서 동료 대열과 바꾸기가 늘 성립한다", () => {
    const party = companionParty("mulbineul", LOCKED, []);
    expect(party.length, "동료가 하나도 없다").toBeGreaterThan(0);

    const next = nextDokebi("mulbineul", LOCKED, []);
    expect(DOKEBI_ORDER, `${next}는 없는 도깨비다`).toContain(next);
  });
});

/*
 * 만나는 순간에 행동이 있는가.
 *
 * 반경에 들어가면 바로 열렸다 — **걸어가면 끝**이라 만나는 순간에 아무 행동도
 * 없었다(RALPH_BACKLOG 「10. 만나는 순간에 행동이 있다」). 조건은 자리에 가기
 * 전(처치 수·여정·보스)에만 걸려 있었다.
 */
describe("손을 내밀어야 만난다", () => {
  const OPEN: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  /** 조건을 다 채웠을 때 아직 안 만난, 자리가 있는 도깨비 하나 */
  function anyHome(): { id: DokebiId; x: number; z: number } {
    for (const spirit of pendingDiscoveries(OPEN, [])) {
      if (spirit.home) return { id: spirit.id, x: spirit.home.x, z: spirit.home.z };
    }
    throw new Error("자리 있는 도깨비가 없다");
  }

  it("반경 안이어도 누르지 않으면 안 열린다", () => {
    // 이 검사가 이 항목의 전부다. 여기가 통과하면 「지나가다 열림」이 돌아온 것이다
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    const found = projectDiscovery(view, spot.x, spot.z, OPEN, [], false);

    expect(found, "지나가기만 했는데 만났다").toBeNull();
    expect(view.pending, "신호까지 올라갔다").toBeNull();
  });

  it("자리를 벗어나서 누르면 아무 일도 없다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    const found = projectDiscovery(view, spot.x + 60, spot.z + 60, OPEN, [], true);

    expect(found, "먼 데서 눌렀는데 만났다").toBeNull();
  });

  it("자리에 서서 누르면 만난다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    expect(projectDiscovery(view, spot.x, spot.z, OPEN, [], true), "눌렀는데 안 열린다").toBe(
      spot.id,
    );
  });

  it("한 번 누른 것으로 두 번 열리지 않는다", () => {
    /*
     * 신호를 가져가기 전에 다시 열리면 만남이 하나 사라진다. 대기 중 규칙과
     * 같은 자리를 지킨다.
     */
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };
    const spot = anyHome();

    projectDiscovery(view, spot.x, spot.z, OPEN, [], true);
    expect(projectDiscovery(view, spot.x, spot.z, OPEN, [], true), "두 번 열렸다").toBeNull();
  });
});

describe("자리에 서면 화면이 알려 주는가", () => {
  const OPEN: DokebiProgress = { defeatedTotal: 99, questCompleted: true, bossDefeated: true };

  function anyHome(): { id: DokebiId; x: number; z: number } {
    for (const spirit of pendingDiscoveries(OPEN, [])) {
      if (spirit.home) return { id: spirit.id, x: spirit.home.x, z: spirit.home.z };
    }
    throw new Error("자리 있는 도깨비가 없다");
  }

  it("누르지 않아도 서 있는 것은 알린다", () => {
    /*
     * 규칙만 지키고 안내가 없으면 그건 잠긴 문이다 — 처음 오는 사람은 무엇을
     * 눌러야 할지 알 수 없다.
     */
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    projectDiscovery(view, spot.x, spot.z, OPEN, [], false);

    expect(view.nearby, "자리에 섰는데 화면이 모른다").toBe(spot.id);
    expect(view.pending, "안 눌렀는데 열렸다").toBeNull();
  });

  it("자리를 벗어나면 안내가 사라진다", () => {
    const spot = anyHome();
    const view = { pending: null as DokebiId | null, nearby: null as DokebiId | null };

    projectDiscovery(view, spot.x, spot.z, OPEN, [], false);
    projectDiscovery(view, spot.x + 80, spot.z + 80, OPEN, [], false);

    expect(view.nearby, "떠났는데 안내가 남았다").toBeNull();
  });

  it("화면이 그 값을 읽는다", () => {
    // 채워 두고 아무도 안 보면 없는 것과 같다
    const hud = readFileSync("src/components/hud/WorldHud.tsx", "utf8");
    expect(hud, "HUD가 자리 안내를 안 띄운다").toMatch(/discovery\.nearby/);
  });
});
