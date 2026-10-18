// P1 单测：锁定 §5.2/§5.3 的方向与符号约定。符号错了先改这里还是改实现？改实现。
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMannequin } from "../src/scene/mannequin";
import { applyPose, autoGroundRig, mirrorPose, postedBox, resolvePose, type Rig } from "../src/scene/rig";
import { presetMap } from "../src/data/poses";
import type { JointName, Pose } from "../src/types";

function posed(pose: Pose): Rig {
  const rig = buildMannequin({ build: "male", height: 1.78 });
  applyPose(rig, resolvePose(pose, presetMap));
  rig.root.updateMatrixWorld(true);
  return rig;
}

/** 关节（或标记点）from → to 的世界方向 */
function dirOf(rig: Rig, from: JointName | string, to: JointName | string): THREE.Vector3 {
  const find = (n: JointName | string): THREE.Object3D => {
    const o = rig.joints.get(n as JointName)?.obj ?? rig.markers.get(n);
    if (!o) throw new Error(`no object: ${n}`);
    return o;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  find(from).getWorldPosition(a);
  find(to).getWorldPosition(b);
  return b.sub(a).normalize();
}

describe("§5.3 四肢方向公式", () => {
  it("T-pose：pitch 90 / yaw 90 → 左臂 +X、右臂 -X", () => {
    const rig = posed({ joints: {
      upperArm_L: { pitch: 90, yaw: 90 },
      upperArm_R: { pitch: 90, yaw: 90 },
    } });
    const l = dirOf(rig, "upperArm_L", "elbow_L");
    const r = dirOf(rig, "upperArm_R", "elbow_R");
    expect(l.x).toBeGreaterThan(0.999);
    expect(r.x).toBeLessThan(-0.999);
    expect(Math.abs(l.y)).toBeLessThan(1e-6);
    expect(Math.abs(l.z)).toBeLessThan(1e-6);
  });

  it("向前指：pitch 90 / yaw 0 → +Z", () => {
    const rig = posed({ joints: { upperArm_R: { pitch: 90, yaw: 0 } } });
    const d = dirOf(rig, "upperArm_R", "elbow_R");
    expect(d.z).toBeGreaterThan(0.999);
  });

  it("举手：pitch 180 → +Y", () => {
    const rig = posed({ joints: { upperArm_L: { pitch: 180, yaw: 0 } } });
    expect(dirOf(rig, "upperArm_L", "elbow_L").y).toBeGreaterThan(0.999);
  });

  it("后摆腿：pitch 20 / yaw 180 → 膝盖在髋后方（-Z）", () => {
    const rig = posed({ joints: { upperLeg_L: { pitch: 20, yaw: 180 } } });
    const d = dirOf(rig, "upperLeg_L", "knee_L");
    expect(d.z).toBeLessThan(-0.3);
    expect(d.y).toBeLessThan(-0.9);
  });
});

describe("符号约定（§5.2 文字描述）", () => {
  it("head turn +30 → 鼻尖偏向人物自己的右侧（-X）", () => {
    const rig = posed({ joints: { head: { turn: 30 } } });
    expect(dirOf(rig, "head", "noseTip").x).toBeLessThan(-0.4);
  });

  it("spine bend +30 → 头顶向前（z 增大）", () => {
    const rig = posed({ joints: { spine: { bend: 30 } } });
    const top = new THREE.Vector3();
    rig.markers.get("headTop")!.getWorldPosition(top);
    expect(top.z).toBeGreaterThan(0.15);
  });

  it("肘 bend 90 → 前臂朝前弯（+Z）", () => {
    const rig = posed({ joints: { lowerArm_L: { bend: 90 } } });
    const d = dirOf(rig, "elbow_L", "wrist_L");
    expect(d.z).toBeGreaterThan(0.9);
    expect(d.y).toBeGreaterThan(-0.2);
  });

  it("膝 bend 90 → 小腿朝后弯（-Z）", () => {
    const rig = posed({ joints: { lowerLeg_L: { bend: 90 } } });
    const d = dirOf(rig, "knee_L", "ankle_L");
    expect(d.z).toBeLessThan(-0.9);
  });

  it("foot point +30 → 脚尖向下（绷脚）", () => {
    const rig = posed({ joints: { foot_L: { point: 30 } } });
    expect(dirOf(rig, "foot_L", "toe_L").z).toBeLessThan(0.85);
  });

  it("hips side + → 身体向自己的右侧倒（头顶 x < 0）", () => {
    const rig = posed({ joints: { hips: { side: 60 } } });
    const top = new THREE.Vector3();
    rig.markers.get("headTop")!.getWorldPosition(top);
    expect(top.x).toBeLessThan(-0.5);
  });
});

describe("resolvePose", () => {
  it("越界 clamp 到 §5.2 范围", () => {
    const p = resolvePose({ joints: {
      upperArm_L: { pitch: 300, yaw: -100, twist: 500 },
      lowerArm_L: { bend: -20 },
      head: { turn: 200, nod: -999 },
      hips: { bend: 300 },
    } }, presetMap);
    expect(p.upperArm_L.pitch).toBe(180);
    expect(p.upperArm_L.yaw).toBe(-60);
    expect(p.upperArm_L.twist).toBe(90);
    expect(p.lowerArm_L.bend).toBe(0);
    expect(p.head.turn).toBe(80);
    expect(p.head.nod).toBe(-60);
    expect(p.hips.bend).toBe(180);
  });

  it("参数补全为 0，忽略未知参数与未知关节", () => {
    const p = resolvePose({ joints: {
      head: { turn: 10, nonsense: 5 },
      tail: { bend: 10 },
    } } as Pose, presetMap);
    expect(p.head.turn).toBe(10);
    expect(p.head.nod).toBe(0);
    expect((p as Record<string, unknown>).tail).toBeUndefined();
  });

  it("预设 + 覆盖：覆盖生效，预设其余保留", () => {
    const p = resolvePose({ preset: "stand", joints: { head: { turn: 20 } } }, presetMap);
    expect(p.head.turn).toBe(20);
    expect(p.upperArm_L.pitch).toBe(6);
  });
});

describe("mirrorPose（§9 镜像规则）", () => {
  it("_L/_R 互换，中轴关节 side/twist/turn/tilt 取反，其余不动", () => {
    const m = mirrorPose({ joints: {
      upperArm_L: { pitch: 30, yaw: 40 },
      hand_R: { side: 15 },
      head: { turn: 30, nod: 10, tilt: 5 },
      hips: { twist: -20, bend: 15 },
    } });
    const j = m.joints!;
    expect(j.upperArm_R!.pitch).toBe(30);
    expect(j.upperArm_R!.yaw).toBe(40);
    expect(j.upperArm_L).toBeUndefined();
    expect(j.hand_L!.side).toBe(-15);
    expect(j.head!.turn).toBe(-30);
    expect(j.head!.nod).toBe(10);
    expect(j.head!.tilt).toBe(-5);
    expect(j.hips!.twist).toBe(20);
    expect(j.hips!.bend).toBe(15);
  });
});

describe("预设几何合理性", () => {
  it("sit_chair：着地、膝盖朝前、髋部降到椅面高度附近", () => {
    const rig = posed({ preset: "sit_chair" });
    autoGroundRig(rig, 0);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.min.y).toBeCloseTo(0, 1);
    const hip = new THREE.Vector3();
    rig.joints.get("hips")!.obj.getWorldPosition(hip);
    expect(hip.y).toBeLessThan(0.75);
    const knee = new THREE.Vector3();
    rig.markers.get("knee_L")!.getWorldPosition(knee);
    expect(knee.z).toBeGreaterThan(hip.z + 0.2); // 膝盖在髋前方
  });

  it("lie_back：身体放平（包围盒高度 < 0.6m）", () => {
    const rig = posed({ preset: "lie_back" });
    autoGroundRig(rig, 0);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.max.y - box.min.y).toBeLessThan(0.6);
  });

  it("kneel：髋部明显下降", () => {
    const rig = posed({ preset: "kneel" });
    autoGroundRig(rig, 0);
    rig.root.updateMatrixWorld(true);
    const hip = new THREE.Vector3();
    rig.joints.get("hips")!.obj.getWorldPosition(hip);
    expect(hip.y).toBeLessThan(0.7);
  });

  it("autoGround：任意姿势最低点贴地", () => {
    const rig = posed({ joints: { upperArm_L: { pitch: 130, yaw: 70 }, spine: { bend: 40 } } });
    autoGroundRig(rig, 0);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.min.y).toBeCloseTo(0, 1);
  });
});

