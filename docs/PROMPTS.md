# 分镜生成器 · 分阶段提示词

## 用法

- 每个阶段开新会话（或 `/clear`），先贴「通用前置」，再贴该阶段提示词。
- 做完按验收清单自己在浏览器里看；不对就截图 + 描述扔回同一个会话修，全部通过再进下一阶段。
- 每阶段完成后 git commit 一次，坏了能回退。
- 遇到「方向反了」（转头往左、机位跑到另一侧），基本都是符号约定问题，让模型对照 SPEC §5.2 / §7.2 改，并补单测锁死。

---

## 通用前置（每次都贴）

```
你在实现一个基于 three.js 的简易分镜生成器，项目目录 ~/storyboard。
权威规格是 ~/storyboard/SPEC.md，开始前完整读一遍，严格遵守其中的数据结构、坐标与正负号约定、目录结构和依赖限制。
规则：
1. 只做本阶段列出的内容，不提前实现后续阶段，不重构无关代码。
2. 不新增 SPEC §1 以外的依赖；安装时用精确版本号。
3. TypeScript strict。`npm run check`（tsc --noEmit + vitest run）和 `npm run build` 都通过才算完成。
4. 数学、求解、解析类纯函数必须写单测。
5. SPEC 没写清或与实现冲突时，选最简单方案并在汇报里列出；不要静默改 SPEC 的约定。
6. 完成后汇报：做了什么、改了哪些文件、我该怎么在浏览器里验证、已知问题。
```

---

## P0 脚手架

```
阶段 P0：项目脚手架。
- 创建 ~/storyboard，用 Vite 的 vanilla-ts 模板初始化（不要 React）。
- 把 ~/Downloads/storyboard-SPEC.md 复制为 ~/storyboard/SPEC.md，把 ~/Downloads/storyboard-PROMPTS.md 复制为 ~/storyboard/docs/PROMPTS.md。git init。
- 安装 three、@types/three、lil-gui、vitest（精确版本）。package.json 脚本：dev、build、preview、check。
- 按 SPEC §2 建好目录和占位文件；types.ts 写全 SPEC §4 的类型，以及 JointName、ShotSize 等枚举常量数组。
- index.html + main.ts 搭出 SPEC §9 的布局骨架（CSS Grid，深灰主题，中文占位）。
- 视口：地面网格（1m 一格，5m 粗线）、HemisphereLight、一个 1.7m 高的参考柱体、OrbitControls、按需渲染（SPEC §3），窗口缩放正确。
验收：npm run dev 能看到布局和可旋转的 3D 网格；npm run check 通过。
```

## P1 木头人 + 姿势引擎

```
阶段 P1：人物骨架与姿势引擎（SPEC §5，§5.6 gaze 留到 P3）。
- scene/rig.ts：Rig / RigJoint 接口；resolvePose（预设 + 覆盖 → 每关节完整参数，clamp 到 §5.2 范围）；applyPose。必须走 §5.4 通用公式 local = restLocal·(R⁻¹·q·R)，不许写死木头人。
- 四肢用 §5.3 的 swing-twist 公式；躯干/头用局部 Euler。
- scene/mannequin.ts：按 §5.5 生成 male / female / child 三种体型，返回 Rig；鼻锥明显；实现 autoGround。
- data/poses.ts：§5.7 全部预设。表里的数值只是起点，请逐个在浏览器里调到自然（不穿模、重心可信）。
- 临时调试 UI（P2 会替换）：视口放一个木头人；右侧 lil-gui：体型、预设下拉、17 个关节分组折叠的滑杆（实时生效）、「镜像左右」按钮（规则见 §9）。
- 单测：§5.3 方向公式（T-pose → ±X、向前指 → +Z、举手 → +Y）；符号约定（head turn +30 后鼻尖偏向人物右侧即 -X；spine bend + 后头部 z 增大；elbow bend 后前臂朝 +Z；knee bend 后小腿朝 -Z）；clamp；镜像。
验收：
□ 每个预设姿势符合中文名，坐/跪/躺都正确着地
□ 滑杆方向与 §5.2 文字描述一致（例：head turn 正值 = 人物往自己右边看）
□ 三种体型肉眼可辨
```
## P2 数据模型 + 镜头列表 + 道具

