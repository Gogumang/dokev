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

import { HudPhotoMode } from "@/components/hud/HudPhotoMode";
import { HudTouchLayer } from "@/components/hud/HudTouchLayer";
import { SpeedLines } from "@/components/hud/SpeedLines";
import { useCoarsePointer } from "@/components/hud/useCoarsePointer";
import { useHudPanels } from "@/components/hud/useHudPanels";
import { HudBottomCenter } from "@/components/hud/HudBottomCenter";
import { HudBottomLeft } from "@/components/hud/HudBottomLeft";
import { HudSpeech } from "@/components/hud/HudSpeech";
import { HudTopCenter } from "@/components/hud/HudTopCenter";
import { HudTopRight } from "@/components/hud/HudTopRight";
import type { WorldHudProps } from "@/components/hud/worldHudProps";
export type { CombatView } from "@/components/hud/worldHudProps";

import { BossPointer } from "@/components/hud/BossHud";
import { CityMap } from "@/components/hud/CityMap";
import { QuestPanel } from "@/components/hud/StatusPanels";
import { ResultPanel } from "@/components/hud/ResultPanel";
import { CONTROL_CODES, keyLabel } from "@/game/systems/controls";
import { pendingClues } from "@/game/quest/clues";
import { ContextNotice } from "@/components/hud/ContextNotice";
import { pendingDiscoveries } from "@/game/dokebi/roster";

export function WorldHud(props: WorldHudProps) {
  const isTouch = useCoarsePointer();
  const { codexOpen, mapOpen, openCodex, openMap, closePanels } = useHudPanels();

  /*
   * 찾아가야 할 도깨비 목록. 지도가 표식을 찍는다.
   *
   * 진행도(처치 수·퀘스트)는 공유 객체라 리렌더를 일으키지 않는다. 대신
   * 해금 알림이 이미 같은 값을 폴링하고 있어, 만난 순간 metDokebi가 바뀌면
   * 여기까지 다시 계산된다.
   */
  const discoveries = pendingDiscoveries(
    {
      defeatedTotal: props.summary.defeated,
      questCompleted: props.questView.firstQuestDone,
      bossDefeated: props.summary.bossDefeated,
    },
    props.metDokebi,
  );

  /*
   * 포토 모드에서는 HUD를 거의 다 숨긴다 (DESIGN_GUIDE 「아이콘과 일러스트」의
   * UI 숨기기). 사진에 목표 문구와 속도계가 찍히면 쓸 수 없는 그림이 된다.
   */
  if (props.photoMode) return <HudPhotoMode hud={props} />;

  return (
    <>
      {!props.reducedMotion && <SpeedLines stats={props.stats} />}

      {/* 좌상단: 현재 목표 — DESIGN_GUIDE 「2.1 세계가 먼저, UI는 나중에」이 허용한 상시 노출 3종 중 하나 */}
      <QuestPanel questView={props.questView} />

      {isTouch && <HudTouchLayer hud={props} panels={{ codexOpen, mapOpen, openCodex, openMap }} />}

      {mapOpen && (
        <CityMap
          stats={props.stats}
          questView={props.questView}
          combat={props.combat}
          boss={props.boss}
          discoveries={discoveries}
          clues={pendingClues(props.foundClues)}
          onClose={closePanels}
        />
      )}

      <HudTopRight hud={props} codexOpen={codexOpen} onCloseCodex={closePanels} />
      <HudTopCenter hud={props} />
      {/* 대장 방향 화살표 — 뜨는 조건은 `bossPointer`가 정한다 */}
      <BossPointer stats={props.stats} boss={props.boss} reducedMotion={props.reducedMotion} />
      <HudBottomLeft hud={props} />
      <HudSpeech hud={props} talkKey={keyLabel(CONTROL_CODES.talk)} />
      <HudBottomCenter hud={props} talkKey={keyLabel(CONTROL_CODES.talk)} />
      {/*
        도감·지도를 열면 완주 화면을 비켜 준다.

        둘이 겹쳐 「최고 속도」와 「만난 도깨비」가 가려지는 것을 화면에서 봤다.
        **연 쪽이 이긴다** — 대화창은 사람이 방금 누른 것이고, 완주 화면은
        가만히 떠 있던 것이다.
      */}
      {!codexOpen && !mapOpen && (
        <ResultPanel
          questView={props.questView}
          summary={props.summary}
          met={props.metDokebi}
          nickname={props.nickname}
          onPhoto={props.onTogglePhoto}
          onRestart={props.onRestart}
        />
      )}
      {/*
        **맨 마지막에** 그린다. 이 프로젝트는 z-index를 쓰지 않고 DOM 순서로
        겹침을 정하는데, 중간에 두었더니 완주 화면이 그 위를 덮어 새로고침
        버튼이 가려졌다 — 게임이 죽었다는 소식은 무엇에도 가려지면 안 된다.
      */}
      <ContextNotice context={props.context} />
    </>
  );
}
