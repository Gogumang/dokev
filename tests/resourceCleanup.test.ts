import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * GPU 자원 해제.
 *
 * R3F는 씬 그래프에 붙인 객체는 정리하지만 **컴포넌트가 직접 만들어 넘긴
 * 지오메트리와 텍스처는 건드리지 않는다.** 해제하지 않으면 /play를 드나들
 * 때마다 버퍼가 쌓인다 — 한 번 보고 나가는 사람에게는 안 보이고, 여러 번
 * 드나드는 사람에게만 나타난다.
 *
 * 실제로 여섯 파일에서 지오메트리 32개가 해제되지 않고 있었다.
 */

function collect(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

const sources = collect("src/game").map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("지오메트리", () => {
  it("직접 만든 곳은 반드시 해제한다", () => {
    const offenders: string[] = [];

    for (const { path, text } of sources) {
      const creates = /new THREE\.\w*Geometry/.test(text);
      if (!creates) continue;
      // dispose를 부르는 정리 함수가 있어야 한다
      if (!/dispose\(\)/.test(text)) offenders.push(path);
    }

    expect(offenders, `geometry created but never disposed:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("정리를 언마운트 시점에 건다", () => {
    /*
     * useMemo 안에서 정리하면 안 된다 — React가 같은 렌더에서 두 번 부를 수
     * 있고, 그러면 쓰고 있는 지오메트리를 해제한다.
     */
    for (const { path, text } of sources) {
      if (!/new THREE\.\w*Geometry/.test(text)) continue;
      expect(
        /useLayoutEffect\(|useEffect\(/.test(text),
        `${path}: dispose가 정리 훅 밖에 있다`,
      ).toBe(true);
    }
  });
});

describe("복제한 텍스처", () => {
  it("clone한 텍스처를 해제한다", () => {
    /*
     * 텍스처 캐시는 공유 자원이라 해제하면 안 되지만, clone()한 것은 그
     * 컴포넌트의 것이다. 안 지우면 방문할 때마다 새 GPU 텍스처가 생긴다.
     */
    for (const { path, text } of sources) {
      /*
       * GPU 자원이 아닌 복제는 뺀다 — 행렬·벡터.
       *
       * `VehicleInstances`가 GLB 노드의 변환을 `matrixWorld.clone()`으로 떠
       * 온다. 순수 수치라 해제할 것이 없는데, `.clone()` 전부를 방아쇠로 두면
       * 여기서 「텍스처를 안 놓는다」고 걸린다.
       *
       * 규칙이 노리는 것은 처음부터 텍스처였다 — 위 주석이 그렇게 적혀 있다.
       * 방아쇠가 뜻보다 넓으면 걸리는 쪽이 규칙을 피해 가게 되고, 그러면 정작
       * 텍스처를 놓는 규칙이 사라진다.
       */
      const gpu = text.replace(/\w*([mM]atrix\w*|[vV]ector\w*|[qQ]uaternion)\.clone\(\)/g, "");
      if (!/\.clone\(\)/.test(gpu)) continue;
      expect(/texture\.dispose\(\)/.test(text), `${path}: clone한 텍스처를 해제하지 않는다`).toBe(
        true,
      );
    }
  });
});

describe("소리 자원 정리", () => {
  /*
   * 브라우저는 동시에 열 수 있는 AudioContext 수에 상한이 있다. `/play`를
   * 드나들 때마다 하나씩 새면 몇 번 만에 **소리가 아예 나지 않는다** — 그때는
   * 원인이 정리 누락이라는 것을 알아채기 어렵다.
   *
   * 들어 볼 수 없는 영역이라 구조로만 지킨다.
   */
  const audio = readFileSync("src/game/systems/audio/index.ts", "utf8");
  const dispose = audio.slice(audio.indexOf("dispose() {", audio.indexOf("disposed = true") - 200));
  const body = dispose.slice(0, dispose.indexOf("\n    },"));

  it("컨텍스트를 닫는다", () => {
    expect(body, "AudioContext가 닫히지 않는다").toContain("close()");
  });

  it("마스터를 끊는다", () => {
    // 닫기 전에 끊지 않으면 일부 브라우저에서 마지막 소리가 튄다
    expect(body).toContain("disconnect()");
  });

  it("붙인 리스너를 모두 뗀다", () => {
    const added = audio.match(/addEventListener\(/g)?.length ?? 0;
    const removed = audio.match(/removeEventListener\(/g)?.length ?? 0;
    expect(removed, `추가 ${added}곳, 제거 ${removed}곳`).toBeGreaterThanOrEqual(added);
  });

  it("두 번 불러도 안전하다", () => {
    // 언마운트가 겹치면 두 번 불린다. 가드가 없으면 닫힌 컨텍스트에 또 접근한다
    expect(body.includes("disposed") || dispose.slice(0, 200).includes("disposed")).toBe(true);
  });

  it("만든 음원은 반드시 멈춘다", () => {
    /*
     * 멈추지 않은 오실레이터는 컨텍스트가 살아 있는 내내 CPU를 먹는다.
     * 파일별로 생성 수와 정지 수를 맞춘다.
     */
    /*
     * 파일 셋을 손으로 적어 두었었다. 새 오디오 모듈은 **검사를 받지 않는다** —
     * 멈추지 않은 오실레이터는 예외도 소리도 없이 CPU만 먹으므로, 검사가
     * 보지 않으면 아무도 모른다. 만드는 파일을 직접 찾는다.
     */
    const makers = readdirSync("src/game/systems/audio")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => ({
        name,
        source: readFileSync(`src/game/systems/audio/${name}`, "utf8"),
      }))
      .filter((file) => /create(Oscillator|BufferSource)\(/.test(file.source));

    expect(makers.length, `음원을 만드는 파일 ${makers.length}개`).toBeGreaterThan(2);

    for (const file of makers) {
      const created = file.source.match(/create(Oscillator|BufferSource)\(/g)?.length ?? 0;
      const stopped = file.source.match(/\.stop\(/g)?.length ?? 0;
      expect(stopped, `${file.name}: 생성 ${created}개, 정지 ${stopped}개`).toBeGreaterThanOrEqual(
        created,
      );
    }
  });
});
