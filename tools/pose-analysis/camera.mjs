// src/scene/camera.ts 的零依赖移植（自动机位求解），供离线取景/视线分析用。
import { add, sub, mul, dot, cross, len, norm } from "./vec.mjs";

export const FILM_GAUGE = 36;
export const SHOT_TABLE = {
  ECU: { F: 0.08, C: 0.93, zh: "大特写" },
  CU: { F: 0.22, C: 0.89, zh: "特写" },
  MCU: { F: 0.35, C: 0.84, zh: "近景" },
  MS: { F: 0.55, C: 0.74, zh: "中景" },
  MLS: { F: 0.8, C: 0.62, zh: "中全景" },
  FS: { F: 1.2, C: 0.5, zh: "全景" },
  WS: { F: 2.5, C: 0.5, zh: "远景" },
  EWS: { F: 6, C: 0.5, zh: "大远景" },
};
export const ANGLE_ELEVATION = { eye: 0, high: 25, low: -15, overhead: 80, worm: -45 };
export const ANGLE_ZH = { eye: "平视", high: "俯拍", low: "仰拍", overhead: "顶拍", worm: "贴地仰拍" };

export function aspectValue(aspect = "3:2") {
  const [w, h] = String(aspect).split(":").map(Number);
  return w / h || 1.5;
}

export function focalToVFovDeg(focal, aspect) {
  const filmH = aspect >= 1 ? FILM_GAUGE / aspect : FILM_GAUGE;
  return (2 * Math.atan(filmH / (2 * focal)) * 180) / Math.PI;
}

function frameOf(a) {
  const b = a.bounds;
  if (b && Number.isFinite(b.min?.[0])) {
    const bodyH = b.max[1] - b.min[1];
    const span = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    return {
      cx: (b.min[0] + b.max[0]) / 2,
      cz: (b.min[2] + b.max[2]) / 2,
      minY: b.min[1],
      bodyH,
      frameH: Math.max(bodyH, span),
    };
  }
  return { cx: a.position[0], cz: a.position[1], minY: a.elevation ?? 0, bodyH: a.height, frameH: a.height };
}

export function pickSubjectsById(spec, actors) {
  if (spec.subject === undefined) return actors;
  const ids = Array.isArray(spec.subject) ? spec.subject : [spec.subject];
  const picked = actors.filter((a) => ids.includes(a.id));
  return picked.length ? picked : actors;
}

/** @returns {{position:number[], target:number[], distance:number, subjectHeight:number, vFov:number}} */
export function solveCamera(spec, actors, aspect) {
  const picked = pickSubjectsById(spec, actors);
  const frames = picked.map(frameOf);
  let cx = 0, cz = 0, bodyH = 1.7, frameH = 1.7, facing = 0;
  if (frames.length) {
    for (const f of frames) { cx += f.cx; cz += f.cz; }
    cx /= frames.length; cz /= frames.length;
    bodyH = Math.max(...frames.map((f) => f.bodyH));
    frameH = Math.max(...frames.map((f) => f.frameH));
    facing = picked[0].facing;
  }
  const size = SHOT_TABLE[spec.shotSize ?? "MS"];
  const focal = spec.focalLength ?? 50;
  const vFov = (focalToVFovDeg(focal, aspect) * Math.PI) / 180;
  const D = (size.F * frameH) / (2 * Math.tan(vFov / 2));
  const elev = spec.elevation ?? ANGLE_ELEVATION[spec.angle ?? "eye"];
  const theta = ((facing + (spec.azimuth ?? 0)) * Math.PI) / 180;
  const phi = (elev * Math.PI) / 180;
  const target = [cx, (frames[0]?.minY ?? 0) + size.C * bodyH, cz];
  const position = [
    target[0] + D * Math.sin(theta) * Math.cos(phi),
    Math.max(target[1] + D * Math.sin(phi), 0.05),
    target[2] + D * Math.cos(theta) * Math.cos(phi),
  ];
  if (spec.placement && spec.placement !== "center") {
    const view = norm(sub(target, position));
    const right = norm(cross(view, [0, 1, 0]));
    const sign = spec.placement === "left-third" ? 1 : -1;
    const off = (sign * size.F * frameH * aspect) / 6;
    target[0] += right[0] * off;
    target[1] += right[1] * off;
    target[2] += right[2] * off;
  }
  return { position, target, distance: D, subjectHeight: bodyH, vFov: focalToVFovDeg(focal, aspect), size, focal };
}

export function cameraHudText(spec, sensor = "FF") {
  const size = SHOT_TABLE[spec.shotSize ?? "MS"];
  const f = Math.round(spec.focalLength ?? 50);
  const crop = sensor === "APSC" ? 1.5 : sensor === "M43" ? 2 : 1;
  const sensorText = crop === 1 ? "" : `（${sensor} 实际 ${Math.round(f / crop)}mm）`;
  const elev = spec.elevation ?? ANGLE_ELEVATION[spec.angle ?? "eye"];
  const angleText = spec.elevation !== undefined ? `${elev > 0 ? "俯" : elev < 0 ? "仰" : "平"}${Math.abs(elev)}°` : ANGLE_ZH[spec.angle ?? "eye"];
  return `${size.zh} ${spec.shotSize ?? "MS"} · ${f}mm${sensorText} · ${angleText}`;
}
