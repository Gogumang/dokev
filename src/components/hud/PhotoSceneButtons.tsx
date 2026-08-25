/**
 * 포토 모드 아래쪽 버튼 줄.
 *
 * 앞쪽은 **무엇을 남길지 고르는** 것(시간대·포즈·색보정), 뒤쪽은 **지금
 * 남기는** 것(거리·촬영·클립·나가기)이라 파일을 나눴다. 한 줄로 보이는 것은
 * 좁은 화면에서 접혀야 하기 때문이고, 그 접힘은 이 컨테이너가 정한다.
 */

import { HudButton } from "@/components/hud/HudButton";
import { PhotoCaptureButtons } from "@/components/hud/PhotoCaptureButtons";
import type { InputState } from "@/game/systems/input";

export function PhotoSceneButtons({
  timeOfDayName,
  onCycleTimeOfDay,
  photoPoseName,
  onCyclePhotoPose,
  photoFilterName,
  onCyclePhotoFilter,
  input,
  recording,
  onTakePhoto,
  onToggleClip,
  onExit,
}: {
  timeOfDayName: string;
  onCycleTimeOfDay: () => void;
  photoPoseName: string;
  onCyclePhotoPose: () => void;
  photoFilterName: string;
  onCyclePhotoFilter: () => void;
  input: InputState;
  recording: boolean;
  onTakePhoto: () => void;
  onToggleClip: () => void;
  onExit: () => void;
}) {
  return (
    <div
      className="absolute left-1/2 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-[var(--space-2)]"
      style={{ bottom: "var(--safe-bottom)" }}
    >
      <HudButton onClick={onCycleTimeOfDay} label={`시간대 바꾸기 (지금 ${timeOfDayName})`}>
        {timeOfDayName}
      </HudButton>
      <HudButton onClick={onCyclePhotoPose} label={`포즈 바꾸기 (지금 ${photoPoseName})`}>
        {photoPoseName}
      </HudButton>
      <HudButton onClick={onCyclePhotoFilter} label={`색보정 바꾸기 (지금 ${photoFilterName})`}>
        {photoFilterName}
      </HudButton>
      <PhotoCaptureButtons
        input={input}
        recording={recording}
        onTakePhoto={onTakePhoto}
        onToggleClip={onToggleClip}
        onExit={onExit}
      />
    </div>
  );
}
