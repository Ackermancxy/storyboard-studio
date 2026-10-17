// 回归测试：MMD「付与親」（append transform）。
// 真实模型里短袖的面几乎全绑在 `左腕+`（腕捩）上，而腕捩与 `左腕` 同级挂在肩下，
// 靠付与继承大臂旋转；three 的 MMDLoader 只解析不实现 → 手臂抬起时袖子不动。
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { collectMmdGrants } from "../src/scene/assets";
import { MMD_BONES } from "../src/scene/gltfRig";
import { applyPose, computeRestFrames, restFrameOf, resolvePose, type Rig } from "../src/scene/rig";
import { presetMap } from "../src/data/poses";
import type { JointName } from "../src/types";

/** 只有单边手臂的最小骨架，层级照抄真实模型：肩C 下挂着 腕 和 腕捩（同级） */
function buildArmModel(): { root: THREE.Group; arm: THREE.Bone; sleeve: THREE.Bone; inert: THREE.Bone } {
  const root = new THREE.Group();
  const chest = new THREE.Bone(); chest.name = "上半身2";
  const shoulderP = new THREE.Bone(); shoulderP.name = "左肩P";
  const shoulder = new THREE.Bone(); shoulder.name = "左肩";
  const shoulderC = new THREE.Bone(); shoulderC.name = "左肩C";
  const arm = new THREE.Bone(); arm.name = "左腕";
  const elbow = new THREE.Bone(); elbow.name = "左ひじ";
  const wrist = new THREE.Bone(); wrist.name = "左手首";
  const sleeve = new THREE.Bone(); sleeve.name = "左腕+";
  const inert = new THREE.Bone(); inert.name = "左肩饰"; // 对照：同样同级但不付与

  root.add(chest);
  chest.add(shoulderP);
  shoulderP.add(shoulder);
  shoulder.add(shoulderC);
  shoulderC.add(arm);
  arm.add(elbow);
  elbow.add(wrist);
  shoulderC.add(sleeve);
  shoulderC.add(inert);

  arm.position.set(0.1, 0, 0);
  sleeve.position.copy(arm.position);
  inert.position.copy(arm.position);
  elbow.position.set(0, -0.25, 0);
  wrist.position.set(0, -0.25, 0);
  root.updateMatrixWorld(true);
  return { root, arm, sleeve, inert };
}

function rigWith(grants: boolean): { rig: Rig; arm: THREE.Bone; sleeve: THREE.Bone; inert: THREE.Bone } {
  const { root, arm, sleeve, inert } = buildArmModel();
  const objs = new Map<JointName, THREE.Object3D>([
    ["upperArm_L", arm],
    ["lowerArm_L", root.getObjectByName("左ひじ")!],
    ["hand_L", root.getObjectByName("左手首")!],
    ["chest", root.getObjectByName("上半身2")!],
  ]);
  const rig: Rig = {
    root,
    joints: computeRestFrames(root, objs),
    height: 1.7,
    hipHeight: 1.0,
    markers: new Map(),
  };
  if (grants) {
    rig.grants = [{ obj: sleeve, joint: "upperArm_L", ratio: 1, ...restFrameOf(root, sleeve) }];
  }
  return { rig, arm, sleeve, inert };
}

const RAISE = resolvePose({ joints: { upperArm_L: { pitch: 170, yaw: 90 } } }, presetMap);

function worldQ(o: THREE.Object3D): THREE.Quaternion {
  o.updateMatrixWorld(true);
  return o.getWorldQuaternion(new THREE.Quaternion());
}

describe("MMD 付与骨跟随大臂（袖子问题）", () => {
  it("带 grants：袖骨的世界旋转与上臂一致", () => {
    const { rig, arm, sleeve } = rigWith(true);

    applyPose(rig, RAISE);

    const diff = worldQ(sleeve).angleTo(worldQ(arm));
    expect(diff).toBeLessThan(1e-3);
  });

  it("不带 grants：袖骨留在原地（复现原 bug，说明测试确实抓得到）", () => {
    const { rig, arm, sleeve } = rigWith(false);

    applyPose(rig, RAISE);

    expect(worldQ(sleeve).angleTo(worldQ(arm))).toBeGreaterThan(0.5);
    expect(worldQ(sleeve).angleTo(new THREE.Quaternion())).toBeLessThan(1e-3); // 仍是静止姿态
  });

  it("付与率 0.5 时只跟一半", () => {
    const { rig, arm, sleeve } = rigWith(false);
    rig.grants = [{ obj: sleeve, joint: "upperArm_L", ratio: 0.5, ...restFrameOf(rig.root, sleeve) }];

    applyPose(rig, RAISE);

    const half = worldQ(arm).angleTo(worldQ(sleeve));
    const full = worldQ(arm).angleTo(new THREE.Quaternion());
    expect(half).toBeGreaterThan(0.05);
    expect(half).toBeLessThan(full * 0.75);
  });
});

