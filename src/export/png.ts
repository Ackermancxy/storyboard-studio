// P5：单镜 PNG（可带三分线/HUD）与分镜表表格 PNG（A4 横向 150dpi，每页 4 镜、一行一镜）。
import type * as THREE from "three";
import type { Project, Shot } from "../types";
import { ANGLE_ZH, aspectValue, SHOT_TABLE } from "../scene/camera";
import { groundName, skyName } from "../scene/environment";
import { propDef } from "../scene/assets";
import type { SceneManager } from "../scene/SceneManager";
import type { Store } from "../state/store";
import { aspectDims, OffscreenRenderer } from "./render";
import { renderLightMapCanvas } from "./lightmap";
import { downloadDataURL } from "./files";

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 单镜 PNG：长边 1920 */
export function exportShotPNG(
  store: Store,
  sm: SceneManager,
  scene: THREE.Scene,
  withOverlay: boolean,
): void {
  const off = new OffscreenRenderer(scene, sm);
  const { w, h } = aspectDims(aspectValue(store.project.aspect), 1920);
  const url = off.renderShot(store.project, store.shotIndex, w, h);
  const filename = `${store.project.title}_${store.shot.id}.png`;
  if (withOverlay) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.addEventListener("load", () => {
      ctx.drawImage(img, 0, 0);
      drawOverlay(ctx, store.shot, w, h);
      off.restore(store);
      off.dispose();
      downloadDataURL(canvas.toDataURL("image/png"), filename);
    });
    img.src = url;
  } else {
    off.restore(store);
    off.dispose();
    downloadDataURL(url, filename);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, shot: Shot, w: number, h: number): void {
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, w / 1000);
  for (const x of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(w * x, 0);
    ctx.lineTo(w * x, h);
    ctx.stroke();
  }
  for (const y of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(0, h * y);
    ctx.lineTo(w, h * y);
    ctx.stroke();
  }
  const cam = shot.camera;
  const size = SHOT_TABLE[cam.shotSize ?? "MS"];
  const elev = cam.elevation ?? ANGLE_ZH[cam.angle ?? "eye"];
  const angleText = typeof elev === "string" ? elev : `${elev}°`;
  const text = `${shot.id} · ${size.zh} ${cam.shotSize ?? "MS"} · ${Math.round(cam.focalLength ?? 50)}mm · ${angleText}`;
  const fs = Math.round(w / 55);
  ctx.font = `${fs}px ${FONT}`;
  const pad = fs * 0.6;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(8, 8, tw + pad * 2, fs + pad);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 8 + pad, 8 + (fs + pad) / 2 + 1);
}

/* ── 分镜表（表格：一行一镜） ── */

const SHEET_W = 1754; // A4 横向 150dpi
const SHEET_H = 1240;
const MARGIN = 36;
const ROWS_PER_PAGE = 4;
const HEAD_H = 84;
const COL_HEAD_H = 30;
const COL_ID = 78;
const COL_SHOT = 306;
const COL_LIGHT = 236;
const COL_CAM = 216;
const COL_CAST = 238;
const COL_DESC = SHEET_W - MARGIN * 2 - (COL_ID + COL_SHOT + COL_LIGHT + COL_CAM + COL_CAST);
const ROW_H = (SHEET_H - MARGIN - (HEAD_H + COL_HEAD_H)) / ROWS_PER_PAGE;

interface SheetCell {
  image: string; // 效果图 dataURL
  light: HTMLCanvasElement; // 灯位图（按单元格尺寸直接绘制，缩小后仍可读）
}

export async function exportContactSheet(
  store: Store,
  sm: SceneManager,
  scene: THREE.Scene,
): Promise<void> {
  const off = new OffscreenRenderer(scene, sm);
  const project = store.project;
  // 效果图按项目画幅渲染，竖画幅不会被拉伸；600 长边已经比表格单元格大一倍
  const dims = aspectDims(aspectValue(project.aspect), 600);
  const pages = Math.ceil(project.shots.length / ROWS_PER_PAGE);
  // 逐页渲染：一次只在显存里保留 4 张效果图，10 镜以上的长项目不会把显卡压垮
  for (let p = 0; p < pages; p++) {
    const cells: SheetCell[] = [];
    const end = Math.min(project.shots.length, (p + 1) * ROWS_PER_PAGE);
    for (let i = p * ROWS_PER_PAGE; i < end; i++) {
      cells.push({
        image: off.renderShot(project, i, dims.w, dims.h),
        light: renderLightMapCanvas(project.title, project.shots[i], false, COL_LIGHT - 16, true),
      });
    }
    const canvas = document.createElement("canvas");
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    await drawTablePage(canvas.getContext("2d")!, project, p, pages, cells);
    downloadDataURL(canvas.toDataURL("image/png"), `${project.title}_分镜表_p${p + 1}.png`);
  }
  off.restore(store);
  off.dispose();
}

