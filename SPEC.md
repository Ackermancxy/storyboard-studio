# 简易分镜生成器 · 设计规格（SPEC）

> 这是最初 P0–P7 的设计规格，保留了当时的约定与推导过程。当前实现已经扩展了天空/地面预设、图片分镜表、CSV 导出、manifest.local.json 覆盖、Node 静态服务等；以 README、`src/types.ts` 和 `skills/storyboard/references/schema.md` 为准。
>
> 给实现者（AI 编程模型）看的权威文档。每个阶段开始前先完整读一遍。
> 与本文冲突时以本文为准；本文没写的，选最简单的做法并在汇报里说明。

## 0. 要解决的问题

摄影师让 AI 设计拍摄脚本时，AI 只能用文字描述画面，机位、景别、人物姿势都表达不准。

方案：定义一种「AI 能写、程序能渲染」的分镜 JSON。

1. 用户把「AI 提示词」（§8，程序一键复制）发给任意聊天 AI，AI 输出分镜 JSON。
2. 粘贴进本工具 → 自动摆好人物、道具、灯光、机位，逐镜渲染。
3. 用户在 3D 里微调（拖人、调关节、改焦段），导出分镜表 PNG，或把 JSON 发回 AI 继续改。

核心设计：机位和姿势都用「语义参数」（景别、机位角、焦段；手臂抬起角/方向角），
不让 AI 写坐标矩阵和四元数。AI 负责语义，程序负责几何。

## 1. 技术选型（不许擅自增加依赖）

- Vite + TypeScript（strict），原生 DOM，不用 React/Vue。
- three（`--save-exact` 锁版本）。只用 `three/examples/jsm` 里的 OrbitControls、TransformControls、GLTFLoader、SkeletonUtils。
- lil-gui：属性面板。
- vitest：纯函数单测。
- 无后端，纯静态页面；数据存 localStorage + 文件导入导出。
- 国内网络：npm 可加 `--registry=https://registry.npmmirror.com`。
- 界面文字全部中文。

## 2. 目录结构

```
storyboard/
  SPEC.md                    本文件
  docs/PROMPTS.md            分阶段提示词 + 给聊天 AI 的提示词模板
  index.html
  src/
    main.ts                  入口，组装各模块
    types.ts                 §4 的全部类型
    state/store.ts           项目状态、事件、撤销重做、自动保存
    state/normalize.ts       宽容解析 AI 写的 JSON（§4.6）
    scene/SceneManager.ts    three 场景；根据 state 增量同步对象
    scene/rig.ts             Rig 接口 + 姿势引擎（§5）
    scene/mannequin.ts       程序化木头人（§5.5）
    scene/props.ts           程序化道具（§6.2）
    scene/camera.ts          焦段换算、语义机位求解（§7）
    scene/lights.ts          灯光、色温换算
    scene/assets.ts          读 manifest、GLTF 缓存
    data/poses.ts            内置姿势预设
    ui/                      Toolbar / ShotList / Inspector / 视口覆盖层
    export/                  单镜 PNG、分镜表、俯视灯位图
    ai/prompt.ts             动态生成给 AI 的提示词（§8）
  public/assets/manifest.json  模型清单（§6）
  public/assets/models/        用户自加的 .glb
  tests/                     vitest
```

单个源文件不超过约 400 行。

## 3. 架构原则

- 唯一数据源：一个可 JSON 序列化的 `Project` 对象（§4）。所有 UI 操作 = 修改 Project → store 发 change 事件 → SceneManager 把 three 对象同步成 Project 描述的样子。状态不许只存在 three 对象上。
- SceneManager 按 id 增量同步（增/删/改），不要每次全量重建（GLTF 人物加载慢）。
- 撤销/重做：快照式（structuredClone Project），上限 100 步。滑杆拖动过程中不入栈，松手（change 事件）才入栈。
- 自动保存：变更后 500ms 防抖写 localStorage。
- 按需渲染：有变化或控件交互时 requestRender，不常驻 60fps 循环（省电）。

