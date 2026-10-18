// 预设动作图鉴：把全部内置预设画成一套分类展示图（每式正面 + 侧面骨架）。
//
// 与 analyze.mjs --svg 的区别：那张是「单镜头验收图」（带问题标注、道具盒、俯视图），
// 这张是「图鉴页」——按类别排版全部预设，只保留骨架形态与环境示意（虚线座面/墙面/栏杆），
// 同页共用比例尺，方便横向比较动作幅度。数据同样来自 auditOne() 烘焙后的实测骨架，
// 不渲染、不截图。
//
// 用法：
//   node tools/pose-analysis/preset-atlas.mjs                 # 输出到 ~/Downloads/
//   node tools/pose-analysis/preset-atlas.mjs --out <dir>     # 指定输出目录（PNG）
//   node tools/pose-analysis/preset-atlas.mjs --svg-only      # 只写 SVG，不转 PNG
//   node tools/pose-analysis/preset-atlas.mjs --only 站姿,跪蹲  # 只画指定类别
//
// PNG 转换依赖 rsvg-convert（librsvg），没有时用 --svg-only 也能出图。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { loadProfile, loadPresets, presetMap, createModel } from "./kinematics.mjs";
import { auditOne } from "./preset-audit.mjs";
import { convexHull, add, qRot } from "./vec.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POSES_TS = join(ROOT, "src/data/poses.ts");
const PROFILE = join(dirname(fileURLToPath(import.meta.url)), "profiles/local/mikoto-pmx.json");
const TODAY = new Date().toISOString().slice(0, 10);

/* ───────────────────────── 类别 ───────────────────────── */

// 每个预设必须恰好归入一类；脚本启动时会校验覆盖完整性。
const CATEGORIES = [
  { key: "standing", title: "站姿", en: "STANDING", accent: "#35618f", ids: [
    "stand", "stand_relaxed", "contrapposto", "model_s", "legs_crossed",
    "hands_clasped_front", "hands_behind", "hands_on_hips", "arms_crossed", "arms_out",
    "look_back", "look_over_shoulder", "look_up", "bow", "shrug",
    "stretch", "stretch_side", "lean_forward", "lean_forward_hands_back", "hands_on_thighs",
  ] },
  { key: "gesture", title: "手势", en: "GESTURES", accent: "#7b4fa6", ids: [
    "wave", "wave_high", "wave_both", "point", "point_up", "point_side",
    "peace_sign", "peace_eye", "cat_pose", "heart_over_head", "heart_hands",
    "blow_kiss", "praying", "salute", "fist_cheer", "arms_up", "arms_behind_head",
    "hand_to_chin", "hand_in_hair", "shade_eyes", "adjust_collar", "adjust_hat",
    "surprise", "cover_face", "selfie",
  ] },
  { key: "props", title: "手持道具", en: "PROPS", accent: "#b3572d", ids: [
    "phone_call", "phone_text", "carry_bag", "carry_bag_shoulder",
    "hold_umbrella", "hold_camera", "hold_book", "hold_flowers", "hold_cup",
    "hold_hat", "hold_skirt",
  ] },
  { key: "motion", title: "走跑跳", en: "MOTION", accent: "#2e7d5b", ids: [
    "walk", "walk_stride", "walk_lookback", "run", "run_lookback",
    "jump", "tiptoe", "tiptoe_look", "kick_back", "spin_skirt", "reach_up",
  ] },
  { key: "seat", title: "坐姿 · 椅凳台沿", en: "SEATED", accent: "#b03a48", ids: [
    "sit_chair", "sit_chair_leg_lifted", "sit_chair_leaning", "sit_chair_hands_knees",
    "sit_steps", "sit_curb", "sit_stool",
    "sit_ledge", "sit_ledge_hands_back", "sit_ledge_lookback", "sit_ledge_swing_legs",
  ] },
  { key: "floor", title: "坐姿 · 地面", en: "FLOOR SEAT", accent: "#8a6d3b", ids: [
    "sit_floor", "sit_cross", "sit_back", "sit_hug_one", "sit_side",
    "sit_floor_ankle_cross", "sit_floor_side_lean", "sit_floor_stretch",
    "sit_floor_lookup", "sit_floor_hands_knees", "sit_kneel_side",
  ] },
  { key: "kneel", title: "跪 · 蹲", en: "KNEEL & CROUCH", accent: "#5e7136", ids: [
    "kneel", "kneel_one", "kneel_sit", "kneel_lookback", "kneel_back_arch",
    "crouch", "squat_hug",
  ] },
  { key: "lying", title: "躺 · 趴", en: "LYING", accent: "#3f7f93", ids: [
    "lie_back", "lie_back_arms_up", "lie_back_knees_bent", "lie_back_side_look",
    "lie_back_one_knee_up", "lie_side", "lie_side_head_rest", "lie_side_fetal",
    "lie_side_arm_forward", "lie_stomach", "lie_stomach_chin", "lie_stomach_kick",
  ] },
  { key: "lean", title: "倚靠", en: "LEANING", accent: "#566b78", ids: [
    "hand_on_wall", "hand_on_wall_lookback", "lean_wall", "lean_wall_lookback",
    "lean_wall_one_foot", "back_to_wall_hands_behind",
    "lean_rail", "lean_rail_side", "lean_rail_lookdown", "rail_lookback",
  ] },
];

