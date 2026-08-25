import Image from "next/image";

/**
 * 배경 — 시작 화면 그림 한 장과 그 위의 대비 보호막.
 *
 * 전에는 SVG 도형으로 장면을 그렸다. 도형으로는 명암도 질감도 두 단계가 한계라
 * **인물이 스티커처럼 보였다** — 게임 키아트가 아니라 다이어그램이었다.
 *
 * 그림 한 장으로 바꾼다. 이 저장소는 원래 외부 에셋을 캐릭터 모델 하나만
 * 허용했고 나머지를 전부 코드로 만들었는데(런타임 캔버스 텍스처, Web Audio 합성),
 * 그 규칙은 **초기 다운로드 예산** 때문이지 그림이 싫어서가 아니다. WebP로 줄여
 * 137KB이고, 첫 화면에서 가장 크게 보이는 것이 이 한 장이라 값을 한다.
 *
 * 검사 둘을 함께 고쳐야 들어온다 — 에셋 허용 목록(`tests/forbiddenApis.test.ts`)과
 * 크기 수치다. 목록에 없는 파일은 통과하지 못하는 것이 이 저장소의 잠금장치다.
 *
 * 보호막은 **글이 놓이는 자리에만** 깐다. 그림이 밝아서 흰 글씨가 그냥은 안 읽힌다.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
       * `object-cover`로 화면을 채운다. 세로가 긴 화면에서는 좌우가 잘리는데,
       * 그림의 인물이 가운데에 몰려 있어 잘려도 남는다.
       */}
      {/*
       * `unoptimized`인 이유: 원본이 이미 폭 1600의 WebP다(2.26MB PNG를 137KB로
       * 줄여 넣었다). 최적화 경로를 거치면 `sizes="100vw"`가 넓은 화면에서
       * **3840px 판을 요청**하고, 없는 화소를 늘려 만드느라 첫 화면이 몇 초간
       * 검게 남는다. 실제로 그렇게 됐다.
       */}
      <Image
        src="/title-street.webp"
        alt=""
        fill
        sizes="100vw"
        priority
        unoptimized
        className="object-cover"
      />
      {/* 왼쪽 — 제목과 시작 버튼이 얹힌다 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(9,7,14,0.72) 0%, rgba(9,7,14,0.45) 26%, rgba(9,7,14,0) 54%)",
        }}
      />
      {/* 아래 — 저장 안내와 고지가 화면 아래를 가로지른다 */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "26vh",
          background:
            "linear-gradient(180deg, rgba(9,7,14,0) 0%, rgba(9,7,14,0.45) 42%, rgba(9,7,14,0.86) 100%)",
        }}
      />
    </div>
  );
}
