"use client";

/**
 * 월드 HUD — 속도선, 조작 힌트, 터치 조작, 성능 패널.
 *
 * DESIGN_GUIDE 「7. 3D 월드와 UI의 결합」의 레이어 규칙에 따라 전부 일반 DOM으로 구현한다.
 * WebGL 캔버스 안에 텍스트를 넣으면 화면 낭독기와 200% 확대가 모두 깨진다.
 *
 * 성능 원칙: 속도선처럼 매 프레임 변하는 값은 React 상태가 아니라 DOM 스타일을
 * 직접 갱신한다. 초당 60번 리렌더는 그 자체로 프레임을 깎아먹는다.
 */

import { useEffect, useRef, useState } from "react";

import { CityMap } from "@/components/hud/CityMap";
import { HealthPanel, QuestPanel, ResultPanel } from "@/components/hud/StatusPanels";
import {CONTROL_CODES, keyLabel} from "@/game/systems/controls";
import { pendingClues } from "@/game/quest/clues";
import {
  CompanionSpeech,
  DistrictBanner,
  ResidentSpeech,
  UnlockNotice,
} from "@/components/hud/Notices";
import { Codex } from "@/components/hud/Codex";
import { CaptureNotice } from "@/components/hud/CaptureNotice";
import { PerfPanel } from "@/components/hud/PerfPanel";
import { PhotoControls } from "@/components/hud/PhotoControls";
import { ShrineNotice } from "@/components/hud/ShrineNotice";
import { Minimap } from "@/components/hud/Minimap";
import { TouchControls } from "@/components/hud/TouchControls";
import { TouchMenu } from "@/components/hud/TouchMenu";
import { pendingDiscoveries, type DiscoveryView, type DokebiId } from "@/game/dokebi/roster";
import { contextMessage, type ContextLossView } from "@/game/systems/contextLoss";

import { SPEED_LINES } from "@/game/config/tuning";
import { weaponRange, WEAPONS, type WeaponId } from "@/game/combat/weapons";
import type { RuntimeStats } from "@/game/scene/GameScene";
import type { InputState } from "@/game/systems/input";
import type { QuestView } from "@/game/quest/questRunner";
import type { QualityLevel } from "@/game/systems/quality";

/** 씬이 매 프레임 갱신하는 전투·표식 상태 */
export interface CombatView {
  playerHp: number;
  playerDowned: boolean;
  /** 미니맵 적 표식(x, z 쌍) */
  enemyBlips: Float32Array;
  enemyBlipCount: number;
  companionX: number;
  companionZ: number;
  companionVisible: boolean;
  /** 동료 능력을 지금 쓸 수 있는지. 쿨다운 중이면 버튼 이름이 바뀐다 */
  companionAbilityReady: boolean;
}

