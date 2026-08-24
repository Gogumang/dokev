import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectSources } from "./support/source";

/*
 * 구조 제약 — 지금까지 규율로만 지켜지던 것들.
 *
 * "랜딩에는 3D를 싣지 않는다"는 이 프로젝트의 초기 다운로드 예산을 지탱하는
 * 약속이고, 실수로 import 하나만 추가해도 조용히 깨진다. 번들을 열어 보기
 * 전까지 아무도 모른다 — 화면은 멀쩡히 뜨기 때문이다.
 */

/** import 경로를 뽑는다. 타입 전용 import는 런타임 번들에 남지 않으므로 뺀다 */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found: string[] = [];
  const pattern = /^\s*import\s+(type\s+)?([^;]*?)from\s+"([^"]+)"/gm;

  let match = pattern.exec(text);
  while (match) {
    const isTypeOnly = Boolean(match[1]) || /^\s*\{\s*type\s/.test(match[2]);
    if (!isTypeOnly) found.push(match[3]);
    match = pattern.exec(text);
  }
  return found;
}

/** "@/..." 경로를 실제 파일로 바꾼다 */
function resolve(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join("src", spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 시작 파일에서 도달 가능한 모든 모듈과 외부 패키지 */
function walk(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || files.has(current)) continue;
    files.add(current);

    for (const spec of importsOf(current)) {
      const resolved = resolve(spec);
      if (resolved) queue.push(resolved);
      else if (!spec.startsWith(".")) packages.add(spec);
    }
  }
  return { files, packages };
}

function collect(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path, extensions));
    else if (extensions.some((ext) => entry.name.endsWith(ext))) files.push(path);
  }
  return files;
}

describe("랜딩 화면", () => {
  const landing = walk("src/app/page.tsx");

  it("three.js를 끌고 오지 않는다", () => {
    /*
     * three는 이 프로젝트에서 가장 큰 의존성이다. 랜딩에 딸려 오면 첫 화면
     * 다운로드가 몇 배로 늘어난다 — 게임을 시작하지도 않은 사람에게.
     */
    const heavy = [...landing.packages].filter(
      (name) => name === "three" || name.startsWith("@react-three/"),
    );
    expect(heavy, `landing pulls: ${heavy.join(", ")}`).toEqual([]);
  });

  it("3D 씬 모듈을 끌고 오지 않는다", () => {
    const scene = [...landing.files].filter(
      (file) => file.includes("game/scene") || file.includes("game/world/City"),
    );
    expect(scene, `landing pulls: ${scene.join(", ")}`).toEqual([]);
  });

  it("빈 껍데기가 아니다 — 들어가는 길이 실제로 있다", () => {
    /*
     * 전에는 「설정과 조작 안내를 가져오는가」를 봤다. 시작 화면이 그 둘을
     * 담고 있었기 때문이다. 지금은 **주 행동 하나만 남기기로** 해서 두 패널을
     * 들어냈고(품질·닉네임·외형을 정하는 곳이 함께 사라졌다 — 아래 검사가
     * 그 구멍을 기록한다), 그 자리에 이 검사를 둔다.
     *
     * 지키려는 것은 같다: **너무 적게 가져오면 빈 껍데기**라는 것. 지금 시작
     * 화면이 반드시 해야 하는 일은 하나뿐이다 — 월드로 보내는 것.
     */
    const title = readFileSync("src/components/title/TitleScreen.tsx", "utf8");
    expect(title, "월드로 가는 링크가 없다").toContain('href="/play"');
    expect(title, "시작 버튼의 글이 없다").toContain("동네로 들어가기");
  });
});

