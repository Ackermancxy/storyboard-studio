#!/usr/bin/env node
// 从 PMX 精确测量人体骨架与各部位尺寸，生成可用于数学建模的 profile。
// 用法: node tools/pose-analysis/measure.mjs [pmx路径] [--height 1.56] [--id mikoto] [--out 路径]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

// MMD 标准骨骼 → 工具里的 17 关节（与 src/scene/gltfRig.ts 保持一致）
const MMD_BONES = {
  hips: "センター", spine: "上半身", chest: "上半身2", neck: "首", head: "頭",
  upperArm_L: "左腕", lowerArm_L: "左ひじ", hand_L: "左手首",
  upperArm_R: "右腕", lowerArm_R: "右ひじ", hand_R: "右手首",
  upperLeg_L: "左足", lowerLeg_L: "左ひざ", foot_L: "左足首",
  upperLeg_R: "右足", lowerLeg_R: "右ひざ", foot_R: "右足首",
};
const CHILD_OF = {
  upperArm_L: "lowerArm_L", upperArm_R: "lowerArm_R",
  lowerArm_L: "hand_L", lowerArm_R: "hand_R",
  upperLeg_L: "lowerLeg_L", upperLeg_R: "lowerLeg_R",
  lowerLeg_L: "foot_L", lowerLeg_R: "foot_R",
  hips: "spine", spine: "chest", chest: "neck", neck: "head",
};

function parseArgs(argv) {
  const out = { file: null, height: 1.56, id: "mikoto", out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--height") out.height = Number(argv[++i]);
    else if (a === "--id") out.id = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (!a.startsWith("--")) out.file = a;
  }
  return out;
}

const { Parser } = await import(pathToFileURL(resolve(ROOT, "node_modules/three-stdlib/libs/mmdparser.js")).href);

const args = parseArgs(process.argv.slice(2));
const pmxPath = resolve(args.file ?? resolve(ROOT, "public/assets/models/mikoto/御坂美琴.pmx"));
const buf = readFileSync(pmxPath);
const model = new Parser().parsePmx(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  true, // 与 MMDLoader 一致：左手系 → 右手系
);

// ── 原始包围盒 / 归一化比例（与 SceneManager 的 wrapper.scale 一致）──
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const v of model.vertices) {
  const [x, y, z] = v.position;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const rawHeight = maxY - minY;
const scale = args.height / rawHeight;
const S = (p) => p.map((v) => +(v * scale).toFixed(5));
const D = (v) => +(v * scale).toFixed(5);

const rawBones = model.bones.map((b, i) => ({
  name: b.name,
  parent: b.parentIndex,
  pos: b.position.slice(0, 3),
  tail: b.tail ?? null,
  flags: b.flags ?? 0,
}));
const bones = rawBones.map((b) => ({ ...b, pos: S(b.pos) }));
const byName = new Map(bones.map((b, i) => [b.name, i]));

// ── 17 个控制关节 ──
const joints = {};
for (const [joint, boneName] of Object.entries(MMD_BONES)) {
  const idx = byName.get(boneName);
  if (idx === undefined) throw new Error(`缺少骨骼 ${boneName}`);
  joints[joint] = { bone: idx, boneName, pos: bones[idx].pos };
}

// ── 每根骨骼的主导顶点 → 半径 / 突出点 ──
const dominant = Array.from({ length: bones.length }, () => []);
for (const v of model.vertices) {
  let bi = 0, bw = -1;
  for (let k = 0; k < v.skinIndices.length; k++) {
    const w = v.skinWeights[k] ?? 0;
    if (w > bw) { bw = w; bi = v.skinIndices[k]; }
  }
  if (bi >= 0 && bi < bones.length && bw >= 0.35) {
    dominant[bi].push({ p: v.position, w: bw });
  }
}

function segmentEnd(bi) {
  const b = rawBones[bi];
  if (b.tail) {
    if (b.tail.bone !== undefined && b.tail.bone >= 0 && rawBones[b.tail.bone]) return rawBones[b.tail.bone].pos;
    if (b.tail.offset) return b.pos.map((p, i) => p + b.tail.offset[i]);
  }
  const kids = rawBones.map((x, i) => ({ x, i })).filter(({ x }) => x.parent === bi);
  if (kids.length === 0) return b.pos;
  let best = null, bestLen = -1;
  for (const { x } of kids) {
    const dx = x.pos[0] - b.pos[0], dy = x.pos[1] - b.pos[1], dz = x.pos[2] - b.pos[2];
    const l = Math.hypot(dx, dy, dz);
    if (l > bestLen) { bestLen = l; best = x.pos; }
  }
  return best ?? b.pos;
}

const distPointSeg = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
  let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

function percentile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// 只给「有实体」的骨骼算半径：躯干/四肢/头/发/裙
const interesting = (name) =>
  Object.values(MMD_BONES).includes(name) ||
  /^(頭|首|上半身|下半身|腰|肩|腕|ひじ|手首|足|ひざ|足首|つま先|足先|スカート|後ろ髪|後髪|前髪|目|両目)/.test(name);

// 26 个采样方向：用于「突出点」——姿态变形后求最低点 / 画轮廓
const DIRS = (() => {
  const d = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x || y || z) d.push([x, y, z]);
  }
  return d.map((v) => {
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  });
})();

