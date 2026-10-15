// P1：内置姿势预设（SPEC §5.7）。数值为解剖推算的起点，待 3D 里目测微调。
import type { Pose } from "../types";

export interface PresetDef {
  id: string;
  name: string;
  pose: Pose;
}

export const POSE_PRESETS: PresetDef[] = [
  { id: "stand", name: "站立", pose: { joints: {
    upperArm_L: { pitch: 6, yaw: 90 }, upperArm_R: { pitch: 6, yaw: 90 },
  } } },
  { id: "stand_relaxed", name: "三七步", pose: { joints: {
    hips: { side: 4 }, chest: { side: -3 },
    upperLeg_L: { pitch: 8, yaw: 20 }, lowerLeg_L: { bend: 8 },
    upperArm_L: { pitch: 6, yaw: 90 }, upperArm_R: { pitch: 6, yaw: 90 },
  } } },
  { id: "hands_on_hips", name: "叉腰", pose: { joints: {
    upperArm_L: { pitch: 45, yaw: 100, twist: 30 }, upperArm_R: { pitch: 45, yaw: 100, twist: 30 },
    lowerArm_L: { bend: 110 }, lowerArm_R: { bend: 110 },
  } } },
  { id: "arms_crossed", name: "抱臂", pose: { joints: {
    upperArm_L: { pitch: 25, yaw: -15, twist: 70 }, upperArm_R: { pitch: 25, yaw: -15, twist: 70 },
    lowerArm_L: { bend: 115 }, lowerArm_R: { bend: 115 },
  } } },
  { id: "walk", name: "走路", pose: { joints: {
    upperLeg_L: { pitch: 25 }, lowerLeg_L: { bend: 10 },
    upperLeg_R: { pitch: 15, yaw: 180 }, lowerLeg_R: { bend: 35 },
    upperArm_L: { pitch: 20, yaw: 180 },
    upperArm_R: { pitch: 20, yaw: 0 }, lowerArm_R: { bend: 20 },
  } } },
  { id: "run", name: "跑步", pose: { joints: {
    spine: { bend: 10 },
    upperLeg_L: { pitch: 55 }, lowerLeg_L: { bend: 65 },
    upperLeg_R: { pitch: 20, yaw: 180 }, lowerLeg_R: { bend: 90 },
    upperArm_L: { pitch: 40, yaw: 180 }, lowerArm_L: { bend: 80 },
    upperArm_R: { pitch: 40, yaw: 0 }, lowerArm_R: { bend: 80 },
  } } },
  { id: "sit_chair", name: "坐椅子", pose: { joints: {
    upperLeg_L: { pitch: 88, yaw: 8 }, upperLeg_R: { pitch: 88, yaw: 8 },
    lowerLeg_L: { bend: 88 }, lowerLeg_R: { bend: 88 },
    upperArm_L: { pitch: 25, yaw: 15 }, upperArm_R: { pitch: 25, yaw: 15 },
    lowerArm_L: { bend: 30 }, lowerArm_R: { bend: 30 },
  } } },
  { id: "sit_floor", name: "席地抱膝", pose: { joints: {
    hips: { bend: -8 },
    upperLeg_L: { pitch: 100, yaw: 10 }, upperLeg_R: { pitch: 100, yaw: 10 },
    lowerLeg_L: { bend: 115 }, lowerLeg_R: { bend: 115 },
    upperArm_L: { pitch: 40, yaw: 35 }, upperArm_R: { pitch: 40, yaw: 35 },
    lowerArm_L: { bend: 95 }, lowerArm_R: { bend: 95 },
  } } },
  { id: "kneel", name: "双膝跪", pose: { joints: {
    spine: { bend: 4 },
    upperLeg_L: { pitch: 0 }, upperLeg_R: { pitch: 0 },
    lowerLeg_L: { bend: 90 }, lowerLeg_R: { bend: 90 },
  } } },
  { id: "kneel_one", name: "单膝跪", pose: { joints: {
    upperLeg_L: { pitch: 75 }, lowerLeg_L: { bend: 80 },
    upperLeg_R: { pitch: 0, yaw: 8 }, lowerLeg_R: { bend: 95 },
    upperArm_L: { pitch: 30, yaw: 20 }, lowerArm_L: { bend: 40 },
  } } },
  { id: "crouch", name: "蹲", pose: { joints: {
    spine: { bend: 28 },
    upperLeg_L: { pitch: 115, yaw: 6 }, upperLeg_R: { pitch: 115, yaw: 6 },
    lowerLeg_L: { bend: 135 }, lowerLeg_R: { bend: 135 },
    foot_L: { point: 22 }, foot_R: { point: 22 },
    upperArm_L: { pitch: 70, yaw: 12 }, upperArm_R: { pitch: 70, yaw: 12 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 20 },
  } } },
  { id: "lean_forward", name: "前倾扶膝", pose: { joints: {
    spine: { bend: 28 }, chest: { bend: 12 },
    upperLeg_L: { pitch: 14 }, upperLeg_R: { pitch: 14 },
    lowerLeg_L: { bend: 16 }, lowerLeg_R: { bend: 16 },
    upperArm_L: { pitch: 60, yaw: 14 }, upperArm_R: { pitch: 60, yaw: 14 },
    lowerArm_L: { bend: 8 }, lowerArm_R: { bend: 8 },
  } } },
  { id: "look_back", name: "回眸", pose: { joints: {
    chest: { twist: 30 }, neck: { turn: 30 }, head: { turn: 45 },
    upperArm_L: { pitch: 6, yaw: 90 }, upperArm_R: { pitch: 6, yaw: 90 },
  } } },
  { id: "phone_call", name: "打电话", pose: { joints: {
    head: { tilt: 10 },
    upperArm_R: { pitch: 32, yaw: 18 }, lowerArm_R: { bend: 142 },
    upperArm_L: { pitch: 6, yaw: 90 },
  } } },
  { id: "hand_to_chin", name: "托腮", pose: { joints: {
    head: { tilt: 7 },
    upperArm_R: { pitch: 32, yaw: 12 }, lowerArm_R: { bend: 138 }, hand_R: { bend: 22 },
    upperArm_L: { pitch: 20, yaw: 30 }, lowerArm_L: { bend: 100 },
  } } },
  { id: "hand_in_hair", name: "撩发", pose: { joints: {
    head: { tilt: 5, turn: 8 },
    upperArm_R: { pitch: 145, yaw: 40 }, lowerArm_R: { bend: 125 },
    upperArm_L: { pitch: 6, yaw: 90 },
  } } },
  { id: "wave", name: "挥手", pose: { joints: {
    head: { tilt: 5 },
    upperArm_R: { pitch: 155, yaw: 25 }, lowerArm_R: { bend: 70 }, hand_R: { side: 20 },
    upperArm_L: { pitch: 6, yaw: 90 },
  } } },
  { id: "point", name: "指向", pose: { joints: {
    upperArm_R: { pitch: 85, yaw: 0 }, lowerArm_R: { bend: 6 },
    upperArm_L: { pitch: 6, yaw: 90 },
  } } },
  { id: "arms_up", name: "举双手", pose: { joints: {
    upperArm_L: { pitch: 168, yaw: 22 }, upperArm_R: { pitch: 168, yaw: 22 },
    lowerArm_L: { bend: 12 }, lowerArm_R: { bend: 12 },
  } } },
  { id: "lie_back", name: "仰躺", pose: { joints: {
    hips: { bend: -90 },
    upperArm_L: { pitch: 18, yaw: 65 }, upperArm_R: { pitch: 18, yaw: 65 },
    upperLeg_L: { yaw: 6 }, upperLeg_R: { yaw: 6 },
  } } },
  { id: "lie_side", name: "侧躺", pose: { joints: {
    hips: { side: 85 },
    upperLeg_L: { pitch: 22, yaw: 35 }, upperLeg_R: { pitch: 22, yaw: 35 },
    lowerLeg_L: { bend: 68 }, lowerLeg_R: { bend: 68 },
    upperArm_R: { pitch: 95, yaw: 10 }, lowerArm_R: { bend: 12 },
    upperArm_L: { pitch: 65, yaw: 45 }, lowerArm_L: { bend: 60 },
  } } },
];

export const presetMap: Record<string, Pose> = Object.fromEntries(
  POSE_PRESETS.map((p) => [p.id, p.pose]),
);
