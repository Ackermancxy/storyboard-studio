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

  /* ───────── 以下为人像摄影扩充预设 ───────── */

  { id: "shade_eyes", name: "抬手遮阳", pose: { joints: {
    upperArm_R: { pitch: 130, yaw: -35 }, lowerArm_R: { bend: 115 }, hand_R: { bend: 10 },
    upperArm_L: { pitch: 6, yaw: 90 },
    head: { nod: -4 },
  } } },
  { id: "peace_sign", name: "比耶", pose: { joints: {
    head: { tilt: 6 },
    upperArm_R: { pitch: 120, yaw: 55 }, lowerArm_R: { bend: 105 },
    upperArm_L: { pitch: 6, yaw: 90 },
  } } },
  { id: "pockets", name: "插兜", pose: { joints: {
    upperArm_L: { pitch: 18, yaw: 30 }, upperArm_R: { pitch: 18, yaw: 30 },
    lowerArm_L: { bend: 95 }, lowerArm_R: { bend: 95 },
    hips: { side: 3 },
  } } },
  { id: "hand_on_wall", name: "单手扶墙", pose: { joints: {
    upperArm_R: { pitch: 65, yaw: 0 }, lowerArm_R: { bend: 10 },
    upperArm_L: { pitch: 6, yaw: 90 },
    hips: { side: 5 }, chest: { side: -4 },
  } } },
  { id: "lean_wall", name: "倚墙", pose: { joints: {
    hips: { side: 8 }, chest: { side: -9 }, head: { tilt: -5 },
    upperLeg_L: { pitch: 6, yaw: -18 }, lowerLeg_L: { bend: 10 },
    upperArm_L: { pitch: 22, yaw: -12, twist: 60 }, upperArm_R: { pitch: 22, yaw: -12, twist: 60 },
    lowerArm_L: { bend: 108 }, lowerArm_R: { bend: 108 },
  } } },
  { id: "lean_rail", name: "趴栏杆", pose: { joints: {
    spine: { bend: 26 }, chest: { bend: 14 },
    upperArm_L: { pitch: 58, yaw: 10 }, upperArm_R: { pitch: 58, yaw: 10 },
    lowerArm_L: { bend: 22 }, lowerArm_R: { bend: 22 },
    upperLeg_L: { pitch: 6 }, upperLeg_R: { pitch: 6 },
    lowerLeg_L: { bend: 8 }, lowerLeg_R: { bend: 8 },
  } } },
  { id: "sit_ledge", name: "坐台沿垂腿", pose: { joints: {
    upperLeg_L: { pitch: 85, yaw: 6 }, upperLeg_R: { pitch: 85, yaw: 6 },
    lowerLeg_L: { bend: 75 }, lowerLeg_R: { bend: 75 },
    upperArm_L: { pitch: 20, yaw: 40 }, upperArm_R: { pitch: 20, yaw: 40 },
    lowerArm_L: { bend: 28 }, lowerArm_R: { bend: 28 },
  } } },
  { id: "sit_cross", name: "盘腿坐", pose: { joints: {
    upperLeg_L: { pitch: 92, yaw: 55 }, upperLeg_R: { pitch: 92, yaw: 55 },
    lowerLeg_L: { bend: 118 }, lowerLeg_R: { bend: 118 },
    upperArm_L: { pitch: 45, yaw: 20 }, upperArm_R: { pitch: 45, yaw: 20 },
    lowerArm_L: { bend: 35 }, lowerArm_R: { bend: 35 },
  } } },
  { id: "sit_back", name: "后撑坐", pose: { joints: {
    hips: { bend: -10 }, spine: { bend: -12 },
    upperLeg_L: { pitch: 78, yaw: 8 }, upperLeg_R: { pitch: 78, yaw: 8 },
    lowerLeg_L: { bend: 58 }, lowerLeg_R: { bend: 58 },
    upperArm_L: { pitch: 22, yaw: 165 }, upperArm_R: { pitch: 22, yaw: 165 },
    lowerArm_L: { bend: 8 }, lowerArm_R: { bend: 8 },
    head: { nod: -6 },
  } } },
  { id: "sit_hug_one", name: "坐抱单膝", pose: { joints: {
    upperLeg_L: { pitch: 100, yaw: 8 }, lowerLeg_L: { bend: 112 },
    upperLeg_R: { pitch: 68, yaw: 6 }, lowerLeg_R: { bend: 28 },
    upperArm_L: { pitch: 48, yaw: 18 }, lowerArm_L: { bend: 98 },
    upperArm_R: { pitch: 42, yaw: 25 }, lowerArm_R: { bend: 88 },
    spine: { bend: 6 },
  } } },
  { id: "kneel_sit", name: "跪坐（正座）", pose: { joints: {
    upperLeg_L: { pitch: 0 }, upperLeg_R: { pitch: 0 },
    lowerLeg_L: { bend: 148 }, lowerLeg_R: { bend: 148 },
    hips: { bend: 8 },
    upperArm_L: { pitch: 28, yaw: 15 }, upperArm_R: { pitch: 28, yaw: 15 },
    lowerArm_L: { bend: 38 }, lowerArm_R: { bend: 38 },
  } } },
  { id: "tiptoe", name: "踮脚", pose: { joints: {
    foot_L: { point: 42 }, foot_R: { point: 42 },
    upperLeg_L: { pitch: 4 }, upperLeg_R: { pitch: 4 },
    upperArm_L: { pitch: 28, yaw: 108 }, upperArm_R: { pitch: 28, yaw: 108 },
    lowerArm_L: { bend: 12 }, lowerArm_R: { bend: 12 },
    spine: { bend: -4 },
  } } },
  { id: "jump", name: "跳跃（记得抬 elevation）", pose: { joints: {
    spine: { bend: -8 },
    upperArm_L: { pitch: 160, yaw: 35 }, upperArm_R: { pitch: 160, yaw: 35 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 20 },
    upperLeg_L: { pitch: 42, yaw: 15 }, lowerLeg_L: { bend: 88 },
    upperLeg_R: { pitch: 30, yaw: -10 }, lowerLeg_R: { bend: 100 },
  } } },
  { id: "spin_skirt", name: "旋转甩裙", pose: { joints: {
    hips: { twist: 25 }, chest: { twist: -14 },
    upperArm_L: { pitch: 78, yaw: 72 }, upperArm_R: { pitch: 78, yaw: 72 },
    lowerArm_L: { bend: 8 }, lowerArm_R: { bend: 8 },
    upperLeg_R: { pitch: -12, yaw: 180 }, lowerLeg_R: { bend: 25 }, foot_R: { point: 35 },
    head: { turn: -12, tilt: 4 },
  } } },
  { id: "carry_bag", name: "拎包", pose: { joints: {
    upperArm_R: { pitch: 8, yaw: 68 }, lowerArm_R: { bend: 22 }, hand_R: { bend: 18 },
    upperArm_L: { pitch: 6, yaw: 90 },
    hips: { side: -3 }, head: { turn: 8 },
  } } },
  { id: "hold_skirt", name: "提裙摆", pose: { joints: {
    upperArm_L: { pitch: 26, yaw: 72 }, upperArm_R: { pitch: 26, yaw: 72 },
    lowerArm_L: { bend: 32 }, lowerArm_R: { bend: 32 },
    hand_L: { side: 12 }, hand_R: { side: 12 },
    spine: { bend: -3 }, head: { tilt: 4 },
  } } },
  { id: "stretch", name: "伸懒腰", pose: { joints: {
    upperArm_L: { pitch: 172, yaw: 18 }, upperArm_R: { pitch: 172, yaw: 18 },
    lowerArm_L: { bend: 28 }, lowerArm_R: { bend: 28 },
    spine: { bend: -10 }, chest: { bend: -6 }, head: { nod: -12 },
    foot_L: { point: 30 }, foot_R: { point: 30 },
  } } },
  { id: "bow", name: "鞠躬", pose: { joints: {
    spine: { bend: 38 }, chest: { bend: 14 }, head: { nod: 18 },
    upperArm_L: { pitch: 22, yaw: 18 }, upperArm_R: { pitch: 22, yaw: 18 },
    lowerArm_L: { bend: 12 }, lowerArm_R: { bend: 12 },
  } } },
  { id: "hands_behind", name: "背手", pose: { joints: {
    upperArm_L: { pitch: 14, yaw: 150 }, upperArm_R: { pitch: 14, yaw: 150 },
    lowerArm_L: { bend: 58 }, lowerArm_R: { bend: 58 },
    chest: { bend: -5 }, head: { nod: -4 },
  } } },
  { id: "selfie", name: "自拍", pose: { joints: {
    upperArm_R: { pitch: 118, yaw: -22 }, lowerArm_R: { bend: 62 }, hand_R: { bend: 10 },
    upperArm_L: { pitch: 40, yaw: 95 }, lowerArm_L: { bend: 100 },
    head: { tilt: 8, nod: -4 },
  } } },
  { id: "lie_stomach", name: "趴撑", pose: { joints: {
    hips: { bend: 90 }, spine: { bend: -14 }, chest: { bend: -8 },
    upperArm_L: { pitch: 42, yaw: 18 }, upperArm_R: { pitch: 42, yaw: 18 },
    lowerArm_L: { bend: 92 }, lowerArm_R: { bend: 92 },
    upperLeg_L: { yaw: 10 }, upperLeg_R: { yaw: 10 },
    lowerLeg_L: { bend: 18 }, lowerLeg_R: { bend: 18 },
    foot_L: { point: 40 }, foot_R: { point: 40 },
    head: { nod: -18 },
  } } },
  { id: "heart_over_head", name: "头顶比心", pose: { joints: {
    upperArm_L: { pitch: 165, yaw: 48 }, upperArm_R: { pitch: 165, yaw: 48 },
    lowerArm_L: { bend: 118 }, lowerArm_R: { bend: 118 },
    head: { tilt: 5 },
  } } },
  { id: "wave_high", name: "大力挥手", pose: { joints: {
    upperArm_R: { pitch: 170, yaw: 28 }, lowerArm_R: { bend: 18 }, hand_R: { side: 25 },
    upperArm_L: { pitch: 6, yaw: 90 },
    hips: { side: 4 }, chest: { side: -4 }, head: { tilt: -5 },
    foot_L: { point: 18 },
  } } },
  { id: "salute", name: "敬礼", pose: { joints: {
    upperArm_R: { pitch: 100, yaw: -12 }, lowerArm_R: { bend: 100 },
    upperArm_L: { pitch: 6, yaw: 90 },
    head: { turn: 4 },
  } } },
  { id: "walk_lookback", name: "边走边回眸", pose: { joints: {
    upperLeg_L: { pitch: 25 }, lowerLeg_L: { bend: 10 },
    upperLeg_R: { pitch: 15, yaw: 180 }, lowerLeg_R: { bend: 35 },
    upperArm_L: { pitch: 20, yaw: 180 },
    upperArm_R: { pitch: 20, yaw: 0 }, lowerArm_R: { bend: 20 },
    chest: { twist: 24 }, neck: { turn: 28 }, head: { turn: 38 },
  } } },
  { id: "arms_out", name: "张开双臂", pose: { joints: {
    upperArm_L: { pitch: 85, yaw: 75 }, upperArm_R: { pitch: 85, yaw: 75 },
    lowerArm_L: { bend: 8 }, lowerArm_R: { bend: 8 },
    spine: { bend: -5 }, head: { nod: -8 },
  } } },
  { id: "cover_face", name: "捂脸", pose: { joints: {
    upperArm_L: { pitch: 92, yaw: -28 }, upperArm_R: { pitch: 92, yaw: -28 },
    lowerArm_L: { bend: 132 }, lowerArm_R: { bend: 132 },
    head: { nod: 10 },
  } } },
  { id: "model_s", name: "S形站姿", pose: { joints: {
    hips: { side: 9 }, chest: { side: -9, twist: 8 },
    upperLeg_L: { pitch: 14, yaw: 26 }, lowerLeg_L: { bend: 22 },
    upperArm_R: { pitch: 42, yaw: 100, twist: 30 }, lowerArm_R: { bend: 108 },
    upperArm_L: { pitch: 6, yaw: 90 },
    head: { tilt: -6 },
  } } },
  { id: "look_up", name: "仰头远望", pose: { joints: {
    head: { nod: -25 }, neck: { nod: -8 }, spine: { bend: -5 },
    upperArm_L: { pitch: 6, yaw: 90 }, upperArm_R: { pitch: 6, yaw: 90 },
  } } },
  { id: "rail_lookback", name: "扶栏回眸", pose: { joints: {
    spine: { bend: 18 },
    upperArm_L: { pitch: 55, yaw: 12 }, upperArm_R: { pitch: 55, yaw: 12 },
    lowerArm_L: { bend: 18 }, lowerArm_R: { bend: 18 },
    chest: { twist: 24 }, neck: { turn: 28 }, head: { turn: 40 },
  } } },
  { id: "sit_side", name: "侧坐伸腿", pose: { joints: {
    upperLeg_L: { pitch: 85, yaw: 18 }, upperLeg_R: { pitch: 82, yaw: 24 },
    lowerLeg_L: { bend: 14 }, lowerLeg_R: { bend: 20 },
    hips: { bend: -6 }, spine: { bend: -8 },
    upperArm_R: { pitch: 20, yaw: 158 }, lowerArm_R: { bend: 8 },
    upperArm_L: { pitch: 35, yaw: 30 }, lowerArm_L: { bend: 45 },
  } } },
  { id: "kick_back", name: "后勾腿", pose: { joints: {
    upperLeg_R: { pitch: -18, yaw: 180 }, lowerLeg_R: { bend: 95 }, foot_R: { point: 38 },
    hips: { side: 4 }, chest: { side: -4 },
    upperArm_L: { pitch: 30, yaw: 105 }, upperArm_R: { pitch: 20, yaw: 95 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 30 },
  } } },
];

export const presetMap: Record<string, Pose> = Object.fromEntries(
  POSE_PRESETS.map((p) => [p.id, p.pose]),
);
