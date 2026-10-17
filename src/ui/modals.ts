// P5/P7：导入 AI JSON 弹窗、快捷键帮助、用户预设管理。
import { normalizeProject, parseLoose } from "../state/normalize";
import { getManifest } from "../scene/assets";
import type { Store } from "../state/store";
import {
  deleteUserPreset,
  loadUserPresets,
  saveUserPresets,
  upsertUserPreset,
  invalidatePresetCache,
} from "../data/userPresets";
import { downloadText, openProjectFile } from "../export/files";
import type { Pose } from "../types";

const HELP_HTML = `
  <h3>快捷键</h3>
  <div class="warnings" style="color:var(--text);white-space:normal">
<b>Tab</b>（或工具栏「切换视角」）机位 ⇄ 导演视图，飞行中切换不中断　<b>T</b> 俯视视图<br>
<b>Home</b> 取景重置（把机位和主体一起框回画面）<br>
<b>W / E</b> 移动 / 旋转选中对象　<b>Delete</b> 删除选中<br>
<b>F</b> 飞行当前视图相机（第三人称=导演相机；机位视图=机位相机）<br>
<b>V</b> 飞行机位相机（第三人称下也能飞机位）　<b>X</b> 用飞行键位控制选中对象<br>
　飞行中：<b>WASD</b> 平移　<b>鼠标左键/右键拖拽</b> 环视 / 物体转向　<b>Shift</b> 加速　<b>Ctrl</b> 微调<br>
　　<b>Space / C</b> 升降　<b>滚轮</b> 调速　<b>Esc / 再按同键 / Tab</b> 退出<br>
<b>1–9</b> 跳到第 N 个镜头　<b>Ctrl+D</b> 复制选中对象<br>
<b>Ctrl+Z</b> 撤销　<b>Ctrl+Shift+Z / Ctrl+Y</b> 重做<br>
<b>Shift+点「导出PNG」</b> 不带三分线/HUD　<b>Shift+点「复制AI提示词」</b> 复制当前项目让 AI 继续改<br>
鼠标拖动 = 旋转视角（导演视图），滚轮缩放<br>
导演视图点选对象后用轴拖动：人物/道具在 XZ 平面，<b>灯</b>可三轴拖动（自动换算方位/仰角/距离）
  </div>
  <div class="actions"><button data-act="close">关闭</button></div>`;

export function showHelpModal(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal">${HELP_HTML}</div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector("[data-act=close]")!.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

export function showPresetManager(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>我的姿势预设</h3>
      <div class="warnings preset-list" style="color:var(--text)"></div>
      <div class="actions">
        <button data-act="import">导入</button>
        <button data-act="close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const list = backdrop.querySelector<HTMLDivElement>(".preset-list")!;
  const close = (): void => backdrop.remove();
  backdrop.querySelector("[data-act=close]")!.addEventListener("click", close);
  backdrop.querySelector("[data-act=import]")!.addEventListener("click", () => {
    void openProjectFile()
      .then((raw) => {
        const arr = (raw as { presets?: unknown }).presets ?? raw;
        if (!Array.isArray(arr)) throw new Error("格式不对：需要预设数组");
        const cur = loadUserPresets();
        for (const p of arr as { id?: string; name?: string; pose?: Pose }[]) {
          if (!p?.id || !p.pose) continue;
          cur.push({ id: p.id, name: p.name ?? p.id, pose: p.pose });
        }
        saveUserPresets(cur);
        invalidatePresetCache();
        render();
      })
      .catch((err: Error) => window.alert(err.message));
  });
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });

  function render(): void {
    list.innerHTML = "";
    const presets = loadUserPresets();
    if (presets.length === 0) {
      list.textContent = "（还没有自定义预设。选中人物 → 姿势 → 存当前为预设）";
      return;
    }
    for (const p of presets) {
      const row = document.createElement("div");
      row.className = "preset-row";
      row.innerHTML = `<span style="flex:1">${p.name} <span style="color:var(--dim)">${p.id}</span></span>`;
      const btn = (text: string, fn: () => void): void => {
        const b = document.createElement("button");
        b.textContent = text;
        b.addEventListener("click", fn);
        row.appendChild(b);
      };
      btn("重命名", () => {
        const name = window.prompt("新名称：", p.name);
        if (!name) return;
        upsertUserPreset(p.id, name, p.pose);
        invalidatePresetCache();
        render();
      });
      btn("导出", () => downloadText(JSON.stringify({ presets: [p] }, null, 2), `${p.name}.preset.json`));
      btn("删除", () => {
        deleteUserPreset(p.id);
        invalidatePresetCache();
        render();
      });
      list.appendChild(row);
    }
  }
  render();
}

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
