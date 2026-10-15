// P2：人物属性面板。滑杆拖动中实时预览（beginDragOnce 抓快照），松手 endDrag 入撤销栈；gaze 在 P3 加。
import GUI from "lil-gui";
import type { JointName, JointParamKey, Actor } from "../../types";
import { JOINT_LIMITS, mirrorPose } from "../../scene/rig";
import { getManifest } from "../../scene/assets";
import { loadUserPresets, upsertUserPreset, invalidatePresetCache } from "../../data/userPresets";
import { POSE_PRESETS } from "../../data/poses";
import type { PanelCtx } from "../Inspector";

const JOINT_GROUPS: [string, JointName[]][] = [
  ["躯干", ["hips", "spine", "chest"]],
  ["头颈", ["neck", "head"]],
  ["左臂", ["upperArm_L", "lowerArm_L", "hand_L"]],
  ["右臂", ["upperArm_R", "lowerArm_R", "hand_R"]],
  ["左腿", ["upperLeg_L", "lowerLeg_L", "foot_L"]],
  ["右腿", ["upperLeg_R", "lowerLeg_R", "foot_R"]],
];
const JOINT_LABELS: Record<JointName, string> = {
  hips: "髋(全身)", spine: "腰", chest: "胸", neck: "颈", head: "头",
  upperArm_L: "左上臂", lowerArm_L: "左前臂", hand_L: "左手",
  upperArm_R: "右上臂", lowerArm_R: "右前臂", hand_R: "右手",
  upperLeg_L: "左大腿", lowerLeg_L: "左小腿", foot_L: "左脚",
  upperLeg_R: "右大腿", lowerLeg_R: "右小腿", foot_R: "右脚",
};
const PARAM_LABELS: Record<JointParamKey, string> = {
  bend: "前弯", side: "侧倾", twist: "扭转/内旋", nod: "低头", tilt: "歪头",
  turn: "转头", pitch: "抬起", yaw: "方向", point: "绷脚",
};

export function buildActorPanel(gui: GUI, ctx: PanelCtx, actor: Actor): void {
  const { store, requestRender } = ctx;
  const charNames: Record<string, string> = {};
  for (const c of getManifest().characters) charNames[c.id] = c.name;

  /** 滑杆链：onChange 里先抓快照再预览 */
  const slider = (
    folder: GUI,
    obj: Record<string, number>,
    key: string,
    label: string,
    apply: (v: number) => void,
  ): void => {
    folder
      .add(obj, key)
      .name(label)
      .onChange((v: number) => {
        store.beginDragOnce();
        store.preview(() => apply(v));
      })
      .onFinishChange(() => {
        store.endDrag();
        requestRender();
      });
  };

  const f0 = gui.addFolder("基本");
  f0.add({ model: actor.model }, "model", charNames)
    .name("模型")
    .onChange((v: string) => store.transact(() => { actor.model = v; }));
  f0.add(actor, "label").name("名称").onFinishChange(() => store.touch());
  slider(f0, { x: actor.position[0] }, "x", "位置 X", (v) => { actor.position[0] = Math.round(v * 100) / 100; });
  slider(f0, { z: actor.position[1] }, "z", "位置 Z", (v) => { actor.position[1] = Math.round(v * 100) / 100; });
  slider(f0, { facing: actor.facing }, "facing", "朝向 °", (v) => { actor.facing = Math.round(v); });
  slider(f0, { elevation: actor.elevation ?? 0 }, "elevation", "垫高 m", (v) => { actor.elevation = Math.round(v * 100) / 100; });
  f0.add({ autoGround: actor.autoGround ?? true }, "autoGround").name("自动落地")
    .onChange((v: boolean) => store.transact(() => { actor.autoGround = v; }));
  f0.addColor({ color: actor.color ?? "#c9a06b" }, "color").name("颜色")
    .onChange((v: string) => {
      store.beginDragOnce();
      store.preview(() => { actor.color = v; });
    })
    .onFinishChange(() => {
      store.endDrag();
      requestRender();
    });
  f0.add({ del: () => deleteActor(ctx, actor.id) }, "del").name("🗑 删除");

  const fp = gui.addFolder("姿势");
  const presetOpts: Record<string, string> = {};
  for (const p of POSE_PRESETS) presetOpts[`${p.name} ${p.id}`] = p.id;
  for (const up of loadUserPresets()) presetOpts[`${up.name} ${up.id}`] = up.id;
  fp.add({ preset: actor.pose.preset ?? "" }, "preset", presetOpts)
    .name("预设")
    .onChange((v: string) => {
      store.transact(() => {
        actor.pose = { preset: v || undefined, joints: {} };
      });
      ctx.rebuildPanel();
    });
  fp.add({ mirror: () => {
    store.transact(() => {
      actor.pose = mirrorPose(actor.pose);
    });
    ctx.rebuildPanel();
  } }, "mirror").name("⇄ 镜像左右");
  fp.add({ save: () => {
    const name = window.prompt("预设名称：", "我的姿势");
    if (!name) return;
    upsertUserPreset(`user_${Date.now().toString(36)}`, name, structuredClone(actor.pose));
    invalidatePresetCache();
    ctx.rebuildPanel();
  } }, "save").name("💾 存当前为预设");
  fp.add({ manage: () => void import("../modals").then((m) => m.showPresetManager()) }, "manage")
    .name("⚙ 管理预设…");

  for (const [groupName, names] of JOINT_GROUPS) {
    const folder = gui.addFolder(groupName);
    for (const jn of names) {
      const jf = folder.addFolder(JOINT_LABELS[jn]);
      for (const [pk, range] of Object.entries(JOINT_LIMITS[jn]) as [JointParamKey, [number, number]][]) {
        jf.add({ [pk]: actor.pose.joints?.[jn]?.[pk] ?? 0 }, pk)
          .name(PARAM_LABELS[pk])
          .min(range[0]).max(range[1]).step(1)
          .onChange((v: number) => {
            store.beginDragOnce();
            store.preview(() => {
              actor.pose.joints ??= {};
              actor.pose.joints[jn] ??= {};
              const rounded = Math.round(v);
              actor.pose.joints[jn]![pk] = rounded;
              if (rounded === 0) delete actor.pose.joints[jn]![pk]; // 0 不占数据
            });
          })
          .onFinishChange(() => {
            store.endDrag();
            requestRender();
          });
      }
    }
  }
}

export function deleteActor(ctx: PanelCtx, id: string): void {
  const { store } = ctx;
  store.transact((p) => {
    const shot = p.shots[store.shotIndex];
    shot.actors = shot.actors.filter((a) => a.id !== id);
    const cam = shot.camera;
    if (Array.isArray(cam.subject)) {
      cam.subject = cam.subject.filter((s) => s !== id);
      if (cam.subject.length === 0) cam.subject = undefined;
    } else if (cam.subject === id) {
      cam.subject = undefined;
    }
    shot.lights.forEach((l) => {
      if (l.subject === id) l.subject = shot.actors[0]?.id;
    });
  });
  store.setSelected(null);
}
