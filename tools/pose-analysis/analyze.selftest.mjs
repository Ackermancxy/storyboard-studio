// 数学建模回归测试：骨架 FK、动作意图、道具高度、视线、机位。
// 运行：node --test tools/pose-analysis/analyze.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadProfile, loadPresets, presetMap, resolvePose, createModel, bake,
  supportPolygon, centerOfMass, collisions, landmark, headForward, solveGaze,
} from "./kinematics.mjs";
import { evaluatePose } from "./evaluate.mjs";
import { solveCamera, aspectValue } from "./camera.mjs";
import { dot, dist } from "./vec.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PROFILE = resolve(HERE, "profiles/local/mikoto-pmx.json");

const profile = loadProfile(PROFILE);
const presetDefs = await loadPresets(resolve(ROOT, "src/data/poses.ts"));
const presets = presetMap(presetDefs);
const model = createModel(profile);

function marginOf(com, poly) {
  if (!poly?.length) return -Infinity;
  let inside = true, min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const px = com.pos[0] - a[0], pz = com.pos[2] - a[1];
    const c = ex * pz - ez * px;
    if (c < 0) inside = false;
    min = Math.min(min, Math.abs(c) / (Math.hypot(ex, ez) || 1e-9));
  }
  return inside ? min : -min;
}

function evalPreset(preset, { props = [], actor = {}, propShapes = {} } = {}) {
  const autoGround = actor.autoGround !== false;
  const req = resolvePose({ preset, ...(actor.pose ?? {}) }, presets);
  const baked = bake(model, req.pose, {
    elevation: actor.elevation ?? 0,
    autoGround,
    facing: actor.facing ?? 0,
    position: actor.position ?? [0, 0],
  });
  const support = supportPolygon(baked, profile);
  const com = centerOfMass(baked, profile);
  const ev = evaluatePose({
    profile, baked, resolved: req.pose, clamped: req.clamped,
    presetId: preset, presetLabel: preset,
    actor: { position: [0, 0], facing: 0, ...actor },
    props, propShapes,
    collisions: collisions(baked, profile, { tol: 0.022 }),
    support, com, margin: marginOf(com, support.poly),
  });
  return { ...ev, baked, req, support, com };
}

const has = (ev, code) => ev.findings.some((f) => f.code === code);

/* ───────────── FK / 测量 ───────────── */

test("中立姿势精确复现实测关节位置与骨长", () => {
  const req = resolvePose({}, presets);
  const b = bake(model, req.pose, { elevation: 0, autoGround: false, facing: 0, position: [0, 0] });
  // 躯干与四肢根部：自身旋转不改变自身位置，应精确等于实测
  for (const name of ["hips", "spine", "chest", "neck", "head", "upperArm_L", "upperArm_R", "upperLeg_L", "upperLeg_R"]) {
    const d = dist(b.joint[name].pos, profile.joints[name].pos);
    assert.ok(d < 1e-6, `${name} 误差 ${d}`);
  }
  // 中立姿势会把手臂从 T 字放下；骨长必须保持不变
  for (const [a, c, len] of [
    ["upperArm_L", "lowerArm_L", profile.measurements.upperArm],
    ["lowerArm_L", "hand_L", profile.measurements.forearm],
    ["upperLeg_L", "lowerLeg_L", profile.measurements.thigh],
    ["lowerLeg_L", "foot_L", profile.measurements.shin],
  ]) {
    const d = dist(b.joint[a].pos, b.joint[c].pos);
    assert.ok(Math.abs(d - len) < 1e-4, `${a}→${c} 长度 ${d}，应为 ${len}`);
  }
  // head 的中立朝向应为 +Z
  assert.ok(headForward(b)[2] > 0.999);
});

test("实测尺寸与人体比例自洽", () => {
  const m = profile.measurements;
  assert.ok(Math.abs(m.height - 1.56) < 0.005);
  assert.ok(m.upperArm > 0.15 && m.upperArm < 0.20);
  assert.ok(m.forearm > 0.20 && m.forearm < 0.26);
  assert.ok(m.thigh > 0.30 && m.thigh < 0.37);
  assert.ok(m.shin > 0.34 && m.shin < 0.42);
  assert.ok(m.armSpan > m.height * 0.65);
  // 右侧手指/脚趾地标应存在
  assert.ok(landmark(bake(model, resolvePose({}, presets).pose, { autoGround: false }), profile, "finger_R"));
});

/* ───────────── 动作意图 ───────────── */

test("stand 静态站姿通过验收", () => {
  const ev = evalPreset("stand");
  assert.equal(ev.summary.counts.error, 0, JSON.stringify(ev.findings));
  assert.equal(ev.summary.counts.warn, 0, JSON.stringify(ev.findings));
});

test("phone_call 手腕真的到耳朵", () => {
  const req = resolvePose({ preset: "phone_call" }, presets);
  const b = bake(model, req.pose, { elevation: 0, autoGround: true, facing: 0, position: [0, 0] });
  const ear = landmark(b, profile, "ear_R");
  const wrist = b.joint.hand_R.pos;
  const finger = landmark(b, profile, "finger_R");
  assert.ok(Math.min(dist(wrist, ear), dist(finger, ear)) < 0.10);
  assert.equal(evalPreset("phone_call").summary.counts.error, 0);
});

test("hands_on_hips 手真的扶到腰", () => {
  const ev = evalPreset("hands_on_hips");
  assert.ok(!has(ev, "intent-hips"), JSON.stringify(ev.findings.map((f) => f.code)));
  assert.equal(ev.summary.counts.error, 0);
  assert.equal(ev.summary.counts.warn, 0);
});

