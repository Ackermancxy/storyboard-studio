# 更新与演进

这套系统会持续更新。下面分两件事：**A. 更新已安装的版本**、**B. agent 给系统加功能时怎么改**。

## A. 更新已安装的版本

安装目录统一为 `~/.local/share/storyboard`（Windows：`$HOME\.local\share\storyboard`）。

```bash
cd ~/.local/share/storyboard
git status                     # 先确认没有本地未提交改动
git fetch origin
git log --oneline HEAD..origin/master   # 看有哪些新提交
git pull --ff-only
npm ci
npm run build
node scripts/install.mjs --skill-only   # 同步更新 skill 文档
```

然后刷新 http://127.0.0.1:5219/ 。静态服务已禁用缓存，普通刷新即可；如果页面仍是旧版，再硬刷新一次。

- `git pull --ff-only` 失败说明本地有改动：先 `git status` 看是什么。不要 `reset --hard`，不要覆盖用户正在改的文件。
- 本地模型（`public/assets/models/` 下自己的 PMX/GLB）和 `manifest.local.json` 已被 `.gitignore` 忽略，pull 不会碰它们。
- 只更新 skill、不重新构建：`node scripts/install.mjs --skill-only`。
- 需要固定在某个版本：`git checkout <tag 或 commit>`，再 `npm ci && npm run build`。

### 什么时候不要自动更新

用户在创作中途、工具里还有未保存的内容时，**先告知有更新，不要直接 pull**。schema 的增量更新通常兼容，但 UI/依赖升级可能打断工作。等用户确认后再更新。

## B. 扩展点地图

改代码前先认住一条：**JSON 是唯一数据源**（`src/types.ts`），`SceneManager.sync()` 把项目增量同步到 three 对象；机位、灯位、姿势都是语义参数，不在 JSON 里写坐标矩阵。

| 想加什么 | 主要改这里 | 还要同步 |
|---|---|---|
| 新姿势预设 | `src/data/poses.ts` | 校验器会自动读 poses.ts；更新 schema 的预设清单 |
| 新程序化道具 | `src/scene/props.ts` / `propsExtended.ts` + manifest `props` | 校验器自动读 manifest；schema 道具说明 |
| 新人物/模型 | 模型文件 + manifest `characters`（私有模型放 `manifest.local.json`） | README 模型说明 |
| 新天空/天气/地面 | `src/scene/environment.ts` 的 `SKY_PRESETS` / `GROUND_PRESETS` | `schema.md` + `validate.js` 里的 `SKIES` / `GROUNDS` 两个 Set（它们是独立副本） |
| 新关节或关节参数 | `src/types.ts` `JOINT_NAMES` + `src/scene/rig.ts` `JOINT_LIMITS` | `normalize.ts`、`validate.js` 的 `LIM`、`schema.md`、相关单测 |
| 新镜头字段 | `src/types.ts` + `normalize.ts`（给默认值/警告） | 相机求解/UI 面板、schema、样板、测试 |
| 新导出格式 | `src/export/` + `src/ui/Toolbar.ts` + `main.ts` | README/SKILL 的工具速查、导出单测 |
| 新可选择对象类型 | `Store.Selection` + `Inspector.ts` + `SceneManager.setSelected` | 视口拾取、选中高亮、面板 |

### 不变量（改的时候别破坏）

1. **新增字段必须可选**，`normalize.ts` 给默认值；老项目（localStorage 里的存档）不能因为缺字段而崩。
2. **不要重用旧 id**。必须改名时，在 `normalize.ts` 加旧 id→新 id 的映射并输出警告，而不是静默换掉。
3. **单位固定**：米、度；人物 `position` 是髋部投影 `[x,z]`；`facing 0 = +Z`。
4. **机位/灯位/构图的符号约定**由 `scene/camera.ts`、`scene/lights.ts` 的单测锁死，改公式必须同时改测试。
5. **私有资产不进 git**：模型、`manifest.local.json`、`tools/` 都应在 `.gitignore` 里。

## 必须同步的清单

任何面向使用者的改动，提交前过一遍：

