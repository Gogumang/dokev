"use client";

/**
 * 시작 화면.
 *
 * DESIGN_GUIDE 「내비게이션 규칙」에 따라 주 행동은 `동네로 들어가기` 하나로 유지하고,
 * 설정과 조작 안내는 접어 둔다. 배경은 3D가 아니라 CSS 그라디언트와 실루엣이다 —
 * 랜딩에서 three.js를 건드리는 순간 LCP 예산이 무너지기 때문이다.
 *
 * 여기서 정한 설정은 localStorage에 저장되어 월드가 읽어 간다.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { createSeededRandom } from "@/game/core/mathx";
import { APPEARANCE_ORDER, APPEARANCES } from "@/game/player/appearance";
import { createAnalytics } from "@/game/systems/analytics";
import { CONTROLS } from "@/game/systems/controls";
import {
  NICKNAME_MAX_LENGTH,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  type PlayerSettings,
  type QualityChoice,
  updateSettings,
} from "@/game/systems/settings";


const QUALITY_OPTIONS: Array<{ value: QualityChoice; label: string; hint: string }> = [
  { value: "auto", label: "자동", hint: "기기 성능을 확인해 정합니다" },
  { value: "low", label: "가벼움", hint: "그림자 없음, 가장 부드러움" },
  { value: "medium", label: "보통", hint: "균형" },
  { value: "high", label: "높음", hint: "그림자와 안티에일리어싱" },
];

/**
 * 도시 실루엣.
 *
 * 반복 그라디언트로 만들면 높이가 전부 같아 도시가 아니라 창살처럼 보인다.
 * 높이·폭이 제각각이어야 스카이라인으로 읽히므로 SVG 사각형으로 그린다.
 * 시드를 고정해 서버와 클라이언트가 같은 결과를 내도록 한다 — 다르면
 * 하이드레이션 불일치가 난다.
 */
function Skyline() {
  const shapes = useMemo(() => {
    const random = createSeededRandom(20260816);
    const rects: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
    const tones = ["#171223", "#1e1830", "#241d38"];
    const viewWidth = 1200;
    const viewHeight = 300;

    let x = -20;
    while (x < viewWidth + 20) {
      const width = 34 + random() * 62;
      const height = 70 + random() * 190;
      const fill = tones[Math.floor(random() * tones.length)];
      rects.push({ x, y: viewHeight - height, w: width, h: height, fill });

      // 옥상 물탱크와 안테나 — 한국 도시 실루엣의 특징적인 윤곽
      if (random() < 0.4) {
        const tankWidth = width * 0.26;
        rects.push({
          x: x + width * 0.2,
          y: viewHeight - height - 14,
          w: tankWidth,
          h: 14,
          fill,
        });
      }
      if (random() < 0.28) {
        rects.push({
          x: x + width * 0.68,
          y: viewHeight - height - 34,
          w: 2.5,
          h: 34,
          fill,
        });
      }

      // 창문 — 노을에 반사된 몇 칸만 켠다
      const cols = Math.max(1, Math.floor(width / 16));
      const rows = Math.max(1, Math.floor(height / 22));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (random() > 0.22) continue;
          rects.push({
            x: x + 6 + c * 16,
            y: viewHeight - height + 10 + r * 22,
            w: 6,
            h: 9,
            fill: "#f2b071",
          });
        }
      }

      x += width + 3 + random() * 9;
    }
    return rects;
  }, []);

  return (
    <svg
      className="absolute inset-x-0 bottom-0 w-full"
      style={{ height: "36vh" }}
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, index) => (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          fill={shape.fill}
          opacity={shape.fill === "#f2b071" ? 0.75 : 1}
        />
      ))}
    </svg>
  );
}

