// 预设验收：给每个内置姿势配一个「虚拟环境」，再用实测骨架算它是否成立。
//
// 为什么需要虚拟环境：
//   「坐椅子」「扶墙」「趴栏杆」本身不是完整的动作描述——没有椅/墙/栏杆就无法验收。
//   与其把它们排除在 CI 之外，不如按预设声明的语义搭一个最小场景：
//     · seat/ledge：在臀部正下方放座面，顶面高度按标准家具（椅 0.45m、台沿 0.58m）
//     · wall-front / wall-back：在指尖或后背的接触面放一堵竖直墙
//     · rail：在双手下方放一道栏杆，顶面取双手高度
//   然后照常跑 evaluate.mjs。这样「预设本身做不到位」仍然会被抓出来，
//   而不是被「场景里没道具」掩盖。
//
// 这里不渲染、不截图；所有结论都来自 bake() 之后的骨架、突出点和胶囊。
import { add, sub, mul, dist, len, norm, deg, rad, qAxis, qRot, polygonMargin } from "./vec.mjs";
import {
  bake, hullPoints, toWorld, supportPolygon, centerOfMass, collisions,
  jointAngles, landmark, SOFT_GROUND_BONES,
} from "./kinematics.mjs";
import { evaluatePose, LEVEL_ORDER } from "./evaluate.mjs";

/** 预设可以声明的验收环境。不写 = 平地自由动作。 */
export const DEFAULT_AUDIT = { kind: "stand" };

const BONE_PELVIS = ["下半身"];
const BONE_TORSO_BACK = ["上半身", "上半身2"];
// 后脑勺是躯干后面最突出的硬表面（发/裙已按软布料排除），
// 倚墙时它和肩背、臀部一起构成接触面。墙只能放到这组点的最后方。
const BONE_BACK_CONTACT = [...BONE_TORSO_BACK, ...BONE_PELVIS, "頭"];

/** 某组骨骼突出点的最低 y（body 空间） */
export function lowOfBones(baked, profile, names) {
  let y = Infinity, at = null;
  for (const h of hullPoints(baked, profile)) {
    if (!names.includes(h.bone)) continue;
    if (h.p[1] < y) { y = h.p[1]; at = h.p; }
  }
  return { y, at };
}

/** 某组骨骼突出点的最靠后 z（世界坐标；-z 是背面） */
function backZOf(baked, profile, names) {
  let z = Infinity;
  for (const h of hullPoints(baked, profile)) {
    if (!names.includes(h.bone)) continue;
    const w = toWorld(baked, h.p);
    if (w[2] < z) z = w[2];
  }
  return z;
}

function findPropSeat(ctx, pelvisWorld) {
  for (const prop of ctx.props ?? []) {
    const shape = prop.model;
    if (!/chair|stool|sofa|bench|platform|box/.test(shape)) continue;
    return { prop, shape, top: (prop.elevation ?? 0) + (prop.size?.[1] ?? 0.45) };
  }
  return null;
}

function makeFinding(code, level, title, detail, extra = {}) {
  return { code, level, category: "audit", title, detail, ...extra };
}

/**
 * 计算一个预设的验收上下文并跑 evaluate。
 * @returns {{def, env, baked, props, actor, findings, summary, metrics, elevation}}
 */
