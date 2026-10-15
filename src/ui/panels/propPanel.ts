// P2：道具属性面板。
import GUI from "lil-gui";
import type { Prop } from "../../types";
import { getManifest, isSizeableShape } from "../../scene/assets";
import type { PanelCtx } from "../Inspector";

export function buildPropPanel(gui: GUI, ctx: PanelCtx, prop: Prop): void {
  const { store, requestRender } = ctx;
  const def = getManifest().props.find((p) => p.id === prop.model);
  const propNames: Record<string, string> = {};
  for (const p of getManifest().props) propNames[p.id] = p.name;

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
  f0.add({ model: prop.model }, "model", propNames)
    .name("类型")
    .onChange((v: string) => {
      store.transact(() => { prop.model = v; });
      ctx.rebuildPanel();
    });
  f0.add(prop, "label").name("名称").onFinishChange(() => store.touch());
  slider(f0, { x: prop.position[0] }, "x", "位置 X", (v) => { prop.position[0] = Math.round(v * 100) / 100; });
  slider(f0, { z: prop.position[1] }, "z", "位置 Z", (v) => { prop.position[1] = Math.round(v * 100) / 100; });
  slider(f0, { facing: prop.facing ?? 0 }, "facing", "朝向 °", (v) => { prop.facing = Math.round(v); });

  if (def && isSizeableShape(def)) {
    const size = prop.size ?? [0.5, 0.5, 0.5];
    const fs = gui.addFolder("尺寸 m");
    (["宽", "高", "深"] as const).forEach((label, i) => {
      slider(fs, { v: size[i] }, "v", label, (v) => {
        prop.size = prop.size ?? ([...size] as [number, number, number]);
        prop.size[i] = Math.round(v * 100) / 100;
      });
    });
  }
  if (def?.type === "gltf") {
    slider(f0, { scale: prop.scale ?? 1 }, "scale", "缩放", (v) => { prop.scale = Math.round(v * 100) / 100; });
  }

  f0.addColor({ color: prop.color ?? "" }, "color").name("颜色")
    .onChange((v: string) => {
      store.beginDragOnce();
      store.preview(() => { prop.color = v || undefined; });
    })
    .onFinishChange(() => {
      store.endDrag();
      requestRender();
    });
  f0.add({ del: () => {
    store.transact((p) => {
      const shot = p.shots[store.shotIndex];
      shot.props = shot.props.filter((x) => x.id !== prop.id);
    });
    store.setSelected(null);
  } }, "del").name("🗑 删除");
}
