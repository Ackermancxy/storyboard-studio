// 分镜表 CSV：一行一镜，Excel / WPS / Numbers 直接打开（UTF-8 BOM + CRLF）。
import type { Project, Shot } from "../types";
import { ANGLE_ZH, SHOT_TABLE } from "../scene/camera";
import { groundName, skyName } from "../scene/environment";
import { propDef } from "../scene/assets";
import { downloadText } from "./files";

const HEADER = [
  "镜号", "镜头名称", "时长(s)", "画幅", "机身",
  "景别", "焦段(mm)", "机位角(°)", "视角", "主体位置",
  "人物", "姿势", "道具", "天空", "地面", "灯光",
  "画面描述", "备注",
];

export function buildStoryboardCSV(project: Project): string {
  const sensorZh = { FF: "全画幅", APSC: "APS-C", M43: "M43" }[project.sensor];
  const rows = project.shots.map((shot) => shotRow(project, shot, sensorZh));
  return "﻿" + [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function exportStoryboardCSV(project: Project): void {
  const name = project.title.replace(/[\\/:*?"<>|]/g, "_") || "未命名";
  downloadText(buildStoryboardCSV(project), `${name}_分镜表.csv`, "text/csv");
}

function shotRow(project: Project, shot: Shot, sensorZh: string): string[] {
  const cam = shot.camera;
  const size = SHOT_TABLE[cam.shotSize ?? "MS"];
  const elev = cam.elevation;
  const angle = elev !== undefined
    ? elev > 0 ? `俯 ${elev}°` : elev < 0 ? `仰 ${Math.abs(elev)}°` : "平视"
    : ANGLE_ZH[cam.angle ?? "eye"];
  const placement = { center: "居中", "left-third": "左三分", "right-third": "右三分" }[cam.placement ?? "center"];

  const actors = shot.actors.length > 0
    ? shot.actors.map((a) => `${a.label ?? a.id}（${a.model}）`).join("；")
    : "无人物（空镜）";
  const poses = shot.actors.length > 0
    ? shot.actors.map((a) => {
        const preset = a.pose.preset ?? "—";
        const joints = Object.entries(a.pose.joints ?? {});
        return `${a.id}: ${preset}${joints.length > 0 ? `（+${joints.length} 处微调）` : ""}`;
      }).join("；")
    : "—";
  const props = propSummary(shot);
  const lights = shot.lights.length > 0
    ? shot.lights.map((l) => `${l.id} ${l.role} ${l.azimuth}°/${l.elevation}° 强度${l.intensity}`).join("；")
    : "—";

  return [
    shot.id,
    shot.name,
    shot.duration !== undefined ? String(shot.duration) : "",
    project.aspect,
    sensorZh,
    `${size.zh} ${cam.shotSize ?? "MS"}`,
    String(Math.round(cam.focalLength ?? 50)),
    String(cam.azimuth ?? 0),
    angle,
    placement,
    actors,
    poses,
    props,
    skyName(shot.environment?.sky),
    groundName(shot.environment?.ground),
    lights,
    shot.description ?? "",
    shot.notes ?? "",
  ];
}

function propSummary(shot: Shot): string {
  const counts = new Map<string, number>();
  for (const p of shot.props) {
    const name = p.label ?? propDef(p.model)?.name ?? p.model;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (counts.size === 0) return "—";
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join("；");
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
