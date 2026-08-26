#!/usr/bin/env node
/**
 * 시연 영상을 **프레임 단위로** 뽑는다.
 *
 * 화면 녹화가 아니다. 「한 프레임 진행해라 → 그 그림을 가져가라」를 번갈아
 * 하므로, 한 장에 10초가 걸려도 결과물은 정확히 60fps다. 실시간 녹화는
 * 프레임이 한 번 떨어지면 그게 그대로 영상에 남는다.
 *
 * 의존성을 안 늘린다. Node 22에 WebSocket이 들어 있어 크롬과 CDP로 직접
 * 말할 수 있다 — 촬영 도구 하나 때문에 브라우저 자동화 패키지와 그 브라우저
 * 200MB를 저장소에 들일 이유가 없다.
 *
 *   pnpm dev                      # 다른 창에서 띄워 둔다
 *   node scripts/render-reel.mjs  # 프레임을 뽑고 ffmpeg으로 붙인다
 *
 * 옵션:
 *   --music <파일>   붙일 음악 (Suno 등)
 *   --music-start <초> 음악의 이 지점부터 (후렴에 맞출 때)
 *   --full           하이라이트로 자르지 않고 코스 전체
 *   --out <파일>     결과 영상 (기본 demo.mp4)
 *   --width/--height 해상도 (기본 1280×720)
 *   --port <번호>    개발 서버 포트 (기본 3112)
 *   --seconds <초>   앞부분만 뽑는다 (손보는 동안)
 *   --keep-frames    프레임 PNG를 지우지 않는다
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 영상에 넣을 구간(초). 코스 90초에서 **하이라이트만** 골라 1분 안으로 줄인다.
 *
 * 자리는 `demoRoute`의 장면 경계에서 가져왔다 — 구간 안에서 자르면 문장
 * 중간에서 끊긴 것처럼 보인다. 이어 붙이면 하드컷이 되는데, 시연 영상에서는
 * 그게 오히려 맞다: 90초를 한 번에 달리면 이동하는 시간이 절반이다.
 *
 * **밖의 프레임은 화면을 안 찍는다.** 세계는 계속 돌린다(안 돌리면 다음
 * 구간의 자리가 안 맞는다) — 느린 것은 스크린샷 쪽이라 이것만으로 렌더가
 * 40% 짧아진다.
 */
const HIGHLIGHTS = [
  [0, 6], //  광장에서 달려 나간다
  [20, 28], //  놀이터 — 아이들 사이에서 춤
  [30, 38], //  그래플로 전깃줄에 걸려 날고 활강
  [48, 55], //  바다 — 제트스키
  [56, 65], //  로봇 무리와 전투
  [72, 82], //  고물 대장
  [82, 90], //  마무리 연출 — 슬로모션 클로즈업
];

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9333;

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const opts = {
  port: arg("port", "3112"),
  width: Number(arg("width", "1280")),
  height: Number(arg("height", "720")),
  music: arg("music", null),
  out: arg("out", "demo.mp4"),
  keepFrames: has("keep-frames"),
  /* 앞부분만 뽑아 본다. 96초 전체는 소프트웨어 렌더러에서 20분이 넘어 손볼 수가 없다 */
  seconds: Number(arg("seconds", "0")),
  /** 하이라이트로 자르지 않고 코스 전체를 뽑는다 */
  full: has("full"),
  /** 음악의 이 지점부터 쓴다(초). 후렴에 맞추려면 여기를 옮긴다 */
  musicStart: arg("music-start", "0"),
};

const frameDir = join(tmpdir(), "dokev-reel-frames");

/* ── CDP: 요청 하나에 답 하나. id로 짝을 맞춘다 ── */
function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", (e) => reject(new Error(`크롬에 붙지 못했다: ${e.message}`)));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });

  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 페이지에서 식을 하나 돌리고 값을 받아 온다 */
async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`페이지에서 터졌다: ${result.exceptionDetails.text}`);
  }
  return result.result.value;
}

