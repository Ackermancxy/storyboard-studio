#!/usr/bin/env node
// 实测骨架验收器入口：node analyze.js <分镜.json> [选项]
// 转发到工具目录里的 tools/pose-analysis/analyze.mjs。
// 工具目录查找顺序：STORYBOARD_ROOT → 仓库内相对位置 → 常见安装位置。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  process.env.STORYBOARD_ROOT,
  resolve(HERE, "../../.."),
  join(homedir(), "storyboard"),
  join(homedir(), ".local", "share", "storyboard"),
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "storyboard") : null,
  join(homedir(), "AppData", "Local", "storyboard"),
].filter(Boolean);

const APP = CANDIDATES.find((p) => existsSync(join(p, "tools", "pose-analysis", "analyze.mjs")));
if (!APP) {
  console.error("找不到 pose-analysis 工具目录。请设置 STORYBOARD_ROOT，或确认工具版本包含 tools/pose-analysis/。");
  process.exit(2);
}

const tool = join(APP, "tools", "pose-analysis", "analyze.mjs");
const r = spawnSync(process.execPath, [tool, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
