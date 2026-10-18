// P1：内置姿势预设（SPEC §5.7）。
// 数值不是目测起点：每个预设都用 tools/pose-analysis 对实测骨架做过几何验收
// （落地、重心、穿插、关节限位、扶手/座面高度），当前 118 个全部 0 error / 0 warning。
// 改任何预设后跑 `npm run check:poses`，别靠渲染截图判断。
import type { Pose } from "../types";

/**
 * 预设验收环境（只给 `tools/pose-analysis` 用，运行时忽略）。
 *
 * 「坐椅子」「扶墙」这类动作离不开场景道具；验收时按这里声明的最小环境
 * 搭一个虚拟座面/墙/栏杆，才能把「预设本身做不到位」和「场景里没道具」分开。
 */
export interface PresetAudit {
  /** stand=平地自由动作；floor=身体接触地面；seat=标准椅；ledge=台沿垂腿；
   *  wall-front=手扶墙；wall-back=背倚墙；rail=扶栏；air=离地动作 */
  kind?: "stand" | "floor" | "seat" | "ledge" | "wall-front" | "wall-back" | "rail" | "air";
  /** 座面/台沿顶面高度（米） */
  top?: number;
  /** 高度允许误差（米） */
  tol?: number;
  /** air 类动作在验收时抬起的离地高度（米） */
  elevation?: number;
}

