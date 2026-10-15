// P2 入口：组装 store / SceneManager / 视口 / 各 UI 模块。
import * as THREE from "three";
import { loadManifest } from "./scene/assets";
import { SceneManager } from "./scene/SceneManager";
import { Store } from "./state/store";
import { initToolbar } from "./ui/Toolbar";
import { initShotList } from "./ui/ShotList";
import { initInspector, type PanelCtx } from "./ui/Inspector";
import { initDescBar } from "./ui/DescBar";
import { initKeyboard } from "./ui/keyboard";
import { Viewport } from "./ui/viewport";
import { exportShotPNG, exportContactSheet } from "./export/png";
import { exportLightMap } from "./export/lightmap";
import "./style.css";

async function main(): Promise<void> {
  try {
    await loadManifest();
  } catch (err) {
    document.getElementById("inspector")!.textContent = `manifest 加载失败：${String(err)}`;
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141419);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2e2e38, 1.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6); // 临时定型光，P4 换数据驱动
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);

  const gridMinor = new THREE.GridHelper(20, 20, 0x35353f, 0x24242c);
  const gridMajor = new THREE.GridHelper(20, 4, 0x4d4d5e, 0x4d4d5e);
  gridMajor.position.y = 0.002;
  scene.add(gridMinor, gridMajor);

  // 阴影承接面（只显示阴影的透明平面）
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.32 }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const store = new Store();
  const sm = new SceneManager(scene);
  const viewport = new Viewport(scene, store, sm, () => scheduleRefreshThumbs());

  const shotList = initShotList(store, sm, scene, () => viewport.requestRender());
  const thumbs = shotList.thumbs;

  const toolbar = initToolbar(store, {
    toggleOverlay: () => viewport.toggleOverlay(),
    exportPng: (withOverlay) => void exportShotPNG(store, sm, scene, withOverlay),
    exportSheet: () => void exportContactSheet(store, sm, scene),
    exportLightMap: () => exportLightMap(store),
  });
  window.addEventListener("storyboard:shadows", (e) => {
    viewport.setShadows((e as CustomEvent<boolean>).detail);
  });
  const descBar = initDescBar(store);
  const inspector = initInspector({
    store,
    sm,
    requestRender: () => viewport.requestRender(),
    refreshThumbs: () => thumbs.schedule(),
    rebuildPanel: () => inspector.update(),
  } as PanelCtx);
  initKeyboard(store, {
    setMode: (m) => viewport.setGizmoMode(m),
    toggleView: () => viewport.toggleView(),
    toggleTop: () => viewport.toggleTop(),
  });

  let thumbsTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefreshThumbs(): void {
    clearTimeout(thumbsTimer);
    thumbsTimer = setTimeout(() => thumbs.schedule(), 300);
  }

  store.subscribe(() => {
    sm.sync(store.project, store.shotIndex);
    sm.setSelected(store.selected);
    viewport.setSelection(store.selected);
    toolbar.update();
    shotList.update();
    inspector.update();
    descBar.update();
    scheduleRefreshThumbs();
    viewport.requestRender();
  });

  // 首次同步 + 立即出缩略图
  sm.sync(store.project, store.shotIndex);
  inspector.update();
  descBar.update();
  thumbs.schedule();
  viewport.requestRender();
}

void main();
