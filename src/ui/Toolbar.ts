// P2：工具栏（新建/撤销/重做）。文件与导出按钮在 P5 接管，视图按钮在 P3 接管。
import type { Store } from "../state/store";
import { newProject } from "../state/store";

export function initToolbar(store: Store): { update: () => void } {
  const $ = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;

  $("btn-new").disabled = false;
  $("btn-undo").disabled = false;
  $("btn-redo").disabled = false;

  $("btn-new").addEventListener("click", () => {
    if (!window.confirm("新建项目？当前项目会保留在撤销历史里（Ctrl+Z 可退回）。")) return;
    store.replaceProject(newProject());
  });
  $("btn-undo").addEventListener("click", () => store.undo());
  $("btn-redo").addEventListener("click", () => store.redo());

  function update(): void {
    ($("btn-undo") as HTMLButtonElement).disabled = !store.canUndo();
    ($("btn-redo") as HTMLButtonElement).disabled = !store.canRedo();
    document.getElementById("proj-title")!.textContent = store.project.title;
  }

  update();
  return { update };
}
