// 回归：追加人物/道具时的 id 分配不能重号（场景按 id 索引，重号会互相顶掉）
import { describe, expect, it } from "vitest";
import { nextId } from "../src/state/store";

describe("nextId", () => {
  it("人物用纯字母 id 时接着往后排，不重号", () => {
    expect(nextId([], "A")).toBe("A");
    expect(nextId([{ id: "A" }], "A")).toBe("B");
    expect(nextId([{ id: "A" }, { id: "B" }], "A")).toBe("C");
    // 跳号也认
    expect(nextId([{ id: "A" }, { id: "C" }], "A")).toBe("B");
  });

  it("超过 26 个人物后用 A1/A2…", () => {
    const all = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((id) => ({ id }));
    expect(nextId(all, "A")).toBe("A1");
    expect(nextId([...all, { id: "A1" }], "A")).toBe("A2");
  });

  it("道具/灯用数字后缀", () => {
    expect(nextId([], "P")).toBe("P1");
    expect(nextId([{ id: "P1" }, { id: "P3" }], "P")).toBe("P2");
    expect(nextId([{ id: "L1" }], "L")).toBe("L2");
  });
});
