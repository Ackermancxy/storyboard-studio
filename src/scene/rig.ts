// P1：Rig 接口 + 姿势引擎（SPEC §5.2–5.4）。
// 只依赖 Rig 接口，不写死木头人；同一份姿势数据可驱动任何按 Rig 构建的模型。
import * as THREE from "three";
import {
  JOINT_NAMES,
  type JointName,
  type JointParamKey,
  type JointParams,
  type Pose,
} from "../types";

/** 每个关节允许的参数及范围（度），SPEC §5.2。不在表内的参数被忽略。 */
export const JOINT_LIMITS: Record<JointName, Partial<Record<JointParamKey, [number, number]>>> = {
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

/** 四肢关节（用 swing-twist 公式，其余关节用局部 Euler） */
const LIMB_JOINTS: ReadonlySet<string> = new Set([
  "upperArm_L", "upperArm_R", "lowerArm_L", "lowerArm_R", "hand_L", "hand_R",
  "upperLeg_L", "upperLeg_R", "lowerLeg_L", "lowerLeg_R", "foot_L", "foot_R",
]);

export interface RigJoint {
  obj: THREE.Object3D;
  restLocal: THREE.Quaternion; // 静止时的局部旋转
  restRootFrame: THREE.Quaternion; // 静止时相对人物根的朝向 R（SPEC §5.4）
  restDir?: THREE.Vector3; // 四肢：根坐标系下的静止方向
}

/** 跟随某个关节一起转的附加骨骼（MMD「付与親」：腕捩、肩キャンセル 之流）。
 *  这些骨骼在 MMD 里靠付与继承源骨骼的旋转，three 的 MMDLoader 只解析不实现，
 *  不补的话绑在它们身上的面（典型：短袖袖子）不会跟大臂动。 */
export interface RigGrant {
  obj: THREE.Object3D;
  joint: JointName; // 跟随哪个关节
  restLocal: THREE.Quaternion;
  restRootFrame: THREE.Quaternion;
  ratio: number; // 付与率（1 = 完全跟随）
}

export interface Rig {
  root: THREE.Object3D;
  joints: Map<JointName, RigJoint>;
  height: number; // 静止站立总高（米）
  hipHeight: number; // 髋关节静止高度（root 的基准 y）
  markers: Map<string, THREE.Object3D>; // 测试/gaze 用的参照点（鼻尖、肘、腕…）
  grants?: RigGrant[]; // 付与骨（GLTF/木头人没有）
}

/** 每关节参数齐全且已 clamp 的姿势 */
export type ResolvedPose = Record<JointName, JointParams>;

const rad = (d: number): number => (d * Math.PI) / 180;
const REST_DIR = new THREE.Vector3(0, -1, 0); // 四肢静止方向（竖直向下）
const MIRROR_FLIP_KEYS: readonly JointParamKey[] = ["side", "twist", "turn", "tilt"];

/** 预设 + 逐项覆盖 → 每关节参数齐全、clamp 到 §5.2 范围（纯函数） */
export function resolvePose(pose: Pose | undefined, presets: Record<string, Pose>): ResolvedPose {
  const out = {} as ResolvedPose;
  for (const j of JOINT_NAMES) {
    const entry: JointParams = {};
    for (const k of Object.keys(JOINT_LIMITS[j]) as JointParamKey[]) entry[k] = 0;
    out[j] = entry;
  }
  const merge = (p?: Pose): void => {
    if (!p?.joints) return;
    for (const [name, params] of Object.entries(p.joints)) {
      if (!(name in out) || !params) continue;
      const joint = name as JointName;
      for (const [k, v] of Object.entries(params)) {
        const lim = JOINT_LIMITS[joint][k as JointParamKey];
        if (lim && typeof v === "number" && Number.isFinite(v)) {
          out[joint][k as JointParamKey] = Math.min(lim[1], Math.max(lim[0], v));
        }
      }
    }
  };
  if (pose?.preset && presets[pose.preset]) merge(presets[pose.preset]);
  merge(pose);
  return out;
}

const _swing = new THREE.Quaternion();
const _twist = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _rInv = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();

/** 把已解析的姿势应用到 rig（SPEC §5.3 公式 + §5.4 通用 local = restLocal·(R⁻¹·q·R)） */
export function applyPose(rig: Rig, pose: ResolvedPose): void {
  const grants = rig.grants ?? [];
  for (const name of JOINT_NAMES) {
    const joint = rig.joints.get(name);
    if (!joint) continue;
    const p = pose[name] ?? {};
    if (name.startsWith("upperArm") || name.startsWith("upperLeg")) {
      // 四肢根：swing-twist。s = 左 +1 / 右 -1（SPEC §5.3）
      // 注意：从模型自身的静止方向（A-pose/T-pose）出发，不写死 (0,-1,0)
      const rd = joint.restDir ?? REST_DIR;
      const s = name.endsWith("_L") ? 1 : -1;
      const pitch = rad(p.pitch ?? 0);
      const yaw = rad(p.yaw ?? 0);
      _d
        .set(
          s * Math.sin(pitch) * Math.sin(yaw),
          -Math.cos(pitch),
          Math.sin(pitch) * Math.cos(yaw),
        )
        .normalize();
      _swing.setFromUnitVectors(rd, _d);
      _twist.setFromAxisAngle(rd, s * rad(p.twist ?? 0)); // twist+ = 内旋，左右镜像
      _q.copy(_swing).multiply(_twist); // 先 twist 再 swing
    } else if (name.startsWith("lowerArm") || name.startsWith("hand")) {
      // 肘/腕：向前弯 rotX(-bend)；手 side+ = 向自己右 → 垂下的手 rotZ(-side)
      _e.set(-rad(p.bend ?? 0), 0, -rad(p.side ?? 0));
      _q.setFromEuler(_e);
    } else if (name.startsWith("lowerLeg")) {
      _e.set(rad(p.bend ?? 0), 0, 0); // 膝：向后弯 rotX(+bend)
      _q.setFromEuler(_e);
    } else if (name.startsWith("foot")) {
      _e.set(rad(p.point ?? 0), 0, 0); // 绷脚 rotX(+point)
      _q.setFromEuler(_e);
    } else {
      // 躯干/头颈：bend/nod → rotX(+)，side/tilt → rotZ(+)，twist/turn → rotY(-)
      const bend = p.bend ?? p.nod ?? 0;
      const side = p.side ?? p.tilt ?? 0;
      const turn = p.twist ?? p.turn ?? 0;
      _e.set(rad(bend), -rad(turn), rad(side));
      _q.setFromEuler(_e);
    }
    _rInv.copy(joint.restRootFrame).invert();
    joint.obj.quaternion
      .copy(joint.restLocal)
      .multiply(_rInv.multiply(_q).multiply(joint.restRootFrame));
    // 付与骨：同一份 delta 套到自己的 rest 帧上。
    // ratio −1 = 反向抵消（MMD 肩キャンセル那类骨），取逆而不是插值，避免数值漂移
    for (const g of grants) {
      if (g.joint !== name) continue;
      if (g.ratio === -1) _qg.copy(_q).invert();
      else if (g.ratio === 1) _qg.copy(_q);
      else _qg.copy(_q).slerp(IDENT, 1 - g.ratio);
      _rInv.copy(g.restRootFrame).invert();
      g.obj.quaternion.copy(g.restLocal).multiply(_rInv.multiply(_qg).multiply(g.restRootFrame));
    }
  }
}

/** 任意骨骼的静止局部旋转 / 相对人物根的朝向（构建 RigGrant 用） */
export function restFrameOf(
  root: THREE.Object3D,
  obj: THREE.Object3D,
): { restLocal: THREE.Quaternion; restRootFrame: THREE.Quaternion } {
  root.updateMatrixWorld(true);
  const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    restLocal: obj.quaternion.clone(),
    restRootFrame: rootInv.clone().multiply(obj.getWorldQuaternion(new THREE.Quaternion())),
  };
}

