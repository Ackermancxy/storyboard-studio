// P5：导入 AI JSON 弹窗（粘贴 → 解析 → 警告 → 替换 / 追加）。
import { normalizeProject, parseLoose } from "../state/normalize";
import { getManifest } from "../scene/assets";
import type { Store } from "../state/store";

export function showImportModal(store: Store): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const models = {
    characters: getManifest().characters.map((c) => c.id),
    props: getManifest().props.map((p) => p.id),
  };
  let parsed: ReturnType<typeof normalizeProject> | null = null;

  backdrop.innerHTML = `
    <div class="modal">
      <h3>导入 AI 分镜 JSON</h3>
      <textarea placeholder="把聊天 AI 输出的 JSON 粘贴到这里（允许带 \`\`\`json 围栏、注释、尾逗号）"></textarea>
      <div class="warnings" hidden></div>
      <div class="actions">
        <button data-act="cancel">取消</button>
        <button data-act="parse">检查</button>
        <button data-act="append" disabled>追加镜头</button>
        <button data-act="replace" class="accent" disabled>替换整个项目</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const ta = backdrop.querySelector("textarea")!;
  const warnBox = backdrop.querySelector<HTMLDivElement>(".warnings")!;
  const act = (name: string): HTMLButtonElement =>
    backdrop.querySelector(`[data-act="${name}"]`)!;

  function close(): void {
    backdrop.remove();
  }

  act("cancel").addEventListener("click", close);
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });

  act("parse").addEventListener("click", () => {
    try {
      parsed = normalizeProject(parseLoose(ta.value), models);
    } catch (err) {
      parsed = null;
      warnBox.hidden = false;
      warnBox.textContent = `❌ ${String(err instanceof Error ? err.message : err)}`;
      for (const b of ["append", "replace"]) act(b).disabled = true;
      return;
    }
    const { warnings, project } = parsed;
    warnBox.hidden = false;
    warnBox.textContent = warnings.length
      ? `⚠ ${warnings.length} 条警告：\n${warnings.join("\n")}`
      : `✅ 解析成功：${project.shots.length} 个镜头，无警告`;
    for (const b of ["append", "replace"]) act(b).disabled = false;
  });

  act("replace").addEventListener("click", () => {
    if (!parsed) return;
    store.replaceProject(parsed.project);
    close();
  });
  act("append").addEventListener("click", () => {
    if (!parsed) return;
    const shots = parsed.project.shots;
    store.transact((p) => {
      p.shots.push(...shots);
    });
    store.setShotIndex(store.project.shots.length - 1);
    close();
  });
}