interface WorldHudProps {
  stats: RuntimeStats;
  questView: QuestView;
  /** 전투 상태를 담은 공유 가변 객체. HUD가 자기 주기로 읽는다 */
  combat: CombatView;
  /** 완주 결과에 쓰는 집계 */
  summary: { elapsedSeconds: number; maxSpeed: number; defeated: number; bossDefeated: boolean };
  /** 동료의 대사 */
  dialogue: { line: string | null };
  /** 플레이어가 정한 이름. 완주 화면이 쓴다 */
  nickname: string;
  /** 이미 찾은 흔적의 id. 지도가 남은 것만 표시한다 */
  foundClues: readonly string[];
  /** 주민 대사와 「말 걸 수 있음」. 군중이 매 프레임 갱신한다 */
  talkView: { line: string | null; speaker: string; nearby: boolean };
  /** 지금 도깨비 자리에 서 있는지. 「손을 내밀라」를 띄운다 */
  discovery: DiscoveryView;
  /** 지금 구역 — 바뀔 때만 배너를 띄운다 */
  district: { id: string; name: string; subtitle: string };
  /** 현재 시간대 이름. 포토 모드 버튼에 그대로 쓴다 */
  timeOfDayName: string;
  onCycleTimeOfDay: () => void;
  /** 현재 색보정 이름 */
  photoFilterName: string;
  onCyclePhotoFilter: () => void;
  /** 현재 포즈 이름 */
  photoPoseName: string;
  onCyclePhotoPose: () => void;
  /** 지금 데리고 다니는 도깨비 이름 */
  dokebiName: string;
  /** 그 도깨비의 능력 이름. 조작 힌트와 터치 버튼에 쓴다 */
  abilityName: string;
  /** 해금된 도깨비 수. 1이면 교체 버튼을 숨긴다 */
  dokebiUnlockedCount: number;
  onCycleDokebi: () => void;
  /** 도감에서 고른 도깨비 */
  dokebi: DokebiId;
  onSelectDokebi: (id: DokebiId) => void;
  /** 도시에서 실제로 만난 도깨비들 */
  metDokebi: readonly DokebiId[];
  /** 그래픽 연결 상태 — 끊기면 안내한다 */
  context: ContextLossView;
  /** 미니 보스 — 교전 중일 때만 체력 막대를 띄운다 */
  boss: { engaged: boolean; healthRatio: number; telegraph: boolean; distance: number; phase: string };
  /** 자판기 — 안내와 남은 효과 시간 */
  vending: { machineInReach: boolean; boostRemaining: number; drinks: number };
  onRestart: () => void;
  photoMode: boolean;
  recording: boolean;
  captureNotice: string | null;
  onTogglePhoto: () => void;
  onTakePhoto: () => void;
  onToggleClip: () => void;
  input: InputState;
  quality: QualityLevel;
  reducedMotion: boolean;
  showPerf: boolean;
  onTogglePerf: () => void;
  onExit: () => void;
}