describe("레이어 방향", () => {
  it("게임 로직이 UI 컴포넌트를 가져오지 않는다", () => {
    /*
     * src/game은 도메인이고 src/components는 표현이다. 도메인이 표현을
     * 가져오기 시작하면 HUD를 바꿀 때 시뮬레이션이 깨진다.
     *
     * 타입만 가져오는 것은 허용한다 — 런타임 의존이 아니고, 공유 객체의
     * 모양을 한쪽에만 적어 두는 편이 두 곳에 적는 것보다 안전하다.
     */
    const offenders: string[] = [];
    for (const file of collect("src/game", [".ts", ".tsx"])) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith("@/components")) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders, `runtime imports from components:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("순수 모듈이 three.js를 가져오지 않는다", () => {
    /*
     * 순수 계산 모듈은 렌더러 없이 테스트할 수 있어야 한다. three를 가져오는
     * 순간 그 파일은 브라우저 없이는 못 돈다.
     */
    /*
     * 손으로 적은 목록이었다. 삭제는 잡았지만(`existsSync`) **추가는 못
     * 잡아서**, 새로 만든 순수 모듈 열한 개가 조용히 빠져 있었다 — 목록은
     * 아는 것만 담는다.
     *
     * 규칙으로 바꾼다: `src/game` 아래 `.ts`는 화면 없이 도는 계산이다.
     * 화면을 만드는 것은 `.tsx`이고, 예외는 **텍스처를 굽는 둘**뿐이다 —
     * 캔버스에 그려 GPU로 올리는 일이라 three가 필요하다.
     */
    const RENDERER_TOUCHING = [
      "src/game/world/atlasTextures.ts",
      "src/game/world/textures.ts",
      // textures.ts가 800줄 상한을 넘어 하늘 한 장을 떼어 낸 것이다. 하는 일이
      // 같으므로 예외도 같이 따라온다.
      "src/game/world/skyTexture.ts",
      // 인스턴스 메시에 행렬을 써 넣는 일이라 three가 필요하다. City와
      // GroundSurfaces가 함께 쓰므로 어느 한쪽에 둘 수 없다.
      "src/game/world/instances.ts",
      // 셰이더 문자열에 손을 넣고 인스턴스 속성을 붙인다 — 같은 이유다.
      // City가 800줄 상한을 넘어 떼어 냈고, 파사드·간판·아틀라스가 함께 쓴다.
      "src/game/world/instancedUv.ts",
    ];

    const pureDirs = collectSources("src/game")
      .filter((path) => path.endsWith(".ts"))
      .filter((path) => !RENDERER_TOUCHING.includes(path));

    // 목록이 아니라 규칙이므로, 훑을 것이 실제로 있는지부터 본다
    expect(pureDirs.length, `순수 모듈 ${pureDirs.length}개`).toBeGreaterThan(20);

    for (const path of RENDERER_TOUCHING) {
      expect(existsSync(path), `${path}가 없다 — 예외 목록이 낡았다`).toBe(true);
    }

    for (const file of pureDirs) {
      expect(existsSync(file), `${file} not found — 목록이 낡았다`).toBe(true);
      const three = importsOf(file).filter((spec) => spec === "three" || spec.startsWith("@react-three"));
      expect(three, `${file} imports ${three.join(", ")}`).toEqual([]);
    }
  });

  it("브라우저 API를 쓰는 모듈이 허용 목록 안이다", () => {
    /*
     * document를 쓰는 모듈은 서버에서 부르면 터진다. 지금은 다섯 개고 전부
     * 브라우저 전용으로 설계된 것들이다:
     *
     * - textures / atlasTextures : 캔버스에 텍스처를 그린다
     * - quality                  : WebGL 지원 여부를 캔버스로 확인한다
     * - capture                  : 저장용 다운로드 링크를 만든다
     * - audio/index              : 탭이 가려지면 소리를 멈춘다(visibilitychange)
     *
     * 목록을 박아 두는 이유는 **늘어날 때 눈에 띄게** 하기 위해서다. 새 모듈이
     * document를 만지기 시작하면 정말 브라우저 전용인지 한 번 생각하게 된다.
     */
    const allowed = [
      "src/game/systems/audio/index.ts",
      "src/game/systems/capture.ts",
      /*
       * 색보정은 순수 데이터지만 **톤 항목이 존재하는지**는 브라우저에 물어야
       * 안다 — 2D 캔버스가 `ctx.filter`를 실제로 먹는지 넣어 보고 읽는다.
       * 없는 곳에서는 거짓을 돌려주므로 서버·테스트에서도 안전하다. 이걸
       * 모르면 화면만 흑백이고 사진은 컬러로 저장된다.
       */
      "src/game/systems/photoFilter.ts",
      "src/game/systems/quality.ts",
      "src/game/world/atlasTextures.ts",
      "src/game/world/textures.ts",
    ];

    const users = collect("src/game", [".ts"])
      .filter((file) => /\bdocument\./.test(readFileSync(file, "utf8")))
      .sort();
    expect(users, `modules touching document: ${users.join(", ")}`).toEqual(allowed);
  });
});