/* ───────────────────────── 样式 ───────────────────────── */

const FONT = "PingFang SC, Noto Sans CJK SC, Source Han Sans SC, sans-serif";
const C = {
  bg: "#fbfaf7", ink: "#25252a", faint: "#8a8880", grid: "#e6e2d8",
  body: "#d9ccbc", bodyEdge: "#b9a996",
  skirt: "#f3cbd6", skirtEdge: "#dfa6b6",
  hair: "#4a3b45", hairEdge: "#32262d",
  joint: "#ffffff", jointEdge: "#3a3a40",
  ground: "#b5b0a2", prop: "#9a958a",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&quot;").replace(/"/g, "&quot;");
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);

function envBadge(def) {
  const a = def.audit;
  if (!a) return "";
  if (a.kind === "seat") return `座面 ${a.top?.toFixed(2) ?? "0.45"} m`;
  if (a.kind === "ledge") return `台沿 ${a.top?.toFixed(2) ?? "0.6"} m`;
  if (a.kind === "wall-front") return "手扶墙";
  if (a.kind === "wall-back") return "倚墙";
  if (a.kind === "rail") return "栏杆";
  if (a.kind === "air") return `腾空 ${a.elevation?.toFixed(2) ?? ""} m`;
  return "";
}

/* ───────────────────────── 骨架几何 ───────────────────────── */

function boneIndexMap(profile) {
  const idx = new Map();
  profile.bones.forEach((b, i) => idx.set(b.name, i));
  return idx;
}

/** 某骨骼的实测突出壳（体表轮廓），body/world 坐标（审计摆位为原点朝 +Z） */
function boneHull(baked, profile, idxMap, boneName) {
  const m = profile.boneMetrics?.[boneName];
  if (!m?.hull) return null;
  const bi = idxMap.get(boneName);
  if (bi == null) return null;
  const p = baked.bonePos[bi], q = baked.boneQuat[bi];
  return m.hull.map((h) => add(p, qRot(q, h)));
}

/** 视图投影：front 正面（沿 z 看），side 侧面（人物面向右） */
function projector(view) {
  if (view === "side") return (p) => ({ x: p[2], y: p[1], d: -p[0] });
  return (p) => ({ x: p[0], y: p[1], d: p[2] });
}

