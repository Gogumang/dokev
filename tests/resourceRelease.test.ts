import { describe, expect, it } from "vitest";

import { collectSources, readCode } from "./support/source";

/*
 * 만든 GPU 자원을 놓는가.
 *
 * R3F는 씬 그래프에 붙인 객체는 정리하지만 **컴포넌트가 직접 만들어 넘긴
 * 것은 건드리지 않는다.** 안 놓아도 화면은 멀쩡하고, /play를 드나들 때마다
 * 조금씩 쌓일 뿐이라 눈으로는 영영 모른다.
 *
 * 실제로 두 곳이 새고 있었다: 그래플 밧줄 지오메트리(바로 옆에서 표식은
 * 해제하면서), 그리고 창문 발광 텍스처(캐시가 Map이 아니라 변수 하나라
 * 해제 함수의 루프에 안 걸렸다).
 */

/*
 * 놓아야 하는 GPU 자원의 종류.
 *
 * 지오메트리만 보고 있었다. 재질·텍스처·렌더타깃도 똑같이 `dispose()`가
 * 있어야 하는데 규칙이 없었다 — 지금은 만드는 곳이 텍스처 두 파일뿐이라
 * 우연히 안 새고 있을 뿐이고, **내일 컴포넌트가 재질 하나를 만들면 아무도
 * 모른다.** 종류를 세는 대신 「`dispose()`가 있는 THREE 생성자」로 넓힌다.
 */
const DISPOSABLE_SOURCE = String.raw`new THREE\.(\w*Geometry|\w*Material|\w*Texture|WebGLRenderTarget)\(`;

/**
 * 찾을 때마다 새로 만든다.
 *
 * `g` 붙은 정규식 하나를 돌려쓰면 `test()`가 `lastIndex`를 옮겨 **호출마다
 * 답이 달라진다** — 파일 목록이 절반만 걸리는 식이다. 여기서 실제로 그랬다.
 */
const disposable = () => new RegExp(DISPOSABLE_SOURCE, "g");

