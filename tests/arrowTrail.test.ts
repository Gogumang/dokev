import { describe, expect, it } from "vitest";

import { ARROW_TRAIL, trailInstanceCount, trailSegment } from "@/game/combat/arrowTrail";
import { RAINBOW } from "@/game/core/rainbow";
import { fireWeaponBolt, PLAYER_BOLT_MAX } from "@/game/combat/projectiles";
import { WEAPON_ORDER, WEAPONS } from "@/game/combat/weapons";

/*
 * 화살이 남기는 무지개 자국.
 *
 * 화면 없이 잴 수 있어야 해서 자리와 색만 계산으로 뽑는다 — 그리는 일은
 * `arrowTrailPaint`가 하고, 여기서 보는 것은 **리본이 리본인가**다.
 */

describe("리본의 모양", () => {
  const segments = Array.from({ length: ARROW_TRAIL.segments }, (_, i) =>
    trailSegment(i, 0, false),
  );

  it("뒤로 갈수록 멀어진다", () => {
    // 간격이 뒤집히면 마디가 화살 앞으로 튀어나간다
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].back, `${i}번 마디`).toBeGreaterThan(segments[i - 1].back);
    }
  });

  it("뒤로 갈수록 작아지고 옅어진다", () => {
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].scale, `${i}번 크기`).toBeLessThan(segments[i - 1].scale);
      expect(segments[i].opacity, `${i}번 불투명도`).toBeLessThan(segments[i - 1].opacity);
    }
  });

  it("꼬리는 완전히 사라진다", () => {
    // 남아 있으면 리본이 아니라 **막대**가 된다 — 끝이 뭉툭하게 잘려 보인다
    expect(segments[segments.length - 1].opacity).toBeCloseTo(0, 6);
  });

  it("첫 마디가 화살보다 크다", () => {
    /*
     * 처음에는 화살보다 **작게** 잡았다(0.85). 화면에서 보니 22m/s로 나는
     * 화살 뒤에서 점 하나로 뭉개져 아예 안 읽혔다 — 리본이려면 화살보다 커야
     * 한다. 대신 꼬리는 확실히 가늘어져야 방향이 읽힌다.
     */
    expect(ARROW_TRAIL.headScale).toBeGreaterThan(1);
    expect(ARROW_TRAIL.tailScale).toBeLessThan(ARROW_TRAIL.headScale / 3);
  });
});

describe("무지개인가", () => {
  it("한 번에 여섯 색이 다 나온다", () => {
    /*
     * 마디 수와 색 수가 맞아떨어져야 **한 리본 안에** 색상환이 한 바퀴 담긴다.
     * 어긋나면 같은 색이 두 번 나오고 그 자리가 뭉쳐 보인다.
     */
    const colors = new Set(
      Array.from({ length: ARROW_TRAIL.segments }, (_, i) => trailSegment(i, 0, false).colorIndex),
    );
    expect(colors.size, `${colors.size}색`).toBe(RAINBOW.length);
    // 마디 수가 색 수의 배수여야 한 바퀴가 정확히 떨어진다
    expect(ARROW_TRAIL.segments % RAINBOW.length, "색상환이 중간에 끊긴다").toBe(0);
  });

  it("시간이 지나면 색이 흐른다", () => {
    /*
     * 고정이면 **줄무늬 막대**다. 흘러야 「빛이 지나간 자국」으로 읽힌다.
     */
    const now = trailSegment(0, 0, false).colorIndex;
    const later = trailSegment(0, 1 / ARROW_TRAIL.flowPerSecond / RAINBOW.length, false).colorIndex;
    expect(later, `${now} → ${later}`).not.toBe(now);
  });

  it("저감 모션에서는 색이 멈춘다", () => {
    // 흐르는 색은 어지럼의 원인이다. 자리는 그대로라 리본은 여전히 무지개다
    const a = trailSegment(2, 0, true);
    const b = trailSegment(2, 5, true);
    expect(b.colorIndex).toBe(a.colorIndex);
    expect(b.back).toBe(a.back);
  });

  it("색 번호가 언제나 목록 안이다", () => {
    // 음수 나머지로 목록 밖을 가리키면 색이 undefined가 되어 검게 그려진다
    for (const life of [0, 0.3, 1.6, 12.5]) {
      for (let i = 0; i < ARROW_TRAIL.segments; i += 1) {
        const at = trailSegment(i, life, false).colorIndex;
        expect(at, `life=${life} i=${i}`).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(RAINBOW.length);
      }
    }
  });
});

