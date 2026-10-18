// 把工具里的 17 关节姿势参数，按 src/scene/rig.ts 的同一套公式
// 正向运动学展开成「模型实测骨架」的三维形态；不依赖 three.js / 浏览器。
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  add, sub, mul, dot, cross, len, dist, norm, lerp,
  QI, qmul, qAxis, qEulerXYZ, qFromTo, qRot, rad, deg,
  pointSegDist, segSegDist, convexHull, polygonMargin,
} from "./vec.mjs";

/* ── 与 src/types.ts / src/scene/rig.ts 同步的常量 ── */
export const JOINT_NAMES = [
  "hips", "spine", "chest", "neck", "head",
  "upperArm_L", "upperArm_R", "lowerArm_L", "lowerArm_R", "hand_L", "hand_R",
  "upperLeg_L", "upperLeg_R", "lowerLeg_L", "lowerLeg_R", "foot_L", "foot_R",
];
export const JOINT_LIMITS = {
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
const LIMB_ROOT = /^(upperArm|upperLeg)_/;
const LIMB_MID = /^(lowerArm|hand|lowerLeg|foot)_/;

export function loadProfile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** 预设来源：Node 22+ 直接 import .ts；旧 Node 退回源码解析。 */
let _presets = null;
export async function loadPresets(posesPath) {
  if (_presets) return _presets;
  try {
    const mod = await import(pathToFileURL(posesPath).href);
    _presets = mod.POSE_PRESETS;
  } catch {
    const src = readFileSync(posesPath, "utf8");
    const m = src.match(/export\s+const\s+POSE_PRESETS[^=]*=\s*(\[[\s\S]*?\n\];)/);
    if (!m) throw new Error("无法读取 POSE_PRESETS");
    // 去掉注释与尾部逗号后当 JS 字面量求值
    const literal = m[1]
      .slice(0, -1)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/,\s*([}\]])/g, "$1");
    _presets = new Function(`return ${literal}`)();
  }
  return _presets;
}

export function presetMap(presets) {
  const map = {};
  for (const p of presets) map[p.id] = p.pose ?? p;
  return map;
}

/** 预设 + 覆盖，不 clamp（用于发现「做不到位」的越界请求） */
export function requestedPose(pose, presets) {
  const out = {};
  for (const j of JOINT_NAMES) out[j] = {};
  const merge = (p) => {
    if (!p?.joints) return;
    for (const [name, params] of Object.entries(p.joints)) {
      if (!(name in out) || !params) continue;
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "number" && Number.isFinite(v)) out[name][k] = v;
      }
    }
  };
  if (pose?.preset && presets[pose.preset]) merge(presets[pose.preset]);
  merge(pose);
  return out;
}

/** 与 rig.ts resolvePose 相同的 clamp 语义 */
export function resolvePose(pose, presets) {
  const raw = requestedPose(pose, presets);
  const out = {};
  const clamped = [];
  for (const j of JOINT_NAMES) {
    out[j] = {};
    for (const [k, lim] of Object.entries(JOINT_LIMITS[j])) {
      const v = raw[j][k] ?? 0;
      const c = Math.min(lim[1], Math.max(lim[0], v));
      out[j][k] = c;
      if (Math.abs(c - v) > 0.01) {
        clamped.push({ joint: j, key: k, requested: +v.toFixed(2), used: +c.toFixed(2), limit: lim });
      }
    }
  }
  return { pose: out, clamped, raw };
}

/** 每关节的四元数（rig.ts applyPose 的逐行移植） */
export function jointQuaternions(resolved, model) {
  const q = {};
  for (const name of JOINT_NAMES) {
    const p = resolved[name] ?? {};
    let out;
    if (LIMB_ROOT.test(name)) {
      const rd = model.restDirs[name] ?? [0, -1, 0];
      const s = name.endsWith("_L") ? 1 : -1;
      const pitch = rad(p.pitch ?? 0);
      const yaw = rad(p.yaw ?? 0);
      const d = norm([s * Math.sin(pitch) * Math.sin(yaw), -Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)]);
      const swing = qFromTo(rd, d);
      const twist = qAxis(rd, s * rad(p.twist ?? 0));
      out = qmul(swing, twist);
    } else if (/^lowerArm|^hand/.test(name)) {
      out = qEulerXYZ(-rad(p.bend ?? 0), 0, -rad(p.side ?? 0));
    } else if (/^lowerLeg/.test(name)) {
      out = qEulerXYZ(rad(p.bend ?? 0), 0, 0);
    } else if (/^foot/.test(name)) {
      out = qEulerXYZ(rad(p.point ?? 0), 0, 0);
    } else {
      const bend = p.bend ?? p.nod ?? 0;
      const side = p.side ?? p.tilt ?? 0;
      const turn = p.twist ?? p.turn ?? 0;
      out = qEulerXYZ(rad(bend), -rad(turn), rad(side));
    }
    q[name] = out;
  }
  return q;
}

