import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/*
 * 보안 응답 헤더.
 *
 * 설정 파일을 읽어 확인한다. 실제 응답을 받아 보려면 서버를 띄워야 하는데,
 * 그건 이 테스트가 감당할 범위가 아니다 — 여기서 잡으려는 것은 "헤더 설정이
 * 통째로 사라지는" 회귀다.
 */

const config = readFileSync("next.config.ts", "utf8");

describe("응답 헤더", () => {
  it("헤더 설정이 있다", () => {
    expect(config).toContain("async headers()");
    expect(config, "모든 경로에 적용해야 한다").toContain('source: "/:path*"');
  });

  it("MIME 추측을 막는다", () => {
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("nosniff");
  });

  it("리퍼러를 흘리지 않는다", () => {
    // 외부로 나갈 때 경로·쿼리가 따라가면 안 된다
    expect(config).toContain("Referrer-Policy");
    expect(config).toContain("strict-origin-when-cross-origin");
  });

  it("쓰지 않는 장치 권한을 닫는다", () => {
    const policy = /Permissions-Policy", value: "([^"]+)"/.exec(config)?.[1] ?? "";
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(policy, `${feature}가 열려 있다: ${policy}`).toContain(`${feature}=()`);
    }
  });

  it("프레임 삽입을 막는다", () => {
    expect(config).toContain("X-Frame-Options");
  });

  it("CSP가 프로덕션에만 붙는다", () => {
    /*
     * 개발 서버는 HMR에 `eval`을 쓴다. 개발에도 붙이면 그 자리에서 죽는다 —
     * 실제로 프로덕션 빌드를 3113에 띄워 확인하고 넣었다.
     */
    expect(config, "CSP가 없다").toContain("Content-Security-Policy");
    expect(config, "개발에도 붙는다").toMatch(/isProduction\s*\?/);
  });

  it("바깥으로 나가는 길을 닫는다", () => {
    /*
     * `'unsafe-inline'`을 열어 둔 정책이라 인라인 주입은 막지 못한다(Next가
     * RSC 페이로드를 인라인 스크립트로 밀어 넣는다). **나머지를 닫는 것**이
     * 이 정책의 값이므로 그쪽을 검사한다.
     */
    const policy = /const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join/.exec(config)?.[1] ?? "";
    expect(policy, "정책 목록을 못 읽었다").not.toBe("");

    for (const rule of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self'",
    ]) {
      expect(policy, `${rule}이 없다`).toContain(rule);
    }
  });

  it("사진·클립 저장을 막지 않는다", () => {
    /*
     * `blob:`을 빼면 저장 버튼이 **조용히** 실패한다. 화면에는 「저장에
     * 실패했습니다」만 뜨고 이유는 콘솔에만 남는다.
     */
    const policy = /const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join/.exec(config)?.[1] ?? "";
    for (const rule of ["img-src", "media-src"]) {
      const line = new RegExp(`"${rule}[^"]*"`).exec(policy)?.[0] ?? "";
      expect(line, `${rule}에 blob:이 없다`).toContain("blob:");
    }
  });

  /*
   * **이 검사가 없어서 배포본이 몇 판을 흰 인형으로 돌았다.**
   *
   * three의 GLTFLoader는 GLB 안에 박힌 텍스처를 꺼내 blob URL로 만들고,
   * `createImageBitmap`이 있는 브라우저에서는 `ImageBitmapLoader`로 읽는다.
   * 그건 `<img>`가 아니라 **`fetch()`**라서 `img-src`가 아니라 `connect-src`의
   * 지배를 받는다 — `img-src`에 `blob:`을 열어 둔 것만으로는 소용이 없었다.
   *
   * CSP를 개발 서버에는 안 붙이므로 로컬에서는 끝까지 멀쩡하고 **배포해야만**
   * 캐릭터·대장·동료·차량이 전부 텍스처 없는 흰 덩어리로 나온다.
   */
  it("모델 텍스처를 막지 않는다 — GLTFLoader는 blob을 fetch로 읽는다", () => {
    const policy = /const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join/.exec(config)?.[1] ?? "";
    const line = /"connect-src[^"]*"/.exec(policy)?.[0] ?? "";
    expect(line, "connect-src 줄을 못 읽었다").not.toBe("");
    expect(line, "connect-src에 blob:이 없다 — 배포본에서 모든 GLB가 텍스처 없이 뜬다").toContain(
      "blob:",
    );
  });

  it("three가 실제로 fetch 쓰는 로더를 고른다 — 이 검사의 전제다", () => {
    /*
     * 위 검사는 「GLTFLoader가 `ImageBitmapLoader`를 쓴다」를 전제로 한다.
     * three가 그 선택을 바꾸면 전제가 무너지고, 그때 이 검사는 **맞는 것을
     * 틀린 이유로** 지키게 된다.
     */
    const loader = readFileSync("node_modules/three/examples/jsm/loaders/GLTFLoader.js", "utf8");
    expect(loader, "GLTFLoader가 ImageBitmapLoader를 안 쓴다").toContain("new ImageBitmapLoader(");
  });
});
