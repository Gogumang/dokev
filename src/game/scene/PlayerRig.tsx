"use client";

/*
 * react-hooks/immutability 예외 — 이 파일에 한정한다.
 *
 * 이 규칙은 React Compiler가 렌더를 순수하다고 가정할 수 있게 지켜 준다. 그런데
 * 아래에서 일어나는 변경(카메라 행렬, 공유 stats 객체)은 전부 렌더 밖의 useFrame
 * 콜백에서 일어난다. 이 값들을 setState로 옮기면 초당 60회 리렌더가 발생해
 * PROJECT_PLAN 10절의 성능 예산을 지킬 수 없다. three.js/R3F의 표준 패턴이다.
 */
/* eslint-disable react-hooks/immutability */

/**
 * 3D 런타임 — 캔버스, 플레이어, 추적 카메라, 성능 계측.
 *
 * 이 파일의 핵심은 "속도 연동 카메라"다. 이동 코드를 바꾸지 않고 FOV·거리·시선
 * 선행·착지 흔들림만 속도에 연동해도 체감 속도가 크게 달라진다. TRAILER_FEATURE_
 * ANALYSIS 3.3절이 말하는 "이동 자체가 놀이"의 대부분이 여기서 만들어진다.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";

import {
  isVehicle,
  STATS_SAMPLE_SECONDS,
  CAMERA,
  DOWNGRADE_FPS_THRESHOLD,
  DOWNGRADE_SAMPLE_SECONDS,
  CAMERA_REDUCED,
  CARRIED_VEHICLE,
  RUN_CAMERA,
  GRAPPLE,
  LANDING_SHAKE,
  MAX_DELTA_SECONDS,
  PHOTO_CAMERA,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "@/game/config/tuning";
import {
  createLocomotionState,
  findGrappleTarget,
  horizontalSpeed,
  resolveMode,
  type LocomotionState,
  type MoveInput,
} from "@/game/player/locomotion";
import { projectMotionView } from "@/game/player/motionView";
import { stepPlayerOnGround } from "@/game/player/groundStep";
import {
  consumeGrapple,
  consumeJump,
  projectCommands,
  consumeLookDelta,
  consumeZoom,
} from "@/game/systems/input";
import { projectCompanionTarget, resetCompanionEffects } from "@/game/dokebi/companionMotion";
import {
  projectCharacterCues,
  projectCombatView,
  projectSummaryView,
  projectDistrictView,
  projectVendingView,
} from "@/game/scene/hudProjection";
import { consumeRespawn } from "@/game/combat/combatLink";
import { createFrameMetrics, recordFrameMetrics } from "@/game/scene/frameMetrics";
import { projectDiscovery } from "@/game/dokebi/roster";
import { createEmoteState, emoteCue, stepEmote, type EmoteState } from "@/game/player/emote";
import {
  createVendingState,
  drink,
  machineInReach,
  speedScale,
  stepVending,
  type VendingState,
} from "@/game/systems/vending";
import { stepLandingShake } from "@/game/scene/cameraRig";
import { recordLook, type LookState } from "@/game/scene/lookControl";
import { createCameraFrame, recordCameraFrame } from "@/game/scene/cameraFrame";
import {
  createFinisher,
  finisherIntensity,
  finisherTimeScale,
  stepFinisher,
} from "@/game/scene/finisher";
import type { RigProps } from "@/game/scene/sceneTypes";

/*
 * 타입은 sceneTypes가 갖고 있다. HUD 여러 곳이 예전부터 이 파일에서
 * RuntimeStats를 가져오고 있어 여기서 다시 내보낸다 — 임포트 경로를 한꺼번에
 * 바꾸는 것은 이 정리의 목적이 아니다.
 */