async function main() {
  const url = `http://localhost:${opts.port}/play?see=demo&reel=1`;

  /* 개발 서버가 떠 있는지 먼저 본다 — 없으면 크롬만 띄우고 빈 화면을 찍는다 */
  try {
    await fetch(`http://localhost:${opts.port}/play`);
  } catch {
    console.error(`개발 서버가 없다. 다른 창에서 \`pnpm dev\`를 띄우고 다시 실행해라.`);
    process.exit(1);
  }

  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  console.log(`크롬을 띄운다 — ${opts.width}×${opts.height}`);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--window-size=${opts.width},${opts.height}`,
      // 소프트웨어 렌더러. 느리지만 오프라인이라 상관없고, 기기마다 같은 그림이 나온다
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      `--user-data-dir=${join(tmpdir(), "dokev-reel-profile")}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  /* 디버깅 포트가 열릴 때까지 기다린다 */
  let targets = null;
  for (let tries = 0; tries < 60 && !targets?.some((one) => one.type === "page"); tries += 1) {
    await sleep(250);
    try {
      targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    } catch {
      /* 아직 안 열렸다 */
    }
  }
  /*
   * **페이지 타깃만 고른다.** `/json/list`의 첫 항목이 늘 페이지는 아니다 —
   * 확장이나 서비스 워커가 앞에 올 수 있고, 그러면 붙기는 붙는데 `Page.navigate`가
   * 아무 데도 안 가서 「손잡이가 안 생겼다」로만 보인다.
   */
  const page = targets?.find((one) => one.type === "page");
  if (!page) throw new Error(`크롬에 페이지 타깃이 없다 (${targets?.length ?? 0}개 발견)`);

  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  /*
   * 뷰포트를 **직접** 잡는다. `--window-size`만 주면 창 장식이 빠져 실제
   * 그림이 작아진다 — 640×360을 시켰는데 640×288이 나왔다. 여기서 잡으면
   * 기기와 크롬 버전에 상관없이 정확히 그 크기다.
   */
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: opts.width,
    height: opts.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log(`여는 중 — ${url}`);
  await cdp.send("Page.navigate", { url });

  /*
   * 손잡이가 생길 때까지 기다린다. 셰이더를 컴파일하고 GLB를 받아야 해서
   * 소프트웨어 렌더러에서는 한참 걸린다.
   */
  const HANDLE = "window.__dokevReel";
  let total = 0;
  for (let tries = 0; tries < 240 && !total; tries += 1) {
    await sleep(500);
    total = (await evaluate(cdp, `${HANDLE} ? ${HANDLE}.total : 0`)) || 0;
  }
  if (!total) {
    const seen = await evaluate(cdp, "document.body.innerText.slice(0, 200)");
    throw new Error(
      `촬영 손잡이가 안 생겼다 — \`?reel=1\`이 개발 빌드인지 확인해라.\n화면에 있던 것: ${seen}`,
    );
  }

  const capped = opts.seconds > 0 ? Math.min(opts.seconds, total) : total;
  const windows = opts.full ? [[0, capped]] : HIGHLIGHTS.filter(([from]) => from < capped);
  const kept = windows.reduce((sum, [from, to]) => sum + (Math.min(to, capped) - from), 0);
  const steps = Math.round(capped * 60);
  const shots = Math.round(kept * 60);
  console.log(`세계를 ${capped}초 돌리고 그중 ${kept}초(${shots}장)를 찍는다`);

  const inWindow = (at) => windows.some(([from, to]) => at >= from && at < Math.min(to, capped));

  const started = Date.now();
  let saved = 0;
  for (let i = 0; i < steps; i += 1) {
    /* 세계는 늘 돌린다 — 건너뛰면 다음 구간에서 캐릭터가 엉뚱한 자리에 있다 */
    const at = await evaluate(cdp, `${HANDLE}.step()`);
    if (!inWindow(at)) continue;

    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    writeFileSync(
      join(frameDir, `${String(saved).padStart(5, "0")}.jpg`),
      Buffer.from(shot.data, "base64"),
    );
    saved += 1;

    if (saved % 120 === 0 || saved === shots) {
      const done = saved / shots;
      const left = ((Date.now() - started) / done) * (1 - done);
      process.stdout.write(
        `\r  ${String(Math.round(done * 100)).padStart(3)}%  ${saved}/${shots}장  남은 시간 ${Math.round(left / 1000)}초   `,
      );
    }
  }
  process.stdout.write("\n");

  cdp.close();
  chrome.kill();

  console.log("ffmpeg으로 붙인다");
  const ff = [
    "-y",
    "-framerate", "60",
    "-i", join(frameDir, "%05d.jpg"),
    ...(opts.music ? ["-ss", opts.musicStart, "-i", opts.music] : []),
    /*
     * **밝기 범위를 명시한다.** JPEG 프레임은 풀레인지(0~255)라, 그냥 두면
     * `yuvj420p`/`pc`로 태깅돼 나온다 — 편집기나 일부 플레이어에서 밝기가
     * 들뜨거나 눌려 보인다. 방송 범위(16~235)로 눕혀서 어디서 열어도 같게 한다.
     */
    "-vf", "scale=out_range=tv,format=yuv420p",
    "-c:v", "libx264",
    "-crf", "16",
    "-preset", "slow",
    ...(opts.music ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
    opts.out,
  ];
  const result = spawnSync("ffmpeg", ff, { stdio: ["ignore", "ignore", "inherit"] });
  if (result.status !== 0) throw new Error("ffmpeg이 실패했다");

  if (!opts.keepFrames) rmSync(frameDir, { recursive: true, force: true });
  console.log(`\n완성 — ${opts.out}`);
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