test("kneel 膝盖真的跪地", () => {
  const ev = evalPreset("kneel");
  assert.ok(!has(ev, "kneel-failed"), JSON.stringify(ev.findings.map((f) => f.code)));
  assert.equal(ev.summary.counts.error, 0);
  assert.equal(ev.summary.counts.warn, 0);
});

test("tiptoe 脚跟抬起 >4cm", () => {
  const ev = evalPreset("tiptoe");
  assert.ok(!has(ev, "intent-tiptoe"), JSON.stringify(ev.findings.map((f) => f.code)));
  assert.equal(ev.summary.counts.error, 0);
});

/* ───────────── 道具 / 场景 ───────────── */

test("sit_chair：有椅子通过；无椅子报错；凳子太高/箱子太矮都能识别", () => {
  const chair = evalPreset("sit_chair", { props: [{ id: "C", model: "chair", position: [0, 0], facing: 0 }], propShapes: { chair: "chair" } });
  assert.equal(chair.summary.counts.error, 0, JSON.stringify(chair.findings));

  const none = evalPreset("sit_chair");
  assert.ok(has(none, "no-seat"));

  const stool = evalPreset("sit_chair", {
    props: [{ id: "C", model: "stool", position: [0, 0], facing: 0 }], propShapes: { stool: "stool" },
  });
  assert.ok(has(stool, "seat-height"), "凳子 0.57m 应报臀部陷进座面");

  const lowBox = evalPreset("sit_chair", {
    props: [{ id: "C", model: "box", position: [0, 0], facing: 0, size: [0.5, 0.4, 0.5] }],
    propShapes: { box: "box" },
  });
  assert.ok(has(lowBox, "seat-height"), "0.40m 箱子应报臀部悬空");
});

test("hand_on_wall：没墙报错，墙在 0.6m 处通过", () => {
  assert.ok(has(evalPreset("hand_on_wall"), "no-wall"));
  const ev = evalPreset("hand_on_wall", {
    props: [{ id: "W", model: "wall", position: [0, 0.6], facing: 0 }],
    propShapes: { wall: "wall" },
  });
  assert.equal(ev.summary.counts.error, 0, JSON.stringify(ev.findings));
});

test("lean_rail：默认 1.1m 栏杆太高，0.85m 才合手", () => {
  const high = evalPreset("lean_rail", {
    props: [{ id: "R", model: "railing", position: [0, 0.6], facing: 0 }],
    propShapes: { railing: "railing" },
  });
  assert.ok(has(high, "rail-height"), JSON.stringify(high.findings.map((f) => f.code)));

  const ok = evalPreset("lean_rail", {
    props: [{ id: "R", model: "railing", position: [0, 0.6], facing: 0, size: [4, 0.85, 0.05] }],
    propShapes: { railing: "railing" },
  });
  assert.equal(ok.summary.counts.error, 0, JSON.stringify(ok.findings));
});

test("人站进实心箱子会报 prop-embed", () => {
  const ev = evalPreset("stand", {
    props: [{ id: "B", model: "box", position: [0, 0], facing: 0 }],
    propShapes: { box: "box" },
  });
  assert.ok(has(ev, "prop-embed"), JSON.stringify(ev.findings.map((f) => f.code)));
});

test("bridge_pier 按圆柱占地判定：人站在树干前不误报陷进", () => {
  const ev = evalPreset("stand", {
    props: [{
      id: "T", model: "bridge_pier", label: "主干",
      position: [-0.8, -2.7], facing: 0, size: [5.3, 20, 5.3],
    }],
    actor: { position: [0, -0.6], facing: 50 },
  });
  assert.ok(!has(ev, "prop-embed"), JSON.stringify(ev.findings.map((f) => f.code)));
});

/* ───────────── 视线 / 机位 ───────────── */

test("gaze 看向正前方相机时不转头", () => {
  const req = resolvePose({ preset: "stand" }, presets);
  const b0 = bake(model, req.pose, { elevation: 0, autoGround: true, facing: 0, position: [0, 0] });
  const target = [0, 1.45, 2.5];
  const g = solveGaze(req.pose, b0.joint.head.world, target, 0);
  assert.ok(Math.abs(g.rawTurn) < 2, `rawTurn=${g.rawTurn}`);
  req.pose.head.turn = g.headTurn; req.pose.head.nod = g.headNod;
  req.pose.neck.turn = g.neckTurn; req.pose.neck.nod = g.neckNod;
  const b = bake(model, req.pose, { elevation: 0, autoGround: true, facing: 0, position: [0, 0] });
  const hf = headForward(b);
  const want = (() => {
    const d = [target[0] - b.joint.head.world[0], target[1] - b.joint.head.world[1], target[2] - b.joint.head.world[2]];
    const l = Math.hypot(...d);
    return d.map((v) => v / l);
  })();
  assert.ok(dot(hf, want) > 0.99, `dot=${dot(hf, want)}`);
});

test("solveCamera：MS 50mm 单人取景目标在身高 74% 处", () => {
  const cam = solveCamera(
    { shotSize: "MS", focalLength: 50, subject: "A", angle: "eye", azimuth: 0 },
    [{ id: "A", position: [0, 0], facing: 0, height: 1.7, elevation: 0 }],
    aspectValue("3:2"),
  );
  assert.ok(Math.abs(cam.target[1] - 1.7 * 0.74) < 1e-6, `targetY=${cam.target[1]}`);
  assert.ok(cam.position[2] > 0 && cam.position[1] > 0);
  assert.ok(cam.distance > 1 && cam.distance < 10);
});
