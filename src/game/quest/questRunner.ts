/**
 * 퀘스트 실행기 — 순수 함수.
 *
 * PROJECT_PLAN 「기능 요구사항 · 퀘스트」: 퀘스트는 데이터로 정의하고, 조건·대화·보상·다음 단계가
 * 코드와 분리되어야 한다. 그래서 이 파일에는 **규칙만** 있고 내용은 없다.
 * 실제 퀘스트는 questContent.ts에 데이터로 있다.
 *
 * 이 분리를 지키는 이유: 콘텐츠가 늘 때마다 실행기를 고쳐야 한다면 퀘스트 하나
 * 추가하는 비용이 계속 커진다. 목표 종류를 새로 만들 때만 이 파일을 연다.
 */

import type { Vec3 } from "@/game/player/locomotion";

/**
 * 목표 종류.
 *
 * 판정에 필요한 값이 전부 QuestSignals에 있어야 한다 — 실행기가 월드를
 * 직접 들여다보면 분리가 깨진다.
 */
export type Objective =
  /** 특정 지점 반경 안으로 들어간다 */
  | { kind: "reach"; x: number; z: number; radius: number }
  /** 로봇을 n기 쓰러뜨린다 */
  | { kind: "defeat"; count: number }
  /** 일정 속도 이상으로 달린다 */
  | { kind: "reachSpeed"; speed: number }
  /** 활강을 일정 시간 유지한다 */
  | { kind: "glide"; seconds: number }
  /** 스케이트보드를 탄다 */
  | { kind: "board" }
  /**
   * 미니 보스 처치.
   *
   * 일반 처치(defeat)와 나누는 이유: 누적 수로 세면 지나가던 로봇을 잡아도
   * 보스를 쓰러뜨린 것이 된다.
   */
  | { kind: "defeatBoss" }
  /**
   * 흔적을 n개 조사한다.
   *
   * 처치와 나누는 이유: 흔적은 **찾아가서 살펴보는** 일이고, 지나가다 저절로
   * 채워지면 안 된다.
   */
  | { kind: "clue"; count: number };

export interface QuestStep {
  id: string;
  /** HUD의 "현재 목표"에 그대로 들어간다 */
  title: string;
  /** 어떻게 하는지 한 줄. 조작을 모르면 목표만으로는 막힌다 */
  hint: string;
  objective: Objective;
}

export interface Quest {
  id: string;
  title: string;
  steps: readonly QuestStep[];
  /** 전부 마쳤을 때 보여줄 문구 */
  completionTitle: string;
  completionHint: string;
}

/** 실행기가 판정에 쓰는 월드 상태. GameScene이 매 프레임 채운다 */
export interface QuestSignals {
  position: Vec3;
  /** 수평 속도(m/s) */
  speed: number;
  gliding: boolean;
  onBoard: boolean;
  /** 지금까지 쓰러뜨린 로봇 누적 수 */
  defeatedTotal: number;
  /** 미니 보스를 쓰러뜨린 적이 있는지 */
  bossDefeated: boolean;
  /** 지금까지 조사한 흔적 수 */
  cluesFound: number;
}

export interface QuestProgress {
  stepIndex: number;
  /** 현재 단계의 진행도 0~1 */
  ratio: number;
  /** 누적 값 — 활강 시간이나 처치 수처럼 쌓이는 목표에 쓴다 */
  accumulated: number;
  /** 이 단계를 시작할 때의 기준값. 처치 수처럼 절대값이 오는 목표에 필요하다 */
  baseline: number;
  completed: boolean;
}

export function createQuestProgress(signals: QuestSignals): QuestProgress {
  return {
    stepIndex: 0,
    ratio: 0,
    accumulated: 0,
    // 이전 단계에서 잡은 로봇이 다음 단계에 얹히면 안 된다.
    baseline: signals.defeatedTotal,
    completed: false,
  };
}