```
阶段 P2：把临时 UI 换成数据驱动架构（SPEC §3、§4、§6、§9）。
- state/store.ts：持有 Project、当前镜头 index、当前选中对象；subscribe/emit；快照式撤销重做（Ctrl+Z / Ctrl+Shift+Z）；localStorage 自动保存与启动恢复。无存档时载入示例项目（2 镜：一人站立全景、一人坐椅子中景）。
- public/assets/manifest.json + scene/assets.ts：写入三种程序化人物和 §6.2 全部道具。gltf 类型此阶段先显示占位盒。
- scene/props.ts：§6.2 全部程序化道具，现实尺寸。
- scene/SceneManager.ts：按 id 增量同步 actors / props；切换镜头时同步整镜。
- ui/ShotList：缩略图（此阶段用固定默认视角渲染，P3 再换机位视图）、新增 / 复制 / 删除 / 拖拽排序、点击切换。
- ui/Inspector：对象列表 + 人物 / 道具属性面板（关节滑杆从 P1 迁移）。滑杆拖动中实时预览，松手才入撤销栈。
- 视口点选：射线拾取 → 选中高亮；TransformControls 平移（仅 XZ）/ 旋转（仅 Y，写回 facing）；W / E 切换，Delete 删除。
- 底部描述 / 备注文本框绑定当前镜头。
验收：
□ 增删改镜头、人物、道具，刷新页面后都还在
□ 撤销 / 重做覆盖以上全部操作
□ 视口拖动人物后面板数值同步，改面板数值视口同步
```

## P3 相机系统

```
阶段 P3：相机（SPEC §7 全部 + §5.6 gaze）。
- scene/camera.ts 纯函数：焦段 → FOV（filmGauge 36）；solveCamera（景别表、方位、angle 映射、placement、roll、最低高度）。
  单测至少包括：FS + 50mm + 1.7m 人的距离符合公式；facing 0 + azimuth 90 → 相机 x > 0；high → 相机高于目标；left-third 偏移方向。
- 三种视图（机位 / 导演 / 俯视），Tab 与 T 切换；机位视图 letterbox + 三分线 + 中心十字 + HUD，可开关。
- 导演视图画出当前镜头相机和视锥线框；相机可选中拖动 → 转 manual；面板「回到自动机位」。
- 相机属性面板按 SPEC §9；画幅在工具栏（项目级）。
- gaze：人物面板加「看镜头 / 看某人 / 无」。
- 缩略图改为机位视图渲染。
验收：
□ 同一人物 ECU → EWS 逐档切换，取景符合 §7.2 表（CU 到肩、MS 到腰、FS 全身留余量）
□ 24mm 与 135mm 同景别对比，透视和背景压缩差异明显
□ left-third 时人物落在左三分线
□ 设了看镜头的人物在机位视图里脸正对镜头
```

## P4 灯光

```
阶段 P4：灯光（SPEC §4.4）。
- scene/lights.ts：色温 → RGB（Tanner Helland 近似；单测 2700K 偏橙、6500K 接近白）；按 azimuth / elevation / distance 相对 subject 放置，方位规则同 §7.2。
- key 灯带阴影（PCFSoftShadowMap，soft 时 shadow.radius 大）；其余灯默认不投阴影；始终保留一盏弱 HemisphereLight 防止死黑。
- 新建镜头默认三点光：key 45°/35°、fill -45°/15° 强度 0.4、rim 160°/40°。
- 导演 / 俯视视图里画出灯位和照射方向（showStand 时用 light_stand 道具）。灯的属性面板可编辑全部字段。
- 工具栏「阴影」开关。
验收：
□ 改 key 的 azimuth，人物明暗面跟着转；改色温颜色明显变化
□ 俯视视图看得清每盏灯的位置和指向
```
## P5 导入导出 + AI 提示词

```
阶段 P5：SPEC §4.6、§8、§10。
- state/normalize.ts 完整实现 §4.6，单测覆盖：围栏、前后有废话、尾逗号、注释、缺字段、越界、未知 model / preset、只有 shots 数组、单个 shot。
- 导入弹窗：粘贴 → 解析 → 显示中文警告 → 替换项目 / 追加镜头。
- ai/prompt.ts：读 docs/PROMPTS.md「B」节的模板（构建时以字符串内联进代码即可），替换 {{CHARACTERS}} {{PROPS}} {{POSES}}。工具栏「复制 AI 提示词」「复制当前项目给 AI 修改」。
- export/：单镜 PNG、分镜表 PNG、俯视灯位图、项目文件保存 / 打开（§10）。
验收：
□ 把 docs/PROMPTS.md「C」节示例 JSON 粘进来，3 个镜头全部正确生成
□ 故意弄坏的 JSON（加围栏、删字段、写错 preset）也能导入，并给出中文警告
□ 分镜表 PNG 排版清晰，中文不溢出格子
```

## P6 GLTF 模型

```
阶段 P6：外部模型（SPEC §5.4、§6.1）。
- assets.ts 支持 gltf：GLTFLoader 懒加载 + 缓存，SkeletonUtils.clone 克隆，加载中显示占位盒，加载失败显示红色占位盒并在界面提示。
- 从 boneMap 构建 Rig：读取静止姿态得到 restLocal、restRootFrame（R）、四肢 restDir；内置 "mixamo" 骨骼名表。
- 按 manifest 的 height 缩放、rotateY 修正朝向；道具按 scale。
- 用 three.js 仓库 examples/models/gltf/Xbot.glb 实测（下载不了就告诉我放到哪里，我自己放）。
- 写 README：怎么加人物和道具、模型来源（SPEC §6.2）、Mixamo FBX 用 Blender 转 GLB 的步骤。
验收：
□ 同一个预设套在木头人和 Xbot 上姿势一致
□ 不改代码，只放 .glb + 改 manifest 就能新增人物和道具
```

