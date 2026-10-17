// P5：宽容解析 AI 写的 JSON（SPEC §4.6）。纯函数，警告用中文。
import type { Actor, Aspect, CameraSpec, JointName, Light, Pose, Project, Prop, Shot } from "../types";
import { ASPECTS, JOINT_NAMES } from "../types";
import { JOINT_LIMITS } from "../scene/rig";
import { DEFAULT_GROUND, DEFAULT_SKY, GROUND_IDS, SKY_IDS } from "../scene/environment";
import { newShot } from "./shotFactory";

export interface NormalizeResult {
  project: Project;
  warnings: string[];
}

export interface ModelLists {
  characters: string[]; // 合法 character id
  props: string[]; // 合法 prop id
  characterNames?: ReadonlyMap<string, string>; // 显示名 → id
  propNames?: ReadonlyMap<string, string>;
}

/* ── 第一层：从任意文本里抠出 JSON ── */

/** 取第一个 { 或 [ 到与之配对的结尾（字符串感知） */
export function extractJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 去注释（// 和 /* *​/）与尾逗号；字符串内容不动 */
export function sanitizeJson(src: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      out += " ";
      continue;
    }
    if ((ch === "," && (next === "}" || next === "]")) || (ch === "," && nextIsNewlineComma(src, i))) {
      continue;
    }
    out += ch;
  }
  // 尾逗号在换行后的情况：",\n }" 已被上面第二条处理
  return out;
}

function nextIsNewlineComma(src: string, i: number): boolean {
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") continue;
    return c === "}" || c === "]";
  }
  return false;
}

export function parseLoose(text: string): unknown {
  const raw = extractJson(text);
  if (!raw) throw new Error("没有找到 JSON（需要以 { 或 [ 开头的一段）");
  return JSON.parse(sanitizeJson(raw));
}

/* ── 第二层：unknown → Project ── */

export function normalizeProject(input: unknown, models: ModelLists): NormalizeResult {
  const warnings: string[] = [];
  const obj = input as Record<string, unknown>;
  let shotsRaw: unknown[];
  let meta: Record<string, unknown> = {};

  if (Array.isArray(input)) {
    shotsRaw = input;
  } else if (obj && Array.isArray(obj.shots)) {
    shotsRaw = obj.shots;
    meta = obj;
  } else if (obj && (obj.camera || obj.actors)) {
    shotsRaw = [input]; // 单个 shot
  } else {
    throw new Error("结构不对：需要 { shots: [...] }、shots 数组或单个镜头对象");
  }
  if (shotsRaw.length === 0) throw new Error("shots 是空的");

  const shots = shotsRaw.map((s, i) => normalizeShot(s, i, models, warnings));
  fixShotIds(shots, warnings);

  const aspect = ASPECTS.includes(meta.aspect as Aspect) ? (meta.aspect as Aspect) : "3:2";
  if (meta.aspect !== undefined && meta.aspect !== aspect) {
    warnings.push(`画幅 "${String(meta.aspect)}" 不认识，用 3:2`);
  }
  const project: Project = {
    version: 1,
    title: typeof meta.title === "string" && meta.title ? meta.title : "AI 分镜",
    aspect,
    sensor: "FF",
    shots,
  };
  return { project, warnings };
}

function fixShotIds(shots: Shot[], warnings: string[]): void {
  const used = new Set<string>();
  let n = 1;
  for (const s of shots) {
    if (!s.id || used.has(s.id)) {
      warnings.push(`镜头 id "${s.id || "（空）"}" 缺失或重复，自动改为 S${String(n).padStart(2, "0")}`);
      s.id = `S${String(n).padStart(2, "0")}`;
    }
    used.add(s.id);
    n++;
  }
}

