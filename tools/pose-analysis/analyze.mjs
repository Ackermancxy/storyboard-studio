#!/usr/bin/env node
// 分镜姿势离线验收 CLI：
//   node tools/pose-analysis/analyze.mjs <project.storyboard.json> [选项]
//
// 完全靠实测骨架 + 三维几何计算形态，不启动浏览器、不截图：
//   · 人物摆姿后的骨架、最低点、包围盒、重心、支撑面
//   · 与预设名要求的动作逐项比对（做到位没有）
//   · 穿模 / 重心 / 关节限位 / 悬空（诡异没有）
//   · 与场景道具的高度、距离、存在性比对（合适没有）
//
// 选项：
//   --shot S01        只分析某镜（可重复，或逗号分隔）
//   --actor A         只分析某人（可重复）
//   --json            输出 JSON
//   --svg [path]      输出实测骨架图（默认 ~/Downloads/<标题>-骨架.svg）
//   --presets         不读项目，审计全部内置预设（可加 --model mikoto）
//   --model mikoto    --presets 时指定模型
//   --strict          有 error 时退出码 1
//   --quiet           只打印结论行
import { readFileSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import {
  loadProfile, loadPresets, presetMap, resolvePose, createModel, bake,
  boundsOf, collisions, supportPolygon, centerOfMass, jointAngles, headForward,
  solveGaze, hullPoints, toWorld, SOFT_GROUND_BONES,
} from "./kinematics.mjs";
import { evaluatePose, LEVEL_ORDER } from "./evaluate.mjs";
import { auditOne, sortedFindings as sortedAuditFindings } from "./preset-audit.mjs";
import {
  solveCamera, aspectValue, focalToVFovDeg, SHOT_TABLE, cameraHudText,
} from "./camera.mjs";
import { renderSheet } from "./render-svg.mjs";
import { len, rad, qAxis, qRot, sub, norm } from "./vec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PROFILE_DIR = join(HERE, "profiles/local");
const POSES_TS = join(ROOT, "src/data/poses.ts");

/* ───────────────────────── 参数 ───────────────────────── */

function parseArgs(argv) {
  const out = { files: [], shots: [], actors: [], json: false, svg: null, presets: false, model: "mikoto", strict: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--presets") out.presets = true;
    else if (a === "--strict") out.strict = true;
    else if (a === "--quiet") out.quiet = true;
    else if (a === "--shot") out.shots.push(...String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--actor") out.actors.push(...String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--svg") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { out.svg = next; i++; } else out.svg = "";
    } else if (a.startsWith("--")) { console.error(`未知选项：${a}`); process.exit(2); }
    else out.files.push(a);
  }
  return out;
}

/* ───────────────────────── 资源 ───────────────────────── */

function mergeById(base, patch) {
  if (!patch?.length) return base;
  const map = new Map(base.map((x) => [x.id, x]));
  for (const x of patch) if (x?.id) map.set(x.id, x);
  return [...map.values()];
}

function loadAssets() {
  const base = JSON.parse(readFileSync(join(ROOT, "public/assets/manifest.json"), "utf8"));
  let local = {};
  const lp = join(ROOT, "public/assets/manifest.local.json");
  if (existsSync(lp)) local = JSON.parse(readFileSync(lp, "utf8"));
  return {
    characters: mergeById(base.characters ?? [], local.characters),
    props: mergeById(base.props ?? [], local.props),
  };
}

function profileIndex() {
  const out = new Map();
  if (!existsSync(PROFILE_DIR)) return out;
  for (const f of readdirSync(PROFILE_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const p = JSON.parse(readFileSync(join(PROFILE_DIR, f), "utf8"));
      if (p?.id && Array.isArray(p.bones)) out.set(p.id, { path: join(PROFILE_DIR, f), profile: p });
    } catch { /* 跳过坏文件 */ }
  }
  return out;
}

function profileFor(model, index) {
  if (index.has(model)) return index.get(model);
  for (const [id, v] of index) if (model.startsWith(id) || id.startsWith(model)) return v;
  return null;
}

/* ───────────────────────── 相机 ───────────────────────── */

function manualCamera(spec, aspect) {
  const position = spec.position;
  const target = spec.target;
  const distance = len(sub(position, target));
  const focal = spec.focalLength ?? 50;
  return {
    position, target, distance,
    subjectHeight: 1.7,
    vFov: focalToVFovDeg(focal, aspect),
    size: SHOT_TABLE[spec.shotSize ?? "MS"],
    focal,
  };
}

