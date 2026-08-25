/**
 * 플레이어 설정의 저장과 복구.
 *
 * DESIGN_GUIDE 「5.6 모션」이 "브라우저 로컬 저장소에 설정과 임시 진행을 저장"을,
 * 312~313행이 "저장 실패 및 로컬 복구" 상태를 요구한다.
 *
 * 저장 포맷에 version을 둔 이유: 나중에 항목이 늘거나 의미가 바뀔 때 예전 값을
 * 그대로 읽으면 조용히 잘못된 설정으로 플레이하게 된다. 버전이 다르면 기본값으로
 * 되돌리고, 마이그레이션이 필요해지면 여기서 분기한다.
 */

import { DEFAULT_DOKEBI, DOKEBI_ORDER, type DokebiId } from "@/game/dokebi/roster";
import { APPEARANCE_ORDER, DEFAULT_APPEARANCE, type AppearanceId } from "@/game/player/appearance";
import { DEFAULT_PHOTO_POSE, PHOTO_POSE_ORDER, type PhotoPoseId } from "@/game/player/photoPose";
import {
  DEFAULT_PHOTO_FILTER,
  PHOTO_FILTER_ORDER,
  type PhotoFilterId,
} from "@/game/systems/photoFilter";
import { DEFAULT_TIME_OF_DAY, TIME_OF_DAY_ORDER, type TimeOfDayId } from "@/game/world/timeOfDay";
import { migrateStorageKey } from "@/game/systems/storageMigration";

export type QualityChoice = "auto" | "low" | "medium" | "high";

export interface PlayerSettings {
  version: number;
  sound: boolean;
  /** 사용자가 명시적으로 켠 저감 모션. OS 설정과는 OR로 합쳐 쓴다 */
  reducedMotion: boolean;
  quality: QualityChoice;
  /**
   * 시간대·색보정·포즈.
   *
   * 공들여 밤으로 맞춰 놓고 새로고침했더니 노을로 돌아와 있으면 다시
   * 맞춰야 한다. 취향은 남아야 한다.
   */
  timeOfDay: TimeOfDayId;
  photoFilter: PhotoFilterId;
  photoPose: PhotoPoseId;
  /** 지금 데리고 다니는 도깨비 */
  dokebi: DokebiId;
  /** 캐릭터 외형 프리셋 */
  appearance: AppearanceId;
  /**
   * 플레이어가 정한 이름. 비어 있으면 이름을 쓰지 않는다.
   *
   * 이 브라우저 안에만 남고 어디로도 보내지 않는다.
   */
  nickname: string;
  /**
   * 도시에서 실제로 만난 도깨비들.
   *
   * 해금 조건과 따로 저장한다 — 조건은 처치 수처럼 다시 계산할 수 있지만,
   * "그 자리에 갔다"는 사실은 어디에도 남지 않는다.
   */
  metDokebi: DokebiId[];
}

export const SETTINGS_STORAGE_KEY = "dokev.settings.v1";

/**
 * 이름이 바뀌기 전 키.
 *
 * 이 키에는 취향(소리·모션·품질)만이 아니라 **만난 도깨비**가 들어 있다 —
 * 그건 다시 계산할 수 없는 기록이다. 읽기 직전에 한 번 옮긴다.
 */
const LEGACY_SETTINGS_KEY = "doggabi.settings.v1";
const CURRENT_VERSION = 1;

export const DEFAULT_SETTINGS: PlayerSettings = {
  version: CURRENT_VERSION,
  sound: true,
  reducedMotion: false,
  quality: "auto",
  timeOfDay: DEFAULT_TIME_OF_DAY,
  photoFilter: DEFAULT_PHOTO_FILTER,
  photoPose: DEFAULT_PHOTO_POSE,
  dokebi: DEFAULT_DOKEBI,
  appearance: DEFAULT_APPEARANCE,
  nickname: "",
  metDokebi: [],
};

