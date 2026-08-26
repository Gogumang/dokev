/**
 * 씬이 주고받는 계약들.
 *
 * `GameScene.tsx`가 1,000줄을 넘어 파일 크기 규칙(800줄)을 어겼다. 타입은
 * 씬·리그·PlayClient가 모두 참조하므로 여기로 옮긴다 — 셋 중 어느 파일에
 * 두어도 나머지 둘이 그 파일을 import하게 된다.
 */

import type { CombatCues } from "@/game/systems/audio/combat";
import type { BossView } from "@/game/combat/bossSim";
import type { CombatLink } from "@/game/combat/Enemies";
import type { CompanionCommand, CompanionTarget } from "@/game/dokebi/companionMotion";
import type { DiscoveryView, DokebiId } from "@/game/dokebi/roster";
import type { EmoteState } from "@/game/player/emote";
import type { GrappleView } from "@/game/player/GrappleVisuals";
import type { PhotoFilterId } from "@/game/systems/photoFilter";
import type { PhotoPoseId } from "@/game/player/photoPose";
import type { QuestView } from "@/game/quest/questRunner";
import type { CityDetails } from "@/game/world/cityDetails";
import type { CityLayout } from "@/game/world/cityLayout";
import type { Aabb } from "@/game/player/locomotion";
import type { LocomotionMode } from "@/game/config/tuning";
import type { WeaponId } from "@/game/combat/weapons";
import type { DistrictId } from "@/game/world/districts";
import type { TimeOfDayId } from "@/game/world/timeOfDay";
import type { ContextLossView } from "@/game/systems/contextLoss";
import type { InputState } from "@/game/systems/input";
import type { QualityLevel, QualityPreset } from "@/game/systems/quality";

/**
 * 렌더 루프가 HUD에 넘기는 실측값.
 *
 * 매 프레임 React 상태를 갱신하지 않기 위해 가변 객체 하나를 공유하고,
 * HUD가 자기 주기로 읽어간다.
 */
export interface RuntimeStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /**
   * 드로우콜·삼각형을 후처리 쪽이 채우고 있는지.
   *
   * three는 `render()`마다 통계를 지운다. 후처리가 한 프레임에 네 번 부르므로
   * 프레임이 끝난 시점의 값은 **마지막 합성 패스 하나**뿐이다 — 도시를 눈앞에
   * 두고 「드로우콜 1」이 뜬다. 그래서 후처리가 켜져 있으면 그쪽이 씬 패스
   * 직후에 값을 채우고, 여기 표시로 PlayerRig가 덮어쓰지 않게 한다.
   */
  renderStatsOwned: boolean;
  /** JS 힙(MB). 미지원 브라우저에서는 0 */
  heapMb: number;
  speed: number;
  /*
   * 이동 방식. `string`이었는데 실제 값 집합으로 좁혔다 — 오타로 넣은 값이
   * 조용히 통과하면 소리와 자세가 각자 다른 것을 본다.
   */
  mode: LocomotionMode;
  grounded: boolean;
  /** 활강 중인지. 캐릭터 자세와 HUD가 읽는다 */
  gliding: boolean;
  /** 동료가 소환되어 있는지 · 지금 서 있는 구역 — 둘 다 사운드가 읽는다 */
  companionPresent: boolean;
  district: DistrictId;
  /** 전투 사건 누적 수. 사운드가 차이만큼 소리를 낸다 */
  combat: CombatCues;
  /** 휘두르기 경과 시간(초). 캐릭터가 공격 자세에 쓴다 */
  attackElapsed: number | null;
  /**
   * 지금 들고 있는 무기. 캐릭터 자세와 HUD가 읽는다.
   *
   * `attackElapsed`와 **짝**이다 — 경과 시간만 넘기면 그 시간이 어느 길이
   * 안에서의 값인지 받는 쪽이 알 수 없다.
   */
  weapon: WeaponId;
  /** 감정 표현 상태. 캐릭터가 자세를 뽑는 데 쓴다 */
  emote: EmoteState;
  /**
   * 쓰러져 있는지. GLB 캐릭터가 동작을 고르는 데 쓴다.
   *
   * 예전에는 `{ ...stats, downed }`로 스프레드해서 넘겼는데, **그 순간의
   * 사본이라 매 프레임 갱신되는 값이 굳었다** — React가 리렌더할 때만 동작이
   * 바뀐다. 그래서 이 객체 안에 넣고 참조를 그대로 넘긴다.
   */
  downed: boolean;
  x: number;
  z: number;
  facing: number;
  /** 화면이 보는 방향(rad). 몸이 아니라 눈이라 시점만 돌려도 바뀐다 — 지도가 이걸로 돈다 */
  viewYaw: number;
  /**
   * 이번 프레임에 착지했다면 그 충돌 속도(m/s), 아니면 0.
   * 캐릭터가 착지 스쿼시 연출에 쓴다 — 카메라 흔들림과 같은 신호를 공유한다.
   */
  landingImpact: number;
}