function solveShotCamera(project, shot, actorStates, measured) {
  const aspect = aspectValue(project.aspect);
  const cam = shot.camera;
  if (cam.mode === "manual" && cam.position && cam.target) return manualCamera(cam, aspect);
  const actors = shot.actors.map((a) => {
    const st = actorStates.get(a.id);
    return {
      id: a.id,
      position: a.position,
      facing: a.facing,
      height: st?.height ?? 1.73,
      elevation: a.elevation ?? 0,
      bounds: measured ? st?.bounds : undefined,
    };
  });
  return solveCamera(cam, actors, aspect);
}

/* ───────────────────────── 摆姿管线（镜像 SceneManager） ───────────────────────── */

function bodyTarget(baked, world) {
  let p = world;
  if (baked.position) p = [p[0] - baked.position[0], p[1], p[2] - baked.position[1]];
  if (baked.facing) p = qRot(qAxis([0, 1, 0], rad(-baked.facing)), p);
  return p;
}

function poseActor({ actor, profile, presets, model, camera, headById }) {
  const req = resolvePose(actor.pose, presets);
  const opts = {
    elevation: actor.elevation ?? 0,
    autoGround: actor.autoGround !== false,
    facing: actor.facing ?? 0,
    position: actor.position,
    groundExclude: SOFT_GROUND_BONES,
  };
  let baked = bake(model, req.pose, opts);
  let gazeInfo = null;
  if (actor.gaze) {
    const headWorld = baked.joint.head.world;
    const targetWorld = actor.gaze === "camera"
      ? camera.position
      : (headById.get(actor.gaze) ?? camera.position);
    const g = solveGaze(req.pose, headWorld, targetWorld, actor.facing ?? 0);
    req.pose.head.turn = g.headTurn;
    req.pose.head.nod = g.headNod;
    req.pose.neck.turn = g.neckTurn;
    req.pose.neck.nod = g.neckNod;
    baked = bake(model, req.pose, opts);
    gazeInfo = {
      kind: actor.gaze,
      targetWorld,
      targetBody: bodyTarget(baked, targetWorld),
      rawTurn: g.rawTurn,
      rawNod: g.rawNod,
      headTurn: g.headTurn,
      headNod: g.headNod,
      neckTurn: g.neckTurn,
      neckNod: g.neckNod,
      distance: len(sub(targetWorld, baked.joint.head.world)),
    };
  }
  return { resolved: req.pose, clamped: req.clamped, baked, gaze: gazeInfo };
}

/**
 * 完整镜头管线。返回 { shot, camera, actors:[…], errors:[…] }
 */
