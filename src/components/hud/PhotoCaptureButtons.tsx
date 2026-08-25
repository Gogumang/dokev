/**
 * 포토 모드에서 **지금 남기는** 버튼들 — 거리·촬영·클립·나가기.
 *
 * 장면을 고르는 버튼과 나눈다. 저쪽은 「무엇을 남길지」이고 여기는 「남긴다」다.
 */

import { HudButton } from "@/components/hud/HudButton";
import { WHEEL_NOTCH } from "@/game/systems/input";
import type { InputState } from "@/game/systems/input";

export function PhotoCaptureButtons({
  input,
  recording,
  onTakePhoto,
  onToggleClip,
  onExit,
}: {
  input: InputState;
  recording: boolean;
  onTakePhoto: () => void;
  onToggleClip: () => void;
  onExit: () => void;
}) {
  return (
    <>
      {/*
      거리 조절.

      휠과 Z·X뿐이라 **터치 사용자는 거리를 바꿀 수 없었다** — 각도만
      되고 가까이 가서 찍는 구도를 만들 수 없다. 휠 한 칸과 같은 양을 넣는다.
    */}
      <HudButton onClick={() => (input.zoomDelta -= WHEEL_NOTCH)} label="가까이서 보기">
        가까이
      </HudButton>
      <HudButton onClick={() => (input.zoomDelta += WHEEL_NOTCH)} label="멀리서 보기">
        멀리
      </HudButton>
      <HudButton onClick={onTakePhoto} label="사진 저장">
        촬영
      </HudButton>
      <HudButton onClick={onToggleClip} pressed={recording} label="클립 녹화 시작 또는 저장">
        {recording ? "녹화 중지" : "클립"}
      </HudButton>
      <HudButton onClick={onExit} label="포토 모드 끄기">
        나가기
      </HudButton>
    </>
  );
}