export function auditOne({ def, profile, model, presets }) {
  const env = def.audit ?? DEFAULT_AUDIT;
  const kind = env.kind ?? "stand";
  const baseActor = {
    id: "preset", label: def.name, position: [0, 0], facing: 0,
    elevation: 0, autoGround: true,
  };
  let actor = { ...baseActor };
  const props = [];
  const extra = [];

  const bakeAt = (elevation = 0) => bake(model, resolvePreset(def, presets), {
    elevation, autoGround: true, facing: 0, position: [0, 0],
    groundExclude: SOFT_GROUND_BONES,
  });

  // ── 1) 先按平地摆一次，量出身体接触高度 ──
  let baked = bakeAt(0);
  const pelvis = lowOfBones(baked, profile, BONE_PELVIS);

  if (kind === "seat") {
    const top = env.top ?? 0.45;
    const tol = env.tol ?? 0.05;
    // 座面放在臀部正下方；evaluate 会自己算「臀部 − 座面」的间隙
    const pw = toWorld(baked, pelvis.at ?? baked.joint.hips.pos);
    props.push({
      id: "audit-seat", model: "chair", label: `验收座面 ${top.toFixed(2)}m`,
      position: [pw[0], pw[2]], facing: 0, elevation: 0,
      size: [0.44, top, 0.44],
    });
    if (Math.abs(pelvis.y - top) > tol) {
      extra.push(makeFinding(
        "audit-seat-height", "error",
        `坐椅子：臀部高度 ${(pelvis.y * 100).toFixed(0)} cm，标准座面 ${(top * 100).toFixed(0)} cm`,
        `差 ${((pelvis.y - top) * 100).toFixed(0)} cm（允许 ±${(tol * 100).toFixed(0)} cm）。`
          + "调大腿前抬/膝盖回折，让脚落地时臀部正好落在座面高度。",
        { at: pelvis.at, metrics: { pelvisLow: pelvis.y, seatTop: top } },
      ));
    }
    // 脚必须落地，膝盖角度合理
    const foot = Math.min(
      lowOfBones(baked, profile, ["左足首"]).y,
      lowOfBones(baked, profile, ["右足首"]).y,
    );
    if (foot > 0.035) {
      extra.push(makeFinding(
        "audit-seat-feet", "warn",
        `坐椅子：脚离地 ${(foot * 100).toFixed(0)} cm`,
        "椅坐时双脚应踩地；除非预设名明确是「高脚凳/台沿垂腿」。",
        { at: baked.joint.foot_R.pos },
      ));
    }
    const ang = jointAngles(baked);
    if (ang.knee_R < 65 || ang.knee_R > 120) {
      extra.push(makeFinding(
        "audit-seat-knee", "warn",
        `椅坐膝角 ${ang.knee_R.toFixed(0)}°，不像自然坐姿`,
        "椅子坐姿膝角通常在 75–110°。",
        { at: baked.joint.lowerLeg_R.pos },
      ));
    }
  } else if (kind === "ledge") {
    // 台沿：脚悬空。先把人整体抬到「臀部 = 台沿顶面」
    const top = env.top ?? 0.58;
    const tol = env.tol ?? 0.05;
    const elevation = top - pelvis.y;
    actor = { ...actor, elevation };
    baked = bakeAt(elevation);
    const pw = toWorld(baked, baked.joint.hips.pos);
    const foot = Math.min(
      lowOfBones(baked, profile, ["左足首"]).y,
      lowOfBones(baked, profile, ["右足首"]).y,
    );
    const toe = Math.min(
      landmark(baked, profile, "toe_L")?.[1] ?? Infinity,
      landmark(baked, profile, "toe_R")?.[1] ?? Infinity,
    );
    props.push({
      id: "audit-ledge", model: "platform", label: `验收台沿 ${top.toFixed(2)}m`,
      position: [pw[0], pw[2]], facing: 0, elevation: 0,
      size: [1.2, top, 0.62],
    });
    const butt = lowOfBones(baked, profile, BONE_PELVIS);
    if (Math.abs(butt.y - top) > tol) {
      extra.push(makeFinding(
        "audit-ledge-height", "error",
        `台沿坐：臀部高度 ${(butt.y * 100).toFixed(0)} cm，台沿 ${(top * 100).toFixed(0)} cm`,
        "抬 elevation 后臀部仍未对齐台沿；检查腿部姿势是否改变了臀部相对脚的高度。",
        { at: butt.at },
      ));
    }
    if (Math.min(foot, toe) < 0.12) {
      extra.push(makeFinding(
        "audit-ledge-dangle", "warn",
        `台沿坐：脚只离地 ${(Math.min(foot, toe) * 100).toFixed(0)} cm，没有悬空`,
        `台沿高 ${(top * 100).toFixed(0)} cm 时，小腿应自然垂下、脚离地。`
          + "如果脚掌踩到了地面，看起来会像坐在矮凳上。",
        { at: baked.joint.foot_R.pos },
      ));
    }
  } else if (kind === "floor") {
    // 平地坐/跪/躺：裙摆不参与落地（bake 已排除），检查接触与平衡由 evaluate 做
  } else if (kind === "wall-front") {
    // 手扶墙：墙放在指尖前方 5mm
    const tip = landmark(baked, profile, "finger_R") ?? baked.joint.hand_R.pos;
    const shoulder = baked.joint.upperArm_R.pos;
    const reach = tip[2] - shoulder[2];
    props.push({
      id: "audit-wall", model: "wall", label: "验收墙面",
      position: [0, tip[2] + 0.005 + 0.075], facing: 0, elevation: 0,
      size: [4, 2.8, 0.15],
    });
    if (reach < 0.28) {
      extra.push(makeFinding(
        "audit-wall-reach", "error",
        `扶墙：手只在肩前 ${(reach * 100).toFixed(0)} cm`,
        "扶墙时手臂应向前伸到 30cm 以上；现在更像手垂在身侧。",
        { at: tip, metrics: { reach } },
      ));
    }
    if (Math.abs(tip[1] - shoulder[1]) > 0.30) {
      extra.push(makeFinding(
        "audit-wall-height", "warn",
        `扶墙：手比肩${tip[1] > shoulder[1] ? "高" : "低"} ${(Math.abs(tip[1] - shoulder[1]) * 100).toFixed(0)} cm`,
        "扶墙手通常与肩同高或略低（胸–肩之间）。",
        { at: tip },
      ));
    }
  } else if (kind === "wall-back") {
    // 倚墙：墙面贴住躯干/骨盆的最后点（这两处才是靠墙的接触面），
    // 再由 evaluate 的 prop-embed 检查腿脚有没有穿到墙里——
    // 真人倚墙时脚一定在墙面前方。
    const bz = backZOf(baked, profile, BONE_BACK_CONTACT);
    const chestZ = backZOf(baked, profile, ["上半身2"]);
    const pelvisZ = backZOf(baked, profile, ["下半身"]);
    const lean = pelvisZ - chestZ; // 正数 = 肩背比臀部更靠后（-z 为背面）
    props.push({
      id: "audit-wall", model: "wall", label: "验收墙面",
      position: [0, bz - 0.005 - 0.075], facing: 0, elevation: 0,
      size: [4, 2.8, 0.15],
    });
    if (lean < 0.035) {
      extra.push(makeFinding(
        "audit-wall-lean", "error",
        `倚墙：肩背只比臀部靠后 ${(lean * 100).toFixed(0)} cm，不像在倚靠`,
        "倚墙需要上身向后靠（肩背比骨盆更接近墙面）；现在只是站在墙边。"
          + "增加脊柱后仰（spine.bend 负值）或让骨盆前移。",
        { at: baked.joint.chest.pos, metrics: { lean } },
      ));
    }
    if (lean > 0.22) {
      extra.push(makeFinding(
        "audit-wall-lean-too-much", "warn",
        `倚墙：上身比臀部靠后 ${(lean * 100).toFixed(0)} cm，后仰过度`,
        "超过 22cm 已接近摔倒；真人倚墙时肩背比骨盆靠后 4–15cm。",
        { at: baked.joint.chest.pos, metrics: { lean } },
      ));
    }
    const foot = Math.min(
      lowOfBones(baked, profile, ["左足首"]).y,
      lowOfBones(baked, profile, ["右足首"]).y,
    );
    if (foot > 0.035) {
      extra.push(makeFinding("audit-wall-foot", "warn", `倚墙：脚离地 ${(foot * 100).toFixed(0)} cm`, "倚墙时至少一只脚应踩实地面。", { at: baked.joint.foot_R.pos }));
    }
  } else if (kind === "rail") {
    const handL = baked.joint.hand_L.pos, handR = baked.joint.hand_R.pos;
    const handY = (handL[1] + handR[1]) / 2;
    const handZ = (handL[2] + handR[2]) / 2;
    const top = env.top ?? handY;
    props.push({
      id: "audit-rail", model: "railing", label: `验收栏杆 ${top.toFixed(2)}m`,
      position: [0, handZ + 0.035], facing: 0, elevation: 0,
      size: [4, top, 0.06],
    });
    if (Math.abs(handL[1] - handR[1]) > 0.10) {
      extra.push(makeFinding(
        "audit-rail-level", "warn",
        `栏杆：双手高度差 ${(Math.abs(handL[1] - handR[1]) * 100).toFixed(0)} cm`,
        "双手扶同一根横杆时高度应接近（<10cm）。",
        { at: mul(add(handL, handR), 0.5) },
      ));
    }
    if (top < 0.80 || top > 1.20) {
      extra.push(makeFinding(
        "audit-rail-height", "warn",
        `栏杆：手的高度 ${(top * 100).toFixed(0)} cm 不像常见栏杆`,
        "常见栏杆/扶手顶面在 85–115cm；太低像压在桌沿，太高像扶着窗框。",
        { at: mul(add(handL, handR), 0.5) },
      ));
    }
    const chestZ = baked.joint.chest.pos[2];
    if (handZ - chestZ < 0.10) {
      extra.push(makeFinding(
        "audit-rail-reach", "warn",
        `栏杆：手只在胸前 ${((handZ - chestZ) * 100).toFixed(0)} cm`,
        "扶栏时手应在身体前方 10cm 以上。",
        { at: baked.joint.hand_R.pos },
      ));
    }
  } else if (kind === "air") {
    const elevation = env.elevation ?? 0.28;
    actor = { ...actor, elevation };
    baked = bakeAt(elevation);
  }

  const support = supportPolygon(baked, profile);
  const com = centerOfMass(baked, profile);
  let margin = support.poly.length ? polygonMargin([com.pos[0], com.pos[2]], support.poly) : -Infinity;

  // 坐在座面/台沿上时，支撑面还应包含座面本身，而不是只有脚
  if (kind === "seat" || kind === "ledge") {
    const seat = findPropSeat({ props }, toWorld(baked, baked.joint.hips.pos));
    if (seat) {
      const pw = toWorld(baked, baked.joint.hips.pos);
      const hw = (seat.prop.size?.[0] ?? 0.44) / 2;
      const hd = (seat.prop.size?.[2] ?? 0.44) / 2;
      const pts = support.points.map((p) => p.slice());
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([pw[0] + sx * hw, pw[2] + sz * hd]);
      const hull = awaitHull(pts);
      if (hull.length) margin = polygonMargin([com.pos[0], com.pos[2]], hull);
    }
  }

  const coll = collisions(baked, profile, { tol: 0.022 });
  const ev = evaluatePose({
    profile, baked, resolved: resolvePreset(def, presets), clamped: [],
    presetId: def.id, presetLabel: def.name, actor,
    props, propShapes: {}, gaze: null, envKind: kind,
    collisions: coll, support, com, margin,
  });

  const findings = [...ev.findings, ...extra];
  const summary = summarize(findings, def.id, def.name);
  return {
    def, env, baked, props, actor, elevation: actor.elevation ?? 0,
    findings, summary,
    metrics: { ...ev.metrics, margin, com, angles: jointAngles(baked) },
  };
}

