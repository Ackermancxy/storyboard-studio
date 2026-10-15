// P1 临时调试 UI（P2 将替换为 Inspector）：体型 / 预设 / 17 关节滑杆 / 镜像。
import GUI from "lil-gui";
import * as THREE from "three";
import { type JointName, type JointParamKey } from "../types";
import { POSE_PRESETS, presetMap } from "../data/poses";
import {
  buildMannequin,
  disposeMannequin,
  setRigColor,
  type Build,
} from "../scene/mannequin";
import { applyPose, autoGroundRig, JOINT_LIMITS, mirrorPose, resolvePose, type ResolvedPose } from "../scene/rig";

const JOINT_GROUPS: [string, JointName[]][] = [
  ["躯干", ["hips", "spine", "chest"]],
  ["头颈", ["neck", "head"]],
  ["左臂", ["upperArm_L", "lowerArm_L", "hand_L"]],
  ["右臂", ["upperArm_R", "lowerArm_R", "hand_R"]],
  ["左腿", ["upperLeg_L", "lowerLeg_L", "foot_L"]],
  ["右腿", ["upperLeg_R", "lowerLeg_R", "foot_R"]],
];

const JOINT_LABELS: Record<JointName, string> = {
  hips: "髋(全身)", spine: "腰", chest: "胸", neck: "颈", head: "头",
  upperArm_L: "左上臂", lowerArm_L: "左前臂", hand_L: "左手",
  upperArm_R: "右上臂", lowerArm_R: "右前臂", hand_R: "右手",
  upperLeg_L: "左大腿", lowerLeg_L: "左小腿", foot_L: "左脚",
  upperLeg_R: "右大腿", lowerLeg_R: "右小腿", foot_R: "右脚",
};

const PARAM_LABELS: Record<JointParamKey, string> = {
  bend: "前弯", side: "侧倾", twist: "扭转/内旋", nod: "低头", tilt: "歪头",
  turn: "转头", pitch: "抬起", yaw: "方向", point: "绷脚",
};

export function setupPoseDebug(scene: THREE.Scene, onChange: () => void): void {
  const state = { build: "male" as Build, height: 1.78, color: "#c9a06b", preset: "stand" };
  let joints: ResolvedPose = resolvePose({ preset: "stand" }, presetMap);
  let rig = buildMannequin({ build: state.build, height: state.height, color: state.color });
  scene.add(rig.root);

  const refresh = (): void => {
    applyPose(rig, joints);
    autoGroundRig(rig, 0);
    onChange();
  };
  refresh();

  const rebuild = (): void => {
    scene.remove(rig.root);
    disposeMannequin(rig);
    rig = buildMannequin({ build: state.build, height: state.height, color: state.color });
    scene.add(rig.root);
    refresh();
    syncSliders();
  };

  const gui = new GUI({ title: "人物调试（P2 替换）", width: 265 });
  gui.add(state, "build", { 男: "male", 女: "female", 儿童: "child" }).name("体型").onChange(rebuild);
  gui.add(state, "height", 0.8, 2.0, 0.01).name("身高 m").onChange(() => {
    rig.root.scale.setScalar(state.height / 1.73);
    refresh();
  });
  gui.add(state, "color").name("颜色").onChange((v: string) => {
    setRigColor(rig, v);
    onChange();
  });

  const poseFolder = gui.addFolder("姿势");
  const presetOptions: Record<string, string> = { "（自定义）": "" };
  for (const p of POSE_PRESETS) presetOptions[`${p.name} ${p.id}`] = p.id;
  state.preset = "stand";
  poseFolder
    .add(state, "preset", presetOptions)
    .name("预设")
    .onChange((id: string) => {
      if (!id) return;
      joints = resolvePose({ preset: id }, presetMap);
      refresh();
      syncSliders();
    });
  poseFolder
    .add({ mirror: () => {
      joints = resolvePose(mirrorPose({ joints }), presetMap);
      state.preset = "";
      refresh();
      syncSliders();
    } }, "mirror")
    .name("⇄ 镜像左右");

  for (const [groupName, names] of JOINT_GROUPS) {
    const folder = gui.addFolder(groupName);
    for (const jn of names) {
      const jf = folder.addFolder(JOINT_LABELS[jn]);
      for (const [pk, range] of Object.entries(JOINT_LIMITS[jn]) as [JointParamKey, [number, number]][]) {
        jf
          .add(joints[jn], pk, range[0], range[1], 1)
          .name(PARAM_LABELS[pk])
          .onChange(() => {
            state.preset = "";
            refresh();
          });
      }
    }
  }

  function syncSliders(): void {
    for (const c of gui.controllersRecursive()) c.updateDisplay();
  }
}
