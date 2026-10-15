// P2：项目状态、事件、快照式撤销重做、localStorage 自动保存（SPEC §3）。
import type { Actor, Project, Prop, Shot } from "../types";
import { defaultLights, newShot } from "./shotFactory";

export type Selection = { type: "actor" | "prop" | "light" | "camera"; id: string } | null;

const LS_KEY = "storyboard.project.v1";
const MAX_UNDO = 100;

export function newProject(title = "未命名项目"): Project {
  return { version: 1, title, aspect: "3:2", sensor: "FF", shots: [newShot("S01", "新镜头")] };
}

function loadStored(): Project | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    if (p?.version === 1 && Array.isArray(p.shots) && p.shots.length > 0) return p;
  } catch {
    /* 损坏的存档当没有 */
  }
  return null;
}

/** 无存档时的示例项目：2 镜（站立全景 / 坐椅子中景） */
export function sampleProject(): Project {
  const p = newProject("示例项目");
  const s1 = p.shots[0];
  s1.name = "全景";
  s1.description = "人物全身站立，交代环境与体态";
  s1.actors = [{
    id: "A", label: "主角", model: "woman", position: [0, 0], facing: 15,
    pose: { preset: "stand" }, gaze: null,
  }];
  s1.camera = { mode: "auto", focalLength: 35, shotSize: "FS", azimuth: 20, angle: "eye", placement: "center" };
  s1.lights = defaultLights("A");
  const s2 = newShot("S02", "坐姿中景");
  s2.description = "坐在椅子上，腰部以上中景";
  s2.actors = [{
    id: "A", label: "主角", model: "woman", position: [0, 0], facing: -20,
    pose: { preset: "sit_chair" }, gaze: "camera",
  }];
  s2.props = [{ id: "P1", model: "chair", position: [0, 0], facing: -20 }];
  s2.camera = { mode: "auto", focalLength: 50, shotSize: "MS", azimuth: -15, angle: "eye", placement: "left-third", subject: "A" };
  s2.lights = defaultLights("A");
  p.shots.push(s2);
  return p;
}

/** 新建镜头的默认三点光在 shotFactory 里，这里 re-export 方便旧引用 */
export { defaultLights } from "./shotFactory";

export class Store {
  project: Project;
  shotIndex = 0;
  selected: Selection = null;
  /** 每次 transact/undo/redo/replace 递增；UI 用它判断面板是否需要重建 */
  revision = 0;
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private pending: Project | null = null;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.project = loadStored() ?? sampleProject();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of [...this.listeners]) fn();
    this.scheduleSave();
  }

  get shot(): Shot {
    return this.project.shots[this.shotIndex];
  }

  /** 常规修改：自动入撤销栈 */
  transact(fn: (p: Project) => void): void {
    this.pushUndo();
    fn(this.project);
    this.revision++;
    this.emit();
  }
  /** 不入撤销栈的刷新（如文本改完、预设列表变化） */
  touch(): void {
    this.emit();
  }
  /** 拖动/滑杆中的实时预览：不入撤销栈，配对 endDrag 入栈 */
  preview(fn: (p: Project) => void): void {
    fn(this.project);
    this.emit();
  }
  /** 拖动开始时抓快照（重复调用不覆盖）——lil-gui 没有 onStartChange，用这个兜底 */
  beginDragOnce(): void {
    if (!this.pending) this.pending = structuredClone(this.project);
  }
  beginDrag(): void {
    this.pending = structuredClone(this.project);
  }
  endDrag(): void {
    if (!this.pending) return;
    this.undoStack.push(this.pending);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.pending = null;
  }

  private pushUndo(): void {
    this.undoStack.push(structuredClone(this.project));
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): void {
    if (!this.canUndo()) return;
    this.redoStack.push(structuredClone(this.project));
    this.project = this.undoStack.pop()!;
    this.revision++;
    this.clampIndices();
    this.emit();
  }
  redo(): void {
    if (!this.canRedo()) return;
    this.undoStack.push(structuredClone(this.project));
    this.project = this.redoStack.pop()!;
    this.revision++;
    this.clampIndices();
    this.emit();
  }

  private clampIndices(): void {
    this.shotIndex = Math.min(this.shotIndex, this.project.shots.length - 1);
    if (this.shotIndex < 0) this.shotIndex = 0;
    this.validateSelection();
  }

  setShotIndex(i: number): void {
    this.shotIndex = Math.max(0, Math.min(i, this.project.shots.length - 1));
    this.validateSelection();
    this.emit();
  }

  setSelected(s: Selection): void {
    this.selected = s;
    this.emit();
  }

  private validateSelection(): void {
    const sel = this.selected;
    if (!sel) return;
    const shot = this.shot;
    const exists =
      sel.type === "camera" ||
      (sel.type === "actor" && shot.actors.some((a) => a.id === sel.id)) ||
      (sel.type === "prop" && shot.props.some((p) => p.id === sel.id)) ||
      (sel.type === "light" && shot.lights.some((l) => l.id === sel.id));
    if (!exists) this.selected = null;
  }

  /** 整体替换项目（打开文件 / 导入 AI JSON / 新建），入撤销栈 */
  replaceProject(p: Project): void {
    this.pushUndo();
    this.project = p;
    this.revision++;
    this.shotIndex = 0;
    this.selected = null;
    this.emit();
  }

  findSelectedActor(): Actor | undefined {
    const sel = this.selected;
    return sel?.type === "actor" ? this.shot.actors.find((a) => a.id === sel.id) : undefined;
  }
  findSelectedProp(): Prop | undefined {
    const sel = this.selected;
    return sel?.type === "prop" ? this.shot.props.find((x) => x.id === sel.id) : undefined;
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.project));
      } catch {
        /* 存不下就算了（比如隐私模式） */
      }
    }, 500);
  }
}

/** 镜内唯一 id：按前缀取现有最大序号 +1（A/B/C…、P1/P2…、L1/L2…） */
export function nextId(existing: { id: string }[], prefix: string): string {
  let max = 0;
  for (const e of existing) {
    if (!e.id.startsWith(prefix)) continue;
    const n = parseInt(e.id.slice(prefix.length), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (prefix === "A") return letters[max] ?? `A${max}`;
  return `${prefix}${max + 1}`;
}

export function nextShotId(shots: { id: string }[]): string {
  let max = 0;
  for (const s of shots) {
    const n = parseInt(s.id.replace(/^S/, ""), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `S${String(max + 1).padStart(2, "0")}`;
}

export { newShot };
