// 天空（时间 + 天气）与地面预设：一个天穹 + 一块地面 + 环境光/雾/太阳。
// 全部程序化，不加载贴图文件；预设 id 同时被 normalize/校验器/导出共用。
import * as THREE from "three";

export interface SkyPreset {
  id: string;
  name: string;
  /** studio = 不画天穹，沿用镜头的 background 纯色 */
  studio?: boolean;
  top?: string;
  horizon?: string;
  bottom?: string;
  fog?: string | null;
  fogNear?: number;
  fogFar?: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun?: {
    color: string;
    intensity: number;
    elevation: number;
    azimuth: number;
    /** 视直径（弧度） */
    size: number;
    disc: string;
  };
  stars?: boolean;
}

export interface GroundPreset {
  id: string;
  name: string;
  /** studio = 沿用镜头的 floor 网格/素色地面 */
  studio?: boolean;
  color: string;
  roughness: number;
  metalness?: number;
  texture?: "wood" | "tile" | "grass" | "asphalt" | "sand" | "snow" | "dirt";
  skyline?: boolean;
  water?: boolean;
}

export const SKY_PRESETS: readonly SkyPreset[] = [
  { id: "studio", name: "工作室（纯色）", studio: true, hemiSky: "#ffffff", hemiGround: "#2e2e38", hemi: 0.9 },
  {
    id: "clear-day", name: "晴 · 白天",
    top: "#5f9fe0", horizon: "#cfe4f5", bottom: "#e8eef2",
    fog: "#cbdcea", fogNear: 35, fogFar: 220,
    hemiSky: "#bcd7f2", hemiGround: "#5a5448", hemi: 0.95,
    sun: { color: "#fff4e0", intensity: 1.35, elevation: 55, azimuth: 210, size: 0.018, disc: "#fffbe0" },
  },
  {
    id: "clear-sunset", name: "晴 · 日落",
    top: "#5b6ea8", horizon: "#ffb36b", bottom: "#ffd9a0",
    fog: "#e6b98f", fogNear: 28, fogFar: 165,
    hemiSky: "#ffd0a0", hemiGround: "#4a3a38", hemi: 0.72,
    sun: { color: "#ffae5c", intensity: 1.05, elevation: 11, azimuth: 245, size: 0.026, disc: "#ffd27a" },
  },
  {
    id: "clear-dusk", name: "晴 · 黄昏（蓝调）",
    top: "#1d2b4f", horizon: "#5d6f9e", bottom: "#8896b8",
    fog: "#34405c", fogNear: 25, fogFar: 230,
    hemiSky: "#6d82a8", hemiGround: "#232830", hemi: 0.88,
    sun: { color: "#cfd8ff", intensity: 0.16, elevation: 24, azimuth: 120, size: 0.02, disc: "#dfe6ff" },
    stars: true,
  },
  {
    id: "clear-night", name: "晴 · 夜晚",
    top: "#05080f", horizon: "#1a2340", bottom: "#232c48",
    fog: "#10172a", fogNear: 20, fogFar: 200,
    hemiSky: "#2a3550", hemiGround: "#0b0d14", hemi: 0.48,
    sun: { color: "#b8c8ff", intensity: 0.22, elevation: 40, azimuth: 150, size: 0.02, disc: "#e6ecff" },
    stars: true,
  },
  {
    id: "overcast", name: "阴天",
    top: "#8b95a3", horizon: "#c6ccd4", bottom: "#d8dce2",
    fog: "#b8c0c8", fogNear: 18, fogFar: 110,
    hemiSky: "#cdd4dc", hemiGround: "#4a4a4a", hemi: 1.05,
  },
  {
    id: "rain", name: "雨天",
    top: "#46505e", horizon: "#7b8794", bottom: "#929ba6",
    fog: "#6a7480", fogNear: 12, fogFar: 80,
    hemiSky: "#87929e", hemiGround: "#33373c", hemi: 0.82,
  },
  {
    id: "storm", name: "雷雨",
    top: "#252b36", horizon: "#4c5664", bottom: "#5d6774",
    fog: "#3a424e", fogNear: 10, fogFar: 65,
    hemiSky: "#5a6470", hemiGround: "#1f2228", hemi: 0.62,
  },
  {
    id: "snow", name: "雪天",
    top: "#aab7c6", horizon: "#e6ecf2", bottom: "#f2f5f8",
    fog: "#dde5ec", fogNear: 16, fogFar: 95,
    hemiSky: "#e8eef6", hemiGround: "#5a5a5a", hemi: 1.1,
  },
  {
    id: "fog", name: "雾天",
    top: "#b9c2c8", horizon: "#d5dbdf", bottom: "#e2e6e8",
    fog: "#c9d0d5", fogNear: 5, fogFar: 48,
    hemiSky: "#dfe4e8", hemiGround: "#4a4a4a", hemi: 0.9,
  },
] as const;

