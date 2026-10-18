# 实测骨架验收（不截图）

用分镜 JSON 驱动同一套姿势公式，离线算出骨骼形态，验收三件事：

1. **做到位没有**：预设要求的动作，用实测距离/高度/角度判定。
2. **诡异没有**：穿模、重心出支撑面、关节限位、脚悬空、脖子拧过头。
3. **合适没有**：没椅子却坐着、手够不到墙/栏杆、人站进道具内部、裙子模型插兜。

它输出文本/JSON，也能画一张**骨架图**（三视图 + 重心/支撑面/接触点/视线/问题编号 + 俯视场景图）。图是骨架和实测突出点直接投影出来的，不是渲染截图。

## 什么时候跑

- 分镜写完后、交给用户前，至少跑一次。
- 用了这些预设时重点看：`sit_*`（尤其 `sit_curb` / `sit_steps` / `sit_stool` / `sit_chair_*` 这类容易悬空或陷进座面的）、`kneel*`、`lie_*`、`squat_hug`、`hands_on_hips`、`hand_to_chin`、`hand_on_wall*`、`lean_wall*`、`lean_rail*`，以及所有带道具高度的镜头。
- 内置预设已全部通过几何验收（118/118）；如果某个镜头报错，优先怀疑 joints 覆盖值破坏了预设，而不是预设本身。
- 用户抱怨「看着怪 / 像蹲着 / 手没扶到 / 人穿模」时，先跑它定位，不要凭截图猜。

## 命令

```bash
# 整个项目
node <skill目录>/references/analyze.js ~/Downloads/<标题>.storyboard.json

# 单镜 + 骨架图（产物放 Downloads，给绝对路径）
node <skill目录>/references/analyze.js ~/Downloads/<标题>.storyboard.json \
  --shot S03 --svg ~/Downloads/<标题>-S03-骨架.svg

# 只看某个人物 / JSON 报告 / 有 error 就退出 1
node <skill目录>/references/analyze.js xxx.json --actor A --json --strict
```

工具本身的用法、数学管线、阈值和限制见仓库 `tools/pose-analysis/README.md`。

## 读结果

- `❌`：必须改。动作没做到、会穿帮、场景物理上不成立。
- `⚠️`：能看但边缘。臀部陷进座面、手离墙 42cm、头颈扭转 120°。
- `ℹ️`：提示，不算错。

每条都带数值证据（手到耳 5.3cm、膝离地 14cm、重心外 14cm 等）。SVG 里的编号与报告条目一一对应，红/橙分别对应 error/warn。

## 常见修法

| 报告 | 改法 |
| --- | --- |
| `坐姿但身下没有座面道具` | 加 chair/stool/bench，并让人物与道具同位 |
| `臀部离座面 N cm（悬空）` / `陷进座面` | 换座面高度，或调道具 `size[1]` / `scale` |
| `膝盖没有跪到地上` | 改 `foot.point` 到 30–45°，让脚背放平 |
| `没有坐到地上` | 席地而坐需要大腿前抬 75–90°、膝回折 70–100°，不能只靠 elevation |
| `手离墙 N cm` | 把墙移近，或加大手臂前伸 |
| `手比栏杆高/低 N cm` | 调栏杆 `size[1]`，或改前倾角度 |
| `身体陷进道具 N cm` | 人物 elevation 低于道具顶面、或站位在道具包围盒内；对照俯视图 |
| `视线偏了 N°` | 预设胸口有 twist 时，gaze 不会自动抵消；把胸口转回来或减小 twist |
| `模型穿裙子，插兜动作没有口袋` | 换 `hold_skirt` / `hands_on_hips` / 自然垂手 |

只有 `profiles/local/` 里有实测档案的模型能做几何验收；其他模型会明确标「无实测档案，未做几何验收」。
