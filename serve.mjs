#!/usr/bin/env node
// 零依赖静态服务：node serve.mjs [port] [root]
// 默认 5219 端口、dist/ 目录；禁用缓存，方便本地反复构建。
//
// 另外提供只监听 127.0.0.1 的分镜文件读写接口（供页面实时保存 / AI 协同）：
//   GET /api/file?path=~/Downloads/xx.storyboard.json  → { ok, path, mtimeMs, content }
//   PUT /api/file?path=...  body { content, baseMtimeMs }
//       文件在 baseMtimeMs 之后被改过 → 409 + 当前内容（由页面决定保留哪一版）
// 只允许读写 .storyboard.json，且必须位于用户主目录（可用 STORYBOARD_FILE_ROOTS 覆盖，
// 多个目录用 path.delimiter 分隔）。
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { stat, createReadStream, watch as fsWatch } from "node:fs";
import { promises as fsp } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5219);
const root = path.resolve(process.argv[3] || path.join(here, "dist"));
const fileRoots = (process.env.STORYBOARD_FILE_ROOTS || os.homedir())
  .split(path.delimiter)
  .filter(Boolean)
  .map((p) => path.resolve(p));
const MAX_BODY = 16 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".pmx": "application/octet-stream",
  ".pmd": "application/octet-stream",
  ".vmd": "application/octet-stream",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 把用户给的路径解析成受限制的绝对路径（支持 ~ 与相对主目录） */
function resolveUserPath(raw) {
  if (!raw || typeof raw !== "string") throw new HttpError(400, "缺少 path 参数");
  let p = raw.trim();
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  if (!path.isAbsolute(p)) p = path.join(os.homedir(), p);
  p = path.resolve(p);
  if (!p.toLowerCase().endsWith(".storyboard.json")) {
    throw new HttpError(403, "只允许 .storyboard.json 文件");
  }
  const allowed = fileRoots.some((r) => p === r || p.startsWith(r + path.sep));
  if (!allowed) {
    throw new HttpError(403, `文件必须位于：${fileRoots.join(" 或 ")}`);
  }
  return p;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleFileApi(req, res, url) {
  const file = resolveUserPath(url.searchParams.get("path"));

  if (req.method === "GET" || req.method === "HEAD") {
    try {
      const [content, st] = await Promise.all([fsp.readFile(file, "utf8"), fsp.stat(file)]);
      if (req.method === "HEAD") {
        send(res, 200, "", { "Content-Type": "application/json; charset=utf-8" });
        return;
      }
      watchFile(file, st.mtimeMs); // 页面读过的文件进入监听，外部改动经 SSE 推回
      sendJson(res, 200, { ok: true, path: file, mtimeMs: st.mtimeMs, content });
    } catch (err) {
      if (err && err.code === "ENOENT") {
        watchFile(file); // 绑定还不存在的文件也要监听，否则创建后的外部改动推不过来
        sendJson(res, 404, { ok: false, path: file, error: "文件不存在" });
        return;
      }
      throw err;
    }
    return;
  }

  if (req.method === "PUT") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "请求体不是合法 JSON");
    }
    const content = payload?.content;
    if (typeof content !== "string") throw new HttpError(400, "缺少 content");
    try {
      JSON.parse(content);
    } catch {
      throw new HttpError(400, "content 不是合法的分镜 JSON，已拒绝写入");
    }

    let disk = null;
    try {
      const [cur, st] = await Promise.all([fsp.readFile(file, "utf8"), fsp.stat(file)]);
      disk = { content: cur, mtimeMs: st.mtimeMs };
    } catch (err) {
      if (!err || err.code !== "ENOENT") throw err;
    }

    if (disk && disk.content === content) {
      sendJson(res, 200, { ok: true, path: file, mtimeMs: disk.mtimeMs, unchanged: true });
      return;
    }

    const base = payload?.baseMtimeMs;
    if (disk && typeof base === "number" && Math.abs(disk.mtimeMs - base) > 0.5) {
      sendJson(res, 409, {
        ok: false,
        conflict: true,
        path: file,
        mtimeMs: disk.mtimeMs,
        content: disk.content,
        error: "文件已被外部修改",
      });
      return;
    }

    // 原子写：同目录临时文件 + rename，避免 AI 读到写了一半的文件
    const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(tmp, content, "utf8");
    await fsp.rename(tmp, file);
    const st = await fsp.stat(file);
    watchFile(file, st.mtimeMs);
    broadcast({ type: "file-changed", path: file, mtimeMs: st.mtimeMs });
    sendJson(res, 200, { ok: true, path: file, mtimeMs: st.mtimeMs });
    return;
  }

  throw new HttpError(405, "Method Not Allowed");
}

