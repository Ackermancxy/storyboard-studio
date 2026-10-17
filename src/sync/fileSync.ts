// 实时保存 + AI 协同：把页面绑定到一个 .storyboard.json 文件上。
//
// - 任何改动防抖 500ms 写回磁盘（走 serve.mjs 的 /api/file）
// - 每 1s 查一次文件 mtime；AI 改了文件 → 自动重新加载（保留当前镜头/选中项）
// - 两边同时改 → 顶部浮动条二选一，默认「保留我的版本」
// - 没有 File System Access API（Firefox 不支持），所以绑定方式是在工具栏里输入路径
import type { Store } from "../state/store";
import { normalizeProject } from "../state/normalize";
import { modelLists } from "../scene/assets";

const LS_PATH = "storyboard.boundFile.v1";
const WRITE_DEBOUNCE = 500;
const POLL_MS = 1000;

type FileReply = {
  ok?: boolean;
  path?: string;
  mtimeMs?: number;
  content?: string;
  conflict?: boolean;
  unchanged?: boolean;
  error?: string;
};

export function initFileSync(store: Store): void {
  const btnBind = document.getElementById("btn-bind") as HTMLButtonElement | null;
  const statusEl = document.getElementById("sync-status");
  const banner = document.getElementById("sync-banner");
  const bannerText = document.getElementById("sync-banner-text");
  const keepBtn = document.getElementById("sync-keep");
  const takeBtn = document.getElementById("sync-take");
  if (!btnBind || !statusEl || !banner || !bannerText || !keepBtn || !takeBtn) return;

  let bound: string | null = localStorage.getItem(LS_PATH);
  let lastMtime = 0;
  /** 最后一次与磁盘一致的内容（我们自己写出的那份），用来判断是否真的有改动 */
  let lastWritten = "";
  let dirty = false;
  let applying = false;
  let writing = false;
  let writeTimer: number | undefined;
  let bannerTimer: number | undefined;
  let conflict: { content: string; mtimeMs: number } | null = null;

  const serialize = (): string => JSON.stringify(store.project, null, 2);

  function setStatus(text: string, cls: "ok" | "warn" | "err" | "saving" | "" = ""): void {
    statusEl!.textContent = text;
    statusEl!.className = cls ? `sync-status ${cls}` : "sync-status";
  }

  function timeStr(): string {
    return new Date().toLocaleTimeString("zh-CN", { hour12: false });
  }

  function showBanner(text: string): void {
    bannerText!.textContent = text;
    banner!.hidden = false;
    window.clearTimeout(bannerTimer);
  }

  function hideBanner(): void {
    banner!.hidden = true;
  }

  function updateButton(): void {
    btnBind!.textContent = bound ? `已绑定 ${bound.split("/").pop()}` : "绑定文件";
    btnBind!.title = bound
      ? `已绑定：${bound}\n改动会实时写回，AI 改文件时页面自动刷新。\n点击可换绑或解除。`
      : "绑定一个 .storyboard.json：改动实时写回，AI 改文件时自动刷新";
  }

  async function apiGet(path: string): Promise<{ status: number } & FileReply> {
    try {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
      const j = (await r.json()) as FileReply;
      return { status: r.status, ...j };
    } catch (err) {
      return { status: 0, ok: false, error: String(err) };
    }
  }

  async function apiPut(path: string, content: string, baseMtimeMs?: number): Promise<{ status: number } & FileReply> {
    try {
      const r = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, baseMtimeMs }),
      });
      const j = (await r.json()) as FileReply;
      return { status: r.status, ...j };
    } catch (err) {
      return { status: 0, ok: false, error: String(err) };
    }
  }

  /** 把磁盘内容灌进 store；保留镜头与选中项 */
  function applyRemote(res: { content?: string; mtimeMs?: number }): boolean {
    if (typeof res.content !== "string") return false;
    let raw: unknown;
    try {
      raw = JSON.parse(res.content);
    } catch {
      setStatus("磁盘文件不是合法 JSON", "err");
      return false;
    }
    let project;
    try {
      project = normalizeProject(raw, modelLists()).project;
    } catch (err) {
      setStatus(`磁盘文件解析失败：${String(err)}`, "err");
      return false;
    }
    applying = true;
    try {
      store.externalReplace(project);
    } finally {
      applying = false;
    }
    lastMtime = res.mtimeMs ?? 0;
    lastWritten = serialize();
    dirty = false;
    conflict = null;
    hideBanner();
    setStatus(`已同步磁盘 ${timeStr()}`, "ok");
    return true;
  }

  async function flush(force = false): Promise<void> {
    if (!bound || writing) return;
    const content = serialize();
    if (!force && content === lastWritten) {
      dirty = false;
      return;
    }
    if (conflict && !force) return;
    writing = true;
    setStatus("保存中…", "saving");
    const res = await apiPut(bound, content, force ? undefined : lastMtime);
    writing = false;
    if (res.ok) {
      if (typeof res.mtimeMs === "number") lastMtime = res.mtimeMs;
      lastWritten = content;
      dirty = false;
      conflict = null;
      hideBanner();
      setStatus(`已保存 ${timeStr()}`, "ok");
      return;
    }
    if (res.status === 409) {
      conflict = { content: res.content ?? "", mtimeMs: res.mtimeMs ?? 0 };
      showBanner("文件被外部修改（可能是 AI），你的改动还没写回");
      setStatus("未保存 · 有冲突", "warn");
      return;
    }
    setStatus(`保存失败：${res.error || res.status}`, "err");
    dirty = true;
  }

  function scheduleWrite(): void {
    window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => void flush(), WRITE_DEBOUNCE);
  }

  async function poll(): Promise<void> {
    if (!bound || writing) return;
    const res = await apiGet(bound);
    if (!res.ok || typeof res.mtimeMs !== "number") return;
    if (Math.abs(res.mtimeMs - lastMtime) < 0.5) return;

    // 磁盘变了
    if (dirty || conflict) {
      conflict = { content: res.content ?? "", mtimeMs: res.mtimeMs };
      showBanner("文件被外部修改（可能是 AI），你的改动还没写回");
      setStatus("未保存 · 有冲突", "warn");
      return;
    }
    applyRemote(res);
  }

  /** 绑定并载入（文件不存在则用当前项目创建） */
  async function bind(rawPath: string, mode: "load" | "overwrite" = "load"): Promise<void> {
    const res = await apiGet(rawPath);
    if (res.ok) {
      bound = res.path ?? rawPath;
      localStorage.setItem(LS_PATH, bound);
      updateButton();
      if (mode === "overwrite") {
        lastMtime = res.mtimeMs ?? 0;
        lastWritten = "";
        dirty = true;
        hideBanner();
        await flush(true);
        return;
      }
      applyRemote(res);
      return;
    }
    if (res.status === 404 && res.path) {
      bound = res.path;
      localStorage.setItem(LS_PATH, bound);
      updateButton();
      lastMtime = 0;
      lastWritten = "";
      dirty = true;
      hideBanner();
      await flush(true);
      return;
    }
    window.alert(`绑定失败：${res.error || `HTTP ${res.status}`}`);
  }

  function unbind(): void {
    bound = null;
    localStorage.removeItem(LS_PATH);
    lastMtime = 0;
    lastWritten = "";
    dirty = false;
    conflict = null;
    hideBanner();
    updateButton();
    setStatus("未绑定文件", "");
  }

  btnBind.addEventListener("click", () => {
    const input = window.prompt(
      "绑定一个 .storyboard.json 文件（支持 ~ 开头的路径）。\n" +
        "改动会实时写回；AI 改这个文件时页面会自动刷新。\n\n" +
        "留空并确定 = 解除绑定。\n" +
        "路径前加 ! = 用当前项目覆盖该文件（例：!~/Downloads/新案.storyboard.json）",
      bound ?? "~/Downloads/",
    );
    if (input === null) return;
    let p = input.trim();
    if (!p) {
      unbind();
      return;
    }
    let mode: "load" | "overwrite" = "load";
    if (p.startsWith("!")) {
      p = p.slice(1).trim();
      mode = "overwrite";
    }
    if (!p) return;
    void bind(p, mode);
  });

  keepBtn.addEventListener("click", () => {
    conflict = null;
    hideBanner();
    void flush(true);
  });

  takeBtn.addEventListener("click", () => {
    if (!conflict) return;
    applyRemote(conflict);
  });

  // 所有 store 变更：内容真的变了才标脏 + 防抖写回
  store.subscribe(() => {
    if (applying || !bound) return;
    const content = serialize();
    if (content === lastWritten) {
      dirty = false;
      return;
    }
    dirty = true;
    if (conflict) {
      showBanner("文件被外部修改（可能是 AI），你的改动还没写回");
      setStatus("未保存 · 有冲突", "warn");
      return;
    }
    setStatus("未保存…", "warn");
    scheduleWrite();
  });

  updateButton();
  if (bound) {
    setStatus("连接中…", "saving");
    void apiGet(bound).then((res) => {
      if (res.ok) applyRemote(res);
      else if (res.status === 404) setStatus("文件不存在", "err");
      else setStatus(`连接失败：${res.error || res.status}`, "err");
    });
  } else {
    setStatus("未绑定文件", "");
  }

  window.setInterval(() => void poll(), POLL_MS);
}