function normalizeShot(raw: unknown, index: number, models: ModelLists, warnings: string[]): Shot {
  const where = `第 ${index + 1} 镜`;
  const o = (raw ?? {}) as Record<string, unknown>;
  const shot = newShot(typeof o.id === "string" ? o.id : "", typeof o.name === "string" ? o.name : `镜头 ${index + 1}`);
  if (typeof o.description === "string") shot.description = o.description;
  if (typeof o.notes === "string") shot.notes = o.notes;
  if (typeof o.duration === "number" && Number.isFinite(o.duration)) {
    shot.duration = Math.max(0.5, Math.min(60, o.duration));
  }
  shot.camera = normalizeCamera(o.camera, where, warnings);

  // environment：背景色 / 地面样式 / 天空 / 地面预设（缺省用 shotFactory 默认）
  if (o.environment && typeof o.environment === "object") {
    const env = o.environment as Record<string, unknown>;
    const sky = readPreset(env.sky, SKY_IDS, DEFAULT_SKY, `${where}：天空`, warnings);
    const ground = readPreset(env.ground, GROUND_IDS, DEFAULT_GROUND, `${where}：地面`, warnings);
    shot.environment = {
      background: typeof env.background === "string" ? env.background : shot.environment!.background,
      floor: env.floor === "grid" || env.floor === "plain" || env.floor === "none" ? env.floor : shot.environment!.floor,
      sky,
      ground,
    };
  }

  const actorsRaw = Array.isArray(o.actors) ? o.actors : [];
  shot.actors = actorsRaw.slice(0, 8).map((a, i) => normalizeActor(a, i, models, where, warnings));
  fixEntityIds(shot.actors, "A", (id) => `${where} 人物 id 缺失或重复，自动改为 ${id}`, warnings, (i) => String.fromCharCode(65 + i));

  const propsRaw = Array.isArray(o.props) ? o.props : [];
  shot.props = propsRaw.slice(0, 20).map((p) => normalizeProp(p, models, where, warnings));
  fixEntityIds(shot.props, "P", (id) => `${where} 道具 id 缺失或重复，自动改为 ${id}`, warnings, (i) => `P${i + 1}`);

  const lightsRaw = Array.isArray(o.lights) ? o.lights : [];
  shot.lights = lightsRaw.slice(0, 12).map((l) => normalizeLight(l, shot.actors, where, warnings));
  fixEntityIds(shot.lights, "L", (id) => `${where} 灯 id 缺失或重复，自动改为 ${id}`, warnings, (i) => `L${i + 1}`);

  // subject 指向不存在的人物 → 清掉
  const ids = shot.actors.map((a) => a.id);
  const subject = shot.camera.subject;
  if (typeof subject === "string" && !ids.includes(subject)) {
    warnings.push(`${where}：camera.subject "${subject}" 不存在，改为全体主体`);
    shot.camera.subject = undefined;
  }
  if (Array.isArray(subject)) {
    const kept = subject.filter((s) => ids.includes(s));
    if (kept.length === 0) {
      warnings.push(`${where}：camera.subject 里没有有效人物，改为全体主体`);
      shot.camera.subject = undefined;
    } else {
      shot.camera.subject = kept;
    }
  }
  shot.lights.forEach((l) => {
    if (l.subject && !ids.includes(l.subject)) {
      warnings.push(`${where}：灯 ${l.id} 的 subject "${l.subject}" 不存在，改为第一个人`);
      l.subject = ids[0];
    }
  });
  return shot;
}

function fixEntityIds<T extends { id: string }>(
  list: T[],
  _prefix: string,
  msg: (id: string, i: number) => string,
  warnings: string[],
  gen: (i: number) => string,
): void {
  const used = new Set<string>();
  let i = 0;
  for (const e of list) {
    if (!e.id || used.has(e.id)) {
      let candidate = gen(i);
      while (used.has(candidate)) candidate = candidate + "x";
      if (e.id) warnings.push(msg(candidate, i));
      e.id = candidate;
    }
    used.add(e.id);
    i++;
  }
}

