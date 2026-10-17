// P1：程序化人体模型（SPEC §5.5 关节位置不变）——女性粗模型版：
// 有髋部/腰线/胸廓的体积感，四肢锥度收分，带发型轮廓；不再是火柴棍。
import * as THREE from "three";
import type { JointName } from "../types";
import { computeRestFrames, isLimbJoint, type Rig } from "./rig";

export type Build = "male" | "female" | "child";

export interface MannequinOpts {
  build?: Build;
  height?: number; // 米
  color?: string;
}

/** 基准总高 1.73m（§5.5），实际高度通过整体缩放实现 */
const BASE_HEIGHT = 1.73;
const HIP_H = 0.93;

/** 车削躯干段：profile = [[半径, 高度]…]，绕 Y 轴 */
function lathe(profile: [number, number][], mat: THREE.Material): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat);
  return m;
}
/** 锥度肢段：顶半径 r1 → 底半径 r2，从关节原点向 -Y 延伸 total */
function limb(parent: THREE.Object3D, r1: number, r2: number, total: number, mat: THREE.Material): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, total - r2, 14), mat);
  m.position.y = -(total - r2) / 2;
  parent.add(m);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r2, 12, 10), mat);
  cap.position.y = -(total - r2);
  parent.add(cap);
}
function ball(parent: THREE.Object3D, r: number, mat: THREE.Material): void {
  parent.add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat));
}

