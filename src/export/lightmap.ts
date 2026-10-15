// P5：俯视灯位图（单镜一张，2D 绘制：人物/道具/灯/相机位置与朝向）。
import type { Store } from "../state/store";
import { solveCamera } from "../scene/camera";
import { characterDef } from "../scene/assets";
import { placeLight, ROLE_COLORS } from "../scene/lights";
import { downloadDataURL } from "./files";

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
const SCALE = 88; // px / m
const RANGE = 6; // ±6m
const SIZE = RANGE * 2 * SCALE;

/** 世界 (x, z) → 画布坐标（+Z 朝下，+X 朝右） */
function toXY(x: number, z: number): [number, number] {
  return [SIZE / 2 + x * SCALE, SIZE / 2 + z * SCALE];
}

export function exportLightMap(store: Store): void {
  const shot = store.shot;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 网格（1m）
  ctx.strokeStyle = "#e4e4e8";
  ctx.lineWidth = 1;
  for (let i = -RANGE; i <= RANGE; i++) {
    const [gx] = toXY(i, 0);
    const [, gy] = toXY(0, i);
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(SIZE, gy);
    ctx.stroke();
  }
  // 坐标轴标注
  ctx.fillStyle = "#999";
  ctx.font = `12px ${FONT}`;
  ctx.fillText("+X →", SIZE - 60, SIZE / 2 - 6);
  ctx.fillText("↓ +Z", SIZE / 2 + 6, SIZE - 12);

  // 道具（灰方块）
  for (const prop of shot.props) {
    const [x, y] = toXY(prop.position[0], prop.position[1]);
    ctx.fillStyle = "#d8d3c8";
    ctx.strokeStyle = "#9a948a";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 9, y - 9, 18, 18);
    ctx.strokeRect(x - 9, y - 9, 18, 18);
    drawFacingTick(ctx, x, y, prop.facing ?? 0, "#9a948a");
    ctx.fillStyle = "#777";
    ctx.font = `12px ${FONT}`;
    ctx.fillText(prop.label ?? prop.id, x + 12, y - 10);
  }

  // 人物（圆 + 朝向）
  for (const actor of shot.actors) {
    const [x, y] = toXY(actor.position[0], actor.position[1]);
    const h = characterDef(actor.model)?.height ?? 1.73;
    const r = 10 + h * 3;
    ctx.fillStyle = actor.color ?? "#4a6a8a";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    drawFacingTick(ctx, x, y, actor.facing, "#222");
    ctx.fillStyle = "#111";
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(actor.label ?? actor.id, x + r + 4, y - r - 2);
  }

  // 灯（彩色点 + 指向线）
  for (const light of shot.lights) {
    const subject = shot.actors.find((a) => a.id === light.subject) ?? shot.actors[0];
    const subPos: [number, number] = subject?.position ?? [0, 0];
    const subFacing = subject?.facing ?? 0;
    const subH = characterDef(subject?.model ?? "")?.height ?? 1.73;
    const place = placeLight(light.azimuth, light.elevation, light.distance ?? 3, subPos, subFacing, subH);
    const [lx, ly] = toXY(place.position.x, place.position.z);
    const [ax, ay] = toXY(place.aim.x, place.aim.z);
    const color = `#${ROLE_COLORS[light.role].toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(`${light.id} ${light.role}`, lx + 10, ly + 4);
    // 灯架符号：小三角
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(lx - 7, ly + 10);
    ctx.lineTo(lx + 7, ly + 10);
    ctx.lineTo(lx, ly + 1);
    ctx.closePath();
    ctx.stroke();
  }

  // 相机（绿方块 + 视线）
  const actorsSolve = shot.actors.map((a) => ({
    id: a.id, position: a.position, facing: a.facing,
    height: characterDef(a.model)?.height ?? 1.73,
  }));
  const cs = solveCamera(shot.camera, actorsSolve, 1.5);
  const [cx, cy] = toXY(cs.position.x, cs.position.z);
  const [tx, ty] = toXY(cs.target.x, cs.target.z);
  ctx.strokeStyle = "#2f8f65";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#2f8f65";
  ctx.fillRect(cx - 8, cy - 8, 16, 16);
  ctx.fillStyle = "#111";
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText("相机", cx + 10, cy + 16);

  // 标题
  ctx.fillStyle = "#111";
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(`${store.project.title} · ${shot.id} ${shot.name} · 灯位图`, 16, 30);

  downloadDataURL(canvas.toDataURL("image/png"), `${store.project.title}_${shot.id}_灯位图.png`);
}

/** 朝向短刻线：facing 0 = 指向 +Z = 画布向下 */
function drawFacingTick(ctx: CanvasRenderingContext2D, x: number, y: number, facingDeg: number, color: string): void {
  const rad = ((facingDeg) * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dz = Math.cos(rad);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * 26, y + dz * 26);
  ctx.stroke();
}
