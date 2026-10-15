// P3：焦段换算 + 语义机位求解（SPEC §7，全部纯函数）。
import * as THREE from "three";
import type { CameraAngle, CameraSpec, ShotSize } from "../types";

/** 全画幅胶片宽 36mm；three 的 filmGauge 用在长边上，竖画幅自动换边 */
export const FILM_GAUGE = 36;

export const SHOT_TABLE: Record<ShotSize, { F: number; C: number; zh: string }> = {
  ECU: { F: 0.08, C: 0.93, zh: "大特写" },
  CU: { F: 0.22, C: 0.89, zh: "特写" },
  MCU: { F: 0.35, C: 0.84, zh: "近景" },
  MS: { F: 0.55, C: 0.74, zh: "中景" },
  MLS: { F: 0.8, C: 0.62, zh: "中全景" },
  FS: { F: 1.2, C: 0.5, zh: "全景" },
  WS: { F: 2.5, C: 0.5, zh: "远景" },
  EWS: { F: 6, C: 0.5, zh: "大远景" },
};

export const ANGLE_ELEVATION: Record<CameraAngle, number> = {
  eye: 0, high: 25, low: -15, overhead: 80, worm: -45,
};
export const ANGLE_ZH: Record<CameraAngle, string> = {
  eye: "平视", high: "俯拍", low: "仰拍", overhead: "顶拍", worm: "贴地仰拍",
};

export interface SolveInputActor {
  id: string;
  position: [number, number];
  facing: number;
  height: number;
}

export interface CameraSolve {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  distance: number;
  /** 参与求解的主体（placement / HUD 用） */
  subjectHeight: number;
}

/** 等效焦段 → 垂直 FOV（度）。36mm 挂长边：横画幅 filmH = 36/aspect，竖画幅 = 36 */
export function focalToVFovDeg(focal: number, aspect: number): number {
  const filmH = aspect >= 1 ? FILM_GAUGE / aspect : FILM_GAUGE;
  return THREE.MathUtils.radToDeg(2 * Math.atan(filmH / (2 * focal)));
}

const rad = THREE.MathUtils.degToRad;

/** §7.2 auto 机位求解 */
export function solveCamera(
  spec: CameraSpec,
  actors: SolveInputActor[],
  aspect: number,
): CameraSolve {
  const picked = pickSubjectsById(spec, actors);
  const P = new THREE.Vector3();
  let H = 1.7;
  let facing = 0;
  if (picked.length > 0) {
    for (const a of picked) P.add(new THREE.Vector3(a.position[0], 0, a.position[1]));
    P.divideScalar(picked.length);
    H = Math.max(...picked.map((a) => a.height));
    facing = picked[0].facing;
  }
  const size = SHOT_TABLE[spec.shotSize ?? "MS"];
  const vFov = rad(focalToVFovDeg(spec.focalLength ?? 50, aspect));
  const D = (size.F * H) / (2 * Math.tan(vFov / 2));

  const elev = spec.elevation ?? ANGLE_ELEVATION[spec.angle ?? "eye"];
  const theta = rad(facing + (spec.azimuth ?? 0));
  const phi = rad(elev);
  const T = new THREE.Vector3(P.x, P.y + size.C * H, P.z);
  const position = new THREE.Vector3(
    T.x + D * Math.sin(theta) * Math.cos(phi),
    Math.max(T.y + D * Math.sin(phi), 0.05),
    T.z + D * Math.cos(theta) * Math.cos(phi),
  );

  if (spec.placement && spec.placement !== "center") {
    const view = T.clone().sub(position).normalize();
    const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
    const sign = spec.placement === "left-third" ? 1 : -1;
    T.addScaledVector(right, (sign * size.F * H * aspect) / 6);
  }

  const up = new THREE.Vector3(0, 1, 0);
  if (spec.roll) up.applyAxisAngle(T.clone().sub(position).normalize(), rad(spec.roll));

  return { position, target: T, up, distance: D, subjectHeight: H };
}

/** subject 解析：undefined → 全体；数组取列出的；全对不上回退全体 */
export function pickSubjectsById<T extends { id: string }>(
  spec: CameraSpec,
  actors: T[],
): T[] {
  if (spec.subject === undefined) return actors;
  const ids = Array.isArray(spec.subject) ? spec.subject : [spec.subject];
  const picked = actors.filter((a) => ids.includes(a.id));
  return picked.length > 0 ? picked : actors;
}

/** HUD 文案：「中景 MS · 50mm · 平视」 */
export function cameraHudText(spec: CameraSpec, sensor: "FF" | "APSC" | "M43"): string {
  const size = SHOT_TABLE[spec.shotSize ?? "MS"];
  const f = Math.round(spec.focalLength ?? 50);
  const crop = sensor === "APSC" ? 1.5 : sensor === "M43" ? 2 : 1;
  const sensorText = crop === 1 ? "" : `（${sensor} 实际 ${Math.round(f / crop)}mm）`;
  const elev = spec.elevation ?? ANGLE_ELEVATION[spec.angle ?? "eye"];
  const angleText = spec.elevation !== undefined ? `${elev > 0 ? "俯" : elev < 0 ? "仰" : "平"}${Math.abs(elev)}°` : ANGLE_ZH[spec.angle ?? "eye"];
  return `${size.zh} ${spec.shotSize ?? "MS"} · ${f}mm${sensorText} · ${angleText}`;
}
