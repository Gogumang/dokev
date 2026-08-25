"use client";

/**
 * 그래픽 연결 안내를 **잇는** 자리.
 *
 * 컨텍스트는 언제든 끊길 수 있고, 끊긴 뒤에도 이 안내만은 떠야 한다 — 3D 밖
 * (DOM)에 있어 컨텍스트가 없어도 보인다.
 */

import { useCallback } from "react";

import { ContextNotice as ContextNoticeView } from "@/components/hud/views/ContextNotice";
import { shallowEqual, useSampled } from "@/components/hud/useSampled";
import { contextMessage, type ContextLossView } from "@/game/systems/contextLoss";

const CONTEXT_MS = 400;

export function ContextNotice({ context }: { context: ContextLossView }) {
  const view = useSampled(
    () => ({ message: contextMessage(context), lost: context.state === "lost" }),
    CONTEXT_MS,
    shallowEqual,
  );
  const onReload = useCallback(() => window.location.reload(), []);

  return <ContextNoticeView message={view.message} lost={view.lost} onReload={onReload} />;
}