function analyzeShot(project, shot, { assets, profiles, presets, presetDefs, shotFilter, actorFilter }) {
  const charById = new Map(assets.characters.map((c) => [c.id, c]));
  const propShapes = {};
  for (const p of assets.props) propShapes[p.id] = p.shape ?? p.id;

  const aspect = aspectValue(project.aspect);
  const actors = shot.actors.filter((a) => !actorFilter.length || actorFilter.includes(a.id));
  const errors = [];

  // 每个 actor 的档案/模型
  const states = new Map();
  for (const a of actors) {
    const def = charById.get(a.model);
    const prof = profileFor(a.model, profiles);
    const height = prof?.profile.measurements?.height ?? def?.height ?? 1.73;
    const state = { actor: a, def, prof, height, model: null, measured: !!prof };
    if (!prof) {
      errors.push(`${shot.id}/${a.id}：模型 ${a.model} 没有实测档案，无法做几何验收（只能跳过）。`);
    } else {
      state.model = createModel(prof.profile);
    }
    states.set(a.id, state);
  }

  // 1) 按站姿估算机位（gaze 用）
  let camera = solveShotCamera(project, shot, states, false);

  // 2) 摆姿 → 3) 实测包围盒 → 4) 重解机位
  const headById = new Map();
  for (const [id, st] of states) {
    headById.set(id, [st.actor.position[0], st.height * 0.93, st.actor.position[1]]);
  }

  const firstPass = new Map();
  for (const [id, st] of states) {
    if (!st.prof) continue;
    const r = poseActor({ ...st, actor: st.actor, profile: st.prof.profile, presets, model: st.model, camera, headById });
    firstPass.set(id, r);
    st.bounds = boundsOf(r.baked, st.prof.profile, true);
  }
  if (shot.camera.mode !== "manual" || !shot.camera.position) {
    camera = solveShotCamera(project, shot, states, true);
  }

  // 5) 有 gaze：用最终机位重摆一次（与 SceneManager 一致，之后不再解机位）
  const anyGaze = actors.some((a) => a.gaze);
  const results = [];
  for (const [id, st] of states) {
    if (!st.prof) {
      results.push({ actor: st.actor, state: st, profile: null, findings: [], summary: { preset: st.actor.pose?.preset ?? null, label: "", level: "info", counts: { error: 0, warn: 0, info: 0 }, ok: true, headline: "未实测，跳过几何验收" }, metrics: null, gaze: null, bounds: null });
      continue;
    }
    const profile = st.prof.profile;
    const r = anyGaze
      ? poseActor({ ...st, actor: st.actor, profile, presets, model: st.model, camera, headById })
      : firstPass.get(id);
    st.bounds = boundsOf(r.baked, profile, true);

    const support = supportPolygon(r.baked, profile);
    const com = centerOfMass(r.baked, profile);
    const margin = marginOf([com.pos[0], com.pos[2]], support.poly);
    const coll = collisions(r.baked, profile, { tol: 0.022 });
    const presetDef = presetDefs.find((p) => p.id === (st.actor.pose?.preset ?? ""));
    const ev = evaluatePose({
      profile, baked: r.baked, resolved: r.resolved, clamped: r.clamped,
      presetId: st.actor.pose?.preset ?? null,
      presetLabel: presetDef?.name ?? st.actor.pose?.preset ?? "自定义",
      actor: st.actor,
      props: shot.props ?? [],
      propShapes,
      gaze: r.gaze,
      collisions: coll, support, com, margin,
    });
    results.push({
      actor: st.actor, state: st, profile,
      resolved: r.resolved, clamped: r.clamped, baked: r.baked,
      findings: ev.findings, summary: ev.summary, metrics: ev.metrics,
      gaze: r.gaze, bounds: st.bounds,
      support, com, margin, angles: jointAngles(r.baked),
    });
  }

  const actorsWorld = results.map((r) => {
    const facing = r.actor.facing ?? 0;
    const fq = qAxis([0, 1, 0], rad(facing));
    const supportPoly = (r.support?.poly ?? []).map(([x, z]) => {
      const q = qRot(fq, [x, 0, z]);
      return [q[0] + r.actor.position[0], q[2] + r.actor.position[1]];
    });
    return {
      id: r.actor.id, label: r.actor.label, position: r.actor.position,
      facing, bounds: r.bounds, supportPoly,
      gazeTarget: r.gaze?.targetWorld ?? null,
    };
  });

  return { shot, camera, aspect, results, actorsWorld, errors, propShapes, shotFilter };
}

function marginOf(p, poly) {
  // 与 evaluate.mjs 相同语义：点在支撑多边形内为正
  if (!poly?.length) return -Infinity;
  if (poly.length === 1) return 0.04 - Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]);
  if (poly.length === 2) {
    const a = poly[0], b = poly[1];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const l2 = abx * abx + abz * abz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
    return 0.02 - Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
  }
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

/* ───────────────────────── 报告 ───────────────────────── */

const SYM = { error: "❌", warn: "⚠️ ", info: "ℹ️ " };

function sortedFindings(findings) {
  return [...findings].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);
}

