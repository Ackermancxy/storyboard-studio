// P5：工具栏全量接线（新建/打开/保存/导入/提示词/撤销/重做/导出/画幅/阴影）。
import type { Aspect, Sensor } from "../types";
import { ASPECTS, SENSORS } from "../types";
import type { Store } from "../state/store";
import { newProject } from "../state/store";
import { openProjectFile, saveProjectFile, copyText } from "../export/files";
import { buildAiPrompt, buildAiRevisePrompt } from "../ai/prompt";
import { showImportModal } from "./modals";
import { normalizeProject } from "../state/normalize";
import { modelLists } from "../scene/assets";

export interface ToolbarHooks {
  toggleOverlay?: () => void;
  exportPng?: (withOverlay: boolean) => void;
  exportSheet?: () => void;
  exportSheetCSV?: () => void;
  exportLightMap?: () => void;
  switchView?: () => void;
}

export function initToolbar(store: Store, hooks: ToolbarHooks): { update: () => void } {
  const $ = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
  for (const id of ["btn-new", "btn-open", "btn-save", "btn-import", "btn-prompt", "btn-undo", "btn-redo", "btn-png", "btn-sheet", "btn-sheet-csv", "btn-lightmap", "btn-view"]) {
    $(id).disabled = false;
  }

  $("btn-new").addEventListener("click", () => {
    if (!window.confirm("新建项目？当前项目会保留在撤销历史里（Ctrl+Z 可退回）。")) return;
    store.replaceProject(newProject());
  });
  $("btn-open").addEventListener("click", () => {
    openProjectFile()
      .then((raw) => {
        const { project, warnings } = normalizeProject(raw, modelLists());
        if (warnings.length > 0 && !window.confirm(`文件有 ${warnings.length} 处已自动修正：\n${warnings.slice(0, 8).join("\n")}\n\n继续打开？`)) {
          return;
        }
        store.replaceProject(project);
      })
      .catch((err: Error) => window.alert(err.message));
  });
  $("btn-save").addEventListener("click", () => saveProjectFile(store.project));
  $("btn-import").addEventListener("click", () => showImportModal(store));
  $("btn-prompt").addEventListener("click", (e) => {
    // 普通点击 = 复制提示词；Shift+点击 = 复制「当前项目给 AI 修改」
    if ((e as MouseEvent).shiftKey) {
      const request = window.prompt("要让 AI 怎么改？", "") ?? "";
      void copyText(buildAiRevisePrompt(store.project, request)).then((ok) =>
        flash($("btn-prompt"), ok ? "已复制 ✓" : "复制失败"),
      );
    } else {
      void copyText(buildAiPrompt()).then((ok) =>
        flash($("btn-prompt"), ok ? "已复制 ✓" : "复制失败"),
      );
    }
  });
  $("btn-undo").addEventListener("click", () => store.undo());
  $("btn-redo").addEventListener("click", () => store.redo());
  $("btn-png").addEventListener("click", (e) => {
    hooks.exportPng?.(!(e as MouseEvent).shiftKey); // Shift = 不带辅助线
  });
  $("btn-sheet").addEventListener("click", () => hooks.exportSheet?.());
  $("btn-sheet-csv").addEventListener("click", () => hooks.exportSheetCSV?.());
  $("btn-lightmap").addEventListener("click", () => hooks.exportLightMap?.());
  $("btn-view").addEventListener("click", () => hooks.switchView?.());

  // 画幅 / 传感器
  const aspectSel = document.getElementById("aspect") as HTMLSelectElement;
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

  document.getElementById("btn-overlay")?.addEventListener("click", () => hooks.toggleOverlay?.());

  const shadowsCb = document.getElementById("shadows") as HTMLInputElement;
  shadowsCb.addEventListener("change", () => {
    window.dispatchEvent(new CustomEvent("storyboard:shadows", { detail: shadowsCb.checked }));
  });

  function flash(btn: HTMLButtonElement, text: string): void {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => {
      btn.textContent = orig;
    }, 1200);
  }

  function update(): void {
    $("btn-undo").disabled = !store.canUndo();
    $("btn-redo").disabled = !store.canRedo();
    document.getElementById("proj-title")!.textContent = store.project.title;
    if (document.activeElement !== aspectSel) aspectSel.value = store.project.aspect;
    if (document.activeElement !== sensorSel) sensorSel.value = store.project.sensor;
  }

  update();
  return { update };
}
