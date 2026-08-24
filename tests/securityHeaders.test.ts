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
});