function normalizeCamera(raw: unknown, where: string, warnings: string[]): CameraSpec {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cam: CameraSpec = {
    mode: o.mode === "manual" ? "manual" : "auto",
    focalLength: clampNum(o.focalLength, 14, 200, 50),
  };
  if (typeof o.roll === "number") cam.roll = clampNum(o.roll, -45, 45, 0);
  if (typeof o.subject === "string" || Array.isArray(o.subject)) cam.subject = o.subject as string | string[];
  if (typeof o.shotSize === "string" && ["ECU", "CU", "MCU", "MS", "MLS", "FS", "WS", "EWS"].includes(o.shotSize)) {
    cam.shotSize = o.shotSize as CameraSpec["shotSize"];
  } else if (o.shotSize !== undefined) {
    warnings.push(`${where}：景别 "${String(o.shotSize)}" 不认识，用 MS`);
    cam.shotSize = "MS";
  } else {
    cam.shotSize = "MS";
  }
  cam.azimuth = typeof o.azimuth === "number" ? clampNum(o.azimuth, -360, 360, 0) : 0;
  if (typeof o.angle === "string" && ["eye", "high", "low", "overhead", "worm"].includes(o.angle)) {
    cam.angle = o.angle as CameraSpec["angle"];
  } else {
    cam.angle = "eye";
  }
  if (typeof o.elevation === "number") cam.elevation = clampNum(o.elevation, -60, 85, 0);
  if (o.placement === "left-third" || o.placement === "right-third" || o.placement === "center") {
    cam.placement = o.placement;
  } else {
    cam.placement = "center";
  }
  if (Array.isArray(o.position) && o.position.length === 3) cam.position = o.position.map((v) => clampNum(v, -50, 50, 0)) as [number, number, number];
  if (Array.isArray(o.target) && o.target.length === 3) cam.target = o.target.map((v) => clampNum(v, -50, 50, 0)) as [number, number, number];
  if (cam.mode === "manual" && (!cam.position || !cam.target)) {
    warnings.push(`${where}：mode 是 manual 但缺 position/target，改回 auto`);
    cam.mode = "auto";
  }
  return cam;
}

function readPreset(
  value: unknown,
  ids: readonly string[],
  fallback: string,
  label: string,
  warnings: string[],
): string {
  if (value === undefined) return fallback;
  if (typeof value === "string" && ids.includes(value)) return value;
  warnings.push(`${label} "${String(value)}" 不认识，用 ${fallback}`);
  return fallback;
}

function resolveModel(value: string, ids: string[], names: ReadonlyMap<string, string> | undefined): string | undefined {
  if (ids.includes(value)) return value;
  const id = names?.get(value);
  return id && ids.includes(id) ? id : undefined;
}

function normalizeActor(raw: unknown, _index: number, models: ModelLists, where: string, warnings: string[]): Actor {
  const o = (raw ?? {}) as Record<string, unknown>;
  const given = typeof o.model === "string" ? o.model : models.characters[0];
  const resolved = resolveModel(given, models.characters, models.characterNames);
  let model = resolved ?? models.characters[0];
  if (resolved === undefined) {
    warnings.push(`${where}：人物 model "${given}" 不认识，用 ${model}`);
  } else if (resolved !== given) {
    warnings.push(`${where}：人物 model "${given}" 已改为 ${model}`);
  }
  return {
    id: typeof o.id === "string" ? o.id : "",
    label: typeof o.label === "string" ? o.label : undefined,
    model,
    position: readVec2(o.position),
    facing: clampNum(o.facing, -360, 360, 0),
    elevation: typeof o.elevation === "number" ? clampNum(o.elevation, 0, 10, 0) : undefined,
    autoGround: o.autoGround === false ? false : true,
    color: typeof o.color === "string" ? o.color : undefined,
    pose: normalizePose(o.pose, where, warnings),
    gaze: typeof o.gaze === "string" ? o.gaze : null,
  };
}

