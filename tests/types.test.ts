import { describe, expect, it } from "vitest";
import { JOINT_NAMES, SHOT_SIZES } from "../src/types";

describe("types 常量", () => {
  it("关节表 17 个，且 _L/_R 成对（SPEC §5.1）", () => {
    expect(JOINT_NAMES).toHaveLength(17);
    for (const j of JOINT_NAMES) {
      if (j.endsWith("_L")) {
        expect(JOINT_NAMES).toContain(j.replace(/_L$/, "_R") as (typeof JOINT_NAMES)[number]);
      }
    }
  });

  it("景别 8 档，顺序与 SPEC §7.2 表一致", () => {
    expect([...SHOT_SIZES]).toEqual(["ECU", "CU", "MCU", "MS", "MLS", "FS", "WS", "EWS"]);
  });
});
