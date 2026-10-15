// 入口：视口（SPEC §3 按需渲染）+ P1 临时人物调试。P2 起改成分发到各 ui 模块。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { setupPoseDebug } from "./ui/poseDebug";
import "./style.css";

const container = document.getElementById("viewport")!;
const canvas = document.getElementById("view3d") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141419);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
camera.position.set(2.6, 1.7, 3.4);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.95, 0);
controls.update();

/* 灯光：HemisphereLight 防死黑 + 一盏临时方向光定型（P4 换成数据驱动三点光） */
scene.add(new THREE.HemisphereLight(0xffffff, 0x2e2e38, 1.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

/* 地面网格：1m 细格 + 5m 粗格，范围 ±10m */
const gridMinor = new THREE.GridHelper(20, 20, 0x35353f, 0x24242c);
const gridMajor = new THREE.GridHelper(20, 4, 0x4d4d5e, 0x4d4d5e);
gridMajor.position.y = 0.002; // 防 z-fighting
scene.add(gridMinor, gridMajor);

/* P1 临时：木头人 + 调试面板 */
setupPoseDebug(scene, render);

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
render();
