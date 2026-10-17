# 三端安装与部署

## 系统要求

- **Node.js >= 20.19**（推荐 22 LTS）
- 支持 WebGL 2 的浏览器（Firefox / Chrome / Edge / Safari 16+）
- 不需要 Python、不需要数据库；构建完成后只有一个静态目录 `dist/`

## 方式一：一键安装（推荐）

```bash
git clone https://github.com/Ackermancxy/storyboard-studio.git ~/.local/share/storyboard
cd ~/.local/share/storyboard
node scripts/install.mjs
```

安装器会：

1. `npm ci`（失败自动退回 `npm install`）
2. `npm run build` → `dist/`
3. 把 `skills/storyboard` 复制到 `~/.claude/skills/storyboard`（已有会先备份）
4. 创建启动器：
   - macOS / Linux：`~/.local/bin/storyboard`
   - Windows：`%LOCALAPPDATA%\storyboard\storyboard.cmd`
5. Linux 额外写入 `~/.local/share/applications/storyboard.desktop`

常用参数：

```bash
node scripts/install.mjs --dry-run       # 只打印将做什么
node scripts/install.mjs --skill-only    # 只安装 skill，不重新构建
node scripts/install.mjs --no-launcher   # 不创建启动器
node scripts/install.mjs --skill-dir /path/to/skills/storyboard
node scripts/install.mjs --port 5300
```

## 方式二：手动

```bash
npm ci
npm run build
node serve.mjs 5219 dist
# 浏览器打开 http://127.0.0.1:5219/
```

`serve.mjs` 是零依赖 Node 静态服务，macOS / Windows / Linux 通用。端口和目录都可以改：
`node serve.mjs 5300 dist`。

### Windows

PowerShell 里同样执行上面三条命令。启动器是 `%LOCALAPPDATA%\storyboard\storyboard.cmd`，双击即可。
如果公司策略禁止脚本，直接：

```powershell
cd $env:LOCALAPPDATA\storyboard
node serve.mjs 5219 dist
```

### macOS

```bash
brew install node
git clone https://github.com/Ackermancxy/storyboard-studio.git ~/.local/share/storyboard
cd ~/.local/share/storyboard && node scripts/install.mjs
~/.local/bin/storyboard
```

### Linux

```bash
sudo pacman -S nodejs npm        # Arch
sudo apt install nodejs npm      # Debian/Ubuntu
sudo dnf install nodejs npm      # Fedora
```

然后同上。启动器用 `xdg-open` 打开浏览器。

## skill 安装到其他 agent

本目录就是一个标准 Agent Skill（`SKILL.md` + `references/` + `examples/`）。把它放进对应 agent 的 skills 目录即可：

- Claude Code：`~/.claude/skills/storyboard/`
- 项目级：`<项目>/.claude/skills/storyboard/`
- 其他支持 Agent Skills 的工具：放进它约定的 skills 目录

skill 本身只负责「写分镜 + 指导部署」；3D 工具代码仍在仓库里。换机器时先 clone 仓库并运行安装器。

## 模型（不随仓库分发）

仓库自带：

- `mikoto`：程序化女生木偶
- `man` / `child`：程序化男性/儿童木偶
- `xbot`：Mixamo 测试用 GLB（`public/assets/models/Xbot.glb`）

自己的模型：

1. 把模型放进 `public/assets/models/`（PMX 的贴图路径按原目录结构一起放）
2. 新建 `public/assets/manifest.local.json`（已加入 `.gitignore`），按 id 覆盖或追加：

```json
{
  "characters": [
    {
      "id": "mikoto",
      "name": "女生",
      "type": "mmd",
      "file": "models/mikoto/model.pmx",
      "height": 1.56,
      "rotateY": 0,
      "boneMap": "mmd",
      "hideTextures": ["下着", "水着"]
    },
    {
      "id": "hero",
      "name": "主角",
      "type": "gltf",
      "file": "models/hero.glb",
      "height": 1.80,
      "rotateY": 0,
      "boneMap": "mixamo"
    }
  ]
}
```

- GLB 需要骨骼；Mixamo 骨架可直接 `"boneMap": "mixamo"`，也可以传关节名映射对象
- 模型文件不要提交到公开仓库（版权/体积）
- 改完重新 `npm run build`（`public/` 会复制进 `dist/`）

## 排错

| 现象 | 处理 |
|---|---|
| 页面空白/红条 | 打开浏览器控制台看第一条错误；多半是模型 404 或 WebGL 不可用 |
| 模型显示成红盒子 | `manifest.local.json` 里的 `file` 路径大小写/中文名不匹配；确认文件在 `public/assets/models/` 下 |
| 端口被占用 | `node serve.mjs 5300 dist`，启动器参数 `--port 5300` |
| `npm ci` 报 lock 不一致 | 改用 `npm install` |
| Node 版本太旧 | `nvm install 22 && nvm use 22`，或平台包管理器升级 |
| 远程机器打不开 | 服务只监听 `127.0.0.1`；用 SSH 隧道 `ssh -L 5219:127.0.0.1:5219 host` |
| 中文文件名 404 | 用仓库自带的 `serve.mjs`（会 `decodeURIComponent`），别用某些简易静态服务器 |

## 更新

```bash
cd <代码目录>
git pull
npm ci
npm run build
```

skill 有变化时再跑一次 `node scripts/install.mjs --skill-only`。

## 卸载

删除代码目录、`~/.local/bin/storyboard`（或 Windows 的 `%LOCALAPPDATA%\storyboard`）、`~/.claude/skills/storyboard` 即可。