export function buildMannequin(opts: MannequinOpts = {}): Rig {
  const build = opts.build ?? "male";
  const height = opts.height ?? 1.78;
  const color = opts.color ?? "#d9ae8e";

  const shoulderScale = build === "male" ? 1.08 : build === "female" ? 0.92 : 0.95;
  const hipScale = build === "female" ? 1.12 : build === "male" ? 1.0 : 0.95;
  const headScale = build === "child" ? 1.25 : 1;
  const female = build === "female";

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: "#6b4a38", roughness: 0.85,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.6,
  });

  const root = new THREE.Group();
  root.name = "mannequin";
  root.position.set(0, HIP_H, 0);
  root.scale.setScalar(height / BASE_HEIGHT);

  const joints = new Map<JointName, THREE.Object3D>();
  const markers = new Map<string, THREE.Object3D>();
  joints.set("hips", root);

  const joint = (name: JointName, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    joints.set(name, g);
    return g;
  };
  const marker = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): void => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    markers.set(name, o);
  };

  // ── 骨盆：宽圆的髋部（女更宽）──
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), mat);
  pelvis.scale.set(1.06 * hipScale, 0.72, 0.86);
  pelvis.position.y = -0.02;
  root.add(pelvis);

  // ── 脊柱链：hips → spine(+0.03) → chest(+0.20) → neck(+0.25) → head(+0.10) ──
  const spine = joint("spine", root, 0, 0.03, 0);
  // 下腹→腰：车削段
  const lower = lathe(
    [[0.148 * hipScale, -0.03], [0.142 * hipScale, 0.06], [0.118, 0.15], [0.112, 0.21]],
    mat,
  );
  spine.add(lower);

  const chest = joint("chest", spine, 0, 0.2, 0);
  // 腰→胸→肩：车削段（女性带胸廓曲线）
  const upper = lathe(
    female
      ? [[0.112, -0.02], [0.128, 0.04], [0.142, 0.1], [0.128, 0.16], [0.1 * shoulderScale, 0.22], [0.05, 0.26]]
      : [[0.115, -0.02], [0.135, 0.05], [0.145, 0.12], [0.105 * shoulderScale, 0.22], [0.05, 0.26]],
    mat,
  );
  chest.add(upper);
  if (female) {
    // 胸部体积（粗模型暗示即可）
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), mat);
      b.position.set(s * 0.052, 0.115, 0.095);
      chest.add(b);
    }
  }
  // 肩部圆润过渡
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 12), mat);
    sh.position.set(s * 0.19 * shoulderScale, 0.22, 0);
    chest.add(sh);
  }

  const neck = joint("neck", chest, 0, 0.25, 0);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.1, 12), mat);
  neckMesh.position.y = 0.04;
  neck.add(neckMesh);

  const head = joint("head", neck, 0, 0.1, 0);
  // 头：略纵向拉长 + 下巴
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115 * headScale, 22, 18), mat);
  skull.scale.set(0.92, 1.08, 0.98);
  skull.position.y = 0.115 * headScale;
  head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.062 * headScale, 14, 12), mat);
  jaw.scale.set(0.9, 0.8, 0.9);
  jaw.position.set(0, 0.055 * headScale, 0.045 * headScale);
  head.add(jaw);
  // 发型：比头略大的半球罩 + 后摆（短发 bob 轮廓）
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.128 * headScale, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hairCap.scale.set(1, 1.02, 1.06);
  hairCap.position.set(0, 0.128 * headScale, -0.012);
  hairCap.name = "keepColor";
  head.add(hairCap);
  const hairBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * headScale, 0.14, 6, 12), hairMat);
  hairBack.position.set(0, 0.05 * headScale, -0.075 * headScale);
  hairBack.name = "keepColor";
  head.add(hairBack);
  // 鼻锥：一眼看出脸朝 +Z
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 10), noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.09 * headScale, 0.115 * headScale + 0.015);
  head.add(nose);
  marker("noseTip", head, 0, 0.1 * headScale, 0.115 * headScale + 0.05);
  marker("headTop", head, 0, 0.24 * headScale, 0);

  // ── 手臂（挂在 chest 上）：锥度收分 ──
  for (const side of ["_L", "_R"] as const) {
    const s = side === "_L" ? 1 : -1;
    const upperArmR = female ? 0.042 : 0.048;
    const forearmR = female ? 0.034 : 0.04;
    const upper = joint(`upperArm${side}` as JointName, chest, s * 0.19 * shoulderScale, 0.22, 0);
    limb(upper, upperArmR, upperArmR * 0.82, 0.3, mat);
    const lower = joint(`lowerArm${side}` as JointName, upper, 0, -0.3, 0);
    ball(lower, upperArmR * 0.82, mat);
    limb(lower, forearmR, forearmR * 0.82, 0.26, mat);
    marker(`elbow${side}`, lower);
    const hand = joint(`hand${side}` as JointName, lower, 0, -0.26, 0);
    const handMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 10), mat);
    handMesh.position.y = -0.055;
    hand.add(handMesh);
    marker(`wrist${side}`, hand);
  }

  // ── 腿（挂在 hips root 上）：大腿粗、小腿细 ──
  for (const side of ["_L", "_R"] as const) {
    const s = side === "_L" ? 1 : -1;
    const thighTop = female ? 0.085 : 0.078;
    const thigh = joint(`upperLeg${side}` as JointName, root, s * 0.09 * hipScale, 0, 0);
    limb(thigh, thighTop, 0.055, 0.43, mat);
    const shin = joint(`lowerLeg${side}` as JointName, thigh, 0, -0.43, 0);
    ball(shin, 0.052, mat);
    limb(shin, 0.048, 0.034, 0.43, mat);
    marker(`knee${side}`, shin);
    const foot = joint(`foot${side}` as JointName, shin, 0, -0.43, 0);
    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.21), mat);
    footMesh.position.set(0, -0.045, 0.055); // 底面 ≈ -0.07 = 脚踝高（§5.5）
    foot.add(footMesh);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), mat);
    toe.scale.set(1, 0.7, 1);
    toe.position.set(0, -0.05, 0.155);
    foot.add(toe);
    marker(`ankle${side}`, foot);
    marker(`toe${side}`, foot, 0, -0.04, 0.175);
  }

  // 所有肢段静止方向都是 (0,-1,0)；关节全部轴对齐 → R = 单位（§5.4）
  const restDirs: Partial<Record<JointName, THREE.Vector3>> = {};
  for (const name of joints.keys()) {
    if (isLimbJoint(name)) restDirs[name] = new THREE.Vector3(0, -1, 0);
  }

  return {
    root,
    joints: computeRestFrames(root, joints, restDirs),
    height,
    hipHeight: HIP_H,
    markers,
  };
}

export function disposeMannequin(rig: Rig): void {
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    // GLTF/MMD 网格每个材质组一个材质（数组），只当单个处理会抛 dispose is not a function
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) mat?.dispose();
  });
}

/** 整体换色（发型/鼻锥保持原色，只换皮肤）。
 *  带贴图的材质（GLTF/MMD）跳过：染了等于把整张贴图乘成单色，
 *  而且这些材质是模板共享的，会给同模型的所有实例一起上色。 */
export function setRigColor(rig: Rig, color: string): void {
  rig.root.traverse((o) => {
    if (o.name === "keepColor") return;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std?.color || std.map) continue;
      std.color.set(color);
    }
  });
}