## 4. 数据模型（核心契约）

### 4.1 坐标约定

- 单位米，Y 向上，地面 y=0。
- 舞台正面是 +Z：从 +Z 往 -Z 看时，+X 在画面右边。
- 人物 `facing`（度）：0 = 面向 +Z，90 = 面向 +X（画面右），-90 = 面向画面左，180 = 背对。即绕 Y 轴旋转 facing 度。
- 人物 `position` = 髋部（hips）在地面上的投影。坐椅子时 position 就放在椅面中心。
- 角度存储和 UI 一律用「度」。

### 4.2 Project / Shot

```ts
interface Project {
  version: 1;
  title: string;
  aspect: "3:2" | "4:3" | "16:9" | "4:5" | "1:1" | "9:16" | "2.39:1";
  sensor: "FF" | "APSC" | "M43"; // 只影响 UI 显示的「实际焦段」，计算一律用等效焦段
  shots: Shot[];
}
interface Shot {
  id: string;           // "S01"…
  name: string;         // 简短标题
  description: string;  // 画面描述/拍摄要点
  notes?: string;       // 灯光、服装、台词等
  duration?: number;    // 秒
  camera: CameraSpec;
  actors: Actor[];
  props: Prop[];
  lights: Light[];
  environment?: { background: string; floor: "grid" | "plain" | "none" };
}
```

每个 Shot 自带完整场景，不做跨镜共享；复制镜头 = 深拷贝。简单直观，AI 也好写。

### 4.3 Actor / Pose

```ts
interface Actor {
  id: string;                  // "A"、"B"…，镜内唯一，camera.subject 引用它
  label?: string;              // 显示名，如「新娘」
  model: string;               // manifest 里的 character id
  position: [number, number];  // [x, z]
  facing: number;
  elevation?: number;          // 额外抬高（站台阶上等），默认 0
  autoGround?: boolean;        // 默认 true：摆完姿势后把身体最低点贴到 y = elevation
  color?: string;
  pose: Pose;
  gaze?: "camera" | string | null; // 看镜头 / 看某个 actor id；覆盖头部朝向
}
interface Pose {
  preset?: string;                                   // 先套预设
  joints?: Partial<Record<JointName, JointParams>>;  // 再逐项覆盖
}
type JointParams = Partial<Record<
  "bend" | "side" | "twist" | "nod" | "tilt" | "turn" | "pitch" | "yaw" | "point", number>>;
```
### 4.4 Prop / Light

```ts
interface Prop {
  id: string; model: string; label?: string;
  position: [number, number]; facing?: number; elevation?: number;
  size?: [number, number, number]; // 宽 高 深，仅 box/wall/backdrop 等可变尺寸道具
  scale?: number; color?: string;
}
interface Light {
  id: string;
  role: "key" | "fill" | "rim" | "back" | "practical" | "ambient";
  type?: "soft" | "hard";  // soft = 阴影边缘柔
  subject?: string;        // 打向哪个 actor，默认第一个
  azimuth: number;         // 相对 subject 朝向的水平角，规则同机位 §7.2
  elevation: number;       // 仰角，正 = 从上往下打
  distance?: number;       // 默认 3
  intensity: number;       // 0–2，1 为标准
  colorTemp?: number;      // K，默认 5600
  showStand?: boolean;     // 在导演/俯视视图画出灯架
}
```

### 4.5 CameraSpec

```ts
type ShotSize = "ECU" | "CU" | "MCU" | "MS" | "MLS" | "FS" | "WS" | "EWS";
interface CameraSpec {
  mode: "auto" | "manual";
  focalLength: number;            // 等效全画幅焦段 mm，默认 50
  roll?: number;                  // 荷兰角
  // auto 模式（AI 写这些）
  subject?: string | string[];    // actor id；数组 = 取中点（双人镜头）
  shotSize?: ShotSize;            // 默认 MS
  azimuth?: number;               // 默认 0
  angle?: "eye" | "high" | "low" | "overhead" | "worm";
  elevation?: number;             // 写了就覆盖 angle
  placement?: "center" | "left-third" | "right-third";
  // manual 模式（用户在导演视图拖动机位后自动切换）
  position?: [number, number, number];
  target?: [number, number, number];
}
```