export type { RuntimeStats } from "@/game/scene/sceneTypes";
import { appearancePreset } from "@/game/player/appearance";
import { photoPosePreset } from "@/game/player/photoPose";
import {
  completionCue,
  createDialogueState,
  cueForStep,
  projectDialogue,
  createRemarkMemory,
  recordRemark,
  speak,
  stepDialogue,
  type DialogueState,
} from "@/game/quest/dialogue";
import { FIRST_RUN_QUEST, nextQuest, questById, QUEST_CHAIN } from "@/game/quest/questContent";
import { districtAt } from "@/game/world/districts";
import { clampStepIndex } from "@/game/systems/saveGame";
import {
  createQuestProgress,
  stepQuest,
  projectQuestView,
  type QuestProgress,
  type QuestSignals,
} from "@/game/quest/questRunner";
import { Character } from "@/game/player/Character";
import { CharacterModel } from "@/game/player/CharacterModel";
import { RiddenVehicle } from "@/game/player/RiddenVehicle";
import { UmbrellaGlider } from "@/game/player/UmbrellaGlider";
import { nearestStatic } from "@/game/world/interaction";
import { standInReach } from "@/game/world/vehicleStands";
import { consumeInteract, stepInteraction } from "@/game/scene/interactionStep";
import { projectGrappleView } from "@/game/player/GrappleVisuals";
import { surfaceHeight } from "@/game/world/sidewalks";
import { terrainHeight } from "@/game/world/terrain";
import { rideLimit, rideSurfaceHeight } from "@/game/world/waterRide";

