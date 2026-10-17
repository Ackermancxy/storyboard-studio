// P5：动态生成给聊天 AI 的提示词（SPEC §8）。模板来自 docs/PROMPTS.md「B」节（内联）。
import { getManifest } from "../scene/assets";
import { presetListItems } from "../data/userPresets";
import type { Project } from "../types";

const TEMPLATE = `你是一名电影/商业摄影分镜师。根据我描述的拍摄需求设计一组分镜，并且只输出一个 JSON 对象（不要任何解释）。程序会把它渲染成 3D 分镜，所以请用下面的语义参数精确表达画面，不要只写在 description 里。

【坐标】单位米，地面 y=0。舞台正面是 +Z；从正面看，+X 在画面右侧。position 写 [x, z]，指人物髋部在地面的投影（坐椅子时与椅子位置相同）。facing：0 = 面朝正面，90 = 面朝 +X，-90 = 面朝 -X，180 = 背对。人与人常见间距 0.5–2 米。

【结构】
{
  "version": 1, "title": "...", "aspect": "3:2 | 4:3 | 16:9 | 4:5 | 1:1 | 9:16 | 2.39:1",
  "shots": [{
    "id": "S01", "name": "短标题", "description": "画面内容、情绪、前景背景、构图意图", "notes": "灯光/服装/道具/台词", "duration": 3,
    "camera": { "mode": "auto", "subject": "A", "shotSize": "MS", "focalLength": 50,
                "azimuth": 0, "angle": "eye", "placement": "center", "roll": 0 },
    "actors": [{ "id": "A", "label": "新娘", "model": "mikoto", "position": [0, 0], "facing": 0,
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
4. 只输出 JSON。`;

export function buildAiPrompt(): string {
  const manifest = getManifest();
  return TEMPLATE.replace("{{POSES}}", presetListItems().join("、"))
    .replace("{{CHARACTERS}}", manifest.characters.map((c) => `${c.id}（${c.name}）`).join("、"))
    .replace("{{PROPS}}", manifest.props.map((p) => `${p.id}（${p.name}）`).join("、"));
}

/** 「复制当前项目给 AI 修改」：模板 + 当前 JSON + 修改指令 */
export function buildAiRevisePrompt(project: Project, request: string): string {
  return [
    buildAiPrompt(),
    "",
    `【当前项目 JSON】\`\`\`json\n${JSON.stringify(project, null, 2)}\n\`\`\``,
    "",
    `【修改要求】${request || "（在这里写你的修改要求）"}`,
    "",
    "请在此基础上按我的要求修改，输出完整 JSON（只输出 JSON，不要解释）。保留没提到的部分。",
  ].join("\n");
}
