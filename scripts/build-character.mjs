/**
 * 캐릭터 GLB 하나로 합치기.
 *
 * Meshy가 내보낸 원본은 **동작마다 파일이 따로**이고, 파일마다 같은 메시와
 * 2048px 텍스처가 통째로 들어 있다 — 12개를 그대로 쓰면 68MB이고, 같은 메시를
 * 열두 번 받는 셈이다.
 *
 * 그래서 하나를 바탕으로 삼고 **나머지에서 동작만 떼어 붙인다.** 텍스처는
 * 파일의 92%였으므로 줄이는 것이 곧 크기다 — 1024px JPEG로 바꾼다.
 *
 * 이 스크립트를 저장소에 두는 이유는 **결과물이 어디서 왔는지 남기기 위해서**다.
 * `public/character.glb`만 있으면 다음 사람은 그 안을 열어 보기 전에는 무엇이
 * 들어 있는지 모른다.
 *
 * 쓰는 법:
 *   node scripts/build-character.mjs <원본 폴더> [출력 경로]
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 바탕으로 쓸 파일에 들어 있는 동작 */
const BASE_CLIP = "Running";

/**
 * 함께 넣을 동작들.
 *
 * 열두 개를 다 넣지 않는다 — 게임이 쓰지 않는 동작도 키프레임만큼 자리를
 * 차지한다. 화면에 실제로 나오는 것만 고른다.
 */
const EXTRA_CLIPS = ["Walking", "Attack", "Dead", "Arise", "Skill_03"];

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

function findFile(dir, clip) {
  const hit = readdirSync(dir).find((name) => name.includes(`_Animation_${clip}_`));
  if (!hit) throw new Error(`동작 파일을 못 찾았다: ${clip}`);
  return join(dir, hit);
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

function build(sourceDir, outPath) {
  const base = readGlb(findFile(sourceDir, BASE_CLIP));
  const json = structuredClone(base.json);

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

  for (const clip of EXTRA_CLIPS) {
    const extra = readGlb(findFile(sourceDir, clip));
    for (const animation of extra.json.animations ?? []) {
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

const [dir, out = "public/character.glb"] = process.argv.slice(2);
if (!dir) {
  console.error("쓰는 법: node scripts/build-character.mjs <원본 폴더> [출력 경로]");
  process.exit(1);
}

const result = build(dir, out);
console.log(`${out} — ${(result.bytes / 1024).toFixed(0)}KB`);
for (const name of result.clips) console.log(`  ${name}`);