/**
 * 배경 — 노을 하늘과 도시 실루엣.
 *
 * 이미지 파일도, 3D도 쓰지 않는다. 그라디언트 두 겹과 반복 선형 그라디언트로
 * 만든 스카이라인이면 첫인상에 필요한 만큼은 충분하고, 전송 바이트는 0이다.
 */
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #2a1f3d 0%, #6b3f5c 38%, #c96a4f 68%, #f0a06a 100%)",
        }}
      />
      {/* 해 */}
      <div
        className="absolute rounded-full"
        style={{
          width: "38vmin",
          height: "38vmin",
          right: "12%",
          bottom: "18%",
          background: "radial-gradient(circle, #ffd9a8 0%, #ff9d5c 55%, rgba(255,157,92,0) 70%)",
          opacity: 0.85,
        }}
      />
      <Skyline />
      {/*
       * 하단 스크림.
       *
       * 실루엣 위에 본문과 버튼이 얹히므로 대비 보호 레이어가 필요하다
       * (DESIGN_GUIDE 「2.1 세계가 먼저, UI는 나중에」). 건물의 밝은 창문 위에서도 4.5:1이 유지되도록
       * 아래로 갈수록 확실히 어두워지게 한다.
       */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "46vh",
          background:
            "linear-gradient(180deg, rgba(20,16,28,0) 0%, rgba(20,16,28,0.55) 38%, rgba(20,16,28,0.92) 72%, #14101c 100%)",
        }}
      />
      {/* 본문 대비 확보용 — 텍스트가 어느 배경 위에서도 읽혀야 한다 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(10,7,16,0.82) 0%, rgba(10,7,16,0.55) 45%, rgba(10,7,16,0.12) 100%)",
        }}
      />
    </div>
  );
}

function PanelToggle({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className="rounded-[var(--radius-round)] border border-white/25 px-[var(--space-6)] text-base font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/10"
      style={{
        minHeight: "calc(var(--touch-min) * 1.35)",
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function ControlsPanel() {
  return (
    <section
      aria-label="조작법"
      className="hud-scrim overflow-x-auto rounded-[var(--radius-lg)] p-[var(--space-6)]"
    >
      <table className="w-full min-w-[30rem] border-collapse text-sm">
        <thead>
          <tr className="text-left text-[var(--color-text-secondary)]">
            <th scope="col" className="pb-2 font-medium">
              동작
            </th>
            <th scope="col" className="pb-2 font-medium">
              키보드 · 마우스
            </th>
            <th scope="col" className="pb-2 font-medium">
              터치
            </th>
          </tr>
        </thead>
        <tbody>
          {CONTROLS.map((row) => (
            <tr key={row.action} className="border-t border-white/10">
              <th scope="row" className="py-2 text-left font-semibold">
                {row.action}
              </th>
              <td className="py-2 text-[var(--color-text-secondary)]">{row.keyboard}</td>
              <td className="py-2 text-[var(--color-text-secondary)]">{row.touch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-[var(--space-4)]">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-[var(--color-text-secondary)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-[var(--radius-round)] border border-white/25 transition-colors checked:bg-[var(--color-action-primary)]"
        style={{ minWidth: "2.75rem" }}
      />
    </label>
  );
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: PlayerSettings;
  onChange: (patch: Partial<PlayerSettings>) => void;
}) {
  return (
    <section
      aria-label="설정"
      className="hud-scrim grid gap-[var(--space-6)] rounded-[var(--radius-lg)] p-[var(--space-6)]"
    >
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[var(--space-3)] text-sm font-semibold">캐릭터</legend>
        <div className="flex flex-wrap gap-[var(--space-2)]">
          {APPEARANCE_ORDER.map((id) => {
            const look = APPEARANCES[id];
            const chosen = settings.appearance === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ appearance: id })}
                aria-pressed={chosen}
                className="flex items-center gap-2 rounded-[var(--radius-round)] border border-white/25 px-[var(--space-4)] text-sm font-semibold"
                style={{
                  minHeight: "var(--touch-min)",
                  background: chosen ? "var(--color-action-primary)" : "transparent",
                  color: chosen ? "var(--color-text-inverse)" : "var(--color-text-primary)",
                }}
              >
                {/* 색 견본 — 이름만으로는 어떤 색인지 알 수 없다 */}
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 rounded-[var(--radius-round)] border border-white/40"
                  style={{ background: look.hoodie }}
                />
                {look.name}
              </button>
            );
          })}
        </div>

        {/*
          이름.
          
          비워 두어도 된다 — 이름을 요구하면 「시작」까지 한 걸음이 늘고,
          그 한 걸음에서 사람이 떠난다. 넣으면 완주 화면과 저장한 사진
          이름에 쓰인다.

          `maxLength`는 거들 뿐이고 실제 제한은 저장할 때 다시 건다 —
          붙여넣기와 IME는 이 속성을 지나칠 수 있다.
        */}
        <label className="mt-[var(--space-4)] block text-sm font-semibold" htmlFor="nickname">
          이름 (선택)
        </label>
        <input
          id="nickname"
          type="text"
          value={settings.nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(event) => onChange({ nickname: event.target.value })}
          placeholder="비워 두어도 됩니다"
          aria-describedby="nickname-help"
          className="mt-[var(--space-2)] w-full rounded-[var(--radius-md)] border border-white/25 bg-transparent px-[var(--space-3)] text-sm"
          style={{ minHeight: "var(--touch-min)" }}
        />
        <p id="nickname-help" className="m-0 mt-[var(--space-2)] text-xs text-[var(--color-text-secondary)]">
          이 브라우저에만 저장되고 어디로도 보내지 않습니다.
        </p>
      </fieldset>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[var(--space-3)] text-sm font-semibold">그래픽 품질</legend>
        <div className="flex flex-wrap gap-[var(--space-2)]">
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ quality: option.value })}
              aria-pressed={settings.quality === option.value}
              title={option.hint}
              className="rounded-[var(--radius-round)] border border-white/25 px-[var(--space-4)] text-sm font-semibold"
              style={{
                minHeight: "var(--touch-min)",
                background:
                  settings.quality === option.value ? "var(--color-action-primary)" : "transparent",
                color:
                  settings.quality === option.value
                    ? "var(--color-text-inverse)"
                    : "var(--color-text-primary)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-[var(--space-2)] mb-0 text-xs text-[var(--color-text-secondary)]">
          {QUALITY_OPTIONS.find((option) => option.value === settings.quality)?.hint}
        </p>
      </fieldset>

      <ToggleRow
        label="소리"
        description="배경음과 효과음을 재생합니다"
        checked={settings.sound}
        onChange={(value) => onChange({ sound: value })}
      />
      <ToggleRow
        label="모션 줄이기"
        description="카메라 흔들림과 속도선을 끕니다"
        checked={settings.reducedMotion}
        onChange={(value) => onChange({ reducedMotion: value })}
      />
    </section>
  );
}

