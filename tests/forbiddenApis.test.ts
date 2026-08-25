import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

/*
 * **적어 두었지만 아무도 지키게 하지 않던 규칙 둘.**
 *
 * 이 프로젝트의 절대 규칙에 「난수는 `createSeededRandom`만, `Math.random()`
 * 금지」와 「프로덕션 코드에 `console` 금지」가 있다. 지금은 지켜지고 있지만
 * **막는 검사가 없었다** — 지키고 있다는 것과 지켜진다는 것은 다르다.
 *
 * 억제 개수 래칫과 같은 자리에서 나온 문제다: 규칙을 문장으로만 두면 다음
 * 사람은 그 문장을 읽지 않는다.
 */

const sources = collectSources("src").map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

describe("금지한 API를 쓰지 않는가", () => {
  it("실제로 훑었다", () => {
    // 목록이 비면 아래 검사가 아무것도 안 본다
    expect(sources.length, `훑은 파일 ${sources.length}개`).toBeGreaterThan(30);
  });

  it("Math.random을 쓰지 않는다", () => {
    /*
     * 도시 배치·소품·군중이 전부 씨앗 난수로 만들어진다. `Math.random()`이
     * 하나라도 끼면 **같은 씨앗으로 다른 도시가 나오고**, 배치 정합성 검사가
     * 무엇을 검증하는지 알 수 없게 된다. 사진도 매번 달라진다.
     */
    const offenders = sources
      .filter(({ text }) => /\bMath\.random\s*\(/.test(text))
      .map(({ path }) => path);
    expect(offenders, `Math.random을 쓴 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("프로덕션 코드에 console을 남기지 않는다", () => {
    /*
     * 게임 화면에서 콘솔은 사용자에게 보이지 않는 쓰레기이고, 매 프레임
     * 도는 코드에 하나 끼면 개발자 도구가 잠긴다. 오류는 오류 경계와
     * 분석 이벤트가 받는다.
     */
    const offenders = sources
      .filter(({ text }) => /\bconsole\.(log|warn|error|info|debug|table)\s*\(/.test(text))
      .map(({ path }) => path);
    expect(offenders, `console을 남긴 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("스타일이나 마크업이 밖을 가리키지 않는다", () => {
    /*
     * 소스의 `fetch`를 막고 `public/`을 막아도 **길이 하나 더 있다** — CSS의
     * `url(https://...)`이나 `<link>`·`<img src>`로 밖을 가리키는 것.
     * 프로덕션에서는 CSP가 막지만 **개발 중에는 멀쩡히 보이다가** 배포 후에만
     * 빈다. 가장 늦게 발견되는 종류라 여기서 잡는다.
     *
     * `localhost`(개발 서버)와 표준 네임스페이스(schema.org·w3.org)는 예외다.
     */
    const offenders = collectSources("src")
      .concat(["src/app/globals.css"])
      .filter((path) => /\.(tsx?|css)$/.test(path))
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        const links = [...text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
        return links.some((link) => !/localhost|schema\.org|w3\.org/.test(link));
      });
    expect(offenders, `밖을 가리키는 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("받아 오는 곳이 캐릭터 하나뿐이다", () => {
    /*
     * 텍스처는 캔버스로 그리고 소리는 합성하며 도시는 기본 도형을 조립한다.
     * **캐릭터 모델 하나만** 받는다 — 사람 몸은 상자로 흉내 내기 가장 어려워
     * 여기서 얻는 것이 가장 크다고 판단한 예외다.
     *
     * 「하나도 안 받는다」에서 **「적어 둔 곳에서만 받는다」**로 규칙을 바꿨다.
     * 로더가 목록 밖에 생기면 여기서 걸린다 — CSP(`connect-src 'self'`) 안에서만
     * 받는다는 약속도 그때 함께 흔들린다.
     *
     * 둘째가 대장이다. 예고 동작이 **게임플레이 그 자체**라서 열었다 — 팔이
     * 올라가는 1.1초가 피할 때를 아는 유일한 단서인데, 상자로는 그 팔이 안
     * 올라간다. 캐릭터와 같은 종류의 **한 번의 판단**이지 문이 열린 것이 아니다.
     */
    const LOADER_HOMES = new Set([
      "src/game/player/CharacterModel.tsx",
      "src/game/combat/BossModel.tsx",
    ]);

    const offenders = sources
      .filter(({ path }) => !LOADER_HOMES.has(path))
      .filter(({ text }) => /\b(fetch\s*\(|new XMLHttpRequest|TextureLoader|GLTFLoader)/.test(text))
      .map(({ path }) => path);
    expect(offenders, `외부에서 받아 오는 곳:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("적어 둔 곳은 실제로 로더를 쓴다", () => {
    // 예외로 적어 두고 정작 안 쓰면, 이 검사가 아무것도 안 지키면서 문만 열어 둔다
    for (const path of ["src/game/player/CharacterModel.tsx", "src/game/combat/BossModel.tsx"]) {
      const home = sources.find((file) => file.path === path);
      expect(home, `${path}가 없다`).toBeDefined();
      expect(home?.text, `${path}가 로더를 안 쓴다`).toMatch(/GLTFLoader/);
    }
  });
});

/*
 * **매 프레임 `setState` 금지** — 이 프로젝트 성능의 뼈대다. 프레임마다 상태를
 * 바꾸면 React가 매 프레임 트리를 다시 그리고, 공유 가변 객체를 쓰기로 한
 * 설계가 통째로 무의미해진다. 규칙은 적혀 있었지만 **막는 검사가 없었다.**
 *
 * 파일 단위로 보면 안 된다 — `Shrine`은 `useFrame`도 쓰고 `useEffect`에서
 * `setFarewell`도 부르는데 **그건 정당하다**(도깨비가 목록에서 빠지는 사건에
 * 반응한다). `City`의 `setUvAttributes`는 아예 React 상태가 아니다.
 * 그래서 **`useFrame` 본문만** 도려내서 본다.
 */
function frameBodies(source: string): string[] {
  const bodies: string[] = [];
  /*
   * `while ((m = re.exec(s)))`는 **읽는 줄이 값을 바꾼다.** 같은 일을
   * `matchAll`로 하면 대입이 사라진다 — 정규식에 `g`가 붙어 있어야 도는 것도
   * 여기서는 타입이 대신 말해 준다.
   */
  for (const match of source.matchAll(/useFrame\s*\(/g)) {
    const start = source.indexOf("{", match.index);
    if (start < 0) continue;
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return bodies;
}

/** React 상태 설정자만 고른다 — `mesh.position.set(...)`이나 `setTimeout`은 아니다 */
const REACT_SETTER = /(?<![.\w])set[A-Z]\w*\s*\(/g;
const NOT_STATE = new Set(["setTimeout", "setInterval", "setImmediate", "setUvAttributes"]);

/*
 * **허용한 예외와 그 이유.**
 *
 * 규칙의 뜻은 「매 프레임 바꾸지 마라」이지 「절대 부르지 마라」가 아니다.
 * 아래 하나는 **몇 초에 한 번**만 불린다 — 프레임마다 비교만 하고 값이 바뀔
 * 때 빠져나간다. 그 대가로 매 프레임 수천 개 인스턴스를 다시 거르는 일을
 * 피하므로, 규칙의 목적(프레임 비용)에는 오히려 맞는다.
 *
 * 새 예외를 넣기 전에 **정말 몇 초에 한 번인지** 확인하고 여기에 이유를 적어라.
 * 이유 없는 줄이 하나 늘면 그때부터 이 목록은 규칙이 아니라 통과권이 된다.
 */
const ALLOWED_FRAME_SETTERS: Record<string, string> = {
  // 보이는 구역이 바뀔 때만. 구역을 넘는 일은 몇 초에 한 번이다.
  "src/game/world/City.tsx: setKey": "구역 전환에서만 — 매 프레임 인스턴스 재필터를 피한다",
};

describe("프레임 안에서 상태를 바꾸지 않는가", () => {
  const frames = collectSources("src")
    .map((path) => ({ path, bodies: frameBodies(readCode(path)) }))
    .filter((file) => file.bodies.length > 0);

  it("프레임 본문을 실제로 도려냈다", () => {
    // 도려내기가 깨지면 빈 목록이 되고 아래 검사가 아무것도 안 본다
    expect(frames.length, `useFrame을 쓰는 파일 ${frames.length}개`).toBeGreaterThan(3);
    const longest = Math.max(...frames.flatMap((f) => f.bodies.map((b) => b.length)));
    expect(longest, `가장 긴 본문 ${longest}자`).toBeGreaterThan(200);
  });

  it("useFrame 안에서 setState를 부르지 않는다", () => {
    const offenders: string[] = [];
    for (const { path, bodies } of frames) {
      for (const body of bodies) {
        for (const found of body.match(REACT_SETTER) ?? []) {
          const name = found.replace(/\s*\($/, "");
          const key = `${path}: ${name}`;
          if (!NOT_STATE.has(name) && ALLOWED_FRAME_SETTERS[key] === undefined) {
            offenders.push(key);
          }
        }
      }
    }
    expect(offenders, `프레임 안에서 상태를 바꾼다:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("허용한 예외가 아직 실제로 있다", () => {
    /*
     * 예외가 사라졌는데 목록에 남아 있으면, 다음에 같은 이름이 생겼을 때
     * **묻지도 않고 통과한다.** 목록은 현실을 따라가야 한다.
     */
    const present = new Set(
      frames.flatMap(({ path, bodies }) =>
        bodies.flatMap((body) =>
          (body.match(REACT_SETTER) ?? []).map((f) => `${path}: ${f.replace(/\s*\($/, "")}`),
        ),
      ),
    );
    const stale = Object.keys(ALLOWED_FRAME_SETTERS).filter((key) => !present.has(key));
    expect(stale, `사라진 예외가 목록에 남아 있다:\n${stale.join("\n")}`).toEqual([]);
  });
});

describe("낮 창문과 밤 창문이 갈라질 수 없는가", () => {
  /*
   * 주석은 「같은 상수를 쓴다」고 했지만 실제로는 **두 함수가 같은 식을 각각
   * 적어 둔 복제**였다. 한쪽만 만지면 밤에 창틀 밖으로 빛이 새고, 그건 화면을
   * 봐야만 보인다.
   *
   * 이제 `WINDOW_BOX` 한 곳에서 가져온다. 이 검사는 **누가 다시 복제하는 것**을
   * 막는다 — 갈라진 것을 잡는 것이 아니라 갈라질 수 있는 상태를 막는다.
   */
  const source = readCode("src/game/world/textures.ts");

  it("창문 좌표를 한 곳에서만 만든다", () => {
    const definitions = source.match(/inset:\s*CANVAS_SIZE\s*\*/g) ?? [];
    expect(definitions.length, `창문 좌표를 만드는 곳 ${definitions.length}군데`).toBe(1);
    const inlined = source.match(/const inset = CANVAS_SIZE\s*\*/g) ?? [];
    expect(inlined, "창문 좌표를 함수 안에서 다시 만든다").toEqual([]);
  });

  it("두 텍스처가 모두 그 값을 쓴다", () => {
    // 하나만 쓰면 한 곳에 모은 의미가 없다
    const uses = source.match(/WINDOW_BOX/g) ?? [];
    expect(uses.length, `WINDOW_BOX를 쓰는 곳 ${uses.length}군데`).toBeGreaterThanOrEqual(3);
  });
});

describe("public에 에셋이 들어오지 않는가", () => {
  /*
   * 「`public/`에 에셋 디렉터리를 만들지 않는다」는 이 프로젝트의 약속인데
   * **막는 것이 없었다.** 소스에서 `fetch`·`TextureLoader`를 금지해 두었지만,
   * 파일을 `public/`에 넣고 `<img src="/x.png">`로 부르면 그 검사를 비켜 간다.
   *
   * 지금 있는 것은 Next.js 시작 템플릿의 SVG 다섯 개(어디에서도 참조하지
   * 않는 잔재)와 **캐릭터 모델 하나**다.
   *
   * 캐릭터는 **의도한 예외**다 — 사람 몸은 상자로 흉내 내기 가장 어려워 여기서
   * 얻는 것이 가장 크다고 판단했다. 그래서 「0개」가 아니라 **「정해 둔 하나만」**
   * 으로 규칙을 바꿨다. 다음 에셋이 슬며시 들어오는 것은 여전히 막힌다.
   */
  const files = (function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  })("public");

  it("public을 실제로 훑었다", () => {
    expect(files.length, `public 파일 ${files.length}개`).toBeGreaterThan(0);
  });

  /**
   * 들이기로 정한 것. 여기 없는 에셋은 실수로 본다.
   *
   * 둘째가 시작 화면 그림이다. 그 전에는 SVG 도형으로 장면을 그렸는데, 도형으로는
   * 명암이 두 단계가 한계라 **인물이 스티커처럼 보였다** — 게임 키아트가 아니라
   * 다이어그램이었다. 첫 화면에서 가장 크게 보이는 것이라 값을 한다고 판단했다.
   *
   * 이것도 캐릭터와 같은 **한 번의 판단**이지 문이 열린 것이 아니다.
   */
  const ALLOWED = new Set([
    "public/character.glb",
    "public/title-street.webp",
    /*
     * 배경 차량 셋. ASSET_PLAN 「반입 절차」가 정한 자리(`public/models/`)이고,
     * 정본은 `assets/concepts/meshy/vehicles/README.md`다.
     *
     * 차량을 들인 이유는 캐릭터와 같다 — 둥근 차체와 두 단계 툰 음영은 상자
     * 조합으로 흉내 내기 어렵다. 셋을 함께 들이는 이유는 **한 벌**이어서다:
     * 팔레트와 머티리얼을 공유해야 인스턴싱이 산다.
     *
     * 셋 다 원본은 117~120MB짜리 Meshy 출력이었다(300만 삼각형). 여기 있는
     * 것은 절차를 거친 결과다 — 알베도만 남기고, 512²로 줄이고, 단순화하고,
     * draco로 압축했다.
     */
    "public/models/traffic-compact-car.glb",
    "public/models/traffic-city-minibus.glb",
    "public/models/traffic-delivery-van.glb",
    /*
     * 동료 흰곰. ASSET_PLAN 「동료의 정체 — 메인 그림으로 고정」이 정한 넷 중
     * 첫 번째이고, 입력 정본은 `assets/concepts/meshy/companion-bear-v2.png`다.
     *
     * 원본은 동작 열한 개가 붙은 10.6MB였다. 게임에 상태가 있는 다섯만 남겼다
     * (달리기·걷기·공격·능력·일어서기) — 나머지 여섯은 핸드스탠드 플립·펀치
     * 콤보·구르기처럼 **대응하는 상태가 게임에 없는** 것들이고, 애니메이션이
     * 파일의 절반이라 예산을 그것들이 먹고 있었다.
     */
    "public/models/companion-bear.glb",
    /*
     * 버섯과 검은 고양이. 파일 이름이 둘 다 `Merged_Animations (n)`이라 어느
     * 쪽인지 이름으로는 알 수 없었다 — **알베도를 꺼내 컨셉 그림과 대조해서**
     * 갈랐다. 버섯은 청록 갓·크림 몸·연두 싹·주황 카메라, 고양이는 검정 몸·
     * 연두 조끼·크림 눈이다. 실루엣도 같은 말을 한다: 버섯은 위에서 두 번째
     * 띠가 둥글고 넓은 갓(1.04×1.06), 고양이는 맨 위가 넓고 납작한 귀(0.75×0.23).
     */
    "public/models/companion-mushroom.glb",
    "public/models/companion-cat.glb",
    /*
     * 미니 보스 「고물 대장」. 팔레트가 정본과 그대로 맞는다 — 연보라 회색 몸통,
     * 크림 주둥이, 민트 포획 코어, 산호색 위험 표시
     * (`assets/concepts/meshy/bosses/README.md`).
     *
     * 동작 여덟을 다 남겼다. 동료와 달리 **보스의 단계마다 대응하는 것이 있다**:
     * 서 있기·쫓기·예고(투구 준비)·내려치기·쓰러짐이 그대로 있고, 지금 코드의
     * `BossPhase`가 일곱이다. 버릴 것이 없어서 안 버렸다.
     */
    "public/models/boss-scrap-foreman.glb",
  ]);

  it("정해 둔 것 말고는 에셋이 없다", () => {
    /*
     * 하나라도 더 생기면 초기 다운로드 예산과 CSP 약속이 함께 흔들린다.
     * 캐릭터를 들인 것은 **한 번의 판단**이지 문이 열린 것이 아니다.
     */
    const assets = files.filter((path) =>
      /\.(png|jpe?g|gif|webp|avif|glb|gltf|fbx|obj|mp3|wav|ogg|m4a|woff2?|ttf|otf|mp4|webm)$/i.test(
        path,
      ),
    );
    const unexpected = assets.filter((path) => !ALLOWED.has(path));
    expect(unexpected, `허락하지 않은 에셋이 들어왔다:\n${unexpected.join("\n")}`).toEqual([]);
  });

  it("배경 차량이 예산을 넘지 않는다", () => {
    /*
     * 차종당 압축 후 350KB — `assets/concepts/meshy/vehicles/README.md` 6항.
     * 지금은 59~73KB다.
     *
     * 셋을 따로 재는 이유: 합계만 보면 하나가 커진 것을 다른 둘이 가려 준다.
     * 실제로 원본은 셋 다 117MB가 넘었고, 그때도 합계 자만 있었다면 「셋 다
     * 크다」가 「합계가 크다」 한 줄로 뭉개졌다.
     */
    for (const path of [...ALLOWED].filter((name) => name.startsWith("public/models/traffic-"))) {
      const kb = statSync(path).size / 1024;
      expect(kb, `${path} ${kb.toFixed(0)}KB`).toBeLessThan(350);
    }
  });

  it("동료와 보스가 예산을 넘지 않는다", () => {
    /*
     * GLB 하나 600KB — ASSET_PLAN 4절. 동료는 399~597KB, 대장은 758KB다.
     *
     * **Draco를 빼면서 커졌다.** 앱의 `GLTFLoader`에 디코더가 없어서 압축한
     * 파일은 통째로 못 읽었고, 화면에는 절차적 몸이 대신 서 있었다 — 오류도
     * 없이. 지금은 three가 기본으로 아는 것만 쓴다(`KHR_mesh_quantization`).
     *
     * 차량(350KB)보다 넉넉한 이유는 **뼈와 동작**을 들고 오기 때문이다.
     * 단순화로는 더 못 줄인다 — 메시는 이미 바닥이고 draco는 애니메이션
     * 트랙을 압축하지 않는다. 넘으면 줄일 곳은 동작 수뿐이다.
     */
    for (const path of [...ALLOWED].filter((name) => name.includes("companion-"))) {
      const kb = statSync(path).size / 1024;
      expect(kb, `${path} ${kb.toFixed(0)}KB`).toBeLessThan(650);
    }

    /*
     * 대장은 따로 잰다 — **일곱 단계에 일곱 동작**이라 애니메이션이 파일의
     * 절반을 넘는다. 그중 버릴 것이 없다: 단계와 동작의 짝은
     * `tests/bossClips.test.ts`가 **양방향으로** 묶어 두었고, 하나를 빼면
     * 그 단계에서 대장이 굳는다.
     *
     * 캐릭터에 2MB를 준 것과 같은 종류의 판단이다. 뼈와 동작을 들고 오는
     * 액터는 상자와 다른 자를 쓴다.
     */
    const bossKb = statSync("public/models/boss-scrap-foreman.glb").size / 1024;
    expect(bossKb, `대장 ${bossKb.toFixed(0)}KB`).toBeLessThan(800);
  });

  it("들이기로 한 것은 실제로 있다", () => {
    // 목록만 늘려 놓고 파일이 없으면 이 검사가 아무것도 안 지킨다
    for (const path of ALLOWED) {
      expect(files, `${path}가 없다`).toContain(path);
    }
  });

  it("캐릭터가 예산을 넘지 않는다", () => {
    /*
     * 원본은 동작마다 파일이 따로라 68MB였다. 하나로 합치고 텍스처를 줄여
     * 1MB대로 만들었다(`scripts/build-character.mjs`).
     *
     * 상한을 2MB로 둔다 — 텍스처를 다시 키우거나 동작을 잔뜩 넣으면 걸린다.
     */
    const bytes = statSync("public/character.glb").size;
    expect(bytes / 1024 / 1024, `${(bytes / 1048576).toFixed(2)}MB`).toBeLessThan(2);
  });

  it("시작 화면 그림이 예산을 넘지 않는다", () => {
    /*
     * 원본은 2.26MB PNG였다. WebP로 폭 1600까지 줄여 137KB다.
     *
     * 상한을 300KB로 둔다 — 첫 화면에서 가장 먼저 받는 것이라, 다시 키우면
     * 처음 오는 사람이 흰 화면을 더 오래 본다. 캐릭터에 상한을 둔 것과 같은
     * 이유이고, 목록에 넣어 놓고 크기를 안 재면 자가 반쪽이 된다.
     */
    const bytes = statSync("public/title-street.webp").size;
    expect(bytes / 1024, `${(bytes / 1024).toFixed(0)}KB`).toBeLessThan(300);
  });

  it("파일이 조용히 늘지 않는다", () => {
    /*
     * 확장자만 막으면 `.json` 데이터나 새 SVG가 슬금슬금 는다. 지금 열넷이고
     * (배경 차량 셋·동료 셋·보스가 늘었다), **줄이는 것은 언제든 환영**이라 상한만 둔다.
     */
    expect(files.length, `public 파일 ${files.length}개:\n${files.join("\n")}`).toBeLessThanOrEqual(
      14,
    );
  });
});

describe("도시가 씨앗만의 함수인가", () => {
  /*
   * 도시·소품·군중은 **씨앗 하나에서 나온다.** 같은 씨앗이면 같은 도시여야
   * 배치 정합성 검사가 뜻을 갖고, 사진도 매번 같은 자리에서 찍힌다.
   *
   * 왕복 검사(「두 번 호출해도 완전히 같은 도시가 나온다」)가 이미 있지만
   * **연달아 두 번 부른다** — `Date.now()`를 씨앗에 섞으면 밀리초가 같아
   * **통과해 버린다.** 시간·암호 난수는 소스에서 막는 편이 확실하다.
   *
   * `Math.random()`은 위에서 소스 전체를 막았고, 여기서는 **시간에 기대는 것**을
   * 월드 생성 모듈에 한정해 막는다(알림 타이머·카메라 흔들림처럼 정당한
   * 쓰임까지 막지 않기 위해서다).
   */
  const WORLD_MODULES = [
    "src/game/world/cityLayout.ts",
    "src/game/world/cityDetails.ts",
    "src/game/world/streetExtras.ts",
    "src/game/world/cityContent.ts",
  ];

  it("월드 생성 모듈을 실제로 읽었다", () => {
    for (const path of WORLD_MODULES) {
      expect(readFileSync(path, "utf8").length, `${path}가 비었다`).toBeGreaterThan(200);
    }
  });

  it("시간이나 암호 난수에 기대지 않는다", () => {
    const offenders = WORLD_MODULES.filter((path) =>
      /\b(Date\.now|performance\.now|new Date|crypto\.)/.test(readFileSync(path, "utf8")),
    );
    expect(offenders, `씨앗 밖의 값을 쓴다:\n${offenders.join("\n")}`).toEqual([]);
  });
});
