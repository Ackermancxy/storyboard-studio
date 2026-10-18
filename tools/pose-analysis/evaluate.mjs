// 姿势质量评估：只靠实测骨架 + 三维几何，不渲染、不截图。
//
// 回答三个问题：
//   1. 有没有做到位 —— 预设名要求的动作，用实测距离/高度/角度验收
//   2. 有没有很诡异 —— 穿模、重心出界、关节超限、头颈扭转、脚悬空
//   3. 有没有不合适 —— 场景里没椅子却坐着、墙面/栏杆高度对不上、裙子做插兜
//
// 输入是 kinematics.mjs 烘焙后的骨架；输出是结构化 findings，供 CLI 打印和 SVG 标注。
import { add, sub, mul, dot, len, dist, norm, lerp, rad, deg, qRot, qAxis } from "./vec.mjs";
import { landmark, hullPoints, supportPolygon, centerOfMass, jointAngles, headForward, toWorld, SOFT_GROUND_BONES } from "./kinematics.mjs";

export const LEVEL_ORDER = { info: 1, warn: 2, error: 3 };
export const levelOf = (findings) =>
  findings.reduce((worst, f) => (LEVEL_ORDER[f.level] > LEVEL_ORDER[worst] ? f.level : worst), "info");

/* ─────────────────────────── 通用几何 ─────────────────────────── */

const MMD_BONE = {
  pelvis: ["下半身"],
  thighL: ["左足"], thighR: ["右足"],
  kneeL: ["左ひざ"], kneeR: ["右ひざ"],
  footL: ["左足首"], footR: ["右足首"],
  handL: ["左手首"], handR: ["右手首"],
  upperArmL: ["左腕"], upperArmR: ["右腕"],
  lowerArmL: ["左ひじ"], lowerArmR: ["右ひじ"],
  head: ["頭"], neck: ["首"],
  chest: ["上半身2"], waist: ["上半身"],
};
const isSkirtBone = (name) => /スカート|skirt/i.test(name);

/** 某组骨骼突出点的最低 y（身体空间，落地后 0 = 地面） */
function boneLow(baked, profile, names) {
  let y = Infinity;
  for (const name of names) {
    const m = profile.boneMetrics?.[name];
    if (!m?.hull) continue;
    let bi = -1;
    for (let i = 0; i < profile.bones.length; i++) if (profile.bones[i].name === name) { bi = i; break; }
    if (bi < 0) continue;
    const p = baked.bonePos[bi], q = baked.boneQuat[bi];
    for (const h of m.hull) {
      const wy = p[1] + qRot(q, h)[1];
      if (wy < y) y = wy;
    }
  }
  return y;
}
function partLow(baked, profile, key) {
  return boneLow(baked, profile, MMD_BONE[key] ?? []);
}
function skirtLow(baked, profile) {
  const names = profile.bones.map((b) => b.name).filter(isSkirtBone);
  return boneLow(baked, profile, names);
}
/** 最低的身体点（排除腿/脚），用于判断“身体是不是真的躺/坐在地上” */
function torsoLow(baked, profile) {
  const names = profile.bones
    .map((b) => b.name)
    .filter((n) => !/足|ひざ|足首/.test(n) && !isSkirtBone(n));
  return boneLow(baked, profile, names);
}

const P = (baked, name) => baked.joint[name].pos;
const L = (baked, profile, name) => landmark(baked, profile, name);
const v2xz = (p) => [p[0], p[2]];
const angBetween = (a, b) => {
  const la = len(a), lb = len(b);
  if (!la || !lb) return 0;
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb)))));
};

/** 髋关节（大腿根）到目标点的距离；手用腕 + 指尖两者取近 */
export function handGap(baked, profile, side, target) {
  const wrist = P(baked, `hand_${side}`);
  const finger = L(baked, profile, `finger_${side}`) ?? wrist;
  return {
    wrist: dist(wrist, target),
    finger: dist(finger, target),
    best: Math.min(dist(wrist, target), dist(finger, target)),
    wristPos: wrist, fingerPos: finger,
  };
}

/** 身体空间目标点 */
export function targets(baked, profile) {
  const chin = L(baked, profile, "chin");
  const eyeL = L(baked, profile, "eye_L"), eyeR = L(baked, profile, "eye_R");
  const eyes = mul(add(eyeL, eyeR), 0.5);
  const out = { chin, eyes };
  for (const s of ["L", "R"]) {
    const sign = s === "L" ? 1 : -1;
    const ear = L(baked, profile, `ear_${s}`);
    out[`ear_${s}`] = ear;
    out[`temple_${s}`] = add(lerp(ear, eyes, 0.55), [sign * 0.005, 0.02, 0.015]);
    out[`hair_${s}`] = add(ear, [sign * 0.015, 0.105, -0.025]);
    out[`waist_${s}`] = add(P(baked, "spine"), [sign * 0.135, 0.0, 0.005]);
    out[`hip_${s}`] = add(P(baked, `upperLeg_${s}`), [sign * 0.035, 0.0, 0.02]);
    out[`pocket_${s}`] = add(P(baked, `upperLeg_${s}`), [sign * 0.025, -0.075, 0.095]);
    out[`skirt_${s}`] = add(P(baked, `upperLeg_${s}`), [sign * 0.15, 0.02, 0.03]);
    out[`back_${s}`] = add(P(baked, "spine"), [sign * 0.065, -0.02, -0.105]);
  }
  out.forehead = add(eyes, [0, 0.085, 0.025]);
  out.face = add(eyes, [0, -0.005, 0.035]);
  return out;
}

/* ─────────────────────────── 道具几何 ─────────────────────────── */