## P7 打磨 + 启动器

```
阶段 P7：
- 「?」键弹出快捷键帮助；数字键 1–9 跳镜头；Ctrl+D 复制选中对象。
- 用户预设管理：重命名 / 删除 / 导出 / 导入。
- 性能：集显上交互流畅（阴影可关，pixelRatio 上限 2）。
- npm run build 后写启动器 ~/bin/storyboard：在 127.0.0.1 固定端口起静态服务（已在跑就复用，只监听本机），再用浏览器打开；用 setsid 启动，避免从菜单启动时被挂起。
- 按本机惯例把它加进 mlvwm 的 Apple 菜单（参照记忆里的做法）。
验收：从 Apple 菜单一键打开即可用。
```

---
## B. 给聊天 AI 的提示词模板

程序会替换 `{{...}}` 后一键复制。工具做好之前，你也可以手动把占位符换成 SPEC 里的 id 列表直接用。

````
你是一名电影/商业摄影分镜师。根据我描述的拍摄需求设计一组分镜，并且只输出一个 JSON 对象（不要任何解释）。程序会把它渲染成 3D 分镜，所以请用下面的语义参数精确表达画面，不要只写在 description 里。

【坐标】单位米，地面 y=0。舞台正面是 +Z；从正面看，+X 在画面右侧。position 写 [x, z]，指人物髋部在地面的投影（坐椅子时与椅子位置相同）。facing：0 = 面朝正面，90 = 面朝 +X，-90 = 面朝 -X，180 = 背对。人与人常见间距 0.5–2 米。

【结构】
{
  "version": 1, "title": "...", "aspect": "3:2 | 4:3 | 16:9 | 4:5 | 1:1 | 9:16 | 2.39:1",
  "shots": [{
    "id": "S01", "name": "短标题", "description": "画面内容、情绪、前景背景、构图意图", "notes": "灯光/服装/道具/台词", "duration": 3,
    "camera": { "mode": "auto", "subject": "A", "shotSize": "MS", "focalLength": 50,
                "azimuth": 0, "angle": "eye", "placement": "center", "roll": 0 },
    "actors": [{ "id": "A", "label": "新娘", "model": "woman", "position": [0, 0], "facing": 0,
                 "pose": { "preset": "stand", "joints": { "head": { "turn": 20 } } }, "gaze": "camera" }],
    "props": [{ "id": "P1", "model": "chair", "position": [0, 0], "facing": 0 }],
    "lights": [{ "id": "L1", "role": "key", "type": "soft", "azimuth": 45, "elevation": 35, "intensity": 1, "colorTemp": 5600 }]
  }]
}

【机位 camera】
- shotSize：ECU 大特写(眼) / CU 特写(头肩) / MCU 近景(胸上) / MS 中景(腰上) / MLS 中全景(膝上) / FS 全景 / WS 远景 / EWS 大远景
- focalLength：等效全画幅焦段 mm
- azimuth：绕被摄者水平转，相对其朝向。0 正面，45 前侧 3/4，+90 拍其左侧（画面中人物脸朝左），-90 拍其右侧，180 背后
- angle：eye 平视 / high 俯拍 / low 仰拍 / overhead 顶拍 / worm 贴地仰拍；也可直接写 elevation（度，正 = 俯拍）
- placement：center / left-third / right-third，主体在画面中的位置
- roll：荷兰角（度）
- subject 可以是数组 ["A","B"]，表示以两人中点为主体
- 过肩镜头：subject 设为被拍的人，azimuth 取 10–25，让前景人物处在机位与主体之间

【姿势 pose】先选 preset，再用 joints 微调。可用 preset：{{POSES}}
关节与参数（单位度，左右 L/R 指人物自己的左右）：
- hips / spine / chest：bend 前弯为正，side 向自身右侧倾为正，twist 向自身右转为正
- neck / head：nod 低头为正，tilt 右耳靠右肩为正，turn 向自身右看为正
- upperArm_L/R、upperLeg_L/R：pitch（0 垂下，90 水平，180 举过头），yaw（0 朝前，90 向外侧，负 = 往身前内收，180 = 向后），twist 内旋为正
- lowerArm_L/R：bend 屈肘 0–150；lowerLeg_L/R：bend 屈膝 0–150
- hand_L/R：bend、side；foot_L/R：point 绷脚为正
gaze："camera" 表示看镜头，或填另一个人物的 id。