/** 不引入 resolvePose 的循环依赖：这里只需要 presets 表 */
function resolvePreset(def, presets) {
  const raw = {};
  const merge = (p) => {
    if (!p?.joints) return;
    for (const [j, kv] of Object.entries(p.joints)) {
      raw[j] = { ...(raw[j] ?? {}), ...kv };
    }
  };
  merge(presets[def.id]);
  return normalize(raw);
}

// 与 resolvePose 相同的 limit 表（避免从 analyze 反向导入）
const LIMITS = {
  hips: { bend: [-180, 180], side: [-90, 90], twist: [-90, 90] },
  spine: { bend: [-30, 60], side: [-30, 30], twist: [-45, 45] },
  chest: { bend: [-30, 60], side: [-30, 30], twist: [-45, 45] },
  neck: { nod: [-60, 60], tilt: [-40, 40], turn: [-80, 80] },
  head: { nod: [-60, 60], tilt: [-40, 40], turn: [-80, 80] },
  upperArm_L: { pitch: [0, 180], yaw: [-60, 180], twist: [-90, 90] },
  upperArm_R: { pitch: [0, 180], yaw: [-60, 180], twist: [-90, 90] },
  lowerArm_L: { bend: [0, 150], side: [-70, 70] },
  lowerArm_R: { bend: [0, 150], side: [-70, 70] },
  hand_L: { bend: [-70, 70], side: [-30, 30] },
  hand_R: { bend: [-70, 70], side: [-30, 30] },
  upperLeg_L: { pitch: [-40, 130], yaw: [-30, 180], twist: [-45, 45] },
  upperLeg_R: { pitch: [-40, 130], yaw: [-30, 180], twist: [-45, 45] },
  lowerLeg_L: { bend: [0, 150] },
  lowerLeg_R: { bend: [0, 150] },
  foot_L: { point: [-45, 45] },
  foot_R: { point: [-45, 45] },
};
const NAMES = Object.keys(LIMITS);
function normalize(raw) {
  const out = {};
  for (const j of NAMES) {
    out[j] = {};
    for (const [k, [a, b]] of Object.entries(LIMITS[j])) {
      out[j][k] = Math.min(b, Math.max(a, raw[j]?.[k] ?? 0));
    }
  }
  return out;
}

function awaitHull(points) {
  // 小工具：凸包（与 vec.convexHull 相同算法，这里避免把 points 弄成只读）
  if (points.length < 3) return points;
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

export function summarize(findings, preset, label) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level] = (counts[f.level] ?? 0) + 1;
  const level = findings.reduce((w, f) => (LEVEL_ORDER[f.level] > LEVEL_ORDER[w] ? f.level : w), "info");
  return {
    preset, label, level, counts,
    ok: counts.error === 0,
    headline: counts.error
      ? `${label}：${counts.error} 个明确问题`
      : counts.warn
        ? `${label}：可用，但有 ${counts.warn} 处需要留意`
        : `${label}：动作验收通过`,
  };
}

export function sortedFindings(findings) {
  return [...findings].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);
}
