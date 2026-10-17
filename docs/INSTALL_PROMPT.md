# 给 Agent 的安装 Prompt

把下面整段复制给任意支持文件/命令执行的 agent（Claude Code、Codex、Cursor 等）：

```text
你现在要从 GitHub 安装并部署「Storyboard Studio 分镜生成器」及其 Agent Skill，安装完成后按 skill 的说明工作。

仓库：https://github.com/Ackermancxy/storyboard-studio

按以下步骤执行，不要跳步：

1. 检查 Node.js（需要 >= 20.19，推荐 22 LTS）：
   node -v
   没有或版本过低时按平台安装：
   - macOS: brew install node
   - Windows: winget install OpenJS.NodeJS.LTS
   - Debian/Ubuntu: sudo apt install nodejs npm
   - Arch: sudo pacman -S nodejs npm

2. 选定安装目录（各平台统一）：
   macOS/Linux: ~/.local/share/storyboard
   Windows PowerShell: $HOME\.local\share\storyboard
   如果目录已经是 git 仓库，先 git -C <目录> pull 更新；不要重复 clone。

3. 克隆仓库（目录不存在时）：
   macOS/Linux:
     mkdir -p ~/.local/share
     git clone https://github.com/Ackermancxy/storyboard-studio.git ~/.local/share/storyboard
   Windows PowerShell:
     New-Item -ItemType Directory -Force "$HOME\.local\share" | Out-Null
     git clone https://github.com/Ackermancxy/storyboard-studio.git "$HOME\.local\share\storyboard"

4. 一键安装：
   cd <安装目录>
   node scripts/install.mjs
   如果你的 agent 不使用 ~/.claude/skills/storyboard，改成：
   node scripts/install.mjs --skill-dir <你的 skills 目录>/storyboard
   安装器会执行 npm ci、npm run build，把 skills/storyboard 复制到目标目录，并创建启动器：
   macOS/Linux: ~/.local/bin/storyboard
   Windows: %LOCALAPPDATA%\storyboard\storyboard.cmd

   如果安装器失败，手动兜底：
   npm ci
   npm run build
   然后把 <安装目录>/skills/storyboard 整个复制到你的 skills 目录。

5. 必须完成以下验证：
   node scripts/install.mjs --dry-run
   node skills/storyboard/references/validate.js skills/storyboard/examples/放学后不想回家.storyboard.json
   期望看到「10 镜全部通过」。
   启动并用 HTTP 检查（端口 5219 返回 200）：
   macOS/Linux: ~/.local/bin/storyboard
   Windows: %LOCALAPPDATA%\storyboard\storyboard.cmd
   浏览器访问 http://127.0.0.1:5219/

6. 把 skills/storyboard/SKILL.md、references/ 和 examples/ 加载为你的 Agent Skill。之后用户要求画分镜、规划机位/姿势/灯光时，严格按 SKILL.md 与 references/schema.md 执行，交付前运行 validate.js。

7. 汇报：安装目录、skill 路径、启动器路径、Node 版本、验证结果、访问 URL。

约束：
- 只用 http://127.0.0.1:5219/，不要用 https。
- 不要修改仓库源码，不要提交或推送。
- 仓库不带第三方私有角色模型；不要尝试下载，默认用内置程序化人物与 Xbot。
- Windows 用 PowerShell 执行同样的 node 命令。
```