/** 由 профиль 建一个可复用的模型（骨骼树 + 静止方向） */
export function createModel(profile) {
  const bones = profile.bones;
  const n = bones.length;
  const parent = new Array(n);
  const local = new Array(n);
  const jointBone = {};
  for (let i = 0; i < n; i++) {
    parent[i] = bones[i].parent;
    local[i] = bones[i].pos.slice();
    if (parent[i] >= 0) local[i] = sub(bones[i].pos, bones[parent[i]].pos);
  }
  for (const [j, info] of Object.entries(profile.joints)) jointBone[j] = info.bone;
  const restDirs = {};
  for (const j of ["upperArm_L", "upperArm_R", "upperLeg_L", "upperLeg_R"]) {
    const child = j.startsWith("upperArm") ? j.replace("upperArm", "lowerArm") : j.replace("upperLeg", "lowerLeg");
    const a = profile.joints[j]?.pos, b = profile.joints[child]?.pos;
    if (a && b) restDirs[j] = norm(sub(b, a));
  }
  // 拓扑顺序：父在子前（PMX 通常已经如此，这里保险）
  const order = [];
  const seen = new Set();
  const visit = (i) => {
    if (seen.has(i)) return;
    if (parent[i] >= 0) visit(parent[i]);
    seen.add(i);
    order.push(i);
  };
  for (let i = 0; i < n; i++) visit(i);
  return { profile, bones, n, parent, local, jointBone, restDirs, order };
}

/**
 * 正向运动学 + 自动落地。
 * @param {object} model createModel 的返回值
 * @param {object} resolved 17 关节的已 clamp 姿势
 * @param {{elevation?:number, autoGround?:boolean, facing?:number, position?:[number,number]}} opts
 */
export function bake(model, resolved, opts = {}) {
  const { profile, n, parent, local, jointBone, order } = model;
  const q = jointQuaternions(resolved, model);
  const localQ = new Array(n).fill(QI);
  for (const [j, bi] of Object.entries(jointBone)) if (q[j]) localQ[bi] = q[j];

  const pos = new Array(n);
  const quat = new Array(n);
  for (const i of order) {
    const p = parent[i];
    if (p >= 0) {
      quat[i] = qmul(quat[p], localQ[i]);
      pos[i] = add(pos[p], qRot(quat[p], local[i]));
    } else {
      quat[i] = localQ[i];
      pos[i] = local[i].slice();
    }
  }

  // 落地：用实测突出点求模型最低点（近似 postedBox）
  //
  // groundExclude：不参与落地的骨骼（默认排除裙摆/头发）。
  // 裙子是刚性蒙皮、没有布料模拟：坐/跪时裙摆永远垂在臀部下方，
  // 若让它参与落地，整个人会被裙摆「撑」离地面 5–15cm——那不是人物悬空，
  // 而是布应该贴地。所以身体接触用裸露身体的最低点判定，裙摆允许压进地面。
  const exclude = opts.groundExclude instanceof RegExp ? opts.groundExclude : null;
  let minY = Infinity;
  let minYAll = Infinity;
  for (const [name, m] of Object.entries(profile.boneMetrics ?? {})) {
    if (!m.hull) continue;
    const bi = profile.bones.findIndex((b) => b.name === name);
    if (bi < 0) continue;
    for (const h of m.hull) {
      const y = pos[bi][1] + qRot(quat[bi], h)[1];
      if (y < minYAll) minYAll = y;
      if (exclude && exclude.test(name)) continue;
      if (y < minY) minY = y;
    }
  }
  if (!Number.isFinite(minY)) minY = minYAll;
  if (!Number.isFinite(minY)) minY = 0;

  const elevation = opts.elevation ?? 0;
  const shiftY = opts.autoGround === false ? 0 : elevation - minY;
  for (let i = 0; i < n; i++) pos[i][1] += shiftY;

  const facing = opts.facing ?? 0;
  const world = new Array(n);
  const fq = qAxis([0, 1, 0], rad(facing));
  for (let i = 0; i < n; i++) {
    let p = pos[i];
    if (facing) p = qRot(fq, p);
    if (opts.position) p = [p[0] + opts.position[0], p[1], p[2] + opts.position[1]];
    world[i] = p;
  }

  const joint = {};
  for (const [j, bi] of Object.entries(jointBone)) {
    joint[j] = { pos: pos[bi], world: world[bi], quat: quat[bi] };
  }
  return {
    model, joint, bonePos: pos, boneQuat: quat, boneWorld: world,
    shiftY, minY: minY + shiftY, minYAll: minYAll + shiftY, elevation, facing,
    position: opts.position ?? null,
  };
}