export const GROUND_PRESETS: readonly GroundPreset[] = [
  { id: "studio", name: "工作室（网格）", studio: true, color: "#2a2a32", roughness: 1 },
  { id: "wood", name: "木地板", color: "#9a7448", roughness: 0.78, texture: "wood" },
  { id: "tile", name: "瓷砖", color: "#cdd1cb", roughness: 0.5, texture: "tile" },
  { id: "grass", name: "草地", color: "#5d7f3d", roughness: 1, texture: "grass" },
  { id: "dirt", name: "泥土地", color: "#7a6248", roughness: 1, texture: "dirt" },
  { id: "sand", name: "沙滩", color: "#d8c49a", roughness: 1, texture: "sand" },
  { id: "snow", name: "雪地", color: "#eef2f5", roughness: 0.92, texture: "snow" },
  { id: "asphalt", name: "沥青路", color: "#63676e", roughness: 0.95, texture: "asphalt" },
  { id: "city", name: "城市街区", color: "#60646b", roughness: 0.95, texture: "asphalt", skyline: true },
  { id: "water", name: "水面", color: "#3b6c86", roughness: 0.16, metalness: 0.35, water: true },
] as const;

export const SKY_IDS: readonly string[] = SKY_PRESETS.map((p) => p.id);
export const GROUND_IDS: readonly string[] = GROUND_PRESETS.map((p) => p.id);
export const DEFAULT_SKY = "studio";
export const DEFAULT_GROUND = "studio";

export function skyPreset(id: string | undefined): SkyPreset {
  return SKY_PRESETS.find((p) => p.id === id) ?? SKY_PRESETS[0];
}
export function groundPreset(id: string | undefined): GroundPreset {
  return GROUND_PRESETS.find((p) => p.id === id) ?? GROUND_PRESETS[0];
}
export function skyName(id: string | undefined): string {
  return skyPreset(id).name;
}
export function groundName(id: string | undefined): string {
  return groundPreset(id).name;
}

/** 下拉框：显示名 → id（lil-gui 的 object 选项会以 key 为文案、value 为回调值） */
export function skyOptions(): Record<string, string> {
  return Object.fromEntries(SKY_PRESETS.map((p) => [p.name, p.id]));
}
export function groundOptions(): Record<string, string> {
  return Object.fromEntries(GROUND_PRESETS.map((p) => [p.name, p.id]));
}

/* ── 程序化地面纹理（按预设缓存，尺寸小、够看） ── */

