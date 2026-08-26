"use client";

/**
 * 입력 수집.
 *
 * 매 프레임 React 상태를 갱신하면 60fps에서 초당 60번 리렌더가 발생한다.
 * 그래서 입력은 리렌더를 유발하지 않는 가변 객체 하나에 모으고, 렌더 루프가
 * 그 객체를 직접 읽는다. 키보드·마우스·터치가 모두 같은 객체에 기록한다.
 *
 * 키 매핑은 DESIGN_GUIDE 6절 입력 표를 따른다. 표에 없는 `보드`는 이 스파이크에서
 * 추가한 항목이며, 방향 확정 시 표에 반영해야 한다.
 */

import { useEffect } from "react";
import type { VehicleKind } from "@/game/config/tuning";
import { CONTROL_CODES } from "@/game/systems/controls";
import { nextWeapon, weaponAtSlot, type WeaponId } from "@/game/combat/weapons";
import { MAX_DELTA_SECONDS } from "@/game/config/tuning";
import { isSummoned, stepLinger, wantsSummon } from "@/game/dokebi/summonWindow";

export interface InputState {
  /** 카메라 기준 좌우 (-1..1) */
  moveX: number;
  /** 카메라 기준 전후 (-1..1, +1이 전진) */
  moveZ: number;
  run: boolean;
  /**
   * 타고 있는 것. 두 발로 다니면 null.
   *
   * **입력이 스스로 정하지 않는다.** 무엇을 탈지는 곁에 무엇이 세워져 있느냐로
   * 갈리는데, 그건 세상을 아는 쪽(`PlayerRig`)만 안다. 여기는 눌렸다는 사실만
   * 넘기고 결정은 그쪽이 한다 — `talkQueued`와 같은 방식이다.
   */
  vehicle: VehicleKind | null;
  /** 이번 프레임에 타기/내리기가 요청됐는지. 처리한 쪽이 되돌린다 */
  vehicleQueued: boolean;
  /**
   * 눌림 이벤트를 큐에 담는다. 누른 상태를 그대로 넘기면 스페이스를 누르고 있을 때
   * 점프 버퍼가 계속 채워져 의도치 않은 연속 점프가 된다.
   */
  jumpQueued: boolean;
  /** 공격 입력. 점프와 같은 이유로 눌림 이벤트만 큐에 담는다 */
  attackQueued: boolean;
  /** 무기 바꾸기 요청. 눌림 이벤트만 담는다 */
  weaponQueued: boolean;
  /**
   * 숫자키로 **직접 고른** 무기의 자리 번호(1부터). 고르지 않았으면 0.
   *
   * 순환(Q)과 따로 두는 이유: 여섯 자루를 한 키로 돌리면 원하는 것까지
   * 최대 다섯 번을 눌러야 하고, 그 사이 화면에서 눈을 떼게 된다. 전투
   * 중에는 그 다섯 번이 곧 맞는 횟수다.
   */
  weaponSlotQueued: number;
  /** 점프 키를 누르고 있는지. 활강은 눌림이 아니라 유지로 판정한다 */
  jumpHeld: boolean;
  /** 도깨비 동료를 불러 둔 상태인지 (토글) */
  companionSummoned: boolean;
  /** 동료 능력 요청. 눌림 이벤트만 담는다 */
  companionAbilityQueued: boolean;
  /** 그래플 요청. 눌림 이벤트만 담는다 */
  grappleQueued: boolean;
  /** 이번 프레임에 음료 뽑기가 요청됐는지. 읽는 쪽이 소비한다 */
  drinkQueued: boolean;
  /** 이번 프레임에 춤이 요청됐는지 */
  danceQueued: boolean;
  /** 이번 프레임에 말 걸기가 눌렸는지. 군중이 소비하고 되돌린다 */
  talkQueued: boolean;
  /** 소리 켜기·끄기 요청. HUD가 소비한다 */
  soundToggleQueued: boolean;
  /** 이번 프레임에 누적된 시점 이동량. 읽는 쪽이 소비한다 */
  lookDeltaX: number;
  lookDeltaY: number;
  /** 휠 줌 누적량. 포토 모드에서 거리 조절에 쓴다. 읽는 쪽이 소비한다 */
  zoomDelta: number;
}

