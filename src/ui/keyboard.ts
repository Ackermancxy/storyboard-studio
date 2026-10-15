// P2/P3/P7：快捷键。Tab/T 视图、W/E 模式、Delete、1–9、Ctrl+D、? 帮助。
import type { Store } from "../state/store";
import { nextId } from "../state/store";
import { showHelpModal } from "./modals";

export function initKeyboard(
  store: Store,
  hooks: {
    setMode: (m: "translate" | "rotate") => void;
    toggleView: () => void;
    toggleTop: () => void;
  },
): void {
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      store.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelected(store);
      return;
    }
    switch (e.key) {
      case "Tab": e.preventDefault(); hooks.toggleView(); break;
      case "t": case "T": hooks.toggleTop(); break;
      case "w": case "W": hooks.setMode("translate"); break;
      case "e": case "E": hooks.setMode("rotate"); break;
      case "?": case "/": showHelpModal(); break;
      case "Delete": case "Backspace": deleteSelected(store); break;
      default:
        if (/^[1-9]$/.test(e.key)) {
          const i = parseInt(e.key, 10) - 1;
          if (i < store.project.shots.length) store.setShotIndex(i);
        }
        break;
    }
  });
}

function deleteSelected(store: Store): void {
  const sel = store.selected;
  if (!sel || sel.type === "camera") return;
  store.transact((p) => {
    const shot = p.shots[store.shotIndex];
    if (sel.type === "actor") shot.actors = shot.actors.filter((a) => a.id !== sel.id);
    if (sel.type === "prop") shot.props = shot.props.filter((x) => x.id !== sel.id);
    if (sel.type === "light") shot.lights = shot.lights.filter((l) => l.id !== sel.id);
  });
  store.setSelected(null);
}

function duplicateSelected(store: Store): void {
  const sel = store.selected;
  if (!sel) return;
  const shot = store.shot;
  if (sel.type === "actor") {
    const src = shot.actors.find((a) => a.id === sel.id);
    if (!src) return;
    const clone = structuredClone(src);
    store.transact((p) => {
      const s = p.shots[store.shotIndex];
      clone.id = nextId(s.actors, "A");
      clone.position = [clone.position[0] + 0.5, clone.position[1] + 0.3];
      s.actors.push(clone);
    });
    store.setSelected({ type: "actor", id: clone.id });
  } else if (sel.type === "prop") {
    const src = shot.props.find((x) => x.id === sel.id);
    if (!src) return;
    const clone = structuredClone(src);
    store.transact((p) => {
      const s = p.shots[store.shotIndex];
      clone.id = nextId(s.props, "P");
      clone.position = [clone.position[0] + 0.5, clone.position[1] + 0.3];
      s.props.push(clone);
    });
    store.setSelected({ type: "prop", id: clone.id });
  }
}
