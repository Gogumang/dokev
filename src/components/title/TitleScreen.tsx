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
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { StreetScene } from "@/components/title/StreetScene";
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
 * 배경 — 대낮 골목의 횡단보도 위에 얹은 대비 보호막.
 *
 * 장면은 `StreetScene`이 그린다. 여기서는 **글이 읽히게 하는 일만** 한다.
 *
 * 배경이 어두운 노을에서 환한 낮으로 바뀌면서 이 일이 반대가 됐다. 전에는
 * 밝은 창문 위에서 흰 글씨를 지키는 것이 문제였는데, 지금은 **하늘과 흰
 * 횡단보도** 위에서 지켜야 한다 — 훨씬 밝다. 그래서 왼쪽 기둥을 전보다
 * 짙게 깔았다(DESIGN_GUIDE 「2.1 세계가 먼저, UI는 나중에」).
 *
 * 오른쪽은 일부러 그대로 둔다. 거기에 아이와 도깨비가 서 있고, 그 자리까지
 * 덮으면 장면을 바꾼 뜻이 사라진다.
 */
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <StreetScene />
      {/*
       * 왼쪽 기둥 — 제목·본문·버튼이 전부 이 안에 있다. 오른쪽으로 갈수록
       * 빠르게 걷혀 장면이 드러난다.
       */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(9,7,14,0.45) 0%, rgba(9,7,14,0.22) 24%, rgba(9,7,14,0) 46%)",
        }}
      />
      {/*
       * 하단 띠. 안내 문구와 고지가 화면 아래를 가로지르는데, 그 자리 바닥은
       * 밝은 아스팔트와 흰 횡단보도다 — 띠가 없으면 4.5:1이 안 나온다.
       */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "20vh",
          background:
            "linear-gradient(180deg, rgba(9,7,14,0) 0%, rgba(9,7,14,0.34) 40%, rgba(9,7,14,0.82) 100%)",
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
          <h1 className="mt-[var(--space-3)] text-[clamp(3rem,10vw,6.5rem)] leading-[0.95] font-black tracking-tight">
            Doke
            <span className="text-[var(--color-brand-sunset)]">V</span>
          </h1>
        </header>

        <div className="flex flex-col gap-[var(--space-4)] pb-[var(--space-8)]">
          {/*
            주 행동은 하나다.

            전에는 「동네로 들어가기」·「조작법」·「설정」 셋이 같은 크기로 나란히
            서 있었다. 셋 다 눌러도 되는 것처럼 보이면 **무엇을 먼저 눌러야 하는지
            화면이 말해 주지 않는다.** 시작 버튼만 크게 두고 나머지는 작은 글로
            내린다 — 지우지는 않는다. 품질·닉네임·외형이 설정 안에 있어서,
            없애면 들어가기 전에 정할 방법이 사라진다.
          */}
          <Link
            href="/play"
            className="inline-flex w-fit items-center justify-center rounded-[var(--radius-round)] bg-[var(--color-action-primary)] px-[var(--space-10)] text-2xl font-black tracking-wide text-[var(--color-text-inverse)] no-underline shadow-[0_14px_50px_-10px_rgba(47,212,196,0.85)] transition-transform hover:scale-[1.03]"
            style={{ minHeight: "calc(var(--touch-min) * 1.6)" }}
          >
            동네로 들어가기
          </Link>

          <div className="flex flex-wrap items-center gap-[var(--space-4)]">
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

          {panel === "controls" && <ControlsPanel />}
          {panel === "settings" && <SettingsPanel settings={settings} onChange={update} />}

          {/*
            저장 안내는 실제 동작과 정확히 맞춰야 한다. "저장되지 않습니다"라고
            적혀 있던 적이 있는데 저장은 이미 동작하고 있었다 — 여정과 만난
            도깨비는 남고 서 있던 자리만 안 남는다.
          */}
          <footer className="mt-[var(--space-2)] text-xs leading-relaxed text-[var(--color-text-secondary)]">
            설치·로그인 없이 시작합니다. 여정과 만난 도깨비는 이 브라우저에 저장되고, 서 있던
            자리는 저장되지 않아 다시 들어오면 광장에서 시작합니다.
            <br />
            한국 설화와 현대 도시에서 출발한 독자 IP 창작물이며, 특정 상용 게임의 공식 서비스가
            아닙니다.
          </footer>
        </div>
      </div>
    </main>
  );
}
