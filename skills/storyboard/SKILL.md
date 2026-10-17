---
name: storyboard
version: 1.0.2
description: 为摄影师设计拍摄脚本/分镜（storyboard、分镜、机位、景别、拍摄计划、剧照构思），并在这台机器上安装/启动配套的 3D 分镜工具。产出一个 .storyboard.json，用户在工具里打开、微调、导出分镜表。当用户要求设计拍摄方案、画分镜、规划机位姿势布光，或安装分镜工具时使用。
---

# 分镜生成器

一套「JSON 是唯一数据源」的 3D 分镜工具 + 写作 skill。分两件事：**A. 部署工具**（新机器第一次用）、**B. 写分镜**（每次创作）。

## A. 部署（agent 执行）

前提：Node.js >= 20.19（推荐 22 LTS）+ 支持 WebGL 的浏览器。

1. 确认 Node：`node -v`。没有就按平台安装：
   - macOS：`brew install node`
   - Windows：`winget install OpenJS.NodeJS.LTS`
   - Debian/Ubuntu：`sudo apt install nodejs npm`
   - Arch：`sudo pacman -S nodejs npm`
   - 其他：<https://nodejs.org/>
2. 获取代码（任选一种）：
   - `git clone https://github.com/Ackermancxy/storyboard-studio.git ~/.local/share/storyboard`
   - 没有 git：下载 ZIP 解压到同一位置（Windows 为 `%USERPROFILE%\.local\share\storyboard`）
3. 一键安装：
   ```bash
   cd <代码目录>
   node scripts/install.mjs
   ```
   它会：安装依赖 → 构建 → 把本 skill 复制到 `~/.claude/skills/storyboard` → 创建启动器。
4. 启动：
   - macOS / Linux：`~/.local/bin/storyboard`（或 `npm start`）
   - Windows：`%LOCALAPPDATA%\storyboard\storyboard.cmd`
   - 固定网址 **http://127.0.0.1:5219/**（必须用 `http://`，不要用 https）
5. 模型：仓库自带程序化人物和 Xbot 测试模型。自己的 PMX/GLB 放 `public/assets/models/`，在 `public/assets/manifest.local.json` 里覆盖或追加（格式见 `references/deploy.md`）。该文件不进 git。

> 如果当前 agent 不能执行系统命令，把上面命令原样交给用户执行。详细的三端排错见 `references/deploy.md`。

## B. 写分镜（每次）

1. 问清或自行补齐：拍摄主题、场景、人数、画幅（默认 3:2）、时长节奏。
2. 按 `references/schema.md` 写完整项目 JSON。每镜独立写全（人物/道具/灯光/相机/环境），不继承上一镜。
3. 跑校验（零依赖，node 直跑）：
   ```bash
   node <skill目录>/references/validate.js <json文件>
   ```
   检查模型 id / 预设 / 景别 / 灯角色 / 关节越界 / subject 引用 / id 重复 / 天空地面预设。
4. 存到 `~/Downloads/<标题>.storyboard.json`，给用户绝对路径。
5. 告诉用户：启动工具 → 工具栏「打开」选该文件；或点「绑定文件」把该路径绑上——之后微调会实时写回，你直接编辑同一个 JSON 时页面也会自动刷新（保留当前镜头和选中项）。样板见 `examples/放学后不想回家.storyboard.json`。

## C. 更新与演进

仓库会持续更新。更新已安装版本：

```bash
cd ~/.local/share/storyboard   # Windows: $HOME\.local\share\storyboard
git pull --ff-only
npm ci
npm run build
node scripts/install.mjs --skill-only
```

刷新 http://127.0.0.1:5219/。用户在创作中途时先告知有更新，不要自动 pull。

给系统加功能、改 schema、加预设/道具/天气/导出之前，先读 `references/updating.md`：里面有扩展点地图、必须同步的清单、兼容性规则和发布流程。核心不变量：JSON 是唯一数据源；新增字段必须可选并有默认值；不重用旧 id；改完必须跑 `npm run check`、`npm run build`，并用样板跑一次校验。

**小红书 SkillHub 同步**：GitHub 更新后，按 `references/updating.md` 的「同步到小红书 SkillHub」章节重新发布。每次发布先把本文件 frontmatter 的 `version` 递增（当前 1.0.2），展示完整确认卡，只有用户明确回复「提交」后才 submit。

## 写法要点（容易错的）

- **机位用语义参数**：shotSize（ECU 大特写/CU 特写/MCU 近景/MS 中景/MLS 中全景/FS 全景/WS 远景/EWS 大远景）+ azimuth（相对被摄者朝向，0 正面 +90 拍其左侧 -90 拍其右侧 180 背后）+ angle（eye/high/low/overhead/worm）或 elevation + placement（center/left-third/right-third）+ focalLength（等效全画幅 mm）。不手写相机坐标，程序会求解。
- **姿势先预设再微调**：`"pose": {"preset": "sit_chair", "joints": {"head": {"turn": 20}}}`。预设清单见 schema.md。`gaze: "camera"` 让人物看镜头。
- **每镜带环境**：`"environment": {"sky": "clear-sunset", "ground": "wood"}`。天空/地面预设共 10+10 种，见 schema.md。室内也建议写，窗外的天色和地板材质会明显影响画面。
- **镜头要有变化**：不要全是正面中景。景别/焦段/机位角至少动两个。
- **灯光写实**：三点光起步（key 45°/35°、fill -45°/15° 强度 0.3–0.5、rim 150–165°/40°），色温按场景（夕阳 3200K、日光 5600K、夜景街灯 3200K 配 8000K 环境冷调）。
- description 写给摄影师看（画面/情绪/构图意图），notes 写实拍要点（测光、快门、色温、时机）。
- 坐标单位米，人物 position 是髋部投影 [x,z]，facing 0=面向 +Z。坐椅子时人和椅子同位。

## 创作思路

写分镜前先读 `references/photographic-approach.md`。要点：

- 先写一句话情绪，再选地点与时段；地点是为情绪服务的。
- 人是情绪的载体，不一定要占大画面：远景留白、框中框、局部、背影、不入镜都可以。
- 动作静多动少，动感靠道具（伞、裙摆、飘带、经过的列车）。
- 构图靠前景遮挡、线条引导、框中框和留白，每组一个主色加一个对比色。
- 一组内地点固定时换机位和道具，并留一张「意外」的非人镜头。

## 工具速查（要告诉用户的）

- Tab 机位/导演视图切换，T 俯视灯位图，数字键 1–9 跳镜头，? 快捷键帮助
- 导演视图里拖绿方块改机位（自动转手动模式），拖人物/道具改位置朝向；进入导演时若机位被墙挡住会自动换高位
- 右侧对象列表选「环境」改天空/天气与地面预设；每镜独立
- 「导出PNG」单镜 / 「分镜表 PNG」A4 逐行表格（效果图 + 灯位图 + 机位 + 人物道具环境 + 描述备注）/ 「分镜表 CSV」一行一镜，Excel/WPS 可编辑 / 「灯位图」俯视布光图
- 在工具里改完想继续改：点「保存」把项目 JSON 发回来

## 文件

- `references/schema.md`：完整 JSON 规格、景别表、关节范围、天空地面预设
- `references/validate.js`：零依赖校验器（自动寻找工具目录，也可用 `STORYBOARD_ROOT` 指定）
- `references/photographic-approach.md`：人像摄影的创作思路
- `references/deploy.md`：macOS / Windows / Linux 安装、模型、排错
- `references/updating.md`：更新已安装版本、扩展点地图、兼容性与发布流程
- `examples/放学后不想回家.storyboard.json`：10 镜完整样板