export function WorldHud({
  stats,
  questView,
  combat,
  summary,
  dialogue,
  talkView,
  discovery,
  nickname,
  foundClues,
  district,
  timeOfDayName,
  onCycleTimeOfDay,
  photoFilterName,
  onCyclePhotoFilter,
  photoPoseName,
  onCyclePhotoPose,
  dokebiName,
  abilityName,
  dokebi,
  onSelectDokebi,
  metDokebi,
  vending,
  boss,
  context,
  onRestart,
  photoMode,
  recording,
  captureNotice,
  dokebiUnlockedCount,
  onCycleDokebi,
  onTogglePhoto,
  onTogglePerf,
  onExit,
  onTakePhoto,
  onToggleClip,
  input,
  quality,
  reducedMotion,
  showPerf,
}: WorldHudProps) {
  const isTouch = useCoarsePointer();
  /*
   * 도감과 지도는 서로를 닫는다. 둘 다 화면 가운데를 차지해 겹치면 아무것도
   * 못 읽는다.
   */
  const [codexOpen, setCodexOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  /*
   * Escape로 패널을 닫는다.
   *
   * 도감은 `role="dialog"`인데 Escape가 어디에도 없었다 — 키보드 사용자는
   * 도깨비 항목을 전부 지나 「닫기」까지 Tab해야 빠져나온다. 마우스로는
   * 아무 불편이 없어 눈에 띄지 않는 종류다.
   *
   * 월드 조작(`input.ts`)이 아니라 여기서 듣는다. 이건 게임 동작이 아니라
   * 화면 조작이고, 패널이 열려 있는지는 여기만 안다.
   */
  useEffect(() => {
    if (!codexOpen && !mapOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      setCodexOpen(false);
      setMapOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [codexOpen, mapOpen]);

  /*
   * 찾아가야 할 도깨비 목록. 지도가 표식을 찍는다.
   *
   * 진행도(처치 수·퀘스트)는 공유 객체라 리렌더를 일으키지 않는다. 대신
   * 해금 알림이 이미 같은 값을 폴링하고 있어, 만난 순간 metDokebi가 바뀌면
   * 여기까지 다시 계산된다.
   */
  const discoveries = pendingDiscoveries(
    {
      defeatedTotal: summary.defeated,
      questCompleted: questView.firstQuestDone,
      bossDefeated: summary.bossDefeated,
    },
    metDokebi,
  );

  /*
   * 포토 모드에서는 HUD를 거의 다 숨긴다 (DESIGN_GUIDE 「5.5 아이콘과 일러스트」 "UI 숨기기").
   * 사진에 목표 문구와 속도계가 찍히면 쓸 수 없는 그림이 된다.
   */
  if (photoMode) {
    return (
      <PhotoControls
        input={input}
        recording={recording}
        captureNotice={captureNotice}
        timeOfDayName={timeOfDayName}
        onCycleTimeOfDay={onCycleTimeOfDay}
        photoFilterName={photoFilterName}
        onCyclePhotoFilter={onCyclePhotoFilter}
        photoPoseName={photoPoseName}
        onCyclePhotoPose={onCyclePhotoPose}
        onTakePhoto={onTakePhoto}
        onToggleClip={onToggleClip}
        onExit={onTogglePhoto}
      />
    );
  }

  return (
    <>
      {!reducedMotion && <SpeedLines stats={stats} />}

      {/* 좌상단: 현재 목표 — DESIGN_GUIDE 「2.1 세계가 먼저, UI는 나중에」이 허용한 상시 노출 3종 중 하나 */}
      <QuestPanel questView={questView} />

      {/*
        우상단: 메뉴 계열 버튼.

        `flex-wrap`이 반드시 있어야 한다. 브라우저에서 직접 재 보니 버튼 일곱 개가
        **480px**이고(개당 58~71px + 간격 8px), 폰 가로 폭에서 안전 영역을 빼면
        340px 남짓이다. 넘친 버튼은 화면 밖으로 밀려 아예 누를 수 없다.

        상한을 `70vw`로 잡았다가 되돌렸다 — 폰에서 252px밖에 안 돼 오히려 세 줄로
        접혔다. 화면 폭에서 여백만 뺀 값이 맞다. 데스크톱에서는 480px가 상한보다
        훨씬 작아 한 줄 그대로다.
      */}
      {/*
        우상단 메뉴는 **터치 기기에서만** 뜬다 (요청: 화면에서 빼 달라).

        데스크톱에서는 지도·도감·사진·성능·소리·모션·나가기가 전부 키보드
        단축키로 되므로 버튼은 두 번째 입구였다. 터치에는 그 대안이 없어서
        통째로 지우면 접근할 방법이 사라진다.
      */}
      {isTouch && (
        <TouchMenu
          input={input}
          dokebiName={dokebiName}
          dokebiUnlockedCount={dokebiUnlockedCount}
          mapOpen={mapOpen}
          codexOpen={codexOpen}
          showPerf={showPerf}
          onCycleDokebi={onCycleDokebi}
          onToggleMap={() => {
            setMapOpen((open) => !open);
            setCodexOpen(false);
          }}
          onToggleCodex={() => {
            setCodexOpen((open) => !open);
            setMapOpen(false);
          }}
          onTogglePhoto={onTogglePhoto}
          onTogglePerf={onTogglePerf}
          onExit={onExit}
        />
      )}

      {mapOpen && (
        <CityMap
          stats={stats}
          questView={questView}
          combat={combat}
          discoveries={discoveries}
          clues={pendingClues(foundClues)}
          onClose={() => setMapOpen(false)}
        />
      )}



      {/*
        키보드 조작 힌트를 뺐다 (요청).

        터치 조작은 남긴다 — 저건 안내가 아니라 **입력 수단 자체**라, 없으면
        폰에서 움직일 방법이 사라진다.
      */}
      {isTouch && (
        <TouchControls
          input={input}
          abilityName={abilityName}
          abilityReady={combat.companionAbilityReady}
          dokebiName={dokebiName}
        />
      )}

      {/*
        우상단 패널을 쌓는다.

        도감과 성능 패널이 **완전히 같은 자리**(+56px, right)에 있었다 —
        둘 다 버튼으로 켜므로 함께 열면 정확히 포개진다. 하단 알림과 같은
        원인이라 같은 방식으로 고친다.
      */}
      <div
        className="absolute flex flex-col items-end gap-[var(--space-2)]"
        style={{ top: "calc(var(--safe-top) + 56px)", right: "var(--safe-right)" }}
      >
        {showPerf && <PerfPanel stats={stats} quality={quality} boss={boss} />}
        {codexOpen && (
          <Codex
            current={dokebi}
            summary={summary}
            questView={questView}
            met={metDokebi}
            onSelect={onSelectDokebi}
            onClose={() => setCodexOpen(false)}
          />
        )}
      </div>
      {/*
        위쪽 가운데를 쌓는다.

        보스 체력 막대(+96)와 구역 배너(+152)가 각자 좌표를 들고 있었고,
        간격은 손으로 맞춘 값이었다. 좌상단 목표 패널(최대 70vw)이 좁은
        화면에서 가운데까지 닿으므로 시작 위치는 그 아래(+96)에 둔다.
      */}
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-[var(--space-2)]"
        style={{ top: "calc(var(--safe-top) + 96px)" }}
      >
        <BossHealth boss={boss} />
        <DistrictBanner district={district} />
      </div>
      {/*
        좌하단을 쌓는다.

        미니맵(148px)이 +12px에 있어 속도(+0)와 체력(+52)을 통째로 덮고 있었다.
        반복 138에서 미니맵을 +96px로 올려 손으로 맞췄지만, 높이를 추정해
        간격을 정하는 방식은 하나만 커져도 다시 겹친다.

        아래에서부터 속도 → 체력 → 지도 순으로 쌓는다. 크기가 바뀌어도
        간격이 따라온다.
      */}
      <div
        className="pointer-events-none absolute flex flex-col-reverse items-start gap-[var(--space-2)]"
        style={{ bottom: "var(--safe-bottom)", left: "var(--safe-left)" }}
      >
        <SpeedReadout stats={stats} />
        <WeaponReadout stats={stats} />
        <HealthPanel combat={combat} />
      <Minimap
          stats={stats}
          questView={questView}
          combat={combat}
          discoveries={discoveries}
        />
      </div>
      {/*
        좌상단 말풍선 더미.
        
        동료 대사와 주민·간판 대사가 각자 좌표를 들고 있었다. 오늘은 6px
        차이로 안 겹쳤지만, 동료 대사가 좁은 화면에서 한 줄 더 늘어나면
        곧바로 밑을 덮는다 — 좌표를 손으로 맞추다 여섯 번 겹쳤던 그 방식이다.
        쌓아 두면 위가 늘어난 만큼 아래가 밀린다.
      */}
      <div
        className="pointer-events-none absolute flex flex-col gap-[var(--space-2)]"
        style={{ top: "calc(var(--safe-top) + 132px)", left: "var(--safe-left)" }}
      >
        <CompanionSpeech dialogue={dialogue} speaker={dokebiName} />
        <ResidentSpeech talk={talkView} talkKey={keyLabel(CONTROL_CODES.talk)} />
      </div>
      {/*
        하단 중앙에 쌓는다.

        네 알림이 각자 절대 좌표를 들고 있었다 — 자판기 안내(+168)와 자리
        알림(+208)이 겹쳤고, 새 알림을 넣을 때마다 남은 틈을 찾아야 했다.
        이번 세션에서 HUD 겹침이 네 번 나왔고 전부 같은 원인이었다.

        아래에서부터 쌓으므로(`flex-col-reverse`) 새 알림이 위로 밀려 올라간다.
        보이는 것만 자리를 차지한다 — 각 알림이 조건에 따라 null을 돌려준다.
      */}
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col-reverse items-center gap-[var(--space-2)]"
        style={{ bottom: "calc(var(--safe-bottom) + 96px)" }}
      >
        {captureNotice && <CaptureNotice message={captureNotice} />}
        <ShrinePrompt discovery={discovery} />
        <UnlockNotice summary={summary} questView={questView} met={metDokebi} />
        <VendingPrompt vending={vending} />
        {/* 만나기 전 단계 — 자리가 드러났다는 것만 알린다 */}
        <ShrineNotice summary={summary} questView={questView} met={metDokebi} />
      </div>
      {/*
        도감·지도를 열면 완주 화면을 비켜 준다.
        
        둘이 겹쳐 「최고 속도」와 「만난 도깨비」가 가려지는 것을 화면에서 봤다.
        완주하면 도감을 열어 보는 것이 가장 자연스러운 동작인데, 그때 두 개가
        정면으로 부딪힌다.
        
        **연 쪽이 이긴다** — 대화창은 사람이 방금 누른 것이고, 완주 화면은
        가만히 떠 있던 것이다. 닫으면 다시 나타난다(기록은 그 순간에 굳어
        있으므로 값이 변하지 않는다).
      */}
      {!codexOpen && !mapOpen && (
      <ResultPanel
        questView={questView}
        summary={summary}
        met={metDokebi}
        nickname={nickname}
        onPhoto={onTogglePhoto}
        onRestart={onRestart}
      />
      )}
      {/*
        그래픽 연결이 끊겼다는 알림은 **맨 마지막에** 그린다.
        
        이 프로젝트는 z-index를 쓰지 않고 DOM 순서로 겹침을 정한다. 이 알림이
        중간에 있었더니 완주 화면이 그 위를 덮어, 「그래픽 연결이 끊겼습니다」와
        새로고침 버튼이 가려졌다 — 컨텍스트를 강제로 끊어 화면에서 봤다.
        
        게임이 죽었다는 소식은 무엇에도 가려지면 안 된다. 다른 겹침은 「연 쪽이
        이긴다」로 풀지만 이것만은 늘 이긴다 — 사람이 연 것이 아니라 사고다.
      */}
      <ContextNotice context={context} />
    </>
  );
}

/**
 * 그래픽 연결 안내.
 *
 * 컨텍스트가 끊기면 캔버스는 검은 채로 남고 아무 일도 일어나지 않는다.
 * 사용자에게는 게임이 죽은 것으로 보이므로, 무슨 일인지와 무엇을 하면 되는지
 * 를 알려 준다. 이 안내는 3D 밖(DOM)에 있어 컨텍스트가 없어도 보인다.
 */
function ContextNotice({ context }: { context: ContextLossView }) {
  const [message, setMessage] = useState<string | null>(null);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMessage(contextMessage(context));
      setLost(context.state === "lost");
    }, 400);
    return () => window.clearInterval(id);
  }, [context]);

  if (!message) return null;

  return (
    <div
      className="hud-scrim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] px-[var(--space-6)] py-[var(--space-4)] text-center"
      style={{ maxWidth: "min(40ch, 88vw)" }}
      role="alert"
    >
      <p className="m-0 text-sm">{message}</p>
      {/*
        끊긴 동안에는 누를 것을 준다.

        「새로고침하면 다시 시작할 수 있습니다」라고 적어 두고 누를 것이 없었다 —
        모바일에서는 주소창을 다시 꺼내는 것부터 어렵고, 화면은 검은 채로 남아
        게임이 죽은 것으로 보인다.

        돌아온 뒤에는 버튼을 두지 않는다. 계속 놀 수 있는데 새로고침을 권하면
        진행을 버리라는 말로 읽힌다.
      */}
      {lost && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="새로고침"
          className="mt-[var(--space-3)] rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-sm font-semibold"
          style={{ minHeight: "var(--touch-min)" }}
        >
          새로고침
        </button>
      )}
    </div>
  );
}