/** 휠 한 칸이 만드는 deltaY. 키보드·버튼 확대·축소를 같은 양으로 맞춘다 */
export const WHEEL_NOTCH = 100;

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveZ: 0,
    run: false,
    vehicle: null,
    vehicleQueued: false,
    jumpQueued: false,
    attackQueued: false,
    weaponQueued: false,
    weaponSlotQueued: 0,
    jumpHeld: false,
    // 처음부터 동료가 옆에 있어야 존재를 알 수 있다.
    companionSummoned: true,
    companionAbilityQueued: false,
    grappleQueued: false,
    drinkQueued: false,
    danceQueued: false,
    talkQueued: false,
    soundToggleQueued: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
    zoomDelta: 0,
  };
}

/** 시점 이동량을 읽고 즉시 0으로 되돌린다. 소비하지 않으면 관성처럼 계속 돈다. */
export function consumeLookDelta(input: InputState): { x: number; y: number } {
  const x = input.lookDeltaX;
  const y = input.lookDeltaY;
  input.lookDeltaX = 0;
  input.lookDeltaY = 0;
  return { x, y };
}

/** 줌 누적량을 읽고 0으로 되돌린다. */
export function consumeZoom(input: InputState): number {
  const value = input.zoomDelta;
  input.zoomDelta = 0;
  return value;
}

/** 큐에 담긴 그래플 요청을 소비한다. */
export function consumeGrapple(input: InputState): boolean {
  if (!input.grappleQueued) return false;
  input.grappleQueued = false;
  return true;
}

/** 큐에 담긴 점프를 소비한다. */
export function consumeJump(input: InputState): boolean {
  if (!input.jumpQueued) return false;
  input.jumpQueued = false;
  return true;
}

const MOVE_KEYS: Record<string, { axis: "x" | "z"; value: number }> = {
  KeyW: { axis: "z", value: 1 },
  ArrowUp: { axis: "z", value: 1 },
  KeyS: { axis: "z", value: -1 },
  ArrowDown: { axis: "z", value: -1 },
  KeyA: { axis: "x", value: -1 },
  ArrowLeft: { axis: "x", value: -1 },
  KeyD: { axis: "x", value: 1 },
  ArrowRight: { axis: "x", value: 1 },
};

/** 초점이 「누를 것」 안에 있는가 */
const CONTROL_SELECTOR = "button, a[href], [role='button'], summary";

/**
 * 그 대상이 누를 것 안에 있는지.
 *
 * `target?.closest(...)`로 썼다가 **`closest is not a function`으로 터졌다.**
 * `?.`는 null만 막는다 — `window`에 직접 보낸 키 이벤트의 target은 `Window`고,
 * 거기엔 `closest`가 없다. 전역 키 처리기에서 예외가 나면 그 키 입력이 통째로
 * 사라지고 콘솔만 더러워진다.
 *
 * `instanceof Element`를 쓰지 않는 이유: 이 판단을 DOM 없이도 검사할 수 있어야
 * 한다. **있는지 물어보고 쓴다**가 여기서는 더 정확하기도 하다 — 실제로 필요한
 * 것은 「Element인가」가 아니라 「`closest`를 부를 수 있는가」다.
 */
function isInsideControl(target: unknown): boolean {
  const closest = (target as { closest?: unknown } | null)?.closest;
  if (typeof closest !== "function") return false;
  return Boolean((closest as (selector: string) => unknown).call(target, CONTROL_SELECTOR));
}

/**
 * 브라우저가 「누르기」로 치는 키.
 *
 * 게임 바인딩이 아니므로 `CONTROL_CODES`에 넣지 않는다 — 조작표에 뜨면
 * 안 되고, 사용자가 바꿀 수 있는 것도 아니다. 초점이 버튼에 가 있을 때
 * 이 키들만 브라우저에 양보한다 (WAI-ARIA: 버튼은 Enter와 Space 둘 다).
 */
const ACTIVATION_CODES: readonly string[] = ["Space", "Enter"];

/**
 * 키보드 바인딩.
 *
 * 눌린 키 집합을 유지한 뒤 축을 다시 계산한다. keydown/keyup에서 축을 더하고
 * 빼기만 하면 창 포커스를 잃었다 돌아왔을 때 키가 눌린 채로 남는다.
 */