const DIMS = {
  chair: [0.44, 0.47, 0.44], stool: [0.36, 0.57, 0.36],
  sofa: [1.9, 0.47, 0.85], bed: [1.5, 0.5, 2.0], bench: [1.8, 0.48, 0.6],
  table: [1.2, 0.75, 0.7], desk: [0.65, 0.76, 0.45], box: [0.5, 0.5, 0.5],
  wall: [4, 2.8, 0.15], railing: [4, 1.1, 0.05], platform: [10, 1.1, 3],
  pier: [2.4, 0.9, 10], stairs_wide: [4, 1.2, 2.4], stairs: [1.2, 0.72, 1.12],
  bus_stop: [3, 2.6, 1.6], footbridge: [8, 3, 2.2], locker: [1.2, 1.8, 0.45],
  vending_machine: [1.1, 1.9, 0.75], car: [1.8, 1.5, 4.2],
};
const SEAT_SHAPES = new Set(["chair", "stool", "sofa", "bed", "bench", "box", "platform", "pier", "stairs_wide", "table", "desk", "car"]);
const WALL_SHAPES = new Set(["wall", "backdrop", "building", "column", "door", "locker"]);
const RAIL_SHAPES = new Set(["railing", "fence", "footbridge"]);

function shapeOf(prop, propShapes = {}) {
  return propShapes[prop.model] ?? prop.model;
}
function dimsOf(prop, shape) {
  const base = DIMS[shape] ?? [0.5, 0.5, 0.5];
  const s = prop.scale ?? 1;
  const size = prop.size ?? base;
  return [size[0] * s, size[1] * s, size[2] * s];
}
function propLocal(prop, world) {
  let dx = world[0] - prop.position[0];
  let dz = world[2] - prop.position[1];
  const f = rad(-(prop.facing ?? 0));
  const c = Math.cos(f), s = Math.sin(f);
  return [dx * c - dz * s, world[1], dx * s + dz * c];
}
function propContains(prop, shape, world, margin = 0.15) {
  const [w, h, d] = dimsOf(prop, shape);
  const [x, y, z] = propLocal(prop, world);
  const top = (prop.elevation ?? 0) + h;
  return Math.abs(x) <= w / 2 + margin && Math.abs(z) <= d / 2 + margin && y >= (prop.elevation ?? 0) - 0.05 && y <= top + 0.2;
}

/** 在场景里找座面：返回 {prop, shape, top, gap} */
function findSeat(ctx, pelvisWorld, pelvisLow) {
  let best = null;
  for (const prop of ctx.props ?? []) {
    const shape = shapeOf(prop, ctx.propShapes);
    if (!SEAT_SHAPES.has(shape)) continue;
    if (!propContains(prop, shape, pelvisWorld, 0.18)) continue;
    const top = (prop.elevation ?? 0) + dimsOf(prop, shape)[1];
    // 用臀部最低点（下半身/裙摆），不是髋根骨；髋根在骨盆中心，会低 10–18cm
    const gap = pelvisLow - top;
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { prop, shape, top, gap };
  }
  return best;
}

/* ─────────────────────────── 评估主函数 ─────────────────────────── */

/**
 * @param {object} ctx
 * @param {object} ctx.profile  实测 profile
 * @param {object} ctx.baked    bake() 结果（已完成 gaze）
 * @param {object} ctx.resolved 最终 17 关节
 * @param {Array}  ctx.clamped  resolvePose().clamped
 * @param {string} ctx.presetId
 * @param {string} [ctx.presetLabel]
 * @param {object} ctx.actor
 * @param {Array}  [ctx.props]
 * @param {object} [ctx.propShapes]  model id → shape
 * @param {object} [ctx.gaze]  {targetWorld, label, rawTurn, rawNod}
 */
