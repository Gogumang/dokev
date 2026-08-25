"use client";

/**
 * 월드 화면의 클라이언트 셸.
 *
 * 3D 런타임 바깥에서 처리해야 하는 것들을 모은다 — WebGL 지원 확인, 품질 판정,
 * 입력 객체 수명 관리, 로딩 표시, 자동 강등 안내. DESIGN_GUIDE 9절이 요구하는
 * "반드시 디자인할 서비스 상태" 중 이 스파이크 범위에 해당하는 것들이다.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SceneErrorBoundary } from "@/components/ErrorBoundary";
import {
  SCRIPT_LINE_SECONDS,
  advanceLine,
  createScriptState,
  currentLine,
  startScript,
} from "@/game/quest/script";
import { WorldHud } from "@/components/hud/WorldHud";
import { GameScene, type RuntimeStats } from "@/game/scene/GameScene";
import { useWorldAudio } from "@/game/systems/audio";
import { createInputState, useKeyboardBindings, usePointerLook } from "@/game/systems/input";
import {
  detectQualityLevel,
  detectWebGLSupport,
  getQualityPreset,
  type QualityLevel,
} from "@/game/systems/quality";

import { createAnalytics } from "@/game/systems/analytics";
import {
  companionParty,
  consumeDiscovery,
  type DiscoveryView,
  DOKEBI,
  type DokebiId,
  nextDokebi,
  resolveCompanion,
  unlockedDokebi,
} from "@/game/dokebi/roster";
import { createEmoteState } from "@/game/player/emote";
import { createCombatCues } from "@/game/systems/audio/combat";
import { DEFAULT_WEAPON } from "@/game/combat/weapons";
import { createBossView } from "@/game/combat/bossSim";
import { parseScenario } from "@/game/systems/devScenario";
import { buildDemoRoute, demoSpawn } from "@/game/systems/demoRoute";
import { DemoGuide } from "@/components/hud/DemoGuide";
import { createContextLossView } from "@/game/systems/contextLoss";
import { nextPhotoPose, PHOTO_POSES, type PhotoPoseId } from "@/game/player/photoPose";
import { nextPhotoFilter, photoFilterPreset, type PhotoFilterId } from "@/game/systems/photoFilter";
import { DowngradeNotice } from "@/app/play/DowngradeNotice";
import { useCapture } from "@/app/play/useCapture";
import { useFoundClues } from "@/app/play/useFoundClues";
import { useProgressSave } from "@/app/play/useProgressSave";
import { resolveMetDokebi, resolveResume, withMetDokebi } from "@/game/systems/resumeProgress";
import { clearProgress, loadProgress } from "@/game/systems/saveGame";
import { BLIP_FLOAT_COUNT } from "@/game/systems/minimap";
import { loadSettings, subscribeSettings, updateSettings } from "@/game/systems/settings";
import { prefersReducedMotion } from "@/game/systems/motionPreference";
import type { QuestView } from "@/game/quest/questRunner";
import { disposeAtlasTextures } from "@/game/world/atlasTextures";
import { buildCityDetails } from "@/game/world/cityDetails";
import { buildCityLayout } from "@/game/world/cityLayout";
import { DISTRICTS } from "@/game/world/districts";
import { disposeFacadeTextures } from "@/game/world/textures";
import { nextTimeOfDay, TIME_OF_DAY, type TimeOfDayId } from "@/game/world/timeOfDay";

/*
 * three.js 코드 분할은 PlayShell이 이 파일 전체를 지연 로딩하는 것으로 이미 끝난다.
 * 여기서 GameScene을 한 번 더 dynamic으로 감싸면 마운트 도중 DOM이 한 번 더
 * 교체되고, 그 순간 R3F가 캔버스를 0x0으로 측정해 씬을 만들지 못한다.
 */

/**
 * 첫 렌더 시점에 한 번만 확정되는 기기 환경.
 *
 * PlayShell이 이 컴포넌트를 클라이언트에서만 마운트하므로, 여기서는 window를
 * 안전하게 읽을 수 있고 "감지 후 setState" 없이 첫 렌더부터 올바른 값을 쓴다.
 */
interface Environment {
  webglSupported: boolean;
  initialQuality: QualityLevel;
  reducedMotion: boolean;
}