/**
 * 미니 보스 체력 막대.
 *
 * 가까이 갔을 때만 뜬다 — 도시 어딘가에 보스가 있다는 사실을 상시 알려 줄
 * 이유가 없다. 예고 중에는 색이 바뀌어, 막대만 보고 있어도 피할 때를 안다.
 */
function BossHealth({
  boss,
}: {
  boss: { engaged: boolean; healthRatio: number; telegraph: boolean; distance: number; phase: string };
}) {
  const [view, setView] = useState({ engaged: false, ratio: 1, telegraph: false });

  useEffect(() => {
    const id = window.setInterval(
      () => setView({ engaged: boss.engaged, ratio: boss.healthRatio, telegraph: boss.telegraph }),
      120,
    );
    return () => window.clearInterval(id);
  }, [boss]);

  if (!view.engaged) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2"
      style={{ width: "min(40ch, 80vw)" }}
      role="status"
      aria-live="polite"
      /*
       * 이름을 고정한다.
       *
       * `고물 대장 체력 87퍼센트`처럼 퍼센트를 넣어 두었는데, 이 값은 120ms마다
       * 바뀐다 — `aria-live` 영역의 이름이 계속 바뀌면 낭독기가 숫자만 끝없이
       * 읽는다. 정작 들어야 할 「내려친다 — 피해!」가 그 사이에 묻힌다.
       *
       * 퍼센트는 눈으로만 본다. 소리로 필요한 것은 **지금 피해야 하는가**다.
       */
      aria-label="고물 대장 체력"
    >
      <p className="m-0 flex items-baseline justify-between text-xs">
        <span className="font-semibold">고물 대장</span>
        {view.telegraph && <span className="text-sunset">내려친다 — 피해!</span>}
      </p>
      <span
        aria-hidden="true"
        className="mt-1 block h-2 w-full overflow-hidden rounded-[var(--radius-round)] bg-[rgba(255,255,255,0.16)]"
      >
        <span
          className="block h-full rounded-[var(--radius-round)] transition-[width] duration-200"
          style={{
            width: `${Math.round(view.ratio * 100)}%`,
            background: view.telegraph ? "#ff8a3d" : "#ff5d6c",
          }}
        />
      </span>
    </div>
  );
}

