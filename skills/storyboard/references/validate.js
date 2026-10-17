#!/usr/bin/env node
// 分镜 JSON 校验器：node validate.js <file.json>
// 检查模型/预设/景别/灯角色/关节范围/subject 引用/id 重复。无依赖，纯 Node。
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 找到分镜工具目录：环境变量 → 仓库内相对位置 → 常见安装位置
const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.STORYBOARD_ROOT,
  resolve(HERE, "../../.."), // skills/storyboard/references → 仓库根
  join(homedir(), ".local", "share", "storyboard"),
  join(homedir(), "storyboard"),
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "storyboard") : null,
  join(homedir(), "AppData", "Local", "storyboard"),
].filter(Boolean);
const APP = CANDIDATES.find((p) => existsSync(join(p, "public", "assets", "manifest.json")));
const MANIFEST = APP ? join(APP, "public", "assets", "manifest.json") : null;
const LOCAL_MANIFEST = APP ? join(APP, "public", "assets", "manifest.local.json") : null;
if (!APP) console.warn("△ 没找到分镜工具目录（可设 STORYBOARD_ROOT），模型检查使用内置清单");

let PRESETS = new Set(["stand","stand_relaxed","hands_on_hips","arms_crossed","walk","run","sit_chair","sit_floor","kneel","kneel_one","crouch","lean_forward","look_back","phone_call","hand_to_chin","hand_in_hair","wave","point","arms_up","lie_back","lie_side"]);
// 工具内置预设以 poses.ts 为准（新增预设后校验器不用跟着改）
try {
  const src = readFileSync(join(APP ?? "", "src/data/poses.ts"), "utf-8");
  const ids = [...src.matchAll(/\{\s*id:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (ids.length > 0) PRESETS = new Set(ids);
} catch { /* 工具不在本机时用上面的兜底清单 */ }
const SIZES = new Set(["ECU","CU","MCU","MS","MLS","FS","WS","EWS"]);
const ROLES = new Set(["key","fill","rim","back","practical","ambient"]);
const SKIES = new Set(["studio","clear-day","clear-sunset","clear-dusk","clear-night","overcast","rain","storm","snow","fog"]);
const GROUNDS = new Set(["studio","wood","tile","grass","dirt","sand","snow","asphalt","city","water"]);
const LIM = {
  hips: { bend: [-180,180], side: [-90,90], twist: [-90,90] },
  spine: { bend: [-30,60], side: [-30,30], twist: [-45,45] },
  chest: { bend: [-30,60], side: [-30,30], twist: [-45,45] },
  neck: { nod: [-60,60], tilt: [-40,40], turn: [-80,80] },
  head: { nod: [-60,60], tilt: [-40,40], turn: [-80,80] },
  upperArm: { pitch: [0,180], yaw: [-60,180], twist: [-90,90] },
  lowerArm: { bend: [0,150] },
  hand: { bend: [-70,70], side: [-30,30] },
  upperLeg: { pitch: [-40,130], yaw: [-30,180], twist: [-45,45] },
  lowerLeg: { bend: [0,150] },
  foot: { point: [-45,45] },
};

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return null; }
}
function mergeById(base = [], patch = []) {
  const map = new Map(base.map((x) => [x.id, x]));
  for (const x of patch) if (x?.id) map.set(x.id, x);
  return [...map.values()];
}
const baseManifest = MANIFEST ? readJson(MANIFEST) ?? {} : {};
const localManifest = LOCAL_MANIFEST ? readJson(LOCAL_MANIFEST) ?? {} : {};
const manifest = {
  characters: mergeById(baseManifest.characters, localManifest.characters),
  props: mergeById(baseManifest.props, localManifest.props),
};
const chars = new Set(manifest.characters.length ? manifest.characters.map(c => c.id) : ["mikoto","man","child","xbot"]);
const propIds = new Set(manifest.props.length ? manifest.props.map(p => p.id) : ["chair","stool","table","sofa","bed","box","wall","backdrop","door","window","stairs","tree","car","umbrella","light_stand"]);

const file = process.argv[2];
if (!file) { console.error("用法: node validate.js <file.storyboard.json>"); process.exit(2); }
const d = JSON.parse(readFileSync(file, "utf-8"));
const errors = [];
const warnings = [];

const shotIds = new Set();
for (const s of d.shots ?? []) {
  if (shotIds.has(s.id)) errors.push(`镜头 id ${s.id} 重复`);
  shotIds.add(s.id);
  const actorIds = new Set();
  for (const a of s.actors ?? []) {
    if (actorIds.has(a.id)) errors.push(`${s.id}: 人物 id ${a.id} 重复`);
    actorIds.add(a.id);
    if (!chars.has(a.model)) errors.push(`${s.id}: 人物 model "${a.model}" 不在 manifest`);
    const p = a.pose ?? {};
    if (p.preset && !PRESETS.has(p.preset)) errors.push(`${s.id}: 预设 "${p.preset}" 不存在`);
    if (a.gaze && a.gaze !== "camera" && !/^[A-Z]/.test(a.gaze)) warnings.push(`${s.id}: gaze "${a.gaze}" 不像是人物 id 或 camera`);
    for (const [jn, params] of Object.entries(p.joints ?? {})) {
      const base = jn.replace(/_[LR]$/, "");
      if (!LIM[base]) { errors.push(`${s.id}: 关节 "${jn}" 不存在`); continue; }
      for (const [k, v] of Object.entries(params)) {
        const lim = LIM[base][k];
        if (!lim) errors.push(`${s.id}: ${jn}.${k} 参数不存在`);
        else if (v < lim[0] || v > lim[1]) errors.push(`${s.id}: ${jn}.${k}=${v} 越界 (${lim[0]}..${lim[1]})`);
      }
    }
  }
  const cam = s.camera ?? {};
  if (cam.shotSize && !SIZES.has(cam.shotSize)) errors.push(`${s.id}: 景别 "${cam.shotSize}" 不存在`);
  if (cam.subject !== undefined) {
    const ids = Array.isArray(cam.subject) ? cam.subject : [cam.subject];
    for (const id of ids) if (!actorIds.has(id)) warnings.push(`${s.id}: camera.subject "${id}" 没有对应人物（会回退全体）`);
  }
  for (const pr of s.props ?? []) {
    if (!propIds.has(pr.model)) errors.push(`${s.id}: 道具 model "${pr.model}" 不在 manifest`);
  }
  for (const l of s.lights ?? []) {
    if (!ROLES.has(l.role)) errors.push(`${s.id}: 灯 role "${l.role}" 不存在`);
    if (l.subject && !actorIds.has(l.subject)) warnings.push(`${s.id}: 灯 ${l.id} 的 subject "${l.subject}" 没有对应人物`);
    if (l.intensity < 0 || l.intensity > 2) warnings.push(`${s.id}: 灯 ${l.id} 强度 ${l.intensity} 超出 0–2（会 clamp）`);
  }
  const env = s.environment ?? {};
  if (env.sky !== undefined && !SKIES.has(env.sky)) errors.push(`${s.id}: 天空预设 "${env.sky}" 不存在`);
  if (env.ground !== undefined && !GROUNDS.has(env.ground)) errors.push(`${s.id}: 地面预设 "${env.ground}" 不存在`);
  if (env.floor !== undefined && !["grid", "plain", "none"].includes(env.floor)) errors.push(`${s.id}: floor "${env.floor}" 不存在`);
}

if (!Array.isArray(d.shots) || d.shots.length === 0) errors.push("shots 为空");

for (const e of errors) console.error("✗", e);
for (const w of warnings) console.warn("△", w);
if (errors.length === 0 && warnings.length === 0) console.log(`✅ ${d.shots.length} 镜全部通过`);
else if (errors.length === 0) console.log(`✅ ${d.shots.length} 镜通过，${warnings.length} 条提示`);
else { console.log(`❌ ${errors.length} 个错误`); process.exit(1); }
