/**
 * 완주 결과 — 모양만.
 *
 * 목표를 다 마쳤는데 HUD 문구만 바뀌면 「끝났다」는 느낌이 없다. 무엇을 했는지
 * 숫자로 보여주고, 다음에 할 수 있는 것을 함께 준다 (계속 / 사진 / 다시).
 *
 * 화면을 막지 않는다 — 완주 뒤에도 계속 돌아다닐 수 있어야 하므로 모달이 아니라
 * 한쪽에 놓인 패널이고, `pointer-events`는 버튼에만 준다.
 *
 * **언제 뜨고 언제 굳는지는 여기서 정하지 않는다.** `hudViews`의 완주 걸쇠가
 * 정하고, 이 컴포넌트는 이미 굳은 기록을 받는다.
 */

import { HudButton } from "@/components/hud/HudButton";
import type { ResultRecord } from "@/game/systems/hudViews";

export interface ResultPanelProps {
  readonly record: ResultRecord;
  readonly title: string;
  readonly hint: string;
  /** 플레이어가 정한 이름. 비어 있으면 이름 없이 보여 준다 */
  readonly nickname: string;
  /** 찾아간 도깨비 수와 찾아갈 수 있는 전체 수 */
  readonly metCount: number;
  readonly findableCount: number;
  onContinue: () => void;
  onPhoto: () => void;
  onRestart: () => void;
}

export function ResultPanel({
  record,
  title,
  hint,
  nickname,
  metCount,
  findableCount,
  onContinue,
  onPhoto,
  onRestart,
}: ResultPanelProps) {
  const minutes = Math.floor(record.elapsedSeconds / 60);
  const seconds = Math.floor(record.elapsedSeconds % 60);

  return (
    <div
      className="hud-scrim absolute left-1/2 grid -translate-x-1/2 gap-[var(--space-3)] rounded-[var(--radius-lg)] px-[var(--space-6)] py-[var(--space-4)]"
      style={{ top: "20%", maxWidth: "min(38ch, 86vw)" }}
      role="status"
      aria-live="polite"
    >
      <div>
        {/*
          이름을 넣었다면 여기서 부른다. 기록이 「누구의」 기록인지가 있으면
          남기고 싶어진다 — 비워 둔 사람에게는 그냥 「완주」다.
        */}
        <p className="m-0 text-xs tracking-wide text-[var(--color-action-primary)]">
          {nickname ? `${nickname}의 완주` : "완주"}
        </p>
        <p className="m-0 mt-1 text-lg font-bold">{title}</p>
        <p className="m-0 mt-1 text-sm text-[var(--color-text-secondary)]">{hint}</p>
      </div>

      {/*
        두 칸씩 두 줄로 놓는다. 넷을 한 줄에 넣으면 좁은 화면에서 숫자가 접힌다.

        도깨비 수를 넣은 이유: 완주 화면은 **다음에 무엇을 할지** 알려 주는
        마지막 자리다. 남은 하나가 있다는 것을 여기서 모르면 게임을 닫는다.
      */}
      <dl className="m-0 grid grid-cols-2 gap-[var(--space-2)] text-center">
        {[
          ["걸린 시간", `${minutes}:${String(seconds).padStart(2, "0")}`],
          ["최고 속도", `${record.maxSpeed.toFixed(1)} m/s`],
          ["멈춘 로봇", `${record.defeated}`],
          ["만난 도깨비", `${metCount} / ${findableCount}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="m-0 text-xs text-[var(--color-text-secondary)]">{label}</dt>
            <dd className="tabular m-0 mt-1 text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap justify-center gap-[var(--space-2)]">
        <HudButton onClick={onContinue} label="계속 탐험하기">
          계속 탐험
        </HudButton>
        <HudButton onClick={onPhoto} label="포토 모드로 사진 남기기">
          사진 남기기
        </HudButton>
        <HudButton onClick={onRestart} label="진행을 지우고 처음부터 다시 하기">
          다시 하기
        </HudButton>
      </div>
    </div>
  );
}