/*
 * 항목을 추가하면서 버전을 올리지 않았다.
 *
 * 필드 단위 검증이 이미 있으므로, 예전에 저장된 값에 새 키가 없으면 그 항목만
 * 기본값으로 채워진다. 버전을 올리면 이미 저장된 사운드·품질 설정까지 통째로
 * 초기화된다 — 항목이 늘어난 것뿐인데 사용자 설정을 지울 이유가 없다.
 * 의미가 **바뀌는** 변경일 때만 버전을 올린다.
 */

const QUALITY_CHOICES: readonly QualityChoice[] = ["auto", "low", "medium", "high"];

function isQualityChoice(value: unknown): value is QualityChoice {
  return typeof value === "string" && (QUALITY_CHOICES as readonly string[]).includes(value);
}

/** 이름의 최대 길이(자). 완주 화면 한 줄과 파일 이름에 들어가야 한다 */
export const NICKNAME_MAX_LENGTH = 12;

/**
 * 이름을 다듬는다.
 *
 * 사용자가 직접 넣는 유일한 자유 문자열이고, **파일 이름에도 들어간다.**
 * 그래서 경로 구분자·상위 경로·제어 문자를 통째로 막는다 — 다운로드 이름에
 * `../`가 들어가면 브라우저가 막아 주더라도 그건 우리 책임이 아니다.
 *
 * 남기는 것: 한글·영문·숫자·공백. 그 밖은 전부 버린다. 흉내 낼 수 있는
 * 문자를 늘릴수록 화면과 파일 이름에서 예상 밖의 일이 생긴다.
 */
export function sanitizeNickname(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[^\p{Script=Hangul}\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH);
}

/** 허용된 값 목록에 있는지. 콘솔로 넣은 임의 문자열이 그대로 렌더에 들어가면 안 된다 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * 저장된 설정을 읽는다.
 *
 * 외부에서 들어온 값이므로 신뢰하지 않는다 (security 규칙: 외부 입력은 경계에서
 * 검증). 사용자가 콘솔로 값을 바꿨거나 다른 버전이 쓴 값이 남아 있을 수 있다.
 * 필드 단위로 검사해 이상한 값만 기본값으로 되돌린다.
 */