export function useKeyboardBindings(
  input: InputState,
  onTogglePerf?: () => void,
  onTogglePhoto?: () => void,
): void {
  useEffect(() => {
    const pressed = new Set<string>();

    const recompute = () => {
      let x = 0;
      let z = 0;
      for (const code of pressed) {
        const mapping = MOVE_KEYS[code];
        if (!mapping) continue;
        if (mapping.axis === "x") x += mapping.value;
        else z += mapping.value;
      }
      input.moveX = Math.max(-1, Math.min(1, x));
      input.moveZ = Math.max(-1, Math.min(1, z));
      input.run = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // 폼 입력 중에는 월드 조작을 가로채지 않는다.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }

      /*
       * 초점이 누를 것에 가 있으면 활성화 키를 가져가지 않는다.
       *
       * `Space`에 `preventDefault`를 걸고 있었는데, 브라우저는 그러면 **초점
       * 잡힌 버튼을 누르지 않는다.** 키보드로 도감을 열고 Tab으로 「닫기」에
       * 가서 Space를 눌러도 닫히지 않았다(대신 캐릭터가 뛰었다). 같은 자리에서
       * Enter는 닫혔다 — 그렇게 확인했다. 버튼은 Enter와 Space **둘 다**로
       * 눌려야 한다.
       *
       * 이동 키는 그대로 받는다. HUD 버튼을 한 번 누른 뒤에도 걸어 다닐 수
       * 있어야 하는데, 여기서 전부 막으면 캔버스를 다시 클릭해야 한다.
       */
      const activating = ACTIVATION_CODES.includes(event.code);
      if (activating && isInsideControl(target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) input.jumpQueued = true;
        input.jumpHeld = true;
        return;
      }
      // 공격 — WASD를 잡은 왼손에서 닿는 자리에 둔다.
      if (event.code === CONTROL_CODES.attack && !event.repeat) {
        input.attackQueued = true;
        return;
      }
      // 무기 바꾸기 — 공격(J)과 달리 왼손 자리에 둔다. 달리면서 바꿀 수 있어야 한다.
      if (event.code === CONTROL_CODES.weapon && !event.repeat) {
        input.weaponQueued = true;
        return;
      }
      /*
       * 숫자키로 곧장 고르기.
       *
       * `Digit1`~`Digit6`만 본다 — `Numpad…`까지 받으면 자리 번호가 두 경로로
       * 들어와 어느 쪽이 이겼는지 알 수 없다. 범위 밖은 무시한다(무기가
       * 늘거나 줄어도 여기를 고칠 일이 없게, 상한은 목록이 정한다).
       */
      const slot = /^Digit([1-9])$/.exec(event.code);
      if (slot && !event.repeat) {
        input.weaponSlotQueued = Number(slot[1]);
        return;
      }
      // 동료 소환·해제와 능력 — 이동 키에서 손을 떼지 않고 닿는 자리에 둔다.
      if (event.code === CONTROL_CODES.grapple && !event.repeat) {
        input.grappleQueued = true;
        return;
      }

      if (event.code === CONTROL_CODES.drink && !event.repeat) {
        input.drinkQueued = true;
        return;
      }

      if (event.code === CONTROL_CODES.dance && !event.repeat) {
        input.danceQueued = true;
        return;
      }

      if (event.code === CONTROL_CODES.talk && !event.repeat) {
        input.talkQueued = true;
        return;
      }

      /*
       * 확대·축소.
       *
       * 포토 모드의 거리 조절이 휠뿐이었다 — 키보드만 쓰는 사람은 각도는
       * 바꿔도 거리는 손댈 수 없었다. 휠 한 칸과 같은 양을 넣는다.
       *
       * 월드에서는 이 값을 쓰지 않으므로(카메라 거리는 속도가 정한다) 눌러도
       * 아무 일이 없다 — 포토 모드에서만 의미가 생긴다.
       */
      if (event.code === CONTROL_CODES.zoomIn) {
        input.zoomDelta -= WHEEL_NOTCH;
        return;
      }
      if (event.code === CONTROL_CODES.zoomOut) {
        input.zoomDelta += WHEEL_NOTCH;
        return;
      }

      if (event.code === CONTROL_CODES.sound && !event.repeat) {
        input.soundToggleQueued = true;
        return;
      }
      if (event.code === CONTROL_CODES.companion && !event.repeat) {
        input.companionSummoned = !input.companionSummoned;
        return;
      }
      if (event.code === CONTROL_CODES.ability && !event.repeat) {
        input.companionAbilityQueued = true;
        return;
      }
      if (event.code === CONTROL_CODES.board && !event.repeat) {
        // 무엇을 탈지는 곁에 무엇이 있느냐로 갈린다 — 세상을 아는 쪽이 정한다
        input.vehicleQueued = true;
        return;
      }
      // 포토 모드 — DESIGN_GUIDE 「입력 방식」의 입력 표를 따른다.
      if (event.code === CONTROL_CODES.photo && !event.repeat) {
        onTogglePhoto?.();
        return;
      }
      if (event.code === CONTROL_CODES.perf && !event.repeat) {
        event.preventDefault();
        onTogglePerf?.();
        return;
      }

      if (MOVE_KEYS[event.code] || event.code.startsWith("Shift")) {
        if (event.code.startsWith("Arrow")) event.preventDefault();
        pressed.add(event.code);
        recompute();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") input.jumpHeld = false;
      pressed.delete(event.code);
      recompute();
    };

    // 탭을 벗어나면 눌린 키를 모두 놓은 것으로 본다.
    const onBlur = () => {
      input.jumpHeld = false;
      pressed.clear();
      recompute();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [input, onTogglePerf, onTogglePhoto]);
}

/**
 * 마우스 드래그 시점 조작.
 *
 * 포인터 락 대신 드래그를 쓴다. DESIGN_GUIDE 「입력 방식」이 드래그를 명시하고 있고,
 * 포인터 락은 Esc를 브라우저가 가로채 메뉴 접근성을 해친다.
 */
export function usePointerLook(
  input: InputState,
  targetRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const element = targetRef.current;
    if (!element) return;

    let activePointer: number | null = null;
    /*
     * 직전 포인터 좌표.
     *
     * `movementX`를 쓰지 않는다. 포인터 잠금 없이 쓰는 값이라 환경에 따라
     * 0으로만 오는 경우가 있고, 그러면 **시점이 아예 돌지 않는데 원인을 알
     * 방법이 없다.** 터치 조작은 이미 좌표 차이로 계산하고 있었다 — 같은
     * 목적에 두 가지 방식을 두면 한쪽이 조용히 망가진다.
     *
     * **포인터 잠금을 도입하면 이 방식은 못 쓴다.** 잠긴 동안에는 clientX가
     * 멈추고 movementX만 움직인다. 잠금을 넣는 날 이 계산도 함께 바꿔야 한다.
     */
    let lastLook = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return; // 터치는 TouchControls가 담당한다
      activePointer = event.pointerId;
      lastLook = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      input.lookDeltaX += event.clientX - lastLook.x;
      input.lookDeltaY += event.clientY - lastLook.y;
      lastLook = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      // 페이지가 스크롤되면 포토 모드에서 화면이 흔들린다.
      event.preventDefault();
      input.zoomDelta += event.deltaY;
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
    };
  }, [input, targetRef]);
}

