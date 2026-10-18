// 生成「预设动作展示」分镜项目：每式一镜，共 118 镜，供在工具里逐镜审阅。
// 环境（座面/台沿/墙面/栏杆）直接复用 preset-audit 的虚拟道具——位置都经过几何验收。
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadProfile, loadPresets, presetMap, createModel } from "./kinematics.mjs";
import { auditOne } from "./preset-audit.mjs";

const ROOT = "/home/cxy/storyboard";
const profile = loadProfile(join(ROOT, "tools/pose-analysis/profiles/local/mikoto-pmx.json"));
const model = createModel(profile);
const presetDefs = await loadPresets(join(ROOT, "src/data/poses.ts"));
const presets = presetMap(presetDefs);
const byId = new Map(presetDefs.map((d) => [d.id, d]));

const CATEGORIES = [
  { key: "standing", title: "站姿", ids: ["stand","stand_relaxed","contrapposto","model_s","legs_crossed","hands_clasped_front","hands_behind","hands_on_hips","arms_crossed","arms_out","look_back","look_over_shoulder","look_up","bow","shrug","stretch","stretch_side","lean_forward","lean_forward_hands_back","hands_on_thighs"] },
  { key: "gesture", title: "手势", ids: ["wave","wave_high","wave_both","point","point_up","point_side","peace_sign","peace_eye","cat_pose","heart_over_head","heart_hands","blow_kiss","praying","salute","fist_cheer","arms_up","arms_behind_head","hand_to_chin","hand_in_hair","shade_eyes","adjust_collar","adjust_hat","surprise","cover_face","selfie"] },
  { key: "props", title: "手持道具", ids: ["phone_call","phone_text","carry_bag","carry_bag_shoulder","hold_umbrella","hold_camera","hold_book","hold_flowers","hold_cup","hold_hat","hold_skirt"] },
  { key: "motion", title: "走跑跳", ids: ["walk","walk_stride","walk_lookback","run","run_lookback","jump","tiptoe","tiptoe_look","kick_back","spin_skirt","reach_up"] },
  { key: "seat", title: "坐姿椅凳", ids: ["sit_chair","sit_chair_leg_lifted","sit_chair_leaning","sit_chair_hands_knees","sit_steps","sit_curb","sit_stool","sit_ledge","sit_ledge_hands_back","sit_ledge_lookback","sit_ledge_swing_legs"] },
  { key: "floor", title: "坐姿地面", ids: ["sit_floor","sit_cross","sit_back","sit_hug_one","sit_side","sit_floor_ankle_cross","sit_floor_side_lean","sit_floor_stretch","sit_floor_lookup","sit_floor_hands_knees","sit_kneel_side"] },
  { key: "kneel", title: "跪蹲", ids: ["kneel","kneel_one","kneel_sit","kneel_lookback","kneel_back_arch","crouch","squat_hug"] },
  { key: "lying", title: "躺趴", ids: ["lie_back","lie_back_arms_up","lie_back_knees_bent","lie_back_side_look","lie_back_one_knee_up","lie_side","lie_side_head_rest","lie_side_fetal","lie_side_arm_forward","lie_stomach","lie_stomach_chin","lie_stomach_kick"] },
  { key: "lean", title: "倚靠", ids: ["hand_on_wall","hand_on_wall_lookback","lean_wall","lean_wall_lookback","lean_wall_one_foot","back_to_wall_hands_behind","lean_rail","lean_rail_side","lean_rail_lookdown","rail_lookback"] },
];

// 覆盖校验
{
  const seen = new Set();
  for (const cat of CATEGORIES) for (const id of cat.ids) {
    if (!byId.has(id)) throw new Error(`未知 id：${id}`);
    if (seen.has(id)) throw new Error(`重复归类：${id}`);
    seen.add(id);
  }
  const missing = presetDefs.filter((d) => !seen.has(d.id)).map((d) => d.id);
  if (missing.length) throw new Error(`未归类：${missing.join(", ")}`);
}

const DESC = {
  standing: (d) => `全身展示「${d.name}」的站姿形态与重心分布`,
  gesture: (d) => `「${d.name}」：手势与头部姿态，注意手肘高度与手腕方向`,
  props: (d) => `手持道具动作「${d.name}」，注意手与道具的接触位置`,
  motion: (d) => `动态瞬间「${d.name}」，注意四肢展开与运动趋势`,
  seat: (d) => `坐姿「${d.name}」，注意大腿折叠角度与脚的落点`,
  floor: (d) => `席地坐姿「${d.name}」，注意髋部贴地与腿部摆放`,
  kneel: (d) => `跪蹲动作「${d.name}」，注意膝盖承重与脚背贴地`,
  lying: (d) => `躺卧动作「${d.name}」，侧面机位看身体线条`,
  lean: (d) => `倚靠动作「${d.name}」，注意接触点与重心朝向`,
};