const MAPPED_BONE_INDices = new Set(Object.values(MMD_BONES).map((n) => byName.get(n)).filter((x) => x !== undefined));

const boneMetrics = {};
for (let i = 0; i < bones.length; i++) {
  const must = MAPPED_BONE_INDices.has(i);
  if (!must && (!interesting(bones[i].name) || dominant[i].length < 20)) continue;
  const a = rawBones[i].pos, bb = segmentEnd(i);
  const rad = dominant[i].map(({ p }) => distPointSeg(p, a, bb) * scale);
  // 突出点：每个方向取最远顶点，转成骨骼局部坐标（静止旋转为单位）
  const hull = [];
  for (const dir of DIRS) {
    let best = null, bestDot = -Infinity;
    for (const { p } of dominant[i]) {
      const q = p[0] - a[0], r = p[1] - a[1], s = p[2] - a[2];
      const dot = q * dir[0] + r * dir[1] + s * dir[2];
      if (dot > bestDot) { bestDot = dot; best = [q, r, s]; }
    }
    if (best) hull.push(S(best));
  }
  boneMetrics[rawBones[i].name] = {
    bone: i,
    end: S(bb),
    length: D(Math.hypot(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2])),
    verts: dominant[i].length,
    r50: +percentile(rad, 0.5).toFixed(4),
    r85: +percentile(rad, 0.85).toFixed(4),
    rMax: +percentile(rad, 0.98).toFixed(4),
    hull,
  };
}

// ── 关节段的半径（用于胶囊碰撞/落地）──
const segments = {};
for (const [joint, child] of Object.entries(CHILD_OF)) {
  const j = joints[joint];
  const c = joints[child];
  if (!j || !c) continue;
  const len = Math.hypot(c.pos[0] - j.pos[0], c.pos[1] - j.pos[1], c.pos[2] - j.pos[2]);
  const m = boneMetrics[j.boneName] ?? {};
  segments[`${joint}->${child}`] = {
    from: joint, to: child,
    length: +len.toFixed(4),
    r: m.r85 ?? estimateRadius(joint),
    r50: m.r50 ?? estimateRadius(joint),
  };
}

function estimateRadius(joint) {
  // 兜底：按人体比例（对上肢/下肢用肢体长度的比例）
  const table = {
    hips: 0.13, spine: 0.12, chest: 0.13, neck: 0.05, head: 0.1,
    upperArm: 0.04, lowerArm: 0.033, hand: 0.035,
    upperLeg: 0.085, lowerLeg: 0.055, foot: 0.045,
  };
  for (const k of Object.keys(table)) if (joint.startsWith(k)) return table[k];
  return 0.08;
}

// ── 地标 ──
const vertexWorld = (v) => S(v.position);
const headBone = joints.head.bone;
const headVerts = dominant[headBone].map((x) => x.p);
const chinCandidates = headVerts
  .map(S)
  .filter((p) => p[1] < joints.head.pos[1] - 0.01 && p[2] > 0)
  .sort((a, b) => a[1] - b[1]);
const chin = chinCandidates.length
  ? [0, +(chinCandidates.slice(0, 30).reduce((s, p) => s + p[1], 0) / Math.max(1, Math.min(30, chinCandidates.length))).toFixed(4), +(chinCandidates.slice(0, 30).reduce((s, p) => s + p[2], 0) / Math.max(1, Math.min(30, chinCandidates.length))).toFixed(4)]
  : [0, joints.head.pos[1] - 0.12, 0.08];

function bonePos(name, fallback) {
  const i = byName.get(name);
  return i === undefined ? fallback : bones[i].pos;
}

