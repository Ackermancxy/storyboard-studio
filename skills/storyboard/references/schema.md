# 分镜 JSON Schema（完整参考）

## 坐标约定

- 单位米，Y 向上，地面 y=0。舞台正面 +Z：从 +Z 看过去 +X 在画面右侧。
- 人物 `position` = [x, z]，髋部在地面投影。坐椅子时和椅子同位。
- `facing`（度）：0 = 面向 +Z，90 = 面向 +X（画面右），-90 = 画面左，180 = 背对。
- 角度一律度。

## 顶层结构

```json
{
  "version": 1,
  "title": "项目名",
  "aspect": "3:2 | 4:3 | 16:9 | 4:5 | 1:1 | 9:16 | 2.39:1",
  "sensor": "FF | APSC | M43",
  "shots": [ /* Shot */ ]
}
```

## Shot

```json
{
  "id": "S01", "name": "短标题", "description": "画面/情绪/构图", "notes": "灯光/服装/台词", "duration": 3,
  "camera": {}, "actors": [], "props": [], "lights": [],
  "environment": { "sky": "clear-sunset", "ground": "wood" }
}
```

### environment（天空 / 地面，可选）

```json
{
  "sky": "clear-sunset",     // 天空 + 时间 + 天气
  "ground": "wood",          // 地面材质/场景
  "background": "#1b1b20",   // 仅 sky=studio 时可见
  "floor": "grid"            // 仅 ground=studio 时可见：grid / plain / none
}
```

天空预设：`studio` 工作室纯色 / `clear-day` 晴白天 / `clear-sunset` 晴日落 / `clear-dusk` 晴黄昏（蓝调）/ `clear-night` 晴夜晚 /
`overcast` 阴天 / `rain` 雨天 / `storm` 雷雨 / `snow` 雪天 / `fog` 雾天。

地面预设：`studio` 工作室网格 / `wood` 木地板 / `tile` 瓷砖 / `grass` 草地 / `dirt` 泥土地 / `sand` 沙滩 /
`snow` 雪地 / `asphalt` 沥青路 / `city` 城市街区（带远景楼群）/ `water` 水面。

不写时两者都默认 `studio`（= 旧版纯色背景 + 网格地面）。窗内黄昏、站台暮蓝这类场景一定要写 `environment`，否则工具里只有灰底。

### camera（auto 模式，推荐）

```json
{
  "mode": "auto",
  "subject": "A",                // 或 ["A","B"] 取中点
  "shotSize": "MS",              // 景别，见下表
  "focalLength": 50,             // 等效全画幅
  "azimuth": 0,                  // 0 正面 / +90 拍被摄者左侧（画面里脸朝左）/ -90 右侧 / 180 背后
  "angle": "eye",                // eye 平视 / high 俯拍25° / low 仰拍-15° / overhead 顶拍80° / worm 贴地-45°
  "placement": "center",         // center / left-third / right-third
  "roll": 0                      // 荷兰角
}
```

景别表（F=画面高度/身高，C=视觉中心高度/身高）：

| 景别 | 中文 | F | C |
|---|---|---|---|
| ECU | 大特写(眼) | 0.08 | 0.93 |
| CU | 特写(头肩) | 0.22 | 0.89 |
| MCU | 近景(胸上) | 0.35 | 0.84 |
| MS | 中景(腰上) | 0.55 | 0.74 |
| MLS | 中全景(膝上) | 0.80 | 0.62 |
| FS | 全景 | 1.20 | 0.50 |
| WS | 远景 | 2.5 | 0.50 |
| EWS | 大远景 | 6 | 0.50 |

过肩镜头：subject 设为被拍者，azimuth 取 10–25，让前景人物处在机位与主体之间。

### Actor

```json
{
  "id": "A", "label": "新娘", "model": "mikoto",
  "position": [0, 0], "facing": 0,
  "elevation": 0, "autoGround": true, "color": "#c9a06b",
  "pose": { "preset": "stand", "joints": { "head": { "turn": 20 } } },
  "gaze": "camera"               // "camera" 看镜头 / 另一 actor id / null
}
```

`model` 必须是工具 `manifest.json` 里的 character id。开源版内置 `mikoto`（程序化女生）、`man`、`child`、`xbot`；自己的模型通过 `public/assets/manifest.local.json` 覆盖/追加，格式见 `deploy.md`。

