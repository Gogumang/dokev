import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readCode } from "./support/source";

import {
  buildCaptureFilename,
  downloadBlob,
  CLIP_MIME_CANDIDATES,
  extensionForMime,
  pickClipMimeType,
  CLIP_MAX_SECONDS,
} from "@/game/systems/capture";

describe("pickClipMimeType", () => {
  it("선호도 순으로 첫 번째 지원 형식을 고른다", () => {
    // Arrange — mp4는 안 되고 webm만 되는 브라우저 (구형 크롬)
    const isSupported = (mime: string) => mime.startsWith("video/webm");

    // Act
    const picked = pickClipMimeType(CLIP_MIME_CANDIDATES, isSupported);

    // Assert — webm 중에서도 앞선 후보가 나와야 한다
    expect(picked, `picked was: ${picked}`).toBe("video/webm;codecs=vp9");
  });

  it("mp4가 되면 mp4를 먼저 고른다", () => {
    // 사파리는 webm 녹화가 안 되고 mp4만 된다
    const picked = pickClipMimeType(CLIP_MIME_CANDIDATES, (mime) => mime.startsWith("video/mp4"));
    expect(picked, `picked was: ${picked}`).toBe("video/mp4;codecs=avc1");
  });

  it("아무것도 지원하지 않으면 null", () => {
    // 클립은 보조 기능이다 — null이면 사진만 쓰고 게임은 계속 돌아야 한다
    expect(pickClipMimeType(CLIP_MIME_CANDIDATES, () => false)).toBeNull();
  });

  it("후보가 비어 있어도 터지지 않는다", () => {
    expect(pickClipMimeType([], () => true)).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("코덱 파라미터를 무시하고 확장자를 뽑는다", () => {
    expect(extensionForMime("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensionForMime("video/webm;codecs=vp9")).toBe("webm");
  });

  it("대소문자와 공백을 견딘다", () => {
    expect(extensionForMime("  VIDEO/MP4 ; codecs=avc1")).toBe("mp4");
  });

  it("이미지 형식도 처리한다", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });

  it("모르는 형식은 bin으로 떨어진다", () => {
    // 확장자가 없는 파일을 만드는 것보다 낫다
    expect(extensionForMime("application/octet-stream")).toBe("bin");
  });
});

describe("buildCaptureFilename", () => {
  it("시각을 0으로 채워 넣는다", () => {
    // Arrange — 한 자리 월·일·시가 그대로 들어가면 정렬이 깨진다
    const at = new Date(2026, 7, 5, 9, 3, 7);

    // Act
    const name = buildCaptureFilename("photo", "png", at);

    // Assert
    expect(name, `name was: ${name}`).toBe("dokev-photo-20260805-090307.png");
  });

  it("같은 초가 아니면 이름이 겹치지 않는다", () => {
    const first = buildCaptureFilename("clip", "mp4", new Date(2026, 0, 1, 0, 0, 0));
    const second = buildCaptureFilename("clip", "mp4", new Date(2026, 0, 1, 0, 0, 1));
    expect(second, `first=${first}, second=${second}`).not.toBe(first);
  });

  it("파일 이름에 쓸 수 없는 문자가 들어가지 않는다", () => {
    // 콜론과 슬래시는 파일 이름에 쓸 수 없다
    const name = buildCaptureFilename("photo", "png", new Date(2026, 11, 31, 23, 59, 59));
    expect(name, `name was: ${name}`).not.toMatch(/[:/\\?*"<>|]/);
  });

  it("접두사로 사진과 클립을 구분할 수 있다", () => {
    const at = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildCaptureFilename("photo", "png", at)).toContain("-photo-");
    expect(buildCaptureFilename("clip", "webm", at)).toContain("-clip-");
  });
});

describe("클립 길이 제한", () => {
  it("최대 길이가 정해져 있다", () => {
    /*
     * 제한이 없으면 사용자가 멈추는 것을 잊었을 때 조각이 메모리에 무한정
     * 쌓인다. 1080p 30fps webm이 초당 2~5MB이므로 10분이면 기가 단위가 되고
     * 탭이 죽는다 — 저장 실패도 아니고 게임이 통째로 사라진다.
     */
    expect(CLIP_MAX_SECONDS, `${CLIP_MAX_SECONDS}s`).toBeGreaterThan(5);
    expect(CLIP_MAX_SECONDS, `${CLIP_MAX_SECONDS}s`).toBeLessThanOrEqual(60);
  });

  it("안내 문구가 길이를 알려 준다", () => {
    // 몇 초까지인지 모르면 사용자는 계속 눌러 놓는다
    const play = readFileSync("src/app/play/useCapture.ts", "utf8");
    expect(play).toContain("CLIP_MAX_SECONDS");
    expect(play, "녹화 시작 안내에 길이가 없다").toMatch(/최대 \$\{CLIP_MAX_SECONDS\}초/);
  });

  it("자동 종료와 수동 종료가 같은 저장 경로를 쓴다", () => {
    /*
     * 두 경로가 갈리면 자동 종료된 녹화만 저장이 빠지는 일이 생긴다 —
     * 30초를 찍고 아무것도 못 얻는 것이 가장 나쁜 결과다.
     */
    const play = readFileSync("src/app/play/useCapture.ts", "utf8");
    expect(play).toContain("stopAndSaveClip");
    expect(play).toContain('stopAndSaveClip("limit")');
    expect(play).toContain('stopAndSaveClip("manual")');
  });
});

describe("녹화를 멈추면 스트림도 놓는가", () => {
  /*
   * 정상 경로(`onstop`)에서만 트랙을 멈추고 있었다. 그런데 `stop()`은 세
   * 갈래로 끝난다 — 이미 멈춰 있던 경우, 정상 종료, 멈추다 예외.
   *
   * 나머지 둘로 끝나면 **캔버스 캡처 스트림이 켜진 채로 남는다.** 화면은
   * 멀쩡해서 아무도 모르고, 남은 세션 내내 프레임을 퍼 간다.
   */
  const source = readCode("src/game/systems/capture.ts");
  const stop = source.slice(source.indexOf("    stop() {"));
  const body = stop.slice(0, stop.indexOf("\n    },"));

  it("stop 본문을 실제로 잘라냈다", () => {
    // 이름이 바뀌면 빈 문자열을 훑으며 통과한다
    expect(body.length, `잘라낸 길이 ${body.length}`).toBeGreaterThan(200);
    expect(body).toContain("resolve");
  });

  it("끝나는 길마다 트랙을 놓는다", () => {
    /*
     * `resolve(...)`가 나오는 횟수만큼 트랙을 놓는 호출이 있어야 한다.
     * 하나라도 적으면 어느 길에선가 켜둔 채로 끝난다.
     */
    const resolves = body.match(/resolve\(/g)?.length ?? 0;
    const releases = body.match(/release\(\)/g)?.length ?? 0;
    expect(resolves, `resolve ${resolves}회`).toBeGreaterThan(2);
    expect(releases, `resolve ${resolves}회인데 놓는 곳은 ${releases}곳`).toBeGreaterThanOrEqual(
      resolves,
    );
  });

  it("시간 제한 타이머도 함께 정리한다", () => {
    // 손으로 멈춘 뒤 타이머가 살아 있으면 이미 끝난 녹화를 또 저장한다
    expect(body, "타이머를 정리하지 않는다").toContain("clearTimeout");
  });
});

describe("클립이 움직임을 담는가", () => {
  /*
   * 프레임률을 1로 줄여도 모든 검사가 통과했다 — 슬라이드쇼가 저장된다.
   * 이 게임이 파는 것은 움직임이고(그래서 사진만이 아니라 클립을 넣었다),
   * 초당 한 장으로는 그 이유가 통째로 사라진다.
   */
  it("호출부가 사람 눈에 이어지는 프레임률을 준다", () => {
    const source = readFileSync("src/app/play/useCapture.ts", "utf8");
    // 인자가 줄바꿈으로 흩어져도 읽는다 — 한 줄을 전제하면 서식 하나에 검사가 죽는다
    const match = /startClipRecording\(\s*canvas\s*,\s*(\d+)/.exec(source);
    expect(match, "녹화 호출을 못 찾았다").not.toBeNull();
    const fps = Number(match?.[1]);
    expect(fps, `초당 ${fps}장`).toBeGreaterThanOrEqual(24);
  });
});

describe("사진이 기대는 캔버스 설정", () => {
  /*
   * **주석으로만 이어져 있던 계약을 검사로 잇는다.**
   *
   * `capture.ts`는 「`preserveDrawingBuffer`가 켜져 있어야 그린 뒤에도 픽셀이
   * 남는다」고 적어 두었고, `GameScene`은 그 플래그를 켜 두었다. 그런데 **아무도
   * 그 둘을 대조하지 않았다.**
   *
   * 이 플래그는 성능 비용이 있어서 「최적화」로 꺼 보기 딱 좋다. 끄면 화면은
   * 멀쩡하고 **사진과 클립만 빈 이미지가 된다** — 눌러 보기 전에는 모르는
   * 종류의 고장이다.
   */
  it("씬이 preserveDrawingBuffer를 켜 둔다", () => {
    const scene = readCode("src/game/scene/GameScene.tsx");
    expect(scene, "사진 저장이 빈 이미지가 된다").toMatch(/preserveDrawingBuffer:\s*true/);
  });

  it("왜 필요한지가 두 곳 모두에 적혀 있다", () => {
    /*
     * 검사만 있으면 다음 사람은 「왜 켜 두는지」를 모른 채 끄려다 실패하고,
     * 검사를 고칠 생각부터 한다. 이유가 코드 옆에 있어야 한다.
     */
    for (const path of ["src/game/scene/GameScene.tsx", "src/game/systems/capture.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source, `${path}에 이유가 없다`).toContain("preserveDrawingBuffer");
    }
  });
});

describe("저장했다고 말할 자격이 있는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** `downloadBlob`이 실패를 **성공으로** 돌려줘도
   * 검사가 전부 통과했다.
   *
   * 그러면 화면에는 「…저장됨」이 뜨고 분석에는 `photo_saved`가 기록되는데
   * **파일은 없다.** 사용자는 나중에 폴더를 열고서야 안다 — 그때는 그 장면이
   * 이미 지나갔다. 게다가 「사진을 몇 명이나 저장하나」라는 신호까지 오염된다.
   *
   * 부르는 쪽은 이미 참/거짓으로 갈라 쓰고 있다. 문제는 **그 값이 진실인지**다.
   */
  const stubDom = (options: { throwOn?: "url" | "click" } = {}) => {
    const anchor = {
      href: "",
      download: "",
      click: () => {
        if (options.throwOn === "click") throw new Error("blocked");
      },
      remove: () => {},
    };
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { appendChild: () => {} },
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => {
        if (options.throwOn === "url") throw new Error("blocked");
        return "blob:x";
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal("window", { setTimeout: () => 0 });
    return anchor;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("되면 참을 돌려준다", () => {
    const anchor = stubDom();
    expect(downloadBlob(new Blob(["x"]), "a.png"), "됐는데 실패라고 한다").toBe(true);
    expect(anchor.download, "파일 이름을 안 넘겼다").toBe("a.png");
  });

  it("주소를 못 만들면 거짓을 돌려준다", () => {
    stubDom({ throwOn: "url" });
    expect(downloadBlob(new Blob(["x"]), "a.png"), "실패했는데 저장됐다고 한다").toBe(false);
  });

  it("내려받기가 막히면 거짓을 돌려준다", () => {
    stubDom({ throwOn: "click" });
    expect(downloadBlob(new Blob(["x"]), "a.png"), "실패했는데 저장됐다고 한다").toBe(false);
  });
});

describe("빈 클립을 저장했다고 하지 않는가", () => {
  /*
   * **변이로 뚫어 보고 알았다.** 조각이 하나도 없을 때 `null` 대신 **빈 Blob**을
   * 돌려줘도 검사가 전부 통과했다.
   *
   * 빈 파일도 내려받기는 성공한다 — 그래서 화면에는 「…저장됨」이 뜨고 분석에는
   * `clip_saved`가 기록되는데 **0바이트짜리 열리지 않는 파일**이 남는다.
   * 사진 저장에서 본 것과 같은 거짓 성공이다.
   *
   * `MediaRecorder`가 있어야 하는 코드라 노드에서 못 돌린다. 대신 **모든 반환
   * 지점**이 조각 수를 보는지 센다 — 「어딘가 한 곳이 맞으면 통과」로 쓰면
   * 두 지점 중 하나를 뚫어도 지나간다.
   */
  const source = readCode("src/game/systems/capture.ts");

  it("클립을 만드는 곳이 여럿이다", () => {
    // 하나뿐이라면 아래 개수 비교가 뜻이 없다 — 전제를 먼저 확인한다
    const builds = source.match(/new Blob\(chunks/g) ?? [];
    expect(builds.length, `클립을 만드는 곳 ${builds.length}군데`).toBeGreaterThan(1);
  });

  it("모든 반환 지점이 조각이 있는지 본다", () => {
    const builds = source.match(/new Blob\(chunks/g) ?? [];
    const guarded = source.match(/chunks\.length \? new Blob\(chunks/g) ?? [];
    expect(
      guarded.length,
      `만드는 곳 ${builds.length}군데 중 조각을 확인하는 곳은 ${guarded.length}군데`,
    ).toBe(builds.length);
  });
});