- [ ] `skills/storyboard/references/schema.md`（字段、枚举、预设、道具）
- [ ] `skills/storyboard/references/validate.js`（独立维护的模型/预设/天空/地面/关节清单）
- [ ] `skills/storyboard/examples/放学后不想回家.storyboard.json`（样板仍能通过校验）
- [ ] `skills/storyboard/SKILL.md`（流程、工具速查、预设数量）
- [ ] `README.md`（特性、命令、目录）
- [ ] `npm run check`（tsc + vitest）
- [ ] `npm run build`
- [ ] 用样板跑 `node skills/storyboard/references/validate.js ...`，应输出「10 镜全部通过」
- [ ] 浏览器冒烟：打开工具、切一个环境预设、导出 PNG / 分镜表 PNG / CSV

## 版本与兼容性

- `Project.version` 目前是 `1`。**增量字段保持 1**，只靠 `normalize` 补默认值。
- 只有真正不兼容的结构变化才升到 `2`，并在 `normalize.ts`（以及 `store.loadStored`）里写迁移。
- 存档在用户浏览器 localStorage（key `storyboard.project.v1`）；改 key 等于丢弃老存档，不要轻易改。
- skill 与 app 必须同版本：更新代码后跑一次 `node scripts/install.mjs --skill-only`。

## 发布流程

```bash
npm run check && npm run build
node skills/storyboard/references/validate.js "skills/storyboard/examples/放学后不想回家.storyboard.json"
git add -A && git commit -m "feat: ..."
git push origin master
# 建议给用户可感知的版本打 tag：
git tag v1.1.0 && git push origin v1.1.0
```

## 同步到小红书 SkillHub

GitHub 是源码与安装源；小红书 SkillHub 是分发渠道。引导包如同桌面快捷方式：**日常 GitHub 更新不需要动它**，只有安装流程本身变了（clone 地址、install 步骤、平台限制、引导文案）才重发一次。

SkillHub 上发的是**引导包** `skills/storyboard-hub/`（只有一个 `SKILL.md`，不含代码）：它指引 agent 从 GitHub clone 完整仓库并跑 `scripts/install.mjs`，装好后完整版 skill（本目录）会覆盖引导包。应用代码进不了 SkillHub 包——平台只收文本扩展名（`.md .txt .html .css .js .py .sh .json` 等，不允许 `.mjs`、图片、二进制），而仓库里是 `.ts` 源码和 `.glb/.pmx/.png` 模型资源。

1. 先更新 GitHub 并 push。
2. 重发时才递增**两处** frontmatter 的 `version`（`skills/storyboard/SKILL.md` 和 `skills/storyboard-hub/SKILL.md`，两处保持一致）；日常 GitHub 更新不动版本号。
3. 打包：
   ```bash
   node scripts/pack-hub.mjs
   ```
   产出 `~/Downloads/storyboard-<version>.zip`（只有根目录一个 `SKILL.md`，自带零依赖 zip 写入器，输出含 SHA-256）。
4. 上传：**CLI `publish` 只能新建 skill，更新已有 skill 会被拒（「Skill ID 已被占用」）**。更新一律走网页控制台 <https://creator.xiaohongshu.com/new/skill-hub> → 对应 skill 卡片「更新版本」→ 传 zip → 选「Skill源码为原创」→ 下一步 → 核对版本号与标签 → 提交。参数已固定（用户 2026-10-18 永久授权自动提交，不再逐次确认）：source=原创，标签=编程开发、内容创作。
5. 发布后记录回执里的 `version_id`、`audit_request_id`；凭证在 `~/.skillhub-upload/prod`，不要提交到仓库。

当前线上：skill_id `101481`，首发版本 `1.0.0` / version_id `107868`（完整 skill 形态）；`1.1.0` 起改为引导包形态。

## 维护注意（踩过的坑）

- **lockfile**：重新生成时务必用公共 registry（`npm install --package-lock-only --registry=https://registry.npmjs.org/`）。npm 12 会拒绝 npmmirror 的 remote tarball，别人 clone 后 `npm ci` 会直接失败。
- **离屏渲染器**：每次导出新建的 `OffscreenRenderer` 用完必须 `dispose()` + `forceContextLoss()`，否则连续导出会耗尽 WebGL 上下文、标签页崩溃。
- **缩略图捕获**：只在 `renderer.render()` 那一帧隐藏 gizmo，不能整段异步捕获期间一直隐藏，否则导演视图里长时间看不到相机和灯位。
- **导演视图**：机位在墙外会被挡住，`viewport.ensureDirectorView()` 会在进入导演视图时自动找越过墙顶的高位。
- **Windows 路径**：应用和校验器统一用 `~/.local/share/storyboard`；启动器在 `%LOCALAPPDATA%\storyboard\storyboard.cmd`。