export interface SceneProps {
  layout: CityLayout;
  details: CityDetails;
  quality: QualityPreset;
  input: InputState;
  stats: RuntimeStats;
  reducedMotion: boolean;
  /** HUD가 읽는 퀘스트 표시 상태. 이 씬이 매 프레임 갱신한다 */
  questView: QuestView;
  /**
   * 주민에게 말을 건 결과. 군중이 매 프레임 갱신하고 HUD가 들여다본다.
   *
   * `nearby`는 「지금 누르면 걸린다」를 알린다 — 알려 주지 않으면 아무 데서나
   * 눌러 보다 안 되는 조작으로 여기게 된다.
   */
  talkView: { line: string | null; speaker: string; remaining: number; nearby: boolean };
  /**
   * 찾은 흔적의 id. 씬이 제자리에서 밀어 넣고 HUD가 들여다본다.
   *
   * 개수만으로는 지도가 **어느 자리가 남았는지** 알 수 없다.
   */
  clueView: { found: string[] };
  /**
   * 완주 결과에 쓰는 집계. 이 씬이 매 프레임 갱신한다.
   *
   * 퀘스트 실행기에 넣지 않은 이유: 실행기는 "목표를 달성했나"만 알면 되고,
   * 얼마나 빨랐는지는 표시용 통계다. 규칙과 통계를 섞으면 실행기가 비대해진다.
   */
  summaryView: {
    elapsedSeconds: number;
    maxSpeed: number;
    defeated: number;
    /**
     * 고물 대장을 눕혔는지. 네 번째 도깨비의 해금 조건이다.
     *
     * 처치 수와 같은 자리에서 같은 출처(`playerLink`)로 써 넣는다 — 둘이
     * 다른 프레임에 갱신되면 도감과 자리가 어긋난다.
     */
    bossDefeated: boolean;
  };
  /** 동료의 대사. HUD가 읽는다 */
  dialogueView: { line: string | null };
  /** 지금 구역. HUD가 진입 배너에 쓴다 */
  districtView: { id: DistrictId; name: string; subtitle: string };
  /** 그래픽 연결 상태. HUD가 안내에 쓴다 */
  contextView: ContextLossView;
  /**
   * 미니 보스 상태. HUD가 체력 막대에 쓴다.
   *
   * `distance`와 `phase`는 성능 패널이, `x`·`z`는 지도와 방향 화살표가 읽는다.
   * 보스가 다가오지 않는 것을 브라우저에서 40초간 보고도 원인을 못 찾은 적이
   * 있다 — 상태를 눈으로 볼 수 없으면 계측을 새로 붙이는 데만 한참이 걸린다.
   *
   * 모양을 여기 손으로 적어 두었다가 `BossView`에 칸이 늘어도 따라오지 않았다.
   * 정본(`bossSim`)을 그대로 가리킨다.
   */
  bossView: BossView;
  /**
   * 빛으로 여는 문. 씬이 매 프레임 갱신하고 HUD가 안내에 쓴다.
   *
   * 막혀 있는데 아무 안내가 없으면 그냥 벽으로 보인다 — 벽 앞에서는 아무도
   * 능력을 켜 보지 않으므로 이 기능이 있는 줄도 모른다.

  /** 자판기 상태. HUD가 안내와 남은 시간에 쓴다 */
  vendingView: { machineInReach: boolean; boostRemaining: number; drinks: number };
  /**
   * HUD가 읽는 전투 상태. 이 씬이 매 프레임 갱신한다.
   *
   * 지도 표식도 여기로 흘린다 — 적 좌표는 Enemies 안에만 있고 HUD는
   * 그 컴포넌트를 모른다.
   */
  combatView: {
    playerHp: number;
    playerDowned: boolean;
    enemyBlips: Float32Array;
    enemyBlipCount: number;
    companionX: number;
    companionZ: number;
    companionVisible: boolean;
    /**
     * 동료 능력을 지금 쓸 수 있는지.
     *
     * `canUseAbility`는 「HUD가 버튼 활성화에 쓴다」고 적힌 채 아무도 쓰지
     * 않고 있었다 — `E`를 눌러도 아무 일이 없는데 이유를 알 방법이 없었다.
     */
    companionAbilityReady: boolean;
    /**
     * 지금 동료 빛이 닿는 거리(m). 능력이 꺼져 있으면 0.
     *
     * 흔적을 드러내는 범위다 — 도감이 「주변에 숨은 흔적을 잠깐 빛나게
     * 한다」고 약속하는데 흔적은 월드에 그려지지도 않았다. 도깨비마다 목록을
     * 두지 않고 **빛이 닿는 거리**를 그대로 쓰면 넷의 소개가 저절로 참이 된다
     * (그을음은 빛이 줄어드는 능력이라 오히려 덜 드러난다).
     */
    companionLightRange: number;
  };
  /**
   * 포토 모드. 켜지면 **플레이어와 전투가 멈추고** 카메라만 자유롭게 돈다.
   *
   * 예전 주석은 「시뮬레이션을 멈춘다」고 단언했지만 실제로 멈추는 것은
   * 플레이어 이동뿐이었다 — 로봇과 대장은 계속 다가와 때렸다. 움직일 수도
   * 피할 수도 없는데 맞으니, 포즈를 고르는 동안 체력이 5에서 1이 됐다.
   *
   * 군중과 차량은 계속 움직인다. 배경까지 멈추면 사진이 정물이 된다.
   */
  photoMode: boolean;
  /** 시간대. 포토 모드에서 바꾼다 */
  timeOfDay: TimeOfDayId;
  /** 포토 모드 색보정. 포토 모드일 때만 그린다 */
  photoFilter: PhotoFilterId;
  /** 포토 모드 포즈. 포토 모드일 때만 적용한다 */
  photoPose: PhotoPoseId;
  /** 지금 데리고 다니는 도깨비 */
  dokebi: DokebiId;
  /** 캐릭터 외형 프리셋 id */
  appearance: string;
  /** 이미 만난 도깨비들. 만남 판정에서 제외한다 */
  metDokebi: readonly DokebiId[];
  /**
   * 함께 다니는 도깨비들. 고른 도깨비가 맨 앞이다.
   *
   * 씬이 직접 고르지 않는 이유: 해금 여부는 진행도(처치 수·퀘스트)를 알아야
   * 판단할 수 있고, 그 값은 HUD 쪽이 이미 들고 있다.
   */
  companionParty: readonly DokebiId[];
  /**
   * 만남 신호. 씬이 id를 넣으면 PlayClient가 저장하고 다시 null로 되돌린다.
   *
   * 씬은 저장을 모르고 PlayClient는 좌표를 모른다 — 둘 사이의 유일한 통로다.
   */
  discoveryView: DiscoveryView;
  /** 저장에서 이어할 지점. 없으면 처음부터 */
  resumeFrom: {
    questStepIndex: number;
    questCompleted: boolean;
    defeatedTotal: number;
    /** 이어서 할 여정의 id. 없으면 첫 여정 */
    questId?: string;
    /**
     * 고물 대장을 이미 눕힌 상태인지.
     *
     * 저장에서는 보스 여정 완료로 유도하고, 확인 지점에서는 곧바로 준다.
     * 두 경로가 같은 필드로 모여야 씬이 출처를 알 필요가 없다.
     */
    bossDefeated?: boolean;
    /** 이미 조사한 흔적. 이어받은 수에서 세기 시작한다 */
    foundClues?: string[];
  } | null;
  /** 단계가 바뀔 때만 부른다. 매 프레임 저장하면 localStorage가 병목이 된다 */
  onQuestAdvance: (
    stepIndex: number,
    completed: boolean,
    defeatedTotal: number,
    questId: string,
  ) => void;
  onRequestDowngrade: (next: QualityLevel) => void;
}

