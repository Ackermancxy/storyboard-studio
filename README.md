# 分镜生成器

摄影师用的轻量 3D 分镜工具：AI 写分镜 JSON → 这里渲染成 3D → 微调 → 导出分镜表。
设计规格见 `SPEC.md`，给聊天 AI 的提示词模板见 `docs/PROMPTS.md`。

```bash
npm run dev      # 开发
npm run build    # 构建到 dist/
npm run check    # tsc + vitest
```

## 怎么加模型（不改代码）

### 人物

1. 把 `.glb` 放进 `public/assets/models/`
2. 在 `public/assets/manifest.json` 的 `characters` 里加一条：

```json
{ "id": "hero", "name": "主角", "type": "gltf", "file": "models/hero.glb",
  "height": 1.80, "rotateY": 0, "boneMap": "mixamo" }
```

- `height`：目标身高（米），会自动缩放到这个高度
- `rotateY`：模型默认朝向不是 +Z 时的修正角（度）。Mixamo 导出的人物通常面向 +Z，填 0
- `boneMap`：
  - `"mixamo"`：Mixamo 骨骼（`mixamorig:Hips` 这套，带不带前缀都认）
  - 或对象：`{ "hips": "骨骼名", "spine": "...", "chest": "...", "neck": "...", "head": "...", "upperArm_L": "...", ... }`
  - 缺的关节会被忽略（该关节不动）
- 骨骼模型必须带骨架，姿势引擎靠 `§5.4` 的静止姿态转换（T-pose / A-pose 都可以）

### 道具

```json
{ "id": "bike", "name": "自行车", "type": "gltf", "file": "models/bike.glb", "scale": 1 }
```

`scale` 为显示倍率；程序化道具（chair/table/…）不需要 file。

### 模型来源（免费）

- three.js 仓库自带：`examples/models/gltf/Xbot.glb`（Mixamo 骨骼，本项目已内置用于测试）
- [Mixamo](https://www.mixamo.com/)：角色 + 动作（FBX，见下）
- [Quaternius](https://quaternius.com/)、[Kenney](https://kenney.nl/)、[Poly Pizza](https://poly.pizza/)：大量 CC0 低模（道具优先看这里）

### Mixamo FBX → GLB

1. Mixamo 下载 FBX（选 T-pose 或 A-pose，**不带皮肤动画**）
2. Blender：`File → Import → FBX` → `File → Export → glTF 2.0 (.glb)`，勾选 `+Y Up`
3. 若骨架名带 `mixamorig:` 前缀，直接可用；导出前可在 Blender 里批量去掉前缀，两种都认

## 架构速记

- 唯一数据源是 `Project` JSON（`src/types.ts`），three 对象由 `SceneManager` 增量同步
- 姿势引擎（`src/scene/rig.ts`）只依赖 `Rig` 接口：木头人和 GLTF 共用同一套语义参数
- 机位/灯位是纯函数求解（`scene/camera.ts`、`scene/lights.ts`），单测锁死方向约定
