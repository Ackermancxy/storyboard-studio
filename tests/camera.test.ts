// P3 单测：机位求解（SPEC §7.2）
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMannequin } from "../src/scene/mannequin";
import { applyPose, autoGroundRig, postedBox, resolvePose } from "../src/scene/rig";
import { POSE_PRESETS } from "../src/data/poses";
import {
  ANGLE_ELEVATION,
  focalToVFovDeg,
  pickSubjectsById,
  SHOT_TABLE,
  solveCamera,
} from "../src/scene/camera";
import type { CameraSpec } from "../src/types";

const A = { id: "A", position: [0, 0] as [number, number], facing: 0, height: 1.7 };
const auto = (over: Partial<CameraSpec> = {}): CameraSpec => ({
  mode: "auto", focalLength: 50, shotSize: "MS", azimuth: 0, angle: "eye", placement: "center", ...over,
});

describe("focalToVFovDeg", () => {
  it("50mm、3:2 → 约 27°（全画幅垂直视角）", () => {
    expect(focalToVFovDeg(50, 1.5)).toBeCloseTo(26.99, 1);
  });
  it("竖画幅用长边 36mm，同焦段视角更宽", () => {
    expect(focalToVFovDeg(50, 9 / 16)).toBeGreaterThan(focalToVFovDeg(50, 16 / 9));
  });
});

describe("solveCamera", () => {
  it("FS + 50mm + 1.7m：距离符合 D = F·H / (2·tan(vFov/2))", () => {
    const aspect = 1.5;
    const s = solveCamera(auto({ shotSize: "FS", focalLength: 50 }), [A], aspect);
    const vFov = (focalToVFovDeg(50, aspect) * Math.PI) / 180;
    const expected = (SHOT_TABLE.FS.F * 1.7) / (2 * Math.tan(vFov / 2));
    expect(s.distance).toBeCloseTo(expected, 3);
    expect(s.distance).toBeGreaterThan(3.5); // 全景要退到 4m 左右
  });

  it("景别越远距离越远", () => {
    const sizes = ["ECU", "CU", "MS", "FS", "WS", "EWS"] as const;
    let prev = 0;
    for (const sz of sizes) {
      const d = solveCamera(auto({ shotSize: sz }), [A], 1.5).distance;
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("facing 0 + azimuth +90 → 相机在被摄者左侧（x > 0），画面里脸朝左", () => {
    const s = solveCamera(auto({ azimuth: 90 }), [A], 1.5);
    expect(s.position.x).toBeGreaterThan(0.5);
    expect(s.position.z).toBeCloseTo(0, 1);
  });

  it("azimuth 0 → 相机在正前方（+Z）", () => {
    const s = solveCamera(auto(), [A], 1.5);
    expect(s.position.z).toBeGreaterThan(0.5);
  });

  it("high → 相机高于目标点；low → 低于", () => {
    const high = solveCamera(auto({ angle: "high" }), [A], 1.5);
    const low = solveCamera(auto({ angle: "low" }), [A], 1.5);
    expect(high.position.y).toBeGreaterThan(high.target.y);
    expect(low.position.y).toBeLessThan(low.target.y);
  });

  it("angle 映射表与 §7.2 一致", () => {
    expect(ANGLE_ELEVATION).toEqual({ eye: 0, high: 25, low: -15, overhead: 80, worm: -45 });
  });

  it("elevation 覆盖 angle", () => {
    const s = solveCamera(auto({ angle: "high", elevation: 60 }), [A], 1.5);
    expect(s.position.y).toBeGreaterThan(s.target.y + 1);
  });

  it("left-third → 目标点沿相机右方向偏移（主体落画面左三分线）", () => {
    const center = solveCamera(auto(), [A], 1.5);
    const left = solveCamera(auto({ placement: "left-third" }), [A], 1.5);
    const right = solveCamera(auto({ placement: "right-third" }), [A], 1.5);
    expect(left.target.x).toBeGreaterThan(center.target.x);
    expect(right.target.x).toBeLessThan(center.target.x);
  });

  it("相机最低高度 0.05（worm 时也不钻地）", () => {
    const s = solveCamera(auto({ angle: "worm", shotSize: "FS" }), [A], 1.5);
    expect(s.position.y).toBeGreaterThanOrEqual(0.05);
  });

  it("subject 数组取中点，高度取最大", () => {
    const B = { id: "B", position: [2, 0] as [number, number], facing: 0, height: 1.9 };
    const s = solveCamera(auto({ subject: ["A", "B"], shotSize: "WS" }), [A, B], 1.5);
    expect(s.subjectHeight).toBeCloseTo(1.9);
    expect(s.target.x).toBeCloseTo(1, 3);
  });

  it("subject id 全错时回退全体", () => {
    const B = { id: "B", position: [2, 0] as [number, number], facing: 0, height: 1.9 };
    const s = solveCamera(auto({ subject: "X", shotSize: "WS" }), [A, B], 1.5);
    expect(s.target.x).toBeCloseTo(1, 3);
  });

  it("pickSubjectsById", () => {
    const B = { id: "B", position: [2, 0] as [number, number], facing: 0, height: 1.9 };
    expect(pickSubjectsById(auto({ subject: "B" }), [A, B])).toHaveLength(1);
    expect(pickSubjectsById(auto(), [A, B])).toHaveLength(2);
  });
});

describe("solveCamera 按实际人体取景", () => {
  const presets = Object.fromEntries(POSE_PRESETS.map((p) => [p.id, p.pose]));
  const bodyBox = (preset: string): THREE.Box3 => {
    const rig = buildMannequin({ build: "male", height: 1.6 });
    applyPose(rig, resolvePose({ preset }, presets));
    autoGroundRig(rig, 0);
    return postedBox(rig.root);
  };
  const visible = (p: THREE.Vector3, cam: THREE.PerspectiveCamera): boolean => {
    const c = p.clone().project(cam);
    return Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1;
  };

  it.each(["stand", "sit_chair", "sit_floor", "kneel", "lie_back", "lie_side"])(
    "%s：MS 与 FS 下头顶和身体中心都在画内",
    (preset) => {
      const box = bodyBox(preset);
      const head = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      const mid = box.getCenter(new THREE.Vector3());
      for (const shotSize of ["MS", "FS"] as const) {
        const s = solveCamera(auto({ shotSize }), [{ ...A, height: 1.6, bounds: box }], 1.5);
        const cam = new THREE.PerspectiveCamera(focalToVFovDeg(50, 1.5), 1.5, 0.01, 100);
        cam.position.copy(s.position);
        cam.up.copy(s.up);
        cam.lookAt(s.target);
        cam.updateMatrixWorld();
        expect(visible(head, cam), `${shotSize} head`).toBe(true);
        expect(visible(mid, cam), `${shotSize} center`).toBe(true);
      }
    },
  );

  it("躺下的人不按站姿身高拉远，同样景别比站立时更近", () => {
    const lie = solveCamera(auto({ shotSize: "MS" }), [{ ...A, height: 1.6, bounds: bodyBox("lie_back") }], 1.5);
    const stand = solveCamera(auto({ shotSize: "MS" }), [{ ...A, height: 1.6, bounds: bodyBox("stand") }], 1.5);
    expect(lie.distance).toBeLessThan(stand.distance * 1.5);
    expect(lie.subjectHeight).toBeLessThan(0.5);
  });
});
