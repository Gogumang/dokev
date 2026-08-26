/**
 * 캐릭터 GLB 하나로 합치기 — **몸 하나에 동작을 옮겨 붙인다.**
 *
 * 몸과 동작이 다른 파일에서 온다. Meshy의 자동 리깅은 **표준 뼈대 하나**를
 * 쓰므로(조인트 24개, `Hips`부터 이름·순서가 같다), 어느 모델에서 뽑은
 * 동작이든 다른 모델에 그대로 얹힌다 — 그 덕에 「이 몸이 마음에 드는데 동작이
 * 둘뿐」인 상황을 몸만 갈아 끼워 푼다.
 *
 * 텍스처는 파일의 92%였으므로 줄이는 것이 곧 크기다 — 1024px JPEG로 바꾼다.
 *
 * 이 스크립트를 저장소에 두는 이유는 **결과물이 어디서 왔는지 남기기 위해서**다.
 * `public/character.glb`만 있으면 다음 사람은 그 안을 열어 보기 전에는 무엇이
 * 들어 있는지 모른다.
 *
 * 쓰는 법:
 *   node scripts/build-character.mjs <몸 GLB> <동작 GLB> [출력 경로]
 *
 * 뼈대가 다르면 **조용히 망가진다**(붙일 곳을 못 찾은 채널을 버리므로 일부만
 * 움직인다). 그래서 먼저 조인트를 대조하고, 어긋나면 멈춘다.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 옮겨 붙일 동작들.
 *
 * 원본이 든 것을 다 넣지 않는다 — 게임이 쓰지 않는 동작도 키프레임만큼 자리를
 * 차지한다. `characterClips.ts`의 `CLIP`이 부르는 여섯만 고르고, 검사가 그
 * 목록과 파일을 **양쪽으로** 대조한다.
 */
const CLIPS = [
  "Running",
  "Walking",
  "Left_Jab_from_Guard",
  "Knock_Down",
  "Idle_15",
  "Lunge_Spin_Kick",
];

/** 텍스처 한 변(px). 캐릭터가 화면에서 작아 2048은 과하다 */
const TEXTURE_SIZE = 1024;

/** JPEG 품질. 78이면 눈에 띄는 손실 없이 원본의 6% 크기가 된다 */
const TEXTURE_QUALITY = 78;

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`glTF 파일이 아니다: ${path}`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: buf.subarray(binStart) };
}

/** 그 뷰가 가리키는 실제 바이트 */
function viewBytes(glb, index) {
  const view = glb.json.bufferViews[index];
  const from = view.byteOffset ?? 0;
  return glb.bin.subarray(from, from + view.byteLength);
}

/** 그 파일의 뼈대 — 조인트 이름을 순서대로 */
function jointNames(glb) {
  const joints = glb.json.skins?.[0]?.joints ?? [];
  return joints.map((index) => glb.json.nodes[index].name);
}

/**
 * 텍스처를 줄인다.
 *
 * macOS 기본 도구(`sips`)만 쓴다 — 이 하나 때문에 이미지 라이브러리를
 * 의존성에 넣고 싶지 않다.
 */
