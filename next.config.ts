import type { NextConfig } from "next";

/**
 * 보안 응답 헤더.
 *
 * 이 게임은 서버에 아무것도 보내지 않고 저장도 전부 브라우저 안에서 한다.
 * 그래도 헤더는 의미가 있다 — 주입된 스크립트가 실행되는 것, 다른 사이트가
 * 이 페이지를 몰래 감싸는 것, 쓰지도 않는 장치 권한이 열려 있는 것을 막는다.
 *
 * **CSP는 「배포 전에 브라우저에서 확인하며 넣는다」고 미뤄 두었다.** 이제
 * 확인할 수 있어서 넣는다 — 프로덕션 빌드를 띄워 화면과 콘솔로 검증했다.
 */
const SECURITY_HEADERS = [
  // 브라우저가 선언된 MIME을 무시하고 내용을 추측하지 못하게 한다
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 외부 사이트로 나갈 때 경로·쿼리를 넘기지 않는다
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /*
   * 쓰지 않는 장치 권한을 명시적으로 닫는다. 이 게임은 카메라·마이크·위치를
   * 전혀 쓰지 않으므로 요청 자체가 있을 수 없다.
   */
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  /*
   * 다른 사이트가 프레임으로 감싸는 것을 막는다(클릭재킹).
   *
   * 나중에 블로그 임베드를 허용하려면 이 값을 SAMEORIGIN이나 CSP의
   * frame-ancestors로 바꿔야 한다 — 지금은 그런 요구가 없다.
   */
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * 콘텐츠 보안 정책.
 *
 * **nonce를 배선하지 않았다.** Next가 RSC 페이로드를 인라인 `<script>`로
 * 밀어 넣으므로 `'unsafe-inline'` 없이는 페이지가 통째로 죽는다. nonce는
 * 미들웨어까지 얽히는 일이라, 지금은 인라인을 열어 두고 **나머지를 닫는다.**
 *
 * 그래도 남는 값이 크다: 외부 출처 스크립트, 플러그인(`object`), 프레임
 * 삽입, `<base>` 가로채기, 바깥으로 나가는 연결을 전부 막는다. 인라인
 * 주입은 열려 있지만 이 앱에는 **넣을 통로가 없다** — 사용자 HTML을
 * 그리는 곳도 `dangerouslySetInnerHTML`도 없다.
 *
 * `blob:`은 사진·클립 저장에 필요하다(`URL.createObjectURL`). 빼면 저장
 * 버튼이 조용히 실패한다.
 *
 * 개발 서버에는 붙이지 않는다 — HMR이 `eval`을 쓰므로 켜면 그 자리에서 죽는다.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  /*
   * `blob:`이 없으면 **모델 텍스처가 통째로 안 뜬다.**
   *
   * three의 GLTFLoader는 GLB 안에 박힌 이미지를 꺼내 blob URL로 만들고,
   * `createImageBitmap`이 있는 브라우저에서는 `ImageBitmapLoader`로 읽는다.
   * 그건 `<img>`가 아니라 **`fetch()`**라서 `img-src`가 아니라 여기의 지배를
   * 받는다 — `img-src`에 `blob:`을 열어 둔 것만으로는 소용이 없었다.
   *
   * 배포본에서 캐릭터·대장·동료·차량이 전부 **텍스처 없는 흰 덩어리**로
   * 나왔다. 콘솔에는 `Couldn't load texture blob:...`이 GLB 수만큼 찍힌다.
   * CSP를 개발 서버에 안 붙이므로(아래 `isProduction`) 로컬에서는 멀쩡하고
   * **배포해야만 보인다** — 그래서 오래 안 잡혔다.
   *
   * 위험하지 않다. blob URL은 이 페이지가 스스로 만든 것이고 같은 출처다 —
   * 남의 데이터를 가리키는 blob을 만들 방법이 없다.
   */
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // X-Frame-Options와 같은 뜻이다. 두 헤더를 다 보는 브라우저가 섞여 있다
  "frame-ancestors 'none'",
].join("; ");

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  async headers() {
    const headers = isProduction
      ? [...SECURITY_HEADERS, { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }]
      : SECURITY_HEADERS;
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
