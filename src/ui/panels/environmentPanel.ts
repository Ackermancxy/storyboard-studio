// 环境面板：天空/天气 + 地面预设；背景色/地面样式只在 studio 预设下生效。
import GUI from "lil-gui";
import type { Shot } from "../../types";
import { groundOptions, skyOptions } from "../../scene/environment";
import type { PanelCtx } from "../Inspector";

const FLOOR_OPTIONS = { 网格: "grid", 素色: "plain", 无: "none" } as const;

export function buildEnvironmentPanel(gui: GUI, ctx: PanelCtx, shot: Shot): void {
  const { store, requestRender } = ctx;
  if (!shot.environment) shot.environment = { background: "#141419", floor: "grid" };

  const state = {
    sky: shot.environment.sky ?? "studio",
    ground: shot.environment.ground ?? "studio",
    background: shot.environment.background,
    floor: shot.environment.floor,
  };

  const fs = gui.addFolder("天空 / 天气");
  fs.add(state, "sky", skyOptions())
    .name("天空预设")
    .onChange((v: string) => store.transact(() => { shot.environment!.sky = v; }));
  fs.add({ reset: () => store.transact(() => { shot.environment!.sky = "studio"; }) }, "reset")
    .name("↺ 回到纯色背景");

  const fg = gui.addFolder("地面");
  fg.add(state, "ground", groundOptions())
    .name("地面预设")
    .onChange((v: string) => store.transact(() => { shot.environment!.ground = v; }));
  fg.add({ reset: () => store.transact(() => { shot.environment!.ground = "studio"; }) }, "reset")
    .name("↺ 回到工作室网格");

  const fb = gui.addFolder("工作室背景（仅 studio）");
  fb.addColor(state, "background")
    .name("背景色")
    .onChange((v: string) => {
      store.beginDragOnce();
      store.preview(() => { shot.environment!.background = v; });
    })
    .onFinishChange(() => {
      store.endDrag();
      requestRender();
    });
  fb.add(state, "floor", FLOOR_OPTIONS)
    .name("地面样式")
    .onChange((v: "grid" | "plain" | "none") => store.transact(() => { shot.environment!.floor = v; }));
}
