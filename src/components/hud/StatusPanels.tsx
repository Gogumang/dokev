"use client";

/**
 * 상태 패널 — 현재 목표, 체력, 완주 결과.
 *
 * `WorldHud`가 844줄로 파일 크기 규칙(800줄)을 세 번째로 어겼다. 알림 계열은
 * 이미 `Notices.tsx`로 나갔으므로 이번에는 **상태를 보여 주는 패널**을 묶는다.
 *
 * 셋의 공통점: 공유 가변 객체를 자기 주기로 읽어 스냅샷을 만든다. 매 프레임
 * setState를 하지 않기 위한 이 프로젝트 공통 패턴이다.
 */

import { useEffect, useRef, useState } from "react";

import { HudButton } from "@/components/hud/HudButton";
import { PLAYER_COMBAT } from "@/game/combat/playerCombat";
import { DOKEBI, FINDABLE_DOKEBI, type DokebiId } from "@/game/dokebi/roster";
import type { QuestView } from "@/game/quest/questRunner";

/**
 * 현재 목표 패널.
 *
 * questView는 렌더 루프가 매 프레임 갱신하는 가변 객체다. 그대로 읽으면
 * 화면이 갱신되지 않으므로 낮은 주기로 스냅샷을 떠서 리렌더한다 —
 * 목표 문구는 초당 60번 바뀌지 않는다.
 */