/**
 * PlayerRig가 쓰고 동료가 읽는 공유 객체.
 *
 * stats에는 위치가 없어서 따로 둔다. 값을 prop으로 내리면 매 프레임 리렌더가
 * 필요해지므로, 이 프로젝트의 다른 곳과 같은 방식으로 가변 객체를 공유한다.
 */
export interface PlayerLink extends CompanionTarget, CombatLink, CompanionCommand {
  /**
   * 전투가 끝난 뒤 동료가 남아 있는 여운(초).
   *
   * `CompanionCommand`가 아니라 여기 둔다 — 동료가 알아야 할 값이 아니라
   * **프레임 루프의 장부**다. 동료는 「지금 있어야 하나」(`summoned`)만 보면 된다.
   */
  summonLinger: number;
  position: { x: number; y: number; z: number };
  /**
   * 지금까지 조사한 흔적 수.
   *
   * 목록이 아니라 수만 올린다 — 여정도 지도도 「몇 개 남았나」만 알면 되고,
   * 어느 것을 찾았는지는 찾은 쪽(PlayerRig)이 들고 있으면 충분하다.
   */
  cluesFound: number;
  /** 맨 앞 동료가 능력을 쓸 수 있는지. HUD가 버튼 안내에 쓴다 */
  companionAbilityReady: boolean;
  /** 지금 동료 빛이 닿는 거리(m). 능력이 꺼져 있으면 0 */
  companionLightRange: number;
  /**
   * 대상 없이 눌린 상호작용. `interactionStep`이 세우고 **아는 쪽이 소비한다.**
   *
   * 지금은 부두 끝의 낚시가 유일한 소비자다.
   */
  interactPressed: boolean;
  /** 동료가 매 프레임 써 넣는 자기 위치. 미니맵이 읽는다 */
  companionX: number;
  companionZ: number;
  companionVisible: boolean;
}

export interface RigProps extends SceneProps {
  playerLink: PlayerLink;
  /**
   * 플레이어가 부딪히는 것들 — **건물 + 지금 닫혀 있는 문.**
   *
   * `layout.colliders`를 직접 보지 않는다. 문은 프레임마다 열리고 닫히는데
   * 도시 목록은 고정이라, 저쪽만 보면 문이 그림이 된다.
   */
  colliders: Aabb[];
  grappleView: GrappleView;
  /**
   * 가장 가까운 주민. 군중이 채우고 여기서 읽는다.
   *
   * 상호작용 키 하나로 주민과 간판을 모두 다루므로, 누가 반응할지는 둘을
   * 아는 이 한 곳이 정한다.
   */
  residentCandidate: { index: number; distanceSquared: number };
}