【灯光 lights】role：key 主光 / fill 辅光 / rim 轮廓光 / back 背景光 / practical 场景内光源 / ambient 环境光。azimuth 规则同机位，elevation 为灯的仰角，colorTemp 单位 K。

【可用模型】人物：{{CHARACTERS}}
道具：{{PROPS}}（box / wall / backdrop 可写 "size": [宽, 高, 深]）

【要求】
1. 每个镜头场景写完整（人物、道具、灯光），不继承上一镜。
2. 用景别、焦段、机位角、姿势真正区分镜头，避免全是正面中景。
3. description 写给摄影师看：画面里有什么、主体情绪、前景/背景、构图意图。
4. 只输出 JSON。
````

---
## C. 示例 JSON（P5 验收用）

```json
{
  "version": 1,
  "title": "咖啡馆约会",
  "aspect": "16:9",
  "shots": [
    {
      "id": "S01", "name": "建立镜头",
      "description": "俯拍远景交代环境，两人隔桌对坐，窗光从画面右侧进来",
      "notes": "暖色调，窗光 3200K", "duration": 4,
      "camera": { "mode": "auto", "subject": ["A", "B"], "shotSize": "WS", "focalLength": 24, "azimuth": 30, "angle": "high" },
      "actors": [
        { "id": "A", "label": "女", "model": "woman", "position": [-0.6, 0], "facing": 90, "pose": { "preset": "sit_chair" } },
        { "id": "B", "label": "男", "model": "man", "position": [0.6, 0], "facing": -90, "pose": { "preset": "sit_chair" } }
      ],
      "props": [
        { "id": "P1", "model": "table", "position": [0, 0] },
        { "id": "P2", "model": "chair", "position": [-0.6, 0], "facing": 90 },
        { "id": "P3", "model": "chair", "position": [0.6, 0], "facing": -90 },
        { "id": "P4", "model": "wall", "position": [0, -1.5], "size": [6, 3, 0.1] }
      ],
      "lights": [
        { "id": "L1", "role": "key", "type": "soft", "subject": "A", "azimuth": 60, "elevation": 30, "intensity": 1, "colorTemp": 3200 },
        { "id": "L2", "role": "fill", "type": "soft", "azimuth": -45, "elevation": 15, "intensity": 0.3 }
      ]
    },
    {
      "id": "S02", "name": "过肩看她",
      "description": "从男方右肩后拍女方，她托腮看着他，前景是虚化的男方肩膀",
      "duration": 3,
      "camera": { "mode": "auto", "subject": "A", "shotSize": "MCU", "focalLength": 85, "azimuth": 20, "angle": "eye", "placement": "left-third" },
      "actors": [
        { "id": "A", "label": "女", "model": "woman", "position": [-0.6, 0], "facing": 90,
          "pose": { "preset": "hand_to_chin", "joints": { "head": { "tilt": 8 } } }, "gaze": "B" },
        { "id": "B", "label": "男", "model": "man", "position": [0.6, 0], "facing": -90, "pose": { "preset": "sit_chair" } }
      ],
      "props": [
        { "id": "P1", "model": "table", "position": [0, 0] },
        { "id": "P2", "model": "chair", "position": [-0.6, 0], "facing": 90 },
        { "id": "P3", "model": "chair", "position": [0.6, 0], "facing": -90 }
      ],
      "lights": [
        { "id": "L1", "role": "key", "type": "soft", "subject": "A", "azimuth": 60, "elevation": 30, "intensity": 1, "colorTemp": 3200 },
        { "id": "L2", "role": "rim", "type": "hard", "subject": "A", "azimuth": 160, "elevation": 40, "intensity": 0.6 }
      ]
    },
    {
      "id": "S03", "name": "他笑了",
      "description": "男方特写，微微低头笑，眼神看向女方，主体放右三分线，左侧留白",
      "duration": 2,
      "camera": { "mode": "auto", "subject": "B", "shotSize": "CU", "focalLength": 85, "azimuth": -15, "angle": "eye", "placement": "right-third" },
      "actors": [
        { "id": "A", "label": "女", "model": "woman", "position": [-0.6, 0], "facing": 90, "pose": { "preset": "sit_chair" } },
        { "id": "B", "label": "男", "model": "man", "position": [0.6, 0], "facing": -90,
          "pose": { "preset": "sit_chair", "joints": { "head": { "nod": 10 } } }, "gaze": "A" }
      ],
      "props": [
        { "id": "P1", "model": "table", "position": [0, 0] },
        { "id": "P3", "model": "chair", "position": [0.6, 0], "facing": -90 }
      ],
      "lights": [
        { "id": "L1", "role": "key", "type": "soft", "subject": "B", "azimuth": -50, "elevation": 30, "intensity": 1, "colorTemp": 3200 }
      ]
    }
  ]
}
```