/** 造假 SkinnedMesh：collectMmdGrants 只读 geometry.bones / skeleton.bones / 父链 */
function stubMesh(bones: THREE.Bone[], raw: unknown[]): THREE.Object3D {
  const o = new THREE.Object3D() as unknown as {
    isSkinnedMesh: boolean;
    geometry: unknown;
    skeleton: unknown;
  };
  o.isSkinnedMesh = true;
  o.geometry = { bones: raw };
  o.skeleton = { bones };
  return o as unknown as THREE.Object3D;
}

describe("collectMmdGrants（读 PMX 付与表 + 捩り骨约定）", () => {
  it("腕捩（左腕+）无付与也收下，附带的支付骨按 ratio 收", () => {
    // 骨架层级照抄真实模型：腕捩与 腕 同级同位；腿 D 骨挂付与跟随
    const shoulderP = new THREE.Bone(); shoulderP.name = "左肩P";
    const shoulder = new THREE.Bone(); shoulder.name = "左肩";
    const shoulderC = new THREE.Bone(); shoulderC.name = "左肩C";
    const arm = new THREE.Bone(); arm.name = "左腕";
    const sleeve = new THREE.Bone(); sleeve.name = "左腕+";
    const leg = new THREE.Bone(); leg.name = "左足";
    const legD = new THREE.Bone(); legD.name = "左足D";
    shoulderP.add(shoulder); shoulder.add(shoulderC);
    shoulderC.add(arm); shoulderC.add(sleeve);
    shoulderP.add(leg); leg.add(legD);
    const bones = [shoulderP, shoulder, shoulderC, arm, sleeve, leg, legD];
    const raw = [
      { name: "左肩P", parent: -1 },
      { name: "左肩", parent: 0 },
      // 肩C：付与自 肩P 且 ratio −1（反向抵消骨）；源不是关节 → 不收
      { name: "左肩C", parent: 1, grant: { parentIndex: 0, ratio: -1, isLocal: false, affectRotation: true, affectPosition: false } },
      { name: "左腕", parent: 2 },
      // 捩り骨：真实模型里就是没有付与、与 左腕 同级同位
      { name: "左腕+", parent: 2 },
      { name: "左足", parent: 0 },
      { name: "左足D", parent: 5, grant: { parentIndex: 5, ratio: 1, isLocal: false, affectRotation: true, affectPosition: false } },
    ];
    const model = new THREE.Group();
    model.add(stubMesh(bones, raw));

    const links = collectMmdGrants(model, MMD_BONES);
    const byName = Object.fromEntries(links.map((l) => [l.bone.name, l]));

    expect(Object.keys(byName).sort()).toEqual(["左腕+", "左足D"]);
    expect(byName["左腕+"].joint).toBe("upperArm_L");
    expect(byName["左腕+"].ratio).toBe(1);
    expect(byName["左足D"].joint).toBe("upperLeg_L");
    expect(byName["左足D"].ratio).toBe(1);
  });

  it("收下「源在自己下游」的写法会转双倍 → 必须跳过", () => {
    const shoulderC = new THREE.Bone(); shoulderC.name = "左肩C";
    const arm = new THREE.Bone(); arm.name = "左腕";
    shoulderC.add(arm); // 腕 是 肩C 的子级
    const bones = [shoulderC, arm];
    const raw = [
      { name: "左肩C", parent: -1, grant: { parentIndex: 1, ratio: 1, isLocal: false, affectRotation: true, affectPosition: false } },
      { name: "左腕", parent: 0 },
    ];
    const model = new THREE.Group();
    model.add(stubMesh(bones, raw));

    expect(collectMmdGrants(model, MMD_BONES)).toEqual([]);
  });

  it("像 左腕+ 但不是关节名 + 后缀的骨不收（如 左腕IK先）", () => {
    const arm = new THREE.Bone(); arm.name = "左腕";
    const ik = new THREE.Bone(); ik.name = "左腕IK先";
    arm.add(ik);
    const bones = [arm, ik];
    const raw = [
      { name: "左腕", parent: -1 },
      { name: "左腕IK先", parent: 0 },
    ];
    const model = new THREE.Group();
    model.add(stubMesh(bones, raw));

    expect(collectMmdGrants(model, MMD_BONES).map((l) => l.bone.name)).toEqual([]);
  });

  it("几何不是 MMD 结构（没有 bones 表）时返回空，不炸", () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));

    expect(collectMmdGrants(model, MMD_BONES)).toEqual([]);
  });
});