// 回归：autoGround 必须按「蒙皮后」的最低点落地。
// SkinnedMesh 的 geometry.boundingBox 是绑定姿态的，Box3.setFromObject 默认不采样蒙皮，
// 于是坐/跪/躺会整体浮空（MMD 坐台阶那镜就是这样浮了 0.42m）。
describe("autoGroundRig（蒙皮网格）", () => {
  /** 一竖条四边形，绑定姿态最低点 y=0，由单根骨骼驱动 */
  function skinnedRig(): { rig: Rig; bone: THREE.Bone } {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      0, 0, 0, 0, 1, 0, 0.4, 0, 0, 0.4, 1, 0,
    ]), 3));
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array(16), 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(new Float32Array([
      1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
    ]), 4));
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    mesh.add(bone);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]));
    const root = new THREE.Group();
    root.add(mesh);
    root.updateMatrixWorld(true);
    const rig: Rig = { root, joints: new Map(), height: 1, hipHeight: 1, markers: new Map() };
    return { rig, bone };
  }

  it("Box3 非 precise 分支对 SkinnedMesh 会缓存绑定姿态盒，不跟着姿势更新", () => {
    const { rig, bone } = skinnedRig();
    // 先算一次（绑定姿态）→ SkinnedMesh.boundingBox 被填上并缓存
    const bindMin = new THREE.Box3().setFromObject(rig.root).min.y;
    bone.rotation.z = THREE.MathUtils.degToRad(-45); // 竖条斜过去，最低点下探
    rig.root.updateMatrixWorld(true);

    const staleMin = new THREE.Box3().setFromObject(rig.root).min.y;
    const posedMin = new THREE.Box3().setFromObject(rig.root, true).min.y;
    expect(staleMin).toBeCloseTo(bindMin, 5); // 旧的「最低点」纹丝不动
    expect(posedMin).toBeLessThan(bindMin - 0.1); // 真实蒙皮最低点已经下去了
  });

  it("autoGroundRig 按蒙皮后的最低点贴地（绕开那份缓存）", () => {
    const { rig, bone } = skinnedRig();
    new THREE.Box3().setFromObject(rig.root); // 埋下绑定姿态缓存
    bone.rotation.z = THREE.MathUtils.degToRad(-45);

    autoGroundRig(rig, 0);

    expect(new THREE.Box3().setFromObject(rig.root, true).min.y).toBeCloseTo(0, 2);
  });

  it("elevation 生效：贴到台面上而不是地面", () => {
    const { rig, bone } = skinnedRig();
    bone.rotation.z = THREE.MathUtils.degToRad(-30);

    autoGroundRig(rig, 0.8);

    expect(new THREE.Box3().setFromObject(rig.root, true).min.y).toBeCloseTo(0.8, 2);
  });

  it("autoGround 忽略裙摆/头发：软布料贴地不把身体顶起来", () => {
    const root = new THREE.Group();
    const strip = (boneName: string, y0: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        0, y0, 0, 0, y0 + 1, 0, 0.4, y0, 0, 0.4, y0 + 1, 0,
      ]), 3));
      geo.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint16Array(16), 4));
      geo.setAttribute("skinWeight", new THREE.BufferAttribute(new Float32Array([
        1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
      ]), 4));
      const bone = new THREE.Bone();
      bone.name = boneName;
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
      mesh.add(bone);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton([bone]));
      return mesh;
    };
    const body = strip("body", 0); // 身体最低点 y=0
    const skirt = strip("スカート", -0.3); // 裙摆比身体低 30cm
    root.add(body, skirt);
    root.updateMatrixWorld(true);
    const rig: Rig = { root, joints: new Map(), height: 1, hipHeight: 1, markers: new Map() };

    autoGroundRig(rig, 0);

    expect(postedBox(body).min.y).toBeCloseTo(0, 2); // 身体恰好贴地
    expect(postedBox(root).min.y).toBeCloseTo(-0.3, 2); // 裙摆允许穿地
  });
});
