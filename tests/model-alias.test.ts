// 显示名写的人物 / 道具 model 要映射回 id；未知 model 回退到第一个人物
import { describe, expect, it } from "vitest";
import { normalizeProject, type ModelLists } from "../src/state/normalize";

const models: ModelLists = {
  characters: ["mikoto", "man"],
  props: ["chair"],
  characterNames: new Map([["女生", "mikoto"], ["男", "man"]]),
  propNames: new Map([["椅子", "chair"]]),
};

function projectWithModel(model: string) {
  return {
    version: 1,
    shots: [{ id: "S01", actors: [{ id: "A", model }] }],
  };
}

describe("人物 model 解析", () => {
  it("下拉框写入的显示名映射回 id", () => {
    const { project } = normalizeProject(projectWithModel("女生"), models);
    expect(project.shots[0].actors[0].model).toBe("mikoto");
  });

  it("道具显示名映射回 id", () => {
    const input = { version: 1, shots: [{ id: "S01", props: [{ id: "P1", model: "椅子" }] }] };
    const { project } = normalizeProject(input, models);
    expect(project.shots[0].props[0].model).toBe("chair");
  });

  it("合法 id 原样保留且不产生改写警告", () => {
    const { project, warnings } = normalizeProject(projectWithModel("mikoto"), models);
    expect(project.shots[0].actors[0].model).toBe("mikoto");
    expect(warnings.some((w) => w.includes("已改为"))).toBe(false);
  });

  it("未知 id 回退到第一个人物并给出警告", () => {
    const { project, warnings } = normalizeProject(projectWithModel("ghost"), models);
    expect(project.shots[0].actors[0].model).toBe("mikoto");
    expect(warnings.some((w) => w.includes("不认识，用 mikoto"))).toBe(true);
  });
});
