import type { DokebiId } from "@/game/dokebi/roster";

export type AbilityVfxKind = "motes" | "smoke" | "ripples" | "beacon";

export interface AbilityVfxProfile {
  readonly kind: AbilityVfxKind;
  readonly radius: number;
}

export interface AbilityVfxFrame {
  readonly visible: boolean;
  /**
   * 나타남·사라짐의 세기 0~1.
   *
   * 불투명도 자체를 돌려주다가 **몸 색과 강조 색이 같은 값으로 덮였다** —
   * 화면에서는 두 색이 겹친 자리의 깊이가 사라진다. 세기만 돌려주고 각
   * 재질의 기준 불투명도(`ABILITY_VFX_OPACITY`)에 곱하면 대비가 남는다.
   */
  readonly strength: number;
  readonly scale: number;
  readonly rotation: number;
  readonly pulse: number;
}

/** 재질별 기준 불투명도. 능력이 한창일 때의 값이고 세기가 여기에 곱해진다 */
export const ABILITY_VFX_OPACITY = { body: 0.56, accent: 0.78 } as const;

export const ABILITY_VFX_BODY = {
  moteRadius: 0.07,
  smokeRadius: 0.22,
  ringThickness: 0.025,
  beaconBeamRadius: 0.09,
  beaconBeamHeightScale: 1.6,
  beaconRingRadiusScale: 0.72,
  beaconRingThickness: 0.03,
} as const;

export const ABILITY_VFX_PROFILES: Readonly<Record<DokebiId, AbilityVfxProfile>> = {
  chorong: { kind: "motes", radius: 0.9 },
  geueum: { kind: "smoke", radius: 0.75 },
  mulbineul: { kind: "ripples", radius: 1.25 },
  jajeong: { kind: "beacon", radius: 1.55 },
};

export function abilityVfxFrame(
  remaining: number,
  duration: number,
  elapsed: number,
  reducedMotion: boolean,
): AbilityVfxFrame {
  if (remaining <= 0) {
    return { visible: false, strength: 0, scale: 0, rotation: 0, pulse: 0 };
  }

  if (reducedMotion) {
    return { visible: true, strength: 1, scale: 1, rotation: 0, pulse: 0 };
  }

  const entry = Math.min(1, Math.max(0, (duration - remaining + 0.08) / 0.22));
  const exit = Math.min(1, remaining / 0.35);
  const strength = Math.min(entry, exit);

  return {
    visible: true,
    strength,
    scale: 0.72 + 0.28 * entry,
    rotation: elapsed * 1.15,
    pulse: Math.sin(elapsed * 5.2) * 0.08,
  };
}