export function evaluatePose(ctx) {
  const { profile, baked, resolved, presetId = null, actor = {}, props = [], envKind = "stand" } = ctx;
  const findings = [];
  const push = (f) => {
    if (!f.code || !f.level) throw new Error("finding 缺少 code/level");
    findings.push({ category: "pose", ...f });
  };
  const B = baked;
  const ground = B.elevation ?? actor.elevation ?? 0;
  const T = targets(B, profile);
  const preset = presetId ?? "";
  const label = ctx.presetLabel ?? preset;
  const hips = P(B, "hips");
  const head = P(B, "head");
  const chest = P(B, "chest");
  const neck = P(B, "neck");
  const bodyHeight = profile.measurements?.height ?? 1.6;
  const angles = jointAngles(B);

  const pelvisLow = partLow(B, profile, "pelvis");
  const skirt = skirtLow(B, profile);
  // 人物接触地面的判定只用裸身体（臀/膝/背）；裙摆是刚性蒙皮、没有布料模拟，
  // 坐姿时它一定垂到身体下方，让它参与落地会把整个人撑离地面。
  const seatLow = pelvisLow;
  const kneeL = partLow(B, profile, "kneeL"), kneeR = partLow(B, profile, "kneeR");
  const footL = partLow(B, profile, "footL"), footR = partLow(B, profile, "footR");
  const handL = partLow(B, profile, "handL"), handR = partLow(B, profile, "handR");
  const feetLow = Math.min(footL, footR);
  const kneeLow = Math.min(kneeL, kneeR);
  const handLow = Math.min(handL, handR);
  const torso = torsoLow(B, profile);

  /* ═══ 1. 关节限位 / 解剖合理性 ═══ */
  if (ctx.clamped?.length) {
    const list = ctx.clamped.map((c) => {
      const names = { foot_L: "左脚", foot_R: "右脚", lowerArm_L: "左前臂", lowerArm_R: "右前臂", lowerLeg_L: "左小腿", lowerLeg_R: "右小腿" };
      return `${names[c.joint] ?? c.joint}.${c.key}：请求 ${c.requested}°，实际 ${c.used}°（限位 ${c.limit[0]}–${c.limit[1]}）`;
    });
    push({
      code: "joint-clamped", level: "warn", category: "feasibility",
      title: `姿势被骨骼限位截断（${ctx.clamped.length} 处）`,
      detail: [...new Set(list)].join("；"),
      metrics: { clamped: ctx.clamped },
      at: ctx.clamped[0]?.joint === "foot_L" || ctx.clamped[0]?.joint === "foot_R" ? P(B, ctx.clamped[0].joint) : hips,
    });
  }

  // 关节接近上限：不是错，但动作会显得僵
  const nearLimit = [];
  for (const [j, params] of Object.entries(resolved)) {
    const lim = (j.startsWith("lowerArm") || j.startsWith("lowerLeg")) ? { bend: [0, 150] } : null;
    if (lim) for (const [k, [a, b]] of Object.entries(lim)) {
      const v = params[k];
      if (typeof v === "number" && (Math.abs(v - b) < 0.5 || Math.abs(v - a) < 0.5)) nearLimit.push(`${j}.${k}=${v}°`);
    }
  }
  if (nearLimit.length) {
    push({
      code: "joint-at-limit", level: "info", category: "feasibility",
      title: "关节已到限位边缘",
      detail: nearLimit.join("、") + "；视觉上可能偏僵，必要时换一个预设。",
      at: hips,
    });
  }

  const neckTurn = Math.abs((resolved.neck?.turn ?? 0) + (resolved.head?.turn ?? 0));
  const neckNod = Math.abs((resolved.neck?.nod ?? 0) + (resolved.head?.nod ?? 0));
  if (neckTurn > 110) {
    push({
      code: "neck-twist", level: "warn", category: "weird",
      title: `头颈合计回转 ${neckTurn.toFixed(0)}°，超过舒适范围`,
      detail: "真人头颈合计约 100–110°；更大角度会显得脖子拧断，建议把一部分转到胸口（chest.twist）。",
      metrics: { neckTurn }, at: head,
    });
  }
  if (neckNod > 70) {
    push({
      code: "neck-nod", level: "warn", category: "weird",
      title: `头颈合计俯仰 ${neckNod.toFixed(0)}°，动作很勉强`,
      detail: "低头/仰头合计超过 70° 时，脖子和下巴会显得变形。",
      metrics: { neckNod }, at: head,
    });
  }
  const chestTurn = Math.abs((resolved.chest?.twist ?? 0) + (resolved.spine?.twist ?? 0));
  if (chestTurn + neckTurn > 125) {
    push({
      code: "torso-twist", level: "warn", category: "weird",
      title: `躯干+头颈合计扭转 ${(chestTurn + neckTurn).toFixed(0)}°`,
      detail: "整体扭转过大，肩线和骨盆会显得错位。",
      at: chest,
    });
  }

  /* ═══ 2. 自穿插 ═══ */
  const collisions = ctx.collisions ?? [];
  if (collisions.length) {
    const touchPose = /hands_on_hips|arms_crossed|cover_face|hand_to_chin|phone_call|hand_in_hair|shade_eyes|salute|selfie|heart_over_head|lean_wall|hands_behind|hold_skirt/.test(preset);
    const top = collisions.slice(0, 4);
    const maxPen = top[0]?.penetration ?? 0;
    const level = maxPen >= 0.07 ? "error" : touchPose ? "info" : maxPen >= 0.035 ? "warn" : "info";
    push({
      code: "self-intersection", level, category: "weird",
      title: `身体自穿插 ${collisions.length} 处${maxPen >= 0.07 ? "（明显穿模）" : ""}`,
      detail: top.map((c) => `${c.a} ↔ ${c.b}：陷入 ${(c.penetration * 100).toFixed(0)} cm`).join("；")
        + (touchPose ? "。该动作本身有身体接触，但超过 7cm 的穿插仍会穿帮。" : "。"),
      metrics: { collisions: top },
      at: top[0]?.at,
    });
  }

  /* ═══ 3. 地面 / 支撑 ═══ */
  const support = ctx.support ?? supportPolygon(B, profile);
  const com = ctx.com ?? centerOfMass(B, profile);
  const margin = ctx.margin ?? (support.poly.length ? polygonMargin2([com.pos[0], com.pos[2]], support.poly) : -Infinity);

  let minHull = Infinity;
  for (const h of hullPoints(B, profile)) if (h.p[1] < minHull) minHull = h.p[1];
  if (actor.autoGround === false) {
    const gap = minHull - ground;
    if (gap < -0.008) {
      push({
        code: "floor-penetration", level: "error", category: "contact",
        title: `身体穿地 ${(Math.abs(gap) * 100).toFixed(0)} cm`,
        detail: "autoGround 关闭时，最低点低于 elevation；打开 autoGround 或抬高 elevation。",
        metrics: { minHull, ground }, at: [0, minHull, 0],
      });
    } else if (gap > 0.02) {
      push({
        code: "floating", level: "warn", category: "contact",
        title: `整体悬空 ${(gap * 100).toFixed(0)} cm`,
        detail: "autoGround 关闭时，最低点高于 elevation；要么打开 autoGround，要么把 elevation 调低。",
        metrics: { minHull, ground },
      });
    }
  }

  // 动态动作允许单脚离地/重心越界（走、跑、跳…）；按前缀匹配，
  // 这样 walk_stride、run_lookback 这类变体不会被当成静态站姿误报。
  const isDynamic = /^(walk|run|jump|tiptoe|kick|spin|skip|dance|hop|leap)/.test(preset);
  const isSeatedPreset = /^sit_(chair|ledge|steps|stool|curb)/.test(preset);
  const isKneel = /^(kneel|sit_kneel)/.test(preset);
  const isFloorSit = !isKneel && /^sit_(floor|cross|back|hug|side)/.test(preset);
  const isLie = /^lie_/.test(preset);

  const pelvisWorld = toWorld(B, hips);
  const seat = isSeatedPreset || isFloorSit || isKneel ? findSeat(ctx, pelvisWorld, pelvisLow) : null;

  // 3a. 地面动作验收
  if (isFloorSit) {
    const visible = Number.isFinite(pelvisLow) ? pelvisLow : seatLow;
    if (visible > 0.12) {
      push({
        code: "floor-sit-failed", level: "error", category: "intent",
        title: `没有坐到地上：臀部离地 ${(visible * 100).toFixed(0)} cm`,
        detail: "autoGround 先让脚着地，臀部就悬在空中；实际形态是深蹲/半蹲。"
          + "要真正席地而坐，需要改腿的角度（大腿前抬约 75–90°、膝盖回折约 70–100°），而不是加 elevation。"
          + (Number.isFinite(skirt) ? `（裙摆最低点 ${(skirt * 100).toFixed(0)} cm；布料贴地不算人物悬空。）` : ""),
        metrics: { pelvisLow, skirtLow: skirt, seatLow: visible, footLow: feetLow },
        at: hips,
      });
    }
    // 席地而坐也要重心落在身体接触面内（臀 + 腿 + 脚）
    if (margin < -0.10) {
      push({
        code: "floor-sit-balance", level: "error", category: "balance",
        title: `坐姿重心在支撑面外 ${(Math.abs(margin) * 100).toFixed(0)} cm，会向后/向侧倒`,
        detail: "臀部、腿、手或脚必须围住重心；把躯干前倾一点（spine.bend）或把腿收近臀部。",
        metrics: { margin, com: com.pos }, at: com.pos,
      });
    } else if (margin < -0.03) {
      push({
        code: "floor-sit-balance-warn", level: "warn", category: "balance",
        title: `坐姿重心接近支撑面边缘（外 ${(Math.abs(margin) * 100).toFixed(0)} cm）`,
        detail: "静止坐姿应更稳；微调躯干前倾或腿的位置。",
        metrics: { margin, com: com.pos }, at: com.pos,
      });
    }
    if (preset === "sit_back" && handLow > 0.14) {
      push({
        code: "sit-back-hands", level: "warn", category: "intent",
        title: `后撑的手没落地（离地 ${(handLow * 100).toFixed(0)} cm）`,
        detail: "后撑坐的手掌应在地面上；现在手悬在身体两侧，重心没有支撑。",
        metrics: { handLow }, at: P(B, "hand_R"),
      });
    }
  }

  if (isKneel) {
    const both = preset !== "kneel_one";
    const bad = both ? [kneeL, kneeR].filter((y) => y > 0.06) : (kneeLow > 0.06 ? [kneeLow] : []);
    if (bad.length) {
      push({
        code: "kneel-failed", level: "error", category: "intent",
        title: `膝盖没有跪到地上（离地 ${(Math.max(...bad) * 100).toFixed(0)} cm）`,
        detail: "膝盖下方是空的，实际支撑变成脚背/脚趾，看起来像踮着脚跪。"
          + "把 foot.point 调到 30–45° 让脚背放平，膝盖才能落地；或降低 elevation。",
        metrics: { kneeL, kneeR, footL, footR }, at: P(B, "lowerLeg_R"),
      });
    }
  }

  if (preset === "lie_stomach") {
    // 趴撑/平板支撑：手是主支撑，脚背或膝盖也必须着地，否则会向前扑
    if (Math.min(footL, footR, kneeL, kneeR) > 0.12) {
      push({
        code: "plank-support", level: "error", category: "intent",
        title: `趴撑只有手着地：脚/膝离地 ${(Math.min(footL, footR, kneeL, kneeR) * 100).toFixed(0)} cm`,
        detail: "平板支撑需要手 + 脚尖（或膝盖）两点支撑；现在脚在 40 cm 高处，身体会向前扑。"
          + "把 foot.point 加大让脚尖向下，或把膝盖放到地上。",
        metrics: { footL, footR, kneeL, kneeR }, at: P(B, "foot_R"),
      });
    }
  }

  if (isLie && !/^lie_stomach/.test(preset)) {
    // 平躺/侧躺：头和躯干应贴近地面
    const headLow = boneLow(B, profile, MMD_BONE.head);
    const bodyLow = torso;
    if (bodyLow > 0.18) {
      push({
        code: "lie-failed", level: "error", category: "intent",
        title: `身体没有躺下：躯干最低点离地 ${(bodyLow * 100).toFixed(0)} cm`,
        detail: "躺姿要求躯干贴地；现在更像侧撑/悬空。检查 hips.bend/side 是否真的把身体放平。",
        metrics: { torsoLow: bodyLow }, at: chest,
      });
    } else if (headLow > 0.22) {
      push({
        code: "lie-head-high", level: "warn", category: "intent",
        title: `躺姿头部偏高（离地 ${(headLow * 100).toFixed(0)} cm）`,
        detail: "没有枕头时头侧/后脑应接近地面；偏高会像脖子用力撑着。",
        metrics: { headLow }, at: head,
      });
    }
  }

  // 3b. 座面验收
  if (isSeatedPreset) {
    const thigh = sub(P(B, "lowerLeg_R"), P(B, "upperLeg_R"));
    const thighTilt = Math.abs(thigh[1]) / (len(thigh) || 1);
    if (!seat) {
      push({
        code: "no-seat", level: "error", category: "prop",
        title: "坐姿但身下没有座面道具",
        detail: "场景里需要在臀部下方放椅子/凳子/沙发/箱子/台子；否则人物是坐在空气上。",
        metrics: { pelvisY: pelvisLow }, at: hips,
      });
    } else if (Math.abs(seat.gap) > 0.075) {
      push({
        code: "seat-height", level: seat.gap > 0 ? "error" : "warn", category: "prop",
        title: seat.gap > 0
          ? `臀部离座面 ${(seat.gap * 100).toFixed(0)} cm（悬空）`
          : `臀部陷进座面 ${(Math.abs(seat.gap) * 100).toFixed(0)} cm`,
        detail: `最近的座面是 ${seat.shape}（高 ${seat.top.toFixed(2)} m），臀部最低点 ${pelvisLow.toFixed(2)} m。`
          + "可调道具 size/scale、换更高的座面，或改 elevation。",
        metrics: seat, at: hips,
      });
    }
    if (thighTilt > 0.45) {
      push({
        code: "sit-thigh", level: "warn", category: "intent",
        title: "坐姿的大腿不够水平",
        detail: `大腿上下倾斜 ${(thighTilt * 100).toFixed(0)}%；坐椅子时大腿应接近水平（<35%），否则像半蹲。`,
        at: P(B, "lowerLeg_R"),
      });
    }
  }

  // 3c. 重心 / 支撑面（扶墙/扶栏时有外部支撑，不按独立站姿判倒）
  const hasExternalSupport = envKind === "wall-front" || envKind === "wall-back" || envKind === "rail";
  if (!isDynamic && !isFloorSit && !isSeatedPreset && !isKneel && !isLie && !hasExternalSupport) {
    if (margin < -0.12) {
      push({
        code: "off-balance", level: "error", category: "balance",
        title: `重心落在支撑面外 ${(Math.abs(margin) * 100).toFixed(0)} cm，会倒`,
        detail: "把髋部往支撑脚方向移一点，或加大支撑面（双脚分开/坐下/扶道具）。",
        metrics: { margin, com: com.pos }, at: com.pos,
      });
    } else if (margin < -0.05) {
      push({
        code: "balance-marginal", level: "warn", category: "balance",
        title: `重心接近支撑面边缘（外 ${(Math.abs(margin) * 100).toFixed(0)} cm）`,
        detail: "静态站姿会显得要倒；如果这是运动瞬间（走路/跑/抬腿），可以忽略。",
        metrics: { margin, com: com.pos }, at: com.pos,
      });
    }
  }

  // 3d. 脚：站立类动作里不应有脚离地
  if (!isDynamic && !isFloorSit && !isKneel && !isLie && !isSeatedPreset) {
    const feet = [footL, footR];
    const lifted = feet.filter((y) => y > ground + 0.04);
    if (lifted.length) {
      push({
        code: "foot-floating", level: "warn", category: "contact",
        title: `有 ${lifted.length} 只脚离地 ${(Math.min(...lifted) * 100).toFixed(0)} cm`,
        detail: "站立/坐姿里脚应该踩实；如果动作有意抬脚（如后勾腿），可忽略。",
        metrics: { footL, footR }, at: P(B, "foot_R"),
      });
    }
  }

  /* ═══ 4. 视线 ═══ */
  if (ctx.gaze) {
    const g = ctx.gaze;
    const targetBody = ctx.gaze.targetBody;
    const hf = headForward(B);
    const want = norm(sub(targetBody, head));
    const err = angBetween(hf, want);
    const rawTurn = g.rawTurn ?? 0, rawNod = g.rawNod ?? 0;
    if (Math.abs(rawTurn) > 125 || Math.abs(rawNod) > 85) {
      push({
        code: "gaze-unreachable", level: "warn", category: "gaze",
        title: `目标超出头颈可及范围（需转 ${Math.abs(rawTurn).toFixed(0)}° / 俯仰 ${Math.abs(rawNod).toFixed(0)}°）`,
        detail: "gaze 会把头转向上限后仍有偏差；可以让胸口一起转，或把目标移到侧面。",
        metrics: { rawTurn, rawNod, errorDeg: err }, at: head,
      });
    }
    if (err > 25) {
      push({
        code: "gaze-miss", level: "error", category: "gaze",
        title: `视线偏了 ${err.toFixed(0)}°`,
        detail: "头没有真正朝向目标。常见原因：预设本身有 chest.twist / head.turn，gaze 覆盖了头颈却没有抵消胸口的旋转。",
        metrics: { errorDeg: err, rawTurn, rawNod }, at: head,
      });
    } else if (err > 10) {
      push({
        code: "gaze-off", level: "warn", category: "gaze",
        title: `视线有 ${err.toFixed(0)}° 偏差`,
        detail: "还看得出在看目标，但不精确；检查胸口/脖子是否先转了。",
        metrics: { errorDeg: err }, at: head,
      });
    }
  }

  /* ═══ 5. 动作意图验收 ═══ */
  const intents = intentChecks({ preset, label, B, profile, T, angles, ctx, seat, pelvisLow, seatLow, kneeLow, footL, footR, handLow, head, hips, chest, feetLow });
  for (const it of intents) {
    if (it.skip) continue;
    if (it.ok) {
      if (it.reportOk) push({ code: `intent-ok-${it.key}`, level: "info", category: "intent", title: `做到位：${label}`, detail: it.detail, at: it.at });
    } else {
      push({
        code: `intent-${it.key}`, level: it.level ?? "error", category: "intent",
        title: `没做到位：${label}`, detail: it.detail, metrics: it.metrics, at: it.at,
      });
    }
  }

  /* ═══ 6. 场景/服装适配 ═══ */
  // 身体陷进道具体积（按道具包围盒估算；排除墙/栏杆/背景纸等薄片）
  if (props.length) {
    const overlaps = propOverlaps(ctx, B, profile)
      .filter((o) => SOLID_SHAPES.has(o.shape) && !THIN_SHAPES.has(o.shape))
      .filter((o) => !(seat && o.prop.id === seat.prop.id))
      .filter((o) => o.depth >= 0.05)
      .slice(0, 3);
    if (overlaps.length) {
      const worst = overlaps[0];
      const level = worst.depth >= 0.12 ? "error" : "warn";
      push({
        code: "prop-embed", level, category: "prop",
        title: `身体陷进道具 ${(worst.depth * 100).toFixed(0)} cm：${worst.prop.label ?? worst.shape}`,
        detail: overlaps
          .map((o) => `${o.prop.label ?? o.shape}（${o.shape}）：约 ${(o.depth * 100).toFixed(0)} cm`)
          .join("；")
          + "。按道具包围盒估算：可能是 elevation 低于道具顶面、站位在道具内部，或道具尺寸过大；"
          + "请对比俯视图与侧视高度。",
        metrics: { overlaps: overlaps.map((o) => ({ id: o.prop.id, shape: o.shape, depth: o.depth })) },
        at: worldToBody(B, worst.at),
      });
    }
  }

  // 墙
  if (/hand_on_wall|lean_wall/.test(preset)) {
    const wall = findWall(ctx);
    const hands = ctx.gaze ? null : null;
    if (!wall) {
      push({
        code: "no-wall", level: "error", category: "prop",
        title: "扶墙/倚墙但场景里没有墙",
        detail: "需要在伸手方向放一个 wall / building / column 道具，否则手扶空。",
        at: P(B, "hand_R"),
      });
    } else if (preset === "hand_on_wall") {
      const hw = toWorld(B, (L(B, profile, "finger_R") ?? P(B, "hand_R")));
      const d = distanceToWall(wall, hw);
      if (d > 0.12) {
        push({
          code: "wall-gap", level: "warn", category: "prop",
          title: `手离墙 ${(d * 100).toFixed(0)} cm，没扶到`,
          detail: `最近的墙/柱在 ${d.toFixed(2)} m 外；把墙移近，或让手臂再向前伸。`,
          metrics: { gap: d }, at: P(B, "hand_R"),
        });
      }
    }
  }

  // 栏杆高度
  if (/lean_rail|rail_lookback/.test(preset)) {
    const rail = findRail(ctx);
    if (!rail) {
      push({
        code: "no-rail", level: "error", category: "prop",
        title: "扶栏动作但场景里没有栏杆",
        detail: "放一个 railing / fence，并让它的高度接近手的高度。",
        at: P(B, "hand_R"),
      });
    } else {
      const handYs = [P(B, "hand_L")[1], P(B, "hand_R")[1]];
      const handY = (handYs[0] + handYs[1]) / 2;
      const gap = handY - rail.top;
      if (Math.abs(gap) > 0.12) {
        push({
          code: "rail-height", level: "warn", category: "prop",
          title: `手比栏杆${gap > 0 ? "高" : "低"} ${(Math.abs(gap) * 100).toFixed(0)} cm`,
          detail: `栏杆顶高 ${rail.top.toFixed(2)} m，双手平均 ${handY.toFixed(2)} m；`
            + (gap < 0 ? "手在栏杆下方，扶不到。" : "手悬在栏杆上方，像扶着空气。")
            + "改栏杆 size 高度或调整前倾角度。",
          metrics: { railTop: rail.top, handY }, at: P(B, "hand_R"),
        });
      }
    }
  }

  // 跳跃：elevation 没抬
  if (preset === "jump" && (actor.elevation ?? 0) <= 0.01) {
    push({
      code: "jump-ground", level: "warn", category: "intent",
      title: "跳跃姿势还站在地面上",
      detail: "预设名已经提醒「记得抬 elevation」；现在双脚贴地，看起来像深蹲蓄力而不是跳起。",
      at: hips,
    });
  }

  const summary = summarize(findings, preset, label);
  return { findings, summary, metrics: { pelvisLow, skirtLow: skirt, kneeL, kneeR, footL, footR, handL, handR, margin, com, support, angles } };
}