/**
 * 자판기 안내와 효과 표시.
 *
 * 손이 닿을 때만 안내가 뜬다 — 도시 어딘가에 자판기가 있다는 사실을 상시
 * 알려 줄 이유가 없다. 효과 중에는 남은 시간이 대신 보인다.
 */
function VendingPrompt({
  vending,
}: {
  vending: { machineInReach: boolean; boostRemaining: number; drinks: number };
}) {
  const [view, setView] = useState({ near: false, remaining: 0 });

  useEffect(() => {
    const id = window.setInterval(
      () => setView({ near: vending.machineInReach, remaining: vending.boostRemaining }),
      150,
    );
    return () => window.clearInterval(id);
  }, [vending]);

  if (!view.near && view.remaining <= 0) return null;

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-sm"
      role="status"
      /*
       * 세는 동안에는 알리지 않는다.
       *
       * 남은 시간이 초당 여덟 번쯤 바뀌는데 그대로 `polite`로 두면 낭독기가
       * 숫자만 끝없이 읽는다 — 보스 체력 막대에서 겪은 것과 같다(반복 160).
       *
       * 정작 들어야 할 것은 **뽑을 수 있게 됐다**는 사실이다. 그 순간에만
       * 알린다.
       */
      aria-live={view.remaining > 0 ? "off" : "polite"}
    >
      {view.remaining > 0 ? (
        <span>
          <span className="text-[var(--color-action-primary)]">시원하다</span> —{" "}
          <span className="tabular-nums">{view.remaining.toFixed(1)}</span>초
        </span>
      ) : (
        <span>
          <kbd className="font-semibold text-[var(--color-action-primary)]">F</kbd> 음료 뽑기
        </span>
      )}
    </div>
  );
}


