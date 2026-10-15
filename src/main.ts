// P0：入口 + 视口（SPEC §3 按需渲染）。布局见 index.html / style.css。
// P2 起 main.ts 会改成分发到各 ui 模块。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./style.css";

const container = document.getElementById("viewport")!;
const canvas = document.getElementById("view3d") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141419);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
camera.position.set(3.2, 1.9, 4.6);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.85, 0);
controls.update();

/* 灯光：HemisphereLight 防死黑（P4 换成数据驱动的三点光） */
scene.add(new THREE.HemisphereLight(0xffffff, 0x2e2e38, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4); // 临时定型光，P4 移除
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

/* 地面网格：1m 细格 + 5m 粗格，范围 ±10m */
const gridMinor = new THREE.GridHelper(20, 20, 0x35353f, 0x24242c);
const gridMajor = new THREE.GridHelper(20, 4, 0x4d4d5e, 0x4d4d5e);
gridMajor.position.y = 0.002; // 防 z-fighting
scene.add(gridMinor, gridMajor);

/* 1.7m 参考柱体（P1 会被木头人取代） */
const refFig = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.16, 1.7, 24),
  new THREE.MeshStandardMaterial({ color: 0x5aa2ff, transparent: true, opacity: 0.35 }),
);
refFig.position.y = 0.85;
refFig.name = "reference-figure";
scene.add(refFig);

/* 原点朝向标记：小锥指向 +Z（舞台正面） */
const originCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.06, 0.18, 12),
  new THREE.MeshStandardMaterial({ color: 0x5aa2ff }),
);
originCone.rotation.x = Math.PI / 2; // ConeGeometry 默认指 +Y，转到 +Z
originCone.position.set(0, 0.02, 0.5);
scene.add(originCone);

/* ── 按需渲染（SPEC §3）：只在交互 / 尺寸变化时渲染，不跑常驻循环 ── */
function render(): void {
  renderer.render(scene, camera);
}
controls.addEventListener("change", render);

const resizeObserver = new ResizeObserver(() => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
});
resizeObserver.observe(container);