function badge(def) {
  const a = def.audit;
  if (!a) return "";
  if (a.kind === "seat") return `座面 ${a.top?.toFixed(2)}m`;
  if (a.kind === "ledge") return `台沿 ${a.top?.toFixed(2)}m`;
  if (a.kind === "wall-front") return "手扶墙";
  if (a.kind === "wall-back") return "倚墙";
  if (a.kind === "rail") return "栏杆";
  if (a.kind === "air") return `腾空 ${a.elevation?.toFixed(2)}m`;
  return "";
}

const PROP_LABEL = { chair: "椅子", platform: "台面", wall: "墙面", railing: "栏杆", stool: "高脚凳" };
// 每类的机位节奏：方位角循环、俯仰、焦段
const CAM = {
  standing: { az: [15, -20, 25, -15, 10], angle: "eye", focal: [50, 50, 65, 50, 50] },
  gesture: { az: [20, -25, 15, -10], angle: "eye", focal: [65, 50, 65, 50] },
  props: { az: [20, -20, 15], angle: "eye", focal: [50, 65, 50] },
  motion: { az: [25, -25, 15, -15], angle: "eye", focal: [50, 40, 50, 40] },
  seat: { az: [30, -30, 20], angle: "eye", focal: [50, 50, 65] },
  floor: { az: [35, -35, 25], angle: "eye", focal: [50, 40, 50] },
  kneel: { az: [30, -30, 20], angle: "eye", focal: [50, 65, 50] },
  lying: { az: [90], angle: "high", focal: [40] },
  lean: { az: [25, -25, 20], angle: "eye", focal: [50, 50, 40] },
};

const shots = [];
let n = 0;
for (const cat of CATEGORIES) {
  cat.ids.forEach((id, i) => {
    n++;
    const def = byId.get(id);
    const a = auditOne({ def, profile, model, presets });
    const cam = CAM[cat.key];
    const az = cam.az[i % cam.az.length];
    const focal = cam.focal[i % cam.focal.length];
    // 道具：复用审计虚拟环境（位置/尺寸已过几何验收），换友好名字
    const props = (a.props ?? []).map((p, k) => ({
      id: `P${k + 1}`,
      model: id === "sit_stool" && p.model === "platform" ? "stool" : p.model,
      label: PROP_LABEL[id === "sit_stool" && p.model === "platform" ? "stool" : p.model] ?? p.label,
      position: p.position, facing: p.facing ?? 0, elevation: p.elevation ?? 0,
      size: id === "sit_stool" && p.model === "platform" ? [0.4, p.size[1], 0.4] : p.size,
    }));
    const bd = badge(def);
    shots.push({
      id: `S${String(n).padStart(3, "0")}`,
      name: `${cat.title} · ${def.name}`,
      description: DESC[cat.key](def),
      notes: `preset: ${def.id}${bd ? ` · ${bd}` : ""}`,
      duration: 2,
      camera: { mode: "auto", subject: "A", shotSize: "FS", focalLength: focal, azimuth: az, angle: cam.angle, placement: "center" },
      actors: [{
        id: "A", label: def.name, model: "mikoto",
        position: [0, 0], facing: 0, autoGround: true,
        ...(a.elevation ? { elevation: a.elevation } : {}),
        pose: { preset: id },
      }],
      props,
      lights: [
        { id: "L1", role: "key", type: "soft", subject: "A", azimuth: 45, elevation: 35, distance: 3, intensity: 1, colorTemp: 5600, showStand: false },
        { id: "L2", role: "fill", type: "soft", subject: "A", azimuth: -45, elevation: 15, distance: 3, intensity: 0.4, colorTemp: 5600, showStand: false },
        { id: "L3", role: "rim", type: "soft", subject: "A", azimuth: 155, elevation: 40, distance: 3, intensity: 0.55, colorTemp: 5600, showStand: false },
      ],
      environment: { sky: "studio", background: "#c8d8e4", ground: "studio", floor: "plain" },
    });
  });
}

const project = { version: 1, title: "预设动作展示", aspect: "3:2", sensor: "FF", shots };
const out = process.argv[2]?.replace(/^~(?=\/)/, homedir()) ?? join(homedir(), "Downloads", "预设动作展示.storyboard.json");
writeFileSync(out, JSON.stringify(project, null, 2));
console.log(`${out} · ${shots.length} 镜`);