function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}

/**
 * 속도선.
 *
 * 3D 안에서 파티클로 만들면 드로우콜과 오버드로우가 늘어난다. 화면 전체를 덮는
 * 그라디언트 하나면 같은 인상을 훨씬 싸게 만들 수 있고, 저감 모션에서는
 * 컴포넌트째 렌더하지 않으면 그만이다.
 */
function SpeedLines({ stats }: { stats: RuntimeStats }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const element = ref.current;
      if (element) {
        const range = SPEED_LINES.fullSpeed - SPEED_LINES.startSpeed;
        const t = Math.min(1, Math.max(0, (stats.speed - SPEED_LINES.startSpeed) / range));
        element.style.opacity = String(t * SPEED_LINES.maxOpacity);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: 0,
        background:
          "radial-gradient(ellipse at center, transparent 30%, rgba(255,255,255,0.18) 72%, rgba(255,255,255,0.42) 100%)",
      }}
    />
  );
}

/**
 * 「손을 내밀라」.
 *
 * 누르지 않으면 안 열리게 바꾸고 나니(RALPH_BACKLOG 「10. 만나는 순간에 행동이
 * 있다」) 처음 오는 사람은 **무엇을 눌러야 할지 알 수 없었다** — 규칙만 지키고
 * 안내가 없으면 그건 잠긴 문이다.
 *
 * 이름은 밝히지 않는다. 아직 만나지 않은 도깨비이고, 누구인지는 만나서 알아야
 * 한다 — 자리 알림(`ShrineNotice`)이 이미 같은 규칙을 쓴다.
 */