用户手动改机位 → 把当前求解结果写进 position/target 并设 `mode = "manual"`；面板提供「回到自动机位」。

### 4.6 宽容解析（normalize.ts，纯函数，必须单测）

AI 输出常有瑕疵，导入时必须：

1. 去掉 ```json 围栏和前后废话（取第一个 `{` 或 `[` 到与之匹配的结尾）。
2. 容忍尾逗号、`//` 和 `/* */` 注释。
3. 缺字段补默认；数值越界 clamp 到 §5.2 范围；数组长度不对就补/截。
4. 未知人物 model → 第一个人物模型并警告；未知道具 → box 并警告；未知 preset → stand 并警告；id 重复或缺失自动生成。
5. 也接受只给 `shots` 数组，或单个 shot 对象。
6. 返回 `{ project, warnings: string[] }`。警告用中文，指明第几镜哪个字段，在 UI 中展示。


## 5. 人物骨架与姿势引擎

### 5.1 关节表 JointName（17 个，不做手指）

`hips`（根）, `spine`, `chest`, `neck`, `head`,
`upperArm_L/R`, `lowerArm_L/R`, `hand_L/R`,
`upperLeg_L/R`, `lowerLeg_L/R`, `foot_L/R`

`_L` = 人物自己的左边 = 静止朝 +Z 时的 +X 侧。

### 5.2 语义参数（AI 和 UI 共用）

| 关节 | 参数（度） | 范围 |
|---|---|---|
| hips | bend / side / twist | bend ±180（躺下用 ±90），side ±90，twist ±90 |
| spine, chest | bend / side / twist | bend -30~60，side ±30，twist ±45 |
| neck, head | nod / tilt / turn | nod ±60，tilt ±40，turn ±80 |
| upperArm | pitch / yaw / twist | pitch 0~180，yaw -60~180，twist ±90 |
| lowerArm | bend | 0~150 |
| hand | bend / side | bend ±70，side ±30 |
| upperLeg | pitch / yaw / twist | pitch -40~130（负 = 向后），yaw -30~180，twist ±45 |
| lowerLeg | bend | 0~150（向后弯） |
| foot | point | ±45（正 = 绷脚） |

正负号（一律站在人物自己的角度）：
bend+ = 向前；side+ = 向自己右侧；twist+ / turn+ = 转向自己右侧；nod+ = 低头；tilt+ = 右耳靠右肩；
四肢 twist+ = 内旋（左右镜像，同一数值两侧对称）。

### 5.3 计算公式

四肢方向（swing-twist）。上臂在胸腔坐标系、大腿在骨盆坐标系（静止时 +Y 上、+Z 前、+X 人物左），s = 左 +1 / 右 -1：

```
d = ( s·sin(pitch)·sin(yaw),  -cos(pitch),  sin(pitch)·cos(yaw) )
```

- pitch：0 垂下，90 水平，180 举过头顶。yaw：0 朝前，90 向外侧平举，负 = 往身前内收，180 = 向后。
- 例：T-pose = pitch 90 / yaw 90；向前指 = pitch 90 / yaw 0；举手 = pitch 180；后摆腿 = pitch 20 / yaw 180。
- 肢段旋转 q = setFromUnitVectors(restDir, d) · twist(绕 restDir)，即先 twist 再 swing。
- 肘：前臂向「前」弯；膝：小腿向「后」弯。木头人上 elbow = rotX(-bend)，knee = rotX(+bend)，foot point = rotX(+point)。
- 躯干/头：局部 Euler，bend/nod → rotX(+)，side/tilt → rotZ(+)，twist/turn → rotY(-)。
  以 §5.2 的文字描述为准，符号不对就改符号，并用单测锁定。

### 5.4 Rig 抽象（为 GLTF 预留，P1 就必须按此实现）

```ts
interface RigJoint {
  obj: THREE.Object3D;
  restLocal: THREE.Quaternion;     // 静止时的局部旋转
  restRootFrame: THREE.Quaternion; // 静止时相对人物根的朝向 R
  restDir?: THREE.Vector3;         // 四肢：根坐标系下的静止方向
}
interface Rig { root: THREE.Object3D; joints: Map<JointName, RigJoint>; height: number }
function applyPose(rig: Rig, pose: ResolvedPose): void
```

通用公式：每个关节先在「轴对齐的人体坐标系」里算出 delta 四元数 q（§5.3），再换到骨骼局部：

```
local = restLocal · (R⁻¹ · q · R)
```

- 木头人：关节全部轴对齐建，R = 单位，四肢 restDir = (0,-1,0)。
- GLTF（T-pose / A-pose）：从骨骼静止姿态读出 R 和 restDir（子骨骼位置 − 本骨骼位置），同一份姿势数据就能驱动任何模型。
- 姿势引擎只依赖 Rig 接口，不许写死木头人。
### 5.5 程序化木头人（mannequin.ts）

- 低多边形：CapsuleGeometry 做肢段，小球做关节，头 = 球 + 明显的小鼻锥（一眼看出脸朝向），脚 = 扁盒。
- 基准比例（总高 1.73m，再按 height 整体缩放）：脚踝高 0.07，小腿 0.43，大腿 0.43，髋关节间距 0.18，spine 0.20，chest 0.25，左右肩关节间距 0.38，neck 0.10，头高 0.23，上臂 0.30，前臂 0.26，手 0.18。
- build：male（肩宽 ×1.08）、female（肩 ×0.92、髋 ×1.1）、child（头比例 ×1.25）。
- 每个 actor 一个颜色；悬停关节高亮；头顶浮动标签（label 或 id），用 Sprite + CanvasTexture。
- autoGround：applyPose 后用 Box3.setFromObject 求最低点，平移 root 使最低点 = elevation。这样坐椅子、跪、躺都会自然落地。

### 5.6 gaze（看镜头 / 看某人）

由目标方向反算 head 的 turn/nod，clamp 到 turn ±80 / nod ±40，超出部分的一半分给 neck。在相机求解之后计算。

### 5.7 内置预设（data/poses.ts）

预设 = 一组 joints 参数（Pose 格式）。用户可「把当前姿势存为预设」（localStorage，可导出导入）。
至少提供下列 id。给出的数值只是起点，实现者必须在 3D 里逐个目测调到自然（不穿模、重心可信）：

| id | 中文 | 参考值 |
|---|---|---|
| stand | 站立 | 双臂 pitch 6 yaw 90 |
| stand_relaxed | 三七步 | hips side 4；左腿 pitch 8 yaw 20、膝 8；chest side -3 |
| hands_on_hips | 叉腰 | 双臂 pitch 45 yaw 100 twist 30；肘 110 |
| arms_crossed | 抱臂 | 双臂 pitch 25 yaw -15 twist 70；肘 115 |
| walk | 走 | 左腿 pitch 25、膝 10；右腿 pitch 15 yaw 180、膝 35；左臂 pitch 20 yaw 180；右臂 pitch 20 yaw 0、肘 20 |
| run | 跑 | walk 的加大版，躯干前倾 |
| sit_chair | 坐椅子 | 双腿 pitch 90、膝 90；手放大腿 |
| sit_floor | 席地抱膝 | |
| kneel | 双膝跪 | 大腿 pitch 0、膝 90 |
| kneel_one | 单膝跪 | |
| crouch | 蹲 | |
| lean_forward | 前倾扶膝 | |
| look_back | 回眸 | chest twist 30；neck turn 30；head turn 45 |
| phone_call | 打电话 | 右臂 pitch 30 yaw 20、肘 145；head tilt 10 |
| hand_to_chin | 托腮 | |
| hand_in_hair | 撩发 | |
| wave | 挥手 | |
| point | 指向 | |
| arms_up | 举双手 | |
| lie_back | 仰躺 | hips bend -90 |
| lie_side | 侧躺 | |

## 6. 模型清单（可后期扩展）

### 6.1 manifest.json

```json
{
  "characters": [
    { "id": "man",   "name": "男",   "type": "procedural", "build": "male",   "height": 1.78 },
    { "id": "woman", "name": "女",   "type": "procedural", "build": "female", "height": 1.65 },
    { "id": "child", "name": "儿童", "type": "procedural", "build": "child",  "height": 1.20 },
    { "id": "xbot",  "name": "X Bot", "type": "gltf", "file": "models/xbot.glb",
      "height": 1.75, "rotateY": 0, "boneMap": "mixamo" }
  ],
  "props": [
    { "id": "chair", "name": "椅子", "type": "procedural", "shape": "chair" },
    { "id": "car",   "name": "汽车", "type": "gltf", "file": "models/car.glb", "scale": 1 }
  ]
}
```

- 加模型 = 把 .glb 放进 `public/assets/models/` + manifest 加一条，不改代码。
- 启动时读 manifest；GLTF 懒加载 + 缓存（SkeletonUtils.clone），加载中显示占位盒。
- boneMap 可写对象 `{ "hips": "骨骼名", ... }`，或简写 `"mixamo"`（内置 Mixamo 骨骼名表）。缺的关节忽略。
- rotateY：模型默认不朝 +Z 时的修正角。
### 6.2 内置程序化道具（shape）

box（可调 size）、wall（墙，size）、backdrop（摄影背景纸弧形，size + color）、door（门框）、window（窗框）、
chair、stool、table、sofa、bed、stairs（台阶）、tree、car（简化盒体）、umbrella、light_stand（灯架 + 柔光箱，纯展示）。
全部低模单色，尺寸按现实：椅面高 0.45、桌高 0.75、门 0.9×2.1、床 1.5×0.5×2.0。

免费模型来源（写进 README）：three.js 仓库 `examples/models/gltf/Xbot.glb`（Mixamo 骨骼，适合测试）、Mixamo、Quaternius、Kenney、Poly Pizza（CC0）。

## 7. 相机系统（camera.ts 全是纯函数，必须单测）

### 7.1 焦段 → 视角

`PerspectiveCamera.filmGauge = 36` + `setFocalLength(f)`。three 会把 filmGauge 用在画面长边上，横竖画幅都自动正确。
focalLength 一律是等效全画幅焦段；sensor 只用于 UI 显示「APS-C 实际 33mm」之类。

### 7.2 auto 机位求解 `solveCamera(spec, actors, aspect) → { position, target, up }`

1. 主体点 P：subject 的 position；数组取中点；缺省取全部 actor 中点；没有 actor 取原点。H = 主体身高（多人取最大）。facing 取第一个主体的。
2. 景别表（F = 画面高度，C = 视觉中心高度，均为 H 的倍数）：

| 景别 | 中文 | F | C |
|---|---|---|---|
| ECU | 大特写（眼部） | 0.08 | 0.93 |
| CU | 特写（头肩） | 0.22 | 0.89 |
| MCU | 近景（胸上） | 0.35 | 0.84 |
| MS | 中景（腰上） | 0.55 | 0.74 |
| MLS | 中全景（膝上） | 0.80 | 0.62 |
| FS | 全景（全身） | 1.20 | 0.50 |
| WS | 远景 | 2.5 | 0.50 |
| EWS | 大远景 | 6 | 0.50 |

   竖画幅时 F 仍指画面高度。
3. 距离 `D = F·H / (2·tan(vFov/2))`。
4. 方位：θ = facing + azimuth；φ = elevation，或由 angle 映射：eye 0、high 25、low -15、overhead 80、worm -45。
   T = P + (0, C·H, 0)；`position = T + D·(sinθ·cosφ, sinφ, cosθ·cosφ)`；相机高度至少 0.05。
   azimuth 含义：0 = 正面，+90 = 拍被摄者左侧（画面中人物脸朝左），-90 = 右侧，180 = 背后。
5. placement：left-third 时 T 沿相机右方向偏移 +F·H·aspect/6（主体落在左三分线），right-third 反向。
6. roll 绕视线旋转 up。

### 7.3 三种视图

- 机位视图：通过当前镜头相机看。canvas 按 aspect letterbox，叠加三分线、中心十字、HUD（「S03 · 中景 MS · 50mm · 平视」），可开关。
- 导演视图：自由 OrbitControls。画出当前镜头相机模型 + 视锥线框。可选中 actor / prop / 灯 / 相机，TransformControls 平移（仅 XZ）和旋转（仅 Y，写回 facing）。拖相机即转 manual。
- 俯视视图：正交相机从上往下，用于灯位图。
- 快捷键：Tab 切换机位/导演，T 俯视，W/E 平移/旋转，Delete 删除。

## 8. 给聊天 AI 的提示词（ai/prompt.ts）

模板见 docs/PROMPTS.md 的「B」节。运行时把 `{{CHARACTERS}}` `{{PROPS}}` `{{POSES}}` 替换成当前 manifest 和预设（含用户预设）的「id（中文名）」列表。

- 工具栏「复制 AI 提示词」：复制模板。
- 「复制当前项目给 AI 修改」：模板 + 当前 Project JSON + 「请在此基础上按我的要求修改，输出完整 JSON」。
## 9. 界面布局

```
┌ 工具栏：新建 打开 保存 │ 导入AI JSON  复制AI提示词 │ 撤销 重做 │ 导出PNG 分镜表 灯位图 │ 画幅▾ 阴影☐ ┐
├ 镜头列表 ┬────────── 视口（机位 / 导演 / 俯视）──────────┬ 属性面板 ┤
│ 缩略图   │                                              │ 对象列表 │
│ S01 …    │                                              │ lil-gui  │
│ ＋ 复制 删│                                              │          │
├──────────┴──── 本镜描述 / 备注（文本框）────────────────┴──────────┤
```

- 镜头列表：缩略图（机位视图离屏渲染，宽 320，变更后 300ms 防抖刷新）、拖拽排序、新增（复制当前镜头场景）、复制、删除。
- 属性面板：顶部是本镜对象列表（＋人物 ＋道具 ＋灯，点选）；下面按选中对象切换：
  - 相机：mode、焦段（滑杆 14–200 + 24/35/50/85/135 快捷档）、景别、azimuth、angle/elevation、placement、roll、subject。
  - 人物：模型、label、位置、朝向、elevation、autoGround、颜色、预设下拉、17 关节分组折叠滑杆、gaze、「存为预设」「镜像左右」。
  - 道具、灯：对应字段。
- 镜像左右：_L/_R 参数互换；中轴关节的 side / twist / turn / tilt 取反。
- 导入 AI JSON：弹窗 textarea → 解析 → 显示 warnings → 「替换整个项目」或「追加镜头」。

## 10. 导出

- 单镜 PNG：长边 1920，可选是否带三分线/HUD。
- 分镜表 PNG：A4 横向 150dpi（约 1754×1240），每页 2×3 格，多页依次下载。每格 = 画面 + 「S01 中景 MS 50mm 平视 3s」+ description + notes。用 2D canvas 合成，中文逐字测宽折行，行首避开标点。
- 俯视灯位图：单镜一张（人物、道具、灯、相机的位置和朝向，带中文标注）。
- 项目文件：`<标题>.storyboard.json` 下载 / 打开。

## 11. 非目标（不要做）

动画/时间轴、手指、物理、IK 拖拽、多人协作、后端、直连 LLM API。

## 12. 阶段

P0 脚手架 → P1 木头人 + 姿势引擎 → P2 数据模型 + 镜头列表 + 道具 → P3 相机系统 → P4 灯光 → P5 导入导出 + AI 提示词 → P6 GLTF 模型 → P7 打磨 + 启动器。
各阶段的任务与验收见 docs/PROMPTS.md。