export function loadSettings(): PlayerSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  // 이름이 바뀌기 전 설정을 한 번 옮긴다 — 만난 도깨비가 여기 들어 있다
  migrateStorageKey(LEGACY_SETTINGS_KEY, SETTINGS_STORAGE_KEY);

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    // 사파리 프라이빗 모드 등에서는 localStorage 접근 자체가 예외를 던진다.
    // 설정은 보조 데이터이므로 실패해도 기본값으로 계속 진행한다.
    return { ...DEFAULT_SETTINGS };
  }

  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };

    const candidate = parsed as Partial<PlayerSettings>;
    if (candidate.version !== CURRENT_VERSION) return { ...DEFAULT_SETTINGS };

    return {
      version: CURRENT_VERSION,
      sound: typeof candidate.sound === "boolean" ? candidate.sound : DEFAULT_SETTINGS.sound,
      reducedMotion:
        typeof candidate.reducedMotion === "boolean"
          ? candidate.reducedMotion
          : DEFAULT_SETTINGS.reducedMotion,
      quality: isQualityChoice(candidate.quality) ? candidate.quality : DEFAULT_SETTINGS.quality,
      timeOfDay: oneOf(candidate.timeOfDay, TIME_OF_DAY_ORDER, DEFAULT_TIME_OF_DAY),
      photoFilter: oneOf(candidate.photoFilter, PHOTO_FILTER_ORDER, DEFAULT_PHOTO_FILTER),
      photoPose: oneOf(candidate.photoPose, PHOTO_POSE_ORDER, DEFAULT_PHOTO_POSE),
      dokebi: oneOf(candidate.dokebi, DOKEBI_ORDER, DEFAULT_DOKEBI),
      appearance: oneOf(candidate.appearance, APPEARANCE_ORDER, DEFAULT_APPEARANCE),
      nickname: sanitizeNickname(candidate.nickname),
      /*
       * 모르는 id는 버린다. 배열이 아니면 통째로 비운다.
       *
       * 중복도 지운다 — 같은 도깨비가 두 번 들어 있으면 완주 화면의
       * 「만난 도깨비」가 분모를 넘어 **4 / 3** 같은 수를 보여 준다.
       * 지금 코드는 넣기 전에 확인하므로 생기지 않지만, 손으로 고친
       * 저장값은 그 확인을 거치지 않는다.
       */
      metDokebi: Array.isArray(candidate.metDokebi)
        ? ([
            ...new Set(
              candidate.metDokebi.filter((id) => (DOKEBI_ORDER as readonly string[]).includes(id)),
            ),
          ] as DokebiId[])
        : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * useSyncExternalStore용 어댑터.
 *
 * localStorage는 서버에 없으므로 "서버에서는 기본값, 클라이언트에서는 저장값"을
 * React가 알 수 있게 스냅샷을 나눠 준다. useEffect에서 setState로 덮어쓰는 방식과
 * 달리 렌더가 한 번 더 돌지 않고, 하이드레이션 불일치도 React가 처리한다.
 *
 * getSnapshot은 값이 바뀌지 않는 한 **같은 참조**를 돌려줘야 무한 렌더가 안 난다.
 * 그래서 캐시를 두고 갱신 시에만 새 객체를 만든다.
 */
let snapshot: PlayerSettings | null = null;
const listeners = new Set<() => void>();

export function subscribeSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getSettingsSnapshot(): PlayerSettings {
  if (!snapshot) snapshot = loadSettings();
  return snapshot;
}

/**
 * 서버 스냅샷.
 *
 * 여기만은 매번 새 객체를 만들면 안 된다. useSyncExternalStore는 이 값이
 * 안정적인 참조라고 가정하고, 호출마다 달라지면 무한 렌더로 이어진다.
 * 대신 얼려 두어 밖에서 바꾸지 못하게 한다 — loadSettings가 돌려주는 복사본과
 * 달리 이 객체는 프로세스 내내 공유되기 때문이다.
 */
const SERVER_SNAPSHOT: PlayerSettings = Object.freeze({ ...DEFAULT_SETTINGS });

export function getServerSettingsSnapshot(): PlayerSettings {
  return SERVER_SNAPSHOT;
}

/** 설정 일부를 바꾸고 저장한 뒤 구독자에게 알린다. */
export function updateSettings(patch: Partial<PlayerSettings>): boolean {
  /*
   * 이름은 여기서도 다듬는다. 읽을 때만 검사하면 저장된 값 자체가 이미
   * 이상해져 있고, 그 값이 파일 이름으로 나간다.
   */
  const safe =
    patch.nickname === undefined ? patch : { ...patch, nickname: sanitizeNickname(patch.nickname) };
  snapshot = { ...getSettingsSnapshot(), ...safe, version: CURRENT_VERSION };
  const wrote = saveSettings(snapshot);
  for (const listener of listeners) listener();
  return wrote;
}

/**
 * 설정을 저장한다. **성공했는지 돌려준다.**
 *
 * 실패해도 던지지 않는다 — 설정이 안 남는 것보다 플레이가 끊기는 쪽이 나쁘다.
 * 다만 **알릴지 말지는 부르는 쪽이 정한다.**
 *
 * 이 한 덩어리에 두 종류가 섞여 있기 때문이다. 소리·모션·외형은 다음에 다시
 * 고르면 되지만, **만난 도깨비와 이름은 모은 것**이다 — 게임이 「새 도깨비를
 * 만났다」고 축하해 놓고 다음에 오면 사라져 있으면 그건 잃은 것이다.
 */
export function saveSettings(settings: PlayerSettings): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, version: CURRENT_VERSION }),
    );
    return true;
  } catch {
    // 저장 용량 초과·프라이빗 모드. 게임은 계속 돈다.
    return false;
  }
}
