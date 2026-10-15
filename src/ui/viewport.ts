// P3：视口 —— 机位视图（letterbox + 三分线 + HUD）/ 导演视图（自由 + 相机 gizmo）/ 俯视视图。
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { Store } from "../state/store";
import type { Shot } from "../types";
import type { SceneManager } from "../scene/SceneManager";
import { FILM_GAUGE } from "../scene/camera";

export type ViewMode = "shot" | "director" | "top";

const BG_BAR = 0x0b0b0e;

export class Viewport {
  mode: ViewMode = "shot";
  readonly shotCam: THREE.PerspectiveCamera;
  readonly directorCam: THREE.PerspectiveCamera;
  readonly topCam: THREE.OrthographicCamera;
  private directorControls: OrbitControls;
  private topControls: OrbitControls;
  private tcontrols: TransformControls;
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private container: HTMLElement;
  private overlay: HTMLDivElement;
  private hud: HTMLElement;
  private thirds: HTMLDivElement;
  private camGizmo: THREE.Group;
  private camHelper: THREE.CameraHelper;
  overlayVisible = true;
  private camDragRef: { forward: THREE.Vector3; dist: number } | null = null;

  constructor(
    private scene: THREE.Scene,
    private store: Store,
    private sm: SceneManager,
    private onChange: () => void,
  ) {
    this.container = document.getElementById("viewport")!;
    const canvas = document.getElementById("view3d") as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setScissorTest(true);

    // 机位相机：filmGauge 36 + setFocalLength（SPEC §7.1）
    this.shotCam = new THREE.PerspectiveCamera(40, 1.5, 0.02, 800);
    this.shotCam.filmGauge = FILM_GAUGE;

    this.directorCam = new THREE.PerspectiveCamera(50, 1, 0.05, 800);
    this.directorCam.position.set(4.2, 3.2, 5.2);

    this.topCam = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
    this.topCam.position.set(0, 30, 0);
    this.topCam.up.set(0, 0, -1); // 舞台背面朝屏幕上方
    this.topCam.lookAt(0, 0, 0);
    this.topCam.zoom = 0.5;
    this.topCam.updateProjectionMatrix();

    this.directorControls = new OrbitControls(this.directorCam, canvas);
    this.directorControls.target.set(0, 0.9, 0);
    this.directorControls.addEventListener("change", () => this.requestRender());
    this.topControls = new OrbitControls(this.topCam, canvas);
    this.topControls.enableRotate = false;
    this.topControls.addEventListener("change", () => this.requestRender());

    this.tcontrols = new TransformControls(this.directorCam, canvas);
    this.tcontrols.addEventListener("dragging-changed", (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      this.directorControls.enabled = !dragging;
      if (!dragging) {
        this.store.endDrag();
        this.camDragRef = null;
        this.onChange();
      } else if (this.tcontrols.object === this.camGizmo) {
        const cs = this.sm.cameraState;
        if (cs) {
          const forward = cs.target.clone().sub(cs.position).normalize();
          this.camDragRef = { forward, dist: cs.target.distanceTo(cs.position) };
        }
      }
    });
    this.tcontrols.addEventListener("objectChange", () => {
      if (this.tcontrols.object === this.camGizmo) this.writeBackCameraDrag();
      else this.writeBackTransform();
    });
    const helper = this.tcontrols.getHelper();
    helper.traverse((o) => {
      o.userData.__gizmo = true;
    });
    scene.add(helper);

    // 相机 gizmo（导演/俯视视图显示）
    this.camGizmo = new THREE.Group();
    this.camGizmo.name = "camera:gizmo";
    this.camGizmo.userData.entity = { type: "camera", id: "camera" };
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x66d9a0, roughness: 0.6 }),
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f8f65 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.16;
    this.camGizmo.add(body, lens);
    scene.add(this.camGizmo);
    this.camHelper = new THREE.CameraHelper(this.shotCam);
    scene.add(this.camHelper);

    // 覆盖层：三分线 + 中心十字 + HUD
    this.overlay = document.createElement("div");
    this.overlay.style.cssText = "position:absolute;pointer-events:none;inset:0;";
    this.thirds = document.createElement("div");
    this.thirds.style.cssText = "position:absolute;";
    this.thirds.innerHTML =
      '<div class="thirds-line" style="left:33.33%"></div><div class="thirds-line" style="left:66.66%"></div>' +
      '<div class="thirds-line" style="top:33.33%"></div><div class="thirds-line" style="top:66.66%"></div>' +
      '<div class="cross-h"></div><div class="cross-v"></div>';
    this.hud = document.createElement("div");
    this.hud.id = "view-hud";
    this.overlay.appendChild(this.thirds);
    this.overlay.appendChild(this.hud);
    this.container.appendChild(this.overlay);

    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.resize();
  }
  readonly renderer: THREE.WebGLRenderer;

  get activeCamera(): THREE.Camera {
    return this.mode === "shot" ? this.shotCam : this.mode === "top" ? this.topCam : this.directorCam;
  }

  /** 按需渲染：置脏 + 合帧（一帧内多次请求只画一次） */
  requestRender(): void {
    this.dirty = true;
    if (this.rafId === 0) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.render();
      });
    }
  }
  private rafId = 0;

  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const shot = this.store.shot;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // 相机 gizmo / 视锥 / 灯位只在导演和俯视视图显示
    const showGizmos = this.mode !== "shot";
    this.camGizmo.visible = showGizmos;
    this.camHelper.visible = showGizmos;
    this.sm.setGizmosVisible(showGizmos);
    this.tcontrols.enabled = this.mode === "director";

    // 相机 gizmo 跟随机位相机
    this.updateShotCamera(shot);
    this.camGizmo.position.copy(this.shotCam.position);
    this.camGizmo.quaternion.copy(this.shotCam.quaternion);
    this.camHelper.update();

    this.directorControls.enabled = this.mode === "director" && !this.tcontrols.dragging;
    this.topControls.enabled = this.mode === "top" && !this.tcontrols.dragging;

    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(BG_BAR);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.clear();

    if (this.mode === "shot") {
      const aspect = this.sm.aspect;
      let innerW = w;
      let innerH = w / aspect;
      if (innerH > h) {
        innerH = h;
        innerW = h * aspect;
      }
      const ox = (w - innerW) / 2;
      const oy = (h - innerH) / 2;
      this.renderer.setViewport(ox, oy, innerW, innerH);
      this.renderer.setScissor(ox, oy, innerW, innerH);
      this.renderer.render(this.scene, this.shotCam);
      this.layoutOverlay(ox, h - oy - innerH, innerW, innerH);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.activeCamera);
      this.layoutOverlay(0, 0, 0, 0);
    }
  }

  /** 机位视图的覆盖层几何 + HUD */
  private layoutOverlay(x: number, y: number, w: number, h: number): void {
    const show = this.mode === "shot" && this.overlayVisible && w > 0;
    this.thirds.style.display = show ? "block" : "none";
    this.hud.style.display = this.mode === "shot" ? "block" : "none";
    if (show) {
      this.thirds.style.left = `${x}px`;
      this.thirds.style.top = `${y}px`;
      this.thirds.style.width = `${w}px`;
      this.thirds.style.height = `${h}px`;
    }
    if (this.mode === "shot") {
      const shot = this.store.shot;
      this.hud.textContent = `${shot.id} · ${this.sm.hudText()}`;
      this.hud.style.left = "10px";
      this.hud.style.top = "8px";
    }
  }

  private updateShotCamera(shot: Shot): void {
    const cs = this.sm.cameraState;
    if (!cs) return;
    this.shotCam.position.copy(cs.position);
    this.shotCam.up.copy(cs.up);
    this.shotCam.lookAt(cs.target);
    this.shotCam.setFocalLength(shot.camera.focalLength ?? 50);
    this.shotCam.updateProjectionMatrix();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.tcontrols.detach();
    this.overlay.style.display = "block";
    if (mode === "shot") {
      this.overlayVisible = true;
    }
    this.requestRender();
  }
  toggleView(): void {
    this.setMode(this.mode === "shot" ? "director" : "shot");
  }
  toggleTop(): void {
    this.setMode(this.mode === "top" ? "shot" : "top");
  }
  toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.requestRender();
  }

  setShadows(on: boolean): void {
    this.renderer.shadowMap.enabled = on;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sm.setShadows(on);
    this.requestRender();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.directorCam.aspect = w / h;
    this.directorCam.updateProjectionMatrix();
    const frustum = 6 / this.topCam.zoom;
    this.topCam.left = (-frustum * w) / h / 2;
    this.topCam.right = (frustum * w) / h / 2;
    this.topCam.top = frustum / 2;
    this.topCam.bottom = -frustum / 2;
    this.topCam.updateProjectionMatrix();
    this.requestRender();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.tcontrols.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.activeCamera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if ((hit.object as THREE.Line).isLine) continue;
      if (this.hasFlag(hit.object, "__gizmo")) continue;
      if (hit.object === this.camGizmo || this.hasFlag(hit.object, "__camgizmo")) {
        this.store.setSelected({ type: "camera", id: "camera" });
        return;
      }
      const entity = this.sm.findEntity(hit.object);
      if (entity) {
        this.store.setSelected({ type: entity.type, id: entity.id });
        return;
      }
    }
    this.store.setSelected(null);
  }
  private hasFlag(obj: THREE.Object3D | null, flag: string): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData[flag]) return true;
      cur = cur.parent;
    }
    return false;
  }

  setSelection(sel: { type: string; id: string } | null): void {
    if (this.mode !== "director" || !sel) {
      this.tcontrols.detach();
      this.requestRender();
      return;
    }
    if (sel.type === "camera") {
      this.tcontrols.attach(this.camGizmo);
    } else {
      const group = this.sm.groupOf(sel.type as "actor" | "prop", sel.id);
      if (group) this.tcontrols.attach(group);
      else this.tcontrols.detach();
    }
    this.requestRender();
  }

  setGizmoMode(mode: "translate" | "rotate"): void {
    this.tcontrols.setMode(mode);
    this.tcontrols.showX = mode === "translate";
    this.tcontrols.showY = false;
    this.tcontrols.showZ = mode === "translate";
    this.requestRender();
  }

  /** 拖相机 gizmo → 写回 manual position/target */
  private writeBackCameraDrag(): void {
    const ref = this.camDragRef;
    if (!ref) return;
    const sel = this.store.selected;
    if (sel?.type !== "camera") return;
    const pos = this.camGizmo.position;
    const target = pos.clone().addScaledVector(ref.forward, ref.dist);
    this.store.beginDragOnce();
    this.store.preview((p) => {
      const cam = p.shots[this.store.shotIndex].camera;
      cam.mode = "manual";
      cam.position = [round2(pos.x), round2(pos.y), round2(pos.z)];
      cam.target = [round2(target.x), round2(target.y), round2(target.z)];
    });
  }

  /** 拖人物/道具 gizmo → 写回 store */
  private writeBackTransform(): void {
    const obj = this.tcontrols.object;
    const sel = this.store.selected;
    if (!obj || !sel || sel.type === "camera") return;
    const p = obj.position;
    const facingDeg = THREE.MathUtils.radToDeg(obj.rotation.y);
    this.store.beginDragOnce();
    this.store.preview((proj) => {
      const s = proj.shots[this.store.shotIndex];
      if (sel.type === "actor") {
        const actor = s.actors.find((a) => a.id === sel.id);
        if (actor) {
          actor.position = [round2(p.x), round2(p.z)];
          actor.facing = Math.round(facingDeg);
        }
      } else if (sel.type === "prop") {
        const prop = s.props.find((x) => x.id === sel.id);
        if (prop) {
          prop.position = [round2(p.x), round2(p.z)];
          prop.facing = Math.round(facingDeg);
        }
      }
    });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
