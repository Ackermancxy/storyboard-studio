// P1：程序化木头人（SPEC §5.5）。低多边形、鼻锥明显、支持 male/female/child 三种体型。
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

export function buildMannequin(opts: MannequinOpts = {}): Rig {
  const build = opts.build ?? "male";
  const height = opts.height ?? 1.78;
  const color = opts.color ?? "#c9a06b";

  const shoulderScale = build === "male" ? 1.08 : build === "female" ? 0.92 : 0.95;
  const hipScale = build === "female" ? 1.1 : build === "male" ? 1.0 : 0.95;
  const headScale = build === "child" ? 1.25 : 1;

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const noseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.6),
    roughness: 0.8,
  });

  const root = new THREE.Group();
  root.name = "mannequin";
  root.position.set(0, HIP_H, 0);
  root.scale.setScalar(height / BASE_HEIGHT);

  const joints = new Map<JointName, THREE.Object3D>();
  const markers = new Map<string, THREE.Object3D>();
  joints.set("hips", root); // hips = 根（§5.1）

  const joint = (name: JointName, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    joints.set(name, g);
    return g;
  };
  /** 肢段胶囊，从关节原点向 -Y 延伸 */
  const limb = (parent: THREE.Object3D, r: number, total: number): void => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, total - 2 * r, 4, 12), mat);
    m.position.y = -total / 2;
    parent.add(m);
  };
  const ball = (parent: THREE.Object3D, r: number): void => {
    parent.add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat));
  };
  const marker = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0): void => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    markers.set(name, o);
  };

  // ── 骨盆（hips = root）──
  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(0.18 * hipScale + 0.14, 0.16, 0.12),
    mat,
  );
  pelvis.position.y = -0.03;
  root.add(pelvis);

  // ── 脊柱链：hips → spine(+0.03) → chest(+0.20) → neck(+0.25) → head(+0.10) ──
  const spine = joint("spine", root, 0, 0.03, 0);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.14, 4, 12), mat);
  belly.position.y = 0.1;
  spine.add(belly);

  const chest = joint("chest", spine, 0, 0.2, 0);
  const ribcage = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.15, 4, 12), mat);
  ribcage.position.y = 0.13;
  chest.add(ribcage);

  const neck = joint("neck", chest, 0, 0.25, 0);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10), mat);
  neckMesh.position.y = 0.04;
  neck.add(neckMesh);

  const head = joint("head", neck, 0, 0.1, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115 * headScale, 20, 16), mat);
  skull.position.y = 0.115 * headScale;
  head.add(skull);
  // 明显的鼻锥：一眼看出脸朝 +Z
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 10), noseMat);
  nose.rotation.x = Math.PI / 2; // +Y → +Z
  nose.position.set(0, 0.1 * headScale, 0.115 * headScale + 0.02);
  head.add(nose);
  marker("noseTip", head, 0, 0.1 * headScale, 0.115 * headScale + 0.05);
  marker("headTop", head, 0, 0.23 * headScale, 0);

  // ── 手臂（挂在 chest 上）──
  for (const side of ["_L", "_R"] as const) {
    const s = side === "_L" ? 1 : -1;
    const upper = joint(`upperArm${side}` as JointName, chest, s * 0.19 * shoulderScale, 0.22, 0);
    ball(upper, 0.055);
    limb(upper, 0.045, 0.3);
    const lower = joint(`lowerArm${side}` as JointName, upper, 0, -0.3, 0);
    ball(lower, 0.048);
    limb(lower, 0.04, 0.26);
    marker(`elbow${side}`, lower);
    const hand = joint(`hand${side}` as JointName, lower, 0, -0.26, 0);
    limb(hand, 0.033, 0.17);
    marker(`wrist${side}`, hand);
  }

  // ── 腿（挂在 hips root 上）──
  for (const side of ["_L", "_R"] as const) {
    const s = side === "_L" ? 1 : -1;
    const thigh = joint(`upperLeg${side}` as JointName, root, s * 0.09 * hipScale, 0, 0);
    ball(thigh, 0.07);
    limb(thigh, 0.065, 0.43);
    const shin = joint(`lowerLeg${side}` as JointName, thigh, 0, -0.43, 0);
    ball(shin, 0.06);
    limb(shin, 0.05, 0.43);
    marker(`knee${side}`, shin);
    const foot = joint(`foot${side}` as JointName, shin, 0, -0.43, 0);
    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.23), mat);
    footMesh.position.set(0, -0.04, 0.06); // 底面 -0.07 = 脚踝高（§5.5），趾尖朝 +Z
    foot.add(footMesh);
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
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}

/** 整体换色（木头人全身一个材质，nose 略深由明暗自然区分） */
export function setRigColor(rig: Rig, color: string): void {
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) (m.material as THREE.MeshStandardMaterial).color.set(color);
  });
}