function printShotReport(r, { quiet }) {
  const { shot, camera, results, errors } = r;
  const hud = cameraHudText(shot.camera, "FF");
  console.log(`\n${shot.id}  ${shot.name ?? ""}${quiet ? "" : `  · ${hud}`}`);
  if (!quiet) {
    const p = camera.position.map((v) => v.toFixed(2)).join(", ");
    const t = camera.target.map((v) => v.toFixed(2)).join(", ");
    console.log(`    机位 (${p}) → 目标 (${t})　距离 ${camera.distance.toFixed(2)} m　等效 ${camera.focal}mm　垂直视场 ${camera.vFov.toFixed(1)}°`);
  }
  for (const e of errors) console.log(`    ⚠️  ${e}`);

  for (const a of results) {
    const label = a.actor.label ?? a.actor.id;
    const preset = a.summary.label || a.actor.pose?.preset || "自定义";
    console.log(`\n    ${a.actor.id} ${label} · ${a.actor.model} · ${preset}`);
    if (!a.profile) {
      console.log(`      ⚠️  无实测档案，未做几何验收`);
      continue;
    }
    const c = a.summary.counts;
    console.log(`      ${a.summary.level === "error" ? "❌" : a.summary.level === "warn" ? "⚠️ " : "✅"} ${a.summary.headline}（❌ ${c.error} / ⚠️ ${c.warn} / ℹ️ ${c.info}）`);
    if (!quiet) {
      const f = sortedFindings(a.findings);
      for (const x of f) {
        if (x.level === "info") continue;
        console.log(`        ${SYM[x.level]} ${x.title}`);
        for (const line of wrapConsole(x.detail, 96)) console.log(`           ${line}`);
      }
      const m = a.metrics;
      const ang = a.angles;
      console.log(`        实测：重心高 ${(a.com.pos[1] * 100).toFixed(0)} cm　支撑余量 ${(a.margin * 100).toFixed(0)} cm　膝 ${ang.knee_L.toFixed(0)}°/${ang.knee_R.toFixed(0)}°　肘 ${ang.elbow_L.toFixed(0)}°/${ang.elbow_R.toFixed(0)}°`);
      if (a.gaze) {
        const hf = headForward(a.baked);
        const want = norm(sub(a.gaze.targetBody, a.baked.joint.head.pos));
        const err = (Math.acos(Math.max(-1, Math.min(1, hf[0] * want[0] + hf[1] * want[1] + hf[2] * want[2]))) * 180) / Math.PI;
        console.log(`        视线：${a.gaze.kind === "camera" ? "看镜头" : `看 ${a.gaze.kind}`}　距离 ${a.gaze.distance.toFixed(2)} m　偏差 ${err.toFixed(1)}°　请求转 ${a.gaze.rawTurn.toFixed(0)}° / 俯仰 ${a.gaze.rawNod.toFixed(0)}°`);
      }
    }
  }
}

function wrapConsole(s, max) {
  const out = [];
  let line = "", w = 0;
  for (const ch of String(s ?? "")) {
    const cw = /[\u0000-ÿ]/.test(ch) ? 0.55 : 1;
    if (w + cw > max) { out.push(line); line = ""; w = 0; }
    line += ch; w += cw;
  }
  if (line) out.push(line);
  return out;
}

function stripForJson(v) {
  if (Array.isArray(v)) return v.map(stripForJson);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "baked" || k === "resolved" || k === "profile" || k === "state") continue;
      if (typeof x === "function") continue;
      o[k] = stripForJson(x);
    }
    return o;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

/* ───────────────────────── 预设审计 ───────────────────────── */

function auditPresets({ presetDefs, presets, profiles, model: modelId, quiet, print = true }) {
  const hit = profileFor(modelId, profiles);
  if (!hit) {
    console.error(`模型 ${modelId} 没有实测档案；现有：${[...profiles.keys()].join(", ") || "（无）"}`);
    process.exit(2);
  }
  const profile = hit.profile;
  const model = createModel(profile);
  const rows = [];
  for (const def of presetDefs) {
    const r = auditOne({ def, profile, model, presets });
    const top = sortedAuditFindings(r.findings).filter((f) => f.level !== "info").slice(0, 4);
    rows.push({
      id: def.id, name: def.name, env: r.env, summary: r.summary, top,
      metrics: {
        margin: r.metrics.margin, pelvisLow: r.metrics.pelvisLow,
        kneeL: r.metrics.kneeL, kneeR: r.metrics.kneeR,
        footL: r.metrics.footL, footR: r.metrics.footR,
        elevation: r.elevation,
      },
    });
  }
  const order = { error: 0, warn: 1, info: 2 };
  rows.sort((a, b) => order[a.summary.level] - order[b.summary.level]);
  if (print) {
    console.log(`\n预设审计 · ${modelId} · 身高 ${(profile.measurements?.height ?? 0).toFixed(2)} m · 共 ${rows.length} 个\n`);
    for (const r of rows) {
      const sym = r.summary.level === "error" ? "❌" : r.summary.level === "warn" ? "⚠️ " : "✅";
      const env = r.env?.kind && r.env.kind !== "stand" ? ` [${r.env.kind}${r.env.top ? ` ${r.env.top.toFixed(2)}m` : ""}]` : "";
      console.log(`${sym} ${r.id.padEnd(22)} ${r.name.padEnd(12)}${env} ❌${r.summary.counts.error} ⚠️${r.summary.counts.warn}`);
      if (!quiet) for (const f of r.top) console.log(`     · ${f.title}`);
    }
  }
  return rows;
}