const footOf = (side) => {
  const foot = joints[`foot_${side}`];
  const toe = bonePos(side === "L" ? "左つま先" : "右つま先", foot.pos);
  const verts = dominant[foot.bone].map((x) => S(x.p));
  const minYv = Math.min(...verts.map((p) => p[1]));
  // 脚底补片：最低 1.5cm 内的顶点 → 四个角，用来算支撑多边形
  const sole = verts.filter((p) => p[1] < minYv + 0.015);
  const xs = sole.map((p) => p[0]), zs = sole.map((p) => p[2]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const corners = [[xmin, minYv, zmin], [xmax, minYv, zmin], [xmax, minYv, zmax], [xmin, minYv, zmax]];
  const soleY = sole.length ? sole.reduce((s, p) => s + p[1], 0) / sole.length : 0;
  const heelZ = Math.min(...verts.map((p) => p[2]));
  return { toe, soleY: +soleY.toFixed(4), heelZ: +heelZ.toFixed(4), corners };
};
const footL = footOf("L"), footR = footOf("R");

const landmarks = {
  headTop: [0, +((maxY - minY) * scale).toFixed(4), 0],
  headBone: joints.head.pos,
  chin,
  eye_L: bonePos("左目", null), eye_R: bonePos("右目", null),
  eyeTip_L: bonePos("左目先", null), eyeTip_R: bonePos("右目先", null),
  ear_L: [Math.max(...headVerts.map((p) => p[0])) * scale, joints.head.pos[1] + 0.02, joints.head.pos[2] + 0.01],
  ear_R: [Math.min(...headVerts.map((p) => p[0])) * scale, joints.head.pos[1] + 0.02, joints.head.pos[2] + 0.01],
  hand_L: joints.hand_L.pos, hand_R: joints.hand_R.pos,
  finger_L: bonePos("左中指先", joints.hand_L.pos),
  finger_R: bonePos("右中指先", joints.hand_R.pos),
  toe_L: footL.toe, toe_R: footR.toe,
  soleY: +footL.soleY.toFixed(4),
  heelZ: +(footL.heelZ * 1).toFixed(4),
  sole_L: footL.corners,
  sole_R: footR.corners,
};

// ── 身体尺寸汇总 ──
const dist = (a, b) => +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(4);
const measurements = {
  height: args.height,
  rawHeight: +rawHeight.toFixed(4),
  scale: +scale.toFixed(6),
  shoulderWidth: dist(joints.upperArm_L.pos, joints.upperArm_R.pos),
  hipWidth: dist(joints.upperLeg_L.pos, joints.upperLeg_R.pos),
  headLength: dist(joints.head.pos, bonePos("頭先", joints.head.pos)),
  neckToHead: dist(joints.neck.pos, joints.head.pos),
  torsoLength: dist(joints.hips.pos, joints.neck.pos),
  upperArm: dist(joints.upperArm_L.pos, joints.lowerArm_L.pos),
  forearm: dist(joints.lowerArm_L.pos, joints.hand_L.pos),
  hand: dist(joints.hand_L.pos, bonePos("左中指先", joints.hand_L.pos)),
  thigh: dist(joints.upperLeg_L.pos, joints.lowerLeg_L.pos),
  shin: dist(joints.lowerLeg_L.pos, joints.foot_L.pos),
  foot: dist(joints.foot_L.pos, footL.toe),
  armSpan: +(Math.hypot(landmarks.finger_L[0] - joints.upperArm_L.pos[0], landmarks.finger_L[1] - joints.upperArm_L.pos[1], landmarks.finger_L[2] - joints.upperArm_L.pos[2]) + Math.hypot(landmarks.finger_R[0] - joints.upperArm_R.pos[0], landmarks.finger_R[1] - joints.upperArm_R.pos[1], landmarks.finger_R[2] - joints.upperArm_R.pos[2])).toFixed(4),
};

const profile = {
  schema: 1,
  id: args.id,
  kind: "mmd",
  source: pmxPath.includes(ROOT) ? pmxPath.slice(ROOT.length + 1) : pmxPath,
  targetHeight: args.height,
  scale: +scale.toFixed(6),
  raw: {
    height: +rawHeight.toFixed(4),
    bbox: { min: [minX * scale, minY * scale, minZ * scale].map((v) => +v.toFixed(4)), max: [maxX * scale, maxY * scale, maxZ * scale].map((v) => +v.toFixed(4)) },
  },
  hipHeight: joints.hips.pos[1],
  bones,
  joints,
  segments,
  boneMetrics,
  landmarks,
  measurements,
};

const out = resolve(args.out ?? resolve(HERE, `profiles/local/${args.id}-pmx.json`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(profile, null, 1));
console.log(`✔ ${out}`);
console.log(`  身高 ${args.height}m（原始 ${rawHeight.toFixed(2)} 单位，比例 ${scale.toFixed(4)}）`);
for (const [k, v] of Object.entries(measurements)) {
  if (typeof v === "number") console.log(`  ${k.padEnd(14)} ${v.toFixed(3)} m`);
}
