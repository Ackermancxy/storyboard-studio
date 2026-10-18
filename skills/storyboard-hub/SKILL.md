---
name: storyboard
version: 1.1.0
description: 为摄影师设计拍摄脚本/分镜（storyboard、分镜、机位、景别、拍摄计划、剧照构思），并在这台机器上安装/启动配套的 3D 分镜工具。本包是引导器：工具与完整 skill 都在 GitHub，按下面步骤下载并安装。当用户要求设计拍摄方案、画分镜、规划机位姿势布光，或安装分镜工具时使用。
---

# 分镜生成器（引导包）

**本包不含代码，只是一个引导器。** 完整的 3D 分镜工具和完整版 skill（schema、校验器、骨架验收、创作思路、样板）都在 GitHub 仓库里。你的任务：把它们下载到本机并安装。安装器会自动用仓库里的完整版 skill 覆盖本文件（旧版备份到 `~/.claude/skill-backups/`），之后一切按完整版执行。

## 安装（agent 执行）

前提：Node.js >= 20.19（推荐 22 LTS）+ 支持 WebGL 的浏览器。

1. 判断是否已装过：`~/.local/share/storyboard` 存在（Windows 为 `%USERPROFILE%\.local\share\storyboard`）→ 已装过，跳到「更新」。
2. 确认 Node：`node -v`。没有就按平台先装：
   - macOS：`brew install node`
   - Windows：`winget install OpenJS.NodeJS.LTS`
   - Debian/Ubuntu：`sudo apt install nodejs npm`
   - Arch：`sudo pacman -S nodejs npm`
   - 其他：<https://nodejs.org/>
3. 下载完整包（任选一种）：
   - `git clone https://github.com/Ackermancxy/storyboard-studio.git ~/.local/share/storyboard`
   - 没有 git：打开 <https://github.com/Ackermancxy/storyboard-studio> → Code → Download ZIP，解压到同一位置。
4. 一键安装：
   ```bash
   cd ~/.local/share/storyboard
   node scripts/install.mjs
   ```
   它会：安装依赖 → 构建应用 → 把仓库里的完整版 skill 安装到 `~/.claude/skills/storyboard`（覆盖本引导包）→ 创建启动器。
5. 启动 `~/.local/bin/storyboard`（Windows：`%LOCALAPPDATA%\storyboard\storyboard.cmd`），打开 **http://127.0.0.1:5219/**（必须用 `http://`）。
6. 安装完成后**重新读取** `~/.claude/skills/storyboard/SKILL.md`，之后的分镜创作、校验、验收全按完整版执行。本包里没有 schema 和校验器，不要凭本包直接写分镜 JSON。

如果当前 agent 不能执行系统命令，把上面命令原样交给用户执行。

## 更新（已装过）

```bash
cd ~/.local/share/storyboard   # Windows: %USERPROFILE%\.local\share\storyboard
git pull --ff-only
node scripts/install.mjs --skill-only   # 只更新 skill
node scripts/install.mjs                # 或连同应用一起构建更新
```

刷新 http://127.0.0.1:5219/。用户在创作中途时先告知有更新，不要自动 pull。

## 装不了时

Node 装不上、克隆/下载失败时，如实告诉用户卡在哪一步、贴出报错。没有本地校验器就不要产出分镜 JSON——写出来也无法验收。Node 可用但没有 git 时，走 Download ZIP 路径；两者都不可用时，可以从 <https://raw.githubusercontent.com/Ackermancxy/storyboard-studio/master/skills/storyboard/references/schema.md> 取 schema 参考，但成品必须等工具装好并跑过 `validate.js` / `analyze.js` 才算数。
