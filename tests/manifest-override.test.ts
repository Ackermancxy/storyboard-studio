// manifest.local.json 按 id 覆盖基础 manifest（开源仓库带通用模型，本机私有模型放 local）。
import { afterEach, describe, expect, it, vi } from "vitest";
import { characterDef, getManifest, loadManifest } from "../src/scene/assets";

const base = {
  characters: [
    { id: "mikoto", name: "女生", type: "procedural", build: "female" },
    { id: "man", name: "男", type: "procedural", build: "male" },
  ],
  props: [{ id: "chair", name: "椅子", type: "procedural", shape: "chair" }],
};

const local = {
  characters: [
    { id: "mikoto", name: "女生", type: "mmd", file: "models/mikoto/model.pmx" },
    { id: "hero", name: "主角", type: "gltf", file: "models/hero.glb" },
  ],
};

function mockFetch(handlers: Record<string, unknown | null>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = Object.keys(handlers).find((k) => url.includes(k));
    const body = key ? handlers[key] : null;
    return { ok: body !== null, status: body === null ? 404 : 200, json: async () => body } as unknown as Response;
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("manifest.local.json 覆盖", () => {
  it("按 id 覆盖基础人物，并追加新 id，顺序沿用 base", async () => {
    mockFetch({ "manifest.local.json": local, "manifest.json": base });
    await loadManifest();
    expect(characterDef("mikoto")?.type).toBe("mmd");
    expect(characterDef("hero")?.type).toBe("gltf");
    expect(getManifest().characters.map((c) => c.id)).toEqual(["mikoto", "man", "hero"]);
    expect(getManifest().props).toHaveLength(1);
  });

  it("没有 local 文件时保持基础 manifest", async () => {
    mockFetch({ "manifest.json": base });
    await loadManifest();
    expect(characterDef("mikoto")?.type).toBe("procedural");
    expect(characterDef("hero")).toBeUndefined();
  });
});