export interface PresetDef {
  id: string;
  name: string;
  pose: Pose;
  audit?: PresetAudit;
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
    upperArm_L: { pitch: 61.25, yaw: 112.5, twist: 75 }, upperArm_R: { pitch: 61.25, yaw: 112.5, twist: 75 },
    lowerArm_L: { bend: 96.25, side: 66.25 }, lowerArm_R: { bend: 96.25, side: -66.25 },
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
  { id: "sit_chair", name: "坐椅子", audit: { kind: "seat", top: 0.45 }, pose: { joints: {
    upperLeg_L: { pitch: 88, yaw: 8 }, upperLeg_R: { pitch: 88, yaw: 8 },
    lowerLeg_L: { bend: 88 }, lowerLeg_R: { bend: 88 },
    upperArm_L: { pitch: 25, yaw: 15 }, upperArm_R: { pitch: 25, yaw: 15 },
    lowerArm_L: { bend: 30 }, lowerArm_R: { bend: 30 },
  } } },
  { id: "sit_floor", name: "席地抱膝", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -25 }, spine: { bend: 40 }, chest: { bend: 30 }, neck: { nod: 8 }, head: { nod: 10 },
    upperLeg_L: { pitch: 130, yaw: 14 }, upperLeg_R: { pitch: 130, yaw: 14 },
    lowerLeg_L: { bend: 110 }, lowerLeg_R: { bend: 110 },
    foot_L: { point: 45 }, foot_R: { point: 45 },
    upperArm_L: { pitch: 24.38, yaw: 56.25, twist: -7.5 }, upperArm_R: { pitch: 24.38, yaw: 56.25, twist: -7.5 },
    lowerArm_L: { bend: 117.5, side: 67.5 }, lowerArm_R: { bend: 117.5, side: -67.5 },
  } } },
  { id: "kneel", name: "双膝跪", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: 8 }, chest: { bend: 4 },
    upperLeg_L: { pitch: 10, yaw: 6 }, upperLeg_R: { pitch: 10, yaw: 6 },
    lowerLeg_L: { bend: 120 }, lowerLeg_R: { bend: 120 },
    upperArm_L: { pitch: 8, yaw: 90 }, upperArm_R: { pitch: 8, yaw: 90 },
  } } },
  { id: "kneel_one", name: "单膝跪", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: 20 }, chest: { bend: 8 }, head: { nod: 4 },
    upperLeg_L: { pitch: 10, yaw: 8 }, lowerLeg_L: { bend: 110 }, foot_L: { point: 30 },
    upperLeg_R: { pitch: 90, yaw: 10 }, lowerLeg_R: { bend: 40 }, foot_R: { point: 5 },
    upperArm_L: { pitch: 8, yaw: 90 },
    upperArm_R: { pitch: 39.38, yaw: -1.25, twist: 63.75 }, lowerArm_R: { bend: 30, side: 12.5 },
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
    upperArm_R: { pitch: 104, yaw: 28, twist: -24 }, lowerArm_R: { bend: 150, side: -70 }, hand_R: { bend: 22 },
    upperArm_L: { pitch: 8, yaw: 0 },
  } } },
  { id: "hand_to_chin", name: "托腮", pose: { joints: {
    head: { tilt: 7 },
    upperArm_R: { pitch: 101.25, yaw: 16.25, twist: 33.75 }, lowerArm_R: { bend: 150, side: -70 }, hand_R: { bend: 40 },
    upperArm_L: { pitch: 8, yaw: 0 },
  } } },
  { id: "hand_in_hair", name: "撩发", pose: { joints: {
    head: { tilt: 5, turn: 8 },
    upperArm_R: { pitch: 110, yaw: 5, twist: -22 }, lowerArm_R: { bend: 146, side: -70 }, hand_R: { bend: 49 },
    upperArm_L: { pitch: 8, yaw: 0 },
  } } },
  { id: "wave", name: "挥手", pose: { joints: {
    head: { tilt: 5 },
    upperArm_R: { pitch: 124.38, yaw: 21.25, twist: 0 }, lowerArm_R: { bend: 36.25, side: 70 }, hand_R: { side: 20 },
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
  { id: "lie_back", name: "仰躺", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -90 },
    upperArm_L: { pitch: 18, yaw: 65 }, upperArm_R: { pitch: 18, yaw: 65 },
    upperLeg_L: { yaw: 6 }, upperLeg_R: { yaw: 6 },
  } } },
  { id: "lie_side", name: "侧躺", audit: { kind: "floor" }, pose: { joints: {
    hips: { side: 85 },
    upperLeg_L: { pitch: 4, yaw: 0 }, lowerLeg_L: { bend: 30 },
    upperLeg_R: { pitch: 12, yaw: 0 }, lowerLeg_R: { bend: 55 },
    upperArm_R: { pitch: 80, yaw: 0 }, lowerArm_R: { bend: 20 },
    upperArm_L: { pitch: 20, yaw: 60 }, lowerArm_L: { bend: 40 },
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
  { id: "hands_on_thighs", name: "手搭大腿", pose: { joints: {
    upperArm_L: { pitch: 18, yaw: 30 }, upperArm_R: { pitch: 18, yaw: 30 },
    lowerArm_L: { bend: 95 }, lowerArm_R: { bend: 95 },
    hips: { side: 3 },
  } } },
  { id: "hand_on_wall", name: "单手扶墙", audit: { kind: "wall-front" }, pose: { joints: {
    upperArm_R: { pitch: 65, yaw: 0 }, lowerArm_R: { bend: 10 },
    upperArm_L: { pitch: 6, yaw: 90 },
    hips: { side: 5 }, chest: { side: -4 },
  } } },
  { id: "lean_wall", name: "倚墙", audit: { kind: "wall-back" }, pose: { joints: {
    spine: { bend: -15 }, chest: { bend: -8 }, neck: { nod: 3 }, head: { nod: 3 },
    upperLeg_L: { pitch: 9, yaw: -4 }, lowerLeg_L: { bend: 8 }, foot_L: { point: 8 },
    upperLeg_R: { pitch: 12, yaw: -8 }, lowerLeg_R: { bend: 10 }, foot_R: { point: 8 },
    upperArm_L: { pitch: 22, yaw: -12, twist: 60 }, upperArm_R: { pitch: 22, yaw: -12, twist: 60 },
    lowerArm_L: { bend: 108 }, lowerArm_R: { bend: 108 },
  } } },
  { id: "lean_rail", name: "趴栏杆", audit: { kind: "rail" }, pose: { joints: {
    spine: { bend: 26 }, chest: { bend: 14 },
    upperArm_L: { pitch: 58, yaw: 10 }, upperArm_R: { pitch: 58, yaw: 10 },
    lowerArm_L: { bend: 22 }, lowerArm_R: { bend: 22 },
    upperLeg_L: { pitch: 6 }, upperLeg_R: { pitch: 6 },
    lowerLeg_L: { bend: 8 }, lowerLeg_R: { bend: 8 },
  } } },
  { id: "sit_ledge", name: "坐台沿垂腿", audit: { kind: "ledge", top: 0.64 }, pose: { joints: {
    upperLeg_L: { pitch: 85, yaw: 6 }, upperLeg_R: { pitch: 85, yaw: 6 },
    lowerLeg_L: { bend: 75 }, lowerLeg_R: { bend: 75 },
    upperArm_L: { pitch: 20, yaw: 40 }, upperArm_R: { pitch: 20, yaw: 40 },
    lowerArm_L: { bend: 28 }, lowerArm_R: { bend: 28 },
  } } },
  { id: "sit_cross", name: "侧盘坐", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -20, twist: 19 }, spine: { bend: 24 }, chest: { bend: 6 },
    upperLeg_L: { pitch: 110, yaw: 75, twist: 34 }, lowerLeg_L: { bend: 125 }, foot_L: { point: 20 },
    upperLeg_R: { pitch: 92, yaw: -30, twist: -25 }, lowerLeg_R: { bend: 65 }, foot_R: { point: -2 },
  } } },
  { id: "sit_back", name: "后撑坐", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -35 }, spine: { bend: 0 }, chest: { bend: 0 }, head: { nod: 4 },
    upperLeg_L: { pitch: 70, yaw: 8 }, upperLeg_R: { pitch: 70, yaw: 8 },
    lowerLeg_L: { bend: 30 }, lowerLeg_R: { bend: 30 },
    upperArm_L: { pitch: 9.38, yaw: 136.25, twist: -60 }, upperArm_R: { pitch: 9.38, yaw: 136.25, twist: -60 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 20 },
  } } },
  { id: "sit_hug_one", name: "坐抱单膝", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -15 }, spine: { bend: 8 }, chest: { bend: 6 }, neck: { nod: 4 }, head: { nod: 4 },
    upperLeg_L: { pitch: 130, yaw: 16 }, lowerLeg_L: { bend: 90 }, foot_L: { point: 35 },
    upperLeg_R: { pitch: 75, yaw: 10 }, lowerLeg_R: { bend: 0 },
    upperArm_L: { pitch: 113.13, yaw: 41.25, twist: 75 }, lowerArm_L: { bend: 93.75, side: 51.25 },
    upperArm_R: { pitch: 76.25, yaw: -23.75, twist: 20.63 }, lowerArm_R: { bend: 31.25, side: -21.25 },
  } } },
  { id: "kneel_sit", name: "跪坐（正座）", audit: { kind: "floor" }, pose: { joints: {
    upperLeg_L: { pitch: 30 }, upperLeg_R: { pitch: 30 },
    lowerLeg_L: { bend: 122 }, lowerLeg_R: { bend: 122 },
    foot_L: { point: 45 }, foot_R: { point: 45 },
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
  { id: "jump", name: "跳跃（记得抬 elevation）", audit: { kind: "air", elevation: 0.28 }, pose: { joints: {
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
    upperArm_L: { pitch: 14, yaw: 171, twist: 62 }, upperArm_R: { pitch: 14, yaw: 171, twist: 62 },
    hand_L: { bend: -20 }, hand_R: { bend: -20 },
    chest: { bend: -5 }, head: { nod: -4 },
  } } },
  { id: "selfie", name: "自拍", pose: { joints: {
    upperArm_R: { pitch: 118, yaw: -22 }, lowerArm_R: { bend: 62 }, hand_R: { bend: 10 },
    upperArm_L: { pitch: 40, yaw: 95 }, lowerArm_L: { bend: 100 },
    head: { tilt: 8, nod: -4 },
  } } },
  { id: "lie_stomach", name: "趴撑", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: 80 }, spine: { bend: -20 }, chest: { bend: -10 }, head: { nod: -18 },
    upperArm_L: { pitch: 42, yaw: 18 }, upperArm_R: { pitch: 42, yaw: 18 },
    lowerArm_L: { bend: 92 }, lowerArm_R: { bend: 92 },
    upperLeg_L: { pitch: 0, yaw: 10 }, upperLeg_R: { pitch: 0, yaw: 10 },
    lowerLeg_L: { bend: 0 }, lowerLeg_R: { bend: 0 },
    foot_L: { point: 40 }, foot_R: { point: 40 },
  } } },
  { id: "heart_over_head", name: "头顶比心", pose: { joints: {
    upperArm_L: { pitch: 126.88, yaw: 73.75, twist: -90 }, upperArm_R: { pitch: 121.25, yaw: 68.75, twist: -90 },
    lowerArm_L: { bend: 81.25, side: 66.25 }, lowerArm_R: { bend: 81.25, side: -66.25 },
    head: { tilt: 5 },
  } } },
  { id: "wave_high", name: "大力挥手", pose: { joints: {
    upperArm_R: { pitch: 105.63, yaw: 125, twist: -90 }, lowerArm_R: { bend: 81.25, side: -65 }, hand_R: { side: 25 },
    upperArm_L: { pitch: 6, yaw: 90 },
    hips: { side: 4 }, chest: { side: -4 }, head: { tilt: -5 },
    foot_L: { point: 18 },
  } } },
  { id: "salute", name: "敬礼", pose: { joints: {
    upperArm_R: { pitch: 104, yaw: 36, twist: -17 }, lowerArm_R: { bend: 141, side: -66 }, hand_R: { bend: 54 },
    upperArm_L: { pitch: 8, yaw: 0 },
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
    upperArm_L: { pitch: 83.75, yaw: 13.75, twist: 20.63 }, upperArm_R: { pitch: 85, yaw: 12.5, twist: 24.38 },
    lowerArm_L: { bend: 145, side: 68.75 }, lowerArm_R: { bend: 148.75, side: -66.25 },
    hand_L: { bend: 30 }, hand_R: { bend: 30 },
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
  { id: "rail_lookback", name: "扶栏回眸", audit: { kind: "rail" }, pose: { joints: {
    spine: { bend: 18 },
    upperArm_L: { pitch: 55, yaw: 12 }, upperArm_R: { pitch: 55, yaw: 12 },
    lowerArm_L: { bend: 18 }, lowerArm_R: { bend: 18 },
    chest: { twist: 24 }, neck: { turn: 28 }, head: { turn: 40 },
  } } },
  { id: "sit_side", name: "侧坐伸腿", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: 10 }, chest: { bend: 4 },
    upperLeg_L: { pitch: 95, yaw: 65 }, lowerLeg_L: { bend: 30 }, foot_L: { point: 20 },
    upperLeg_R: { pitch: 90, yaw: -30 }, lowerLeg_R: { bend: 0 }, foot_R: { point: 20 },
  } } },
  { id: "kick_back", name: "后勾腿", pose: { joints: {
    upperLeg_R: { pitch: -18, yaw: 180 }, lowerLeg_R: { bend: 95 }, foot_R: { point: 38 },
    hips: { side: 4 }, chest: { side: -4 },
    upperArm_L: { pitch: 30, yaw: 105 }, upperArm_R: { pitch: 20, yaw: 95 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 30 },
  } } },

  /* ───────── 人像摄影扩充：站 / 走 / 道具（已通过几何验收） ───────── */

  { id: "contrapposto", name: "对立式站姿", pose: { joints: {
    hips: { side: 6 }, chest: { side: -5, twist: 6 }, head: { tilt: -4, turn: 8 },
    upperLeg_L: { pitch: 6, yaw: 12 }, lowerLeg_L: { bend: 18 }, foot_L: { point: 6 },
    upperLeg_R: { pitch: 4, yaw: 2 }, upperArm_L: { pitch: 10, yaw: 88 }, upperArm_R: { pitch: 12, yaw: 92 },
    lowerArm_R: { bend: 18 }
  } } },
  { id: "legs_crossed", name: "交叉腿站", pose: { joints: {
    hips: { side: 5 }, chest: { side: -4 }, upperLeg_L: { pitch: 8, yaw: 18 }, lowerLeg_L: { bend: 6 },
    upperLeg_R: { pitch: 18, yaw: -26, twist: 10 }, lowerLeg_R: { bend: 14 }, foot_R: { point: 10 },
    upperArm_L: { pitch: 8, yaw: 88 }, upperArm_R: { pitch: 8, yaw: 88 }
  } } },
  { id: "hands_clasped_front", name: "双手交握身前", pose: { joints: {
    upperArm_L: { pitch: 38, yaw: 78 }, lowerArm_L: { bend: 95, side: 30 }, upperArm_R: { pitch: 38, yaw: 78 },
    lowerArm_R: { bend: 95, side: -30 }, head: { nod: 4 }
  } } },
  { id: "arms_behind_head", name: "双手抱头", pose: { joints: {
    upperArm_L: { pitch: 145, yaw: 55 }, lowerArm_L: { bend: 120, side: 40 },
    upperArm_R: { pitch: 145, yaw: 55 }, lowerArm_R: { bend: 120, side: -40 }, head: { nod: -5 }
  } } },
  { id: "praying", name: "双手合十", pose: { joints: {
    upperArm_L: { pitch: 50, yaw: 80 }, lowerArm_L: { bend: 125, side: 25 },
    upperArm_R: { pitch: 50, yaw: 80 }, lowerArm_R: { bend: 125, side: -25 }, head: { nod: 6 }
  } } },
  { id: "blow_kiss", name: "飞吻", pose: { joints: {
    upperArm_R: { pitch: 101.25, yaw: 16.25, twist: 33.75 }, lowerArm_R: { bend: 150, side: -70 },
    hand_R: { bend: 40 }, upperArm_L: { pitch: 8, yaw: 0 }, head: { tilt: 6 }
  } } },
  { id: "adjust_collar", name: "整理衣领", pose: { joints: {
    upperArm_R: { pitch: 75, yaw: 40, twist: 20 }, lowerArm_R: { bend: 120, side: -50 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 8, yaw: 0 }, head: { nod: 4 }
  } } },
  { id: "adjust_hat", name: "扶帽檐", pose: { joints: {
    upperArm_R: { pitch: 120, yaw: 20, twist: -20 }, lowerArm_R: { bend: 140, side: -60 },
    hand_R: { bend: 30 }, upperArm_L: { pitch: 8, yaw: 0 }, head: { nod: -4 }
  } } },
  { id: "shrug", name: "摊手", pose: { joints: {
    upperArm_L: { pitch: 40, yaw: 60 }, lowerArm_L: { bend: 90, side: 40 }, upperArm_R: { pitch: 40, yaw: 60 },
    lowerArm_R: { bend: 90, side: -40 }, head: { tilt: 6 }, chest: { bend: -3 }
  } } },
  { id: "heart_hands", name: "胸前比心", pose: { joints: {
    upperArm_L: { pitch: 55, yaw: 60 }, lowerArm_L: { bend: 130, side: 60 },
    upperArm_R: { pitch: 55, yaw: 60 }, lowerArm_R: { bend: 130, side: -60 }, head: { tilt: 5, nod: 4 }
  } } },
  { id: "surprise", name: "惊讶捂嘴", pose: { joints: {
    upperArm_L: { pitch: 83.75, yaw: 13.75, twist: 20.63 }, lowerArm_L: { bend: 145, side: 68.75 },
    hand_L: { bend: 30 }, upperArm_R: { pitch: 85, yaw: 12.5, twist: 24.38 },
    lowerArm_R: { bend: 148.75, side: -66.25 }, hand_R: { bend: 30 }, head: { nod: -8 }, neck: { nod: -4 }
  } } },
  { id: "look_over_shoulder", name: "侧身回眸", pose: { joints: {
    hips: { twist: -8 }, chest: { twist: 35 }, neck: { turn: 30 }, head: { turn: 45, tilt: -4 },
    upperArm_L: { pitch: 8, yaw: 88 }, upperArm_R: { pitch: 10, yaw: 92 }
  } } },
  { id: "reach_up", name: "单手够高", pose: { joints: {
    upperArm_R: { pitch: 175, yaw: 10 }, lowerArm_R: { bend: 5 }, upperArm_L: { pitch: 8, yaw: 88 },
    hips: { side: 8 }, foot_L: { point: 25 }, foot_R: { point: 25 }, head: { nod: -18 }
  } } },
  { id: "lean_forward_hands_back", name: "前倾背手", pose: { joints: {
    spine: { bend: 25 }, chest: { bend: 8 }, neck: { nod: -10 },
    upperArm_L: { pitch: 14, yaw: 171, twist: 62 }, upperArm_R: { pitch: 14, yaw: 171, twist: 62 },
    hand_L: { bend: -20 }, hand_R: { bend: -20 }
  } } },
  { id: "tiptoe_look", name: "踮脚张望", pose: { joints: {
    foot_L: { point: 42 }, foot_R: { point: 42 }, upperArm_R: { pitch: 130, yaw: -35 },
    lowerArm_R: { bend: 115 }, hand_R: { bend: 10 }, upperArm_L: { pitch: 8, yaw: 88 }, head: { nod: -4 }
  } } },
  { id: "walk_stride", name: "大步走", pose: { joints: {
    upperLeg_L: { pitch: 38, yaw: 4 }, lowerLeg_L: { bend: 18 }, upperLeg_R: { pitch: 8, yaw: 180 },
    lowerLeg_R: { bend: 48 }, upperArm_L: { pitch: 32, yaw: 180 }, lowerArm_L: { bend: 30 },
    upperArm_R: { pitch: 32, yaw: 0 }, lowerArm_R: { bend: 30 }, chest: { twist: -8 }
  } } },
  { id: "run_lookback", name: "跑动回眸", pose: { joints: {
    spine: { bend: 10 }, chest: { twist: 22 }, neck: { turn: 26 }, head: { turn: 40 },
    upperLeg_L: { pitch: 55 }, lowerLeg_L: { bend: 65 }, upperLeg_R: { pitch: 20, yaw: 180 },
    lowerLeg_R: { bend: 90 }, upperArm_L: { pitch: 40, yaw: 180 }, lowerArm_L: { bend: 80 },
    upperArm_R: { pitch: 40, yaw: 0 }, lowerArm_R: { bend: 80 }
  } } },
  { id: "carry_bag_shoulder", name: "单肩背包", pose: { joints: {
    upperArm_R: { pitch: 70, yaw: 20 }, lowerArm_R: { bend: 135, side: -30 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 8, yaw: 88 }, hips: { side: 3 }, head: { turn: -8 }
  } } },
  { id: "hold_umbrella", name: "撑伞", pose: { joints: {
    upperArm_R: { pitch: 160, yaw: 15 }, lowerArm_R: { bend: 30, side: -20 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 8, yaw: 88 }, head: { nod: -6 }
  } } },
  { id: "hold_camera", name: "举相机", pose: { joints: {
    upperArm_L: { pitch: 83.75, yaw: 13.75, twist: 20.63 }, lowerArm_L: { bend: 145, side: 68.75 },
    hand_L: { bend: 20 }, upperArm_R: { pitch: 85, yaw: 12.5, twist: 24.38 },
    lowerArm_R: { bend: 148.75, side: -66.25 }, hand_R: { bend: 20 }, head: { nod: 2 }
  } } },
  { id: "hold_book", name: "捧书", pose: { joints: {
    upperArm_L: { pitch: 30, yaw: 55 }, lowerArm_L: { bend: 100, side: 35 },
    upperArm_R: { pitch: 30, yaw: 55 }, lowerArm_R: { bend: 100, side: -35 }, head: { nod: 14 }
  } } },
  { id: "hold_flowers", name: "捧花", pose: { joints: {
    upperArm_L: { pitch: 45, yaw: 55 }, lowerArm_L: { bend: 105, side: 40 },
    upperArm_R: { pitch: 45, yaw: 55 }, lowerArm_R: { bend: 105, side: -40 }, head: { nod: 6, tilt: 4 }
  } } },
  { id: "phone_text", name: "低头看手机", pose: { joints: {
    upperArm_L: { pitch: 45, yaw: 45 }, lowerArm_L: { bend: 115, side: 45 },
    upperArm_R: { pitch: 45, yaw: 45 }, lowerArm_R: { bend: 115, side: -45 }, head: { nod: 22 },
    neck: { nod: 8 }
  } } },
  { id: "hold_cup", name: "捧杯", pose: { joints: {
    upperArm_R: { pitch: 35, yaw: 30 }, lowerArm_R: { bend: 100, side: -40 }, hand_R: { bend: 15 },
    upperArm_L: { pitch: 8, yaw: 88 }, head: { nod: 5 }
  } } },
  { id: "hold_hat", name: "拿帽垂手", pose: { joints: {
    upperArm_R: { pitch: 12, yaw: 70 }, lowerArm_R: { bend: 30 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 8, yaw: 88 }, head: { tilt: 4 }
  } } },
  { id: "point_up", name: "指天", pose: { joints: {
    upperArm_R: { pitch: 175, yaw: 8 }, lowerArm_R: { bend: 0 }, upperArm_L: { pitch: 8, yaw: 88 },
    head: { nod: -20 }
  } } },
  { id: "point_side", name: "指侧方", pose: { joints: {
    upperArm_R: { pitch: 90, yaw: 78 }, lowerArm_R: { bend: 0 }, upperArm_L: { pitch: 8, yaw: 88 },
    head: { turn: -22 }
  } } },
  { id: "fist_cheer", name: "握拳加油", pose: { joints: {
    upperArm_R: { pitch: 110, yaw: 30 }, lowerArm_R: { bend: 120 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 30, yaw: 100 }, lowerArm_L: { bend: 40 }, head: { tilt: -5 }, chest: { bend: -4 }
  } } },
  { id: "wave_both", name: "双手挥", pose: { joints: {
    upperArm_L: { pitch: 124.38, yaw: 21.25 }, lowerArm_L: { bend: 36.25, side: -70 }, hand_L: { side: 20 },
    upperArm_R: { pitch: 124.38, yaw: 21.25 }, lowerArm_R: { bend: 36.25, side: 70 }, hand_R: { side: -20 },
    head: { tilt: 5 }
  } } },
  { id: "cat_pose", name: "猫爪", pose: { joints: {
    upperArm_L: { pitch: 83.75, yaw: 13.75, twist: 20.63 }, lowerArm_L: { bend: 145, side: 68.75 },
    hand_L: { bend: 30 }, upperArm_R: { pitch: 85, yaw: 12.5, twist: 24.38 },
    lowerArm_R: { bend: 148.75, side: -66.25 }, hand_R: { bend: 30 }, head: { nod: 6, tilt: 8 }
  } } },
  { id: "peace_eye", name: "比耶贴眼", pose: { joints: {
    upperArm_R: { pitch: 110, yaw: 10 }, lowerArm_R: { bend: 145, side: -65 }, hand_R: { bend: 20 },
    upperArm_L: { pitch: 8, yaw: 88 }, head: { tilt: -8, turn: 4 }
  } } },
  { id: "stretch_side", name: "侧伸懒腰", pose: { joints: {
    upperArm_L: { pitch: 170, yaw: 25 }, lowerArm_L: { bend: 20 }, upperArm_R: { pitch: 8, yaw: 88 },
    hips: { side: 6 }, chest: { side: -12 }, head: { tilt: -8 }
  } } },
  { id: "hand_on_wall_lookback", name: "扶墙回眸", audit: { kind: "wall-front" }, pose: { joints: {
    upperArm_R: { pitch: 65, yaw: 0 }, lowerArm_R: { bend: 10 }, upperArm_L: { pitch: 8, yaw: 88 },
    hips: { side: 5 }, chest: { twist: 28, side: -4 }, neck: { turn: 26 }, head: { turn: 40 }
  } } },
  { id: "lean_wall_lookback", name: "倚墙回眸", audit: { kind: "wall-back" }, pose: { joints: {
    spine: { bend: -15 }, chest: { bend: -8, twist: 26 }, neck: { nod: 3, turn: 24 },
    head: { nod: 3, turn: 38 }, upperLeg_L: { pitch: 9, yaw: -4 }, lowerLeg_L: { bend: 8 },
    foot_L: { point: 8 }, upperLeg_R: { pitch: 12, yaw: -8 }, lowerLeg_R: { bend: 10 }, foot_R: { point: 8 },
    upperArm_L: { pitch: 22, yaw: -12, twist: 60 }, upperArm_R: { pitch: 22, yaw: -12, twist: 60 },
    lowerArm_L: { bend: 108 }, lowerArm_R: { bend: 108 }
  } } },
  { id: "lean_wall_one_foot", name: "倚墙抬脚", audit: { kind: "wall-back" }, pose: { joints: {
    spine: { bend: -15 }, chest: { bend: -8 }, neck: { nod: 3 }, head: { nod: 3, tilt: 4 },
    upperLeg_L: { pitch: 9, yaw: -4 }, lowerLeg_L: { bend: 8 }, foot_L: { point: 8 },
    upperLeg_R: { pitch: 22, yaw: -30 }, lowerLeg_R: { bend: 38 }, foot_R: { point: 24 },
    upperArm_L: { pitch: 22, yaw: -12, twist: 60 }, upperArm_R: { pitch: 22, yaw: -12, twist: 60 },
    lowerArm_L: { bend: 108 }, lowerArm_R: { bend: 108 }
  } } },
  { id: "back_to_wall_hands_behind", name: "背手靠墙", audit: { kind: "wall-back" }, pose: { joints: {
    spine: { bend: -15 }, chest: { bend: -8 }, neck: { nod: 3 }, head: { nod: 3 },
    upperLeg_L: { pitch: 9, yaw: -4 }, lowerLeg_L: { bend: 8 }, foot_L: { point: 8 },
    upperLeg_R: { pitch: 12, yaw: -8 }, lowerLeg_R: { bend: 10 }, foot_R: { point: 8 },
    upperArm_L: { pitch: 14, yaw: 171, twist: 62 }, upperArm_R: { pitch: 14, yaw: 171, twist: 62 },
    hand_L: { bend: -20 }, hand_R: { bend: -20 }
  } } },
  { id: "lean_rail_side", name: "侧靠栏杆", audit: { kind: "rail" }, pose: { joints: {
    hips: { side: 8 }, chest: { side: -8 }, head: { tilt: -6 }, upperArm_R: { pitch: 55, yaw: 8 },
    lowerArm_R: { bend: 16 }, upperArm_L: { pitch: 30, yaw: 100 }, lowerArm_L: { bend: 60 },
    upperLeg_L: { pitch: 6, yaw: 10 }, lowerLeg_L: { bend: 12 }, upperLeg_R: { pitch: 4, yaw: 4 }
  } } },
  { id: "lean_rail_lookdown", name: "趴栏看下方", audit: { kind: "rail" }, pose: { joints: {
    spine: { bend: 34 }, chest: { bend: 10 }, neck: { nod: 14 }, head: { nod: 20 },
    upperArm_L: { pitch: 60, yaw: 10 }, upperArm_R: { pitch: 60, yaw: 10 }, lowerArm_L: { bend: 18 },
    lowerArm_R: { bend: 18 }, upperLeg_L: { pitch: 6 }, upperLeg_R: { pitch: 6 }, lowerLeg_L: { bend: 8 },
    lowerLeg_R: { bend: 8 }
  } } },

  /* ───────── 人像摄影扩充：坐 / 跪 / 躺（已通过几何验收） ───────── */

  { id: "sit_chair_leg_lifted", name: "椅上抬腿", audit: { kind: "seat", top: 0.45 }, pose: { joints: {
    upperLeg_L: { pitch: 88, yaw: 8 }, lowerLeg_L: { bend: 92 },
    upperLeg_R: { pitch: 104, yaw: -12, twist: 18 }, lowerLeg_R: { bend: 112 }, foot_R: { point: 12 },
    upperArm_L: { pitch: 25, yaw: 15 }, lowerArm_L: { bend: 30 }, upperArm_R: { pitch: 25, yaw: 15 },
    lowerArm_R: { bend: 30 }, head: { tilt: 4 }
  } } },
  { id: "sit_chair_leaning", name: "斜靠椅背", audit: { kind: "seat", top: 0.45 }, pose: { joints: {
    hips: { bend: -6 }, spine: { bend: -10 }, chest: { bend: -4 }, head: { nod: -2 },
    upperLeg_L: { pitch: 85, yaw: 8 }, upperLeg_R: { pitch: 85, yaw: 8 }, lowerLeg_L: { bend: 80 },
    lowerLeg_R: { bend: 80 }, upperArm_L: { pitch: 20, yaw: 30 }, upperArm_R: { pitch: 20, yaw: 30 },
    lowerArm_L: { bend: 45 }, lowerArm_R: { bend: 45 }
  } } },
  { id: "sit_chair_hands_knees", name: "坐椅扶膝", audit: { kind: "seat", top: 0.45 }, pose: { joints: {
    spine: { bend: 18 }, neck: { nod: -6 }, upperLeg_L: { pitch: 88, yaw: 8 },
    upperLeg_R: { pitch: 88, yaw: 8 }, lowerLeg_L: { bend: 88 }, lowerLeg_R: { bend: 88 },
    upperArm_L: { pitch: 55, yaw: 18 }, upperArm_R: { pitch: 55, yaw: 18 }, lowerArm_L: { bend: 55 },
    lowerArm_R: { bend: 55 }
  } } },
  { id: "sit_steps", name: "坐台阶", audit: { kind: "seat", top: 0.52 }, pose: { joints: {
    spine: { bend: 12 }, upperLeg_L: { pitch: 82, yaw: 10 }, upperLeg_R: { pitch: 82, yaw: 10 },
    lowerLeg_L: { bend: 92 }, lowerLeg_R: { bend: 92 }, upperArm_L: { pitch: 35, yaw: 25 },
    upperArm_R: { pitch: 35, yaw: 25 }, lowerArm_L: { bend: 60 }, lowerArm_R: { bend: 60 }, head: { nod: -4 }
  } } },
  { id: "sit_curb", name: "坐路缘", audit: { kind: "seat", top: 0.32 }, pose: { joints: {
    spine: { bend: 14 }, upperLeg_L: { pitch: 115, yaw: 12 }, upperLeg_R: { pitch: 115, yaw: 12 },
    lowerLeg_L: { bend: 110 }, lowerLeg_R: { bend: 110 }, upperArm_L: { pitch: 40, yaw: 20 },
    upperArm_R: { pitch: 40, yaw: 20 }, lowerArm_L: { bend: 55 }, lowerArm_R: { bend: 55 }, head: { nod: -2 }
  } } },
  { id: "sit_stool", name: "坐高脚凳", audit: { kind: "ledge", top: 0.68 }, pose: { joints: {
    spine: { bend: 6 }, upperLeg_L: { pitch: 85, yaw: 8 }, upperLeg_R: { pitch: 85, yaw: 8 },
    lowerLeg_L: { bend: 80 }, lowerLeg_R: { bend: 80 }, upperArm_L: { pitch: 28, yaw: 28 },
    upperArm_R: { pitch: 28, yaw: 28 }, lowerArm_L: { bend: 45 }, lowerArm_R: { bend: 45 }
  } } },
  { id: "sit_ledge_hands_back", name: "台沿撑手", audit: { kind: "ledge", top: 0.64 }, pose: { joints: {
    spine: { bend: -4 }, chest: { bend: -2 }, upperLeg_L: { pitch: 85, yaw: 6 },
    upperLeg_R: { pitch: 85, yaw: 6 }, lowerLeg_L: { bend: 75 }, lowerLeg_R: { bend: 75 },
    upperArm_L: { pitch: 10, yaw: 160 }, upperArm_R: { pitch: 10, yaw: 160 }, lowerArm_L: { bend: 8 },
    lowerArm_R: { bend: 8 }, head: { nod: -2 }
  } } },
  { id: "sit_ledge_lookback", name: "台沿回眸", audit: { kind: "ledge", top: 0.64 }, pose: { joints: {
    chest: { twist: 26 }, neck: { turn: 26 }, head: { turn: 38 }, upperLeg_L: { pitch: 85, yaw: 6 },
    upperLeg_R: { pitch: 85, yaw: 6 }, lowerLeg_L: { bend: 75 }, lowerLeg_R: { bend: 75 },
    upperArm_L: { pitch: 20, yaw: 40 }, upperArm_R: { pitch: 20, yaw: 40 }, lowerArm_L: { bend: 28 },
    lowerArm_R: { bend: 28 }
  } } },
  { id: "sit_ledge_swing_legs", name: "台沿荡腿", audit: { kind: "ledge", top: 0.64 }, pose: { joints: {
    spine: { bend: 4 }, upperLeg_L: { pitch: 88, yaw: 8 }, upperLeg_R: { pitch: 88, yaw: 8 },
    lowerLeg_L: { bend: 55 }, lowerLeg_R: { bend: 55 }, foot_L: { point: 15 }, foot_R: { point: 15 },
    upperArm_L: { pitch: 25, yaw: 35 }, upperArm_R: { pitch: 25, yaw: 35 }, lowerArm_L: { bend: 40 },
    lowerArm_R: { bend: 40 }
  } } },
  { id: "sit_floor_ankle_cross", name: "脚踝交叉坐", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -12 }, spine: { bend: 16 }, chest: { bend: 6 }, upperLeg_L: { pitch: 104, yaw: 60 },
    upperLeg_R: { pitch: 104, yaw: -30 }, lowerLeg_L: { bend: 50 }, lowerLeg_R: { bend: 50 },
    foot_L: { point: 20 }, foot_R: { point: 20 }, upperArm_L: { pitch: 35, yaw: 45 },
    upperArm_R: { pitch: 35, yaw: 45 }, lowerArm_L: { bend: 70, side: 30 },
    lowerArm_R: { bend: 70, side: -30 }, head: { nod: 6 }
  } } },
  { id: "sit_floor_side_lean", name: "侧撑坐", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -6, side: 8 }, spine: { bend: 6, side: -4 }, upperLeg_L: { pitch: 95, yaw: 60 },
    lowerLeg_L: { bend: 35 }, foot_L: { point: 20 }, upperLeg_R: { pitch: 88, yaw: -30 },
    lowerLeg_R: { bend: 10 }, foot_R: { point: 20 }, upperArm_L: { pitch: 16, yaw: 0 },
    lowerArm_L: { bend: 8 }, upperArm_R: { pitch: 30, yaw: 45 }, lowerArm_R: { bend: 35 }, head: { tilt: -6 }
  } } },
  { id: "sit_floor_stretch", name: "坐位体前屈", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -4 }, spine: { bend: 40 }, chest: { bend: 20 }, neck: { nod: -10 }, head: { nod: -8 },
    upperLeg_L: { pitch: 90, yaw: 8 }, upperLeg_R: { pitch: 90, yaw: 8 }, lowerLeg_L: { bend: 0 },
    lowerLeg_R: { bend: 0 }, foot_L: { point: 20 }, foot_R: { point: 20 }, upperArm_L: { pitch: 75, yaw: 15 },
    upperArm_R: { pitch: 75, yaw: 15 }, lowerArm_L: { bend: 8 }, lowerArm_R: { bend: 8 }
  } } },
  { id: "sit_floor_lookup", name: "坐地仰头", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -30 }, spine: { bend: -8 }, chest: { bend: -4 }, neck: { nod: -14 }, head: { nod: -20 },
    upperLeg_L: { pitch: 70, yaw: 8 }, upperLeg_R: { pitch: 70, yaw: 8 }, lowerLeg_L: { bend: 30 },
    lowerLeg_R: { bend: 30 }, upperArm_L: { pitch: 9.38, yaw: 136.25, twist: -60 },
    upperArm_R: { pitch: 9.38, yaw: 136.25, twist: -60 }, lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 20 }
  } } },
  { id: "sit_floor_hands_knees", name: "坐地扶膝", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -25 }, spine: { bend: 30 }, chest: { bend: 18 }, upperLeg_L: { pitch: 120, yaw: 12 },
    upperLeg_R: { pitch: 120, yaw: 12 }, lowerLeg_L: { bend: 100 }, lowerLeg_R: { bend: 100 },
    foot_L: { point: 40 }, foot_R: { point: 40 }, upperArm_L: { pitch: 40, yaw: 30 },
    upperArm_R: { pitch: 40, yaw: 30 }, lowerArm_L: { bend: 80 }, lowerArm_R: { bend: 80 }, head: { nod: 6 }
  } } },
  { id: "sit_kneel_side", name: "侧跪坐", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: 6, side: -4 }, upperLeg_L: { pitch: 40, yaw: 40 }, lowerLeg_L: { bend: 135 },
    foot_L: { point: 20 }, upperLeg_R: { pitch: 40, yaw: 40 }, lowerLeg_R: { bend: 135 },
    foot_R: { point: 20 }, upperArm_L: { pitch: 20, yaw: 35 }, upperArm_R: { pitch: 20, yaw: 35 },
    lowerArm_L: { bend: 50 }, lowerArm_R: { bend: 50 }, head: { tilt: -4 }
  } } },
  { id: "kneel_lookback", name: "跪姿回眸", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: 8 }, chest: { twist: 26 }, neck: { turn: 26 }, head: { turn: 40 },
    upperLeg_L: { pitch: 10, yaw: 6 }, upperLeg_R: { pitch: 10, yaw: 6 }, lowerLeg_L: { bend: 120 },
    lowerLeg_R: { bend: 120 }, upperArm_L: { pitch: 8, yaw: 90 }, upperArm_R: { pitch: 8, yaw: 90 }
  } } },
  { id: "kneel_back_arch", name: "跪姿后仰", audit: { kind: "floor" }, pose: { joints: {
    spine: { bend: -16 }, chest: { bend: -10 }, neck: { nod: -8 }, head: { nod: -12 },
    upperLeg_L: { pitch: 12, yaw: 6 }, upperLeg_R: { pitch: 12, yaw: 6 }, lowerLeg_L: { bend: 122 },
    lowerLeg_R: { bend: 122 }, upperArm_L: { pitch: 12, yaw: 150 }, upperArm_R: { pitch: 12, yaw: 150 },
    lowerArm_L: { bend: 20 }, lowerArm_R: { bend: 20 }
  } } },
  { id: "squat_hug", name: "抱膝蹲", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: 0 }, spine: { bend: 40 }, chest: { bend: 16 }, head: { nod: 8 },
    upperLeg_L: { pitch: 115, yaw: 16 }, upperLeg_R: { pitch: 115, yaw: 16 }, lowerLeg_L: { bend: 135 },
    lowerLeg_R: { bend: 135 }, foot_L: { point: 18 }, foot_R: { point: 18 },
    upperArm_L: { pitch: 20, yaw: 45 }, upperArm_R: { pitch: 20, yaw: 45 },
    lowerArm_L: { bend: 125, side: 50 }, lowerArm_R: { bend: 125, side: -50 }
  } } },
  { id: "lie_back_arms_up", name: "仰躺举手", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -90 }, upperArm_L: { pitch: 165, yaw: 18 }, upperArm_R: { pitch: 165, yaw: 18 },
    lowerArm_L: { bend: 10 }, lowerArm_R: { bend: 10 }, head: { nod: -4 }
  } } },
  { id: "lie_back_knees_bent", name: "仰躺屈膝", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -90 }, upperLeg_L: { pitch: 45, yaw: 8 }, upperLeg_R: { pitch: 45, yaw: 8 },
    lowerLeg_L: { bend: 75 }, lowerLeg_R: { bend: 75 }, foot_L: { point: 0 }, foot_R: { point: 0 },
    upperArm_L: { pitch: 18, yaw: 65 }, upperArm_R: { pitch: 18, yaw: 65 }
  } } },
  { id: "lie_back_side_look", name: "仰躺侧头", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -90 }, neck: { turn: 20 }, head: { turn: 38, tilt: 6 }, upperArm_L: { pitch: 18, yaw: 65 },
    upperArm_R: { pitch: 18, yaw: 65 }
  } } },
  { id: "lie_side_head_rest", name: "侧躺撑头", audit: { kind: "floor" }, pose: { joints: {
    hips: { side: 85 }, upperLeg_L: { pitch: 4, yaw: 0 }, lowerLeg_L: { bend: 30 },
    upperLeg_R: { pitch: 12, yaw: 0 }, lowerLeg_R: { bend: 55 }, upperArm_R: { pitch: 100, yaw: 0 },
    lowerArm_R: { bend: 120, side: -20 }, upperArm_L: { pitch: 20, yaw: 60 }, lowerArm_L: { bend: 40 },
    head: { tilt: 6 }
  } } },
  { id: "lie_side_fetal", name: "侧躺抱膝", audit: { kind: "floor" }, pose: { joints: {
    hips: { side: 85 }, upperLeg_L: { pitch: 95, yaw: 4 }, lowerLeg_L: { bend: 95 },
    upperLeg_R: { pitch: 105, yaw: 0 }, lowerLeg_R: { bend: 110 }, upperArm_L: { pitch: 45, yaw: 30 },
    lowerArm_L: { bend: 100 }, upperArm_R: { pitch: 50, yaw: 20 }, lowerArm_R: { bend: 105 },
    spine: { bend: 12 }, head: { nod: 10 }
  } } },
  { id: "lie_stomach_chin", name: "趴姿托腮", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: 90 }, spine: { bend: -5 }, chest: { bend: 0 }, head: { nod: -15 },
    upperArm_L: { pitch: 105, yaw: 18, twist: 0 }, upperArm_R: { pitch: 105, yaw: 18, twist: 0 },
    lowerArm_L: { bend: 150, side: 60 }, lowerArm_R: { bend: 150, side: -60 },
    upperLeg_L: { pitch: 0, yaw: 10 }, upperLeg_R: { pitch: 0, yaw: 10 }, foot_L: { point: 40 },
    foot_R: { point: 40 }
  } } },
  { id: "lie_stomach_kick", name: "趴撑后勾腿", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: 80 }, spine: { bend: -20 }, chest: { bend: -10 }, head: { nod: -18 },
    upperArm_L: { pitch: 42, yaw: 18 }, upperArm_R: { pitch: 42, yaw: 18 }, lowerArm_L: { bend: 92 },
    lowerArm_R: { bend: 92 }, upperLeg_L: { pitch: 0, yaw: 10 }, upperLeg_R: { pitch: 0, yaw: 10 },
    lowerLeg_R: { bend: 80 }, foot_R: { point: 40 }, foot_L: { point: 40 }
  } } },
  { id: "lie_back_one_knee_up", name: "仰躺单膝立起", audit: { kind: "floor" }, pose: { joints: {
    hips: { bend: -90 }, upperLeg_L: { pitch: 55, yaw: 8 }, lowerLeg_L: { bend: 95 }, foot_L: { point: 0 },
    upperLeg_R: { pitch: 10, yaw: 6 }, upperArm_L: { pitch: 18, yaw: 65 }, upperArm_R: { pitch: 18, yaw: 65 }
  } } },
  { id: "lie_side_arm_forward", name: "侧躺伸手", audit: { kind: "floor" }, pose: { joints: {
    hips: { side: 85 }, upperLeg_L: { pitch: 10, yaw: 0 }, lowerLeg_L: { bend: 25 },
    upperLeg_R: { pitch: 8, yaw: 0 }, lowerLeg_R: { bend: 40 }, upperArm_R: { pitch: 85, yaw: -10 },
    lowerArm_R: { bend: 10 }, upperArm_L: { pitch: 25, yaw: 55 }, lowerArm_L: { bend: 45 }, head: { tilt: -4 }
  } } },

];

export const presetMap: Record<string, Pose> = Object.fromEntries(
  POSE_PRESETS.map((p) => [p.id, p.pose]),
);