/* ─────────────────────────── 意图检查表 ─────────────────────────── */

function intentChecks(c) {
  const { preset, B, profile, T, angles, ctx } = c;
  const out = [];
  const addCheck = (key, ok, detail, extra = {}) => out.push({ key, ok, detail, ...extra });
  const gapCheck = (key, side, target, max, targetName, extra = {}) => {
    const g = handGap(B, profile, side, target);
    addCheck(key, g.best <= max,
      `${side === "R" ? "右" : "左"}手到${targetName}：腕 ${(g.wrist * 100).toFixed(0)} cm，指尖 ${(g.finger * 100).toFixed(0)} cm（要求 ≤${(max * 100).toFixed(0)} cm）`,
      { at: g.wristPos, metrics: { wrist: g.wrist, finger: g.finger }, level: "error", ...extra });
    return g;
  };

  switch (preset) {
    case "hand_to_chin":
      gapCheck("chin", "R", T.chin, 0.10, "下巴");
      break;
    case "phone_call": {
      gapCheck("ear", "R", T.ear_R, 0.10, "右耳");
      break;
    }
    case "hand_in_hair":
      gapCheck("hair", "R", T.hair_R, 0.12, "右侧头发");
      break;
    case "shade_eyes":
      gapCheck("forehead", "R", T.forehead, 0.12, "额头");
      break;
    case "salute":
      gapCheck("temple", "R", T.temple_R, 0.10, "太阳穴");
      break;
    case "cover_face": {
      const gL = handGap(B, profile, "L", T.face);
      const gR = handGap(B, profile, "R", T.face);
      addCheck("face-cover", gL.best <= 0.15 && gR.best <= 0.15,
        `双手到脸：左 ${(gL.best * 100).toFixed(0)} cm / 右 ${(gR.best * 100).toFixed(0)} cm（要求 ≤15 cm）`,
        { at: T.face, metrics: { left: gL.best, right: gR.best }, level: "error" });
      break;
    }
    case "hands_on_hips": {
      const gL = handGap(B, profile, "L", T.waist_L);
      const gR = handGap(B, profile, "R", T.waist_R);
      addCheck("hips", gL.best <= 0.12 && gR.best <= 0.12,
        `双手到腰侧：左 ${(gL.best * 100).toFixed(0)} cm / 右 ${(gR.best * 100).toFixed(0)} cm（要求 ≤12 cm）`,
        { at: T.waist_R, metrics: { left: gL.best, right: gR.best }, level: "error" });
      break;
    }
    case "hands_behind": {
      const gL = handGap(B, profile, "L", T.back_L);
      const gR = handGap(B, profile, "R", T.back_R);
      addCheck("behind", gL.best <= 0.16 && gR.best <= 0.16,
        `双手到背后腰线：左 ${(gL.best * 100).toFixed(0)} cm / 右 ${(gR.best * 100).toFixed(0)} cm（要求 ≤16 cm）`,
        { at: T.back_R, metrics: { left: gL.best, right: gR.best }, level: "warn" });
      break;
    }
    case "hold_skirt": {
      const gL = handGap(B, profile, "L", T.skirt_L);
      const gR = handGap(B, profile, "R", T.skirt_R);
      addCheck("skirt", gL.best <= 0.15 && gR.best <= 0.15,
        `双手到裙侧：左 ${(gL.best * 100).toFixed(0)} cm / 右 ${(gR.best * 100).toFixed(0)} cm（要求 ≤15 cm）`,
        { at: T.skirt_R, metrics: { left: gL.best, right: gR.best }, level: "warn" });
      break;
    }
    case "carry_bag": {
      gapCheck("bag", "R", T.hip_R, 0.16, "胯侧（拎包位置）", { level: "warn" });
      break;
    }
    case "wave":
    case "wave_high": {
      const fp = landmark(B, profile, "finger_R");
      const top = landmark(B, profile, "headTop");
      const lateral = Math.abs(fp[0] - P(B, "head")[0]);
      addCheck("wave", fp[1] > top[1] - 0.06 && lateral > 0.14,
        `挥手：指尖高 ${(fp[1] * 100).toFixed(0)} cm（头顶 ${(top[1] * 100).toFixed(0)} cm），偏离头中线 ${(lateral * 100).toFixed(0)} cm（要求 >14 cm）`,
        { at: fp, metrics: { fingerY: fp[1], headTop: top[1], lateral }, level: "warn" });
      break;
    }
    case "arms_up":
    case "stretch": {
      const top = landmark(B, profile, "headTop");
      const fL = landmark(B, profile, "finger_L"), fR = landmark(B, profile, "finger_R");
      addCheck("arms-up", fL[1] > top[1] - 0.05 && fR[1] > top[1] - 0.05,
        `双手高度：左 ${(fL[1] * 100).toFixed(0)} cm / 右 ${(fR[1] * 100).toFixed(0)} cm，头顶 ${(top[1] * 100).toFixed(0)} cm`,
        { at: fR, metrics: { left: fL[1], right: fR[1], headTop: top[1] }, level: "warn" });
      break;
    }
    case "heart_over_head": {
      const top = landmark(B, profile, "headTop");
      const fL = landmark(B, profile, "finger_L"), fR = landmark(B, profile, "finger_R");
      const d = dist(fL, fR);
      addCheck("heart", fL[1] > top[1] - 0.05 && fR[1] > top[1] - 0.05 && d < 0.12,
        `头顶比心：指尖间距 ${(d * 100).toFixed(0)} cm（要求 <12 cm），高度 ${(Math.min(fL[1], fR[1]) * 100).toFixed(0)} cm / 头顶 ${(top[1] * 100).toFixed(0)} cm`,
        { at: mul(add(fL, fR), 0.5), metrics: { distance: d }, level: "warn" });
      break;
    }
    case "arms_out": {
      const fL = landmark(B, profile, "finger_L"), fR = landmark(B, profile, "finger_R");
      const shY = (P(B, "upperArm_L")[1] + P(B, "upperArm_R")[1]) / 2;
      const spread = Math.min(Math.abs(fL[0]), Math.abs(fR[0]));
      addCheck("arms-out", spread > 0.32 && Math.abs(fL[1] - shY) < 0.25 && Math.abs(fR[1] - shY) < 0.25,
        `张开双臂：指尖横向 ${(spread * 100).toFixed(0)} cm，肩高 ${(shY * 100).toFixed(0)} cm，指尖 ${(fL[1] * 100).toFixed(0)}/${(fR[1] * 100).toFixed(0)} cm`,
        { at: fR, metrics: { spread }, level: "warn" });
      break;
    }
    case "point": {
      const hand = P(B, "hand_R");
      const sh = P(B, "upperArm_R");
      const forward = hand[2] - sh[2];
      const elbow = angles.elbow_R;
      addCheck("point", forward > 0.30 && elbow > 150 && Math.abs(hand[1] - sh[1]) < 0.18,
        `指向：手在肩前 ${(forward * 100).toFixed(0)} cm，肘 ${elbow.toFixed(0)}°（要求 >150°），手肩高差 ${(Math.abs(hand[1] - sh[1]) * 100).toFixed(0)} cm`,
        { at: hand, metrics: { forward, elbow }, level: "warn" });
      break;
    }
    case "arms_crossed": {
      // 前臂应横在胸前，手腕高度接近胸口
      const wL = P(B, "hand_L"), wR = P(B, "hand_R");
      const chestY = P(B, "chest")[1];
      const z = (wL[2] + wR[2]) / 2;
      const y = (wL[1] + wR[1]) / 2;
      addCheck("crossed", Math.abs(y - chestY) < 0.16 && z > 0.12,
        `抱臂：手腕平均高 ${(y * 100).toFixed(0)} cm（胸 ${(chestY * 100).toFixed(0)} cm），在身前 ${(z * 100).toFixed(0)} cm（要求 >12 cm）`,
        { at: mul(add(wL, wR), 0.5), metrics: { y, chestY, z }, level: "warn" });
      break;
    }
    case "selfie": {
      const eye = T.eyes;
      const w = P(B, "hand_R");
      const d = dist(w, eye);
      const forward = w[2] - eye[2];
      addCheck("selfie", forward > 0.10 && forward < 0.55 && d < 0.40,
        `自拍：手离眼 ${(d * 100).toFixed(0)} cm（要求 <40 cm），在脸前 ${(forward * 100).toFixed(0)} cm`,
        { at: w, metrics: { d, forward }, level: "warn" });
      break;
    }
    case "sit_chair":
    case "sit_ledge": {
      // 大腿水平 + 膝角
      const thigh = sub(P(B, "lowerLeg_R"), P(B, "upperLeg_R"));
      const tilt = Math.abs(thigh[1]) / (len(thigh) || 1);
      addCheck("sit-legs", tilt < 0.45 && angles.knee_R > 60 && angles.knee_R < 118,
        `坐姿腿：大腿倾斜 ${(tilt * 100).toFixed(0)}%，膝角 ${angles.knee_R.toFixed(0)}°`,
        { at: P(B, "lowerLeg_R"), metrics: { thighTilt: tilt, knee: angles.knee_R }, level: "warn" });
      break;
    }
    case "crouch": {
      addCheck("crouch", P(B, "upperLeg_R")[1] < 0.48 && angles.knee_R < 90,
        `蹲：髋关节高 ${(P(B, "upperLeg_R")[1] * 100).toFixed(0)} cm（要求 <48 cm），膝角 ${angles.knee_R.toFixed(0)}°（要求 <90°）`,
        { at: P(B, "lowerLeg_R"), metrics: { hip: P(B, "upperLeg_R")[1], knee: angles.knee_R }, level: "warn" });
      break;
    }
    case "kick_back": {
      const toe = landmark(B, profile, "toe_R");
      const hip = P(B, "hips");
      const behind = hip[2] - toe[2];
      addCheck("kick", toe[1] > 0.12 && behind > 0.15,
        `后勾腿：右脚尖高 ${(toe[1] * 100).toFixed(0)} cm、在髋后 ${(behind * 100).toFixed(0)} cm（要求 >12 cm / >15 cm）`,
        { at: toe, metrics: { toeY: toe[1], behind }, level: "warn" });
      break;
    }
    case "tiptoe": {
      // sole 四角顺序：0/1 是脚跟，2/3 是脚尖
      const sole = landmark(B, profile, "sole_R") ?? [];
      const heel = sole.slice(0, 2), toe = sole.slice(2);
      const heelY = heel.length ? Math.min(...heel.map((p) => p[1])) : 0;
      const toeY = toe.length ? Math.min(...toe.map((p) => p[1])) : 0;
      const lift = heelY - toeY;
      addCheck("tiptoe", lift > 0.04,
        `踮脚：脚跟比脚尖高 ${(lift * 100).toFixed(0)} cm（要求 >4 cm；脚跟 ${(heelY * 100).toFixed(0)} cm / 脚尖 ${(toeY * 100).toFixed(0)} cm）`,
        { at: P(B, "foot_R"), metrics: { heelY, toeY, lift }, level: "warn" });
      break;
    }
    case "look_back":
    case "walk_lookback":
    case "rail_lookback": {
      const hf = headForward(B);
      const sideways = Math.abs(hf[0]) > 0.55;
      addCheck("lookback", sideways,
        `回眸：头部朝向 (${hf.map((v) => v.toFixed(2)).join(", ")})，侧转分量 ${Math.abs(hf[0]).toFixed(2)}（要求 >0.55）`,
        { at: P(B, "head"), metrics: { headForward: hf }, level: "warn" });
      break;
    }
    default:
      break;
  }
  return out;
}

