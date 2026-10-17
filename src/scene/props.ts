// P2：程序化道具（SPEC §6.2）。全部低模单色、现实尺寸，原点在地面中心。
// 扩展场景道具（天桥/鸟居/电线杆等 35 种）在 propsExtended.ts。
import * as THREE from "three";
import type { Prop } from "../types";
import type { PropDef } from "./assets";
import {
  EXTENDED_COLORS, EXTENDED_DEFAULT_SIZE, EXTENDED_SHAPES, EXTENDED_SIZEABLE, buildExtendedProp,
} from "./propsExtended";

export const PROP_SHAPES = [
  "box", "wall", "backdrop", "door", "window", "chair", "stool", "table",
  "sofa", "bed", "stairs", "tree", "car", "umbrella", "light_stand",
  "fence", "railing",
  ...EXTENDED_SHAPES,
] as const;
export type PropShape = (typeof PROP_SHAPES)[number];

const DEFAULT_COLORS: Partial<Record<PropShape, string>> = {
  box: "#8a8f98", wall: "#b8b2a6", backdrop: "#5c6470", door: "#7a5c3e",
  window: "#9aa4ae", chair: "#8a6a48", stool: "#8a6a48", table: "#8a6a48",
  sofa: "#5f6f7f", bed: "#cfc8bc", stairs: "#9a9288", tree: "#4a7a3a",
  car: "#7a4a4a", umbrella: "#b0524a", light_stand: "#3a3a3a",
  fence: "#2e6b4f", railing: "#eceae2",
  ...EXTENDED_COLORS,
};

const mat = (color: string): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

function box(parent: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}
function cyl(parent: THREE.Object3D, m: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0, seg = 14): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

