// P5 单测：宽容解析（SPEC §4.6）
import { describe, expect, it } from "vitest";
import {
  extractJson,
  normalizeProject,
  parseLoose,
  sanitizeJson,
  type ModelLists,
} from "../src/state/normalize";

const models: ModelLists = { characters: ["man", "woman"], props: ["chair", "box"] };

describe("extractJson / sanitizeJson", () => {
  it("剥掉 ```json 围栏", () => {
    const text = '好的，这是分镜：\n```json\n{"shots":[]}\n```\n希望有帮助';
    expect(parseLoose(text)).toEqual({ shots: [] });
  });

  it("前后有废话也能抠出平衡的 JSON", () => {
    const text = ' blah blah [1, {"a": 2}] tralala ';
    expect(parseLoose(text)).toEqual([1, { a: 2 }]);
  });

  it("容忍注释和尾逗号", () => {
    const text = `{
      // 行注释
      "a": 1, /* 块注释 */
      "b": [1, 2,],
    }`;
    expect(parseLoose(text)).toEqual({ a: 1, b: [1, 2] });
  });

  it("字符串里的 // 和 } 不干扰", () => {
    const text = '{"url": "http://x.com/a}", "s": "///"}';
    expect(parseLoose(text)).toEqual({ url: "http://x.com/a}", s: "///" });
  });

  it("extractJson 空输入返回 null", () => {
    expect(extractJson("完全没有大括号")).toBeNull();
  });

  it("sanitizeJson 保留字符串内逗号", () => {
    expect(sanitizeJson('{"a": "x,}"}')).toBe('{"a": "x,}"}');
  });
});

describe("normalizeProject", () => {
  it("完整项目原样通过", () => {
    const { project, warnings } = normalizeProject({
      version: 1, title: "T", aspect: "16:9",
      shots: [{
        id: "S01", name: "一", description: "d", duration: 3,
        camera: { mode: "auto", subject: "A", shotSize: "MS", focalLength: 50, azimuth: 30, angle: "eye", placement: "center" },
        actors: [{ id: "A", model: "woman", position: [1, 2], facing: 45, pose: { preset: "stand" }, gaze: "camera" }],
        props: [{ id: "P1", model: "chair", position: [0, 0] }],
        lights: [{ id: "L1", role: "key", azimuth: 45, elevation: 35, intensity: 1, colorTemp: 3200 }],
      }],
    }, models);
    expect(warnings).toEqual([]);
    expect(project.title).toBe("T");
    expect(project.aspect).toBe("16:9");
    expect(project.shots[0].actors[0].position).toEqual([1, 2]);
  });

  it("缺字段补默认", () => {
    const { project } = normalizeProject({ shots: [{ actors: [{ model: "man" }] }] }, models);
    const shot = project.shots[0];
    expect(shot.id).toBe("S01");
    expect(shot.name).toBe("镜头 1");
    expect(shot.camera.focalLength).toBe(50);
    expect(shot.camera.shotSize).toBe("MS");
    expect(shot.actors[0].pose.preset).toBeUndefined();
    expect(shot.actors[0].position).toEqual([0, 0]);
  });

  it("只给 shots 数组 / 单个 shot 都行", () => {
    const a = normalizeProject([{ id: "S01", camera: {}, actors: [] }], models);
    expect(a.project.shots).toHaveLength(1);
    const b = normalizeProject({ id: "S07", camera: {}, actors: [{ id: "A", model: "man" }] }, models);
    expect(b.project.shots[0].id).toBe("S07");
  });

  it("未知 model / preset / 道具给中文警告并回退", () => {
    const { project, warnings } = normalizeProject({
      shots: [{
        camera: {}, actors: [{ id: "A", model: "alien", pose: { preset: "fly" } }],
        props: [{ id: "P1", model: "ufo" }],
      }],
    }, models);
    expect(project.shots[0].actors[0].model).toBe("man");
    expect(project.shots[0].props[0].model).toBe("box");
    expect(warnings.some((w) => w.includes("alien") && w.includes("man"))).toBe(true);
    expect(warnings.some((w) => w.includes("fly"))).toBe(true);
    expect(warnings.some((w) => w.includes("ufo"))).toBe(true);
  });

  it("越界数值 clamp（含关节）", () => {
    const { project } = normalizeProject({
      shots: [{
        camera: { focalLength: 999, azimuth: 1000 },
        actors: [{ id: "A", model: "man", pose: { joints: { head: { turn: 500, nod: -500 }, upperArm_L: { pitch: 300 } } } }],
        lights: [{ id: "L1", role: "key", intensity: 99 }],
      }],
    }, models);
    const shot = project.shots[0];
    expect(shot.camera.focalLength).toBe(200);
    expect(shot.camera.azimuth).toBe(360);
    expect(shot.actors[0].pose.joints!.head!.turn).toBe(80);
    expect(shot.actors[0].pose.joints!.head!.nod).toBe(-60);
    expect(shot.actors[0].pose.joints!.upperArm_L!.pitch).toBe(180);
    expect(shot.lights[0].intensity).toBe(2);
  });

  it("id 缺失或重复自动生成并警告", () => {
    const { project, warnings } = normalizeProject({
      shots: [
        { id: "S01", camera: {}, actors: [{ model: "man" }, { id: "A", model: "man" }, { id: "A", model: "man" }] },
        { id: "S01", camera: {}, actors: [] },
      ],
    }, models);
    expect(project.shots[1].id).not.toBe("S01");
    const ids = project.shots[0].actors.map((a) => a.id);
    expect(new Set(ids).size).toBe(3);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("subject 指向不存在的人物时警告并回退", () => {
    const { project, warnings } = normalizeProject({
      shots: [{ camera: { subject: "Z" }, actors: [{ id: "A", model: "man" }] }],
    }, models);
    expect(project.shots[0].camera.subject).toBeUndefined();
    expect(warnings.some((w) => w.includes("Z"))).toBe(true);
  });

  it("完全不是 JSON 时抛中文错误", () => {
    expect(() => parseLoose("hello")).toThrow(/JSON/);
    expect(() => normalizeProject("hello", models)).toThrow(/结构不对/);
  });
});