function detectEnvironment(): Environment {
  const settings = loadSettings();
  return {
    webglSupported: detectWebGLSupport(),
    // 사용자가 시작 화면에서 품질을 골랐다면 자동 판정보다 그 선택이 우선한다.
    initialQuality: settings.quality === "auto" ? detectQualityLevel() : settings.quality,
    // OS 설정과 사용자 설정 중 하나라도 켜져 있으면 저감 모션으로 본다.
    reducedMotion: prefersReducedMotion(
      settings.reducedMotion,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  };
}

/** WebGL 미지원 — DESIGN_GUIDE 「시스템 상태」 상태. 지금은 안내만 하고 2D 대안은 미구현이다. */
function UnsupportedPanel({ onExit }: { onExit: () => void }) {
  return (
    /*
     * 본문 랜드마크.
     *
     * 같은 파일의 월드 경로는 `<main>`을 쓰는데 여기만 `<div>`였다 — 3D를
     * 못 여는 기기로 온 사람에게만 구조가 없는 화면이 나갔다.
     *
     * `role="alert"`은 쓰지 않는다. 오류 화면은 보던 것을 갑자기 대체하지만
     * 이건 처음부터 이 페이지의 내용이다 — 끼어드는 알림이 아니다.
     */
    <main className="grid min-h-dvh place-items-center px-[var(--space-6)]">
      <div className="max-w-[52ch] text-center">
        <h1 className="text-2xl font-bold">이 브라우저에서는 3D 월드를 열 수 없습니다</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">
          WebGL을 사용할 수 없는 환경입니다. 최신 Chrome, Edge, Safari에서 다시 시도하거나 기기의
          하드웨어 가속 설정을 확인해 주세요.
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          진행한 내용은 저장되지 않았으며, 되돌아가도 잃는 것은 없습니다.
        </p>
        {/*
          새로고침을 함께 준다.

          「랜딩으로 돌아가기」뿐이었다. 그런데 WebGL은 **일시적으로** 죽기도
          한다(GPU 프로세스가 내려가는 경우) — 그때는 새로고침 한 번이면
          열리는데, 그 길이 없어 되돌아가는 수밖에 없었다.
          오류 화면들이 이미 같은 짝(다시 시도·새로고침)을 준다.
        */}
        <div className="mt-6 flex flex-wrap justify-center gap-[var(--space-2)]">
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="새로고침"
            className="rounded-[var(--radius-round)] bg-[var(--color-action-primary)] px-6 font-semibold text-[var(--color-text-inverse)]"
            style={{ minHeight: "var(--touch-min)" }}
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="랜딩으로 돌아가기"
            className="rounded-[var(--radius-round)] border border-white/25 px-6 font-semibold"
            style={{ minHeight: "var(--touch-min)" }}
          >
            랜딩으로 돌아가기
          </button>
        </div>
      </div>
    </main>
  );
}

export function PlayClient() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // 지연 초기화라 마운트 시 한 번만 실행된다. 감지 결과로 인한 추가 렌더가 없다.
  const [environment] = useState(detectEnvironment);
  const [quality, setQuality] = useState<QualityLevel>(environment.initialQuality);
  const [reducedMotion, setReducedMotion] = useState(environment.reducedMotion);
  const [showPerf, setShowPerf] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  /*
   * 녹화 여부는 ref가 아니라 상태로 둔다. ref를 렌더에서 읽으면 React가
   * 렌더를 순수하다고 가정할 수 없고, 버튼 라벨도 갱신되지 않는다.
   */
  const [recording, setRecording] = useState(false);
  const [downgradeNotice, setDowngradeNotice] = useState<QualityLevel | null>(null);

  // 렌더 루프와 공유하는 가변 객체들. 리렌더를 유발하지 않아야 하므로 상태로 두되
  // 값을 교체하지 않고 내부 필드만 갱신한다 (60fps 리렌더 방지).
  const [input] = useState(createInputState);
  const [stats] = useState<RuntimeStats>(() => ({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    renderStatsOwned: false,
    triangles: 0,
    heapMb: 0,
    speed: 0,
    mode: "walk",
    grounded: true,
    landingImpact: 0,
    downed: false,
    gliding: false,
    companionPresent: true,
    district: "plaza",
    emote: createEmoteState(),
    combat: createCombatCues(),
    attackElapsed: null,
    weapon: DEFAULT_WEAPON,
    x: 0,
    z: 0,
    facing: 0,
    viewYaw: 0,
  }));

  // 퀘스트 표시도 같은 방식으로 공유한다 — 씬이 쓰고 HUD가 읽는다.
  // 전투 상태도 같은 방식으로 공유한다 — 씬이 쓰고 HUD가 읽는다.
  const [combatView] = useState(() => ({
    playerHp: 5,
    playerDowned: false,
    enemyBlips: new Float32Array(BLIP_FLOAT_COUNT),
    enemyBlipCount: 0,
    companionX: 0,
    companionZ: 0,
    companionVisible: false,
    companionAbilityReady: true,
    companionLightRange: 0,
  }));
  const [dialogueView] = useState<{ line: string | null }>(() => ({
    line: null,
  }));
  const [districtView] = useState(() => ({ ...DISTRICTS.plaza }));
  /*
   * 확인용 시작 상태. 개발 빌드에서 `?see=boss` 같은 주소로 확인 지점에서
   * 바로 시작한다 — 한 판을 봐 달라고 부탁하면서 그 앞에 10분짜리 절차를
   * 두는 것은 앞뒤가 맞지 않는다.
   */
  const [scenario] = useState(() =>
    parseScenario(window.location.search, process.env.NODE_ENV !== "production"),
  );

  /*
   * 저장된 진행은 마운트 시 한 번만 읽는다.
   *
   * 플레이 중에 다시 읽으면 다른 탭에서 진행한 내용이 끼어들어 단계가
   * 되돌아갈 수 있다. 이어하기는 진입 시점의 결정이다.
   */
  const [resumeFrom] = useState(() => resolveResume(loadProgress(), scenario));

  /*
   * 완주 통계. **이어받은 처치 수에서 시작한다.**
   *
   * 0으로 시작했더니 저장을 이어하거나 확인 지점으로 들어왔을 때 도깨비
   * 해금 수가 0으로 잡혀 동료 바꾸기 버튼이 나타나지 않았다 — 실제로
   * `?see=party`로 들어가 보고 발견했다. 이 값은 매 프레임 갱신되지만
   * 첫 렌더가 틀리면 버튼은 다른 상태가 바뀔 때까지 나오지 않는다.
   */
  const [summaryView] = useState(() => ({
    elapsedSeconds: 0,
    maxSpeed: 0,
    defeated: resumeFrom?.defeatedTotal ?? 0,
    // 이어받은 판에서도 네 번째 도깨비가 잠기지 않도록 첫 렌더부터 맞춘다
    bossDefeated: resumeFrom?.bossDefeated === true,
  }));

  /*
   * 초기값을 설정에서 읽는다. useState 초기화 함수 안에서 읽어야 렌더마다
   * localStorage를 건드리지 않는다.
   */
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>(
    () => scenario?.timeOfDay ?? loadSettings().timeOfDay,
  );

  /*
   * 포토 모드를 나가도 시간대를 되돌리지 않는다. 공들여 밤으로 맞춰 놓고
   * 나왔더니 노을로 돌아와 있으면 다시 들어가서 맞춰야 한다.
   */
  /*
   * 갱신 함수 안에서 설정을 바꾸지 않는다.
   *
   * `setTimeOfDay((current) => { updateSettings(...); return next; })`로 되어
   * 있었다. React는 갱신 함수를 **렌더 도중에** 실행하는데, `updateSettings`는
   * 구독자에게 알림을 보내므로 렌더 중 다른 컴포넌트를 갱신하게 된다.
   * 실제로 브라우저에서 시간대 버튼을 누르자 React가 오류를 냈다.
   *
   * HUD에 설정을 구독하는 버튼(소리·흔들림)이 생기기 전에는 구독자가 없어
   * 드러나지 않았을 뿐, 갱신 함수에 부수효과를 두는 것 자체가 잘못이었다.
   */
  const handleCycleTime = useCallback(() => {
    const next = nextTimeOfDay(timeOfDay);
    updateSettings({ timeOfDay: next });
    setTimeOfDay(next);
  }, [timeOfDay]);

  const [photoFilter, setPhotoFilter] = useState<PhotoFilterId>(() => loadSettings().photoFilter);
  const handleCycleFilter = useCallback(() => {
    const next = nextPhotoFilter(photoFilter);
    updateSettings({ photoFilter: next });
    setPhotoFilter(next);
  }, [photoFilter]);

  const [photoPose, setPhotoPose] = useState<PhotoPoseId>(() => loadSettings().photoPose);

  const handleCyclePose = useCallback(() => {
    const next = nextPhotoPose(photoPose);
    updateSettings({ photoPose: next });
    setPhotoPose(next);
  }, [photoPose]);

  /**
   * 처음부터 다시 하기.
   *
   * 저장을 지우고 새로고침한다. 씬 안의 상태를 하나씩 되돌리는 것보다
   * 전체를 다시 세우는 편이 빠뜨리는 곳이 없다 — 되돌릴 상태가 이미 열 곳이 넘는다.
   */
  const handleRestart = useCallback(() => {
    clearProgress();
    /*
     * 만난 기록도 지운다. 남겨 두면 다시 조건을 채웠을 때 자리를 찾아가지
     * 않아도 곧바로 부를 수 있어 **찾아가는 부분이 통째로 빠진다** —
     * 「처음부터」라고 적어 놓고 도깨비 자리는 한 번도 서지 않는다.
     */
    updateSettings({ metDokebi: [] });
    window.location.reload();
  }, []);

  const [questView] = useState<QuestView>(() => ({
    title: "준비 중",
    hint: "",
    ratio: 0,
    counter: "",
    completed: false,
    // 이어받은 판에서는 첫 여정을 이미 넘겼을 수 있다. 규칙은 이어받기 계산이 갖는다
    firstQuestDone: resumeFrom?.firstQuestDone === true,
    // 씬이 첫 프레임에 덮어쓴다. 0으로 두면 그때까지는 「조용한 구간」이다
    stepIndex: 0,
  }));

  const [metDokebi, setMetDokebi] = useState<DokebiId[]>(() =>
    resolveMetDokebi(loadSettings().metDokebi, scenario),
  );
  /*
   * 잠긴 동료를 들고 시작하지 않는다.
   *
   * 설정은 id가 아는 이름인지만 확인한다 — 「진행을 지우고 처음부터 다시
   * 하기」를 눌러도 마지막으로 고른 동료가 그대로 남아, 고물 대장을 눕혀야
   * 열리는 「자정」을 능력까지 쓰면서 첫 화면에서 시작하게 됐다.
   */
  const [dokebi, setDokebi] = useState<DokebiId>(() => {
    if (scenario?.dokebi) return scenario.dokebi;
    return resolveCompanion(
      loadSettings().dokebi,
      {
        defeatedTotal: resumeFrom?.defeatedTotal ?? 0,
        /*
         * 현재 여정의 완료가 아니라 **첫 여정을 마친 적이 있는가**를 쓴다.
         * 여정이 넘어가면 `questCompleted`는 다시 거짓이 되므로, 두 번째
         * 여정 중에 이어하면 이미 만난 도깨비가 잠긴 것으로 보여 동료가
         * 조용히 초롱으로 되돌아간다.
         */
        questCompleted: resumeFrom?.firstQuestDone === true,
        bossDefeated: resumeFrom?.bossDefeated === true,
      },
      metDokebi,
    );
  });
  /*
   * 같은 만남을 두 번 저장하지 않기 위한 사본.
   *
   * 중복 판정을 상태 갱신 함수 안에서 하면 저장·기록도 그 안으로 끌려 들어가고,
   * 갱신 함수는 렌더 도중에 실행되므로 부수효과를 두면 안 된다.
   */
  const metDokebiRef = useRef<DokebiId[]>(metDokebi);
  // 여러 효과가 읽으므로 그것들보다 먼저 선언한다
  const [analytics] = useState(() => createAnalytics());
  // 외형은 시작 화면에서 고른다. 여기서는 읽기만 한다.
  const [appearance] = useState(() => loadSettings().appearance);
  // 이름은 시작 화면에서 정하고 플레이 중에는 바뀌지 않는다 — 한 번만 읽는다
  const [nickname] = useState(() => loadSettings().nickname);
  const [discoveryView] = useState<DiscoveryView>(() => ({
    pending: null,
    // 씬이 매 프레임 채운다. 자리에 서면 HUD가 「손을 내밀라」를 띄운다
    nearby: null,
  }));
  /*
   * 주민 대사. 매 프레임 바뀌므로 상태가 아니라 공유 객체다 — HUD가
   * 주기적으로 들여다본다.
   */
  // 찾은 흔적. 지도가 남은 자리만 그리려면 개수가 아니라 목록이 필요하다
  // 세 번째를 못 찾고 그만두는 사람은 단계 완료 이벤트만으로는 보이지 않는다
  const reportClue = useCallback(
    (clue: string, total: number) => analytics.track("clue_found", { clue, total }),
    [analytics],
  );
  const { clueView, foundClues } = useFoundClues(resumeFrom?.foundClues, reportClue);

  // 문 안내. 씬이 매 프레임 쓰고 HUD가 들여다본다 — 다른 뷰들과 같은 방식이다.
  /*
   * 대본. **프레임 루프가 아니라 타이머로 넘긴다.**
   *
   * 대사는 시뮬레이션이 아니라 UI다. 한 줄이 3.2초이므로 초당 0.3회 렌더이고,
   * 이 저장소가 금지한 「매 프레임 setState」와는 성질이 다르다. 프레임 루프에
   * 넣으면 `PlayerRig`가 더 무거워지기만 한다.
   */
  const [script, setScript] = useState(createScriptState);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 줄마다 다시 걸어야 한다 — index를 빼면 넘겨도 안 걸린다
  useEffect(() => {
    if (script.id === null) return;
    const t = setTimeout(() => setScript(advanceLine), SCRIPT_LINE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [script.id, script.index]);

  const [talkView] = useState(() => ({
    line: null as string | null,
    speaker: "주민",
    remaining: 0,
    nearby: false,
  }));
  const [bossView] = useState(createBossView);
  const [contextView] = useState(createContextLossView);
  const [vendingView] = useState(() => ({
    machineInReach: false,
    boostRemaining: 0,
    drinks: 0,
  }));

  /*
   * 씬이 만남을 감지해 신호를 남기면 여기서 저장하고 신호를 지운다.
   *
   * 씬에서 직접 저장하지 않는 이유: useFrame 안에서 setState를 부르면 매
   * 프레임 리렌더가 걸릴 위험이 있고, localStorage 쓰기가 프레임에 끼어든다.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const found = consumeDiscovery(discoveryView);
      if (!found) return;
      /*
       * 저장과 기록을 갱신 함수 밖에서 한다.
       *
       * 갱신 함수는 React가 렌더 도중에 실행하므로 순수해야 한다. 안에서
       * `updateSettings`를 부르면 구독자에게 알림이 가고, 렌더 중에 다른
       * 컴포넌트를 갱신하게 된다 — 같은 실수를 시간대 버튼에서 이미 겪었다.
       */
      setMetDokebi((current) => (current.includes(found) ? current : [...current, found]));

      if (metDokebiRef.current.includes(found)) return;
      const next = [...metDokebiRef.current, found];
      metDokebiRef.current = next;
      /*
       * 친구가 되는 순간이 이 게임의 세계관이 서는 자리다 — 이긴 것이 사라지지
       * 않고 곁에 남는다(DESIGN_GUIDE 「세계관 — 도깨비란 무엇인가」). 첫 번째만
       * 길게 말하고 그다음부터 짧게 간다. 같은 말을 매번 길게 되풀이하면
       * 다음부터 읽지 않는다.
       */
      setScript((current) => startScript(current, next.length === 1 ? "firstFriend" : "friend"));
      /*
       * 저장에서 만들어 더한다 — 확인 지점의 빈 목록으로 덮으면 수집이 사라진다.
       *
       * **여기는 실패를 알린다.** 소리·모션과 달리 만난 도깨비는 **모은 것**이라,
       * 「새 도깨비를 만났다」고 축하해 놓고 다음에 오면 사라져 있으면 안 된다.
       */
      const kept = updateSettings({ metDokebi: withMetDokebi(loadSettings().metDokebi, found) });
      if (!kept) setCaptureNotice("이 브라우저에서는 만난 도깨비가 저장되지 않습니다");
      // 수집 루프의 핵심 사건이다. 이게 없으면 도깨비를 실제로 만나는
      // 사람이 몇이나 되는지 알 수 없다.
      analytics.track("dokebi_unlocked", { dokebi: found });
    }, 300);
    return () => window.clearInterval(id);
  }, [discoveryView, analytics]);
  /*
   * 해금 여부를 누르는 순간에 판단한다. 상태로 들고 있으면 로봇을 쓰러뜨린
   * 프레임마다 리렌더가 필요하고, 그건 매 프레임 setState 금지 규칙에 걸린다.
   */
  const handleCycleDokebi = useCallback(() => {
    const progress = {
      defeatedTotal: summaryView.defeated,
      questCompleted: questView.firstQuestDone,
      bossDefeated: summaryView.bossDefeated,
    };
    // 저장은 갱신 함수 밖에서 — 갱신 함수는 렌더 도중에 실행되므로 순수해야 한다
    const next = nextDokebi(dokebi, progress, metDokebi);
    updateSettings({ dokebi: next });
    setDokebi(next);
  }, [dokebi, summaryView, questView, metDokebi]);

  const handleSelectDokebi = useCallback((id: DokebiId) => {
    setDokebi(id);
    updateSettings({ dokebi: id });
  }, []);

  /*
   * 분석 세션.
   *
   * 수집 서버가 없어 기본 sink는 아무것도 보내지 않는다. 그래도 지금 호출
   * 지점을 심어 두는 이유는, 나중에 sink만 갈아 끼우면 되도록 하기 위해서다 —
   * 이벤트를 나중에 넣으려면 전체 코드를 다시 훑어야 한다.
   */

  /*
   * 진행 저장은 훅 한 곳으로 모았다 — 저장 지점이 둘이 되면 한쪽이 필드를
   * 빠뜨리는 순간 다른 쪽이 쌓아 둔 것을 조용히 덮는다.
   */
  const handleQuestAdvance = useProgressSave({
    // 시작 화면이 「저장된다」고 약속한다 — 안 되면 말해 줘야 한다
    onSaveFailed: useCallback(
      () => setCaptureNotice("이 브라우저에서는 진행이 저장되지 않습니다"),
      [],
    ),
    // 확인 지점에서는 저장이 뒤로 가지 않게 한다 — 사람의 여정·흔적을 지우면 안 된다
    sandboxed: scenario !== null,
    resumeFrom,
    summaryView,
    clueView,
    onQuestStep: useCallback(
      (index: number, defeated: number) =>
        analytics.track("quest_step_complete", {
          index,
          defeatedTotal: defeated,
        }),
      [analytics],
    ),
    onQuestComplete: useCallback(
      (defeatedTotal: number) => analytics.track("quest_complete", { defeatedTotal }),
      [analytics],
    ),
  });

  /*
   * 진입 시점 이벤트.
   *
   * WebGL 미지원과 이어하기는 여기서만 알 수 있다. 월드 진입률의 분모를
   * 만들려면 성공(world_loaded)과 실패(webgl_unsupported)가 둘 다 필요하다.
   */
  useEffect(() => {
    analytics.track("experience_start", {
      quality: environment.initialQuality,
    });
    if (!environment.webglSupported) {
      analytics.track("webgl_unsupported");
      return;
    }
    analytics.track("world_loaded", { quality: environment.initialQuality });
    if (resumeFrom) {
      analytics.track("session_resumed", {
        stepIndex: resumeFrom.questStepIndex,
      });
    }
  }, [analytics, environment, resumeFrom]);

  // 도시 배치는 시드가 고정이라 한 번만 만들면 된다.
  const layout = useMemo(() => {
    const built = buildCityLayout();
    // 시연 지점은 코스의 첫 장면에서 시작한다 (`demoSpawn` 주석)
    if (scenario?.id === "demo") return { ...built, spawn: demoSpawn(built) };
    // 확인 지점이 정해졌으면 거기서 시작한다. 도시 자체는 그대로다.
    if (!scenario?.spawn && scenario?.spawnHeight === undefined) return built;
    return {
      ...built,
      spawn: {
        x: scenario.spawn?.x ?? built.spawn.x,
        y: built.spawn.y + (scenario.spawnHeight ?? 0),
        z: scenario.spawn?.z ?? built.spawn.z,
      },
    };
  }, [scenario]);
  const details = useMemo(() => buildCityDetails(layout), [layout]);
  /** 시연 코스. `?see=demo`가 아니면 안내를 그리지 않으므로 값만 만들어 둔다 */
  const demoRoute = useMemo(() => buildDemoRoute(layout), [layout]);

  /*
   * 저감 모션을 플레이 중에 반영한다 — 운영체제 설정과 게임 안 설정 **양쪽**이다.
   *
   * 예전에는 운영체제 쪽만 듣고 `matches`를 그대로 넣었다. 그래서 게임에서 켜 둔
   * 저감 모션이 운영체제 설정이 바뀌는 순간 조용히 풀렸다. 어느 신호가 바뀌든
   * 둘을 다시 합쳐야 한다.
   */
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () =>
      setReducedMotion(prefersReducedMotion(loadSettings().reducedMotion, motionQuery.matches));

    motionQuery.addEventListener("change", sync);
    const unsubscribe = subscribeSettings(sync);
    return () => {
      motionQuery.removeEventListener("change", sync);
      unsubscribe();
    };
  }, []);

  const togglePerf = useCallback(() => setShowPerf((value) => !value), []);
  const togglePhoto = useCallback(() => {
    setPhotoMode((value) => {
      if (!value) analytics.track("photo_mode_opened");
      return !value;
    });
  }, [analytics]);

  /*
   * 촬영·녹화 배선은 훅으로 뺐다. 이 파일이 800줄 상한을 넘기도 했지만,
   * 그보다 「사진과 클립」이 한 덩어리로 읽히는 편이 낫다.
   */
  const { takePhoto, toggleClip } = useCapture({
    containerRef,
    nickname,
    analytics,
    setCaptureNotice,
    setRecording,
  });

  /*
   * 월드를 떠날 때 공유 텍스처 캐시를 비운다.
   *
   * 캐시는 모듈 수준이라 프로세스가 살아 있는 한 남는다 — 랜딩으로 돌아가도
   * 도시 텍스처와 아틀라스가 GPU에 그대로 있다. 다시 들어오면 지연 생성되므로
   * 비워도 손해가 없다. 정리 함수는 처음부터 있었는데 **아무도 부르지
   * 않았다**(지오메트리 해제 누락과 같은 종류다).
   */
  useEffect(() => {
    return () => {
      disposeFacadeTextures();
      disposeAtlasTextures();
    };
  }, []);

  /*
   * 세션이 끝났음을 남긴다.
   *
   * 이 이벤트가 없으면 얼마나 오래 놀았는지 알 수 없다 — 시작만 세고 끝을
   * 안 세면 "다들 들어와서 아무것도 안 했다"와 "오래 놀다 나갔다"가 같은
   * 데이터로 보인다.
   */
  useEffect(() => {
    return () => {
      analytics.track("session_ended");
    };
  }, [analytics]);

  // 알림은 잠시 뒤 스스로 사라진다.
  useEffect(() => {
    if (!captureNotice) return;
    const id = window.setTimeout(() => setCaptureNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [captureNotice]);

  useKeyboardBindings(input, togglePerf, togglePhoto);
  usePointerLook(input, containerRef);

  /*
   * 사운드는 stats를 매 프레임 직접 읽는다 (리렌더 없음). AudioContext는 이 훅
   * 안에서 첫 사용자 제스처를 기다렸다가 만들어지므로, 여기서 배선하는 것만으로
   * DESIGN_GUIDE 「2.4 즐거움은 선택 가능해야 함」의 "첫 명시적 입력 이후 재생" 조건이 지켜진다.
   */
  useWorldAudio(stats);

  const handleDowngrade = useCallback(
    (next: QualityLevel) => {
      setQuality(next);
      setDowngradeNotice(next);
      // 저사양으로 밀린 사용자를 성공 진입과 구분해야 퍼널이 읽힌다.
      analytics.track("quality_fallback_entered", { level: next });
    },
    [analytics],
  );

  const handleExit = useCallback(() => router.push("/"), [router]);

  if (!environment.webglSupported) {
    return <UnsupportedPanel onExit={handleExit} />;
  }

  return (
    /*
     * 본문 랜드마크.
     *
     * 시작 화면은 `<main>`을 쓰는데 월드만 그냥 `<div>`였다 — 낭독기 사용자가
     * 「본문으로 건너뛰기」를 할 수 없고, 화면 구조도 평평하게 읽힌다.
     */
    <main
      ref={containerRef}
      className="relative h-dvh w-full touch-none overflow-hidden select-none"
      style={{ background: "var(--color-bg-canvas)", cursor: "grab" }}
    >
      <SceneErrorBoundary onError={(message) => analytics.track("scene_error", { message })}>
        {/*
          3D 화면에만 이름을 붙인다.
        
          처음에는 바깥 컨테이너에 붙였는데 그 안에 HUD가 통째로 들어 있었다 —
          `role="img"`의 자손은 낭독기에 **노출되지 않으므로** 목표·체력·버튼이
          전부 사라졌다. 접근성을 고치려다 접근성을 없앤 셈이다.
        
          조작은 키보드와 HUD 버튼이 받으므로 이 요소 자체는 누를 수 없고,
          보이지 않는 사람에게는 실제로 그림 한 장이다.
        */}
        <div
          className="absolute inset-0"
          role="img"
          aria-label="노을 지는 동네를 달리는 3D 화면. 이동과 조작은 키보드 또는 화면 아래 버튼으로 한다"
        >
          <GameScene
            layout={layout}
            details={details}
            quality={getQualityPreset(quality)}
            input={input}
            stats={stats}
            reducedMotion={reducedMotion}
            questView={questView}
            talkView={talkView}
            clueView={clueView}
            combatView={combatView}
            summaryView={summaryView}
            dialogueView={dialogueView}
            districtView={districtView}
            timeOfDay={timeOfDay}
            photoFilter={photoFilter}
            photoPose={photoPose}
            appearance={appearance}
            dokebi={dokebi}
            metDokebi={metDokebi}
            companionParty={companionParty(
              dokebi,
              {
                defeatedTotal: summaryView.defeated,
                questCompleted: questView.firstQuestDone,
                bossDefeated: summaryView.bossDefeated,
              },
              metDokebi,
            )}
            discoveryView={discoveryView}
            vendingView={vendingView}
            bossView={bossView}
            contextView={contextView}
            photoMode={photoMode}
            resumeFrom={resumeFrom}
            onQuestAdvance={handleQuestAdvance}
            onRequestDowngrade={handleDowngrade}
          />
        </div>
      </SceneErrorBoundary>

      {/*
        화면 제목.
        
        낭독기 사용자는 제목으로 화면을 훑는다. 그런데 월드에는 제목이 하나도
        없고 도감·지도만 h2를 갖고 있었다 — h1 없이 h2가 떠 있으니 계층이
        끊기고, "여기가 어디인가"를 알 방법도 없었다.
        
        눈으로는 보이지 않는다(`sr-only`). 화면 위에 글자를 얹으면 월드를
        가리고, 이 정보는 이미 눈에 보이는 것들로 충분히 전달된다.
      */}
      <h1 className="sr-only">DokeV 월드</h1>
      {/* 시연 코스 안내 — `?see=demo`에서만. 다음에 무엇을 누를지가 화면 안에 있어야 눈이 화면을 떠나지 않는다 */}
      {scenario?.id === "demo" && <DemoGuide beats={demoRoute} />}
      <WorldHud
        stats={stats}
        questView={questView}
        talkView={talkView}
        scriptLine={currentLine(script)}
        discovery={discoveryView}
        nickname={nickname}
        foundClues={foundClues}
        combat={combatView}
        summary={summaryView}
        dialogue={dialogueView}
        district={districtView}
        vending={vendingView}
        boss={bossView}
        context={contextView}
        timeOfDayName={TIME_OF_DAY[timeOfDay].name}
        onCycleTimeOfDay={handleCycleTime}
        photoFilterName={photoFilterPreset(photoFilter).name}
        onCyclePhotoFilter={handleCycleFilter}
        photoPoseName={PHOTO_POSES[photoPose].name}
        onCyclePhotoPose={handleCyclePose}
        dokebiName={DOKEBI[dokebi].name}
        abilityName={DOKEBI[dokebi].abilityName}
        dokebiUnlockedCount={
          unlockedDokebi(
            {
              defeatedTotal: summaryView.defeated,
              questCompleted: questView.firstQuestDone,
              bossDefeated: summaryView.bossDefeated,
            },
            metDokebi,
          ).length
        }
        onCycleDokebi={handleCycleDokebi}
        dokebi={dokebi}
        onSelectDokebi={handleSelectDokebi}
        metDokebi={metDokebi}
        onRestart={handleRestart}
        input={input}
        quality={quality}
        reducedMotion={reducedMotion}
        showPerf={showPerf}
        photoMode={photoMode}
        recording={recording}
        captureNotice={captureNotice}
        onTogglePerf={togglePerf}
        onTogglePhoto={togglePhoto}
        onTakePhoto={() => void takePhoto()}
        onToggleClip={() => void toggleClip()}
        onExit={handleExit}
      />

      {downgradeNotice && (
        <DowngradeNotice level={downgradeNotice} onDismiss={() => setDowngradeNotice(null)} />
      )}
    </main>
  );
}
