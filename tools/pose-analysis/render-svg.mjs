// 由实测骨架直接生成 SVG 骨架图（不截图、不依赖浏览器）。
// 三视图 + 重心/支撑面/接触点/视线/问题编号 + 俯视场景图。
import { add, sub, mul, qRot, len, dist, norm, lerp, deg } from "./vec.mjs";
import { convexHull } from "./vec.mjs";
import { landmark, hullPoints, supportPolygon, centerOfMass, jointAngles, headForward } from "./kinematics.mjs";
import { SHOT_TABLE } from "./camera.mjs";

const FONT = "PingFang SC, Noto Sans CJK SC, Source Han Sans SC, sans-serif";
const C = {
  bg: "#fbfaf7", ink: "#25252a", faint: "#8a8880", grid: "#e6e2d8",
  ground: "#3f6b3f", body: "#d9ccbc", bodyEdge: "#b9a996",
  skirt: "#f3cbd6", skirtEdge: "#dfa6b6", hair: "#4a3b45", hairEdge: "#32262d",
  joint: "#ffffff", jointEdge: "#25252a", bone: "#33333a",
  com: "#c0392b", support: "#2e8b57", gaze: "#2b6cb0",
  error: "#cf3a2a", warn: "#d88a1c", info: "#2c7fb8",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const cm = (v) => `${(v * 100).toFixed(0)} cm`;

function textWidthUnits(ch) {
  return /[\u0000-ÿ]/.test(ch) ? 0.56 : 1;
}
function wrap(text, maxUnits) {
  const lines = [];
  let line = "", w = 0;
  for (const ch of String(text ?? "")) {
    if (ch === "\n") { lines.push(line); line = ""; w = 0; continue; }
    const cw = textWidthUnits(ch);
    if (w + cw > maxUnits) { lines.push(line); line = ""; w = 0; }
    line += ch; w += cw;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function svgText(lines, x, y, { size = 12, weight = 400, fill = C.ink, lh = 1.38, anchor = "start" } = {}) {
  const lhPx = size * lh;
  return lines.map((ln, i) =>
    `<text x="${f1(x)}" y="${f1(y + i * lhPx)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(ln)}</text>`
  ).join("\n");
}

/* ───────────── 投影 ───────────── */

function projector(view, angleDeg = 0) {
  if (view === "side") {
    return (p) => ({ x: p[2], y: p[1], d: -p[0] });
  }
  if (view === "quarter") {
    const a = (angleDeg * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    return (p) => ({ x: p[0] * c + p[2] * s, y: p[1], d: p[2] * c - p[0] * s });
  }
  return (p) => ({ x: p[0], y: p[1], d: p[2] });
}

function boneWorldHull(baked, profile, boneName) {
  const m = profile.boneMetrics?.[boneName];
  if (!m?.hull) return null;
  let bi = -1;
  for (let i = 0; i < profile.bones.length; i++) if (profile.bones[i].name === boneName) { bi = i; break; }
  if (bi < 0) return null;
  const p = baked.bonePos[bi], q = baked.boneQuat[bi];
  return m.hull.map((h) => add(p, qRot(q, h)));
}

/* ───────────── 单视图面板 ───────────── */

function viewPanel({ x, y, w, h, title, view, angle, profile, baked, findings, support, com, margin, gazeTargetBody, props = [], propShapes = {} }) {
  const proj = projector(view, angle);
  const padL = 34, padR = 20, padT = 46, padB = 40;
  const drawW = w - padL - padR, drawH = h - padT - padB;

  // 收集所有要画的点，确定世界范围
  const bodyPts = [];
  for (const b of profile.bones) {
    const hull = boneWorldHull(baked, profile, b.name);
    if (hull) for (const p of hull) bodyPts.push(proj(p));
  }
  for (const j of Object.values(baked.joint)) bodyPts.push(proj(j.pos));
  const tg = gazeTargetBody ? proj(gazeTargetBody) : null;
  if (tg) bodyPts.push(tg);
  for (const p of support.points) bodyPts.push(proj([p[0], 0, p[1]]));
  const c = proj(com.pos); bodyPts.push(c);

  // 道具包围盒的 8 个角（世界 → 投影）。只取人物够得着 / 会撞上的道具，
  // 否则整间教室的椅子都会挤进画面；画出来的范围最多把视野撑大 0.5 m。
  const bodyX0 = bodyPts.map((p) => p.x), bodyY0 = bodyPts.map((p) => p.y);
  const bMinX = Math.min(...bodyX0, -0.35), bMaxX = Math.max(...bodyX0, 0.35);
  const bMinY = Math.min(...bodyY0, -0.02), bMaxY = Math.max(...bodyY0, 0.1);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const propHulls = [];
  for (const prop of props) {
    const shape = propShapes[prop.model] ?? prop.model;
    const [pw, ph, pd] = propDims(prop, shape);
    const gap = Math.hypot(
      prop.position[0] - baked.position[0],
      prop.position[1] - baked.position[1],
    );
    if (gap > Math.hypot(pw, pd) / 2 + 2.0) continue;
    const base = prop.elevation ?? 0;
    const a = ((prop.facing ?? 0) * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
      const lx = (sx * pw) / 2, lz = (sz * pd) / 2;
      const wx = prop.position[0] + lx * ca - lz * sa;
      const wz = prop.position[1] + lx * sa + lz * ca;
      corners.push(proj([wx, base + sy * ph, wz]));
    }
    const hull = convexHull(corners.map((p) => [p.x, p.y]));
    if (hull.length < 3) continue;
    propHulls.push({ prop, shape, hull, top: base + ph });
    for (const q of hull) bodyPts.push({
      x: clamp(q[0], bMinX - 0.5, bMaxX + 0.5),
      y: clamp(q[1], bMinY - 0.5, bMaxY + 0.5),
      d: 0,
    });
  }

  // 道具说明放面板右上角，避免压在骨架上
  const legendSeen = new Set(), legendItems = [];
  for (const h of propHulls) {
    const name = h.prop.label ?? h.shape;
    const key = `${name}@${h.top.toFixed(2)}`;
    if (legendSeen.has(key)) continue;
    legendSeen.add(key);
    legendItems.push(`${name} 顶 ${h.top.toFixed(2)}m`);
  }
  const legend = legendItems.length
    ? `道具：${legendItems.slice(0, 2).join(" · ")}${legendItems.length > 2 ? " …" : ""}`
    : "";

  const xs = bodyPts.map((p) => p.x), ys = bodyPts.map((p) => p.y);
  let minX = Math.min(...xs, -0.35), maxX = Math.max(...xs, 0.35);
  let minY = Math.min(...ys, -0.02), maxY = Math.max(...ys, 0.1);
  const spanX = Math.max(maxX - minX, 0.3), spanY = Math.max(maxY - minY, 0.3);
  const scale = Math.min(drawW / (spanX * 1.08), drawH / (spanY * 1.05));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const map = (p) => ({
    x: x + padL + drawW / 2 + (p.x - cx) * scale,
    y: y + padT + drawH / 2 - (p.y - cy) * scale,
    d: p.d,
  });
  const mapBody = (p) => map(proj(p));

  const propPolys = propHulls.map(({ hull }) => {
    const mapped = hull.map((q) => map({ x: q[0], y: q[1], d: 0 }));
    const bw = Math.max(...mapped.map((p) => p.x)) - Math.min(...mapped.map((p) => p.x));
    const bh = Math.max(...mapped.map((p) => p.y)) - Math.min(...mapped.map((p) => p.y));
    return {
      d: `M ${mapped.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L ")} Z`,
      big: bw * bh > drawW * drawH * 0.55,
    };
  });

  // 背景 + 地面
  const groundY = map({ x: 0, y: 0, d: 0 }).y;
  const grid = [];
  const step = 0.1;
  for (let gy = 0; gy <= maxY + 0.5; gy += step) {
    const py = map({ x: 0, y: gy, d: 0 }).y;
    if (py > y + padT - 5 && py < y + h - padB + 5) {
      grid.push(`<line x1="${x + padL}" y1="${f1(py)}" x2="${x + w - padR}" y2="${f1(py)}" stroke="${C.grid}" stroke-width="${Math.abs(gy % 0.5) < 1e-6 ? 1 : 0.5}" opacity="${Math.abs(gy % 0.5) < 1e-6 ? 0.9 : 0.45}"/>`);
    }
  }
  const bodyPolys = [];
  for (const b of profile.bones) {
    const hull = boneWorldHull(baked, profile, b.name);
    if (!hull || hull.length < 3) continue;
    const pts3 = hull.map(proj);
    const hull2 = convexHull(pts3.map((p) => [p.x, p.y]));
    if (hull2.length < 3) continue;
    const mapped = hull2.map((p) => map({ x: p[0], y: p[1], d: 0 }));
    const depth = pts3.reduce((s, p) => s + p.d, 0) / pts3.length + (baked.bonePos[profile.bones.indexOf(b)]?.[2] ?? 0) * 0.001;
    const isSkirt = /スカート|skirt/i.test(b.name);
    const isHair = /髪|hair|前髪|後ろ髪/i.test(b.name);
    bodyPolys.push({
      depth, d: `M ${mapped.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L ")} Z`,
      fill: isSkirt ? C.skirt : isHair ? C.hair : C.body,
      stroke: isSkirt ? C.skirtEdge : isHair ? C.hairEdge : C.bodyEdge,
      opacity: isSkirt ? 0.5 : isHair ? 0.55 : 0.42,
    });
  }
  bodyPolys.sort((a, b) => a.depth - b.depth);

  // 骨架线
  const segs = [];
  const line = (a, b, { width = 4, color = C.bone, dash = null, opacity = 1 } = {}) => {
    const p = mapBody(a), q = mapBody(b);
    segs.push(`<line x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(q.x)}" y2="${f1(q.y)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""} opacity="${opacity}"/>`);
  };
  for (const s of Object.values(profile.segments ?? {})) {
    const a = baked.joint[s.from]?.pos, b = baked.joint[s.to]?.pos;
    if (a && b) line(a, b, { width: 5 });
  }
  // 肩线 / 髋线
  line(baked.joint.upperArm_L.pos, baked.joint.upperArm_R.pos, { width: 2.5, color: "#6b655d" });
  line(baked.joint.upperLeg_L.pos, baked.joint.upperLeg_R.pos, { width: 2.5, color: "#6b655d" });
  // 手→指尖，脚→趾
  for (const side of ["L", "R"]) {
    const fin = landmark(baked, profile, `finger_${side}`);
    if (fin) line(baked.joint[`hand_${side}`].pos, fin, { width: 2.5, color: "#6b655d" });
    const toe = landmark(baked, profile, `toe_${side}`);
    if (toe) line(baked.joint[`foot_${side}`].pos, toe, { width: 2.5, color: "#6b655d" });
  }

  // 接触点 / 支撑多边形
  const supportDots = support.points.map((p) => {
    const q = mapBody([p[0], 0, p[1]]);
    return `<circle cx="${f1(q.x)}" cy="${f1(q.y)}" r="3.4" fill="${C.support}" opacity="0.85"/>`;
  }).join("\n");
  let supportPath = "";
  if (support.poly.length >= 3) {
    const pts = support.poly.map((p) => mapBody([p[0], 0, p[1]]));
    supportPath = `<path d="M ${pts.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L ")} Z" fill="${C.support}" fill-opacity="0.10" stroke="${C.support}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  } else if (support.poly.length === 2) {
    const pts = support.poly.map((p) => mapBody([p[0], 0, p[1]]));
    supportPath = `<line x1="${f1(pts[0].x)}" y1="${f1(pts[0].y)}" x2="${f1(pts[1].x)}" y2="${f1(pts[1].y)}" stroke="${C.support}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  }

  // 重心
  const comP = mapBody(com.pos);
  const comGround = mapBody([com.pos[0], 0, com.pos[2]]);
  const comSvg = `
    <line x1="${f1(comP.x)}" y1="${f1(comP.y)}" x2="${f1(comGround.x)}" y2="${f1(comGround.y)}" stroke="${C.com}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8"/>
    <circle cx="${f1(comP.x)}" cy="${f1(comP.y)}" r="6.5" fill="none" stroke="${C.com}" stroke-width="2"/>
    <line x1="${f1(comP.x - 9)}" y1="${f1(comP.y)}" x2="${f1(comP.x + 9)}" y2="${f1(comP.y)}" stroke="${C.com}" stroke-width="1.5"/>
    <line x1="${f1(comP.x)}" y1="${f1(comP.y - 9)}" x2="${f1(comP.x)}" y2="${f1(comP.y + 9)}" stroke="${C.com}" stroke-width="1.5"/>
    <text x="${f1(comP.x + 11)}" y="${f1(comP.y - 8)}" font-family="${FONT}" font-size="11" fill="${C.com}">重心 ${cm(com.pos[1])}</text>`;

  // 视线
  let gazeSvg = "";
  if (tg && gazeTargetBody) {
    const hp = mapBody(baked.joint.head.pos);
    let t = map(tg);
    // 限制绘制长度，避免相机目标把画面拉爆
    const maxPx = 150;
    const dx = t.x - hp.x, dy = t.y - hp.y, l = Math.hypot(dx, dy) || 1;
    const ex = hp.x + (dx / l) * Math.min(l, maxPx);
    const ey = hp.y + (dy / l) * Math.min(l, maxPx);
    gazeSvg = `<line x1="${f1(hp.x)}" y1="${f1(hp.y)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${C.gaze}" stroke-width="2" stroke-dasharray="7 4" marker-end="url(#arrowGaze)"/>
      <text x="${f1(ex + 5)}" y="${f1(ey - 5)}" font-family="${FONT}" font-size="11" fill="${C.gaze}">视线目标</text>`;
  }

  // 关节
  const JOINT_ZH = {
    hips: "髋", spine: "腰", chest: "胸", neck: "颈", head: "头",
    upperArm_L: "肩", upperArm_R: "肩", lowerArm_L: "肘", lowerArm_R: "肘",
    hand_L: "腕", hand_R: "腕", upperLeg_L: "髋根", upperLeg_R: "髋根",
    lowerLeg_L: "膝", lowerLeg_R: "膝", foot_L: "踝", foot_R: "踝",
  };
  const shownLabels = new Set();
  const jointSvg = Object.entries(baked.joint).map(([n, j]) => {
    const p = mapBody(j.pos);
    const isHead = n === "head", isLimb = /Arm|Leg/.test(n);
    // 侧视里左右关节会重合：同一位置只标一次
    const key = `${Math.round(p.x / 9)},${Math.round(p.y / 9)}`;
    const dup = shownLabels.has(key);
    shownLabels.add(key);
    const side = j.pos[0] >= 0 ? 1 : -1;
    const lx = isHead ? p.x + 6 : p.x + side * 7;
    const anchor = isHead || side > 0 ? "start" : "end";
    return `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${isHead ? 5.5 : 4}" fill="${C.joint}" stroke="${C.jointEdge}" stroke-width="1.6"/>
      ${!dup && (isLimb || isHead) ? `<text x="${f1(lx)}" y="${f1(p.y - 5)}" font-family="${FONT}" font-size="9.5" fill="#6b655d" text-anchor="${anchor}">${JOINT_ZH[n] ?? ""}</text>` : ""}`;
  }).join("\n");

  const angles = jointAngles(baked);
  const angSvg = ["L", "R"].map((s) => {
    const knee = baked.joint[`lowerLeg_${s}`].pos, elbow = baked.joint[`lowerArm_${s}`].pos;
    const kp = mapBody(knee), ep = mapBody(elbow);
    const ks = knee[0] >= 0 ? 1 : -1, es = elbow[0] >= 0 ? 1 : -1;
    return `<text x="${f1(kp.x + ks * 8)}" y="${f1(kp.y + 12)}" font-family="${FONT}" font-size="9.5" fill="#6b655d" text-anchor="${ks > 0 ? "start" : "end"}">膝 ${angles[`knee_${s}`].toFixed(0)}°</text>
      <text x="${f1(ep.x + es * 8)}" y="${f1(ep.y + 12)}" font-family="${FONT}" font-size="9.5" fill="#6b655d" text-anchor="${es > 0 ? "start" : "end"}">肘 ${angles[`elbow_${s}`].toFixed(0)}°</text>`;
  }).join("\n");

  // 问题编号
  const issues = findings.filter((f) => f.level !== "info" && f.at).slice(0, 12);
  const badgeSvg = issues.map((f, i) => {
    const p = mapBody(f.at);
    const col = f.level === "error" ? C.error : C.warn;
    return `<g><circle cx="${f1(p.x + 13)}" cy="${f1(p.y - 13)}" r="9.5" fill="${col}" stroke="#fff" stroke-width="1.5"/>
      <text x="${f1(p.x + 13)}" y="${f1(p.y - 9.5)}" font-family="${FONT}" font-size="10.5" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text></g>`;
  }).join("\n");

  // 比例尺
  const barLen = 0.5 * scale;
  const bx = x + w - padR - barLen, by = y + h - 18;
  const scaleSvg = `<line x1="${f1(bx)}" y1="${by}" x2="${f1(bx + barLen)}" y2="${by}" stroke="${C.ink}" stroke-width="2"/>
    <line x1="${f1(bx)}" y1="${by - 4}" x2="${f1(bx)}" y2="${by + 4}" stroke="${C.ink}" stroke-width="2"/>
    <line x1="${f1(bx + barLen)}" y1="${by - 4}" x2="${f1(bx + barLen)}" y2="${by + 4}" stroke="${C.ink}" stroke-width="2"/>
    <text x="${f1(bx + barLen / 2)}" y="${by - 6}" font-family="${FONT}" font-size="10" fill="${C.faint}" text-anchor="middle">0.5 m</text>`;

  const clipId = `clip-${Math.round(x)}-${Math.round(y)}`;
  return `
  <g>
    <defs><clipPath id="${clipId}"><rect x="${x + padL}" y="${y + padT}" width="${drawW}" height="${drawH}"/></clipPath></defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#e3ded2"/>
    <text x="${x + 18}" y="${y + 27}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.ink}">${esc(title)}</text>
    ${legend ? `<text x="${x + 18}" y="${y + 43}" font-family="${FONT}" font-size="9.5" fill="${C.faint}">${esc(legend)}</text>` : ""}
    <line x1="${x + padL}" y1="${f1(groundY)}" x2="${x + w - padR}" y2="${f1(groundY)}" stroke="${C.ground}" stroke-width="2"/>
    <text x="${x + padL + 2}" y="${f1(groundY - 5)}" font-family="${FONT}" font-size="10" fill="${C.ground}">地面</text>
    ${grid.join("\n")}
    <g clip-path="url(#${clipId})">
      ${propPolys.map((p) => `<path d="${p.d}" fill="#9a958a" fill-opacity="${p.big ? 0.035 : 0.10}" stroke="#8d887e" stroke-width="1" stroke-dasharray="5 3"/>`).join("\n")}
    </g>
    ${bodyPolys.map((p) => `<path d="${p.d}" fill="${p.fill}" fill-opacity="${p.opacity}" stroke="${p.stroke}" stroke-width="0.8" stroke-opacity="0.55"/>`).join("\n")}
    ${supportPath}
    ${supportDots}
    ${segs.join("\n")}
    ${jointSvg}
    ${angSvg}
    ${comSvg}
    ${gazeSvg}
    ${badgeSvg}
    ${scaleSvg}
  </g>`;
}

/* ───────────── 俯视图 ───────────── */

function topPanel({ x, y, w, h, actors, props, propShapes = {}, camera, shot }) {
  const pad = 36;
  const items = [];
  for (const a of actors) {
    items.push([a.position[0], a.position[1]]);
    if (a.bounds) {
      items.push([a.bounds.min[0], a.bounds.min[2]], [a.bounds.max[0], a.bounds.max[2]]);
    }
  }
  for (const p of props) {
    const shape = propShapes[p.model] ?? p.model;
    const [pw, , pd] = propDims(p, shape);
    items.push([p.position[0] - pw / 2, p.position[1] - pd / 2], [p.position[0] + pw / 2, p.position[1] + pd / 2]);
  }
  if (camera?.position) items.push([camera.position[0], camera.position[2]]);
  if (!items.length) items.push([0, 0]);
  let minX = Math.min(...items.map((p) => p[0])), maxX = Math.max(...items.map((p) => p[0]));
  let minZ = Math.min(...items.map((p) => p[1])), maxZ = Math.max(...items.map((p) => p[1]));
  const spanX = Math.max(maxX - minX, 1), spanZ = Math.max(maxZ - minZ, 1);
  const drawW = w - pad * 2, drawH = h - pad - 44;
  const scale = Math.min(drawW / (spanX * 1.25), drawH / (spanZ * 1.25));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const map = (p) => ({
    x: x + pad + drawW / 2 + (p[0] - cx) * scale,
    y: y + 42 + drawH / 2 + (p[1] - cz) * scale,
  });

  // 1m 网格
  const grid = [];
  for (let gx = Math.floor(minX) - 1; gx <= Math.ceil(maxX) + 1; gx++) {
    const a = map([gx, minZ]), b = map([gx, maxZ]);
    grid.push(`<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${C.grid}" stroke-width="0.7"/>`);
  }
  for (let gz = Math.floor(minZ) - 1; gz <= Math.ceil(maxZ) + 1; gz++) {
    const a = map([minX, gz]), b = map([maxX, gz]);
    grid.push(`<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${C.grid}" stroke-width="0.7"/>`);
  }

  const propSvg = props.map((p) => {
    const shape = propShapes[p.model] ?? p.model;
    const [pw, ph, pd] = propDims(p, shape);
    const c = map([p.position[0], p.position[1]]);
    const rw = pw * scale, rd = pd * scale;
    // 小道具（椅子/箱子等）标签会糊成一团：只在有显式 label、够大、或离人物近时标字
    const nearActor = actors.some((a) =>
      Math.hypot(a.position[0] - p.position[0], a.position[1] - p.position[1]) < 1.8);
    const showLabel = !!p.label || Math.min(rw, rd) > 46 || nearActor;
    const label = p.label ? `${p.label}` : `${shape} ${f1(ph)}m`;
    return `<g transform="translate(${f1(c.x)} ${f1(c.y)}) rotate(${f1((p.facing ?? 0))})">
      <rect x="${f1(-rw / 2)}" y="${f1(-rd / 2)}" width="${f1(rw)}" height="${f1(rd)}" fill="#d9d5ca" fill-opacity="0.55" stroke="#8d887e" stroke-width="0.9"/>
      ${showLabel ? `<text x="0" y="3" font-family="${FONT}" font-size="9" fill="#6b655d" text-anchor="middle">${esc(label)}</text>` : ""}</g>`;
  }).join("\n");

  // 支撑面 + 视线（都投到地面/平面上）
  const supportSvg = actors.map((a) => {
    const poly = a.supportPoly;
    if (!poly || poly.length < 3) return "";
    const pts = poly.map(map);
    return `<path d="M ${pts.map((q) => `${f1(q.x)},${f1(q.y)}`).join(" L ")} Z" fill="${C.support}" fill-opacity="0.16" stroke="${C.support}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  }).join("\n");
  const gazeSvgTop = actors.map((a) => {
    if (!a.gazeTarget) return "";
    const p = map(a.position), t = map([a.gazeTarget[0], a.gazeTarget[2]]);
    return `<line x1="${f1(p.x)}" y1="${f1(p.y)}" x2="${f1(t.x)}" y2="${f1(t.y)}" stroke="${C.gaze}" stroke-width="1.1" stroke-dasharray="4 4" opacity="0.65" marker-end="url(#arrowGaze)"/>`;
  }).join("\n");

  const actorSvg = actors.map((a) => {
    const p = map(a.position);
    const f = ((a.facing ?? 0) * Math.PI) / 180;
    const ax = p.x + Math.sin(f) * 26, ay = p.y + Math.cos(f) * 26;
    const bx = p.x + Math.sin(f + 2.55) * 10, by = p.y + Math.cos(f + 2.55) * 10;
    const cx2 = p.x + Math.sin(f - 2.55) * 10, cy2 = p.y + Math.cos(f - 2.55) * 10;
    let footprint = "";
    if (a.bounds) {
      const q1 = map([a.bounds.min[0], a.bounds.min[2]]), q2 = map([a.bounds.max[0], a.bounds.max[2]]);
      footprint = `<rect x="${f1(Math.min(q1.x, q2.x))}" y="${f1(Math.min(q1.y, q2.y))}" width="${f1(Math.abs(q2.x - q1.x))}" height="${f1(Math.abs(q2.y - q1.y))}" fill="#8a6a48" fill-opacity="0.12" stroke="#8a6a48" stroke-width="0.8" stroke-dasharray="3 3"/>`;
    }
    return `${footprint}
      <circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="5.5" fill="#8a6a48" stroke="#fff" stroke-width="1.5"/>
      <path d="M ${f1(p.x)},${f1(p.y)} L ${f1(ax)},${f1(ay)} L ${f1(bx)},${f1(by)} M ${f1(ax)},${f1(ay)} L ${f1(cx2)},${f1(cy2)}" stroke="#8a6a48" stroke-width="1.5" fill="none"/>
      <text x="${f1(p.x + 8)}" y="${f1(p.y - 8)}" font-family="${FONT}" font-size="11" font-weight="600" fill="#6a4a30">${esc(a.label ?? a.id)}</text>`;
  }).join("\n");

  let camSvg = "";
  if (camera?.position) {
    const p = map([camera.position[0], camera.position[2]]);
    const t = map([camera.target[0], camera.target[2]]);
    const ang = Math.atan2(t.y - p.y, t.x - p.x);
    const half = ((camera.vFov ?? 40) * Math.PI) / 180 / 2;
    const L = 180;
    const r1 = [p.x + Math.cos(ang - half * 1.4) * L, p.y + Math.sin(ang - half * 1.4) * L];
    const r2 = [p.x + Math.cos(ang + half * 1.4) * L, p.y + Math.sin(ang + half * 1.4) * L];
    camSvg = `<path d="M ${f1(p.x)},${f1(p.y)} L ${f1(r1[0])},${f1(r1[1])} M ${f1(p.x)},${f1(p.y)} L ${f1(r2[0])},${f1(r2[1])}" stroke="#2b6cb0" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.7"/>
      <circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="6" fill="#2b6cb0"/>
      <text x="${f1(p.x + 8)}" y="${f1(p.y - 8)}" font-family="${FONT}" font-size="11" font-weight="600" fill="#2b6cb0">CAM</text>`;
  }

  const hud = shot?.camera ? `${SHOT_TABLE[shot.camera.shotSize ?? "MS"]?.zh ?? ""} ${shot.camera.shotSize ?? "MS"} · ${shot.camera.focalLength ?? 50}mm` : "";
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#e3ded2"/>
    <text x="${x + 18}" y="${y + 27}" font-family="${FONT}" font-size="16" font-weight="700" fill="${C.ink}">俯视图 · 场景位置</text>
    <text x="${x + w - 18}" y="${y + 27}" font-family="${FONT}" font-size="11" fill="${C.faint}" text-anchor="end">${esc(hud)}</text>
    ${grid.join("\n")}
    ${propSvg}
    ${supportSvg}
    ${gazeSvgTop}
    ${actorSvg}
    ${camSvg}
    <text x="${x + pad}" y="${y + h - 14}" font-family="${FONT}" font-size="10" fill="${C.faint}">网格 1 m · 箭头 = 人物朝向 · 蓝线 = 相机视野</text>
  </g>`;
}

function propDims(prop, shape) {
  const D = {
    chair: [0.44, 0.47, 0.44], stool: [0.36, 0.57, 0.36], sofa: [1.9, 0.47, 0.85],
    bed: [1.5, 0.5, 2.0], bench: [1.8, 0.48, 0.6], table: [1.2, 0.75, 0.7],
    desk: [0.65, 0.76, 0.45], box: [0.5, 0.5, 0.5], wall: [4, 2.8, 0.15],
    railing: [4, 1.1, 0.05], platform: [10, 1.1, 3], pier: [2.4, 0.9, 10],
    stairs_wide: [4, 1.2, 2.4], stairs: [1.2, 0.72, 1.12], bus_stop: [3, 2.6, 1.6],
    footbridge: [8, 3, 2.2], building: [8, 12, 8], locker: [1.2, 1.8, 0.45],
    vending_machine: [1.1, 1.9, 0.75], car: [1.8, 1.5, 4.2],
  };
  const s = prop.scale ?? 1;
  const base = D[shape] ?? [0.5, 0.5, 0.5];
  const size = prop.size ?? base;
  return [size[0] * s, size[1] * s, size[2] * s];
}

/* ───────────── 报告面板 ───────────── */

function reportPanel({ x, y, w, h, summary, findings, profile, com, margin, angles, actor, presetLabel }) {
  const nonInfo = findings.filter((f) => f.level !== "info");
  const infos = findings.filter((f) => f.level === "info");
  const lines = [];
  let yy = y + 30;
  const push = (svg, dy) => { lines.push(svg); yy += dy; };

  push(`<text x="${x + 18}" y="${yy}" font-family="${FONT}" font-size="17" font-weight="700" fill="${C.ink}">验收报告</text>`, 26);
  const col = summary.level === "error" ? C.error : summary.level === "warn" ? C.warn : C.support;
  push(`<text x="${x + 18}" y="${yy}" font-family="${FONT}" font-size="13" font-weight="600" fill="${col}">${esc(summary.headline)}</text>`, 22);
  push(`<text x="${x + 18}" y="${yy}" font-family="${FONT}" font-size="11" fill="${C.faint}">❌ ${summary.counts.error}　⚠️ ${summary.counts.warn}　ℹ️ ${summary.counts.info}　·　${esc(actor?.label ?? actor?.id ?? "")} · ${esc(presetLabel ?? summary.label)}</text>`, 26);

  // 实测数据
  const m = profile.measurements ?? {};
  push(`<text x="${x + 18}" y="${yy}" font-family="${FONT}" font-size="12" font-weight="700" fill="${C.ink}">实测身体</text>`, 18);
  const metricsText = `身高 ${m.height?.toFixed(2)} m　肩宽 ${cm(m.shoulderWidth)}　头长 ${cm(m.headLength)}　躯干 ${cm(m.torsoLength)}`
    + `\n上臂 ${cm(m.upperArm)}　前臂 ${cm(m.forearm)}　手 ${cm(m.hand)}　大腿 ${cm(m.thigh)}　小腿 ${cm(m.shin)}　足 ${cm(m.foot)}`
    + `\n重心高 ${cm(com.pos[1])}　支撑余量 ${margin >= 0 ? "+" : ""}${(margin * 100).toFixed(0)} cm　膝角 ${angles.knee_L.toFixed(0)}°/${angles.knee_R.toFixed(0)}°　肘角 ${angles.elbow_L.toFixed(0)}°/${angles.elbow_R.toFixed(0)}°`;
  for (const ln of metricsText.split("\n")) {
    push(svgText([ln], x + 18, yy, { size: 11.5, fill: "#4a4842" }), 18);
  }
  yy += 8;

  // 问题清单
  push(`<text x="${x + 18}" y="${yy}" font-family="${FONT}" font-size="12" font-weight="700" fill="${C.ink}">问题与提示</text>`, 18);
  const maxItems = nonInfo.length + infos.length;
  let shown = 0;
  for (const f of nonInfo) {
    if (shown >= 14 || yy > y + h - 40) break;
    const badge = `<circle cx="${x + 26}" cy="${yy - 4}" r="8.5" fill="${f.level === "error" ? C.error : C.warn}"/><text x="${x + 26}" y="${yy - 0.5}" font-family="${FONT}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${shown + 1}</text>`;
    const tl = wrap(f.title, 30);
    push(badge + svgText(tl, x + 40, yy, { size: 12, weight: 700, fill: f.level === "error" ? C.error : "#a56a12" }), tl.length * 16.5 + 2);
    const dl = wrap(f.detail, 46);
    push(svgText(dl, x + 40, yy, { size: 10.8, fill: "#5a5852" }), dl.length * 14.5 + 10);
    shown++;
  }
  for (const f of infos) {
    if (shown >= 16 || yy > y + h - 40) break;
    const tl = wrap(`· ${f.title}`, 34);
    push(svgText(tl, x + 26, yy, { size: 10.6, fill: "#6b7a86" }), tl.length * 14 + 6);
    shown++;
  }
  if (shown < maxItems) {
    push(`<text x="${x + 26}" y="${yy}" font-family="${FONT}" font-size="10.5" fill="${C.faint}">……其余 ${maxItems - shown} 条见 JSON 报告</text>`, 16);
  }
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#e3ded2"/>
    ${lines.join("\n")}
  </g>`;
}

/* ───────────── 总装 ───────────── */

/**
 * @param {object} p
 * @param {object} p.profile 实测 profile
 * @param {object} p.baked   bake() 结果（final）
 * @param {Array}  p.findings evaluatePose().findings
 * @param {object} p.summary  evaluatePose().summary
 * @param {object} p.actor    actor JSON
 * @param {object} p.shot     shot JSON
 * @param {object} p.camera   solveCamera() 结果
 * @param {Array}  p.props    shot.props
 * @param {object} p.propShapes
 * @param {Array}  p.actorsWorld  [{id,label,position,facing,bounds}]
 * @param {Array}  p.gazeTargetBody 身体空间视线目标
 */
export function renderSheet(p) {
  const W = 1600, H = 1220;
  const { profile, baked, findings, summary, actor, shot, camera, props = [], propShapes = {}, actorsWorld = [], gazeTargetBody } = p;
  const support = supportPolygon(baked, profile);
  const com = centerOfMass(baked, profile);
  const margin = p.margin ?? 0;
  const angles = jointAngles(baked);
  const presetLabel = summary.label ?? "";
  const panelW = 480, panelH = 660, top = 92;
  const x0 = 24, x1 = 524, x2 = 1024;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <marker id="arrowGaze" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="${C.gaze}"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <text x="${x0}" y="42" font-family="${FONT}" font-size="24" font-weight="700" fill="${C.ink}">${esc(shot?.id ?? "")} ${esc(shot?.name ?? "")}</text>
  <text x="${x0}" y="66" font-family="${FONT}" font-size="13" fill="${C.faint}">${esc(actor?.label ?? actor?.id ?? "")} · ${esc(presetLabel)} · 实测骨架 ${(profile.measurements?.height ?? 0).toFixed(2)} m · 不依赖渲染截图</text>
  ${viewPanel({ x: x0, y: top, w: panelW, h: panelH, title: "正视（+X 向右）", view: "front", profile, baked, findings, support, com, margin, gazeTargetBody, props, propShapes })}
  ${viewPanel({ x: x1, y: top, w: panelW, h: panelH, title: "侧视（+Z 向右）", view: "side", profile, baked, findings, support, com, margin, gazeTargetBody, props, propShapes })}
  ${viewPanel({ x: x2, y: top, w: panelW, h: panelH, title: "3/4 视", view: "quarter", angle: 32, profile, baked, findings, support, com, margin, gazeTargetBody, props, propShapes })}
  ${reportPanel({ x: x0, y: top + panelH + 20, w: 960, h: 400, summary, findings, profile, com, margin, angles, actor, presetLabel })}
  ${topPanel({ x: x0 + 980, y: top + panelH + 20, w: 572, h: 400, actors: actorsWorld, props, propShapes, camera, shot })}
  <text x="${W - 24}" y="${H - 12}" font-family="${FONT}" font-size="10" fill="${C.faint}" text-anchor="end">pose-analysis · 由 PMX 实测骨骼与突出点直接计算</text>
</svg>`;
}

export { wrap };
