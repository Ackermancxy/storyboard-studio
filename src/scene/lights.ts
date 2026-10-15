// P4：色温换算（Tanner Helland 近似）+ 灯位求解（方位规则同机位 §7.2）。
import * as THREE from "three";
import type { LightRole } from "../types";

/** 色温 K → RGB (0-1)。范围外 clamp 到 1000–40000K */
export function kelvinToRGB(kelvin: number): { r: number; g: number; b: number } {
  const t = Math.min(400, Math.max(10, kelvin / 100));
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number): number => Math.min(1, Math.max(0, v / 255));
  return { r: c(r), g: c(g), b: c(b) };
}

export const ROLE_COLORS: Record<LightRole, number> = {
  key: 0xffd27a, fill: 0x7ab8ff, rim: 0xff7ab8,
  back: 0xb8ff7a, practical: 0xffb84a, ambient: 0xbbbbbb,
};

export interface LightPlacement {
  position: THREE.Vector3;
  aim: THREE.Vector3;
}

/**
 * 灯位：相对 subject 的 azimuth（规则同机位：0 = 正面，+90 = 其左侧）+ 仰角（正 = 从上往下打）。
 * aim 打在人物胸口（0.75H）。
 */
export function placeLight(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  subjectPos: [number, number],
  subjectFacingDeg: number,
  subjectHeight: number,
): LightPlacement {
  const aim = new THREE.Vector3(subjectPos[0], subjectHeight * 0.75, subjectPos[1]);
  const theta = THREE.MathUtils.degToRad(subjectFacingDeg + azimuthDeg);
  const phi = THREE.MathUtils.degToRad(elevationDeg);
  const position = new THREE.Vector3(
    aim.x + distance * Math.sin(theta) * Math.cos(phi),
    aim.y + distance * Math.sin(phi),
    aim.z + distance * Math.cos(theta) * Math.cos(phi),
  );
  if (position.y < 0.1) position.y = 0.1;
  return { position, aim };
}

/** 强度换算：spec 0–2（1 标准）→ three 光强 */
export function lightGain(intensity: number): number {
  return intensity * 2.2;
}
