// 入口：组装 store / SceneManager / 视口 / 各 UI 模块。每步独立捕获，出错画在页面上。
import * as THREE from "three";
import { loadManifest } from "./scene/assets";
import { SceneManager } from "./scene/SceneManager";
import { Store } from "./state/store";
import { initToolbar } from "./ui/Toolbar";
import { initShotList } from "./ui/ShotList";
import { initInspector, type PanelCtx } from "./ui/Inspector";
import { initDescBar } from "./ui/DescBar";
import { initKeyboard } from "./ui/keyboard";
import { initFileSync } from "./sync/fileSync";
import { Viewport } from "./ui/viewport";
import { exportShotPNG, exportContactSheet } from "./export/png";
import { exportStoryboardCSV } from "./export/csv";
import { exportLightMap } from "./export/lightmap";
import "./style.css";

declare global {
  // eslint-disable-next-line no-var
  var __sbShowError: (msg: string) => void;
}

function fail(context: string, err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  window.__sbShowError?.(`[${context}] ${e.message}\n${e.stack ?? ""}`);
}

async function main(): Promise<void> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141419);

  try {
    await loadManifest();
  } catch (err) {
    fail("manifest", err);
    document.getElementById("inspector")!.textContent = `manifest 加载失败：${String(err)}`;
    return;
  }

  let store: Store;
  let sm: SceneManager;
  let viewport: Viewport;
  let thumbs: ReturnType<typeof initShotList>["thumbs"];
  let shotList: ReturnType<typeof initShotList>;
  let inspector: ReturnType<typeof initInspector>;
  let descBar: ReturnType<typeof initDescBar>;
  let toolbar: ReturnType<typeof initToolbar>;

  try {
    // 基础照明与地面已移入 SceneManager（按镜 environment 切换）
    store = new Store();
    sm = new SceneManager(scene);
    viewport = new Viewport(scene, store, sm, () => scheduleRefreshThumbs());
    // 异步模型（GLTF/MMD）装好后：补一次主视图渲染 + 重拍缩略图
    // （缩略图是同步捕获的，模型没到就拍成了占位盒，不重拍会一直留着灰块）
    sm.requestRenderHook = () => {
      viewport.requestRender();
      scheduleRefreshThumbs();
    };
    // 调试句柄（浏览器桥/控制台排障用）
    (window as unknown as { __sb: unknown }).__sb = { scene, store, sm, viewport, THREE };
  } catch (err) {
    fail("场景/视口", err);
    return;
  }

  try {
    shotList = initShotList(store, sm, scene, () => viewport.requestRender(), (v) =>
      viewport.setHelpersVisible(v),
    );
    thumbs = shotList.thumbs;
  } catch (err) {
    fail("镜头列表", err);
    return;
  }

  try {
    toolbar = initToolbar(store, {
      toggleOverlay: () => viewport.toggleOverlay(),
      // 导出时隐藏 gizmo（与视口共用 scene），否则导演视图下导出会带相机模型/灯位线
      exportPng: (withOverlay) => {
        viewport.setHelpersVisible(false);
        try {
          void exportShotPNG(store, sm, scene, withOverlay);
        } finally {
          viewport.setHelpersVisible(true);
        }
      },
      exportSheet: () => {
        // 导出是异步的（逐页渲染 + 图片解码），辅助线要一直藏到全部页面画完，
        // 否则第 2 页起会把相机/灯位 gizmo 渲进表格
        viewport.setHelpersVisible(false);
        void exportContactSheet(store, sm, scene).finally(() => viewport.setHelpersVisible(true));
      },
      exportSheetCSV: () => exportStoryboardCSV(store.project),
      exportLightMap: () => exportLightMap(store),
      switchView: () => viewport.toggleView(),
    });
    window.addEventListener("storyboard:shadows", (e) => {
      viewport.setShadows((e as CustomEvent<boolean>).detail);
    });
    descBar = initDescBar(store);
    inspector = initInspector({
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
      frameAll: () => viewport.frameAll(),
      toggleFly: (target) => viewport.toggleFly(target),
      exitFly: () => viewport.exitFly(),
      isFlying: () => viewport.flying,
    });
  } catch (err) {
    fail("工具栏/面板", err);
    return;
  }

  let thumbsTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefreshThumbs(): void {
    clearTimeout(thumbsTimer);
    thumbsTimer = setTimeout(() => thumbs.schedule(), 300);
  }

  store.subscribe(() => {
    sm.sync(store.project, store.shotIndex);
    sm.setSelected(store.selected);
    viewport.setSelection(store.selected);
    shotList.update();
    inspector.update();
    descBar.update();
    // 工具栏也要回读项目：画幅/传感器下拉、撤销重做按钮禁用态都靠这里刷
    toolbar.update();
    scheduleRefreshThumbs();
    viewport.requestRender();
  });

  // 实时保存 / AI 协同：绑定 .storyboard.json 后双向同步（非关键路径，挂了不影响编辑器）
  try {
    initFileSync(store);
  } catch (err) {
    fail("文件同步", err);
  }

  try {
    // 首次同步（存档里的项目可能来自打开的文件，任何渲染错误在这里暴露）
    sm.sync(store.project, store.shotIndex);
    inspector.update();
    descBar.update();
    thumbs.schedule();
    viewport.requestRender();
  } catch (err) {
    fail("首次渲染", err);
  }
}

void main();