#### 预设（preset，共 53 个）

stand 站立 / stand_relaxed 三七步 / hands_on_hips 叉腰 / arms_crossed 抱臂 / walk 走路 / run 跑步 / sit_chair 坐椅子 / sit_floor 席地抱膝 / kneel 双膝跪 / kneel_one 单膝跪 / crouch 蹲 / lean_forward 前倾扶膝 / look_back 回眸 / phone_call 打电话 / hand_to_chin 托腮 / hand_in_hair 撩发 / wave 挥手 / point 指向 / arms_up 举双手 / lie_back 仰躺 / lie_side 侧躺 / shade_eyes 抬手遮阳 / peace_sign 比耶 / pockets 插兜 / hand_on_wall 单手扶墙 / lean_wall 倚墙 / lean_rail 趴栏杆 / sit_ledge 坐台沿垂腿 / sit_cross 盘腿坐 / sit_back 后撑坐 / sit_hug_one 坐抱单膝 / kneel_sit 跪坐（正座） / tiptoe 踮脚 / jump 跳跃（记得抬 elevation） / spin_skirt 旋转甩裙 / carry_bag 拎包 / hold_skirt 提裙摆 / stretch 伸懒腰 / bow 鞠躬 / hands_behind 背手 / selfie 自拍 / lie_stomach 趴撑 / heart_over_head 头顶比心 / wave_high 大力挥手 / salute 敬礼 / walk_lookback 边走边回眸 / arms_out 张开双臂 / cover_face 捂脸 / model_s S 形站姿 / look_up 仰头远望 / rail_lookback 扶栏回眸 / sit_side 侧坐伸腿 / kick_back 后勾腿

#### 关节参数（度，joints 覆盖预设；L/R 指人物自己的左右）

| 关节 | 参数 | 范围 |
|---|---|---|
| hips | bend/side/twist | ±180/±90/±90 |
| spine, chest | bend/side/twist | -30~60/±30/±45 |
| neck, head | nod/tilt/turn | ±60/±40/±80 |
| upperArm_L/R | pitch/yaw/twist | 0~180/-60~180/±90 |
| lowerArm_L/R | bend | 0~150 |
| hand_L/R | bend/side | ±70/±30 |
| upperLeg_L/R | pitch/yaw/twist | -40~130/-30~180/±45 |
| lowerLeg_L/R | bend | 0~150 |
| foot_L/R | point | ±45 |

符号（人物视角）：bend+ 前弯，side+ 向自己右倾，twist/turn+ 向自己右转，nod+ 低头，tilt+ 右耳靠右肩；
四肢 pitch 0 垂下 / 90 水平 / 180 举过头，yaw 0 朝前 / 90 外侧平举 / 负=往身前内收 / 180 向后。

### Prop

```json
{ "id": "P1", "model": "chair", "label": "椅", "position": [0,0], "facing": 0,
  "elevation": 0, "size": [宽,高,深], "scale": 1, "color": "#8a6a48" }
```

可用道具：以工具目录下 `public/assets/manifest.json` 的 `props` 为准（50 余种：家具、门窗、站台/轨道、路灯/贩卖机、踏切、楼群、树篱等）。box/wall/backdrop 及多数“sizeable”道具可写 `size`。

### Light

```json
{ "id": "L1", "role": "key", "type": "soft", "subject": "A",
  "azimuth": 45, "elevation": 35, "distance": 3, "intensity": 1, "colorTemp": 5600, "showStand": false }
```

role：key 主光 / fill 辅光 / rim 轮廓光 / back 背景光 / practical 场景内光源 / ambient 环境光。
azimuth 规则同机位（相对 subject 朝向）。type：soft 柔光 / hard 硬光（阴影边缘）。

## 校验清单（交付前自查）

- [ ] 每镜 actors/props/lights/camera 完整，不继承
- [ ] model/preset/shotSize/role/sky/ground 都在合法清单内
- [ ] 关节角度不越上表范围
- [ ] camera.subject 引用的 actor id 存在
- [ ] 镜内 actor id 唯一（A/B/C…），prop 用 P1/P2…，灯用 L1/L2…
- [ ] 景别/焦段/机位角在镜头间有变化
- [ ] description 写给摄影师看；notes 写实拍要点
