"use client";

/**
 * 화면 캡처 — 사진과 짧은 클립.
 *
 * TRAILER_FEATURE_ANALYSIS가 짚었듯 이 게임이 파는 감정은 **움직임**이다.
 * 정지 이미지 한 장으로는 전달되지 않으므로 사진과 함께 짧은 클립도 남긴다.
 *
 * 브라우저 API를 직접 만지는 부분과 순수한 판단(형식 고르기, 파일 이름 짓기)을
 * 나눠 둔다. 판단 쪽은 렌더러 없이 테스트할 수 있어야 한다.
 *
 * 저장은 전부 사용자의 로컬 다운로드다. 서버로 올리지 않는다 — 업로드를 넣는
 * 순간 용량 제한·만료·신고 처리가 따라오고, 그건 별도로 설계해야 한다.
 */

import { sanitizeNickname } from "@/game/systems/settings";

/* ------------------------------------------------------------------ *
 * 순수 부분
 * ------------------------------------------------------------------ */

/**
 * 클립 형식 후보 — 선호도 순.
 *
 * 사파리는 webm을 녹화하지 못하고 mp4만 된다. 크롬은 반대로 mp4 녹화 지원이
 * 늦었다. 그래서 하나를 고르지 않고 지원되는 첫 번째를 쓴다.
 */
export const CLIP_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** 후보 중 지원되는 첫 번째를 고른다. 없으면 null — 클립 기능만 꺼진다. */
export function pickClipMimeType(
  candidates: readonly string[],
  isSupported: (mime: string) => boolean,
): string | null {
  for (const candidate of candidates) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

/** mime에서 파일 확장자를 뽑는다. 파라미터(;codecs=...)는 버린다. */
export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "video/mp4") return "mp4";
  if (base === "video/webm") return "webm";
  if (base === "image/png") return "png";
  if (base === "image/jpeg") return "jpg";
  return "bin";
}

/**
 * 저장 파일 이름.
 *
 * 시각을 넣어 같은 세션에서 여러 장을 찍어도 덮어쓰지 않게 한다.
 * 콜론은 파일 이름에 쓸 수 없어 숫자만 이어 붙인다.
 */
export function buildCaptureFilename(
  prefix: string,
  extension: string,
  at: Date,
  /**
   * 플레이어가 정한 이름. 비어 있으면 넣지 않는다.
   *
   * **사용자 입력이 파일 이름에 들어가는 유일한 자리다.** 여기서 다시
   * 다듬는다 — 저장 경로를 거쳐 들어온 값이라도 그대로 믿지 않는다.
   */
  nickname = "",
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  // 공백은 파일 이름에서 다루기 번거롭다. 붙임표로 바꾼다
  const who = sanitizeNickname(nickname).replace(/ /g, "-");
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return who
    ? `dokev-${who}-${prefix}-${stamp}.${extension}`
    : `dokev-${prefix}-${stamp}.${extension}`;
}

/* ------------------------------------------------------------------ *
 * 브라우저 API 부분
 * ------------------------------------------------------------------ */

/** Blob을 사용자의 다운로드로 넘긴다. 실패해도 게임은 계속 돌아야 한다. */
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // 즉시 해제하면 사파리에서 다운로드가 시작되기 전에 URL이 죽는다.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * 캔버스를 PNG로 만든다.
 *
 * WebGL 캔버스는 `preserveDrawingBuffer`가 켜져 있어야 그린 뒤에도 픽셀이
 * 남는다. 꺼져 있으면 빈 이미지가 나온다 — Canvas 설정과 짝을 이루는 제약이다.
 */
