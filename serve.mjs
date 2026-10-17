#!/usr/bin/env node
// 零依赖静态服务：node serve.mjs [port] [root]
// 默认 5219 端口、dist/ 目录；禁用缓存，方便本地反复构建。
import http from "node:http";
import { stat, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5219);
const root = path.resolve(process.argv[3] || path.join(here, "dist"));

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

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed\n", { "Content-Type": "text/plain" });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
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
});