/* ─────────────────────────── 场景查询 ─────────────────────────── */

function findWall(ctx) {
  for (const prop of ctx.props ?? []) {
    const shape = shapeOf(prop, ctx.propShapes);
    if (!WALL_SHAPES.has(shape)) continue;
    return { prop, shape, top: (prop.elevation ?? 0) + dimsOf(prop, shape)[1] };
  }
  return null;
}
function findRail(ctx) {
  for (const prop of ctx.props ?? []) {
    const shape = shapeOf(prop, ctx.propShapes);
    if (!RAIL_SHAPES.has(shape)) continue;
    return { prop, shape, top: (prop.elevation ?? 0) + dimsOf(prop, shape)[1] };
  }
  return null;
}
function distanceToWall(wall, worldPoint) {
  const [w, h, d] = dimsOf(wall.prop, wall.shape);
  const [x, y, z] = propLocal(wall.prop, worldPoint);
  const dx = Math.max(0, Math.abs(x) - w / 2);
  const dy = Math.max(0, Math.max((wall.prop.elevation ?? 0) - y, y - ((wall.prop.elevation ?? 0) + h)));
  const dz = Math.max(0, Math.abs(z) - d / 2);
  return Math.hypot(dx, dy, dz);
}

/**
 * 道具的实际实心占地。多数形状就是包围盒，但 bridge_pier 渲染成
 * 直径 0.64×宽 的圆柱（顶部才有一块大盖板）；按整个包围盒判会把人
 * 在树干前 40cm 误判成「陷进 76cm」。
 */
