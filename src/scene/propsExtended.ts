// 扩展道具库：常见拍摄场景（街道/天桥/车站/公园/校园/海边）。
// 全部程序化低模；size [宽,高,深] 与 color 均可在项目 JSON 里后期调整。
import * as THREE from "three";

export const EXTENDED_SHAPES = [
  "footbridge", "stairs_wide", "torii", "bench", "bus_stop", "telephone_pole",
  "vending_machine", "streetlamp", "traffic_light", "road_sign", "bridge_pier",
  "building", "platform", "rail_crossing", "phone_booth", "billboard",
  "column", "arch", "fountain", "hedge", "bush", "water", "pier",
  "swing", "slide", "basketball_hoop", "goal", "desk", "blackboard",
  "locker", "lantern", "string_lights", "awning", "rail_track", "sakura",
] as const;

export type ExtendedShape = (typeof EXTENDED_SHAPES)[number];

export const EXTENDED_COLORS: Record<string, string> = {
  footbridge: "#c8c4ba", stairs_wide: "#b0aca2", torii: "#c0392b",
  bench: "#7a5c3e", bus_stop: "#5a6a75", telephone_pole: "#6a6258",
  vending_machine: "#c03040", streetlamp: "#3a3f45", traffic_light: "#2f3439",
  road_sign: "#3a6ec8", bridge_pier: "#9a968e", building: "#b8bcc4",
  platform: "#b5b0a6", rail_crossing: "#8a4a3a", phone_booth: "#3a7a4a",
  billboard: "#e8e4da", column: "#c9c5bc", arch: "#c9c5bc",
  fountain: "#a8b8c0", hedge: "#3f6b34", bush: "#4a7a3a",
  water: "#3a7a9a", pier: "#8a6a48", swing: "#c8534a",
  slide: "#d0d4d8", basketball_hoop: "#e8e4da", goal: "#e8e8e8",
  desk: "#c8a878", blackboard: "#2e4a3a", locker: "#7a8a99",
  lantern: "#e8d8b0", string_lights: "#5a5248", awning: "#c8534a",
  rail_track: "#6a6258", sakura: "#e8b8c8",
};

export const EXTENDED_DEFAULT_SIZE: Record<string, [number, number, number]> = {
  footbridge: [8, 3, 2.2], stairs_wide: [4, 1.2, 2.4], torii: [3.4, 3.6, 0.6],
  bench: [1.8, 0.8, 0.6], bus_stop: [3, 2.6, 1.6], telephone_pole: [0.4, 7, 0.4],
  vending_machine: [1.1, 1.9, 0.75], streetlamp: [0.3, 4.5, 1.2],
  traffic_light: [0.3, 3.2, 1.5], road_sign: [0.8, 2.6, 0.1],
  bridge_pier: [1.6, 5, 1.6], building: [8, 12, 8], platform: [10, 1.1, 3],
  rail_crossing: [6, 1.1, 4], phone_booth: [1.1, 2.4, 1.1],
  billboard: [5, 3.4, 0.4], column: [0.6, 4, 0.6], arch: [3, 3, 0.6],
  fountain: [3, 1.1, 3], hedge: [2, 1, 0.6], bush: [0.9, 0.7, 0.9],
  water: [20, 0.02, 20], pier: [2.4, 0.9, 10], swing: [3, 2.4, 1.6],
  slide: [1.2, 1.8, 3.2], basketball_hoop: [1.2, 3.9, 0.8],
  goal: [5, 2.1, 1.2], desk: [0.65, 0.76, 0.45], blackboard: [3, 1.4, 0.12],
  locker: [1.2, 1.8, 0.45], lantern: [0.32, 0.5, 0.32],
  string_lights: [6, 2.6, 0.1], awning: [3, 2.4, 1.6], rail_track: [2, 0.18, 10],
  sakura: [1.6, 3.8, 1.6],
};

/** 可调尺寸的形状（额外于 props.ts 内置列表） */
export const EXTENDED_SIZEABLE = new Set([
  "footbridge", "stairs_wide", "torii", "telephone_pole", "streetlamp",
  "bridge_pier", "building", "platform", "billboard", "column", "arch",
  "fountain", "hedge", "bush", "water", "pier", "goal", "blackboard",
  "locker", "string_lights", "awning", "rail_track", "sakura",
]);