/* ───────────────────────── 主流程 ───────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assets = loadAssets();
  const profiles = profileIndex();
  const presetDefs = await loadPresets(POSES_TS);
  const presets = presetMap(presetDefs);

  if (args.presets) {
    const rows = auditPresets({ presetDefs, presets, profiles, model: args.model, quiet: args.quiet, print: !args.json });
    if (args.json) console.log(JSON.stringify(rows, null, 2));
    if (args.strict && rows.some((r) => r.summary.level === "error")) process.exit(1);
    return;
  }

  if (!args.files.length) {
    console.error("用法：node tools/pose-analysis/analyze.mjs <project.storyboard.json> [--shot S01] [--actor A] [--json] [--svg [path]]");
    console.error("      node tools/pose-analysis/analyze.mjs --presets [--model mikoto]");
    process.exit(2);
  }

  let anyError = false;
  const all = [];

  for (const file of args.files) {
    const abs = resolve(file.replace(/^~(?=\/)/, homedir()));
    if (!existsSync(abs)) { console.error(`找不到文件：${abs}`); process.exit(2); }
    const project = JSON.parse(readFileSync(abs, "utf8"));
    if (!Array.isArray(project.shots)) { console.error(`${abs} 不是分镜项目（缺少 shots）`); process.exit(2); }

    const shots = project.shots.filter((s) => !args.shots.length || args.shots.includes(s.id));
    if (!shots.length) { console.error(`没有匹配的镜头：${args.shots.join(", ")}`); continue; }

    if (!args.json) {
      console.log(`\n${"=".repeat(78)}`);
      console.log(`${project.title ?? basename(abs)}　${project.aspect}　${shots.length} 镜　${abs}`);
    }

    const shotReports = [];
    for (const shot of shots) {
      const r = analyzeShot(project, shot, {
        assets, profiles, presets, presetDefs,
        shotFilter: args.shots, actorFilter: args.actors,
      });
      shotReports.push(r);
      for (const a of r.results) if (a.summary.level === "error") anyError = true;
      if (!args.json) printShotReport(r, args);
    }

    all.push({ file: abs, project, shotReports });

    if (args.svg !== null) {
      const outBase = args.svg || join(homedir(), "Downloads", `${project.title || basename(abs, ".storyboard.json")}-骨架.svg`);
      mkdirSync(dirname(resolve(outBase)), { recursive: true });
      for (const r of shotReports) {
        const targets = r.results.filter((x) => x.profile);
        if (!targets.length) continue;
        const t = targets[0];
        const sheet = renderSheet({
          profile: t.profile, baked: t.baked, findings: t.findings, summary: t.summary,
          actor: t.actor, shot: r.shot, camera: r.camera,
          props: r.shot.props ?? [], propShapes: r.propShapes,
          actorsWorld: r.actorsWorld, gazeTargetBody: t.gaze?.targetBody ?? null,
          margin: t.margin,
        });
        const ext = extname(outBase);
        const multi = shotReports.length > 1 || targets.length > 1;
        const path = multi
          ? `${outBase.slice(0, ext ? -ext.length : undefined)}-${r.shot.id}-${t.actor.id}${ext || ".svg"}`
          : outBase;
        writeFileSync(path, sheet);
        if (!args.json) console.log(`\n骨架图：${resolve(path)}`);
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify(stripForJson(all.map(({ file, project, shotReports }) => ({
      file, title: project.title, aspect: project.aspect, sensor: project.sensor,
      shots: shotReports.map((r) => ({
        id: r.shot.id, name: r.shot.name,
        camera: { position: r.camera.position, target: r.camera.target, distance: r.camera.distance, focal: r.camera.focal, vFov: r.camera.vFov },
        errors: r.errors,
        actors: r.results.map((a) => ({
          id: a.actor.id, label: a.actor.label, model: a.actor.model,
          preset: a.summary.preset, presetLabel: a.summary.label,
          measured: !!a.profile,
          height: a.profile?.measurements?.height ?? null,
          summary: a.summary, findings: a.findings,
          com: a.com ? { pos: a.com.pos, mass: a.com.mass } : null,
          margin: a.margin, angles: a.angles, gaze: a.gaze, bounds: a.bounds,
        })),
      })),
    }))), null, 2));
  }

  if (args.strict && anyError) process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