function solidFootprint(shape, dims) {
  if (shape === "bridge_pier") {
    return [dims[0] * 0.64, dims[1], dims[2] * 0.64];
  }
  return dims;
}

/** 身体突出点陷进道具包围盒的深度（用来发现「人站在台阶内部 / 穿进树干」） */
function propOverlaps(ctx, baked, profile) {
  const out = [];
  for (const prop of ctx.props ?? []) {
    const shape = shapeOf(prop, ctx.propShapes);
    const [w, h, d] = solidFootprint(shape, dimsOf(prop, shape));
    const base = prop.elevation ?? 0, top = base + h;
    let depth = 0, at = null;
    for (const { bone, p } of hullPoints(baked, profile)) {
      // 头发/裙摆是刚性蒙皮、没有布料模拟；贴着墙/地面时允许压进去。
      if (SOFT_GROUND_BONES.test(bone)) continue;
      const world = toWorld(baked, p);
      const [x, y, z] = propLocal(prop, world);
      if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2 || y < base || y > top) continue;
      const dep = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z), y - base, top - y);
      if (dep > depth) { depth = dep; at = world; }
    }
    if (depth > 0) out.push({ prop, shape, depth, at });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

function worldToBody(baked, world) {
  let p = world;
  if (baked.position) p = [p[0] - baked.position[0], p[1], p[2] - baked.position[1]];
  if (baked.facing) p = qRot(qAxis([0, 1, 0], rad(-baked.facing)), p);
  return p;
}

/** 薄片/框架类道具允许身体贴得很近，不做体积重叠检查 */
const THIN_SHAPES = new Set(["backdrop", "window", "door", "fence", "railing"]);
/** 只有「实心大体积」道具才做陷进检查；桌椅下面本来就是空的，灌木/水可以穿过 */
const SOLID_SHAPES = new Set([
  "wall", "building", "column", "locker", "vending_machine", "car", "box",
  "platform", "pier", "bridge_pier", "stairs", "stairs_wide", "bus_stop",
  "phone_booth", "fountain",
]);

/* ─────────────────────────── 汇总 ─────────────────────────── */

function polygonMargin2(p, poly) {
  // 与 vec.mjs 的 polygonMargin 相同，但这里避免循环导入的命名冲突
  if (!poly || poly.length < 3) return -Infinity;
  let inside = true, minEdge = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const px = p[0] - a[0], pz = p[1] - a[1];
    const c = ex * pz - ez * px;
    if (c < 0) inside = false;
    minEdge = Math.min(minEdge, Math.abs(c) / (Math.hypot(ex, ez) || 1e-9));
  }
  return inside ? minEdge : -minEdge;
}

function summarize(findings, preset, label) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level]++;
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
