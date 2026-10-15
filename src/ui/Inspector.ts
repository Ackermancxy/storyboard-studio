// P2：属性面板外壳 + 本镜对象列表；按选中对象切换子面板。
import GUI from "lil-gui";
import type { Store } from "../state/store";
import { nextId } from "../state/store";
import type { SceneManager } from "../scene/SceneManager";
import { characterDef, getManifest, propDef } from "../scene/assets";
import { buildActorPanel } from "./panels/actorPanel";
import { buildPropPanel } from "./panels/propPanel";
import { buildCameraPanel } from "./panels/cameraPanel";

export interface PanelCtx {
  store: Store;
  sm: SceneManager;
  requestRender: () => void;
  refreshThumbs: () => void;
  rebuildPanel: () => void;
}

export function initInspector(ctx: PanelCtx): { update: () => void } {
  const { store } = ctx;
  const rootEl = document.getElementById("inspector")!;
  rootEl.innerHTML = "";

  const listEl = document.createElement("div");
  listEl.id = "obj-list";
  rootEl.appendChild(listEl);

  const panelEl = document.createElement("div");
  panelEl.id = "obj-panel";
  rootEl.appendChild(panelEl);

  let gui: GUI | null = null;
  let structKey = "";

  const ctx2: PanelCtx = { ...ctx, rebuildPanel: () => rebuildPanel() };

  function addRow(): void {
    const bar = document.createElement("div");
    bar.className = "obj-add";
    const add = (text: string, fn: () => void): void => {
      const b = document.createElement("button");
      b.textContent = text;
      b.addEventListener("click", fn);
      bar.appendChild(b);
    };
    add("＋人物", () => {
      const chars = getManifest().characters.map((c) => c.id);
      store.transact((p) => {
        const shot = p.shots[store.shotIndex];
        const id = nextId(shot.actors, "A");
        shot.actors.push({
          id,
          label: characterDef(chars[0])?.name ?? id,
          model: chars[0] ?? "man",
          position: [Math.round(shot.actors.length * 0.8 * 100) / 100, 0],
          facing: 0,
          pose: { preset: "stand", joints: {} },
          gaze: null,
        });
        store.selected = { type: "actor", id };
      });
    });
    add("＋道具", () => {
      const props = getManifest().props.map((p) => p.id);
      store.transact((p) => {
        const shot = p.shots[store.shotIndex];
        const id = nextId(shot.props, "P");
        shot.props.push({
          id,
          model: props[0] ?? "box",
          position: [0.8 + shot.props.length * 0.6, 0],
          facing: 0,
        });
        store.selected = { type: "prop", id };
      });
    });
    listEl.appendChild(bar);
  }

  function renderList(): void {
    listEl.innerHTML = "";
    const shot = store.shot;
    const row = (label: string, type: "actor" | "prop" | "light" | "camera", id: string, extra = ""): void => {
      const el = document.createElement("div");
      const active = store.selected?.type === type && (type === "camera" || store.selected.id === id);
      el.className = "obj-row" + (active ? " active" : "");
      el.innerHTML = `<span class="obj-kind k-${type}">${extra || kindName(type)}</span><span>${label}</span>`;
      el.addEventListener("click", () => {
        store.setSelected(type === "camera" ? { type: "camera", id: "camera" } : { type, id });
      });
      listEl.appendChild(el);
    };
    shot.actors.forEach((a) => row(a.label ? `${a.label}（${a.id}）` : a.id, "actor", a.id));
    shot.props.forEach((pr) => row(propDef(pr.model)?.name ?? pr.model, "prop", pr.id));
    row("相机", "camera", "camera");
    addRow();
  }

  function rebuildPanel(): void {
    if (gui) {
      gui.destroy();
      gui = null;
    }
    const sel = store.selected;
    if (!sel) return;
    gui = new GUI({ container: panelEl, autoPlace: false, width: 272, title: kindName(sel.type) });
    if (sel.type === "actor") {
      const actor = store.findSelectedActor();
      if (actor) buildActorPanel(gui, ctx2, actor);
    } else if (sel.type === "prop") {
      const prop = store.findSelectedProp();
      if (prop) buildPropPanel(gui, ctx2, prop);
    } else if (sel.type === "camera") {
      buildCameraPanel(gui, ctx2, store.shot);
    }
  }

  function update(): void {
    const shot = store.shot;
    const key = [
      store.revision, store.shotIndex, shot.id, store.selected?.type, store.selected?.id,
      shot.actors.map((a) => `${a.id}:${a.label ?? ""}`).join(),
      shot.props.map((p) => p.id).join(),
      shot.lights.map((l) => l.id).join(),
    ].join("|");
    if (key !== structKey) {
      structKey = key;
      renderList();
      rebuildPanel();
    }
  }

  renderList();
  return { update };
}

function kindName(type: string): string {
  return { actor: "人物", prop: "道具", light: "灯", camera: "相机" }[type] ?? type;
}
