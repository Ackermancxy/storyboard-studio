// 姿势数值求解器（作者侧工具，不参与运行时）。
//
// 目的：给「手要摸到腰 / 下巴 / 膝盖」「脚要落地」「重心要在支撑面内」这类
// 有明确几何目标的动作，用 FK + 坐标下降自动找关节参数，而不是手调数字。
// 只用实测骨架计算，不渲染。
import {
  loadProfile, loadPresets, presetMap, resolvePose, createModel, bake,
  landmark, collisions, SOFT_GROUND_BONES,
} from "./kinematics.mjs";
import { targets, handGap } from "./evaluate.mjs";
import { dist } from "./vec.mjs";

/* ── 确定性伪随机（同 seed 同结果，便于复现） ── */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSolverContext(root = "/home/cxy/storyboard") {
  const profile = loadProfile(`${root}/tools/pose-analysis/profiles/local/mikoto-pmx.json`);
  const model = createModel(profile);
  return { root, profile, model, presets: null };
}

export async function ensurePresets(ctx) {
  if (!ctx.presets) {
    const defs = await loadPresets(`${ctx.root}/src/data/poses.ts`);
    ctx.presets = presetMap(defs);
  }
  return ctx.presets;
}

/** 一次完整求解：base 是 {joints:{...}}，params 指定要搜索的关节参数 */
export function evalBaked(ctx, pose, opts = {}) {
  const req = resolvePose(pose, ctx.presets ?? {});
  return bake(ctx.model, req.pose, {
    elevation: opts.elevation ?? 0,
    autoGround: opts.autoGround !== false,
    groundExclude: opts.groundExclude ?? SOFT_GROUND_BONES,
    facing: opts.facing ?? 0,
    position: opts.position,
  });
}

/**
 * @param {object} ctx
 * @param {object} base 固定姿势 {joints:{...}}
 * @param {Array<{joint:string,key:string,min:number,max:number,step?:number,start?:number}>} params
 * @param {(baked:object, joints:object)=>number} score 越小越好
 */
export function solveJoints(ctx, base, params, score, opts = {}) {
  const { restarts = 6, rounds = 4, seed = 1, refine = true } = opts;
  const rnd = mulberry32(seed);
  const joints0 = base?.joints ?? base ?? {};
  const valueOf = (p, start) => {
    const v = start ? start[p.joint]?.[p.key] : joints0[p.joint]?.[p.key];
    return typeof v === "number" ? v : p.start ?? (p.min + p.max) / 2;
  };
  const withValues = (vals, start) => {
    const joints = {};
    for (const [j, ps] of Object.entries(joints0)) joints[j] = { ...ps };
    for (const [j, ps] of Object.entries(start)) joints[j] = { ...(joints[j] ?? {}), ...ps };
    for (const p of params) {
      joints[p.joint] ??= {};
      joints[p.joint][p.key] = vals[p.joint][p.key];
    }
    return { joints };
  };
  const evalValues = (vals, start) => {
    const pose = withValues(vals, start);
    const baked = evalBaked(ctx, pose, opts);
    return { pose, baked, score: score(baked, pose.joints) };
  };

  // 起点：用户给的 / 中点 / 随机
  const starts = [];
  const mkStart = (fn) => {
    const s = {};
    for (const p of params) {
      s[p.joint] ??= {};
      s[p.joint][p.key] = fn(p);
    }
    return s;
  };
  if (opts.startFromBase !== false) starts.push(mkStart((p) => valueOf(p, joints0)));
  starts.push(mkStart((p) => p.start ?? (p.min + p.max) / 2));
  for (let r = 0; r < Math.max(0, restarts - 2); r++) {
    starts.push(mkStart((p) => {
      const n = Math.max(1, Math.round((p.max - p.min) / (p.step ?? 5)));
      return p.min + Math.round(rnd() * n) * (p.step ?? 5);
    }));
  }

  let best = null;
  const evaluate = (vals, start) => {
    const r = evalValues(vals, start);
    if (!best || r.score < best.score) best = r;
    return r;
  };

  for (const start of starts) {
    let cur = JSON.parse(JSON.stringify(start));
    let curScore = evaluate(cur, start).score;
    let steps = params.map((p) => p.step ?? Math.max(1, (p.max - p.min) / 30));
    for (let round = 0; round < rounds; round++) {
      for (let pi = 0; pi < params.length; pi++) {
        const p = params[pi];
        const step = steps[pi];
        let bestV = cur[p.joint][p.key];
        let bestS = curScore;
        for (let v = p.min; v <= p.max + 1e-9; v += step) {
          const trial = JSON.parse(JSON.stringify(cur));
          trial[p.joint][p.key] = Math.round(v * 100) / 100;
          const s = evaluate(trial, start).score;
          if (s < bestS - 1e-9) { bestS = s; bestV = trial[p.joint][p.key]; }
        }
        cur[p.joint][p.key] = bestV;
        curScore = bestS;
      }
      if (refine) steps = steps.map((s) => Math.max(0.5, s / 2));
      else break;
    }
  }
  return best;
}

/* ── 常用目标（返回一个 score 函数） ── */

/** 手（腕或指尖）到身体目标点的距离；targets 由 evaluate.mjs 计算 */
export function scoreHandTarget(ctx, side, targetName, opts = {}) {
  const { weight = 1, maxGap = 0.02, wristWeight = 0.15 } = opts;
  return (baked) => {
    const T = targets(baked, ctx.profile);
    const g = handGap(baked, ctx.profile, side, T[targetName]);
    const excess = Math.max(0, g.best - maxGap);
    return weight * (excess * excess * 100 + g.best) + wristWeight * g.wrist;
  };
}

/** 指定点坐标距离（如 hand_R 到某个关节） */
export function scoreJointToPoint(jointName, pointFn, opts = {}) {
  const { weight = 1 } = opts;
  return (baked) => {
    const p = baked.joint[jointName].pos;
    const q = pointFn(baked);
    return weight * dist(p, q);
  };
}

/** 穿插惩罚：超过 tol 的部分平方累加 */
export function collisionPenalty(ctx, opts = {}) {
  const { weight = 30, tol = 0.022 } = opts;
  return (baked) => {
    const cs = collisions(baked, ctx.profile, { tol });
    let s = 0;
    for (const c of cs) {
      const excess = Math.max(0, c.penetration - tol);
      s += excess * excess;
    }
    return weight * s * 100;
  };
}

/** 组合多个评分 */
export function combine(...fns) {
  return (baked, joints) => fns.reduce((s, f) => s + f(baked, joints), 0);
}

/** 打印关节参数（直接可粘进 poses.ts） */
export function formatPose(joints, names) {
  return names.map((n) => `${n}: ${JSON.stringify(joints[n] ?? {})}`).join(", ");
}
