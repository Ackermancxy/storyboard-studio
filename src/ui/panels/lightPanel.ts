// P4：灯光属性面板。
import GUI from "lil-gui";
import type { Light, LightRole } from "../../types";
import type { PanelCtx } from "../Inspector";

const ROLE_NAMES: Record<string, string> = {
  key: "主光 key", fill: "辅光 fill", rim: "轮廓光 rim",
  back: "背景光 back", practical: "场景光源 practical", ambient: "环境光 ambient",
};

export function buildLightPanel(gui: GUI, ctx: PanelCtx, light: Light): void {
  const { store, requestRender } = ctx;
  const subjectNames: Record<string, string> = { "（默认第一个人物）": "" };
  for (const a of store.shot.actors) subjectNames[`${a.label ?? a.id}（${a.id}）`] = a.id;

  const slider = (
    folder: GUI,
    obj: Record<string, number>,
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    apply: (v: number) => void,
  ): void => {
    folder.add(obj, key).name(label).min(min).max(max).step(step)
      .onChange((v: number) => {
        store.beginDragOnce();
        store.preview(() => apply(v));
      })
      .onFinishChange(() => {
        store.endDrag();
        requestRender();
      });
  };

  const f0 = gui.addFolder("灯");
  f0.add({ role: light.role }, "role", ROLE_NAMES)
    .name("角色")
    .onChange((v: LightRole) => {
      store.transact(() => { light.role = v; });
      ctx.rebuildPanel();
    });
  f0.add({ type: light.type ?? "soft" }, "type", { 柔光: "soft", 硬光: "hard" })
    .name("光质")
    .onChange((v: "soft" | "hard") => store.transact(() => { light.type = v; }));
  f0.add({ subject: light.subject ?? "" }, "subject", subjectNames)
    .name("打向")
    .onChange((v: string) => store.transact(() => { light.subject = v || undefined; }));

  slider(f0, { azimuth: light.azimuth }, "azimuth", "水平角 °", -180, 180, 1, (v) => { light.azimuth = Math.round(v); });
  slider(f0, { elevation: light.elevation }, "elevation", "仰角 °", -30, 85, 1, (v) => { light.elevation = Math.round(v); });
  slider(f0, { distance: light.distance ?? 3 }, "distance", "距离 m", 0.5, 12, 0.1, (v) => { light.distance = Math.round(v * 10) / 10; });
  slider(f0, { intensity: light.intensity }, "intensity", "强度 0–2", 0, 2, 0.05, (v) => { light.intensity = Math.round(v * 20) / 20; });
  slider(f0, { colorTemp: light.colorTemp ?? 5600 }, "colorTemp", "色温 K", 2000, 10000, 50, (v) => { light.colorTemp = Math.round(v / 50) * 50; });
  f0.add({ showStand: light.showStand ?? false }, "showStand").name("显示灯架")
    .onChange((v: boolean) => store.transact(() => { light.showStand = v; }));
  f0.add({ del: () => {
    store.transact((p) => {
      const shot = p.shots[store.shotIndex];
      shot.lights = shot.lights.filter((l) => l.id !== light.id);
    });
    store.setSelected(null);
  } }, "del").name("🗑 删除");
}
