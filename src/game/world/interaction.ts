/**
 * 가까이 있는 것과 상호작용한다 — 주민에게 말 걸기, 간판 살펴보기.
 *
 * 키를 둘로 나누지 않는다. 대상마다 키가 다르면 무엇 앞에 서 있는지 먼저
 * 판단하고 나서 눌러야 하고, 그러면 아무것도 누르지 않게 된다. 하나를 누르면
 * **가장 가까운 것**이 반응한다.
 *
 * 어느 쪽이 반응할지 정하는 규칙을 여기 모은다. 후보를 모으는 일은 각자
 * 다르지만(주민은 매 프레임 움직이고, 간판은 서 있다) 고르는 규칙은 하나여야
 * 화면에 뜨는 줄이 왔다 갔다 하지 않는다.
 */

import { isWithinTalkRange, residentLine } from "@/game/world/residentTalk";

/**
 * 간판을 읽으면 나오는 말.
 *
 * 간판 자체에 글자를 그리지 않는다(아틀라스는 무늬만 만든다). 그래서 살펴보기가
 * 그 자리에서 「무슨 가게인지」를 만들어 준다 — 도시가 배경에서 동네가 된다.
 */
const SIGN_LINES: readonly string[] = [
  "「김밥천국」. 불은 켜져 있는데 사람은 안 보인다.",
  "「24시 편의점」. 유리문에 붙은 스티커가 반쯤 떨어졌다.",
  "「행복 공인중개사」. 매물 종이가 햇빛에 바랬다.",
  "「예쁨 미용실」. 삼색등이 아직 돈다.",
  "「노래연습장」. 계단 아래에서 낮은 음이 새어 나온다.",
  "「가마솥 치킨」. 기름 냄새가 골목 끝까지 간다.",
  "「온누리약국」. 초록 십자가 한쪽 획이 꺼져 있다.",
  "「PC방 게임존」. 지하로 내려가는 계단에 화살표가 붙어 있다.",
  "「크린 세탁소」. 유리문에 옷걸이가 빽빽하다.",
  "「엄마손 분식」. 유리에 김이 서려 있다.",
  "「왕대박 곱창」. 환풍기가 쉬지 않고 돈다.",
  "「우리동네 호프」. 간판 아래 의자가 층층이 쌓여 있다.",
  "「24시 순대국밥」. 솥에서 김이 계속 올라온다.",
  "「코인 빨래방」. 세탁기 창이 하나만 돌고 있다.",
  "「참존안경」. 진열장 안경들이 전부 같은 쪽을 본다.",
  "「태권도 체육관」. 2층 창문에 발차기 그림자가 스친다.",
];

/*
 * 간판 하나가 늘 같은 말을 하도록 고른다. 주민과 같은 이유다.
 *
 * **번호는 배열 순서가 아니라 그 간판이 무슨 가게인지(`cell`)다.** 예전에는
 * 순서로 골라서 치킨집 앞에서 「약국」이라고 읽어 줬다 — 보이는 것과 말하는
 * 것이 달랐다. 목록은 `SHOP_BRANDS`와 같은 순서·같은 길이여야 한다.
 *
 * 내보내지 않는다 — 무엇이 반응할지는 `chooseInteraction`이 정하고, 바깥에서
 * 직접 뽑아 쓰면 그 규칙을 우회하게 된다.
 */
function signLine(index: number): string {
  const safe = Math.abs(Math.floor(index));
  return SIGN_LINES[safe % SIGN_LINES.length];
}

export interface Candidate {
  index: number;
  distanceSquared: number;
}

export interface Interaction {
  /** 화면에 띄울 줄 */
  line: string;
  /** 누가 말하는지 — 주민인지 간판인지 */
  speaker: string;
}

/**
 * 지금 누르면 무엇이 반응하는가.
 *
 * 둘 다 사거리 안이면 가까운 쪽. 같으면 주민이 이긴다 — 사람이 서 있는데
 * 간판이 대답하면 이상하다.
 */
export function chooseInteraction(
  resident: Candidate | null,
  sign: Candidate | null,
): Interaction | null {
  const nearResident = resident && isWithinTalkRange(resident.distanceSquared) ? resident : null;
  const nearSign = sign && isWithinTalkRange(sign.distanceSquared) ? sign : null;

  if (nearResident && (!nearSign || nearResident.distanceSquared <= nearSign.distanceSquared)) {
    return { line: residentLine(nearResident.index), speaker: "주민" };
  }
  if (nearSign) return { line: signLine(nearSign.index), speaker: "간판" };
  return null;
}

/**
 * 가장 가까운 정적 대상.
 *
 * 간판은 움직이지 않지만 **플레이어가 움직이므로** 매 프레임 다시 잰다.
 * 거리 제곱만 비교한다 — 제곱근은 고르는 데 필요 없다.
 */
export function nearestStatic(
  /** `cell`은 그 자리가 **무엇인지**(간판이면 가게 종류). 없으면 배열 순서를 쓴다 */
  points: readonly { x: number; z: number; cell?: number }[],
  x: number,
  z: number,
): Candidate | null {
  let best: Candidate | null = null;
  for (let index = 0; index < points.length; index += 1) {
    const dx = points[index].x - x;
    const dz = points[index].z - z;
    const distanceSquared = dx * dx + dz * dz;
    if (!best || distanceSquared < best.distanceSquared) {
      best = { index: points[index].cell ?? index, distanceSquared };
    }
  }
  return best;
}
