// P4 单测：色温近似 + 灯位方位
import { describe, expect, it } from "vitest";
import { kelvinToRGB, placeLight } from "../src/scene/lights";

describe("kelvinToRGB（Tanner Helland）", () => {
  it("2700K 偏橙（r 明显大于 b）", () => {
    const { r, b } = kelvinToRGB(2700);
    expect(r).toBeGreaterThan(0.95);
    expect(b).toBeLessThan(0.5);
    expect(r - b).toBeGreaterThan(0.5);
  });

  it("3200K 暖、5600K 接近日光、6500K 接近白", () => {
    const w = kelvinToRGB(3200);
    expect(w.r).toBeGreaterThan(w.b);
    const d = kelvinToRGB(5600);
    expect(d.r).toBeGreaterThan(0.95);
    expect(d.b).toBeGreaterThan(0.85);
    const n = kelvinToRGB(6500);
    expect(Math.abs(n.r - 1)).toBeLessThan(0.03);
    expect(Math.abs(n.g - 1)).toBeLessThan(0.03);
    expect(Math.abs(n.b - 1)).toBeLessThan(0.05);
  });

  it("越冷越蓝", () => {
    expect(kelvinToRGB(9000).b).toBeGreaterThan(kelvinToRGB(5600).b);
  });

  it("越界 clamp", () => {
    expect(kelvinToRGB(100)).toEqual(kelvinToRGB(1000));
  });
});

describe("placeLight 方位（规则同机位 §7.2）", () => {
  // 人物在原点朝 +Z（facing 0）
  it("azimuth 0 → 灯在正前方", () => {
    const p = placeLight(0, 20, 3, [0, 0], 0, 1.7);
    expect(p.position.z).toBeGreaterThan(0);
    expect(p.position.y).toBeGreaterThan(p.aim.y); // 仰角正 = 从上往下打
  });

  it("azimuth +45 → 灯在被摄者左侧（x > 0）", () => {
    const p = placeLight(45, 20, 3, [0, 0], 0, 1.7);
    expect(p.position.x).toBeGreaterThan(0);
    expect(p.position.z).toBeGreaterThan(0);
  });

  it("aim 打在胸口 0.75H", () => {
    const p = placeLight(0, 0, 3, [0, 0], 0, 1.7);
    expect(p.aim.y).toBeCloseTo(1.275);
  });

  it("随 subject 朝向整体旋转", () => {
    // 人物 facing 90（朝 +X），azimuth 0 → 灯在 +X 侧
    const p = placeLight(0, 0, 3, [0, 0], 90, 1.7);
    expect(p.position.x).toBeGreaterThan(2);
  });

  it("灯不钻地", () => {
    const p = placeLight(0, -80, 3, [0, 0], 0, 1.7);
    expect(p.position.y).toBeGreaterThanOrEqual(0.1);
  });
});