/** 镜像左右（SPEC §9）：_L/_R 参数互换；中轴关节的 side/twist/turn/tilt 取反（纯函数） */
export function mirrorPose(pose: Pose): Pose {
  if (!pose.joints) return { ...pose };
  const joints: NonNullable<Pose["joints"]> = {};
  for (const [name, params] of Object.entries(pose.joints)) {
    if (!params) continue;
    const flipped = name.endsWith("_L")
      ? (name.replace(/_L$/, "_R") as JointName)
      : name.endsWith("_R")
        ? (name.replace(/_R$/, "_L") as JointName)
        : (name as JointName);
    const out: JointParams = { ...params };
    for (const k of MIRROR_FLIP_KEYS) {
      if (out[k] !== undefined) out[k] = -out[k]!;
    }
    joints[flipped] = out;
  }
  return { ...pose, joints };
}

/** autoGround（SPEC §5.5）：摆完姿势后把身体最低点贴到 y = elevation */
export function autoGroundRig(rig: Rig, elevation = 0): void {
  rig.root.position.y = rig.hipHeight;
  rig.root.updateMatrixWorld(true);
  rig.root.position.y += elevation - postedBox(rig.root).min.y;
  rig.root.updateMatrixWorld(true);
}

/**
 * 摆完姿势后的世界包围盒。SkinnedMesh 的 geometry.boundingBox 是**绑定姿态**的，
 * Box3.setFromObject 默认不采样蒙皮，于是坐/跪/躺的人会按「站立时的脚印」落地，取景也按站姿算。
 * 这里逐顶点采样蒙皮结果（按步长抽样，全量 10 万顶点约 90ms，滑块拖动不能这么慢）。
 */
export function postedBox(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && typeof sm.getVertexPosition === "function") {
      const count = sm.geometry?.attributes?.position?.count ?? 0;
      if (count === 0) return;
      const stride = Math.max(1, Math.floor(count / SAMPLES_PER_MESH));
      for (let i = 0; i < count; i += stride) {
        sm.getVertexPosition(i, v); // 已含蒙皮，落在网格局部坐标系
        box.expandByPoint(v.applyMatrix4(sm.matrixWorld));
      }
    } else if ((o as THREE.Mesh).isMesh) {
      box.union(new THREE.Box3().setFromObject(o, true));
    }
  });
  return box;
}

/** 每个蒙皮网格抽样的顶点数上限（≈ 8ms / 10 万顶点） */
const SAMPLES_PER_MESH = 4000;

/** 构建期调用：从静止姿态读出各关节的 restLocal / R（GLTF 复用） */
export function computeRestFrames(
  root: THREE.Object3D,
  objs: Map<JointName, THREE.Object3D>,
  restDirs?: Partial<Record<JointName, THREE.Vector3>>,
): Map<JointName, RigJoint> {
  root.updateMatrixWorld(true);
  const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const map = new Map<JointName, RigJoint>();
  for (const name of JOINT_NAMES) {
    const obj = objs.get(name);
    if (!obj) continue;
    const joint: RigJoint = {
      obj,
      restLocal: obj.quaternion.clone(),
      restRootFrame: rootInv.clone().multiply(obj.getWorldQuaternion(new THREE.Quaternion())),
    };
    if (restDirs?.[name]) joint.restDir = restDirs[name]!.clone();
    map.set(name, joint);
  }
  return map;
}

export function isLimbJoint(name: JointName): boolean {
  return LIMB_JOINTS.has(name);
}