describe("만든 GPU 자원을 놓는가", () => {
  const files = collectSources("src").filter((path) => disposable().test(readCode(path)));

  it("자원을 만드는 파일을 실제로 찾았다", () => {
    expect(files.length, `찾은 파일 ${files.length}개`).toBeGreaterThan(3);
  });

  it("만드는 파일마다 해제가 있다", () => {
    const missing = files.filter((path) => !readCode(path).includes(".dispose()"));
    expect(missing, `해제가 없는 파일:\n${missing.join("\n")}`).toEqual([]);
  });

  it("만든 수만큼 놓는다", () => {
    /*
     * 하나씩 적으면 하나를 잊는다 — 그래플이 정확히 그랬다(둘을 만들고
     * 하나만 놓았다).
     *
     * 「목록으로 훑어라」고만 요구했더니 **캐시가 변수인 파일을 잘못 걸었다.**
     * `textures.ts`는 Map 둘과 단일 변수 둘을 쓰는데, 변수는 루프로 놓을
     * 수가 없다(실제로는 다 놓고 있다). 그러니 둘 중 하나면 된다:
     * 목록으로 훑거나, **만든 수 이상 놓거나.**
     */
    const hand: string[] = [];
    for (const path of files) {
      const source = readCode(path);
      const made = (source.match(disposable()) ?? []).length;
      if (made < 2) continue;
      const loops = /for \(const \w+ of [^)]+\) [\w.?]+\.dispose\(/.test(source);
      const released = (source.match(/\.dispose\(/g) ?? []).length;
      if (loops || released >= made) continue;
      hand.push(`${path}: ${made}개를 만드는데 ${released}번만 놓는다`);
    }
    expect(hand, hand.join("\n")).toEqual([]);
  });
});

describe("해제 함수가 캐시를 전부 비우는가", () => {
  /*
   * 「파사드 텍스처를 해제한다」는 이름을 달고 발광 마스크·빛웅덩이·필터를
   * 남겨 두었다. 루프가 도는 것은 일부 Map뿐이고, 변수 하나로 든 캐시나
   * 루프 밖의 Map은 그냥 지나친다.
   *
   * 한 파일만 보면 다음에 생길 모듈에서 같은 일이 반복된다 — 해제 함수를
   * 가진 모듈을 전부 훑는다.
   */
  const modules = collectSources("src").filter((path) =>
    /export function dispose\w*\(/.test(readCode(path)),
  );

  it("해제 함수를 가진 모듈을 실제로 찾았다", () => {
    expect(modules.length, `찾은 모듈: ${modules.join(", ") || "없음"}`).toBeGreaterThan(1);
  });

  it("모듈의 모든 캐시를 해제 함수가 건드린다", () => {
    const missed: string[] = [];
    /*
     * 파일마다 캐시가 없으면 건너뛴다. 그런데 **정규식이 낡으면 모든 파일이
     * 건너뛰고** 아무것도 안 보면서 통과한다 — 합계를 함께 센다.
     */
    let seen = 0;

    for (const path of modules) {
      const source = readCode(path);
      const caches = [...source.matchAll(/^(?:const|let) (\w*[Cc]ache\w*)\b/gm)].map((m) => m[1]);
      seen += caches.length;
      if (caches.length === 0) continue;

      // 파일 안의 해제 함수 본문을 모두 이어 붙인다 — 여러 개일 수 있다
      const bodies = [...source.matchAll(/export function dispose\w*\([^)]*\)[^{]*\{/g)]
        .map((match) => {
          const rest = source.slice(match.index ?? 0);
          return rest.slice(0, rest.indexOf("\n}"));
        })
        .join("\n");

      for (const cache of caches) {
        /*
         * 이름이 나오는지가 아니라 **놓는지**를 본다. 처음엔 언급만 셌는데,
         * `dispose()`를 지우고 `= null`만 남겨도 통과했다 — 비우기만 하면
         * GPU 자원은 그대로 남는다.
         */
        const releases =
          new RegExp(`${cache}\\??\\.dispose\\(`).test(bodies) ||
          // `atlas.texture.dispose()`처럼 한 단계 더 들어가는 경우도 있다
          new RegExp(`of ${cache}\\.values\\(\\)\\) [\\w.]+\\.dispose\\(`).test(bodies);
        if (!releases) missed.push(`${path}: ${cache}`);
      }
    }

    expect(seen, `찾은 캐시 ${seen}개`).toBeGreaterThan(2);
    expect(missed, `해제 함수가 지나치는 캐시:\n${missed.join("\n")}`).toEqual([]);
  });
});

describe("한 프레임의 시간 상한", () => {
  /*
   * 탭을 두고 돌아오면 첫 프레임의 delta가 몇 초가 된다. 그대로 적분하면
   * 한 걸음에 수십 미터를 움직여 벽을 통과한다.
   *
   * 상한 자체는 일곱 파일이 각자 들고 있었다. 값이 같아서 아무 일도 없었지만,
   * 한 곳만 고치면 그 컴포넌트만 다른 시간을 살게 된다 — 화면에서는
   * 「어떤 것만 느리다」로 나타나 원인을 찾기 어렵다.
   */
  it("정본이 하나다", () => {
    const owners = collectSources("src").filter((path) =>
      /const MAX_DELTA_SECONDS =/.test(readCode(path)),
    );
    expect(owners, `상한을 정의하는 파일: ${owners.join(", ")}`).toHaveLength(1);
    expect(owners[0]).toContain("tuning");
  });

  it("시뮬레이션을 돌리는 곳은 모두 상한을 쓴다", () => {
    /*
     * 판정을 「useFrame을 쓰는가」로 하면 조명·필터처럼 위상만 굴리는 곳까지
     * 걸린다. 실제로 시간을 적분하는 곳 — 시뮬레이션 함수를 부르는 곳만 본다.
     *
     * 이름을 여섯 개 적어 두었었다. 그런데 실제 `step*` 함수는 그 두 배가 넘어
     * **새로 만든 것은 조용히 빠졌다**(그중 하나는 이번 세션에 내가 만든
     * `stepInteraction`이다). 이름을 모으는 대신 **모양**으로 잡는다.
     */
    const SIM_CALLS = /\bstep[A-Z][A-Za-z]*\(/;

    const missing = collectSources("src").filter((path) => {
      const source = readCode(path);
      if (!SIM_CALLS.test(source)) return false;
      /*
       * 함수를 **정의하는** 순수 모듈은 dt를 받기만 한다 — 상한은 부르는
       * 쪽(프레임을 아는 쪽)의 책임이다. 처음에 정의부까지 세어 세 파일이
       * 걸렸다.
       */
      if (/export function step\w+\(/.test(source)) return false;
      return !source.includes("MAX_DELTA_SECONDS");
    });

    expect(missing, `상한 없이 시뮬레이션을 돌린다:\n${missing.join("\n")}`).toEqual([]);
  });

  it("시뮬레이션을 부르는 곳을 실제로 찾았다", () => {
    // 함수 이름이 바뀌면 빈 목록을 훑으며 통과한다
    const users = collectSources("src").filter((path) => {
      const source = readCode(path);
      return (
        /\bstep[A-Z][A-Za-z]*\(/.test(source) && !/export function step\w+\(/.test(source)
      );
    });
    expect(users.length, `찾은 파일 ${users.length}개`).toBeGreaterThan(2);
  });
});

describe("같은 사실을 두 번 적지 않는가", () => {
  /*
   * 인도 상판 높이는 이미 정본(`CITY.sidewalkHeight`)이 있고, 거기에
   * 「예전에 양쪽에 0.16을 따로 적었다가 어긋난 적이 있어 여기로 올렸다」는
   * 기록까지 붙어 있다. 그런데 소품 배치 두 파일이 그 정리에서 빠져 여전히
   * 숫자를 들고 있었다 — 정본이 바뀌면 **소품만 공중에 뜨거나 보도에
   * 파묻힌다.** 화면을 자세히 봐야만 알 수 있는 종류다.
   */
  it("인도 높이를 숫자로 다시 적지 않는다", () => {
    const canonical = collectSources("src").filter((path) => path.endsWith("cityLayout.ts"));
    expect(canonical.length, "정본 파일을 못 찾았다").toBe(1);

    const literal = collectSources("src")
      .filter((path) => !path.endsWith("cityLayout.ts"))
      .filter((path) => /SIDEWALK_TOP\s*=\s*[\d.]/.test(readCode(path)));

    expect(literal, `인도 높이를 다시 적는 파일:\n${literal.join("\n")}`).toEqual([]);
  });

  it("쓰는 곳이 정본에서 가져온다", () => {
    // 상수를 지우고 숫자를 인라인해도 위 검사는 통과한다. 실제로 쓰는지 본다
    const users = collectSources("src").filter((path) => readCode(path).includes("SIDEWALK_TOP"));
    expect(users.length, `쓰는 파일 ${users.length}개`).toBeGreaterThan(1);
    for (const path of users) {
      expect(readCode(path), `${path}가 정본을 가져오지 않는다`).toContain("CITY.sidewalkHeight");
    }
  });
});

describe("프레임 안에서 순서를 전제하는 곳", () => {
  /*
   * 동료 능력은 세 걸음으로 이뤄진다: PlayerRig가 배율을 1로 되돌리고,
   * 동료가 자기 배율을 합쳐 넣고, 적이 그 값을 읽는다. 되돌리는 코드에
   * 「동료들이 **이 뒤에** 합쳐 넣는다」고 순서를 전제해 두었다.
   *
   * R3F는 우선순위를 주지 않으면 등록 순서대로 돈다 — 즉 **JSX에 적힌
   * 형제 순서**가 곧 프레임 순서다. 한 줄만 위아래로 옮기면 되돌리기가
   * 동료의 값을 매 프레임 지우고, 능력은 눌러도 아무 일이 없어진다.
   * 예외도 오류도 없이 그냥 조용하다.
   */
  const scene = readCode("src/game/scene/GameScene.tsx");
  const at = (tag: string) => scene.indexOf(`<${tag}`);

  it("씬에서 셋을 모두 찾았다", () => {
    for (const tag of ["PlayerRig", "Companion", "Enemies"]) {
      expect(at(tag), `${tag}을 못 찾았다`).toBeGreaterThan(-1);
    }
  });

  it("되돌리기 → 합치기 → 읽기 순서다", () => {
    expect(at("PlayerRig"), "동료가 되돌리기보다 먼저 돈다").toBeLessThan(at("Companion"));
    expect(at("Companion"), "적이 동료보다 먼저 읽는다").toBeLessThan(at("Enemies"));
  });

  it("우선순위를 손으로 주지 않는다", () => {
    /*
     * 어딘가 `useFrame(fn, 1)`이 생기면 등록 순서가 더 이상 프레임 순서가
     * 아니다 — 위 순서 검사가 의미를 잃는다.
     */
    const withPriority = collectSources("src").filter((path) =>
      /useFrame\([^)]*,\s*-?\d/.test(readCode(path)),
    );
    expect(withPriority, `우선순위를 준 파일: ${withPriority.join(", ")}`).toEqual([]);
  });

  it("되돌리는 곳과 합치는 곳이 그대로 있다", () => {
    /*
     * 둘 중 하나가 사라지면 순서 검사는 통과하면서 능력이 망가진다.
     *
     * 두 조각이 차례로 모듈로 이사하면서 이 검사가 두 번 깨졌다 — 둘 다
     * **결함이 아니라 이사**다. 「무슨 글자가 있는가」 대신 **「그 프레임 콜백이
     * 그 일을 부르는가」**로 바꿨다. 순서가 뜻을 갖는 것은 두 호출이 각자
     * 제자리에서 일어날 때뿐이고, 되돌리는 값과 합치는 규칙이 맞는지는
     * `tests/companion.test.ts`가 값으로 잰다.
     *
     * 한쪽만 검사가 있으면 다른 쪽이 조용히 사라진다 — 실제로 되돌리기 코드는
     * 지워도 아무도 모르는 상태였다.
     */
    expect(
      readCode("src/game/scene/PlayerRig.tsx"),
      "되돌리는 일을 부르지 않는다",
    ).toContain("resetCompanionEffects(");
    expect(
      readCode("src/game/dokebi/Companion.tsx"),
      "동료가 합치는 일을 부르지 않는다",
    ).toContain("projectCompanionEffects(");
  });
});

describe("포토 모드가 시간을 멈추는가", () => {
  /*
   * 포토 모드는 **플레이어 이동만** 멈추고 있었다. 로봇과 대장은 계속
   * 다가와 때리는데 플레이어는 움직일 수도 피할 수도 없다 — 화면에서
   * 포즈를 고르는 동안 체력이 5에서 1이 됐다.
   *
   * 타입 주석은 「시뮬레이션을 멈춘다」고 **단언하고 있었다.** 계약과 구현이
   * 갈라진 채였고 아무도 대조하지 않았다.
   *
   * 목록으로 적지 않는다: 플레이어를 때릴 수 있는 것은 **체력이나 충격에 손대는**
   * 컴포넌트다. 그 조건으로 찾아서 전부 검사한다.
   *
   * 조건을 한 번 넓혔다. 처음엔 `link.playerHp` 같은 **대입 모양**만 봤는데,
   * 그 대입들을 `projectPlayerVitals`·`consumeSlam`으로 빼자 목록이 비었다 —
   * **결함이 아니라 이사**다. 하는 일(체력·충격을 다룬다)로 찾으면 코드가 어떻게
   * 생겼든 걸린다.
   */
  const attackers = collectSources("src").filter((path) => {
    const source = readCode(path);
    if (!/useFrame\(/.test(source)) return false;
    return /link\.(playerHp|bossSlamHit)|stepPlayerCombat|consumeSlam|projectPlayerVitals/.test(
      source,
    );
  });

  it("때릴 수 있는 컴포넌트를 실제로 찾았다", () => {
    expect(attackers.length, `찾은 것: ${attackers.join(", ")}`).toBeGreaterThan(1);
  });

  it("멈출 수 있게 되어 있다", () => {
    /*
     * 처음엔 파일에 `frozen`이라는 **낱말이 있는지만** 봤다. 그러면
     * `const dt = frozen ? 0 : ...`에서 조건만 지워도 통과한다 —
     * props에 이름이 남아 있기 때문이다. 되돌려 보고 알았다.
     *
     * 시간을 재는 그 줄이 실제로 `frozen`을 보는지 확인한다.
     */
    const missing = attackers.filter((path) => !/const dt = [^;]*\bfrozen\b/.test(readCode(path)));
    expect(missing, `시간을 멈추지 않는 곳:\n${missing.join("\n")}`).toEqual([]);
  });

  it("씬이 포토 모드를 실제로 넘긴다", () => {
    // 받을 준비만 하고 안 넘기면 아무것도 안 멈춘다
    const scene = readCode("src/game/scene/GameScene.tsx");
    const passes = [...scene.matchAll(/frozen=\{([^}]+)\}/g)].map((match) => match[1].trim());
    expect(passes.length, `넘기는 곳 ${passes.length}군데`).toBe(attackers.length);
    for (const value of passes) {
      expect(value, `frozen에 ${value}를 넘긴다`).toContain("photoMode");
    }
  });
});

describe("텍스처를 다시 만들지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 캐시 적중을 우회해도(`if (cached) return cached;`
   * 를 없애도) 검사가 전부 통과했다.
   *
   * 이 실패는 눈에 안 보인다 — 화면은 똑같고 오류도 없다. 대신 부를 때마다
   * 캔버스와 GPU 텍스처가 새로 생기고, 해제 경로는 **마지막 것만** 놓는다.
   * 메모리가 자라다 탭이 무거워질 뿐이라 원인을 찾기가 가장 어려운 종류다.
   *
   * 캔버스가 있어야 하는 코드라 노드에서 돌릴 수 없다. 소스에서 **캐시가
   * 있고, 적중하면 곧바로 돌려주고, 만든 것을 넣는지**를 본다.
   */
  const source = readCode("src/game/world/textures.ts");

  it("캐시를 들고 있다", () => {
    expect(source, "텍스처 캐시가 없다").toMatch(/const \w*[Cc]ache = new Map</);
  });

  it("모든 캐시가 적중하면 곧바로 돌려준다", () => {
    /*
     * `if (cached) return cached;`가 없으면 캐시는 **쌓기만 하고 아무도 안 읽는**
     * 자료구조가 된다 — 있는데 없는 것과 같다.
     *
     * **하나만 확인하면 안 된다.** 이 파일에는 캐시가 셋(외벽·필터·타일)이고,
     * 처음에 「어딘가 한 곳이 맞으면 통과」로 썼더니 **한 곳을 뚫어도 통과했다.**
     * 읽는 곳 수와 곧바로 돌려주는 곳 수가 같아야 한다.
     */
    const reads = source.match(/const cached = \w+\.get\(/g) ?? [];
    const returns = source.match(/if \(cached\) return cached;/g) ?? [];
    expect(reads.length, `캐시를 읽는 곳 ${reads.length}군데`).toBeGreaterThan(2);
    expect(
      returns.length,
      `읽는 곳 ${reads.length}군데 중 곧바로 돌려주는 곳은 ${returns.length}군데`,
    ).toBe(reads.length);
  });

  it("만든 것을 캐시에 넣는다", () => {
    // 읽기만 하고 넣지 않으면 영원히 빈 캐시다
    expect(source, "만든 텍스처를 캐시에 안 넣는다").toMatch(/\w+\.set\([^)]*,\s*\w+\)/);
  });
});

describe("Map 캐시가 읽고 쓰기를 둘 다 하는가", () => {
  /*
   * 텍스처 캐시 셋 중 **둘이 비어 있었다** — `facadeCache.set`과 `tileCache.set`을
   * 지워도 아무 검사가 몰랐다. 쓰지 않는 캐시는 매번 새 캔버스를 그리고 새
   * 텍스처를 만든다. 화면은 똑같이 나오는데 **텍스처가 계속 쌓인다** — 해제
   * 함수는 캐시만 훑으므로 그렇게 만든 것은 영영 안 지워진다.
   *
   * 반대 방향도 같은 무게다: `get`이 없으면 캐시를 채우기만 하고 매번 새로
   * 그리므로, 메모리는 쌓이고 이득은 0이다.
   *
   * **Map으로 든 캐시만 본다.** 변수 하나로 든 캐시(`lampGlowCache`)는 문법이
   * 달라 걸러야 한다 — 이 파일이 위에서 이미 한 번 헛걸렸던 함정이다.
   */
  const caches: Array<{ file: string; name: string; gets: number; sets: number }> = [];
  for (const path of collectSources("src")) {
    const code = readCode(path);
    for (const found of code.matchAll(/(?:const|let)\s+(\w*[Cc]ache\w*)\s*=\s*new Map/g)) {
      const name = found[1];
      caches.push({
        file: path,
        name,
        gets: [...code.matchAll(new RegExp(`${name}\\.get\\(`, "g"))].length,
        sets: [...code.matchAll(new RegExp(`${name}\\.set\\(`, "g"))].length,
      });
    }
  }

  it("Map 캐시를 실제로 찾았다", () => {
    // 이름 규칙이 바뀌면 빈 목록을 훑으며 통과한다
    expect(caches.length, `찾은 캐시 ${caches.length}개`).toBeGreaterThan(2);
  });

  it("채우지 않는 캐시가 없다 — 매번 새로 그리면 텍스처가 쌓인다", () => {
    const unfilled = caches.filter((cache) => cache.sets === 0);
    expect(
      unfilled.map((cache) => `${cache.file}: ${cache.name}`),
      "읽기만 하고 채우지 않는 캐시",
    ).toEqual([]);
  });

  it("읽지 않는 캐시가 없다 — 채우기만 하면 메모리만 쌓이고 이득이 0이다", () => {
    const unread = caches.filter((cache) => cache.gets === 0);
    expect(
      unread.map((cache) => `${cache.file}: ${cache.name}`),
      "채우기만 하고 읽지 않는 캐시",
    ).toEqual([]);
  });
});