async function drawTablePage(
  ctx: CanvasRenderingContext2D,
  project: Project,
  page: number,
  pageCount: number,
  cells: SheetCell[],
): Promise<void> {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  ctx.textBaseline = "alphabetic";

  // 页眉
  ctx.fillStyle = "#111";
  ctx.font = `bold 27px ${FONT}`;
  ctx.fillText(project.title, MARGIN, MARGIN + 26);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#777";
  const sensorZh = { FF: "全画幅", APSC: "APS-C", M43: "M43" }[project.sensor];
  const sub = `分镜表 · ${project.shots.length} 镜 · 画幅 ${project.aspect} · ${sensorZh} · 第 ${page + 1}/${pageCount} 页`;
  ctx.textAlign = "right";
  ctx.fillText(sub, SHEET_W - MARGIN, MARGIN + 23);
  ctx.textAlign = "left";
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, MARGIN + 46);
  ctx.lineTo(SHEET_W - MARGIN, MARGIN + 46);
  ctx.stroke();

  const tableTop = MARGIN + HEAD_H;
  const tableW = SHEET_W - MARGIN * 2;
  const cols = [COL_ID, COL_SHOT, COL_LIGHT, COL_CAM, COL_CAST, COL_DESC];
  const xs: number[] = [MARGIN];
  for (const w of cols) xs.push(xs[xs.length - 1] + w);
  const rowCount = Math.min(ROWS_PER_PAGE, cells.length);
  const tableBottom = tableTop + COL_HEAD_H + ROW_H * rowCount;

  // 表头
  ctx.fillStyle = "#f1f2f4";
  ctx.fillRect(MARGIN, tableTop, tableW, COL_HEAD_H);
  ctx.fillStyle = "#333";
  ctx.font = `bold 14px ${FONT}`;
  const heads = ["镜号 / 时长", "效果图", "灯位图", "镜头", "人物 · 道具 · 环境", "画面描述 / 备注"];
  heads.forEach((h, i) => ctx.fillText(h, xs[i] + 10, tableTop + 20));

  for (let r = 0; r < rowCount; r++) {
    const cell = cells[r];
    const y = tableTop + COL_HEAD_H + r * ROW_H;
    if (!cell) break;
    const shot = project.shots[page * ROWS_PER_PAGE + r];
    if (!shot) break;
    if (r % 2 === 1) {
      ctx.fillStyle = "#fafafb";
      ctx.fillRect(MARGIN, y, tableW, ROW_H);
    }
    const img = await loadImage(cell.image);
    drawFitImage(ctx, img, xs[1] + 8, y + 8, COL_SHOT - 16, ROW_H - 16);

    const lw = Math.min(COL_LIGHT - 16, ROW_H - 16);
    ctx.drawImage(cell.light, xs[2] + (COL_LIGHT - lw) / 2, y + (ROW_H - lw) / 2, lw, lw);

    drawIdCell(ctx, shot, xs[0] + 10, y + 10, COL_ID - 16);
    drawCameraCell(ctx, shot, xs[3] + 10, y + 10, COL_CAM - 18);
    drawCastCell(ctx, shot, xs[4] + 10, y + 10, COL_CAST - 18);
    drawDescCell(ctx, shot, xs[5] + 10, y + 10, COL_DESC - 20, ROW_H - 18);
  }

  // 网格线
  ctx.strokeStyle = "#d5d7db";
  ctx.lineWidth = 1;
  for (const x of xs) {
    ctx.beginPath();
    ctx.moveTo(x, tableTop);
    ctx.lineTo(x, tableBottom);
    ctx.stroke();
  }
  for (let r = 0; r <= rowCount; r++) {
    const y = tableTop + COL_HEAD_H + r * ROW_H;
    ctx.strokeStyle = r === 0 ? "#9aa0a8" : "#d5d7db";
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(SHEET_W - MARGIN, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#9aa0a8";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN, tableTop, tableW, COL_HEAD_H + ROW_H * rowCount);

  // 页脚
  ctx.fillStyle = "#9aa0a8";
  ctx.font = `11px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${project.title} · 分镜表 · 第 ${page + 1} / ${pageCount} 页`, SHEET_W / 2, SHEET_H - 14);
  ctx.textAlign = "left";
}

