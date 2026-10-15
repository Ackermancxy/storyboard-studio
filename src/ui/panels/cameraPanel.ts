// P3：相机属性面板（SPEC §9）。
import GUI from "lil-gui";
import type { CameraAngle, Shot, ShotSize } from "../../types";
import { SHOT_SIZES } from "../../types";
import { ANGLE_ZH, SHOT_TABLE } from "../../scene/camera";
import type { PanelCtx } from "../Inspector";

const FOCAL_PRESETS = [24, 35, 50, 85, 135];
const ANGLES: CameraAngle[] = ["eye", "high", "low", "overhead", "worm"];
const shotSizeNames: Record<string, string> = Object.fromEntries(
  SHOT_SIZES.map((s) => [s, `${SHOT_TABLE[s].zh} ${s}`]),
);
const angleNames: Record<string, string> = Object.fromEntries(ANGLES.map((a) => [a, ANGLE_ZH[a]]));

export function buildCameraPanel(gui: GUI, ctx: PanelCtx, shot: Shot): void {
  const { store, requestRender } = ctx;
  const cam = shot.camera;
  const subjectNames: Record<string, string> = { "（全体主体）": "" };
  for (const a of shot.actors) subjectNames[`${a.label ?? a.id}（${a.id}）`] = a.id;

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

  const f0 = gui.addFolder("机位");
  f0.add({ mode: cam.mode }, "mode", { 自动: "auto", 手动: "manual" })
    .name("模式")
    .onChange((v: "auto" | "manual") => {
      store.transact(() => {
        if (v === "manual" && ctx.sm.cameraState) {
          const cs = ctx.sm.cameraState;
          cam.position = [cs.position.x, cs.position.y, cs.position.z].map(round2) as [number, number, number];
          cam.target = [cs.target.x, cs.target.y, cs.target.z].map(round2) as [number, number, number];
        }
        cam.mode = v;
      });
    });
  f0.add({ reset: () => store.transact(() => { cam.mode = "auto"; }) }, "reset")
    .name("↺ 回到自动机位");
  f0.add({ subject: Array.isArray(cam.subject) ? cam.subject[0] : cam.subject ?? "" }, "subject", subjectNames)
    .name("主体")
    .onChange((v: string) => store.transact(() => { cam.subject = v || undefined; }));

  const ff = gui.addFolder("焦段");
  slider(ff, { focalLength: cam.focalLength ?? 50 }, "focalLength", "mm（等效全画幅）", 14, 200, 1,
    (v) => { cam.focalLength = Math.round(v); });
  for (const f of FOCAL_PRESETS) {
    const btn = { [`f${f}`]: () => store.transact(() => { cam.focalLength = f; }) };
    ff.add(btn, `f${f}`).name(`${f}mm`);
  }

  const fs = gui.addFolder("景别与角度");
  fs.add({ shotSize: cam.shotSize ?? "MS" }, "shotSize", shotSizeNames)
    .name("景别")
    .onChange((v: ShotSize) => store.transact(() => { cam.shotSize = v; }));
  slider(fs, { azimuth: cam.azimuth ?? 0 }, "azimuth", "机位角 °", -180, 180, 1,
    (v) => { cam.azimuth = Math.round(v); });
  fs.add({ angle: cam.elevation === undefined || cam.elevation === 0 ? cam.angle ?? "eye" : "" }, "angle",
    { ...angleNames, "（自定义俯仰）": "" })
    .name("视角")
    .onChange((v: CameraAngle | "") => store.transact(() => {
      if (v === "") cam.elevation = 1;
      else {
        cam.angle = v;
        cam.elevation = undefined;
      }
    }));
  slider(fs, { elevation: cam.elevation ?? 0 }, "elevation", "俯仰角 °（覆盖视角）", -60, 85, 1,
    (v) => { cam.elevation = Math.round(v); });
  fs.add({ placement: cam.placement ?? "center" }, "placement",
    { 居中: "center", 左三分线: "left-third", 右三分线: "right-third" })
    .name("主体位置")
    .onChange((v: "center" | "left-third" | "right-third") => store.transact(() => { cam.placement = v; }));
  slider(fs, { roll: cam.roll ?? 0 }, "roll", "荷兰角 °", -45, 45, 1,
    (v) => { cam.roll = Math.round(v); });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