function shrinkTexture(png) {
  const work = mkdtempSync(join(tmpdir(), "dokev-tex-"));
  try {
    const source = join(work, "in.png");
    const output = join(work, "out.jpg");
    writeFileSync(source, png);
    execFileSync("sips", ["-Z", String(TEXTURE_SIZE), source], { stdio: "ignore" });
    execFileSync(
      "sips",
      [
        "-s",
        "format",
        "jpeg",
        "-s",
        "formatOptions",
        String(TEXTURE_QUALITY),
        source,
        "--out",
        output,
      ],
      { stdio: "ignore" },
    );
    return readFileSync(output);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** 4바이트 경계에 맞춘다 — glTF가 요구한다 */
function pad4(length) {
  return (4 - (length % 4)) % 4;
}

function build(bodyPath, clipPath, outPath) {
  const base = readGlb(bodyPath);
  const source = readGlb(clipPath);

  /*
   * 뼈대가 같은지부터 본다. 다르면 채널이 붙을 곳을 못 찾아 **조용히 버려지고**,
   * 화면에서는 「팔만 움직이는 캐릭터」로 나온다 — 오류도 없이.
   */
  const mine = jointNames(base);
  const theirs = jointNames(source);
  const same = mine.length === theirs.length && mine.every((name, i) => name === theirs[i]);
  if (!same) {
    throw new Error(
      `뼈대가 다르다 — 몸 ${mine.length}개, 동작 ${theirs.length}개.\n` +
        `  몸:   ${mine.slice(0, 6).join(", ")}\n  동작: ${theirs.slice(0, 6).join(", ")}`,
    );
  }

  const json = structuredClone(base.json);
  // 바탕이 들고 온 동작은 버린다 — 아래에서 고른 것만 다시 채운다
  json.animations = [];

  /*
   * 노드는 **이름으로** 맞춘다. 파일마다 노드 순서가 같다는 보장이 없고,
   * 어긋나면 팔 동작이 다리에 붙는다.
   */
  const nodeByName = new Map(json.nodes.map((node, index) => [node.name, index]));

  /** 새로 쌓을 뷰들 */
  const views = json.bufferViews.map((view, index) => ({
    bytes: viewBytes(base, index),
    stride: view.byteStride,
    target: view.target,
  }));

  for (const clip of CLIPS) {
    const extra = source;
    const wanted = (extra.json.animations ?? []).filter((item) => item.name === clip);
    if (wanted.length === 0) throw new Error(`동작이 없다: ${clip}`);
    for (const animation of wanted) {
      const samplers = [];

      for (const sampler of animation.samplers) {
        const remapped = {};
        for (const key of ["input", "output"]) {
          const accessor = extra.json.accessors[sampler[key]];
          views.push({ bytes: viewBytes(extra, accessor.bufferView) });
          json.accessors.push({ ...accessor, bufferView: views.length - 1, byteOffset: 0 });
          remapped[key] = json.accessors.length - 1;
        }
        samplers.push({ ...sampler, ...remapped });
      }

      const channels = [];
      for (const channel of animation.channels) {
        const name = extra.json.nodes[channel.target.node]?.name;
        const target = nodeByName.get(name);
        // 바탕에 없는 뼈는 버린다. 억지로 붙이면 엉뚱한 곳이 움직인다
        if (target === undefined) continue;
        channels.push({ sampler: channel.sampler, target: { ...channel.target, node: target } });
      }

      json.animations.push({ name: animation.name, samplers, channels });
    }
  }

  // 텍스처 교체 — 여기가 전체 크기의 대부분이다
  const image = json.images[0];
  const jpeg = shrinkTexture(viewBytes(base, image.bufferView));
  views[image.bufferView] = { bytes: jpeg };
  image.mimeType = "image/jpeg";

  // 뷰를 차례로 쌓으며 위치를 다시 적는다
  const chunks = [];
  let offset = 0;
  json.bufferViews = views.map((view) => {
    const padding = pad4(offset);
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      offset += padding;
    }
    chunks.push(Buffer.from(view.bytes));
    const entry = { buffer: 0, byteOffset: offset, byteLength: view.bytes.length };
    if (view.stride !== undefined) entry.byteStride = view.stride;
    if (view.target !== undefined) entry.target = view.target;
    offset += view.bytes.length;
    return entry;
  });

  const bin = Buffer.concat(chunks);
  json.buffers = [{ byteLength: bin.length }];

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length), 0x20);
  const binPad = Buffer.alloc(pad4(bin.length), 0);
  const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + bin.length + binPad.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);

  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length + jsonPad.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);

  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length + binPad.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);

  writeFileSync(outPath, Buffer.concat([header, jsonHead, jsonBuf, jsonPad, binHead, bin, binPad]));

  return { clips: json.animations.map((animation) => animation.name), bytes: total };
}

const [body, clips, out = "public/character.glb"] = process.argv.slice(2);
if (!body || !clips) {
  console.error("쓰는 법: node scripts/build-character.mjs <몸 GLB> <동작 GLB> [출력 경로]");
  process.exit(1);
}

const result = build(body, clips, out);
console.log(`${out} — ${(result.bytes / 1024).toFixed(0)}KB`);
for (const name of result.clips) console.log(`  ${name}`);