export function PlayerRig({
  colliders,
  layout,
  details,
  quality,
  input,
  stats,
  reducedMotion,
  onRequestDowngrade,
  playerLink,
  grappleView,
  residentCandidate,
  talkView,
  clueView,
  questView,
  combatView,
  summaryView,
  dialogueView,
  districtView,
  vendingView,
  bossView,
  appearance,
  photoPose,
  metDokebi,
  discoveryView,
  photoMode,
  resumeFrom,
  onQuestAdvance,
}: RigProps) {
  const { camera, gl } = useThree();

  const bodyRef = useRef<THREE.Group>(null);

  const locomotion = useRef<LocomotionState>(createLocomotionState(layout.spawn));
  /*
   * 시점 상태 한 덩어리.
   *
   * yaw·pitch·포토 거리·마지막 조작 시각이 **같이 갱신되어야 맞는** 값들이라
   * ref 넷으로 흩어 두면 한 곳만 고쳐질 자리가 생긴다(`recordLook`).
   */
  const look = useRef<LookState>({
    yaw: 0,
    pitch: CAMERA.pitchStart,
    photoDistance: PHOTO_CAMERA.defaultDistance,
    sinceLookSeconds: RUN_CAMERA.lookGraceSeconds,
  }).current;
  /** 대장을 눕히는 순간의 슬로우 모션·얼굴 클로즈업 상태 */
  const finisher = useRef(createFinisher());
  /*
   * 카메라가 프레임을 넘어 들고 가는 것들 — 눅인 전투 압력, 현재 위치,
   * 시선 지점, 임시 벡터. 흩어 두면 「지금 그려진 자리」와 「원하는 자리」가
   * 각자 다른 파일에서 갱신된다.
   */
  const cameraFrame = useRef(createCameraFrame()).current;
  const shake = useRef(0);
  /*
   * 캐릭터를 얼마나 진하게 그릴지. 매 프레임 setState를 하지 않으려고
   * 공유 객체로 넘긴다 — 이 저장소의 규칙이다.
   *
   * `useRef`가 아니라 `useMemo`다. 렌더 중에 `ref.current`를 읽으면 React
   * 컴파일러가 막는다(「Cannot access refs during render」) — 이 저장소에서
   * 이미 두 번 겪었다. 값을 바꾸는 것은 프레임 루프이므로 ref일 이유가 없고,
   * **한 번 만들어 계속 쓰는 객체**면 충분하다.
   */
  const characterFade = useMemo(() => ({ value: 1 }), []);

  const questProgress = useRef<QuestProgress | null>(null);
  /** 만남 카메라 숨의 경과 시간. null이면 쉬고 있지 않다 */
  const discoveryPulse = useRef<number | null>(null);
  /** 보스의 예고를 처음 봤는지. 한 번만 알려 준다 */
  /** 동료가 무엇을 이미 말했는지. 규칙은 quest/dialogue.ts에 있다 */
  const remarks = useRef(createRemarkMemory());
  /*
   * 지금 진행 중인 여정. 완주하면 다음 여정으로 넘어간다 — 첫 여정을 마치고
   * 목표가 사라지면 도시가 그냥 넓기만 하다.
   */
  const quest = useRef(questById(resumeFrom?.questId ?? QUEST_CHAIN[0].id));
  const vending = useRef<VendingState>(createVendingState());
  const emote = useRef<EmoteState>(createEmoteState());
  const dialogue = useRef<DialogueState>(createDialogueState());
  /** 대사 선택용 카운터. 난수 대신 써서 재현 가능하게 한다 */
  const dialogueCounter = useRef(0);
  /*
   * 대사를 언제 할지 판단하려면 직전 상태를 알아야 한다.
   *
   * `start`·`downed`·`dismissed` 세 상황은 대사가 쓰여 있는데 **한 번도
   * 발화되지 않았다** — 부를 자리가 없었기 때문이다. 쓰고 잊은 것이 아니라
   * 연결을 잊은 것이라, 아무도 못 듣는 줄도 몰랐다.
   */
  const spokeStart = useRef(false);
  const wasSummoned = useRef(true);
  const wasDowned = useRef(false);
  /*
   * 성능 샘플링 누적기 셋. **함께 비워져야 맞는** 값이라 한 덩어리로 둔다 —
   * ref로 흩어 두었을 때는 하나만 안 비우면 fps가 첫 표본에 머물렀다.
   */
  const metrics = useRef(createFrameMetrics()).current;

  const tuning = reducedMotion ? { ...CAMERA, ...CAMERA_REDUCED } : CAMERA;

  /*
   * 그래플 지점 — 가로등 꼭대기.
   *
   * layout.props에서 기둥(tone 0, 높이 4 초과)만 골라 꼭대기 좌표로 바꾼다.
   * 전용 데이터를 새로 만들지 않는 이유는 이미 도시에 서 있는 물체를 거는 것이
   * 플레이어 눈에도 자연스럽기 때문이다.
   */
  /*
   * 살펴볼 수 있는 간판.
   *
   * 렌더 데이터를 그대로 쓴다 — 좌표를 두 번 계산하면 어긋난다(도로 좌표가
   * 그렇게 어긋난 적이 있다). 세로 간판은 벽에서 튀어나와 있어 서 있을 자리가
   * 없으므로 가로·입간판만 본다.
   */
  const signPoints = useMemo(
    () => details.signsHorizontal.map((sign) => ({ x: sign.x, z: sign.z, cell: sign.cell })),
    [details.signsHorizontal],
  );

  const grappleAnchors = useMemo(
    () =>
      // 배치가 「이것이 앵커다」라고 말해 준 것만 쓴다 (cityLayout.grappleAnchors 주석)
      layout.grappleAnchors.map((anchor) => ({
        x: anchor.x,
        /*
         * 걸 지점의 높이는 **그 자리의 지면 위**다.
         *
         * 평지 기준으로 두면 언덕 위 전봇대가 플레이어보다 낮게 계산되어
         * (`findGrappleTarget`이 `anchor.y <= position.y + 1`인 것을 버린다)
         * 오르막에서만 그래플이 안 걸린다 — 원인을 찾기 어려운 종류다.
         */
        y: terrainHeight(anchor.x, anchor.z) + anchor.height,
        z: anchor.z,
      })),
    [layout.grappleAnchors],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DELTA_SECONDS);

    /* ---------------- 마무리 연출 ---------------- */
    /*
     * **실시간 dt로 센다.** 느려진 시간으로 세면 자기가 늦춘 시간에 자기가
     * 갇혀 연출이 4.5배 길어진다.
     */
    finisher.current = stepFinisher(finisher.current, playerLink.bossDowns, dt, reducedMotion);
    const finish01 = finisherIntensity(finisher.current);
    /*
     * 시간 배율을 공유 링크에 적는다 — 전투·대장·캐릭터가 이 값을 읽는다.
     * 포토 모드의 「멈춤」과 연출의 「느림」이 같은 칸을 쓴다: 통로를 나누면
     * 둘이 겹칠 때 어느 쪽이 이기는지 아무도 모른다.
     */
    playerLink.timeScale = photoMode ? 0 : finisherTimeScale(finisher.current);
    // 플레이어 이동도 같은 시간을 산다 — 배경만 느려지면 연출이 아니라 렉이다
    const simDt = dt * playerLink.timeScale;

    /* ---------------- 시점 ---------------- */
    recordLook(
      look,
      {
        look: consumeLookDelta(input),
        zoom: consumeZoom(input),
        moveX: input.moveX,
        moveZ: input.moveZ,
        photoMode,
      },
      dt,
    );

    /* ---------------- 이동 ---------------- */
    const moveInput: MoveInput = {
      moveX: input.moveX,
      moveZ: input.moveZ,
      jump: consumeJump(input),
      jumpHeld: input.jumpHeld,
      grappleRequested: consumeGrapple(input),
      run: input.run,
      vehicle: input.vehicle,
      cameraYaw: look.yaw,
      speedScale: speedScale(vending.current),
    };

    /*
     * 포토 모드에서는 dt를 0으로 준다.
     *
     * 시뮬레이션을 아예 건너뛰지 않는 이유: 상태 구조가 그대로 유지되어야
     * 모드를 빠져나올 때 캐릭터가 튀지 않는다. 시간만 멈춘다.
     */
    /*
     * 부활 — 전투 쪽은 위치를 모르므로 신호만 보낸다.
     *
     * 이동 계산 앞에서 처리해야 이번 프레임부터 스폰 지점에서 움직인다.
     * 뒤에 두면 한 프레임 동안 죽은 자리에서 조작이 먹는다.
     */
    if (consumeRespawn(playerLink)) {
      locomotion.current = createLocomotionState(layout.spawn);
    }

    /*
     * 발밑 지면 높이.
     *
     * **이번 프레임 시작 위치**에서 잰다. 이동 뒤 위치로 재려면 계산을 두 번
     * 돌려야 하는데, 한 프레임(최대 1/30초) 어긋나는 것은 걸음 속도에서
     * 몇 cm이고 화면에서는 보이지 않는다.
     */
    // 지형이 아니라 **딛는 면**이다 — 도시 구역에는 16cm 올라온 인도가 깔려 있다
    const riding = isVehicle(stats.mode) ? stats.mode : null;
    const corrected = stepPlayerOnGround(locomotion.current, moveInput, simDt, {
      /*
       * 어느 자리든 같은 식으로 발밑을 잰다 — 이동 전과 이동 후를 두 번 잰다.
       * 두 곳에 손으로 적으면 한쪽만 고쳐질 자리가 하나 더 생긴다.
       */
      sampleGround: (x, z) =>
        rideSurfaceHeight(surfaceHeight(x, z), x, z, layout.halfExtent, riding),
      colliders,
      grappleAnchors,
      radius: PLAYER_RADIUS,
      halfExtent: rideLimit(layout.halfExtent, riding),
    });
    locomotion.current = corrected;

    const speed = horizontalSpeed(corrected.velocity);
    const mode = resolveMode(moveInput);

    if (bodyRef.current) {
      bodyRef.current.position.set(
        corrected.position.x,
        corrected.position.y + PLAYER_HEIGHT / 2,
        corrected.position.z,
      );
      bodyRef.current.rotation.y = corrected.facing;
    }

    /* ---------------- 그래플 표시 ---------------- */
    /*
     * 걸 수 있는 대상 미리보기는 **실제 발동과 같은 함수**로 구한다 — 표시와
     * 판정이 다른 규칙을 쓰면 「표시가 떴는데 안 걸리는」 상황이 생긴다.
     */
    const grapplePreview =
      corrected.grapple !== null || corrected.grappleCooldown > 0
        ? null
        : findGrappleTarget(corrected.position, corrected.facing, grappleAnchors);
    projectGrappleView(
      grappleView,
      corrected.grapple,
      corrected.position,
      PLAYER_HEIGHT * 0.75,
      grapplePreview,
      GRAPPLE.maxRange,
    );

    /* ---------------- 착지 충격 ---------------- */
    shake.current = stepLandingShake(
      shake.current,
      corrected.landingImpact,
      dt,
      reducedMotion,
      LANDING_SHAKE,
    );

    /* ---------------- 카메라 ---------------- */
    recordCameraFrame(camera, cameraFrame, look, {
      tuning,
      position: corrected.position,
      velocity: corrected.velocity,
      facing: corrected.facing,
      speed,
      mode: stats.mode,
      photoMode,
      finish01,
      shake: shake.current,
      colliders: layout.colliders,
      enemyBlips: playerLink.enemyBlips,
      enemyBlipCount: playerLink.enemyBlipCount,
      bossEngaged: bossView.engaged,
      characterFade,
      dt,
    });

    /* ---------------- 계측 ---------------- */
    /*
     * **실시간 dt**로 잰다. 슬로우 모션으로 줄인 값을 주면 fps가 거짓이 되고,
     * 연출이 걸릴 때마다 자동 강등이 발동한다.
     */
    const downgrade = recordFrameMetrics(metrics, stats, {
      rawDelta,
      sampleSeconds: STATS_SAMPLE_SECONDS,
      render: gl.info.render,
      quality: quality.level,
      fpsThreshold: DOWNGRADE_FPS_THRESHOLD,
      downgradeAfterSeconds: DOWNGRADE_SAMPLE_SECONDS,
    });
    if (downgrade) onRequestDowngrade(downgrade);

    projectMotionView(stats, corrected, speed, mode, Math.PI - look.yaw); // 카메라 yaw는 지도와 반대로 돈다
    /*
     * 동료가 말할 거리가 생겼는지 묻는다. 「언제 말하나」는 순수 규칙이라
     * `quest/dialogue.ts`가 들고 있고, 여기서는 결과만 흘려보낸다.
     */
    const remark = recordRemark(remarks.current, {
      bossTelegraph: bossView.telegraph,
      defeats: stats.combat.defeats,
    });
    if (remark) {
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, remark, dialogueCounter.current);
    }

    /*
     * 동료 능력 효과를 되돌린다. 동료들이 이 뒤에 각자 합쳐 넣는다 —
     * 되돌리는 곳이 없으면 능력이 한 번 걸린 뒤 영영 풀리지 않는다.
     */
    resetCompanionEffects(playerLink);

    stepInteraction({
      signCandidate: nearestStatic(signPoints, corrected.position.x, corrected.position.z),
      x: corrected.position.x,
      z: corrected.position.z,
      dt,
      input,
      talkView,
      clueView,
      playerLink,
      residentCandidate,
    });

    /* ---------------- 감정 표현 ---------------- */
    const wantsEmote = input.danceQueued;
    input.danceQueued = false;
    const emotingBefore = emote.current.elapsed !== null;
    emote.current = stepEmote(emote.current, dt, {
      requested: wantsEmote,
      speed,
      grounded: corrected.grounded,
    });
    projectCharacterCues(
      stats,
      emote.current,
      playerLink.attackElapsed,
      input.companionSummoned,
      playerLink.playerDowned,
      playerLink.weapon,
    );
    if (!emotingBefore && emote.current.elapsed !== null) {
      // 동료가 같이 신난다. 혼자 하면 감정 표현이 아니라 애니메이션 재생이다.
      dialogueCounter.current += 1;
      dialogue.current = speak(
        dialogue.current,
        emoteCue(emote.current.index),
        dialogueCounter.current,
      );
    }

    /* ---------------- 탈것 ---------------- */
    /*
     * 무엇을 탈지는 **곁에 무엇이 세워져 있느냐**가 정한다. 입력은 눌렸다는
     * 사실만 넘기고 결정은 여기서 한다 — 세상을 아는 쪽은 여기뿐이다.
     *
     * 거치대가 멀면 들고 다니는 스케이트보드를 꺼낸다. 그러지 않으면 빈 골목에서
     * 그 키가 아무 일도 안 하고, 조작표에 적힌 키가 거짓말이 된다.
     */
    if (input.vehicleQueued) {
      input.vehicleQueued = false;
      input.vehicle = input.vehicle
        ? null
        : (standInReach(details.vehicleStands, corrected.position.x, corrected.position.z) ??
          CARRIED_VEHICLE);
    }

    /* ---------------- 자판기 ---------------- */
    vending.current = stepVending(vending.current, dt);
    const machine = machineInReach(
      details.vendingMachines,
      corrected.position.x,
      corrected.position.z,
      vending.current,
    );
    const wantsDrink = input.drinkQueued;
    input.drinkQueued = false;
    if (wantsDrink && machine >= 0) {
      vending.current = drink(vending.current, machine);
      // 동료가 반응한다. 혼자 마시면 놀이가 아니라 회복 아이템이다.
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, "drink", dialogueCounter.current);
    }
    projectVendingView(
      vendingView,
      machine >= 0,
      vending.current.boostRemaining,
      vending.current.drinks,
    );

    /* ---------------- 동료가 말할 자리 ---------------- */
    if (!spokeStart.current) {
      spokeStart.current = true;
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, "start", dialogueCounter.current);
    }

    // 보낼 때만 말한다 — 부를 때는 나타나는 것 자체가 대답이다
    if (wasSummoned.current && !input.companionSummoned) {
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, "dismissed", dialogueCounter.current);
    }
    wasSummoned.current = input.companionSummoned;

    // 쓰러진 순간에만. 누워 있는 동안 계속 말하면 걱정이 아니라 잔소리가 된다
    if (!wasDowned.current && playerLink.playerDowned) {
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, "downed", dialogueCounter.current);
    }
    wasDowned.current = playerLink.playerDowned;

    /*
     * 도깨비와의 만남 — 이미 신호가 대기 중이면 건너뛴다. PlayClient가
     * 가져가기 전에 덮어쓰면 만남이 하나 사라진다.
     */
    const met = projectDiscovery(
      discoveryView,
      corrected.position.x,
      corrected.position.z,
      {
        defeatedTotal: playerLink.defeatedTotal,
        questCompleted: questView.firstQuestDone,
        bossDefeated: playerLink.bossDefeated,
      },
      metDokebi,
      // 자리에 서서 **손을 내밀어야** 만난다. 지나가기만 해서는 안 열린다
      consumeInteract(playerLink),
    );
    if (met) {
      // 카메라도 짧게 숨을 쉰다. 저감 모션이면 건너뛴다 — 시야각 변화가
      // 가장 먼저 불편해지는 종류의 연출이다.
      if (!reducedMotion) discoveryPulse.current = 0;
      // 만남을 목소리로도 알린다. 알림 한 장으로 끝나면 사건이 아니라 안내다.
      dialogueCounter.current += 1;
      dialogue.current = speak(dialogue.current, "discovered", dialogueCounter.current);
    }

    // 구역 — 좌표에서 매 프레임 역산한다. 나눗셈 두 번이라 캐싱할 이유가 없다.
    const district = districtAt(corrected.position.x, corrected.position.z);
    stats.district = district.id;
    projectDistrictView(districtView, district);

    projectCompanionTarget(
      playerLink,
      corrected.position,
      speed,
      corrected.facing,
      corrected.grounded,
    );
    // 입력을 전투·동료 쪽으로 넘긴다. 소비는 각자가 한다.
    projectCommands(playerLink, input, cameraFrame.combatEase, dt);
    // 전투 결과를 HUD 쪽 객체로 옮긴다. 객체를 교체하지 않고 필드만 쓴다.
    // 완주 결과 집계 — 완료된 뒤에는 시간을 더 세지 않는다.
    projectSummaryView(summaryView, playerLink, speed, dt, questView.completed);

    projectCombatView(combatView, playerLink);

    /* ---------------- 퀘스트 ---------------- */
    const signals: QuestSignals = {
      position: corrected.position,
      speed,
      gliding: corrected.gliding,
      onBoard: input.vehicle !== null,
      defeatedTotal: playerLink.defeatedTotal,
      bossDefeated: playerLink.bossDefeated,
      cluesFound: playerLink.cluesFound,
    };
    if (!questProgress.current) {
      const fresh = createQuestProgress(signals);
      questProgress.current = resumeFrom
        ? {
            ...fresh,
            // 콘텐츠가 줄었을 수 있으므로 범위를 다시 잘라 낸다.
            stepIndex: clampStepIndex(resumeFrom.questStepIndex, quest.current.steps.length),
            completed: resumeFrom.questCompleted,
          }
        : fresh;
    }

    const before = questProgress.current;
    questProgress.current = stepQuest(quest.current, before, signals, dt);

    /*
     * 한 여정을 마치면 다음 여정을 연다. 완주 화면은 마지막 여정에서만 뜬다 —
     * 중간 여정마다 결과 화면이 뜨면 흐름이 끊긴다.
     */
    if (questProgress.current.completed) {
      const following = nextQuest(quest.current.id);
      if (following) {
        quest.current = following;
        questProgress.current = createQuestProgress(signals);
      }
    }

    // 대사 — 단계가 바뀌는 순간에만 새로 띄운다.
    dialogue.current = stepDialogue(dialogue.current, dt);
    if (
      questProgress.current.stepIndex !== before.stepIndex ||
      questProgress.current.completed !== before.completed
    ) {
      const nextStep = quest.current.steps[questProgress.current.stepIndex];
      // 어느 여정을 마쳤는지에 따라 다른 말을 한다 — 보스는 다른 무게의 사건이다
      const cue = questProgress.current.completed
        ? completionCue(quest.current.id)
        : nextStep
          ? cueForStep(nextStep.id)
          : null;
      if (cue) {
        dialogueCounter.current += 1;
        dialogue.current = speak(dialogue.current, cue, dialogueCounter.current);
      }
    }
    projectDialogue(dialogueView, dialogue.current);

    if (
      questProgress.current.stepIndex !== before.stepIndex ||
      questProgress.current.completed !== before.completed
    ) {
      onQuestAdvance(
        questProgress.current.stepIndex,
        questProgress.current.completed,
        playerLink.defeatedTotal,
        quest.current.id,
      );
    }

    projectQuestView(questView, quest.current, questProgress.current, FIRST_RUN_QUEST.id);
  });

  return (
    <group ref={bodyRef}>
      {/*
        stats는 이 루프가 매 프레임 갱신하는 공유 객체다 — 캐릭터가 직접 읽는다.

        GLB를 받는 동안에는 절차적 캐릭터가 그대로 보인다. 캐릭터가 없으면
        게임이 성립하지 않으므로 대체물을 둔다.
      */}
      {/* 타고 있는 것. 캐릭터가 GLB든 대체물이든 발밑에 보여야 한다 */}
      <RiddenVehicle motion={stats} />
      <UmbrellaGlider motion={stats} reducedMotion={reducedMotion} />
      <CharacterModel
        motion={stats}
        fade={characterFade}
        fallback={
          <Character
            motion={stats}
            input={input}
            reducedMotion={reducedMotion}
            photoPose={photoMode ? photoPosePreset(photoPose) : null}
            appearance={appearancePreset(appearance)}
          />
        }
      />
    </group>
  );
}
