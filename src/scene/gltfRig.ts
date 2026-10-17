// P6：从 GLTF 骨骼构建 Rig（SPEC §5.4、§6.1）。同一份姿势数据经 R 转换驱动任意模型。
import * as THREE from "three";
import type { JointName } from "../types";
import { computeRestFrames, isLimbJoint, restFrameOf, type Rig } from "./rig";
import { collectMmdGrants, findBone } from "./assets";

/** Mixamo 骨骼名表（含 mixamorig: 前缀变体，findBone 已兼容） */
export const MIXAMO_BONES: Record<JointName, string> = {
  hips: "mixamorig:Hips",
  spine: "mixamorig:Spine",
  chest: "mixamorig:Spine2",
  neck: "mixamorig:Neck",
  head: "mixamorig:Head",
  upperArm_L: "mixamorig:LeftArm", lowerArm_L: "mixamorig:LeftForeArm", hand_L: "mixamorig:LeftHand",
  upperArm_R: "mixamorig:RightArm", lowerArm_R: "mixamorig:RightForeArm", hand_R: "mixamorig:RightHand",
  upperLeg_L: "mixamorig:LeftUpLeg", lowerLeg_L: "mixamorig:LeftLeg", foot_L: "mixamorig:LeftFoot",
  upperLeg_R: "mixamorig:RightUpLeg", lowerLeg_R: "mixamorig:RightLeg", foot_R: "mixamorig:RightFoot",
};

/** MMD 日文骨骼名表（标准命名；缺 上半身2 的模型自动忽略 chest） */
export const MMD_BONES: Record<JointName, string> = {
  hips: "センター",
  spine: "上半身",
  chest: "上半身2",
  neck: "首",
  head: "頭",
  upperArm_L: "左腕", lowerArm_L: "左ひじ", hand_L: "左手首",
  upperArm_R: "右腕", lowerArm_R: "右ひじ", hand_R: "右手首",
  upperLeg_L: "左足", lowerLeg_L: "左ひざ", foot_L: "左足首",
  upperLeg_R: "右足", lowerLeg_R: "右ひざ", foot_R: "右足首",
};

/** 简写 "mixamo" / "mmd" → 全表 */
export function resolveBoneMap(boneMap: string | Record<string, string>): Partial<Record<JointName, string>> {
  if (boneMap === "mixamo") return MIXAMO_BONES;
  if (boneMap === "mmd") return MMD_BONES;
  return boneMap as Partial<Record<JointName, string>>;
}

/**
 * @param model 已克隆的模型实例（会被缩放/旋转，无名义父级）
 * @param height 目标身高 m
 * @param rotateY 朝向修正角（度）
 * @param boneMap 骨骼名映射
 */
export function buildGltfRig(
  model: THREE.Group,
  height: number,
  rotateY: number,
  boneMap: Partial<Record<JointName, string>>,
): Rig {
  const wrapper = new THREE.Group();
  wrapper.name = "gltf-root";
  wrapper.add(model);

  // 归一化身高 + 朝向修正
  const box = new THREE.Box3().setFromObject(model);
  const rawH = box.max.y - box.min.y;
  const s = height / (rawH || 1);
  wrapper.scale.setScalar(s);
  wrapper.rotation.y = THREE.MathUtils.degToRad(rotateY || 0);
  wrapper.updateMatrixWorld(true);

  // 找骨骼
  const objs = new Map<JointName, THREE.Object3D>();
  for (const [joint, boneName] of Object.entries(boneMap) as [JointName, string][]) {
    const bone = findBone(model, boneName);
    if (bone) objs.set(joint, bone); // 缺的关节忽略（SPEC §6.1）
  }

  // 四肢 restDir：子骨骼位置 − 本骨骼位置（根坐标系）
  const rootInv = wrapper.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restDirs: Partial<Record<JointName, THREE.Vector3>> = {};
  const childOf: Partial<Record<JointName, JointName>> = {
    upperArm_L: "lowerArm_L", upperArm_R: "lowerArm_R",
    upperLeg_L: "lowerLeg_L", upperLeg_R: "lowerLeg_R",
  };
  for (const j of objs.keys()) {
    if (!isLimbJoint(j)) continue;
    const childName = childOf[j] ?? (j.startsWith("lowerArm")
      ? `hand_${j.slice(-2)}`
      : j.startsWith("lowerLeg")
        ? `foot_${j.slice(-2)}`
        : undefined);
    const child = childName as JointName | undefined;
    const bone = objs.get(j);
    const childBone = child ? objs.get(child) : undefined;
    if (!bone || !childBone) continue;
    const a = bone.getWorldPosition(new THREE.Vector3());
    const b = childBone.getWorldPosition(new THREE.Vector3());
    const dir = b.sub(a);
    if (dir.lengthSq() < 1e-8) continue;
    restDirs[j] = dir.normalize().applyQuaternion(rootInv);
  }

  const rig: Rig = {
    root: wrapper,
    joints: computeRestFrames(wrapper, objs, restDirs),
    height,
    hipHeight: objs.get("hips")
      ? objs.get("hips")!.getWorldPosition(new THREE.Vector3()).y
      : height * 0.53,
    markers: (() => {
      const m = new Map<string, THREE.Object3D>();
      if (objs.get("head")) m.set("noseTip", objs.get("head")!);
      return m;
    })(),
  };
  // 付与骨（MMD 腕捩等）：此刻模型还在静止姿态，先记下各自的 rest 帧
  const grants = collectMmdGrants(model, boneMap).map((g) => ({
    obj: g.bone,
    joint: g.joint,
    ratio: g.ratio,
    ...restFrameOf(wrapper, g.bone),
  }));
  if (grants.length > 0) rig.grants = grants;

  return rig;
}