/* ---------- 小工具 ---------- */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function M(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    matCache.set(key, m);
  }
  return m;
}
function bx(g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0): void {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  g.add(o);
}
function cy(g: THREE.Group, m: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0): void {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m);
  o.position.set(x, y, z);
  g.add(o);
}
function sp(g: THREE.Group, m: THREE.Material, r: number, x = 0, y = 0, z = 0): void {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
  o.position.set(x, y, z);
  g.add(o);
}
/** 横杆（沿 X） */
function rail(g: THREE.Group, m: THREE.Material, r: number, len: number, x = 0, y = 0, z = 0): void {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  o.rotation.z = Math.PI / 2;
  o.position.set(x, y, z);
  g.add(o);
}

/* ---------- 纹理 ---------- */

const texCache = new Map<string, THREE.CanvasTexture>();
function gridTexture(spacing: number, color: string, diagonal: boolean): THREE.CanvasTexture {
  const key = `${spacing}|${color}|${diagonal}`;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (diagonal) {
    for (let i = -64; i <= 128; i += spacing) {
      ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64);
      ctx.moveTo(i, 64); ctx.lineTo(i + 64, 0);
    }
  } else {
    for (let i = 0; i <= 64; i += spacing) {
      ctx.moveTo(i, 0); ctx.lineTo(i, 64);
      ctx.moveTo(0, i); ctx.lineTo(64, i);
    }
  }
  ctx.stroke();
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
function windowTexture(): THREE.CanvasTexture {
  const key = "win";
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8f959e"; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#dce8f0";
  for (let y = 8; y < 120; y += 24) {
    for (let x = 8; x < 120; x += 20) ctx.fillRect(x, y, 12, 14);
  }
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
function net(g: THREE.Group, w: number, h: number, y: number, z: number, spacing: number, color: string): void {
  const t = gridTexture(spacing, color, false).clone();
  t.needsUpdate = true;
  t.repeat.set(w / 0.4, h / 0.4);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: "#dddddd" }),
  );
  m.position.set(0, y, z);
  g.add(m);
}

/* ---------- 各形状 ---------- */

type Builder = (g: THREE.Group, size: [number, number, number], color: string) => void;

