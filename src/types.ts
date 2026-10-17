/** SPEC §4 数据模型（核心契约）。坐标单位米、Y 向上；所有角度一律用「度」。 */

/* ── 项目 ── */

export type Aspect = "3:2" | "4:3" | "16:9" | "4:5" | "1:1" | "9:16" | "2.39:1";
export const ASPECTS: readonly Aspect[] = ["3:2", "4:3", "16:9", "4:5", "1:1", "9:16", "2.39:1"];

/** 只影响 UI 显示的「实际焦段」，计算一律用等效焦段（SPEC §7.1） */
export type Sensor = "FF" | "APSC" | "M43";
export const SENSORS: readonly Sensor[] = ["FF", "APSC", "M43"];

export interface Project {
  version: 1;
  title: string;
  aspect: Aspect;
  sensor: Sensor;
  shots: Shot[];
}

export interface Shot {
  id: string; // "S01"…
  name: string;
  description: string;
  notes?: string;
  duration?: number; // 秒
  camera: CameraSpec;
  actors: Actor[];
  props: Prop[];
  lights: Light[];
  environment?: {
    background: string;
    floor: "grid" | "plain" | "none";
    /** 天空/天气预设 id，见 scene/environment.ts；studio = 纯色背景 */
    sky?: string;
    /** 地面预设 id；studio = 沿用 floor 的网格/素色地面 */
    ground?: string;
  };
}

/* ── 人物 / 姿势（SPEC §4.3、§5.1） ── */

/** 关节参数键：躯干用 bend/side/twist，头颈用 nod/tilt/turn，四肢用 pitch/yaw/twist/bend/point */
export type JointParamKey =
  | "bend" | "side" | "twist" | "nod" | "tilt" | "turn" | "pitch" | "yaw" | "point";
export type JointParams = Partial<Record<JointParamKey, number>>;

export const JOINT_NAMES = [
  "hips", "spine", "chest", "neck", "head",
  "upperArm_L", "upperArm_R", "lowerArm_L", "lowerArm_R", "hand_L", "hand_R",
  "upperLeg_L", "upperLeg_R", "lowerLeg_L", "lowerLeg_R", "foot_L", "foot_R",
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

export interface Pose {
  preset?: string; // 先套预设
  joints?: Partial<Record<JointName, JointParams>>; // 再逐项覆盖
}

export interface Actor {
  id: string; // "A"、"B"…，镜内唯一，camera.subject 引用它
  label?: string;
  model: string; // manifest 里的 character id
  position: [number, number]; // [x, z] 髋部在地面上的投影
  facing: number; // 度：0 = 面向 +Z，90 = 面向 +X，-90 = 画面左，180 = 背对
  elevation?: number; // 默认 0
  autoGround?: boolean; // 默认 true：身体最低点贴到 y = elevation
  color?: string;
  pose: Pose;
  gaze?: "camera" | string | null; // 看镜头 / 看某个 actor id
}

/* ── 相机（SPEC §4.5、§7） ── */

export const SHOT_SIZES = ["ECU", "CU", "MCU", "MS", "MLS", "FS", "WS", "EWS"] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

export type CameraAngle = "eye" | "high" | "low" | "overhead" | "worm";
export const CAMERA_ANGLES: readonly CameraAngle[] = ["eye", "high", "low", "overhead", "worm"];

export type Placement = "center" | "left-third" | "right-third";
export const PLACEMENTS: readonly Placement[] = ["center", "left-third", "right-third"];

export interface CameraSpec {
  mode: "auto" | "manual";
  focalLength: number; // 等效全画幅焦段 mm，默认 50
  roll?: number; // 荷兰角，度
  // auto 模式
  subject?: string | string[]; // actor id；数组 = 取中点
  shotSize?: ShotSize; // 默认 MS
  azimuth?: number; // 相对被摄者朝向，默认 0
  angle?: CameraAngle;
  elevation?: number; // 写了就覆盖 angle
  placement?: Placement;
  // manual 模式
  position?: [number, number, number];
  target?: [number, number, number];
}

/* ── 道具 / 灯光（SPEC §4.4、§6） ── */

export interface Prop {
  id: string;
  model: string;
  label?: string;
  position: [number, number];
  facing?: number;
  elevation?: number;
  size?: [number, number, number]; // 宽 高 深，仅 box/wall/backdrop 等可变尺寸道具
  scale?: number;
  color?: string;
}

export type LightRole = "key" | "fill" | "rim" | "back" | "practical" | "ambient";
export const LIGHT_ROLES: readonly LightRole[] = ["key", "fill", "rim", "back", "practical", "ambient"];

export interface Light {
  id: string;
  role: LightRole;
  type?: "soft" | "hard"; // soft = 阴影边缘柔
  subject?: string; // 打向哪个 actor，默认第一个
  azimuth: number; // 相对 subject 朝向的水平角，规则同机位 §7.2
  elevation: number; // 仰角，正 = 从上往下打
  distance?: number; // 默认 3
  intensity: number; // 0–2，1 为标准
  colorTemp?: number; // K，默认 5600
  showStand?: boolean; // 在导演/俯视视图画出灯架
}