export function TitleScreen() {
  /*
   * 퍼널의 시작점. 이 이벤트가 없으면 "랜딩을 본 사람 중 몇 명이 시작했나"를
   * 셀 수 없다 — 가장 먼저 알고 싶은 수치인데 비어 있었다.
   *
   * 효과 안에서 부르는 이유: 렌더 중에 부르면 React가 렌더를 두 번 할 때
   * 두 번 기록된다(세션당 1회 규칙이 막아 주지만 의도가 흐려진다).
   */
  useEffect(() => {
    createAnalytics().track("landing_view");
  }, []);

  // 서버에서는 기본값, 클라이언트에서는 저장된 값. React가 전환을 처리한다.
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  const [panel, setPanel] = useState<"none" | "settings" | "controls">("none");

  const update = useCallback((patch: Partial<PlayerSettings>) => {
    updateSettings(patch);
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Backdrop />

      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[72rem] flex-col justify-between gap-[var(--space-8)]"
        style={{
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
        }}
      >
        <header className="pt-[var(--space-8)]">
          <p className="m-0 text-xs font-semibold tracking-[0.32em] text-[var(--color-action-primary)]">
            BROWSER 3D ADVENTURE
          </p>
          <h1 className="mt-[var(--space-3)] text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.95] font-black tracking-tight">
            Doke
            <span className="text-[var(--color-brand-sunset)]">V</span>
          </h1>
          <p className="mt-[var(--space-4)] max-w-[42ch] text-lg text-[var(--color-text-secondary)]">
            노을 지는 동네를 달리고, 골목을 가로지르고, 숨어 있던 도깨비와 친구가 되는 브라우저
            어드벤처.
          </p>
        </header>

        <div className="flex flex-col gap-[var(--space-4)] pb-[var(--space-8)]">
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <Link
              href="/play"
              className="inline-flex items-center justify-center rounded-[var(--radius-round)] bg-[var(--color-action-primary)] px-[var(--space-8)] text-lg font-bold text-[var(--color-text-inverse)] no-underline shadow-[0_10px_40px_-12px_rgba(47,212,196,0.8)] transition-transform hover:scale-[1.02]"
              style={{ minHeight: "calc(var(--touch-min) * 1.35)" }}
            >
              동네로 들어가기
            </Link>

            <PanelToggle
              active={panel === "controls"}
              onClick={() => setPanel(panel === "controls" ? "none" : "controls")}
            >
              조작법
            </PanelToggle>
            <PanelToggle
              active={panel === "settings"}
              onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
            >
              설정
            </PanelToggle>
          </div>

          {/*
            저장 안내는 실제 동작과 정확히 맞춰야 한다.

            "진행 상황은 저장되지 않습니다"라고 적혀 있었는데 저장은 이미
            동작하고 있었다 — 여정 단계·처치 수·만난 도깨비·설정이 전부
            브라우저에 남는다. 반대로 위치와 체력은 남지 않아 다시 들어오면
            광장에서 시작한다. 어느 쪽이든 사실과 다르면 사람이 확인을 못 한다.
          */}
          <p className="m-0 text-sm text-[var(--color-text-secondary)]">
            설치와 로그인 없이 바로 시작합니다. 여정 진행과 만난 도깨비는 이 브라우저에 저장되고,
            서 있던 자리는 저장되지 않아 다시 들어오면 광장에서 시작합니다.
          </p>

          {panel === "controls" && <ControlsPanel />}
          {panel === "settings" && <SettingsPanel settings={settings} onChange={update} />}

          <footer className="mt-[var(--space-4)] text-xs leading-relaxed text-[var(--color-text-secondary)]">
            한국 설화와 현대 도시에서 출발한 독자 IP 창작물이며, 특정 상용 게임의 공식 서비스가
            아닙니다.
          </footer>
        </div>
      </div>
    </main>
  );
}
