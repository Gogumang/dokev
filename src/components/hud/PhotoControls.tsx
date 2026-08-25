"use client";

/*
 * 포토 모드 조작 줄.
 *
 * `WorldHud.tsx`가 800줄 상한에 닿아 분리했다. 포토 모드는 다른 HUD가 전부
 * 숨은 상태에서만 나타나므로 나머지와 겹칠 일이 없다 — 함께 둘 이유도 없다.
 */

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * 거리 조절 버튼이 클릭 콜백에서 공유 InputState를 갱신한다. 렌더 중이 아니라
 * 이벤트에서 일어나는 변경이고, setState로 바꾸면 누를 때마다 리렌더가 된다.
 * `TouchControls.tsx`가 같은 이유로 같은 예외를 쓴다.
 */
/* eslint-disable react-hooks/immutability */

import { CaptureNotice } from "@/components/hud/CaptureNotice";
import type { InputState } from "@/game/systems/input";
import { PhotoGuides } from "@/components/hud/PhotoGuides";
import { PhotoSceneButtons } from "@/components/hud/PhotoSceneButtons";

/**
 * 포토 모드 컨트롤.
 *
 * 화면에 남기는 것은 최소한이다 — 사진을 찍는 화면에서 UI가 크게 남아 있으면
 * 구도를 볼 수 없다. 조작 안내도 한 줄로 줄인다.
 */
export function PhotoControls({
  recording,
  captureNotice,
  timeOfDayName,
  onCycleTimeOfDay,
  photoFilterName,
  onCyclePhotoFilter,
  photoPoseName,
  onCyclePhotoPose,
  onTakePhoto,
  input,
  onToggleClip,
  onExit,
}: {
  recording: boolean;
  captureNotice: string | null;
  timeOfDayName: string;
  onCycleTimeOfDay: () => void;
  photoFilterName: string;
  onCyclePhotoFilter: () => void;
  photoPoseName: string;
  onCyclePhotoPose: () => void;
  onTakePhoto: () => void;
  /** 거리 조절을 위해 직접 쓴다 — 터치에도 확대 수단이 있어야 한다 */
  input: InputState;
  onToggleClip: () => void;
  onExit: () => void;
}) {
  return (
    <>
      {/* 구도 보조선 — 삼분할. 얇게 그려 사진에는 남지 않는 인상만 준다 */}
      <PhotoGuides />

      {/*
        포토 모드 조작 줄.

        중앙 정렬이라 넘치면 **양쪽으로** 밀려난다 — 맨 왼쪽과 맨 오른쪽 버튼이
        동시에 화면 밖으로 나간다. 버튼 여섯 개면 440px에 가깝고 폰 가로 폭을
        넘기므로 줄바꿈이 필요하다.
      */}
      <PhotoSceneButtons
        timeOfDayName={timeOfDayName}
        onCycleTimeOfDay={onCycleTimeOfDay}
        photoPoseName={photoPoseName}
        onCyclePhotoPose={onCyclePhotoPose}
        photoFilterName={photoFilterName}
        onCyclePhotoFilter={onCyclePhotoFilter}
        input={input}
        recording={recording}
        onTakePhoto={onTakePhoto}
        onToggleClip={onToggleClip}
        onExit={onExit}
      />

      <p
        className="hud-scrim pointer-events-none absolute left-1/2 m-0 -translate-x-1/2 rounded-[var(--radius-md)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
        style={{ top: "var(--safe-top)" }}
      >
        드래그·WASD로 각도, 휠·Z·X로 거리, P로 나가기
      </p>

      {/* 포토 모드에는 다른 알림이 없다 — 혼자 자리를 잡는다 */}
      {captureNotice && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2"
          style={{ bottom: "calc(var(--safe-bottom) + 96px)" }}
        >
          <CaptureNotice message={captureNotice} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
