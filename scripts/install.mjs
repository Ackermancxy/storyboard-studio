#!/usr/bin/env node
// 跨平台安装器：构建应用 + 安装 skill + 创建启动器。
// 用法：node scripts/install.mjs [--skill-only] [--no-launcher] [--dry-run]
//        [--skill-dir <dir>] [--port <port>]
import { chmodSync, cpSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dry = has("--dry-run");
const skillOnly = has("--skill-only");
const noLauncher = has("--no-launcher");
const port = opt("--port") || "5219";
const isWin = platform() === "win32";
const isMac = platform() === "darwin";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`需要 Node.js >= 20.19（当前 ${process.versions.node}）。推荐 Node 22 LTS。`);
  process.exit(1);
}

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  if (dry) return true;
  const r = spawnSync(cmd, args, { cwd: repo, stdio: "inherit", shell: isWin });
  if (r.error) {
    console.error(String(r.error));
    return false;
  }
  return r.status === 0;
}

console.log(`storyboard 安装器`);
console.log(`  仓库: ${repo}`);
console.log(`  平台: ${platform()} / Node ${process.versions.node}`);
if (dry) console.log(`  模式: dry-run（只打印，不改文件）`);

/* 1. 构建应用 */
if (!skillOnly) {
  if (!run("npm", ["ci"])) {
    console.log("npm ci 失败，改用 npm install");
    if (!run("npm", ["install"])) {
      console.error("依赖安装失败。");
      process.exit(1);
    }
  }
  if (!run("npm", ["run", "build"])) {
    console.error("构建失败。");
    process.exit(1);
  }
}

/* 2. 安装 skill */
const skillSrc = join(repo, "skills", "storyboard");
const skillDest = opt("--skill-dir") || join(homedir(), ".claude", "skills", "storyboard");
if (!existsSync(skillSrc)) {
  console.error(`找不到 skill 目录：${skillSrc}`);
  process.exit(1);
}
console.log(`\n安装 skill → ${skillDest}`);
if (!dry) {
  if (existsSync(skillDest)) {
    // 备份不能放在 skills/ 目录里，否则会被 agent 当成第二个同名 skill
    const backupDir = join(homedir(), ".claude", "skill-backups");
    const backup = join(backupDir, `storyboard-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    mkdirSync(backupDir, { recursive: true });
    renameSync(skillDest, backup);
    console.log(`  已有 skill 已备份到 ${backup}`);
  }
  mkdirSync(dirname(skillDest), { recursive: true });
  cpSync(skillSrc, skillDest, { recursive: true });
}

/* 3. 启动器 */
function posixLauncher() {
  const binDir = join(homedir(), ".local", "bin");
  const file = join(binDir, "storyboard");
  const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const body = `#!/usr/bin/env bash
set -e
ROOT=${q(repo)}
PORT=${q(port)}
URL="http://127.0.0.1:$PORT/"

check() {
  node -e "fetch(process.argv[1]).then(()=>process.exit(0)).catch(()=>process.exit(1))" "$URL" >/dev/null 2>&1
}

if ! check; then
  nohup node "$ROOT/serve.mjs" "$PORT" "$ROOT/dist" >/dev/null 2>&1 &
  i=0
  while [ "$i" -lt 30 ]; do
    check && break
    sleep 0.2
    i=$((i + 1))
  done
fi

if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
else echo "打开 $URL"; fi
`;
  console.log(`\n创建启动器 → ${file}`);
  if (!dry) {
    mkdirSync(binDir, { recursive: true });
    writeFileSync(file, body, { mode: 0o755 });
    chmodSync(file, 0o755);
  }
  const pathDirs = (process.env.PATH || "").split(":");
  if (!pathDirs.includes(binDir)) {
    console.log(`  提示：${binDir} 不在 PATH 里，可把下面一行加进 shell 配置：`);
    console.log(`    export PATH="$HOME/.local/bin:$PATH"`);
  }
  return file;
}

function windowsLauncher() {
  const base = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const dir = join(base, "storyboard");
  const file = join(dir, "storyboard.cmd");
  const body = `@echo off
setlocal
set "ROOT=${repo}"
set "PORT=${port}"
start "storyboard server" /MIN node "%ROOT%\\serve.mjs" %PORT% "%ROOT%\\dist"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
endlocal
`;
  console.log(`\n创建启动器 → ${file}`);
  if (!dry) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, body);
  }
  return file;
}

let launcher = "";
if (!noLauncher) {
  launcher = isWin ? windowsLauncher() : posixLauncher();
}

/* 4. Linux 应用菜单项（可选） */
if (!isWin && !isMac && !noLauncher && !dry) {
  const desktopDir = join(homedir(), ".local", "share", "applications");
  const desktopFile = join(desktopDir, "storyboard.desktop");
  mkdirSync(desktopDir, { recursive: true });
  writeFileSync(
    desktopFile,
    `[Desktop Entry]\nType=Application\nName=分镜生成器\nComment=3D storyboard editor\nExec="${join(homedir(), ".local", "bin", "storyboard")}"\nTerminal=false\nCategories=Graphics;\n`,
  );
  console.log(`创建桌面菜单项 → ${desktopFile}`);
}

console.log(`\n完成。`);
console.log(`  应用目录: ${repo}`);
console.log(`  skill:    ${skillDest}`);
if (launcher) console.log(`  启动器:   ${launcher}`);
console.log(`  启动:     ${launcher || `node ${join(repo, "serve.mjs")} ${port} ${join(repo, "dist")}`}`);
console.log(`  网址:     http://127.0.0.1:${port}/`);
console.log(`  样板:     ${join(skillDest, "examples", "放学后不想回家.storyboard.json")}`);
