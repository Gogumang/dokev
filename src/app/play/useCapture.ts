"use client";

/**
 * 사진과 클립 저장 배선.
 *
 * 브라우저 API를 만지는 부분은 `systems/capture.ts`에 있고, 여기는 그것을
 * 화면 상태(안내 문구, 녹화 표시)와 잇는다.
 *
 * 멈춤과 저장을 **한 길로** 모은다. 사용자가 눌렀을 때와 최대 길이에 닿았을
 * 때가 갈리면 자동 종료된 녹화만 저장이 빠지는 일이 생긴다.
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { Analytics } from "@/game/systems/analytics";
import {
  buildCaptureFilename,
  activeTone,
  canvasToPng,
  CLIP_MAX_SECONDS,
  downloadBlob,
  extensionForMime,
  startClipRecording,
  type ClipRecorder,
} from "@/game/systems/capture";

export interface CaptureInput {
  /** R3F가 이 안에 캔버스를 만든다. 직접 참조를 들고 있지 않으므로 찾아 쓴다 */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 저장 파일 이름에 들어갈 이름. 비어 있으면 넣지 않는다 */
  nickname: string;
  /** 이벤트 sink. 이름을 좁히면 호출부의 Analytics와 타입이 어긋난다 */
  analytics: Pick<Analytics, "track">;
  setCaptureNotice: (notice: string | null) => void;
  setRecording: (recording: boolean) => void;
}

export function useCapture({
  containerRef,
  nickname,
  analytics,
  setCaptureNotice,
  setRecording,
}: CaptureInput) {
  const recorder = useRef<ClipRecorder | null>(null);

  const findCanvas = useCallback(
    () => containerRef.current?.querySelector("canvas") ?? null,
    [containerRef],
  );

  const takePhoto = useCallback(async () => {
    const canvas = findCanvas();
    if (!canvas) return;
    // 화면에 걸린 톤을 그대로 읽어 넘긴다 — 고른 값을 두 곳에 적으면 갈라진다
    const blob = await canvasToPng(canvas, activeTone(canvas));
    if (!blob) {
      setCaptureNotice("사진을 만들지 못했습니다");
      return;
    }
    const name = buildCaptureFilename("photo", "png", new Date(), nickname);
    const saved = downloadBlob(blob, name);
    if (saved) analytics.track("photo_saved");
    setCaptureNotice(saved ? `${name} 저장됨` : "저장에 실패했습니다");
  }, [analytics, findCanvas, nickname, setCaptureNotice]);

  const stopAndSaveClip = useCallback(
    async (reason: "manual" | "limit") => {
      const active = recorder.current;
      if (!active) return;
      recorder.current = null;
      setRecording(false);

      const blob = await active.stop();
      if (!blob) {
        setCaptureNotice("클립을 만들지 못했습니다");
        return;
      }
      const name = buildCaptureFilename(
        "clip",
        extensionForMime(active.mimeType),
        new Date(),
        nickname,
      );
      const saved = downloadBlob(blob, name);
      if (saved) analytics.track("clip_saved", { mime: active.mimeType });
      if (!saved) {
        setCaptureNotice("저장에 실패했습니다");
        return;
      }
      setCaptureNotice(
        reason === "limit" ? `${CLIP_MAX_SECONDS}초까지 녹화하고 저장했습니다` : `${name} 저장됨`,
      );
    },
    [analytics, nickname, setCaptureNotice, setRecording],
  );

  const toggleClip = useCallback(async () => {
    // 녹화 중이면 멈추고 저장한다.
    if (recorder.current) {
      await stopAndSaveClip("manual");
      return;
    }

    const canvas = findCanvas();
    if (!canvas) return;
    // 사진과 같은 값을 넘긴다 — 화면·사진·클립이 한 곳에서 온다
    const started = startClipRecording(
      canvas,
      30,
      () => void stopAndSaveClip("limit"),
      activeTone(canvas),
    );
    if (!started) {
      // 클립은 보조 기능이다. 안 되면 사진만 쓰면 된다.
      setCaptureNotice("이 브라우저에서는 클립 녹화를 지원하지 않습니다");
      return;
    }
    recorder.current = started;
    setRecording(true);
    setCaptureNotice(`녹화 중 — 다시 누르면 저장 (최대 ${CLIP_MAX_SECONDS}초)`);
  }, [findCanvas, setCaptureNotice, setRecording, stopAndSaveClip]);

  /*
   * 언마운트 시 녹화가 남아 있으면 스트림을 정리한다.
   *
   * 녹화기를 들고 있는 쪽이 치우는 것이 맞다 — 화면 쪽에 두었더니 참조를
   * 의존성으로 요구받았고, 그건 「누가 수명을 책임지는가」가 흐려졌다는 신호다.
   */
  useEffect(() => {
    return () => {
      void recorder.current?.stop();
      recorder.current = null;
    };
  }, []);

  return { takePhoto, toggleClip };
}