/** 收集一个视图的全部可见元素（骨架多边形 / 关节点 / 道具示意），返回世界坐标内容 */
function collectView({ baked, profile, idxMap, props, view }) {
  const proj = projector(view);
  const polys = [];
  const joints = [];
  const marks = []; // 道具示意图元（线/框），世界坐标
  const pts = [];

  for (const b of profile.bones) {
    const hull = boneHull(baked, profile, idxMap, b.name);
    if (!hull || hull.length < 3) continue;
    const p3 = hull.map(proj);
    const h2 = convexHull(p3.map((p) => [p.x, p.y]));
    if (h2.length < 3) continue;
    const depth = p3.reduce((s, p) => s + p.d, 0) / p3.length;
    polys.push({ depth, pts: h2, isSkirt: /スカート|skirt/i.test(b.name), isHair: /髪|hair|前髪|後ろ髪/i.test(b.name) });
    for (const p of p3) pts.push(p);
  }
  for (const j of Object.values(baked.joint ?? {})) {
    if (!j?.pos) continue;
    const p = proj(j.pos);
    joints.push(p);
    pts.push(p);
  }
  for (const prop of props ?? []) {
    const [pw, ph, pd] = prop.size ?? [0.4, 0.4, 0.4];
    const base = prop.elevation ?? 0;
    const a = ((prop.facing ?? 0) * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      const lx = (sx * pw) / 2, lz = (sz * pd) / 2;
      corners.push(proj([
        prop.position[0] + lx * ca - lz * sa,
        base + sy * ph,
        prop.position[1] + lx * sa + lz * ca,
      ]));
    }
    const kind = prop.model === "railing" ? "rail" : prop.model === "wall" ? "wall" : "box";
    marks.push({ kind, corners, top: base + ph });
    // 墙/栏杆是 4 m 宽的虚拟验收面，不参与取景，否则整页比例会被压小；
    // 画的时候靠 clip 裁掉出格部分。
  }
  // 地面
  pts.push({ x: 0, y: 0, d: 0 });
  return { proj, polys, joints, marks, pts };
}

/* ───────────────────────── 单视图绘制 ───────────────────────── */

// box：座位/台沿 → 虚线框；wall：仅侧视图，竖直阴影带；rail：顶面高度一条虚线
function drawMarks(marks, map, clip, uid, view) {
  let out = "";
  if (marks.some((m) => m.kind === "wall" && view === "side")) {
    out += `<defs><pattern id="hatch-${uid}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="7" stroke="${C.prop}" stroke-width="1" opacity="0.5"/></pattern></defs>`;
  }
  for (const m of marks) {
    const h2 = convexHull(m.corners.map((p) => [p.x, p.y])).map((p) => map({ x: p[0], y: p[1], d: 0 }));
    if (m.kind === "box") {
      out += `<path d="M ${h2.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L ")} Z" fill="none" stroke="${C.prop}" stroke-width="1.1" stroke-dasharray="4 3" opacity="0.9"/>`;
      // 顶面高度小刻度
      const topY = Math.min(...h2.map((p) => p.y));
      const cx = (Math.min(...h2.map((p) => p.x)) + Math.max(...h2.map((p) => p.x))) / 2;
      out += `<text x="${f1(cx)}" y="${f1(topY - 4)}" font-size="9" fill="${C.prop}" text-anchor="middle">${(m.top * 100).toFixed(0)}</text>`;
    } else if (m.kind === "wall") {
      // 只在侧视图画：竖直条带 + 斜线填充
      if (view !== "side") continue;
      const x0 = Math.min(...h2.map((p) => p.x)), x1 = Math.max(...h2.map((p) => p.x));
      const y0 = Math.max(...h2.map((p) => p.y)), y1 = Math.min(...h2.map((p) => p.y));
      out += `<rect x="${f1(x0)}" y="${f1(Math.max(y1, clip.y))}" width="${f1(x1 - x0)}" height="${f1(Math.min(y0, clip.y + clip.h) - Math.max(y1, clip.y))}" fill="url(#hatch-${uid})" stroke="${C.prop}" stroke-width="1" stroke-dasharray="4 3" opacity="0.85"/>`;
    } else if (m.kind === "rail") {
      const y = Math.min(...h2.map((p) => p.y)); // 投影后 y 已翻转，顶面 = 最小 y
      out += `<line x1="${f1(clip.x)}" y1="${f1(y)}" x2="${f1(clip.x + clip.w)}" y2="${f1(y)}" stroke="${C.prop}" stroke-width="2.2" stroke-dasharray="7 4" opacity="0.9"/>`;
      out += `<text x="${f1(clip.x + clip.w - 2)}" y="${f1(y - 4)}" font-size="9" fill="${C.prop}" text-anchor="end">栏杆 ${(m.top * 100).toFixed(0)}</text>`;
    }
  }
  return out;
}