/** 判定裙摆/头发等「软布料」骨骼：它们不参与自动落地 */
export const SOFT_GROUND_BONES = /スカート|skirt|髪|hair|後髪|前髪/i;

/** body 空间点 → world（actor 的 position/facing） */
export function toWorld(baked, p) {
  let q = baked.facing ? qRot(qAxis([0, 1, 0], rad(baked.facing)), p) : p;
  if (baked.position) q = [q[0] + baked.position[0], q[1], q[2] + baked.position[1]];
  return q;
}

/** 地标世界坐标（chin / eyes / hands / toes / sole corners…） */
const LANDMARK_BONE = {
  chin: "head", eye_L: "head", eye_R: "head", eyeTip_L: "head", eyeTip_R: "head",
  ear_L: "head", ear_R: "head", headTop: "head", headBone: "head",
  hand_L: "hand_L", hand_R: "hand_R", finger_L: "hand_L", finger_R: "hand_R",
  toe_L: "foot_L", toe_R: "foot_R",
  sole_L: "foot_L", sole_R: "foot_R",
};
export function landmark(baked, profile, name) {
  const known = profile.landmarks?.[name];
  if (known == null) return null;
  const jname = LANDMARK_BONE[name];
  if (!jname) return Array.isArray(known[0]) ? known : known;
  const j = baked.joint[jname];
  if (!j) return known;
  const restBase = profile.joints[jname].pos;
  if (Array.isArray(known[0])) {
    return known.map((p) => add(j.pos, qRot(j.quat, sub(p, restBase))));
  }
  return add(j.pos, qRot(j.quat, sub(known, restBase)));
}

/** 实测突出点（骨骼局部 → 当前姿态） */
export function hullPoints(baked, profile) {
  const out = [];
  for (const [name, m] of Object.entries(profile.boneMetrics ?? {})) {
    if (!m.hull) continue;
    const bi = profile.bones.findIndex((b) => b.name === name);
    if (bi < 0) continue;
    const p = baked.bonePos[bi], q = baked.boneQuat[bi];
    for (const h of m.hull) out.push({ bone: name, p: add(p, qRot(q, h)) });
  }
  return out;
}

/** 骨架胶囊（实测长度 + 半径） */
export function capsules(baked, profile, radiusKey = "r") {
  const out = [];
  for (const [id, s] of Object.entries(profile.segments ?? {})) {
    const a = baked.joint[s.from], b = baked.joint[s.to];
    if (!a || !b) continue;
    out.push({ id, from: s.from, to: s.to, a: a.pos, b: b.pos, r: s[radiusKey] ?? s.r ?? 0.05 });
  }
  return out;
}

/** 身体/世界包围盒（用突出点，近似工具里的 postedBox） */
export function boundsOf(baked, profile, world = false) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { p } of hullPoints(baked, profile)) {
    const q = world ? toWorld(baked, p) : p;
    for (let k = 0; k < 3; k++) {
      if (q[k] < min[k]) min[k] = q[k];
      if (q[k] > max[k]) max[k] = q[k];
    }
  }
  return { min, max, size: sub(max, min), center: mul(add(min, max), 0.5) };
}

/* ── 人体质量模型（Dempster 比例）── */
const MASS = {
  head: 0.081, trunk: 0.497,
  upperArm: 0.028, lowerArm: 0.016, hand: 0.006,
  upperLeg: 0.100, lowerLeg: 0.0465, foot: 0.0145,
};

export function centerOfMass(baked, profile) {
  const J = (n) => baked.joint[n].pos;
  let total = 0;
  const acc = [0, 0, 0];
  const addMass = (m, p) => {
    total += m;
    acc[0] += p[0] * m; acc[1] += p[1] * m; acc[2] += p[2] * m;
  };
  const headTop = landmark(baked, profile, "headTop") ?? add(J("head"), [0, 0.12, 0]);
  // 头颈 8.1%
  addMass(MASS.head, lerp(J("head"), headTop, 0.45));
  // 躯干 49.7%
  addMass(MASS.trunk, lerp(J("hips"), J("neck"), 0.45));
  for (const s of ["L", "R"]) {
    addMass(MASS.upperArm, lerp(J(`upperArm_${s}`), J(`lowerArm_${s}`), 0.45));
    addMass(MASS.lowerArm, lerp(J(`lowerArm_${s}`), J(`hand_${s}`), 0.45));
    addMass(MASS.hand, lerp(J(`hand_${s}`), landmark(baked, profile, `finger_${s}`) ?? J(`hand_${s}`), 0.4));
    addMass(MASS.upperLeg, lerp(J(`upperLeg_${s}`), J(`lowerLeg_${s}`), 0.45));
    addMass(MASS.lowerLeg, lerp(J(`lowerLeg_${s}`), J(`foot_${s}`), 0.43));
    addMass(MASS.foot, lerp(J(`foot_${s}`), landmark(baked, profile, `toe_${s}`) ?? J(`foot_${s}`), 0.5));
  }
  return { pos: mul(acc, 1 / (total || 1)), mass: total };
}