function drawIdCell(ctx: CanvasRenderingContext2D, shot: Shot, x: number, y: number, w: number): void {
  ctx.fillStyle = "#111";
  ctx.font = `bold 19px ${FONT}`;
  ctx.fillText(shot.id, x, y + 18, w);
  ctx.fillStyle = "#666";
  ctx.font = `13px ${FONT}`;
  let cy = y + 42;
  if (shot.duration !== undefined) {
    ctx.fillText(`${shot.duration}s`, x, cy);
    cy += 19;
  }
  ctx.fillText(shot.camera.mode === "manual" ? "手动机位" : "自动机位", x, cy);
}

function drawCameraCell(ctx: CanvasRenderingContext2D, shot: Shot, x: number, y: number, w: number): void {
  const cam = shot.camera;
  const size = SHOT_TABLE[cam.shotSize ?? "MS"];
  const elev = cam.elevation;
  const angleText = elev !== undefined ? `${elev > 0 ? "俯" : elev < 0 ? "仰" : "平"} ${Math.abs(elev)}°` : ANGLE_ZH[cam.angle ?? "eye"];
  const placeZh = { center: "居中", "left-third": "左三分", "right-third": "右三分" }[cam.placement ?? "center"];
  const lines: [string, string][] = [
    ["景别", `${size.zh} ${cam.shotSize ?? "MS"}`],
    ["焦段", `${Math.round(cam.focalLength ?? 50)}mm`],
    ["机位", `方位 ${cam.azimuth ?? 0}° · ${angleText}`],
    ["构图", placeZh],
  ];
  let cy = y + 15;
  for (const [label, value] of lines) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#888";
    ctx.fillText(label, x, cy);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#222";
    ctx.fillText(value, x + 34, cy, w - 34);
    cy += 21;
  }
}

function drawCastCell(ctx: CanvasRenderingContext2D, shot: Shot, x: number, y: number, w: number): void {
  const actors = shot.actors.length > 0
    ? shot.actors.map((a) => a.label ?? a.id).slice(0, 3).join("、") + (shot.actors.length > 3 ? ` 等${shot.actors.length}人` : "")
    : "无人物（空镜）";
  const propCounts = new Map<string, number>();
  for (const p of shot.props) {
    const name = p.label ?? propDef(p.model)?.name ?? p.model;
    propCounts.set(name, (propCounts.get(name) ?? 0) + 1);
  }
  const propEntries = [...propCounts.entries()];
  const props = propEntries.length > 0
    ? propEntries.slice(0, 3).map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join("、") +
      (propEntries.length > 3 ? ` 等${shot.props.length}件` : "")
    : "—";
  const sky = skyName(shot.environment?.sky);
  const ground = groundName(shot.environment?.ground);
  const lines: [string, string][] = [
    ["人物", actors],
    ["道具", props],
    ["天空", sky],
    ["地面", ground],
  ];
  let cy = y + 15;
  for (const [label, value] of lines) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#888";
    ctx.fillText(label, x, cy);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#222";
    const wrapped = wrapText(ctx, value, w - 34, 2);
    for (const line of wrapped) {
      ctx.fillText(line, x + 34, cy);
      cy += 18;
    }
    cy += 3;
  }
}

function drawDescCell(ctx: CanvasRenderingContext2D, shot: Shot, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#111";
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(shot.name, x, y + 16, w);

  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "#333";
  let cy = y + 38;
  const descLines = wrapText(ctx, shot.description ?? "", w, shot.notes ? 6 : 9);
  for (const line of descLines) {
    ctx.fillText(line, x, cy, w);
    cy += 18;
    if (cy > y + h - 20) return;
  }
  if (shot.notes) {
    cy += 4;
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#8a6d1a";
    for (const line of wrapText(ctx, `备注：${shot.notes}`, w, 3)) {
      ctx.fillText(line, x, cy, w);
      cy += 16;
      if (cy > y + h) return;
    }
  }
}

function drawFitImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!img) {
    ctx.fillStyle = "#eee";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const ar = img.naturalWidth / img.naturalHeight || 1;
  let dw = w;
  let dh = dw / ar;
  if (dh > h) {
    dh = h;
    dw = dh * ar;
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.strokeStyle = "#b8bcc2";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 中文逐字折行，行首避开标点 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const noLead = "，。、；：？！）」』%.,!?)]}";
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      if (noLead.includes(ch) && line.length > 1) {
        const last = line[line.length - 1];
        lines.push(line.slice(0, -1));
        line = last + ch;
      } else {
        lines.push(line);
        line = ch;
      }
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, "…");
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}