export function QuestPanel({ questView }: { questView: QuestView }) {
  const [snapshot, setSnapshot] = useState<QuestView>({ ...questView });

  useEffect(() => {
    const id = window.setInterval(() => setSnapshot({ ...questView }), 200);
    return () => window.clearInterval(id);
  }, [questView]);

  /*
   * 다 마쳤으면 비운다.
   *
   * 완주 화면이 같은 문장을 가운데에 크게 띄우는데 여기서도 같은 문장을
   * 보여 주고 있었다 — 한 화면에 같은 말이 두 번 있었다. 완료를 알리는
   * 책임은 결과 화면에 있다.
   */
  if (snapshot.completed) return null;

  return (
    <div
      className="hud-scrim pointer-events-none absolute rounded-[var(--radius-md)] px-4 py-3"
      style={{ top: "var(--safe-top)", left: "var(--safe-left)", maxWidth: "min(46ch, 70vw)" }}
      role="status"
      aria-live="polite"
    >
      <p className="m-0 text-xs tracking-wide text-[var(--color-text-secondary)]">
        {snapshot.completed ? "완료" : "현재 목표"}
      </p>
      <p className="m-0 mt-1 text-base font-semibold">{snapshot.title}</p>
      {snapshot.hint && (
        <p className="m-0 mt-1 text-sm text-[var(--color-text-secondary)]">{snapshot.hint}</p>
      )}
      {snapshot.counter && (
        <p className="tabular m-0 mt-1 text-sm font-semibold">{snapshot.counter}</p>
      )}
      {/* 진행 막대 — 색만으로 상태를 구분하지 않도록 위 문구와 함께 쓴다 */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-[var(--radius-round)] bg-white/15">
        <div
          className="h-full rounded-[var(--radius-round)] bg-[var(--color-action-primary)] transition-[width]"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, snapshot.ratio)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * 체력 표시.
 *
 * 칸으로 그린다 — 막대 하나는 "얼마나 남았나"를 대략만 알려주지만, 칸은
 * "몇 대 더 맞을 수 있나"를 셀 수 있다. 색만으로 구분하지 않도록 숫자도 남긴다
 * (DESIGN_GUIDE 「5.3 색상」).
 */
export function HealthPanel({ combat }: { combat: { playerHp: number; playerDowned: boolean } }) {
  const [snapshot, setSnapshot] = useState({ hp: combat.playerHp, downed: combat.playerDowned });

  useEffect(() => {
    const id = window.setInterval(
      () => setSnapshot({ hp: combat.playerHp, downed: combat.playerDowned }),
      120,
    );
    return () => window.clearInterval(id);
  }, [combat]);

  const total = PLAYER_COMBAT.maxHp;
  const filled = Math.ceil(Math.max(0, snapshot.hp));

  return (
    <div
      className="hud-scrim pointer-events-none flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-3 py-2"
      role="status"
      aria-live="off"
      aria-label={`체력 ${filled} / ${total}`}
    >
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className="h-3 w-3 rounded-[2px]"
            style={{
              background:
                index < filled ? "var(--color-status-danger)" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>
      <span className="tabular text-xs text-[var(--color-text-secondary)]">
        {filled}/{total}
      </span>
      {snapshot.downed && (
        <span className="text-xs font-semibold text-[var(--color-status-warning)]">
          쓰러짐 — 곧 일어납니다
        </span>
      )}
    </div>
  );
}

/**
 * 완주 결과.
 *
 * 목표를 다 마쳤는데 HUD 문구만 바뀌면 "끝났다"는 느낌이 없다. 무엇을 했는지
 * 숫자로 보여주고, 다음에 할 수 있는 것을 함께 준다 (계속 / 사진 / 다시).
 *
 * 화면을 막지 않는다 — 완주 뒤에도 계속 돌아다닐 수 있어야 하므로 모달이 아니라
 * 한쪽에 놓인 패널이고, `pointer-events`는 버튼에만 준다.
 */
export function ResultPanel({
  questView,
  summary,
  met,
  nickname,
  onPhoto,
  onRestart,
}: {
  questView: QuestView;
  summary: { elapsedSeconds: number; maxSpeed: number; defeated: number };
  /** 지금까지 만난 도깨비 */
  met: readonly DokebiId[];
  /** 플레이어가 정한 이름. 비어 있으면 이름 없이 보여 준다 */
  nickname: string;
  onPhoto: () => void;
  onRestart: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState({ elapsedSeconds: 0, maxSpeed: 0, defeated: 0 });
  const [dismissed, setDismissed] = useState(false);

  /*
   * 완주한 순간의 값만 담는다.
   *
   * 완주한 뒤에도 계속 다시 담고 있었다 — 「걸린 시간」이 화면을 보는 동안
   * 계속 올라가서 **기록이 아니라 시계**가 됐다. 최고 속도·처치 수도 그 뒤에
   * 놀면서 바뀐 값이 섞였다.
   *
   * 낭독기에도 아팠다. 숫자가 계속 바뀌는 `aria-live` 영역은 끝없이 읽힌다
   * (반복 160의 보스 체력 막대와 같다).
   */
  const captured = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisible(questView.completed);

      /*
       * 새 완주가 시작되면 처음으로 되돌린다.
       *
       * 「계속 탐험」을 누르면 `dismissed`가 켜진 채 **다시 꺼지지 않았다** —
       * 첫 여정을 그렇게 닫은 사람에게는 보스를 눕힌 뒤의 완주 화면이 영영
       * 뜨지 않았다. 게임에서 가장 큰 순간의 보상이 통째로 사라진 셈이다.
       *
       * 기록도 함께 되돌린다. 안 그러면 두 번째 완주에 첫 번째 숫자가 뜬다.
       */
      if (!questView.completed) {
        captured.current = false;
        setDismissed(false);
        return;
      }

      if (!captured.current) {
        captured.current = true;
        setSnapshot({ ...summary });
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [questView, summary]);

  if (!visible || dismissed) return null;

  const minutes = Math.floor(snapshot.elapsedSeconds / 60);
  const seconds = Math.floor(snapshot.elapsedSeconds % 60);

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
        <p className="m-0 mt-1 text-lg font-bold">{questView.title}</p>
        <p className="m-0 mt-1 text-sm text-[var(--color-text-secondary)]">{questView.hint}</p>
      </div>

      {/*
        두 칸씩 두 줄로 놓는다. 넷을 한 줄에 넣으면 좁은 화면에서 숫자가 접힌다.

        도깨비 수를 넣은 이유: 완주 화면은 **다음에 무엇을 할지** 알려 주는
        마지막 자리다. 남은 하나가 있다는 것을 여기서 모르면 게임을 닫는다.
      */}
      <dl className="m-0 grid grid-cols-2 gap-[var(--space-2)] text-center">
        {[
          ["걸린 시간", `${minutes}:${String(seconds).padStart(2, "0")}`],
          ["최고 속도", `${snapshot.maxSpeed.toFixed(1)} m/s`],
          ["멈춘 로봇", `${snapshot.defeated}`],
          /*
           * 분모는 **찾아갈 수 있는 수**다. 전체 수로 세면 초롱이 만남
           * 목록에 영영 안 들어가서 다 모아도 3/4에 멈춘다 — 마지막 화면이
           * 아직 남았다고 거짓말을 한다.
           */
          [
            "만난 도깨비",
            `${met.filter((id) => DOKEBI[id]?.home).length} / ${FINDABLE_DOKEBI.length}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="m-0 text-xs text-[var(--color-text-secondary)]">{label}</dt>
            <dd className="tabular m-0 mt-1 text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap justify-center gap-[var(--space-2)]">
        <HudButton onClick={() => setDismissed(true)} label="계속 탐험하기">
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