/* ─── 实时协同：fs.watch → SSE 即时推送 + 最近文件列表 ─── */

const sseClients = new Set();
const dirWatchers = new Map(); // 目录 → FSWatcher（一目录一 watcher，rename 原子写也触发）
const watchedFiles = new Map(); // 文件 → 上次广播的 mtimeMs
const pendingWatch = new Map(); // 文件 → debounce timer

function broadcast(obj) {
  const data = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

/** 登记监听一个分镜文件；mtimeMs 为当前已知值（用于过滤自己写回的回声） */
function watchFile(file, mtimeMs = -1) {
  watchedFiles.set(file, mtimeMs);
  const dir = path.dirname(file);
  if (dirWatchers.has(dir)) return;
  let watcher;
  try {
    watcher = fsWatch(dir, { persistent: false }, (event, filename) => {
      if (!filename || !filename.toLowerCase().endsWith(".storyboard.json")) return;
      const full = path.join(dir, filename);
      if (!watchedFiles.has(full)) return; // 只推页面/AI 实际在用的文件
      clearTimeout(pendingWatch.get(full));
      pendingWatch.set(full, setTimeout(() => void notifyChanged(full), 120));
    });
  } catch {
    return; // 监听失败不致命，页面还有 1s 轮询兜底
  }
  watcher.on("error", () => dirWatchers.delete(dir));
  dirWatchers.set(dir, watcher);
}

async function notifyChanged(file) {
  let mtimeMs;
  try {
    mtimeMs = (await fsp.stat(file)).mtimeMs;
  } catch {
    watchedFiles.delete(file);
    broadcast({ type: "file-changed", path: file, gone: true });
    return;
  }
  const prev = watchedFiles.get(file);
  watchedFiles.set(file, mtimeMs);
  
  if (typeof prev === "number" && prev >= 0 && Math.abs(mtimeMs - prev) < 1) return; // 自己写回的回声
  broadcast({ type: "file-changed", path: file, mtimeMs });
}

/** 最近的分镜文件：主目录 + Downloads 顶层，按修改时间倒序 */
async function handleListApi(res) {
  const dirs = [...new Set([os.homedir(), path.join(os.homedir(), "Downloads")])];
  const files = [];
  for (const dir of dirs) {
    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith(".storyboard.json") || name.startsWith(".")) continue;
      try {
        const st = await fsp.stat(path.join(dir, name));
        if (st.isFile()) files.push({ path: path.join(dir, name), name, dir, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* 刚被删掉的就算了 */
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  sendJson(res, 200, { ok: true, files: files.slice(0, 30) });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    send(res, 400, "Bad Request\n", { "Content-Type": "text/plain" });
    return;
  }

  if (url.pathname === "/api/file") {
    try {
      await handleFileApi(req, res, url);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      sendJson(res, status, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (url.pathname === "/api/list") {
    try {
      await handleListApi(res);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed\n", { "Content-Type": "text/plain" });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, "Bad Request\n", { "Content-Type": "text/plain" });
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    send(res, 403, "Forbidden\n", { "Content-Type": "text/plain" });
    return;
  }
  stat(file, (err, st) => {
    if (err || !st.isFile()) {
      send(res, 404, `Not found: ${pathname}\n`, { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": st.size,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.log(`storyboard 已在 http://127.0.0.1:${port}/ 运行`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`storyboard: http://127.0.0.1:${port}/`);
  console.log(`root: ${root}`);
  console.log(`可读写分镜文件的目录: ${fileRoots.join(", ")}`);
});