export function canvasToPng(canvas: HTMLCanvasElement, tone?: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      /*
       * 톤(흑백·대비)은 씬 안에서 만들 수 없어 화면에 CSS `filter`로 건다.
       * 그대로 `toBlob`하면 **화면만 흑백이고 사진은 컬러**가 된다 — 2D
       * 캔버스에 같은 문자열을 걸고 한 번 옮겨 담아 둘을 맞춘다.
       *
       * 옮기다 실패하면 원본을 저장한다. 색이 다른 사진이라도 **사진이 없는
       * 것보다는 낫고**, 톤이 먹는지는 고르기 전에 이미 확인한다.
       */
      const source = tone ? (toned(canvas, tone) ?? canvas) : canvas;
      source.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

/**
 * 화면에 **실제로** 걸려 있는 톤을 읽는다.
 *
 * 고른 필터 id를 따로 넘기지 않는다. 넘기면 화면을 칠하는 값과 사진에 넣는
 * 값이 두 곳에 생기고, 한쪽만 고치는 날 둘이 갈라진다 — 이 프로젝트가 피하려는
 * 바로 그 사고다. **보이는 것을 그대로 읽으면** 갈라질 수가 없다.
 *
 * CSS 필터는 캔버스가 아니라 그것을 **감싼 요소**에 걸린다(R3F가 캔버스를 제 컨테이너
 * 안에 넣는다). 그래서 위로 올라가며 찾는데, **몇 단계까지**를 숫자로 박지 않는다 —
 * 래퍼가 하나 늘어나는 날 조용히 못 찾고 사진만 컬러가 된다.
 *
 * 대신 CSS가 실제로 하는 일을 그대로 한다: 조상에 걸린 필터는 **모두 겹쳐서**
 * 캔버스에 보인다. 그러니 `body`까지 올라가며 걸린 것을 전부 모아 안쪽부터
 * 이어 붙인다. HUD는 캔버스의 조상이 아니라 형제라 걸리지 않는다.
 */
export function activeTone(canvas: HTMLCanvasElement): string | undefined {
  const found: string[] = [];
  try {
    let node: HTMLElement | null = canvas;
    while (node && node !== document.body) {
      const value = window.getComputedStyle(node).filter;
      if (value && value !== "none") found.push(value);
      node = node.parentElement;
    }
  } catch {
    // 스타일을 못 읽는 것은 사진을 못 찍을 이유가 아니다
  }
  return found.length > 0 ? found.join(" ") : undefined;
}

interface Mirror {
  canvas: HTMLCanvasElement;
  stop(): void;
}

/**
 * 톤을 입혀 계속 따라 그리는 거울 캔버스. 클립 녹화가 이쪽을 뜬다.
 *
 * 만들 수 없으면 null이고, 그러면 원본을 녹화한다 — 톤이 빠진 클립이라도
 * **클립이 없는 것보다 낫다**(클립은 보조 기능이다).
 */
function mirrorCanvas(source: HTMLCanvasElement, tone: string): Mirror | null {
  if (typeof requestAnimationFrame === "undefined") return null;
  try {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext("2d");
    if (!ctx) return null;
    ctx.filter = tone;
    // 넣은 값이 남지 않으면 이 브라우저는 필터를 무시한다 — 원본을 녹화하게 둔다
    if (ctx.filter === "none" || ctx.filter === "") return null;

    let frame = 0;
    const draw = () => {
      /*
       * 창 크기가 바뀌면 캔버스도 바뀐다. 캔버스 크기를 바꾸면 2D 상태가
       * 초기화되어 `filter`가 날아가므로 **매 프레임 다시 건다** — 한 번만
       * 걸어 두면 크기가 바뀌는 순간 조용히 컬러로 돌아간다.
       */
      if (copy.width !== source.width || copy.height !== source.height) {
        copy.width = source.width;
        copy.height = source.height;
      }
      ctx.filter = tone;
      ctx.drawImage(source, 0, 0);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return { canvas: copy, stop: () => cancelAnimationFrame(frame) };
  } catch {
    return null;
  }
}

/** 톤을 입힌 사본. 만들 수 없으면 null — 부르는 쪽이 원본으로 되돌아간다 */
function toned(canvas: HTMLCanvasElement, tone: string): HTMLCanvasElement | null {
  try {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d");
    if (!ctx) return null;
    ctx.filter = tone;
    // 넣은 값이 남지 않으면 이 브라우저는 필터를 무시한다 — 원본을 쓰게 둔다
    if (ctx.filter === "none" || ctx.filter === "") return null;
    ctx.drawImage(canvas, 0, 0);
    return copy;
  } catch {
    return null;
  }
}

/**
 * 클립 최대 길이(초).
 *
 * 제한이 없으면 사용자가 멈추는 것을 잊었을 때 조각이 메모리에 무한정
 * 쌓인다. 1080p 30fps webm이 초당 2~5MB이므로 10분이면 기가 단위가 되고
 * 탭이 죽는다 — 저장 실패도 아니고 게임이 통째로 사라진다.
 *
 * 30초로 잡은 이유: 공유할 만한 장면은 대개 그보다 짧고, 길면 사용자가
 * 직접 잘라야 한다(이 게임에는 편집 기능이 없다).
 */
export const CLIP_MAX_SECONDS = 30;

export interface ClipRecorder {
  /** 녹화를 멈추고 결과 Blob을 돌려준다. 실패하면 null */
  stop(): Promise<Blob | null>;
  readonly mimeType: string;
}

/**
 * 캔버스 녹화를 시작한다.
 *
 * MediaRecorder가 없거나 지원 형식이 없으면 null을 돌려준다. 클립은 보조
 * 기능이므로 없으면 사진만 남기고 조용히 넘어간다 (coding-style: 보조 데이터).
 */
export function startClipRecording(
  canvas: HTMLCanvasElement,
  fps = 30,
  /** 최대 길이에 닿았을 때. 호출자가 저장을 마무리한다 */
  onLimit?: () => void,
  /** 화면에 걸린 톤. `activeTone`으로 읽어 넘긴다 */
  tone?: string,
): ClipRecorder | null {
  if (typeof MediaRecorder === "undefined") return null;

  const mimeType = pickClipMimeType(CLIP_MIME_CANDIDATES, (mime) =>
    MediaRecorder.isTypeSupported(mime),
  );
  if (!mimeType) return null;

  /*
   * `captureStream`은 **캔버스 픽셀만** 가져간다 — 조상 요소에 걸린 CSS
   * `filter`는 담기지 않는다. 그대로 두면 화면은 흑백인데 클립은 컬러로
   * 저장된다. 사진에서 막은 사고를 클립에 남길 수는 없다.
   *
   * 톤이 있을 때만 거울 캔버스를 하나 두고 그쪽을 녹화한다. 톤이 없으면
   * 원본에서 바로 뜬다 — 쓰지도 않을 그리기를 매 프레임 할 이유가 없다.
   */
  const mirror = tone ? mirrorCanvas(canvas, tone) : null;

  let stream: MediaStream;
  try {
    stream = (mirror?.canvas ?? canvas).captureStream(fps);
  } catch {
    mirror?.stop();
    return null;
  }

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    return null;
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  /*
   * 시간이 다하면 호출자에게 알린다. 여기서 직접 멈추지 않는 이유: 멈추는
   * 것만으로는 파일이 저장되지 않고, 저장은 호출자가 한다. 알림 없이 멈추면
   * 녹화한 것이 조용히 사라진다.
   */
  const limitTimer =
    typeof window === "undefined"
      ? null
      : window.setTimeout(() => onLimit?.(), CLIP_MAX_SECONDS * 1000);

  return {
    mimeType,
    stop() {
      if (limitTimer !== null) window.clearTimeout(limitTimer);
      /*
       * 어느 길로 끝나든 트랙을 놓는다.
       *
       * 이미 멈춘 녹화기(스스로 죽었거나 두 번 멈춘 경우)로 들어오면 곧바로
       * 반환하면서 **캔버스 캡처 스트림을 켜 둔 채로 두었다** — 화면은
       * 멀쩡한데 남은 세션 내내 프레임을 계속 퍼 간다.
       */
      const release = () => {
        for (const track of stream.getTracks()) track.stop();
        // 거울도 함께 놓는다 — 남겨 두면 남은 세션 내내 매 프레임 그린다
        mirror?.stop();
      };

      return new Promise((resolve) => {
        if (recorder.state === "inactive") {
          release();
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
          return;
        }
        recorder.onstop = () => {
          release();
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
        };
        try {
          recorder.stop();
        } catch {
          // 멈추다 던지면 onstop이 오지 않는다 — 여기서 놓지 않으면 영영 남는다
          release();
          resolve(null);
        }
      });
    },
  };
}