/** 현재 단계. 완료했으면 null */
export function currentStep(quest: Quest, progress: QuestProgress): QuestStep | null {
  if (progress.completed) return null;
  return quest.steps[progress.stepIndex] ?? null;
}

/**
 * 한 프레임의 목표 진행도를 구한다.
 *
 * 0~1을 돌려주고, 1이면 달성이다. 누적형 목표는 accumulated를 함께 갱신한다.
 */
function evaluate(
  objective: Objective,
  signals: QuestSignals,
  progress: QuestProgress,
  dt: number,
): { ratio: number; accumulated: number } {
  switch (objective.kind) {
    case "reach": {
      const distance = Math.hypot(
        signals.position.x - objective.x,
        signals.position.z - objective.z,
      );
      // 가까워질수록 차오르게 만들어 방향이 맞는지 알 수 있게 한다.
      const ratio = distance <= objective.radius ? 1 : Math.max(0, 1 - distance / 60);
      return { ratio, accumulated: progress.accumulated };
    }
    case "defeat": {
      const defeated = Math.max(0, signals.defeatedTotal - progress.baseline);
      return { ratio: Math.min(1, defeated / objective.count), accumulated: defeated };
    }
    case "reachSpeed": {
      return {
        ratio: Math.min(1, signals.speed / objective.speed),
        accumulated: progress.accumulated,
      };
    }
    case "glide": {
      // 활강을 놓으면 처음부터 다시다. 끊어서 채우면 "유지"가 아니다.
      const accumulated = signals.gliding ? progress.accumulated + dt : 0;
      return { ratio: Math.min(1, accumulated / objective.seconds), accumulated };
    }
    case "board": {
      return { ratio: signals.onBoard ? 1 : 0, accumulated: progress.accumulated };
    }

    case "defeatBoss": {
      return { ratio: signals.bossDefeated ? 1 : 0, accumulated: progress.accumulated };
    }
    case "clue": {
      /*
       * 조사한 수를 accumulated에 담는다 — 처치 단계와 같은 방식이다.
       * 화면의 계수기(「2 / 3」)가 이 값을 읽는다: 셋을 흩어 놓고 몇 개
       * 남았는지 알려 주지 않으면 도시를 통째로 다시 돌게 된다.
       */
      return {
        ratio: Math.min(1, signals.cluesFound / objective.count),
        accumulated: signals.cluesFound,
      };
    }
  }
}

/**
 * 퀘스트를 한 프레임 진행한다.
 *
 * 입력 상태를 바꾸지 않고 새 상태를 돌려준다 (coding-style: 불변성).
 * 한 프레임에 여러 단계를 건너뛰지 않는다 — 목표가 연달아 달성되어도
 * 한 단계씩 넘어가야 사용자가 무엇을 해냈는지 읽을 수 있다.
 */
export function stepQuest(
  quest: Quest,
  progress: QuestProgress,
  signals: QuestSignals,
  dt: number,
): QuestProgress {
  if (progress.completed) return progress;

  const step = quest.steps[progress.stepIndex];
  if (!step) return { ...progress, completed: true };

  const { ratio, accumulated } = evaluate(step.objective, signals, progress, dt);

  if (ratio < 1) {
    return { ...progress, ratio, accumulated };
  }

  const nextIndex = progress.stepIndex + 1;
  const done = nextIndex >= quest.steps.length;

  return {
    stepIndex: done ? progress.stepIndex : nextIndex,
    ratio: done ? 1 : 0,
    accumulated: 0,
    // 다음 단계의 기준값을 지금 값으로 옮긴다.
    baseline: signals.defeatedTotal,
    completed: done,
  };
}