const BUILDERS: Record<string, Builder> = {
  // 天桥：桥面 + 纵梁 + 桥面栏杆 + 两对桥墩 + 两侧楼梯（带扶手）
  footbridge(g, [w, h, d], c) {
    const m = M(c);
    const dark = M("#8a867c");
    bx(g, m, w, 0.22, d, 0, h, 0);                                  // 桥面
    for (const s of [-1, 1]) bx(g, dark, w, 0.32, 0.16, 0, h - 0.24, s * (d / 2 - 0.1)); // 纵梁
    // 桥面栏杆
    const nPost = Math.max(2, Math.round(w / 1.6) + 1);
    for (const s of [-1, 1]) {
      const z = s * (d / 2 - 0.06);
      for (let i = 0; i < nPost; i++) cy(g, m, 0.03, 1.0, -w / 2 + (w * i) / (nPost - 1), h + 0.61, z);
      rail(g, m, 0.035, w, 0, h + 1.1, z);
      rail(g, m, 0.025, w, 0, h + 0.65, z);
    }
    // 桥墩
    for (const px of [-w / 4, w / 4]) {
      for (const s of [-1, 1]) cy(g, dark, 0.09, h - 0.2, px, (h - 0.2) / 2, s * (d / 2 - 0.25));
      bx(g, dark, 0.3, 0.28, d, px, h - 0.4, 0);
    }
    // 两侧楼梯
    const steps = Math.max(6, Math.round(h / 0.26));
    const run = h * 1.15;
    const stepD = d * 0.55;
    for (const side of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const x = side * (w / 2 + ((i + 0.5) * run) / steps);
        const y = h - ((i + 1) * h) / steps;
        bx(g, m, run / steps, h / steps, stepD, x, y + h / steps / 2, 0);
      }
      // 斜扶手
      const beta = Math.atan2(h, run);
      const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(run, h), 8), m);
      hr.rotation.z = -side * (Math.PI / 2 + beta);
      for (const s2 of [-1, 1]) {
        const rail2 = hr.clone();
        rail2.position.set(side * (w / 2 + run / 2), h / 2 + 0.95, s2 * (stepD / 2 - 0.05));
        g.add(rail2);
      }
    }
  },
  // 大台阶（公园/车站前）
  stairs_wide(g, [w, h, d], c) {
    const m = M(c);
    const steps = Math.max(3, Math.round(h / 0.18));
    for (let i = 0; i < steps; i++) {
      bx(g, m, w, (h * (i + 1)) / steps, d / steps, 0, (h * (i + 1)) / steps / 2, d / 2 - (d * (i + 0.5)) / steps);
    }
  },
  // 鸟居
  torii(g, [w, h], c) {
    const m = M(c);
    for (const s of [-1, 1]) cy(g, m, 0.14 * (h / 3.6), h * 0.86, s * w * 0.38, h * 0.43);
    rail(g, m, 0.12 * (h / 3.6), w, 0, h * 0.98);        // 上笠木
    rail(g, m, 0.09 * (h / 3.6), w * 0.86, 0, h * 0.78); // 下贯
    bx(g, m, 0.08, h * 0.16, 0.12, 0, h * 0.88);         // 中央额束
  },
  // 长椅
  bench(g, [w, , d], c) {
    const m = M(c); const dark = M("#4a4a4a");
    for (const s of [-1, 1]) bx(g, dark, 0.06, 0.42, d * 0.9, s * (w / 2 - 0.08), 0.21);
    bx(g, m, w, 0.06, d, 0, 0.45);
    bx(g, m, w, 0.4, 0.05, 0, 0.68, -d / 2 + 0.04);
  },
  // 公交站：顶棚 + 站牌 + 长椅
  bus_stop(g, [w, h, d], c) {
    const m = M(c);
    for (const s of [-1, 1]) cy(g, m, 0.04, h, s * (w / 2 - 0.1), h / 2, -d / 2 + 0.15);
    bx(g, m, w, 0.06, d, 0, h, 0);                       // 顶棚
    cy(g, M("#d8d4c8"), 0.03, 1.6, w / 2 + 0.3, 0.8);    // 站牌杆
    bx(g, M("#e8e4d8"), 0.4, 0.55, 0.04, w / 2 + 0.3, 1.7);
    bx(g, m, w * 0.7, 0.05, 0.4, 0, 0.45, -d / 2 + 0.35); // 座椅
  },
  // 电线杆（带横担和两段垂线）
  telephone_pole(g, [, h], c) {
    const m = M(c);
    cy(g, m, 0.14, h, 0, h / 2);
    rail(g, m, 0.04, 1.8, 0, h * 0.9);
    rail(g, m, 0.04, 1.5, 0, h * 0.78);
    const wire = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.9, h * 0.9, 0), new THREE.Vector3(0, h * 0.82, 0.4), new THREE.Vector3(0.9, h * 0.9, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x222226 }),
    );
    g.add(wire);
  },
  // 自动贩卖机（前面板发光）
  vending_machine(g, [w, h, d], c) {
    bx(g, M(c), w, h, d, 0, h / 2);
    bx(g, M("#f0f4f8", { emissive: new THREE.Color("#b8d0e0"), emissiveIntensity: 0.7 }), w * 0.8, h * 0.55, 0.03, 0, h * 0.62, d / 2 + 0.01);
    bx(g, M("#2a2a30"), w * 0.8, h * 0.16, 0.03, 0, h * 0.16, d / 2 + 0.01);
  },
  // 路灯（灯头发光）
  streetlamp(g, [, h, d], c) {
    const m = M(c);
    cy(g, m, 0.06, h, 0, h / 2, -d / 2);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, d, 10), m);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, h - 0.05, 0);
    g.add(arm);
    bx(g, M("#f5f0d8", { emissive: new THREE.Color("#fff2c0"), emissiveIntensity: 1.2 }), 0.32, 0.1, 0.5, 0, h - 0.08, d / 2 - 0.2);
  },
  // 红绿灯（横臂式）
  traffic_light(g, [, h, d], c) {
    const m = M(c);
    cy(g, m, 0.07, h, 0, h / 2, -d / 2);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, d, 10), m);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, h - 0.1, 0);
    g.add(arm);
    const boxM = M("#1f2429");
    bx(g, boxM, 0.9, 0.32, 0.18, 0, h - 0.35, d / 2 - 0.15);
    const lampColors = ["#e03030", "#e8a030", "#30c050"];
    lampColors.forEach((lc, i) => {
      sp(g, M(lc, { emissive: new THREE.Color(lc), emissiveIntensity: i === 0 ? 1.0 : 0.15 }), 0.09, -0.26 + i * 0.26, h - 0.35, d / 2 - 0.04);
    });
  },
  // 标志牌（圆牌）
  road_sign(g, [, h], c) {
    cy(g, M("#9a9aa0"), 0.035, h, 0, h / 2);
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), M(c));
    sign.rotation.x = Math.PI / 2;
    sign.position.set(0, h * 0.82, 0.02);
    g.add(sign);
  },
  // 桥墩（柱 + 盖梁）
  bridge_pier(g, [w, h], c) {
    const m = M(c);
    cy(g, m, w * 0.32, h, 0, h / 2);
    bx(g, m, w * 2.2, 0.5, w * 0.9, 0, h + 0.25);
  },
  // 楼体（窗户纹理）
  building(g, [w, h, d], c) {
    const t = windowTexture();
    t.repeat.set(Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(h / 3)));
    const m = new THREE.MeshStandardMaterial({ color: c, map: t, roughness: 0.9 });
    bx(g, m, w, h, d, 0, h / 2);
  },
  // 站台（黄色安全线 + 边缘落差）
  platform(g, [w, h, d], c) {
    bx(g, M(c), w, h, d, 0, h / 2);
    bx(g, M("#d8c040"), w, 0.015, 0.3, 0, h + 0.008, -d / 2 + 0.45); // 黄线
    bx(g, M("#8a857a"), w, 0.02, 0.12, 0, h + 0.01, -d / 2 + 0.06);  // 边缘
  },
  // 铁路道口（双轨 + 遮断杆）
  rail_crossing(g, [w, , d], c) {
    const m = M(c);
    for (const s of [-1, 1]) {
      cy(g, m, 0.05, 1.1, s * (w / 2 - 0.4), 0.55, -d / 2 + 0.3);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(d * 0.9, 0.08, 0.08), M("#e8e0d0"));
      bar.rotation.x = Math.PI / 2;
      bar.position.set(s * (w / 2 - 0.4), 1.0, -d / 2 + 0.3 + d * 0.45);
      g.add(bar);
    }
    // 轨道
    for (const rz of [d * 0.15, d * 0.75]) {
      for (const s of [-1, 1]) bx(g, M("#5a5a60"), w, 0.08, 0.07, 0, 0.08, rz + s * 0.72);
      for (let i = 0; i < w / 0.6; i++) bx(g, M("#4a4038"), 0.24, 0.06, 1.8, -w / 2 + 0.3 + i * 0.6, 0.03, rz);
    }
  },
  // 电话亭（框架 + 玻璃）
  phone_booth(g, [w, h, d], c) {
    const m = M(c);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      bx(g, m, 0.08, h, 0.08, sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04));
    }
    bx(g, m, w, 0.25, d, 0, h - 0.12);
    const glass = M("#bcd4dc", { transparent: true, opacity: 0.3, roughness: 0.2 });
    bx(g, glass, w - 0.1, h * 0.6, 0.02, 0, h * 0.45, d / 2 - 0.05);
    bx(g, glass, 0.02, h * 0.6, d - 0.1, -w / 2 + 0.05, h * 0.45);
  },
  // 广告牌（双立柱 + 大板）
  billboard(g, [w, h], c) {
    for (const s of [-1, 1]) cy(g, M("#6a6a70"), 0.09, h * 0.55, s * w * 0.3, h * 0.275);
    bx(g, M(c), w, h * 0.45, 0.12, 0, h * 0.78);
  },
  // 圆柱
  column(g, [w, h], c) {
    cy(g, M(c), w / 2, h, 0, h / 2);
    bx(g, M(c), w * 1.3, 0.12, w * 1.3, 0, h - 0.06);
    bx(g, M(c), w * 1.3, 0.12, w * 1.3, 0, 0.06);
  },
  // 拱门（两柱 + 半圆券）
  arch(g, [w, h, d], c) {
    const m = M(c);
    for (const s of [-1, 1]) bx(g, m, 0.4, h * 0.72, d, s * (w / 2 - 0.2), h * 0.36);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(w / 2 - 0.2, 0.2, 10, 20, Math.PI), m);
    arc.position.y = h * 0.72;
    g.add(arc);
  },
  // 喷泉（水池 + 中心柱 + 水面）
  fountain(g, [w, h], c) {
    const m = M(c);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.4, 20), m);
    basin.position.y = 0.2; g.add(basin);
    const waterM = M("#5a9ac0", { transparent: true, opacity: 0.75, roughness: 0.15 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 - 0.15, w / 2 - 0.15, 0.05, 20), waterM);
    water.position.y = 0.38; g.add(water);
    cy(g, m, 0.16, h, 0, h / 2);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16), m);
    top.position.y = h; g.add(top);
  },
  // 树篱
  hedge(g, [w, h, d], c) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 3, 2, 2), M(c, { roughness: 1 }));
    o.position.y = h / 2;
    g.add(o);
  },
  // 灌木（两团球）
  bush(g, [w, h], c) {
    sp(g, M(c, { roughness: 1 }), w * 0.5, 0, h * 0.55);
    sp(g, M(c, { roughness: 1 }), w * 0.38, w * 0.3, h * 0.4, w * 0.18);
  },
  // 水面（大半透明平面）
  water(g, [w, , d], c) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      M(c, { transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.4 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.01;
    g.add(m);
  },
  // 栈桥（木板面 + 桩）
  pier(g, [w, h, d], c) {
    const m = M(c);
    bx(g, m, w, 0.1, d, 0, h, 0);
    for (const sz of [-1, 1]) for (let i = 0; i <= Math.round(d / 2); i++) {
      cy(g, M("#5a4632"), 0.07, h, sz * (w / 2 - 0.15), h / 2, -d / 2 + i * 2);
    }
  },
  // 秋千（A 架 + 横杆 + 两个座位）
  swing(g, [w, h], c) {
    const m = M(c);
    for (const s of [-1, 1]) for (const e of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h * 1.04, 10), m);
      leg.position.set(s * (w / 2), h / 2, e * 0.4);
      leg.rotation.x = e * 0.36;
      g.add(leg);
    }
    rail(g, m, 0.045, w, 0, h);
    for (const sx of [-w / 5, w / 5]) {
      for (const sr of [-0.18, 0.18]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h * 0.62, 6), M("#d8d4c8"));
        rope.position.set(sx + sr, h * 0.69, 0);
        g.add(rope);
      }
      bx(g, M("#8a4a3a"), 0.44, 0.04, 0.2, sx, h * 0.38, 0);
    }
  },
  // 滑梯（梯子 + 斜面）
  slide(g, [w, h, d], c) {
    const m = M(c);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.06, d * 0.8), m);
    ramp.position.set(0, h * 0.5, d * 0.1);
    ramp.rotation.x = Math.atan2(h, d * 0.8);
    g.add(ramp);
    for (let i = 0; i < 4; i++) rail(g, m, 0.03, w * 0.6, 0, h * 0.25 * (i + 1) * 0.9, -d / 2 + 0.15);
    for (const s of [-1, 1]) cy(g, m, 0.04, h, s * w * 0.3, h / 2, -d / 2 + 0.15);
    bx(g, m, w * 0.7, 0.06, 0.5, 0, h, -d / 2 + 0.3);
  },
  // 篮球架
  basketball_hoop(g, [, h], c) {
    cy(g, M("#3a3f45"), 0.08, h * 0.82, 0, h * 0.41, -0.3);
    bx(g, M(c), 1.1, 0.75, 0.05, 0, h * 0.88, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 20), M("#d86030"));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, h * 0.78, 0.3);
    g.add(rim);
  },
  // 足球门（框架 + 方网）
  goal(g, [w, h, d], c) {
    const m = M(c);
    for (const s of [-1, 1]) cy(g, m, 0.05, h, s * w / 2, h / 2, d / 2);
    rail(g, m, 0.05, w, 0, h, d / 2);
    net(g, w, h, h / 2, 0, 12, "#cccccc");
  },
  // 课桌（桌面 + 抽屉 + 细腿）
  desk(g, [w, h, d], c) {
    const m = M(c); const dark = M("#5a5a60");
    bx(g, m, w, 0.04, d, 0, h, 0);
    bx(g, m, w * 0.9, 0.1, d * 0.85, 0, h - 0.09, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      cy(g, dark, 0.025, h, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
    }
  },
  // 黑板（带支架腿）
  blackboard(g, [w, h], c) {
    const m = M(c); const frame = M("#8a6a48");
    bx(g, m, w, h, 0.06, 0, h * 0.55 + 0.5);
    bx(g, frame, w + 0.1, 0.08, 0.09, 0, h * 0.55 + 0.5 + h / 2 + 0.04);
    bx(g, frame, w + 0.1, 0.08, 0.09, 0, h * 0.55 + 0.5 - h / 2 - 0.04);
    for (const s of [-1, 1]) cy(g, frame, 0.04, 0.6, s * (w / 2 - 0.1), 0.3);
  },
  // 储物柜（柜门线条）
  locker(g, [w, h, d], c) {
    bx(g, M(c), w, h, d, 0, h / 2);
    const line = M("#3a424c");
    const n = Math.max(2, Math.round(w / 0.3));
    for (let i = 1; i < n; i++) bx(g, line, 0.015, h * 0.94, 0.01, -w / 2 + (w * i) / n, h / 2, d / 2 + 0.005);
    bx(g, line, w * 0.96, 0.015, 0.01, 0, h / 2, d / 2 + 0.005);
  },
  // 灯笼（发光纸灯 + 上下盖 + 挂钩）
  lantern(g, [w, h], c) {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(w / 2, 14, 12),
      M(c, { emissive: new THREE.Color("#ffdf9a"), emissiveIntensity: 0.8 }),
    );
    body.scale.y = (h / w) * 0.9;
    body.position.y = h / 2 + 0.05;
    g.add(body);
    cy(g, M("#8a3030"), w * 0.16, 0.05, 0, h + 0.04);
    cy(g, M("#8a3030"), w * 0.16, 0.05, 0, 0.06);
  },
  // 灯串（两杆 + 下垂线 + 发光小球）
  string_lights(g, [w, h], c) {
    const m = M(c);
    for (const s of [-1, 1]) cy(g, m, 0.04, h, s * w / 2, h / 2);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector3(-w / 2 + w * t, h - Math.sin(t * Math.PI) * 0.45, 0));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a26 })));
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      sp(g, M("#ffe8b0", { emissive: new THREE.Color("#ffd880"), emissiveIntensity: 1.4 }), 0.045, -w / 2 + w * t, h - Math.sin(t * Math.PI) * 0.45 - 0.07);
    }
  },
  // 遮阳棚（斜顶条纹布 + 四柱）
  awning(g, [w, h, d], c) {
    const m = M("#6a6a70");
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      cy(g, m, 0.035, h, sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05));
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), M(c, { side: THREE.DoubleSide }));
    top.position.set(0, h + 0.02, 0);
    top.rotation.x = 0.12;
    g.add(top);
  },
  // 铁轨（双轨 + 枕木）
  rail_track(g, [w, , d], c) {
    for (const s of [-1, 1]) bx(g, M("#7a7a80"), 0.07, 0.12, d, s * 0.72, 0.12);
    const n = Math.round(d / 0.6);
    for (let i = 0; i < n; i++) bx(g, M(c), w, 0.08, 0.24, 0, 0.04, -d / 2 + 0.3 + i * 0.6);
  },
  // 樱花树（棕干 + 粉冠三团）
  sakura(g, [w, h], c) {
    cy(g, M("#5a4030"), 0.12 * (h / 3.8), h * 0.45, 0, h * 0.225);
    const pm = M(c, { roughness: 1 });
    sp(g, pm, w * 0.5, 0, h * 0.72);
    sp(g, pm, w * 0.38, w * 0.3, h * 0.6, w * 0.12);
    sp(g, pm, w * 0.34, -w * 0.3, h * 0.62, -w * 0.1);
  },
};

/** 构建扩展道具；不认识的 shape 返回 null 让调用方回退 */
export function buildExtendedProp(
  shape: string,
  size: [number, number, number],
  color: string,
): THREE.Group | null {
  const builder = BUILDERS[shape];
  if (!builder) return null;
  const g = new THREE.Group();
  builder(g, size, color);
  return g;
}
