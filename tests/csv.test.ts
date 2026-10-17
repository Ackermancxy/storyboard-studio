// CSV 分镜表：一行一镜、Excel 兼容的转义与 BOM。
import { describe, expect, it } from "vitest";
import type { Project } from "../src/types";
import { buildStoryboardCSV } from "../src/export/csv";

const project = {
  version: 1,
  title: "测试项目",
  aspect: "3:2",
  sensor: "FF",
  shots: [{
    id: "S01",
    name: '他说"卡"',
    description: "第一行\n第二行, 带逗号",
    notes: "备注，含引号\"和,逗号",
    duration: 3,
    camera: { mode: "auto", focalLength: 35, shotSize: "MS", azimuth: 20, angle: "eye", placement: "center" },
    actors: [{ id: "A", label: "小明", model: "mikoto", position: [0, 0], facing: 0, pose: { preset: "stand" } }],
    props: [{ id: "P1", model: "chair", label: "椅子", position: [0, 0] }],
    lights: [{ id: "L1", role: "key", azimuth: 45, elevation: 35, intensity: 1 }],
    environment: { background: "#000", floor: "grid", sky: "clear-dusk", ground: "grass" },
  }],
} as unknown as Project;

describe("分镜表 CSV", () => {
  it("带 UTF-8 BOM 和 CRLF，一行一镜", () => {
    const csv = buildStoryboardCSV(project);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("镜号,镜头名称,时长(s)");
    expect(csv).toContain("S01");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("引号、逗号、换行按 RFC 4180 转义", () => {
    const csv = buildStoryboardCSV(project);
    expect(csv).toContain('"他说""卡"""');
    expect(csv).toContain('"第一行\n第二行, 带逗号"');
  });

  it("写入环境、人物、道具和灯光摘要", () => {
    const csv = buildStoryboardCSV(project);
    expect(csv).toContain("晴 · 黄昏（蓝调）");
    expect(csv).toContain("草地");
    expect(csv).toContain("小明（mikoto）");
    expect(csv).toContain("椅子");
    expect(csv).toContain("L1 key 45°/35° 强度1");
  });
});