/** HUD가 그대로 표시할 수 있는 형태로 정리한다. */
export interface QuestView {
  title: string;
  hint: string;
  /** 0~1 */
  ratio: number;
  /** "2 / 3" 같은 보조 표기. 없으면 빈 문자열 */
  counter: string;
  completed: boolean;
  /**
   * **첫 여정**을 끝까지 마쳤는지. `completed`와 다르다.
   *
   * `completed`는 지금 보고 있는 여정의 상태다. 첫 여정을 마치면 다음 여정으로
   * 넘어가면서 다시 거짓이 되는데, 해금 조건이 그 값을 읽고 있었다 —
   * **이미 만난 물비늘이 보스 여정을 시작하는 순간 사라졌다.**
   */
  firstQuestDone: boolean;
  /**
   * 도달 목표의 월드 좌표. 미니맵이 표식을 찍는다.
   *
   * 도달이 아닌 목표(처치·활강 등)에는 위치가 없다 — 없는 것을 (0,0)으로
   * 채우면 광장 한복판에 가짜 표식이 뜬다.
   */
  targetX?: number;
  targetZ?: number;
}

export function toQuestView(quest: Quest, progress: QuestProgress): QuestView {
  const step = currentStep(quest, progress);
  if (!step) {
    return {
      title: quest.completionTitle,
      hint: quest.completionHint,
      ratio: 1,
      counter: "",
      completed: true,
      // 실행기는 체인을 모른다 — 씬이 여정 id를 보고 덮어쓴다
      firstQuestDone: false,
    };
  }

  let counter = "";
  if (step.objective.kind === "defeat") {
    const done = Math.min(step.objective.count, Math.floor(progress.accumulated));
    counter = `${done} / ${step.objective.count}`;
  } else if (step.objective.kind === "clue") {
    const done = Math.min(step.objective.count, Math.floor(progress.accumulated));
    counter = `${done} / ${step.objective.count}`;
  } else if (step.objective.kind === "glide") {
    counter = `${progress.accumulated.toFixed(1)} / ${step.objective.seconds.toFixed(1)}초`;
  }

  return {
    title: step.title,
    hint: step.hint,
    ratio: progress.ratio,
    counter,
    completed: false,
    firstQuestDone: false,
    // 도달 목표일 때만 좌표를 넘긴다. 다른 목표에는 갈 곳이 없다.
    ...(step.objective.kind === "reach"
      ? { targetX: step.objective.x, targetZ: step.objective.z }
      : {}),
  };
}

/**
 * 여정 상태를 HUD가 들고 있는 객체에 옮긴다.
 *
 * `toQuestView`는 **새 객체**를 만든다. HUD는 처음 받은 객체를 계속 읽으므로
 * 그대로 갈아 끼울 수 없고, 칸을 하나씩 옮겨야 한다. 그 옮기는 다섯 줄이
 * 화면 안(프레임 루프)에 있을 때는 **한 줄을 지워도 아무도 몰랐다** — 제목이
 * 안 바뀌거나 진행 막대가 멈춰도 검사는 전부 통과했다.
 *
 * `firstQuestDone`은 **덮어쓰지 않고 켠 채로 둔다.** 지금 여정의 완료 여부와
 * 다르다: 첫 여정을 마치면 다음 여정으로 넘어가며 `completed`가 다시 거짓이
 * 되는데, 해금 조건이 그 값을 읽고 있었다 — 만난 도깨비가 도로 잠겼다.
 */
export function projectQuestView(
  view: QuestView,
  quest: Quest,
  progress: QuestProgress,
  /*
   * 첫 여정의 id. 실행기는 규칙만 알고 **어떤 여정이 있는지는 모른다** —
   * 여기서 `questContent`를 부르면 규칙과 내용이 섞인다.
   */
  firstQuestId: string,
): void {
  const next = toQuestView(quest, progress);
  view.title = next.title;
  view.hint = next.hint;
  view.ratio = next.ratio;
  view.counter = next.counter;
  view.completed = next.completed;
  view.firstQuestDone =
    quest.id !== firstQuestId || next.completed || view.firstQuestDone;
}
