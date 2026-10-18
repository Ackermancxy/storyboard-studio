# pose-analysis：不截图，直接算姿势

从 PMX 模型里量出真实骨架和身体尺寸，离线展开成三维骨架，再用几何规则回答分镜里最难靠眼睛发现的三类问题：

1. **有没有做到位**：预设名说要「托腮 / 扶墙 / 坐椅子」，手到底离下巴多远？膝盖到底有没有落地？
2. **有没有很诡异**：穿模、重心出支撑面、关节被限位截断、脚悬空、脖子拧过头。
3. **有没有不合适**：场景里没椅子却坐着、栏杆比手低 27cm、人站进了台阶/树干内部、虚拟的墙放到了后脑勺前面。

全程只用 Node，不启动浏览器、不渲染网格、不截图。SVG 骨架图是从烘焙后的骨架和实测突出点直接画出来的，不是渲染帧。

## 用法

```bash
# 验收整个项目（所有镜头、所有人物）
node tools/pose-analysis/analyze.mjs ~/Downloads/某分镜.storyboard.json

# 只看 S03 / 只看 A
node tools/pose-analysis/analyze.mjs xxx.storyboard.json --shot S03 --actor A

# 输出机器可读 JSON
node tools/pose-analysis/analyze.mjs xxx.storyboard.json --json > report.json

# 生成实测骨架图（三视图 + 俯视场景图）
node tools/pose-analysis/analyze.mjs xxx.storyboard.json --shot S03 \
  --svg ~/Downloads/某分镜-S03-骨架.svg

# 审计当前模型下全部 118 个内置预设，找出「预设本身做不到位」的动作
node tools/pose-analysis/analyze.mjs --presets --model mikoto

# 接进日常流程：check 会跑 tsc + vitest + 全部预设几何验收
npm run check

# 回归测试
node --test tools/pose-analysis/analyze.selftest.mjs
```

`--strict` 在有 error 时返回退出码 1，可接 CI；`--quiet` 只打印每个镜头的结论行。

## 文件

| 文件 | 作用 |
| --- | --- |
| `measure.mjs` | 读 PMX → 量骨架、段长、胶囊半径、突出点、地标 → `profiles/local/<id>-pmx.json` |
| `kinematics.mjs` | 17 关节姿势 → 211 根骨骼的 FK、自动落地、地标、突出点、胶囊、重心、支撑面、穿插、gaze |
| `evaluate.mjs` | 规则引擎：动作意图、平衡、地面/座面、道具高度、视线、服装适配 |
| `camera.mjs` | `src/scene/camera.ts` 的零依赖移植（自动机位求解） |
| `analyze.mjs` | CLI：读项目 → 复刻 SceneManager 的摆姿/ gaze / 机位流程 → 报告与 SVG |
| `render-svg.mjs` | 三视图骨架图 + 道具包围盒（虚线，含顶面高度）+ 重心/支撑面/接触点/视线/问题编号 + 俯视场景图 |
| `analyze.selftest.mjs` | 14 项回归测试（FK、骨长、意图、座面、墙/栏杆、陷进道具、树干占地、gaze、机位） |
| `profiles/local/*.json` | 本机模型的实测档案（不进 git） |

## 数学管线

```
PMX 顶点 + 骨骼
  │  measure.mjs：换算到 1.56m，量每根骨骼的顶点分布
  ▼
profile.json
  · measurements：身高/肩宽/头长/躯干/上臂/前臂/手/大腿/小腿/足/臂展
  · joints：17 个语义关节的静止位置
  · segments：段长 + r50/r85 胶囊半径
  · boneMetrics：40 根有几何的骨骼，每根 26 个方向极值点
  · landmarks：下巴/眼睛/耳朵/头顶/腕/指尖/趾/脚底四角
  │  kinematics.mjs
  ▼
bake(pose) → 每根骨骼的位置 + 四元数（与 rig.ts 同一套 swing-twist / Euler 公式）
  · autoGround：用身体突出点的最低 y 贴地（排除裙摆/头发；等价于运行时 postedBox 的 excludeSoftCloth）
  · 然后才有：身体包围盒、重心（Dempster 质量比）、支撑多边形、胶囊穿插
  ▼
evaluate.mjs → findings（error / warn / info）+ 证据数值 + 身体空间标注点
  ▼
analyze.mjs → 文本 / JSON / SVG 骨架图
```

**为什么不用截图**：截图的「看起来怪」无法量化，也无法在生成分镜时自动回归。这里所有判断都有可复算的数字：手到耳 5.3cm、膝离地 14cm、栏杆比手低 27cm、重心在支撑面外 14cm。

## 输出怎么读

