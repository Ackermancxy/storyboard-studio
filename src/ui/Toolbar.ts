// P2/P3：工具栏。新建 / 撤销 / 重做 / 画幅 / 传感器。文件与导出在 P5，阴影在 P4。
import type { Aspect, Sensor } from "../types";
import { ASPECTS, SENSORS } from "../types";
import type { Store } from "../state/store";
import { newProject } from "../state/store";

export function initToolbar(store: Store, hooks: { toggleOverlay?: () => void } = {}): { update: () => void } {
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

  // 画幅（项目级，P3）
  const aspectSel = document.getElementById("aspect") as HTMLSelectElement;
  aspectSel.disabled = false;
  aspectSel.innerHTML = "";
  for (const a of ASPECTS) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    aspectSel.appendChild(opt);
  }
  aspectSel.addEventListener("change", () => {
    store.transact((p) => {
      p.aspect = aspectSel.value as Aspect;
    });
  });

  // 传感器（只影响 HUD 显示实际焦段）
  const sensorSel = document.getElementById("sensor") as HTMLSelectElement;
  sensorSel.innerHTML = "";
  for (const s of SENSORS) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s === "FF" ? "全画幅" : s === "APSC" ? "APS-C" : "M43";
    sensorSel.appendChild(opt);
  }
  sensorSel.addEventListener("change", () => {
    store.transact((p) => {
      p.sensor = sensorSel.value as Sensor;
    });
  });

  // 三分线开关（P3）
  const overlayBtn = document.getElementById("btn-overlay");
  overlayBtn?.addEventListener("click", () => hooks.toggleOverlay?.());

  function update(): void {
    ($("btn-undo") as HTMLButtonElement).disabled = !store.canUndo();
    ($("btn-redo") as HTMLButtonElement).disabled = !store.canRedo();
    document.getElementById("proj-title")!.textContent = store.project.title;
    if (document.activeElement !== aspectSel) aspectSel.value = store.project.aspect;
    if (document.activeElement !== sensorSel) sensorSel.value = store.project.sensor;
  }

  update();
  return { update };
}