/** 입력이 건너가는 자리 — 전투와 동료가 여기서 읽는다 */
export interface CommandLink {
  attackQueued: boolean;
  /**
   * 동료가 지금 화면에 있어야 하는가.
   *
   * **손이 아니라 전투가 정한다.** 전에는 `C` 키가 그대로 이 값을 켰고 초기값이
   * `true`라 동료가 도시를 내내 따라다녔다. 원작 공개분의 탐험 컷에는 동료가
   * 없다(`docs/frame-notes/`).
   */
  summoned: boolean;
  /**
   * 전투가 끝난 뒤 남은 여운(초). 프레임 루프가 들고 있는다.
   *
   * 이 값이 없으면 마지막 로봇이 쓰러지는 **그 순간** 동료가 사라져 이긴 장면이
   * 결함으로 보인다.
   */
  summonLinger: number;
  abilityRequests: number;
  /**
   * 지금 들고 있는 무기. **입력이 이 값을 돌린다.**
   *
   * 입력에 무기를 들고 있지 않는 이유: 무기는 조작이 아니라 전투 상태다.
   * 입력 쪽에 두면 포토 모드나 부활처럼 상태를 되돌리는 자리에서 무엇이
   * 정본인지 헷갈린다 — 탈것(`vehicle`)을 세상 쪽이 정하는 것과 같은 이유다.
   */
  weapon: WeaponId;
}

