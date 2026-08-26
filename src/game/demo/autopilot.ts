/**
 * 시연 영상을 위한 **자동 조종** — 순수 규칙.
 *
 * 사람이 90초를 똑같이 두 번 조작할 수는 없다. 영상을 다시 뽑을 때마다 다른
 * 판이 나오면 「음악에 맞춰 편집한다」가 성립하지 않고, 게임을 고친 뒤 같은
 * 영상을 다시 뽑는 일도 못 한다.
 *
 * 코스를 새로 지어내지 않는다. `demoRoute`가 이미 정본이다 — 구간마다 시각·
 * 자리·탈것이 있고, **그 속도로 갈 수 있는지까지 검사가 본다**
 * (`tests/demoRoute.test.ts`). 여기서는 그 자리를 향해 스틱을 미는 일만 한다.
 *
 * three.js도 React도 모른다. 시각과 자리를 받아 **이번 프레임에 무엇을
 * 누를지**만 돌려준다.
 */

import type { DemoBeat } from "@/game/systems/demoRoute";
import type { InputState } from "@/game/systems/input";

/**
 * 자동 조종이 누를 수 있는 것.
 *
 * `InputState`의 칸 이름을 그대로 쓰지 않는다. 저쪽은 「무엇이 눌렸는가」이고
 * 여기는 「대본이 무엇을 시키는가」다 — 예를 들어 무기 바꾸기는 저쪽에서
 * 칸 번호(`weaponSlotQueued`)인데 대본에서는 「활을 든다」다.
 */
export type ReelAct =
  /** 곁에 있는 것을 타거나, 타고 있으면 내린다 */
  | "vehicle"
  /** 무기를 쏜다 */
  | "attack"
  | "jump"
  | "dance"
  | "grapple"
  | "bow"
  | "beam";

/** 대본의 한 동작 — 언제 무엇을 */
export interface ReelBeatAct {
  /** 절대 시각(초). `DemoBeat.at`과 같은 시계다 */
  at: number;
  act: ReelAct;
}

/**
 * 대본이 시키는 동작들.
 *
 * `DemoBeat.keys`는 사람이 읽는 글이다(「B (내리기) → B (타기)」). 그대로
 * 파싱하지 않는다 — 글을 다듬으면 조종이 망가지는 관계가 생긴다. 대신 둘이
 * **어긋나지 않는지를 검사가 본다**(`tests/autopilot.test.ts`): 키가 적힌
 * 구간에는 동작이 있어야 하고, 동작이 있는 구간에는 키가 적혀 있어야 한다.
 *
 * 공격이 여러 번인 이유: 한 번 쏘면 화살 하나다. 「활로 한 발에 하나씩
 * 눕힌다」는 장면이 되려면 그 구간 내내 쏘아야 한다.
 */
export const DEMO_ACTS: readonly ReelBeatAct[] = [
  { at: 8.0, act: "vehicle" },
  { at: 20.5, act: "dance" },
  { at: 30.5, act: "grapple" },
  { at: 38.5, act: "vehicle" },
  { at: 40.0, act: "vehicle" },
  { at: 56.5, act: "vehicle" },
  { at: 57.0, act: "bow" },
  ...attackBurst(58, 61.5, 1.1),
  { at: 62.5, act: "beam" },
  ...attackBurst(63, 66, 1.1),
  { at: 66.5, act: "bow" },
  ...attackBurst(67, 71, 1.1),
  ...attackBurst(72.5, 87, 1.1),
];

/** 한 구간 내내 일정한 박자로 쏜다 */
function attackBurst(from: number, to: number, every: number): ReelBeatAct[] {
  const out: ReelBeatAct[] = [];
  for (let at = from; at <= to; at += every) out.push({ at, act: "attack" });
  return out;
}

/**
 * 활강 구간 — 이 동안 점프를 **잡고 있는다.**
 *
 * 다른 동작과 달리 한 번 누르는 것이 아니다. 활강은 떨어지는 동안 키를
 * 유지해야 켜지고(`locomotion`의 `input.jumpHeld`), 놓으면 그대로 떨어진다.
 */
export const GLIDE_WINDOW = { from: 31, to: 37.5 } as const;

/** 자동 조종이 이번 프레임에 내리는 지시 */
export interface AutopilotFrame {
  /** 카메라 기준 좌우 (-1..1) */
  moveX: number;
  /** 카메라 기준 전후 (-1..1, +1이 전진) */
  moveZ: number;
  run: boolean;
  jumpHeld: boolean;
  /** 이번 프레임에 **한 번만** 누르는 것들 */
  presses: readonly ReelAct[];
}

/**
 * 이 자리보다 가까우면 밀지 않는다(m).
 *
 * 0으로 두면 목표 위에서 좌우로 떨린다 — 지나칠 때마다 반대로 밀기 때문이다.
 * 화면에서는 캐릭터가 제자리에서 덜덜 떤다.
 */
