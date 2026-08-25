/**
 * 월드 HUD가 받는 것들.
 *
 * 계약이 컴포넌트 파일 앞머리 여든 줄을 먹고 있었다 — 무엇을 그리는지 보려면
 * 매번 그 여든 줄을 지나야 했다. 여기 두면 **무엇이 화면으로 흘러 들어오는지**만
 * 한눈에 읽힌다.
 */

import type { ScriptLine } from "@/game/quest/script";
import type { DiscoveryView, DokebiId } from "@/game/dokebi/roster";
import type { ContextLossView } from "@/game/systems/contextLoss";
import type { BossView } from "@/game/combat/bossSim";
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

export interface WorldHudProps {
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
  /** 지금 보여 줄 대본 한 줄. 없으면 null */
  scriptLine: ScriptLine | null;
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
  /** 미니 보스 — 교전 중일 때만 체력 막대를 띄우고, 자리는 지도와 화살표가 쓴다 */
  boss: BossView;
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