const textureCache = new Map<string, THREE.CanvasTexture>();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundTexture(preset: GroundPreset): THREE.CanvasTexture | null {
  if (!preset.texture) return null;
  const cached = textureCache.get(preset.id);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry32(preset.id.length * 7919 + preset.texture.length * 104729);

  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, size, size);

  if (preset.texture === "wood") {
    // 横向木板 + 木纹
    for (let y = 0; y < size; y += 32) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.07})`;
      ctx.fillRect(0, y, size, 2);
      for (let i = 0; i < 12; i++) {
        ctx.strokeStyle = `rgba(60,35,15,${0.05 + rnd() * 0.1})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const yy = y + 4 + rnd() * 24;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(size * 0.3, yy + (rnd() - 0.5) * 4, size * 0.6, yy + (rnd() - 0.5) * 4, size, yy);
        ctx.stroke();
      }
    }
  } else if (preset.texture === "tile") {
    for (let y = 0; y < size; y += 64) {
      for (let x = 0; x < size; x += 64) {
        ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
        ctx.fillRect(x, y, 64, 64);
      }
    }
    ctx.strokeStyle = "rgba(90,95,100,0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
  } else if (preset.texture === "grass") {
    for (let i = 0; i < 4200; i++) {
      const g = 70 + Math.floor(rnd() * 70);
      ctx.strokeStyle = `rgba(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.4)},${0.25 + rnd() * 0.4})`;
      ctx.lineWidth = 1;
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
      ctx.stroke();
    }
  } else if (preset.texture === "asphalt") {
    for (let i = 0; i < 5200; i++) {
      const v = 40 + Math.floor(rnd() * 70);
      ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.18 + rnd() * 0.35})`;
      ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  } else if (preset.texture === "sand") {
    for (let i = 0; i < 3400; i++) {
      const v = 170 + Math.floor(rnd() * 60);
      ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.9)},${Math.floor(v * 0.68)},${0.15 + rnd() * 0.3})`;
      ctx.fillRect(rnd() * size, rnd() * size, 1.2, 1.2);
    }
  } else if (preset.texture === "snow") {
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(190,210,230,${rnd() * 0.18})`;
      ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  } else if (preset.texture === "dirt") {
    for (let i = 0; i < 2600; i++) {
      const v = 80 + Math.floor(rnd() * 70);
      ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.78)},${Math.floor(v * 0.55)},${0.2 + rnd() * 0.4})`;
      const r = 1 + rnd() * 5;
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textureCache.set(preset.id, tex);
  return tex;
}

/* ── 环境装置（天穹 / 地面 / 太阳 / 雾） ── */

const GROUND_RADIUS = 70;

export class EnvironmentRig {
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private ground: THREE.Mesh;
  private groundMat: THREE.MeshStandardMaterial;
  private skyline: THREE.Group;
  private sun: THREE.DirectionalLight;
  private key = "";