describe("누가 자국을 남기는가", () => {
  it("드는 무기가 모두 자국을 남긴다", () => {
    /*
     * 한때 활만 남겼다. 「광선총은 21m에 굵고 빨라서 탄 자체가 이미 읽힌다」가
     * 이유였는데, **원작을 잘못 읽은 것이었다** — 청백색 빔으로 본
     * frame-notes 066·067은 그래플로 나는 **이동 장면**이고, 공격은 084의
     * 「연둣빛 노랑·시안·분홍·마젠타가 S자로 휘감긴 리본」과 061의 「색색 광선
     * 다발」이다. 화면에서 채도를 독점하는 것이 공격 이펙트다.
     *
     * 드는 것이 둘뿐이라 「절반만 무지개」는 무기가 아니라 **실수로 읽힌다.**
     */
    for (const id of WEAPON_ORDER) {
      expect(WEAPONS[id].bolt.rainbow, `${id}가 자국을 안 남긴다`).toBe(true);
    }
  });

  it("쏜 탄이 그 표시를 들고 간다", () => {
    // 무기가 정한 것이 탄까지 안 오면 화면은 무기를 알 방법이 없다
    const bow = WEAPONS.bow.bolt;
    expect(bow).not.toBeNull();
    if (!bow) return;

    const fired = fireWeaponBolt([], 0, 0, 0, bow, WEAPONS.bow.damage);
    expect(fired[0].rainbow).toBe(true);
  });
});

describe("인스턴스 예산", () => {
  it("탄 수 × 마디 수만큼 잡는다", () => {
    // 모자라면 뒤쪽 탄의 자국이 통째로 안 그려진다
    expect(trailInstanceCount(PLAYER_BOLT_MAX)).toBe(PLAYER_BOLT_MAX * ARROW_TRAIL.segments);
  });

  it("한 화면에 감당할 만큼만 잡는다", () => {
    // 드로우콜은 하나지만 행렬은 매 프레임 다시 쓴다 — 수백 개는 그 자체로 비용이다
    expect(trailInstanceCount(PLAYER_BOLT_MAX)).toBeLessThanOrEqual(144);
  });
});

describe("리본에 흰 코어가 있는가", () => {
  /*
   * 원작의 공격 이펙트는 여러 색이 휘감긴 리본인데 **가장 밝은 곳이 흰
   * 코어**다(frame-notes 084 「가장 밝은 곳은 리본의 흰 코어」). 색만
   * 늘어놓으면 리본이 아니라 **색종이 줄**이 된다 — 앞이 타서 하얗고 뒤로
   * 갈수록 색이 드러나야 「지나간 자국」으로 읽힌다.
   */
  const segments = Array.from({ length: ARROW_TRAIL.segments }, (_, i) =>
    trailSegment(i, 0, false),
  );

  it("앞이 가장 하얗다", () => {
    expect(segments[0].whiteness, `첫 마디 ${segments[0].whiteness}`).toBe(1);
  });

  it("뒤로 갈수록 색이 드러난다", () => {
    for (let i = 1; i < segments.length; i += 1) {
      expect(segments[i].whiteness, `${i}번 마디`).toBeLessThanOrEqual(segments[i - 1].whiteness);
    }
  });

  it("꼬리는 흰빛이 없다 — 남으면 리본 끝이 하얗게 뜬다", () => {
    expect(segments[segments.length - 1].whiteness).toBe(0);
  });

  it("코어가 리본의 일부다 — 전부 희면 색이 사라진다", () => {
    const white = segments.filter((segment) => segment.whiteness > 0).length;
    expect(white, `${white}/${segments.length} 마디가 흰빛`).toBeLessThan(segments.length / 2);
    expect(white, "흰 코어가 아예 없다").toBeGreaterThan(1);
  });
});
