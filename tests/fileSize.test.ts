import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * 파일 크기.
 *
 * 한 파일이 길어지면 **무엇을 하는 파일인지** 알 수 없어진다. 이 규칙을 세 번
 * 어겼고(WorldHud 두 번, GameScene 한 번) 매번 「조금만 더」가 쌓여서 넘었다.
 * 사람이 세지 않게 여기서 센다.
 *
 * 상한을 800 → 자리별로 좁혔다. 화면 쪽을 더 조이는 이유: 컴포넌트는 **모양과
 * 규칙이 섞이기 가장 쉬운 자리**라 길어지는 것 자체가 층이 무너졌다는 신호다
 * (`tests/hudLayering.test.ts`가 보는 것과 같은 것을 크기로 잰다).
 */

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** 화면 쪽. 모양만 담으면 이 안에 들어온다 */
const COMPONENT_LIMIT = 120;
/** 그 밖의 소스 */
const SOURCE_LIMIT = 300;
/** 검사는 사례 목록이라 소스보다 길어도 된다 */
const TEST_LIMIT = 1200;

function limitFor(path: string): number {
  return path.startsWith(join("src", "components")) ? COMPONENT_LIMIT : SOURCE_LIMIT;
}

function lines(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

/*
 * 아직 못 쪼갠 것들.
 *
 * 상한을 한 번에 적용하면 쉰여섯 파일을 동시에 건드려야 하고, 그건 **한 번에
 * 검토할 수 없는 변경**이다. 그래서 기준선을 굳혀 두고 규칙을 지금부터 적용한다:
 * 새 파일과 고친 파일은 상한을 지켜야 하고, 여기 적힌 것은 **줄어들 수만 있다.**
 *
 * 숫자는 「봐주는 한도」다. 이 값을 올리는 변경은 이 목록을 함께 고쳐야 하므로
 * 조용히 자라지 않는다.
 */
const LEGACY = new Map<string, number>([
  ["src/app/play/PlayClient.tsx", 800],
  ["src/game/combat/Boss.tsx", 467],
  ["src/game/combat/Enemies.tsx", 702],
  ["src/game/combat/bossSim.ts", 391],
  ["src/game/combat/combatSim.ts", 674],
  ["src/game/config/tuning.ts", 541],
  ["src/game/dokebi/companionMotion.ts", 482],
  ["src/game/dokebi/roster.ts", 579],
  ["src/game/player/locomotion.ts", 650],
  ["src/game/quest/questRunner.ts", 310],
  ["src/game/scene/GameScene.tsx", 389],
  ["src/game/scene/PlayerRig.tsx", 688],
  ["src/game/scene/PostProcessing.tsx", 447],
  ["src/game/scene/cameraFrame.ts", 316],
  ["src/game/scene/sceneTypes.ts", 319],
  ["src/game/systems/audio/index.ts", 471],
  ["src/game/systems/audio/music.ts", 423],
  ["src/game/systems/audio/voices.ts", 578],
  ["src/game/systems/capture.ts", 344],
  ["src/game/systems/input.ts", 528],
  ["src/game/world/City.tsx", 752],
  ["src/game/world/Crowd.tsx", 537],
  ["src/game/world/GroundSurfaces.tsx", 307],
  ["src/game/world/Sea.tsx", 431],
  ["src/game/world/Traffic.tsx", 335],
  ["src/game/world/atlasTextures.ts", 546],
  ["src/game/world/cityDetails.ts", 723],
  ["src/game/world/cityLayout.ts", 800],
  ["src/game/world/crowdLayout.ts", 464],
  ["src/game/world/hillside.ts", 510],
  ["src/game/world/market.ts", 322],
  ["src/game/world/oldTown.ts", 618],
  ["src/game/world/park.ts", 385],
  ["src/game/world/streetExtras.ts", 319],
  ["src/game/world/streetGround.ts", 389],
  ["src/game/world/streetProps.ts", 417],
  ["src/game/world/textures.ts", 803],
  ["src/game/world/trees.ts", 499],
  ["src/game/world/undergrowth.ts", 325],
  ["src/game/world/vehicleStands.ts", 334],
  ["src/game/world/zones.ts", 476],
]);

describe("파일 크기", () => {
  it("소스 파일이 상한을 넘지 않는다", () => {
    const oversized = collect("src")
      .map((path) => ({ path, lines: lines(path), limit: limitFor(path) }))
      .filter((file) => file.lines > file.limit && !LEGACY.has(file.path))
      .map((file) => `${file.path} (${file.lines} > ${file.limit})`);

    expect(oversized, `상한을 넘었다:\n${oversized.join("\n")}`).toEqual([]);
  });

  it("아직 못 쪼갠 것이 더 자라지 않는다", () => {
    const grown = [...LEGACY]
      .filter(([path, allowed]) => lines(path) > allowed)
      .map(([path, allowed]) => `${path} (${lines(path)} > 봐주는 한도 ${allowed})`);

    expect(grown, `기준선을 넘겨 자랐다:\n${grown.join("\n")}`).toEqual([]);
  });

  it("기준선이 낡지 않았다", () => {
    /*
     * 쪼개서 상한 아래로 내려왔는데 목록에 남아 있으면, 다음 사람은 그 파일이
     * 아직 봐주는 대상이라고 믿는다 — 허용 목록은 낡는 순간 거짓말이 된다.
     */
    const stale = [...LEGACY.keys()].filter((path) => lines(path) <= limitFor(path));

    expect(stale, `상한 아래로 내려왔는데 목록에 남았다:\n${stale.join("\n")}`).toEqual([]);
  });

  it("테스트 파일도 지나치게 길지 않다", () => {
    const oversized = collect("tests")
      .map((path) => ({ path, lines: lines(path) }))
      .filter((file) => file.lines > TEST_LIMIT)
      .map((file) => `${file.path} (${file.lines})`);

    expect(oversized, `over ${TEST_LIMIT} lines:\n${oversized.join("\n")}`).toEqual([]);
  });
});