const ARRIVED = 2.5;

/**
 * 월드 방향을 **카메라 기준 입력으로 되푼다.**
 *
 * `locomotion`이 입력을 월드로 바꾸는 식은 이렇다:
 *
 *   worldX =  moveX·cos − moveZ·sin
 *   worldZ = −moveX·sin − moveZ·cos
 *
 * 그 2×2를 뒤집으면(행렬식이 −1이라 부호만 뒤집힌 자기 자신이다):
 *
 *   moveX =  cos·dx − sin·dz
 *   moveZ = −sin·dx − cos·dz
 *
 * 카메라를 억지로 돌리지 않는 것이 요점이다. 시점을 목표 쪽으로 돌려 W만
 * 누르는 방법도 있지만, 그러면 달릴 때 시점이 저절로 따라오는 되돌림
 * (`stepFollowYaw`)과 싸워서 화면이 계속 흔들린다. **사람이 조작하듯**
 * 스틱만 밀고 카메라는 제 일을 하게 둔다.
 */
export function steerToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
  cameraYaw: number,
): { moveX: number; moveZ: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= ARRIVED) return { moveX: 0, moveZ: 0 };

  const ux = dx / distance;
  const uz = dz / distance;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return { moveX: cos * ux - sin * uz, moveZ: -(sin * ux) - cos * uz };
}

/**
 * 지금 향할 자리 — **다음** 구간의 시작점.
 *
 * 현재 구간의 자리로 가면 이미 지나온 곳을 향하게 된다. 마지막 구간에는
 * 다음이 없으므로 제자리다(마무리 연출 자리라 이동이 없다).
 */
export function targetAt(beats: readonly DemoBeat[], seconds: number): { x: number; z: number } {
  const next = beats.find((beat) => beat.at > seconds);
  if (next) return { x: next.x, z: next.z };
  const last = beats[beats.length - 1];
  return { x: last.x, z: last.z };
}

/**
 * 이번 프레임에 처음 지나친 동작들.
 *
 * 앞 프레임의 시각을 받아 **그 사이에 놓인 것만** 돌려준다. 「지금 시각이
 * `at`보다 크다」로 판단하면 그 뒤로 매 프레임 다시 눌린다 — 한 번 타야 할
 * 자전거를 60번 타고 내린다.
 */
export function pressesBetween(
  acts: readonly ReelBeatAct[],
  fromSeconds: number,
  toSeconds: number,
): ReelAct[] {
  return acts.filter((one) => one.at > fromSeconds && one.at <= toSeconds).map((one) => one.act);
}

/**
 * 한 프레임의 지시를 만든다.
 *
 * 늘 달린다(`run: true`). 코스는 최고 속도의 80%로 잡혀 있어
 * (`DEMO_PACE`) 걸어서는 제시간에 못 간다.
 */
export function autopilotFrame(
  beats: readonly DemoBeat[],
  fromSeconds: number,
  toSeconds: number,
  at: { x: number; z: number },
  cameraYaw: number,
): AutopilotFrame {
  const steer = steerToward(at, targetAt(beats, toSeconds), cameraYaw);
  return {
    ...steer,
    run: true,
    jumpHeld: toSeconds >= GLIDE_WINDOW.from && toSeconds <= GLIDE_WINDOW.to,
    presses: pressesBetween(DEMO_ACTS, fromSeconds, toSeconds),
  };
}

/**
 * 지시를 입력에 **적는다.**
 *
 * 한 곳에 모아 두는 이유: 「대본이 시키는 것」과 「`InputState`의 칸 이름」을
 * 잇는 자리가 여기 하나뿐이어야 한다. 컴포넌트 안에 흩어 놓으면 칸 하나를
 * 안 채워도 아무도 모르고, 화면에서는 **그 동작만 조용히 빠진 영상**이 나온다.
 *
 * 한 번 누르는 것들은 `*Queued`에 넣는다 — 그 칸은 읽는 쪽이 한 번 쓰고
 * 스스로 되돌린다.
 */
export function recordReelFrame(input: InputState, frame: AutopilotFrame): void {
  input.moveX = frame.moveX;
  input.moveZ = frame.moveZ;
  input.run = frame.run;
  input.jumpHeld = frame.jumpHeld;

  for (const press of frame.presses) {
    if (press === "vehicle") input.vehicleQueued = true;
    else if (press === "attack") input.attackQueued = true;
    else if (press === "jump") input.jumpQueued = true;
    else if (press === "dance") input.danceQueued = true;
    else if (press === "grapple") input.grappleQueued = true;
    // 무기는 칸 번호로 고른다. 「다음 무기」로 돌리면 순서가 바뀔 때 대본이 어긋난다
    else if (press === "bow") input.weaponSlotQueued = 1;
    else if (press === "beam") input.weaponSlotQueued = 2;
  }
}