function drawView({ content, view, box, scale, uid, ruler }) {
  const { polys, joints, marks, pts } = content;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.3), spanY = Math.max(maxY - minY, 0.3);
  // 视图内容按共用比例尺绘制，在格子里居中
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const map = (p) => ({
    x: box.x + box.w / 2 + (p.x - cx) * scale,
    y: box.y + box.h / 2 - (p.y - cy) * scale,
  });

  let out = `<g clip-path="url(#clip-${uid})">`;

  // 地面线 + 短斜线
  const gy = map({ x: 0, y: 0 }).y;
  if (gy > box.y - 1 && gy < box.y + box.h + 1) {
    out += `<line x1="${f1(box.x)}" y1="${f1(gy)}" x2="${f1(box.x + box.w)}" y2="${f1(gy)}" stroke="${C.ground}" stroke-width="1.2"/>`;
    for (let i = 0; i < 7; i++) {
      const x0 = box.x + 6 + (i * (box.w - 12)) / 7;
      out += `<line x1="${f1(x0)}" y1="${f1(gy)}" x2="${f1(x0 - 5)}" y2="${f1(gy + 6)}" stroke="${C.ground}" stroke-width="0.8" opacity="0.7"/>`;
    }
  }

  // 高度比例尺（仅正面视图）
  if (ruler) {
    const rx = box.x + 4;
    const steps = [];
    for (let h = 0; h <= 2.01; h += 0.5) {
      const py = map({ x: 0, y: h }).y;
      if (py > box.y + 8 && py < box.y + box.h - 2) steps.push({ h, py });
    }
    if (steps.length >= 2) {
      out += `<line x1="${f1(rx)}" y1="${f1(steps[0].py)}" x2="${f1(rx)}" y2="${f1(steps[steps.length - 1].py)}" stroke="${C.grid}" stroke-width="1"/>`;
      for (const s of steps) {
        out += `<line x1="${f1(rx - 3)}" y1="${f1(s.py)}" x2="${f1(rx + 3)}" y2="${f1(s.py)}" stroke="${C.grid}" stroke-width="1"/>`;
        out += `<text x="${f1(rx + 5)}" y="${f1(s.py + 3)}" font-size="8.5" fill="${C.faint}">${s.h === 0 ? "0" : `${s.h}m`}</text>`;
      }
    }
  }

  out += drawMarks(marks, map, box, uid, view);

  // 身体：按深度排序画壳
  const sorted = [...polys].sort((a, b) => a.depth - b.depth);
  for (const poly of sorted) {
    const mapped = poly.pts.map((p) => map({ x: p[0], y: p[1] }));
    const fill = poly.isSkirt ? C.skirt : poly.isHair ? C.hair : C.body;
    const edge = poly.isSkirt ? C.skirtEdge : poly.isHair ? C.hairEdge : C.bodyEdge;
    out += `<path d="M ${mapped.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L ")} Z" fill="${fill}" stroke="${edge}" stroke-width="1"/>`;
  }
  // 关节
  for (const j of joints) {
    const m = map(j);
    out += `<circle cx="${f1(m.x)}" cy="${f1(m.y)}" r="1.9" fill="${C.joint}" stroke="${C.jointEdge}" stroke-width="0.9"/>`;
  }
  out += "</g>";
  return out;
}

/* ───────────────────────── 页面 ───────────────────────── */

const PAGE_W = 1754;
const PAGE_H = 1544;
const HEADER_H = 104, FOOTER_H = 40;
const CARD_H = 262, GAP = 18, MARGIN_X = 36, COL_GAP = GAP;
const MAX_ROWS = 5;