/**
 * 이번 프레임의 입력을 전투·동료 쪽으로 넘긴다.
 *
 * 누르는 곳(키보드·터치)과 쓰는 곳(적·동료)이 멀어서 공유 객체를 한 번 거친다.
 * 그 옮기는 세 줄이 화면 안(프레임 루프)에 있을 때는 **지워도 아무도 몰랐다.**
 *
 *   - `attackQueued` — 안 넘기면 **J를 눌러도 아무 일이 없다.**
 *   - `weapon` — 안 돌리면 **Q를 눌러도 무기가 그대로다.**
 *   - `summoned` — 안 넘기면 **전투가 붙어도 동료가 안 나온다.**
 *   - `abilityRequests` — 안 넘기면 **능력이 영영 안 나간다.** 버튼은 켜져 있다.
 *
 * **큐는 옮기면서 비운다.** 안 비우면 한 번 누른 것이 매 프레임 다시 나간다 —
 * 가만히 서서 계속 휘두르고, 능력 요청이 초당 60번 쌓인다.
 *
 * `attackQueued`는 **켜기만 한다.** 끄는 일은 쓰는 쪽(`consumeAttack`)이 하고,
 * 여기서 매 프레임 꺼 버리면 그 사이에 못 읽은 입력이 사라진다.
 */
export function projectCommands(
  link: CommandLink,
  input: InputState,
  /** 지금 얼마나 전투 한복판인가 0~1 (`combat/combatLink.combatPressure`) */
  combatPressure01: number,
  dt: number,
): void {
  if (input.attackQueued) {
    input.attackQueued = false;
    link.attackQueued = true;
  }

  /*
   * 무기 바꾸기. 큐를 여기서 비운다 — 안 비우면 누르고 있는 동안 매 프레임
   * 돌아, 손을 떼는 순간 무엇이 잡힐지 알 수 없다.
   */
  if (input.weaponQueued) {
    input.weaponQueued = false;
    link.weapon = nextWeapon(link.weapon);
  }

  /*
   * 숫자키 쪽을 **뒤에** 둔다. 같은 프레임에 둘 다 들어오면 직접 고른 쪽이
   * 이겨야 한다 — 「3번을 눌렀는데 4번이 잡히는」 일이 없어야 손이 믿는다.
   */
  if (input.weaponSlotQueued !== 0) {
    const chosen = weaponAtSlot(input.weaponSlotQueued);
    input.weaponSlotQueued = 0;
    if (chosen !== null) link.weapon = chosen;
  }

  /*
   * **동료는 전투가 부른다.** 압력이 문턱을 넘으면 나오고, 더 낮은 문턱 아래로
   * 떨어져야 사라진다(히스테리시스) — 하나로 두면 적이 사거리 경계를 들락날락할
   * 때마다 깜빡인다. 규칙은 `dokebi/summonWindow`에 있다.
   *
   * `input.companionSummoned`는 더 이상 읽지 않는다. 손으로 부르고 보내는 것이
   * 아니라, 싸움이 붙으면 오고 끝나면 간다.
   */
  const wanted = wantsSummon(combatPressure01, link.summoned);
  /*
   * dt에 상한을 씌운다. 탭을 두고 돌아오면 첫 프레임의 delta가 몇 초라, 그대로
   * 빼면 **여운이 한 번에 증발해** 돌아온 순간 동료가 사라진다. 상한의 정본은
   * `config/tuning`에 하나뿐이다.
   */
  link.summonLinger = stepLinger(link.summonLinger, wanted, Math.min(dt, MAX_DELTA_SECONDS));
  link.summoned = isSummoned(wanted, link.summonLinger);

  if (input.companionAbilityQueued) {
    input.companionAbilityQueued = false;
    link.abilityRequests += 1;
  }
}