  constructor(
    private scene: THREE.Scene,
    private hemi: THREE.HemisphereLight,
  ) {
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color("#5f9fe0") },
        uHorizon: { value: new THREE.Color("#cfe4f5") },
        uBottom: { value: new THREE.Color("#e8eef2") },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color("#fffbdc") },
        uSunCos: { value: 1 },
        uSunGlow: { value: 0 },
        uStars: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uBottom;
        uniform vec3 uSunDir, uSunColor;
        uniform float uSunCos, uSunGlow, uStars;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h >= 0.0
            ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.6))
            : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.8));
          float sd = dot(d, normalize(uSunDir));
          if (uSunCos < 0.99999) {
            col += uSunColor * smoothstep(uSunCos, uSunCos + 0.0006, sd) * 1.5;
            col += uSunColor * pow(max(sd, 0.0), 8.0) * uSunGlow;
          }
          if (uStars > 0.5 && h > 0.02) {
            vec3 p = floor(d * 260.0);
            float n = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            col += vec3(0.85, 0.92, 1.0) * step(0.9972, n) * smoothstep(0.02, 0.2, h);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.visible = false;
    scene.add(this.dome);

    this.groundMat = new THREE.MeshStandardMaterial({ color: "#2a2a32", roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 72), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.004;
    this.ground.receiveShadow = true;
    this.ground.visible = false;
    scene.add(this.ground);

    this.skyline = buildSkyline();
    this.skyline.visible = false;
    scene.add(this.skyline);

    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.position.set(30, 40, 20);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun, this.sun.target);
  }

  /** 返回 true 表示地面是 studio（由 SceneManager 画网格/素色地板） */
  apply(env: { background?: string; sky?: string; ground?: string } | undefined): boolean {
    const sky = skyPreset(env?.sky);
    const ground = groundPreset(env?.ground);
    const bg = env?.background ?? "#141419";
    const key = `${sky.id}|${ground.id}|${bg}`;
    if (key === this.key) return sky.studio === true;
    this.key = key;

    // 天空
    if (sky.studio) {
      this.dome.visible = false;
      this.scene.background = new THREE.Color(bg);
      this.scene.fog = null;
    } else {
      this.dome.visible = true;
      this.scene.background = new THREE.Color(sky.horizon ?? bg);
      const u = this.domeMat.uniforms;
      u.uTop.value.set(sky.top ?? "#5f9fe0");
      u.uHorizon.value.set(sky.horizon ?? "#cfe4f5");
      u.uBottom.value.set(sky.bottom ?? "#e8eef2");
      u.uStars.value = sky.stars ? 1 : 0;
      if (sky.sun) {
        const dir = sunDirection(sky.sun.elevation, sky.sun.azimuth);
        u.uSunDir.value.copy(dir);
        u.uSunColor.value.set(sky.sun.disc);
        u.uSunCos.value = Math.cos(sky.sun.size / 2);
        u.uSunGlow.value = 0.35;
      } else {
        u.uSunCos.value = 1;
        u.uSunGlow.value = 0;
      }
      this.scene.fog = sky.fog ? new THREE.Fog(sky.fog, sky.fogNear ?? 20, sky.fogFar ?? 120) : null;
    }

    // 环境光
    this.hemi.color.set(sky.hemiSky);
    this.hemi.groundColor.set(sky.hemiGround);
    this.hemi.intensity = sky.hemi;

    // 太阳 / 月亮
    if (sky.sun) {
      const dir = sunDirection(sky.sun.elevation, sky.sun.azimuth);
      this.sun.position.copy(dir).multiplyScalar(60);
      this.sun.color.set(sky.sun.color);
      this.sun.intensity = sky.sun.intensity;
    } else {
      this.sun.intensity = 0;
    }

    // 地面
    if (ground.studio) {
      this.ground.visible = false;
      this.skyline.visible = false;
      this.groundMat.map = null;
      this.groundMat.needsUpdate = true;
    } else {
      this.ground.visible = true;
      this.groundMat.color.set(ground.color);
      this.groundMat.roughness = ground.roughness;
      this.groundMat.metalness = ground.metalness ?? 0;
      this.groundMat.transparent = false;
      this.groundMat.map = groundTexture(ground);
      this.groundMat.needsUpdate = true;
      this.skyline.visible = ground.skyline === true && !sky.studio;
    }
    return ground.studio === true;
  }
}

function sunDirection(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(elevationDeg);
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ).normalize();
}

/** 远景楼群：只给城市地面用，低模方块 + 程序化窗格，靠雾融进背景 */
function buildSkyline(): THREE.Group {
  const group = new THREE.Group();
  group.name = "env:skyline";
  const rnd = mulberry32(20261017);
  const mat = new THREE.MeshBasicMaterial({ map: facadeTexture(), fog: true });
  for (let i = 0; i < 26; i++) {
    if (rnd() < 0.3) continue; // 留出天空缺口，别连成一道墙
    const angle = (i / 26) * Math.PI * 2 + rnd() * 0.16;
    const radius = 85 + rnd() * 70;
    const w = 7 + rnd() * 11;
    const d = 7 + rnd() * 11;
    const h = 10 + rnd() * 24;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(Math.sin(angle) * radius, h / 2 - 0.4, Math.cos(angle) * radius);
    box.rotation.y = angle;
    group.add(box);
  }
  return group;
}

/** 楼宇立面：深色底 + 零星亮窗（同一张图给所有楼，远景看不出重复） */
function facadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2f3540";
  ctx.fillRect(0, 0, 128, 256);
  const rnd = mulberry32(778899);
  for (let y = 8; y < 248; y += 14) {
    for (let x = 8; x < 120; x += 14) {
      const r = rnd();
      ctx.fillStyle = r > 0.97 ? "#d9b46e" : r > 0.955 ? "#9aabc4" : `rgba(16,20,26,${0.7 + rnd() * 0.25})`;
      ctx.fillRect(x, y, 8, 9);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