// 徽标宽度：CJK 全宽、拉丁/数字半宽估算
function badgeWidth(text) {
  let w = 0;
  for (const ch of String(text)) w += /[\u0000-ÿ]/.test(ch) ? 6.4 : 11.2;
  return w + 16;
}

function headerSvg({ title, en, accent, metaLines, count }) {
  let out = `<rect x="${MARGIN_X}" y="26" width="9" height="52" rx="2" fill="${accent}"/>`;
  out += `<text x="${MARGIN_X + 22}" y="44" font-size="11.5" letter-spacing="2.5" fill="${C.faint}" font-weight="600">STORYBOARD POSE LIBRARY · 分镜预设动作图鉴</text>`;
  out += `<text x="${MARGIN_X + 22}" y="78" font-size="28" font-weight="700" fill="${C.ink}">${esc(title)}<tspan font-size="14" font-weight="500" fill="${C.faint}" dx="12">${esc(en)} · ${count} 式</tspan></text>`;
  const rx = PAGE_W - MARGIN_X;
  metaLines.forEach((line, i) => {
    out += `<text x="${rx}" y="${40 + i * 19}" font-size="12" fill="${C.faint}" text-anchor="end">${esc(line)}</text>`;
  });
  out += `<line x1="${MARGIN_X}" y1="${HEADER_H - 10}" x2="${PAGE_W - MARGIN_X}" y2="${HEADER_H - 10}" stroke="${C.grid}" stroke-width="1.2"/>`;
  return out;
}

function footerSvg({ pageNo, total, note }) {
  const y = PAGE_H - 14;
  return `<text x="${MARGIN_X}" y="${y}" font-size="11" fill="${C.faint}">${esc(note)}</text>
<text x="${PAGE_W - MARGIN_X}" y="${y}" font-size="11" fill="${C.faint}" text-anchor="end">第 ${pageNo} / ${total} 页 · 共 118 式</text>`;
}

function cardSvg({ def, contentFront, contentSide, scale, box, accent, ruler }) {
  const { x, y, w, h } = box;
  let out = `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="10" fill="#ffffff" stroke="${C.grid}" stroke-width="1.2"/>`;
  // 名称 + 环境徽标
  out += `<text x="${f1(x + 14)}" y="${f1(y + 25)}" font-size="16.5" font-weight="700" fill="${C.ink}">${esc(def.name)}</text>`;
  const badge = envBadge(def);
  if (badge) {
    const bw = badgeWidth(badge);
    out += `<rect x="${f1(x + w - 14 - bw)}" y="${f1(y + 10)}" width="${f1(bw)}" height="20" rx="10" fill="${accent}" opacity="0.1"/>`;
    out += `<text x="${f1(x + w - 14 - bw / 2)}" y="${f1(y + 24)}" font-size="11" fill="${accent}" text-anchor="middle" font-weight="600">${esc(badge)}</text>`;
  }
  // 两个视图
  const viewsTop = y + 36, viewsH = h - 36 - 22;
  const fw = Math.round(w * 0.54), gapLine = 1;
  const fBox = { x: x + 6, y: viewsTop, w: fw - 10, h: viewsH };
  const sBox = { x: x + fw + gapLine + 6, y: viewsTop, w: w - fw - 16, h: viewsH };
  out += `<line x1="${f1(x + fw)}" y1="${f1(viewsTop + 4)}" x2="${f1(x + fw)}" y2="${f1(viewsTop + viewsH - 4)}" stroke="${C.grid}" stroke-width="1"/>`;
  const uid = `${def.id}-f`;
  out += `<clipPath id="clip-${uid}"><rect x="${f1(fBox.x)}" y="${f1(fBox.y)}" width="${f1(fBox.w)}" height="${f1(fBox.h)}"/></clipPath>`;
  out += drawView({ content: contentFront, view: "front", box: fBox, scale, uid, ruler });
  const uid2 = `${def.id}-s`;
  out += `<clipPath id="clip-${uid2}"><rect x="${f1(sBox.x)}" y="${f1(sBox.y)}" width="${f1(sBox.w)}" height="${f1(sBox.h)}"/></clipPath>`;
  out += drawView({ content: contentSide, view: "side", box: sBox, scale, uid: uid2, ruler: false });
  // 视图小标
  out += `<text x="${f1(fBox.x + 4)}" y="${f1(viewsTop + 12)}" font-size="9" fill="${C.faint}" opacity="0.85">正面</text>`;
  out += `<text x="${f1(sBox.x + 4)}" y="${f1(viewsTop + 12)}" font-size="9" fill="${C.faint}" opacity="0.85">侧面</text>`;
  // id
  out += `<text x="${f1(x + w / 2)}" y="${f1(y + h - 8)}" font-size="10.5" fill="${C.faint}" text-anchor="middle" font-family="ui-monospace, Menlo, monospace">${esc(def.id)}</text>`;
  return out;
}

