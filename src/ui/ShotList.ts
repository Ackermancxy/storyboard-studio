// P2：镜头列表（缩略图 / 切换 / 新增 / 复制 / 删除 / 拖拽排序）+ 缩略图服务。
import * as THREE from "three";
import type { Project } from "../types";
import { nextShotId, newShot, type Store } from "../state/store";
import { FILM_GAUGE } from "../scene/camera";
import type { SceneManager } from "../scene/SceneManager";

/** 离屏小渲染器，逐镜按机位求解结果捕获缩略图 */
export class ThumbService {
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private camera = new THREE.PerspectiveCamera(45, 1.6, 0.02, 400);
  private thumbs = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;

  constructor(
    private scene: THREE.Scene,
    private sm: SceneManager,
    private onThumb: (shotId: string, url: string) => void,
    private onDone: () => void,
  ) {
    this.renderer.setSize(320, 200, false);
    this.camera.filmGauge = FILM_GAUGE;
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.captureAll(), 300);
  }

  private async captureAll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const store = currentStore;
    const project = store.project;
    for (let i = 0; i < project.shots.length; i++) {
      this.captureShot(project, i);
      await new Promise((r) => setTimeout(r, 0)); // 让出主线程
    }
    // 恢复当前镜头的场景
    this.sm.sync(store.project, store.shotIndex);
    this.busy = false;
    this.onDone();
  }

  captureShot(project: Project, index: number): void {
    const shot = project.shots[index];
    if (!shot) return;
    this.sm.sync(project, index);
    // 用该镜的机位渲染（1.6 = 320/200 缩略图宽高比）
    const cs = this.sm.cameraState;
    if (cs) {
      this.camera.position.copy(cs.position);
      this.camera.up.copy(cs.up);
      this.camera.lookAt(cs.target);
      this.camera.setFocalLength(shot.camera.focalLength ?? 50);
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/jpeg", 0.72);
    this.thumbs.set(shot.id, url);
    this.onThumb(shot.id, url);
  }

  thumbOf(shotId: string): string | undefined {
    return this.thumbs.get(shotId);
  }
}

let currentStore: Store;

export function initShotList(
  store: Store,
  sm: SceneManager,
  scene: THREE.Scene,
  requestRender: () => void,
): ThumbService {
  currentStore = store;
  const root = document.getElementById("shot-items")!;
  const thumbs = new ThumbService(scene, sm, onThumb, requestRender);

  function onThumb(shotId: string, url: string): void {
    const img = root.querySelector<HTMLImageElement>(`img[data-shot="${shotId}"]`);
    if (img) img.src = url;
  }

  function render(): void {
    root.innerHTML = "";
    store.project.shots.forEach((shot, i) => {
      const card = document.createElement("div");
      card.className = "shot-card" + (i === store.shotIndex ? " active" : "");
      card.draggable = true;
      card.dataset.index = String(i);

      const img = document.createElement("img");
      img.dataset.shot = shot.id;
      img.src = thumbs.thumbOf(shot.id) ?? "";
      img.alt = shot.name;
      card.appendChild(img);

      const label = document.createElement("div");
      label.className = "shot-label";
      label.textContent = `${shot.id} ${shot.name}`;
      card.appendChild(label);

      card.addEventListener("click", () => store.setShotIndex(i));
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", String(i));
      });
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
        if (!Number.isFinite(from) || from === i) return;
        store.transact((p) => {
          const [moved] = p.shots.splice(from, 1);
          p.shots.splice(i, 0, moved);
        });
        store.setShotIndex(i);
      });
      root.appendChild(card);
    });
  }

  // 底部操作按钮
  const actions = document.createElement("div");
  actions.className = "shot-actions";
  for (const [text, fn] of [
    ["＋ 新增", () => {
      store.transact((p) => {
        const shot = newShot(nextShotId(p.shots));
        p.shots.push(shot);
      });
      store.setShotIndex(store.project.shots.length - 1);
    }],
    ["复制", () => {
      const src = store.shot;
      const clone = structuredClone(src) as typeof src;
      store.transact((p) => {
        clone.id = nextShotId(p.shots);
        clone.name = src.name + " 副本";
        p.shots.splice(store.shotIndex + 1, 0, clone);
      });
      store.setShotIndex(store.shotIndex + 1);
    }],
    ["删除", () => {
      if (store.project.shots.length <= 1) return;
      store.transact((p) => p.shots.splice(store.shotIndex, 1));
      store.setShotIndex(store.shotIndex);
    }],
  ] as [string, () => void][]) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.addEventListener("click", fn);
    actions.appendChild(btn);
  }
  document.getElementById("shot-list")!.appendChild(actions);

  render();
  return thumbs;
}
