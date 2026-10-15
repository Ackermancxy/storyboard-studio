// P5：单镜 PNG（可带三分线/HUD）与分镜表 PNG（A4 横向 150dpi，每页 2×3）。
import type * as THREE from "three";
import type { Project, Shot } from "../types";
import { ANGLE_ZH, SHOT_TABLE } from "../scene/camera";
import type { SceneManager } from "../scene/SceneManager";
import type { Store } from "../state/store";
import { aspectDims, OffscreenRenderer } from "./render";
import { downloadDataURL } from "./files";

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

function aspectValue(aspect: Project["aspect"]): number {
  const [w, h] = aspect.split(":").map(Number);
  return w / h;
}

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
      downloadDataURL(canvas.toDataURL("image/png"), filename);
    });
    img.src = url;
  } else {
    off.restore(store);
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

/* ── 分镜表 ── */

const SHEET_W = 1754; // A4 横向 150dpi
const SHEET_H = 1240;
const COLS = 2;
const ROWS = 3;

export async function exportContactSheet(
  store: Store,
  sm: SceneManager,
  scene: THREE.Scene,
): Promise<void> {
  const off = new OffscreenRenderer(scene, sm);
  const project = store.project;
  const cellImages: string[] = [];
  for (let i = 0; i < project.shots.length; i++) {
    cellImages.push(off.renderShot(project, i, 640, 400));
  }
  off.restore(store);

  const perPage = COLS * ROWS;
  const pages = Math.ceil(project.shots.length / perPage);
  for (let p = 0; p < pages; p++) {
    const canvas = document.createElement("canvas");
    canvas.width = SHEET_W;
    canvas.height = SHEET_H;
    await drawSheetPage(canvas.getContext("2d")!, project, p, cellImages);
    downloadDataURL(canvas.toDataURL("image/png"), `${project.title}_分镜表_p${p + 1}.png`);
  }
}

async function drawSheetPage(
  ctx: CanvasRenderingContext2D,
  project: Project,
  page: number,
  cellImages: string[],
): Promise<void> {
  const perPage = COLS * ROWS;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  const margin = 44;
  ctx.fillStyle = "#111";
  ctx.font = `bold 26px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(project.title, margin, margin + 8);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = "#777";
  ctx.fillText(`分镜表 · 第 ${page + 1} 页 · 共 ${project.shots.length} 镜`, margin + 320, margin + 5);

  const headerH = margin + 30;
  const gap = 18;
  const cellW = (SHEET_W - margin * 2 - gap) / COLS;
  const cellH = (SHEET_H - headerH - margin - gap * (ROWS - 1)) / ROWS;
  const imgH = cellW * (400 / 640);

  for (let c = 0; c < COLS * ROWS; c++) {
    const idx = page * perPage + c;
    const shot = project.shots[idx];
    if (!shot) break;
    const col = c % COLS;
    const row = Math.floor(c / COLS);
    const x = margin + col * (cellW + gap);
    const y = headerH + row * (cellH + gap);

    const img = new Image();
    img.src = cellImages[idx];
    try {
      await img.decode();
      ctx.drawImage(img, x, y, cellW, imgH);
    } catch {
      ctx.fillStyle = "#eee";
      ctx.fillRect(x, y, cellW, imgH);
    }
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, cellW, imgH);

    drawShotText(ctx, shot, x, y + imgH + 6, cellW, cellH - imgH - 8);
  }
}

function drawShotText(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const size = SHOT_TABLE[shot.camera.shotSize ?? "MS"];
  const cam = shot.camera;
  const meta = `${shot.id} ${shot.name} · ${size.zh}${cam.shotSize ?? "MS"} · ${Math.round(cam.focalLength ?? 50)}mm · ${shot.duration ?? ""}s`;
  ctx.fillStyle = "#111";
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(meta, x, y + 16, w);

  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#333";
  let cy = y + 40;
  for (const line of wrapText(ctx, shot.description ?? "", w, 3)) {
    ctx.fillText(line, x, cy, w);
    cy += 19;
    if (cy > y + h - 6) return;
  }
  if (shot.notes) {
    ctx.fillStyle = "#8a6d1a";
    for (const line of wrapText(ctx, `备注：${shot.notes}`, w, 2)) {
      ctx.fillText(line, x, cy, w);
      cy += 19;
      if (cy > y + h - 6) return;
    }
  }
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
