// P2：新建 Shot 的工厂（默认相机 + 空 + 默认三点光）。
import type { Shot } from "../types";

/** 新建镜头的默认三点光（SPEC P4） */
export function defaultLights(subject?: string): Shot["lights"] {
  return [
    { id: "L1", role: "key", type: "soft", subject, azimuth: 45, elevation: 35, distance: 3, intensity: 1, colorTemp: 5600, showStand: false },
    { id: "L2", role: "fill", type: "soft", subject, azimuth: -45, elevation: 15, distance: 3, intensity: 0.4, colorTemp: 5600, showStand: false },
    { id: "L3", role: "rim", type: "hard", subject, azimuth: 160, elevation: 40, distance: 3, intensity: 0.6, colorTemp: 5600, showStand: false },
  ];
}

export function newShot(id: string, name = "新镜头"): Shot {
  return {
    id,
    name,
    description: "",
    notes: "",
    duration: 3,
    camera: {
      mode: "auto",
      focalLength: 50,
      shotSize: "MS",
      azimuth: 0,
      angle: "eye",
      placement: "center",
    },
    actors: [],
    props: [],
    lights: defaultLights("A"),
    environment: { background: "#1b1b20", floor: "grid", sky: "studio", ground: "studio" },
  };
}