/* ───────────────────────── 主流程 ───────────────────────── */

function parseArgs(argv) {
  const args = { out: null, svgOnly: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--svg-only") args.svgOnly = true;
    else if (argv[i] === "--only") args.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(PROFILE)) {
    console.error(`找不到模型实测档案：${PROFILE}`);
    process.exit(2);
  }
  const profile = loadProfile(PROFILE);
  const model = createModel(profile);
  const presetDefs = await loadPresets(POSES_TS);
  const presets = presetMap(presetDefs);
  const byId = new Map(presetDefs.map((d) => [d.id, d]));
  const idxMap = boneIndexMap(profile);

  // 覆盖校验：不多不少
  const seen = new Set();
  for (const cat of CATEGORIES) {
    for (const id of cat.ids) {
      if (!byId.has(id)) throw new Error(`类别 ${cat.key} 里的 id 不存在：${id}`);
      if (seen.has(id)) throw new Error(`id 重复归类：${id}`);
      seen.add(id);
    }
  }
  const missing = presetDefs.filter((d) => !seen.has(d.id)).map((d) => d.id);
  if (missing.length) throw new Error(`未归类的预设：${missing.join(", ")}`);

  const only = args.only?.length
    ? CATEGORIES.filter((c) => args.only.some((o) => c.key === o || c.title.includes(o)))
    : CATEGORIES;
  if (!only.length) { console.error("--only 没有匹配到类别"); process.exit(2); }

  // 审计 + 收集每式的两个视图
  const audits = new Map();
  for (const def of presetDefs) {
    audits.set(def.id, auditOne({ def, profile, model, presets }));
  }

  const pages = [];
  let pageNo = 0;
  const TOTAL = only.length + 1;

  // ── 分类页 ──
  for (const cat of only) {
    pageNo++;
    const defs = cat.ids.map((id) => byId.get(id));
    const cols = defs.length > 20 ? 5 : 4;
    const rows = Math.ceil(defs.length / cols);
    const gridW = PAGE_W - MARGIN_X * 2;
    const cardW = (gridW - (cols - 1) * COL_GAP) / cols;
    // 同页共用比例尺：所有视图都能放下
    let scale = Infinity;
    const contents = new Map();
    for (const def of defs) {
      const a = audits.get(def.id);
      const cf = collectView({ baked: a.baked, profile, idxMap, props: a.props, view: "front" });
      const cs = collectView({ baked: a.baked, profile, idxMap, props: a.props, view: "side" });
      contents.set(def.id, { cf, cs });
      for (const [content, box] of [[cf, { w: cardW * 0.54 - 10, h: CARD_H - 58 }], [cs, { w: cardW * 0.46 - 16, h: CARD_H - 58 }]]) {
        const xs = content.pts.map((p) => p.x), ys = content.pts.map((p) => p.y);
        const sx = box.w / Math.max(Math.max(...xs) - Math.min(...xs), 0.3);
        const sy = box.h / Math.max(Math.max(...ys) - Math.min(...ys), 0.3);
        scale = Math.min(scale, sx * 0.97, sy * 0.97);
      }
    }
    const gridH = rows * (CARD_H + GAP) - GAP;
    const startY = HEADER_H + Math.max(14, (PAGE_H - FOOTER_H - HEADER_H - gridH) / 2);

    let body = "";
    defs.forEach((def, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const { cf, cs } = contents.get(def.id);
      body += cardSvg({
        def, contentFront: cf, contentSide: cs, scale, accent: cat.accent, ruler: true,
        box: {
          x: MARGIN_X + col * (cardW + COL_GAP),
          y: startY + row * (CARD_H + GAP),
          w: cardW, h: CARD_H,
        },
      });
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="${FONT}">
<rect width="${PAGE_W}" height="${PAGE_H}" fill="${C.bg}"/>
${headerSvg({ title: cat.title, en: cat.en, accent: cat.accent, count: defs.length, metaLines: [
  `模型 御坂美琴（mikoto）· 身高 ${profile.measurements?.height?.toFixed(2) ?? "?"} m · PMX 实测骨架`,
  "每格 左＝正面 · 右＝侧面 · 同页共用比例尺",
  "虚线 = 验收环境（座面 / 墙面 / 栏杆）· ${DATE}".replace("${DATE}", TODAY),
] })}
${body}
${footerSvg({ pageNo, total: TOTAL, note: `storyboard · tools/pose-analysis/preset-atlas.mjs · ${TODAY}` })}
</svg>`;
    pages.push({ name: `${String(pageNo).padStart(2, "0")}-${cat.title.replace(/[ ·]/g, "")}`, svg });
  }

  // ── 总览页 ──
  pageNo++;
  {
    const cols = 10;
    const miniW = (PAGE_W - MARGIN_X * 2 - (cols - 1) * 10) / cols;
    const miniH = 108;
    // 与分类页同序：按类别 → 类内原顺序
    const catOf = new Map();
    for (const cat of CATEGORIES) for (const id of cat.ids) catOf.set(id, cat);
    const ordered = CATEGORIES.flatMap((c) => c.ids.map((id) => byId.get(id)));
    const rows = Math.ceil(ordered.length / cols);
    const gridH = rows * (miniH + 8) - 8;
    const startY = HEADER_H + 12;
    // 总览共用比例尺（同页一致；分类页各自一致）
    let scale = Infinity;
    const contents = new Map();
    for (const def of ordered) {
      const a = audits.get(def.id);
      const cf = collectView({ baked: a.baked, profile, idxMap, props: a.props, view: "front" });
      contents.set(def.id, cf);
      const xs = cf.pts.map((p) => p.x), ys = cf.pts.map((p) => p.y);
      scale = Math.min(
        scale,
        (miniW - 12) / Math.max(Math.max(...xs) - Math.min(...xs), 0.3) * 0.97,
        (miniH - 34) / Math.max(Math.max(...ys) - Math.min(...ys), 0.3) * 0.97,
      );
    }
    let body = "";
    ordered.forEach((def, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cat = catOf.get(def.id);
      const x = MARGIN_X + col * (miniW + 10), y = startY + row * (miniH + 8);
      const bx = { x: x + 6, y: y + 3, w: miniW - 12, h: miniH - 32 };
      const uid = `ov-${def.id}`;
      body += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(miniW)}" height="${f1(miniH)}" rx="8" fill="#ffffff" stroke="${C.grid}" stroke-width="1"/>`;
      body += `<clipPath id="clip-${uid}"><rect x="${f1(bx.x)}" y="${f1(bx.y)}" width="${f1(bx.w)}" height="${f1(bx.h)}"/></clipPath>`;
      body += drawView({ content: contents.get(def.id), view: "front", box: bx, scale, uid, ruler: false });
      body += `<circle cx="${f1(x + 12)}" cy="${f1(y + miniH - 13)}" r="3.4" fill="${cat.accent}"/>`;
      body += `<text x="${f1(x + 21)}" y="${f1(y + miniH - 9)}" font-size="11.5" font-weight="600" fill="${C.ink}">${esc(def.name)}</text>`;
    });

    // 图例：横向排开
    let legend = "", lx = MARGIN_X;
    for (const c of CATEGORIES) {
      const label = `${c.title} ${c.ids.length}`;
      legend += `<g transform="translate(${f1(lx)},${startY + gridH + 16})"><circle cx="3.4" cy="-3.5" r="3.4" fill="${c.accent}"/><text x="13" y="0" font-size="11" fill="${C.ink}">${esc(label)}</text></g>`;
      lx += 13 + [...label].reduce((w, ch) => w + (/[\u0000-ÿ]/.test(ch) ? 6 : 11), 0) + 22;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="${FONT}">
<rect width="${PAGE_W}" height="${PAGE_H}" fill="${C.bg}"/>
<rect x="${MARGIN_X}" y="26" width="9" height="52" rx="2" fill="${C.ink}"/>
<text x="${MARGIN_X + 22}" y="44" font-size="11.5" letter-spacing="2.5" fill="${C.faint}" font-weight="600">STORYBOARD POSE LIBRARY · 分镜预设动作图鉴</text>
<text x="${MARGIN_X + 22}" y="78" font-size="28" font-weight="700" fill="${C.ink}">总览<tspan font-size="14" font-weight="500" fill="${C.faint}" dx="12">118 式 · ${CATEGORIES.length} 类 · 正面视图</tspan></text>
<text x="${PAGE_W - MARGIN_X}" y="40" font-size="12" fill="${C.faint}" text-anchor="end">模型 御坂美琴（mikoto）· 身高 ${profile.measurements?.height?.toFixed(2) ?? "?"} m · PMX 实测骨架</text>
<text x="${PAGE_W - MARGIN_X}" y="59" font-size="12" fill="${C.faint}" text-anchor="end">全部缩略图共用比例尺 · 顺序与分类页一致</text>
<text x="${PAGE_W - MARGIN_X}" y="78" font-size="12" fill="${C.faint}" text-anchor="end">${TODAY}</text>
<line x1="${MARGIN_X}" y1="${HEADER_H - 10}" x2="${PAGE_W - MARGIN_X}" y2="${HEADER_H - 10}" stroke="${C.grid}" stroke-width="1.2"/>
${legend}
<text x="${PAGE_W - MARGIN_X}" y="${startY + gridH + 20}" font-size="11" fill="${C.faint}" text-anchor="end">第 ${pageNo} / ${TOTAL} 页 · 共 118 式</text>
<text x="${PAGE_W - MARGIN_X}" y="${startY + gridH + 37}" font-size="11" fill="${C.faint}" text-anchor="end">storyboard · tools/pose-analysis/preset-atlas.mjs · ${TODAY}</text>
${body}
</svg>`;
    pages.unshift({ name: "00-总览", svg });
  }

  // ── 输出 ──
  const outDir = resolve((args.out ?? join(homedir(), "Downloads")).replace(/^~(?=\/)/, homedir()));
  const svgDir = join(dirname(fileURLToPath(import.meta.url)), "atlas");
  mkdirSync(svgDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  for (const p of pages) {
    const svgPath = join(svgDir, `预设动作图鉴-${p.name}.svg`);
    writeFileSync(svgPath, p.svg);
    if (args.svgOnly) {
      console.log(`SVG ${svgPath}`);
      continue;
    }
    const pngPath = join(outDir, `预设动作图鉴-${p.name}.png`);
    try {
      execFileSync("rsvg-convert", ["-z", "1.5", "-o", pngPath, svgPath], { stdio: "inherit" });
      console.log(`PNG ${pngPath}`);
    } catch {
      console.error(`rsvg-convert 不可用，只输出 SVG：${svgPath}`);
    }
  }
  console.log(`\n完成：${only.length + 1} 页 · 118 式 · 比例尺随页共用`);
}

main().catch((e) => { console.error(e); process.exit(1); });
