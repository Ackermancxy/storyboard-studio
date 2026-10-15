// P5：文件下载 / 打开（SPEC §10）。
import type { Project } from "../types";

export function downloadDataURL(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadText(text: string, filename: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function projectFilename(project: Project): string {
  return `${project.title.replace(/[\\/:*?"<>|]/g, "_") || "未命名"}.storyboard.json`;
}

export function saveProjectFile(project: Project): void {
  downloadText(JSON.stringify(project, null, 2), projectFilename(project));
}

/** 打开 .storyboard.json，返回解析后的对象 */
export function openProjectFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("没有选择文件"));
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        try {
          resolve(JSON.parse(reader.result as string));
        } catch (err) {
          reject(new Error(`JSON 解析失败：${String(err)}`));
        }
      });
      reader.addEventListener("error", () => reject(new Error("读取文件失败")));
      reader.readAsText(file);
    });
    input.click();
  });
}

/** 复制文本到剪贴板（http://127.0.0.1 下 navigator.clipboard 可用；失败回退 execCommand） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