/** 支撑多边形：地面接触点 + 脚底补片 */
export function supportPolygon(baked, profile, tol = 0.018) {
  const pts = [];
  const ground = baked.elevation;
  // 脚底四角
  for (const s of ["L", "R"]) {
    const corners = landmark(baked, profile, `sole_${s}`) ?? [];
    for (const c of corners) if (c[1] <= ground + tol) pts.push([c[0], c[2]]);
  }
  // 其它身体突出点（膝/臀/背/手）
  for (const h of hullPoints(baked, profile)) {
    if (h.p[1] <= ground + tol) pts.push([h.p[0], h.p[2]]);
  }
  const poly = convexHull(pts);
  return { points: pts, poly };
}

/** 胶囊两两穿插检测 */
export function collisions(baked, profile, opts = {}) {
  const caps = capsules(baked, profile, "r50");
  const tol = opts.tol ?? 0.022;
  const out = [];
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      const A = caps[i], B = caps[j];
      // 相邻段（共享关节）不算
      if (A.from === B.from || A.to === B.to || A.from === B.to || A.to === B.from) continue;
      const r = segSegDist(A.a, A.b, B.a, B.b);
      const pen = A.r + B.r - r.d;
      if (pen > tol) {
        out.push({
          a: A.id, b: B.id,
          penetration: +pen.toFixed(3),
          distance: +r.d.toFixed(3),
          at: mul(add(r.c1, r.c2), 0.5),
        });
      }
    }
  }
  return out.sort((x, y) => y.penetration - x.penetration);
}

/** 关节角度（度）——给报告和骨架图标注用 */
export function jointAngles(baked) {
  const ang = (a, b, c) => {
    const u = sub(a, b), v = sub(c, b);
    const lu = len(u), lv = len(v);
    if (!lu || !lv) return 0;
    return deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv)))));
  };
  const out = {};
  for (const s of ["L", "R"]) {
    out[`elbow_${s}`] = ang(baked.joint[`upperArm_${s}`].pos, baked.joint[`lowerArm_${s}`].pos, baked.joint[`hand_${s}`].pos);
    out[`knee_${s}`] = ang(baked.joint[`upperLeg_${s}`].pos, baked.joint[`lowerLeg_${s}`].pos, baked.joint[`foot_${s}`].pos);
    out[`shoulder_${s}`] = ang(baked.joint[`chest`].pos, baked.joint[`upperArm_${s}`].pos, baked.joint[`lowerArm_${s}`].pos);
  }
  out.spine = ang(baked.joint.hips.pos, baked.joint.spine.pos, baked.joint.chest.pos);
  out.neck = ang(baked.joint.chest.pos, baked.joint.neck.pos, baked.joint.head.pos);
  return out;
}

/** 头朝向（body 空间）：+Z 为脸朝前 */
export function headForward(baked) {
  return norm(qRot(baked.joint.head.quat, [0, 0, 1]));
}

/** 复刻 src/scene/gaze.ts 的 gaze 求解 */
export function solveGaze(resolved, headPos, targetPos, facingDeg) {
  let dir = sub(targetPos, headPos);
  const f = qAxis([0, 1, 0], rad(-facingDeg));
  dir = qRot(f, dir);
  const horiz = Math.hypot(dir[0], dir[2]);
  const rawTurn = -deg(Math.atan2(dir[0], dir[2]));
  const rawNod = deg(Math.atan2(-dir[1], horiz));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const turn = clamp(rawTurn, -80, 80);
  const nod = clamp(rawNod, -40, 40);
  return {
    rawTurn, rawNod,
    headTurn: Math.round(turn), headNod: Math.round(nod),
    neckTurn: Math.round(clamp((rawTurn - turn) / 2, -80, 80)),
    neckNod: Math.round(clamp((rawNod - nod) / 2, -60, 60)),
    reachableTurn: 160, reachableNod: 100,
  };
}