/** 构建道具；size 仅 sizeable 形状使用，其余忽略 */
export function buildProp(def: PropDef, prop: Prop): THREE.Group {
  const group = new THREE.Group();
  group.name = `prop:${prop.id}`;
  const color = prop.color ?? def.color ?? DEFAULT_COLORS[(def.shape ?? "box") as PropShape] ?? "#8a8f98";
  const size = prop.size ?? defaultSize(def.shape);
  const m = mat(color);
  const dark = mat("#4a4a4a");

  switch (def.shape) {
    case "box":
      box(group, m, size[0], size[1], size[2], 0, size[1] / 2);
      break;
    case "wall":
      box(group, m, size[0], size[1], size[2], 0, size[1] / 2);
      break;
    case "backdrop": {
      // 弧形背景纸：圆柱侧面一段，凹面朝 +Z
      const r = Math.max(size[0], size[2] * 2) / 2;
      const geo = new THREE.CylinderGeometry(r, r, size[1], 24, 1, true, Math.PI * 0.6, Math.PI * 0.8);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
      mesh.position.y = size[1] / 2;
      group.add(mesh);
      break;
    }
    case "door": // 门框 0.9 × 2.1
      box(group, m, 0.1, 2.1, 0.12, -0.45, 1.05);
      box(group, m, 0.1, 2.1, 0.12, 0.45, 1.05);
      box(group, m, 1.0, 0.1, 0.12, 0, 2.1);
      break;
    case "window": // 窗框 1.2 × 1.2，窗台高 0.9
      box(group, m, 1.3, 0.08, 0.1, 0, 0.9);
      box(group, m, 1.3, 0.08, 0.1, 0, 2.1);
      box(group, m, 0.08, 1.28, 0.1, -0.61, 1.5);
      box(group, m, 0.08, 1.28, 0.1, 0.61, 1.5);
      box(group, m, 0.05, 1.2, 0.06, 0, 1.5);
      box(group, m, 1.2, 0.05, 0.06, 0, 1.5);
      break;
    case "chair": { // 椅面高 0.45
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
        box(group, dark, 0.04, 0.42, 0.04, lx, 0.21, lz);
      }
      box(group, m, 0.44, 0.05, 0.44, 0, 0.445);
      box(group, m, 0.44, 0.48, 0.05, 0, 0.71, -0.2);
      break;
    }
    case "stool":
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        cyl(group, dark, 0.02, 0.52, Math.cos(a) * 0.13, 0.26, Math.sin(a) * 0.13);
      }
      cyl(group, m, 0.18, 0.05, 0, 0.545);
      break;
    case "table": { // 桌高 0.75
      box(group, m, 1.2, 0.05, 0.7, 0, 0.725);
      for (const [lx, lz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
        box(group, dark, 0.05, 0.7, 0.05, lx, 0.35, lz);
      }
      break;
    }
    case "sofa":
      box(group, m, 1.9, 0.38, 0.85, 0, 0.28);
      box(group, m, 1.9, 0.55, 0.18, 0, 0.72, -0.33);
      box(group, m, 0.18, 0.58, 0.85, -0.86, 0.45);
      box(group, m, 0.18, 0.58, 0.85, 0.86, 0.45);
      break;
    case "bed": { // 1.5 宽 × 0.5 高 × 2.0 深
      box(group, dark, 1.5, 0.32, 2.0, 0, 0.16);
      box(group, m, 1.44, 0.18, 1.94, 0, 0.41);
      box(group, mat("#f0ece4"), 1.2, 0.12, 0.4, 0, 0.55, -0.72);
      break;
    }
    case "stairs":
      for (let i = 0; i < 4; i++) {
        box(group, m, 1.2, 0.18 * (i + 1), 0.28, 0, 0.09 * (i + 1), -i * 0.28);
      }
      break;
    case "tree":
      cyl(group, mat("#6a4a30"), 0.12, 1.6, 0, 0.8);
      {
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 10), m);
        crown.position.y = 2.6;
        group.add(crown);
        const crown2 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 10), m);
        crown2.position.y = 3.4;
        group.add(crown2);
      }
      break;
    case "car":
      box(group, m, 1.8, 0.55, 4.2, 0, 0.75);
      box(group, m, 1.7, 0.5, 2.0, 0, 1.25, -0.2);
      for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.33, wz);
        group.add(wheel);
      }
      break;
    case "umbrella":
      cyl(group, dark, 0.025, 2.2, 0, 1.1);
      {
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.5, 12), m);
        canopy.position.y = 2.15;
        group.add(canopy);
      }
      break;
    case "light_stand":
      cyl(group, dark, 0.025, 2.0, 0, 1.0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), dark);
        leg.position.set(Math.cos(a) * 0.18, 0.22, Math.sin(a) * 0.18);
        leg.rotation.z = Math.cos(a) * 0.35;
        leg.rotation.x = -Math.sin(a) * 0.35;
        group.add(leg);
      }
      box(group, mat("#f5f0e0"), 0.62, 0.62, 0.16, 0, 2.05);
      break;
    case "fence": {
      // 铁丝网：立柱 + 上下横杆 + 菱形网格面（canvas 纹理）
      const [len, h] = [size[0], size[1]];
      const frame = mat(color);
      const nPosts = Math.max(2, Math.round(len / 1.5) + 1);
      for (let i = 0; i < nPosts; i++) {
        cyl(group, frame, 0.035, h, -len / 2 + (len * i) / (nPosts - 1), h / 2);
      }
      for (const ry of [h - 0.03, 0.06]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 10), frame);
        rail.rotation.z = Math.PI / 2;
        rail.position.y = ry;
        group.add(rail);
      }
      const meshMat = new THREE.MeshStandardMaterial({
        map: fenceTexture(), transparent: true, alphaTest: 0.3,
        side: THREE.DoubleSide, roughness: 0.7, metalness: 0.3, color: "#9fb8aa",
      });
      meshMat.map!.repeat.set(len / 0.55, h / 0.55);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.12), meshMat);
      mesh.position.y = h / 2;
      group.add(mesh);
      break;
    }
    case "railing": {
      // 道路/海边护栏：立柱 + 两道横管
      const [len, h] = [size[0], size[1]];
      const white = mat(color);
      const nPosts = Math.max(2, Math.round(len / 1.2) + 1);
      for (let i = 0; i < nPosts; i++) {
        cyl(group, white, 0.03, h, -len / 2 + (len * i) / (nPosts - 1), h / 2);
      }
      for (const ry of [h - 0.03, h * 0.52]) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 12), white);
        rail.rotation.z = Math.PI / 2;
        rail.position.y = ry;
        group.add(rail);
      }
      break;
    }
    default: {
      // 扩展道具库；仍不认识的回退 box
      const ext = buildExtendedProp(def.shape ?? "", size, color);
      if (ext) {
        group.add(ext);
      } else {
        box(group, m, size[0], size[1], size[2], 0, size[1] / 2);
      }
    }
  }
  return group;
}

function defaultSize(shape?: string): [number, number, number] {
  switch (shape) {
    case "wall": return [4, 2.8, 0.15];
    case "backdrop": return [3, 2.5, 1.2];
    case "fence": return [4, 1.3, 0.04];
    case "railing": return [4, 1.1, 0.05];
    default:
      return EXTENDED_DEFAULT_SIZE[shape ?? ""] ?? [0.5, 0.5, 0.5];
  }
}

export function isSizeable(def: PropDef): boolean {
  return (def.sizeable ?? ["box", "wall", "backdrop", "fence", "railing"].includes(def.shape ?? ""))
    || EXTENDED_SIZEABLE.has(def.shape ?? "");
}

/** 菱形铁丝网纹理（缓存一份复用） */
let _fenceTex: THREE.CanvasTexture | null = null;
function fenceTexture(): THREE.CanvasTexture {
  if (_fenceTex) return _fenceTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = -64; i <= 128; i += 16) {
    ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64);
    ctx.moveTo(i, 64); ctx.lineTo(i + 64, 0);
  }
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _fenceTex = t;
  return t;
}