function normalizePose(raw: unknown, where: string, warnings: string[]): Pose {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pose: Pose = { joints: {} };
  if (typeof o.preset === "string" && o.preset) {
    pose.preset = o.preset; // 未知 preset 在渲染时回退 stand，这里给警告
    if (!KNOWN_PRESETS.has(o.preset)) {
      warnings.push(`${where}：姿势预设 "${o.preset}" 不认识，会回退为站立`);
    }
  }
  const joints = (o.joints ?? {}) as Record<string, unknown>;
  for (const [name, params] of Object.entries(joints)) {
    if (!JOINT_NAMES.includes(name as JointName)) continue;
    const limits = JOINT_LIMITS[name as JointName];
    const entry: Record<string, number> = {};
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      const lim = limits[k as keyof typeof limits];
      if (lim && typeof v === "number" && Number.isFinite(v)) {
        entry[k] = Math.min(lim[1], Math.max(lim[0], Math.round(v)));
      }
    }
    if (Object.keys(entry).length > 0) pose.joints![name as JointName] = entry;
  }
  return pose;
}

import { POSE_PRESETS } from "../data/poses";

const KNOWN_PRESETS = new Set(POSE_PRESETS.map((p) => p.id));

function normalizeProp(raw: unknown, models: ModelLists, where: string, warnings: string[]): Prop {
  const o = (raw ?? {}) as Record<string, unknown>;
  const given = typeof o.model === "string" ? o.model : "box";
  const resolved = resolveModel(given, models.props, models.propNames);
  const model = resolved ?? "box";
  if (resolved === undefined) {
    warnings.push(`${where}：道具 model "${given}" 不认识，用 box`);
  } else if (resolved !== given) {
    warnings.push(`${where}：道具 model "${given}" 已改为 ${model}`);
  }
  const size = Array.isArray(o.size) && o.size.length === 3
    ? (o.size.map((v) => clampNum(v, 0.05, 20, 1)) as [number, number, number])
    : undefined;
  return {
    id: typeof o.id === "string" ? o.id : "",
    model,
    label: typeof o.label === "string" ? o.label : undefined,
    position: readVec2(o.position),
    facing: typeof o.facing === "number" ? clampNum(o.facing, -360, 360, 0) : 0,
    elevation: typeof o.elevation === "number" ? clampNum(o.elevation, 0, 10, 0) : undefined,
    size,
    scale: typeof o.scale === "number" ? clampNum(o.scale, 0.01, 20, 1) : undefined,
    color: typeof o.color === "string" ? o.color : undefined,
  };
}

function normalizeLight(raw: unknown, actors: Actor[], where: string, warnings: string[]): Light {
  const o = (raw ?? {}) as Record<string, unknown>;
  const roles = ["key", "fill", "rim", "back", "practical", "ambient"];
  const role = roles.includes(o.role as string) ? (o.role as Light["role"]) : "key";
  if (!roles.includes(o.role as string) && o.role !== undefined) {
    warnings.push(`${where}：灯 role "${String(o.role)}" 不认识，用 key`);
  }
  return {
    id: typeof o.id === "string" ? o.id : "",
    role,
    type: o.type === "hard" ? "hard" : "soft",
    subject: typeof o.subject === "string" ? o.subject : actors[0]?.id,
    azimuth: clampNum(o.azimuth, -360, 360, 45),
    elevation: clampNum(o.elevation, -30, 85, 35),
    distance: typeof o.distance === "number" ? clampNum(o.distance, 0.5, 15, 3) : undefined,
    intensity: clampNum(o.intensity, 0, 2, 1),
    colorTemp: typeof o.colorTemp === "number" ? clampNum(o.colorTemp, 2000, 10000, 5600) : undefined,
    showStand: o.showStand === true,
  };
}

function readVec2(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return [clampNum(raw[0], -50, 50, 0), clampNum(raw[1], -50, 50, 0)];
  }
  return [0, 0];
}

function clampNum(raw: unknown, min: number, max: number, fallback: number): number {
  const v = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