function ShrinePrompt({ discovery }: { discovery: DiscoveryView }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 매 프레임 바뀌는 값이라 자기 주기로 들여다본다 — 다른 알림들과 같은 방식이다
    const id = window.setInterval(() => setVisible(discovery.nearby !== null), 150);
    return () => window.clearInterval(id);
  }, [discovery]);

  if (!visible) return null;

  return (
    <div className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-4 py-2 text-center">
      <div className="text-sm font-semibold">여기 무언가 있다</div>
      <div className="text-xs text-[var(--color-text-secondary)]">
        {keyLabel(CONTROL_CODES.talk)}로 손을 내밀어 보자
      </div>
    </div>
  );
}

/**
 * 무기 이름에 **사거리**를 붙인다.
 *
 * 이름만으로는 딱총이 얼마나 멀리 닿는지 알 수 없다. 근접은 부채꼴 사거리,
 * 원거리는 탄이 나는 거리 — `weaponRange`가 그 둘을 한 값으로 답한다.
 */
function weaponLabel(id: WeaponId): string {
  const weapon = WEAPONS[id];
  return `${weapon.name} · ${weaponRange(weapon).toFixed(0)}m`;
}

/**
 * 손에 든 무기.
 *
 * 없으면 `Q`를 눌러도 **바뀌었는지 알 수 없다** — 방망이와 망치는 사거리와
 * 길이가 다를 뿐 화면에 다른 물건이 들리지는 않기 때문이다. 만들어 두고
 * 보이지 않으면 없는 것과 같다.
 *
 * 속도계와 같은 방식으로 프레임마다 글자만 갈아 끼운다 — 무기를 바꿀 때마다
 * 리렌더하면 HUD 전체가 다시 그려진다.
 */
function WeaponReadout({ stats }: { stats: RuntimeStats }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = weaponLabel(stats.weapon);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  return (
    <div className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-3 py-1.5">
      <span className="text-xs text-[var(--color-text-secondary)]">무기</span>
      <span className="ml-2 text-sm font-semibold" ref={ref}>
        {weaponLabel(stats.weapon)}
      </span>
    </div>
  );
}

/** 좌하단 속도계 — 튜닝 중 수치를 눈으로 확인하기 위한 임시 표시 */
function SpeedReadout({ stats }: { stats: RuntimeStats }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = stats.speed.toFixed(1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  return (
    <div
      className="hud-scrim pointer-events-none rounded-[var(--radius-md)] px-3 py-2"
    >
      <span className="tabular text-lg font-semibold" ref={ref}>
        0.0
      </span>
      <span className="ml-1 text-xs text-[var(--color-text-secondary)]">m/s</span>
    </div>
  );
}
