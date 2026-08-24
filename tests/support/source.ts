import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * 소스를 훑는 검사가 쓰는 도우미.
 *
 * 이 세션에서 **다섯 번** 같은 실수를 했다 — 「`clearRect`를 쓰지 않는다」,
 * 「`it(` 본문에 단언이 있다」, 「`<main>`은 하나다」 같은 검사가 **왜 그렇게
 * 고쳤는지 적어 둔 주석**을 실제 코드로 잡았다.
 *
 * 매번 주석 제거를 손으로 붙이는 대신 여기로 모은다. 검사가 좋은 기록을
 * 방해하면 그 검사가 잘못된 것이고, 같은 잘못을 반복하게 만드는 구조라면
 * 구조가 잘못된 것이다.
 */

/** 주석을 걷어낸 소스. 무엇이 실제로 코드인지만 남는다 */
export function readCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * 폴더 아래 소스 전부.
 *
 * 여러 검사가 각자 같은 순회를 들고 있었다 — 손으로 적은 파일 목록이 하나를
 * 빠뜨리는 것을 이번 세션에 여러 번 봤고, 그 대안인 순회마저 복사되면 한쪽만
 * 고쳐지는 날이 온다.
 */
export function collectSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? collectSources(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}