- `❌` 明确问题：动作没做到、会穿帮、场景物理上不成立。
- `⚠️` 需要留意：能看，但边缘（例如臀部陷进座面 9cm、手离墙 42cm、头颈扭转 120°）。
- `ℹ️` 提示：关节已到限位边缘等，不算错。
- 每个 finding 都带 `metrics`（数值）和 `at`（身体空间坐标），SVG 里用红色/橙色编号标在骨架上。
- 三视图里的灰色虚线框是人物附近的道具包围盒，右上角 / 标题下标注道具名和顶面高度，用来直接比对「座面/墙顶/栏杆」和身体的高度；超大体积（树干、楼）只画轮廓不铺满底色。
- 俯视图里的绿色半透明区域是支撑多边形，蓝虚线是视线目标；灰色矩形是道具包围盒（用来发现人物与道具重叠）。

## 当前模型（mikoto / 御坂美琴，1.56m）

| 项目 | 实测 |
| --- | --- |
| 身高 / 髋高 | 1.56 m / 0.666 m |
| 肩宽 / 头长 / 躯干 | 21.7 / 21.0 / 60.7 cm |
| 上臂 / 前臂 / 手 | 17.4 / 22.9 / 14.8 cm |
| 大腿 / 小腿 / 足 | 33.3 / 37.9 / 18.7 cm |
| 臂展 | 110.0 cm |

首轮审计时 53 个预设里有 18 个明确做不到位、5 个需要留意。逐条重算修正（改关节角、改支撑面、改预设语义，而不是调低阈值）后，又补充了 65 个人像摄影常用动作。**当前 118 个预设全部 0 error / 0 warning**，可直接作为回归基线。

被修掉的典型问题：

- 席地类预设臀部离地 13–44cm（实际是深蹲）→ 重算大腿俯角与屈膝角；
- `kneel` / `kneel_one` 膝盖离地 14cm，靠脚背支撑 → 股骨俯角、屈膝、踝背屈联动重解；
- `hands_on_hips` 双手离腰 20cm → 上臂后摆 + 前臂内收重新求交；
- `hand_to_chin` 手臂穿胸 8–9cm → 改 twist，让前臂从胸前绕开；
- `pockets` 在裙子模型上不可能成立 → 改成语义诚实的 `hands_on_thighs`（手搭大腿）；
- `lie_stomach` 只有手着地、脚在 30cm 高处 → 重新分配髋、肩、肘、膝的承重；
- 无法在现有骨架上成立的真跨腿坐 → 改名为可实现的「侧盘坐 / 椅上抬腿」，不假装做到。

## 落地与虚拟环境

- **落地**（`autoGround` / `--presets`）默认排除裙摆、头发等软布料骨骼（`SOFT_GROUND_BONES`），只让身体硬表面贴地。这样坐姿不会因为裙摆比臀低就被整体抬起来，裙摆穿地不算身体悬空。
- **虚拟环境**：`audit` 声明 `seat` / `ledge` / `wall-front` / `wall-back` / `rail` / `floor` 后，审计会按最小场景搭座面、墙或栏杆，从而把「预设本身做不到位」和「分镜里忘了放道具」分开。
- **wall-back** 的墙放在「躯干背侧 + 骨盆 + 后脑勺」这组硬表面接触点的最后方（世界坐标）。后脑勺比上背再多突出约 7cm，漏掉它墙就会插进头里。同时检查 `lean`：肩背比骨盆靠后超过 22cm 视为后仰过度。
- `bridge_pier`（树干/桥墩）渲染成直径 0.64×宽度 的圆柱，顶部才有一块大盖板。陷进检查按圆柱占地算，不按整个包围盒，否则人在树干前 40cm 也会被误报「陷进 76cm」。

## 已知限制

- 身体轮廓用「每根骨骼的凸包」近似，关节处会有折线；它不是网格，不能替代最终渲染检查。
- 道具用包围盒近似。桌椅下方本来是空的，所以只对实心大体积（墙/楼/台阶/箱子/树干等）做「陷进」检查。
- 没有布料模拟：裙骨不跟随腿，坐姿时裙摆仍按髋部旋转展开。报告不会把裙摆形状当作穿模证据。
- 只有 `profiles/local/` 里有实测档案的模型能做几何验收。`woman` / `man` 等程序化人物会明确提示「无实测档案，未做几何验收」。
- 规则阈值是启发式（例如静态站姿重心余量 < −5cm 警告、< −12cm 判错），可按项目需要调整 `evaluate.mjs`。

## 测量另一个 PMX

```bash
node tools/pose-analysis/measure.mjs \
  public/assets/models/<model>/<file>.pmx \
  --height 1.56 --id <model> \
  --out tools/pose-analysis/profiles/local/<model>-pmx.json
```

`--height` 必须和 `manifest.local.json` 里该角色的 `height` 一致，否则所有长度都会整体缩放。测完先跑 `--presets --model <id>` 看一遍基础动作。
